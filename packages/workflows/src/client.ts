import { Client, Connection, ScheduleNotFoundError, ScheduleOverlapPolicy } from '@temporalio/client';
import { randomUUID } from 'node:crypto';

export const missionWorkflowId = (tenantId: string, missionId: string): string => `mission:${tenantId}:${missionId}`;
export const opportunityWorkflowId = (tenantId: string, opportunityId: string): string => `opportunity:${tenantId}:${opportunityId}`;
export const manualRefreshWorkflowId = (tenantId: string, missionId: string, requestId: string): string => `refresh:${tenantId}:${missionId}:manual:${requestId}`;
export const scheduledRefreshWorkflowId = (tenantId: string, missionId: string, scheduledAt: string): string => `refresh:${tenantId}:${missionId}:scheduled:${scheduledAt}`;
export const refreshScheduleId = (tenantId: string, missionId: string): string => `refresh-schedule:${tenantId}:${missionId}`;

export class TemporalGateway {
  private constructor(private readonly connection: Connection, private readonly client: Client, private readonly taskQueue: string) {}

  static async connect(address: string, namespace: string, taskQueue: string): Promise<TemporalGateway> {
    const connection = await Connection.connect({ address });
    return new TemporalGateway(connection, new Client({ connection, namespace }), taskQueue);
  }

  async close(): Promise<void> { await this.connection.close(); }
  async health(): Promise<void> { await this.connection.workflowService.getSystemInfo({}); }

  async startMission(tenantId: string, missionId: string): Promise<string> {
    return this.restartMission(tenantId, missionId);
  }

  async restartMission(tenantId: string, missionId: string): Promise<string> {
    const workflowId = missionWorkflowId(tenantId, missionId);
    await this.client.workflow.start('missionWorkflow', { taskQueue: this.taskQueue, workflowId, args: [{ tenantId, missionId, scopeVersion: 2, missionExecutionId: randomUUID() }] });
    return workflowId;
  }

  async recoverMission(tenantId: string, missionId: string, options: {
    sourceRunId: string; workflowTaskFinishEventId: number; requestId: string; pauseAfterReset?: boolean;
  }): Promise<{ workflowId: string; runId: string; missionExecutionId: string; scopeVersion: 1 | 2 }> {
    const workflowId = missionWorkflowId(tenantId, missionId);
    const source = this.client.workflow.getHandle(workflowId, options.sourceRunId);
    const history = await source.fetchHistory();
    const started = history.events?.find(event => event.workflowExecutionStartedEventAttributes)?.workflowExecutionStartedEventAttributes;
    const payload = started?.input?.payloads?.[0];
    if (!payload?.data) throw new Error('Recovery requires the original workflow input');
    const input = JSON.parse(Buffer.from(payload.data).toString('utf8'));
    if (input.tenantId !== tenantId || input.missionId !== missionId) throw new Error('Recovery input scope mismatch');
    const boundary = history.events?.find(event => Number(event.eventId) === options.workflowTaskFinishEventId && event.workflowTaskCompletedEventAttributes);
    if (!boundary?.eventId) throw new Error('Recovery requires a completed Workflow Task boundary');
    const missionExecutionId = input.missionExecutionId ?? started?.firstExecutionRunId ?? options.sourceRunId;
    const result = await this.connection.workflowService.resetWorkflowExecution({
      namespace: this.client.options.namespace, workflowExecution: { workflowId, runId: options.sourceRunId },
      workflowTaskFinishEventId: boundary.eventId, requestId: options.requestId,
      reason: 'Recover the same mission execution; retain completed business steps', resetReapplyType: 2,
    });
    if (!result.runId) throw new Error('Reset did not return a run identity');
    if (options.pauseAfterReset) await this.client.workflow.getHandle(workflowId, result.runId).signal('missionPauseRequested', { requestedByUserId: tenantId, reason: 'Stop at the first unfinished business node' });
    return { workflowId, runId: result.runId, missionExecutionId, scopeVersion: input.scopeVersion === 2 ? 2 : 1 };
  }

  async startOpportunity(tenantId: string, missionId: string, opportunityId: string): Promise<string> {
    const workflowId = opportunityWorkflowId(tenantId, opportunityId);
    await this.client.workflow.start('opportunityWorkflow', { taskQueue: this.taskQueue, workflowId, args: [{ tenantId, missionId, opportunityId }] });
    return workflowId;
  }

  async signalMission(tenantId: string, missionId: string, signal: string, payload: unknown): Promise<void> {
    await this.client.workflow.getHandle(missionWorkflowId(tenantId, missionId)).signal(signal, payload);
  }

  async signalOpportunity(tenantId: string, opportunityId: string, signal: string, payload: unknown): Promise<void> {
    await this.client.workflow.getHandle(opportunityWorkflowId(tenantId, opportunityId)).signal(signal, payload);
  }

  async queryMission<T>(tenantId: string, missionId: string, query: string): Promise<T> {
    return this.client.workflow.getHandle(missionWorkflowId(tenantId, missionId)).query<T>(query);
  }

  async queryOpportunity<T>(tenantId: string, opportunityId: string, query: string): Promise<T> {
    return this.client.workflow.getHandle(opportunityWorkflowId(tenantId, opportunityId)).query<T>(query);
  }

  async describeMission(tenantId: string, missionId: string) {
    const result = await this.client.workflow.getHandle(missionWorkflowId(tenantId, missionId)).describe();
    return { status: result.status.name, runId: result.runId };
  }

  async *closedMissions(): AsyncGenerator<{ tenantId: string; missionId: string; runId: string; status: string }> {
    for await (const workflow of this.client.workflow.list({ query: "WorkflowType = 'missionWorkflow' AND ExecutionStatus != 'Running'", pageSize: 100 })) {
      const parts = workflow.workflowId.split(':');
      if (parts.length === 3 && parts[0] === 'mission' && /^[0-9a-f-]{36}$/i.test(parts[1]!) && /^[0-9a-f-]{36}$/i.test(parts[2]!)) yield { tenantId: parts[1]!, missionId: parts[2]!, runId: workflow.runId, status: workflow.status.name };
    }
  }

  async createWeeklyRefreshSchedule(tenantId: string, missionId: string): Promise<void> {
    const scheduleId = refreshScheduleId(tenantId, missionId);
    try { await this.client.schedule.getHandle(scheduleId).describe(); return; } catch (error) { if (!(error instanceof ScheduleNotFoundError)) throw error; }
    await this.client.schedule.create({
      scheduleId,
      spec: { intervals: [{ every: '7 days' }] },
      policies: { overlap: ScheduleOverlapPolicy.SKIP },
      action: { type: 'startWorkflow', workflowType: 'refreshWorkflow', taskQueue: this.taskQueue, args: [{ tenantId, missionId, scheduledAt: 'scheduled', requestId: 'scheduled', triggerType: 'scheduled' }] },
    });
  }
}


