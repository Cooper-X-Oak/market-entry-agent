import { Client, Connection, ScheduleNotFoundError, ScheduleOverlapPolicy } from '@temporalio/client';

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
    const workflowId = missionWorkflowId(tenantId, missionId);
    await this.client.workflow.start('missionWorkflow', { taskQueue: this.taskQueue, workflowId, args: [{ tenantId, missionId }] });
    return workflowId;
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
