import { AsyncLocalStorage } from 'node:async_hooks';

export interface ExecutionControl {
  signal?: AbortSignal;
  workflowId?: string;
  workflowRunId?: string;
  activityId?: string;
  activityAttempt?: number;
  logicalOperationId?: string;
}
export const executionControl = new AsyncLocalStorage<ExecutionControl>();
