import { executionControl, ExecutionError } from '@imea/agents';
import { ApplicationFailure } from '@temporalio/common';
import type { ActivityInterceptorsFactory } from '@temporalio/worker';

export const executionInterceptor: ActivityInterceptorsFactory = context => ({
  inbound: {
    async execute(input, next) {
      const heartbeat = setInterval(() => context.heartbeat({ activityId: context.info.activityId }), 1000);
      try {
        return await executionControl.run({ signal: context.cancellationSignal,
          workflowId: context.info.workflowExecution?.workflowId, workflowRunId: context.info.workflowExecution?.runId,
          activityId: context.info.activityId, activityAttempt: context.info.attempt,
          logicalOperationId: `${context.info.workflowExecution?.workflowId}:${context.info.activityId}`,
        }, () => next(input));
      } catch (error) {
        if (error instanceof ExecutionError) throw ApplicationFailure.nonRetryable(error.message, error.code);
        if (error instanceof Error && error.name === 'ZodError') throw ApplicationFailure.nonRetryable('Business schema rejected output', 'OUTPUT_INVALID');
        throw error;
      } finally { clearInterval(heartbeat); }
    },
  },
});
