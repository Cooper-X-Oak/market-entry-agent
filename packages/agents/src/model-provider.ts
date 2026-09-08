import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { classifyExecutionError, ExecutionError } from './execution-error.js';
import { Agent, OpenAIProvider, Runner, type JsonSchemaDefinition } from '@openai/agents';
import { z } from 'zod';
import type { ModelProvider, ModelResult } from './types.js';

export class OpenAIAgentsModelProvider implements ModelProvider {
  readonly name = 'openai-agents';
  private readonly runner: Runner;

  constructor(apiKey?: string, baseURL?: string) {
    const provider = new OpenAIProvider({
      ...(apiKey ? { apiKey } : {}),
      ...(baseURL ? { baseURL } : {}),
    });
    // SDK 0.17.0 disables client retries only after its first model attempt.
    // Set the transport flag on every request; our wrapper owns the total budget.
    this.runner = new Runner({ modelProvider: { async getModel(name) {
      const model = await provider.getModel(name);
      return {
        getResponse: request => model.getResponse(Object.assign({}, request, { _internal: { runnerManagedRetry: true } })),
        getStreamedResponse: request => model.getStreamedResponse(Object.assign({}, request, { _internal: { runnerManagedRetry: true } })),
      };
    } }, tracingDisabled: true });
  }

  async generate<T>(input: Parameters<ModelProvider['generate']>[0]): Promise<ModelResult<T>> {
    // Business schemas contain optional fields and open dictionaries. Sending the
    // Zod object asks the SDK to enforce OpenAI's narrower strict subset, which
    // rejects these schemas before any request. Preserve the complete schema on
    // the wire and keep the original business parser as the acceptance gate.
    const schema = z.toJSONSchema(input.outputSchema, { target: 'draft-7', io: 'input' });
    if (schema.type !== 'object' || !schema.properties) throw new ExecutionError('PROVIDER_CONFIG', 'Agent output must have an object schema');
    const outputType: JsonSchemaDefinition = {
      type: 'json_schema', name: input.name, strict: false,
      schema: schema as JsonSchemaDefinition['schema'],
    };
    const agent = new Agent({
      name: input.name,
      instructions: input.instructions,
      model: input.model,
      outputType,
      modelSettings: { maxTokens: 6000, preserveRawUsage: true, retry: { maxRetries: 0 } },
    });
    const deadline = AbortSignal.timeout(420_000);
    const totalSignal = input.signal ? AbortSignal.any([input.signal, deadline]) : deadline;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      totalSignal.throwIfAborted();
      await input.onAttempt?.({ attempt, state: 'started', at: new Date().toISOString() });
      const signal = AbortSignal.any([totalSignal, AbortSignal.timeout(180_000)]);
      let result;
      try {
        result = await this.runner.run(agent, input.prompt, { maxTurns: input.maxTurns, signal });
      } catch (error) {
        const classified = signal.aborted
          ? new ExecutionError(input.signal?.aborted ? 'EXECUTION_CANCELLED' : 'PROVIDER_TIMEOUT', 'Client request ended; Provider server completion unknown')
          : classifyExecutionError(error);
        await input.onAttempt?.({ attempt, state: 'failed', at: new Date().toISOString(), errorCode: classified.code });
        if (classified.code !== 'PROVIDER_TRANSIENT' || attempt === 3 || totalSignal.aborted) throw classified;
        await delay(Math.max(classified.retryAfterMs, attempt * 500), undefined, { signal: totalSignal });
        continue;
      }
      const response = result.rawResponses.at(-1);
      const rawUsage = response?.rawUsage;
      const usage = { inputTokens: typeof rawUsage?.input_tokens === 'number' ? rawUsage.input_tokens : null,
        outputTokens: typeof rawUsage?.output_tokens === 'number' ? rawUsage.output_tokens : null, costAmount: null };
      // Persist the call result before schema and evidence validation can fail.
      await input.onAttempt?.({ attempt, state: 'succeeded', at: new Date().toISOString(), usage, requestId: response?.requestId, responseId: response?.responseId,
        outputHash: createHash('sha256').update(JSON.stringify(result.finalOutput) ?? 'undefined').digest('hex') });
      if (totalSignal.aborted) throw new ExecutionError('EXECUTION_CANCELLED', 'Late output cannot advance business state');
      if (!result.finalOutput) throw new ExecutionError('OUTPUT_INVALID', 'Provider returned no final output');
      try { return { output: input.outputSchema.parse(result.finalOutput) as T, usage }; }
      catch (error) { throw classifyExecutionError(error); }
    }
    throw new ExecutionError('PROVIDER_TRANSIENT', 'Provider attempts exhausted');
  }
}

export class MockModelProvider implements ModelProvider {
  readonly name = 'mock';
  constructor(private readonly fixtures: ReadonlyMap<string, unknown>) {}

  generate<T>(input: Parameters<ModelProvider['generate']>[0]): Promise<ModelResult<T>> {
    return Promise.resolve().then(() => {
      const fixture = this.fixtures.get(input.name);
      if (fixture === undefined) throw new Error(`No deterministic fixture for ${input.name}`);
      return { output: input.outputSchema.parse(structuredClone(fixture)) as T, usage: { inputTokens: 0, outputTokens: 0, costAmount: 0 } };
    });
  }
}
