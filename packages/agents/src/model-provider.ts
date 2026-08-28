import { Agent, run } from '@openai/agents';
import type { ModelProvider, ModelResult } from './types.js';

export class OpenAIAgentsModelProvider implements ModelProvider {
  readonly name = 'openai-agents';

  async generate<T>(input: Parameters<ModelProvider['generate']>[0]): Promise<ModelResult<T>> {
    const agent = new Agent({
      name: input.name,
      instructions: input.instructions,
      model: input.model,
      outputType: input.outputSchema,
    });
    const result = await run(agent, input.prompt, { maxTurns: input.maxTurns });
    if (!result.finalOutput) throw new Error(`Agent ${input.name} returned no final output`);
    const parsed = input.outputSchema.parse(result.finalOutput) as T;
    const usage = result.state.usage;
    return {
      output: parsed,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costAmount: 0,
      },
    };
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
