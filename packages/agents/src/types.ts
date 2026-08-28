import type { AgentTaskInput } from '@imea/contracts';
import type { ConnectorRequest, ConnectorResult } from '@imea/connectors';
import type { z } from 'zod';
import type { BuiltContext } from './context-builder.js';

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  costAmount: number;
}

export interface ModelResult<T> {
  output: T;
  usage: ModelUsage;
}

export interface ModelProvider {
  readonly name: string;
  generate<T>(input: { model: string; name: string; instructions: string; prompt: string; outputSchema: z.ZodType<T>; maxTurns: number }): Promise<ModelResult<T>>;
}

export interface AgentSkill<T = unknown> {
  key: string;
  name: string;
  objective: string;
  instructions: string;
  outputSchema: z.ZodType<T>;
  maxResearchLoops: number;
  permittedConnectors: string[];
  planQueries(input: AgentTaskInput): ConnectorRequest[];
}

export interface AgentRunRecord {
  id: string;
  input: AgentTaskInput;
  skillKey: string;
  modelName: string;
  promptVersion: number;
  contextVersion?: number;
  inputContextHash?: string;
  evidenceIds?: string[];
}

export interface RunStore {
  start(input: AgentTaskInput, skillKey: string, modelName: string, promptVersion: number): Promise<AgentRunRecord>;
  toolStarted(runId: string, connectorType: string, request: ConnectorRequest): Promise<string>;
  toolCompleted(toolRunId: string, result: ConnectorResult): Promise<void>;
  toolFailed(toolRunId: string, error: unknown): Promise<void>;
  contextReady(runId: string, context: BuiltContext): Promise<void>;
  complete(runId: string, output: unknown, usage: ModelUsage): Promise<void>;
  fail(runId: string, error: unknown): Promise<void>;
}

export interface PromptVersion {
  id: string;
  skillKey: string;
  version: number;
  systemTemplate: string;
  inputSchemaVersion: number;
  outputSchemaVersion: number;
  modelConfig: Record<string, unknown>;
}
