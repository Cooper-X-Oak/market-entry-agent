import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { OpenAIAgentsModelProvider } from '../model-provider.js';
import { deterministicAgentFixtures } from '../mock-fixtures.js';
import { skillCatalog, targetRankerSkill } from '../skills.js';

afterEach(() => vi.unstubAllGlobals());

function offlineResponse(output: unknown) {
  const requests: Record<string, unknown>[] = [];
  // Every SDK HTTP request terminates here; no credential or network is used.
  vi.stubGlobal('fetch', vi.fn((_url: unknown, init?: RequestInit) => {
    if (typeof init?.body !== 'string') throw new Error('Expected a JSON request body');
    requests.push(JSON.parse(init.body) as Record<string, unknown>);
    return Promise.resolve(new Response(JSON.stringify({
      id: 'resp_offline', object: 'response', created_at: 0, status: 'completed',
      model: 'offline-test', output: [{ id: 'msg_offline', type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [] }] }],
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
  }));
  return requests;
}

function generate(schema: z.ZodType, name = 'offline_test') {
  return new OpenAIAgentsModelProvider('offline-not-a-key', 'https://offline.invalid/v1').generate({
    model: 'offline-test', name, instructions: 'Offline regression', prompt: 'Offline regression',
    outputSchema: schema, maxTurns: 1,
  });
}

describe('application Provider schema transport (offline)', () => {
  it('sends the actual Target Ranker schema and validates its response', async () => {
    const fixture = deterministicAgentFixtures.get('target_ranker');
    const requests = offlineResponse(fixture);
    const result = await generate(targetRankerSkill.outputSchema, 'target_ranker');
    expect(requests).toHaveLength(1);
    expect(result.output).toEqual(targetRankerSkill.outputSchema.parse(fixture));
    const text = requests[0]?.text as { format: { type: string; strict: boolean; schema: unknown } };
    expect(text.format.type).toBe('json_schema');
    expect(text.format.strict).toBe(false);
    expect(text.format.schema).toEqual(z.toJSONSchema(targetRankerSkill.outputSchema, { target: 'draft-7', io: 'input' }));
    expect(JSON.stringify(text.format.schema)).toContain('evidenceRefs');
  });

  it('preserves optional, nullable, defaults and nested array/object semantics', async () => {
    const schema = z.object({ rows: z.array(z.object({ required: z.string().min(1), optional: z.string().optional(),
      nullable: z.string().nullable(), both: z.string().nullish(), count: z.number().default(3) })) });
    const output = { rows: [{ required: 'present', nullable: null, both: null }] };
    offlineResponse(output);
    expect((await generate(schema)).output).toEqual({ rows: [{ required: 'present', nullable: null, both: null, count: 3 }] });
  });

  it.each([
    { rows: [{ nullable: null }] },
    { rows: [{ required: 'ok', optional: null, nullable: null }] },
    { rows: [{ required: 'ok', nullable: 42 }] },
  ])('rejects invalid required and nested values using the original validator: %j', async (output) => {
    offlineResponse(output);
    await expect(generate(z.object({ rows: z.array(z.object({ required: z.string(), optional: z.string().optional(), nullable: z.string().nullable() })) }))).rejects.toThrow();
  });

  it('rejects an invalid business response instead of returning a fixture', async () => {
    offlineResponse({ result: { targets: [{ organizationName: 'missing required evidence' }] } });
    await expect(generate(targetRankerSkill.outputSchema, 'target_ranker')).rejects.toThrow();
  });

  it.each(skillCatalog.map((skill) => [skill.key, skill.outputSchema] as const))('converts the actual %s output through the SDK request path', async (key, schema) => {
    const requests = offlineResponse({});
    await expect(generate(schema, key)).rejects.toThrow();
    expect(requests).toHaveLength(1);
  });
});
