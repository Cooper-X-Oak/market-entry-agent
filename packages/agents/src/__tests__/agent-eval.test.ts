import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateAgentCase, type AgentEvalCase } from '../evals.js';

describe('agent evaluation harness', () => {
  it('loads all three fixed market-entry cases and meets the deterministic acceptance metrics', async () => {
    const cases = JSON.parse(await readFile(fileURLToPath(new URL('../../evals/cases.json', import.meta.url)), 'utf8')) as AgentEvalCase[];
    expect(cases.map((entry) => entry.key)).toEqual(['industrial-valves-germany', 'industrial-sensors-indonesia', 'appliance-components-mexico']);
    for (const testCase of cases) {
      const metrics = evaluateAgentCase(testCase, {
        schemaValid: true,
        conclusions: [{ evidenceRefs: ['e1'], locator: { selector: '#official-fact' } }, { evidenceRefs: ['e2'], locator: { startOffset: 10, endOffset: 50 } }],
        routeTypes: testCase.expected.routeTypes,
        entities: testCase.expected.entityTypes.map((entityType, index) => ({ canonicalName: `${testCase.key}-${index}`, entityType, sourceRef: `e${index}` })),
        contacts: testCase.expected.contactTypes.map((contactType, index) => ({ contactType, sourceRef: `e${index}` })),
        actionCard: Object.fromEntries(testCase.expected.actionCardFields.map((field) => [field, 'fixture'])),
        transitions: [{ legal: true, evidenceRefs: ['e1'] }, { legal: true, evidenceRefs: ['e2'] }],
        interactionFacts: [{ evidenceRef: 'interaction-evidence', feedbackRef: 'feedback-1' }],
      });
      expect(metrics).toEqual({ schemaPassRate: 1, evidenceCoverage: 1, routeTypeHitRate: 1, entityDuplicateRate: 0, contactSourceCompleteness: 1, exactLocatorHitRate: 1, actionCardCompleteness: 1, legalTransitionRate: 1, interactionFeedbackLinkRate: 1 });
    }
  });
});
