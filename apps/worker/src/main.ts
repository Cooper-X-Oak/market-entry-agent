import { createRequire } from 'node:module';
import { databaseUrlFor, getEnvironment } from '@imea/config';
import { createDatabaseClient } from '@imea/database';
import { TemporalGateway } from '@imea/workflows';
import { startTelemetry } from '@imea/observability';
import { NativeConnection, Worker } from '@temporalio/worker';
import { createAgentRuntime } from './agent-factory.js';
import { ActivityService } from './activities.js';

const env = getEnvironment();
const telemetry = await startTelemetry('imea-worker', env.OTEL_EXPORTER_OTLP_ENDPOINT);
const database = createDatabaseClient(databaseUrlFor(env, 'worker'), 12);
const runtime = createAgentRuntime(env, database.db);
const taskQueue = `${env.TEMPORAL_TASK_QUEUE_PREFIX}-mission-orchestration`;
const temporal = await TemporalGateway.connect(env.TEMPORAL_ADDRESS, env.TEMPORAL_NAMESPACE, taskQueue);
const service = new ActivityService(database.db, runtime.runner, runtime.storage, runtime.connectors, temporal);
const require = createRequire(import.meta.url);
const workflowsPath = require.resolve('@imea/workflows/workflow-entry');
const connection = await NativeConnection.connect({ address: env.TEMPORAL_ADDRESS });

const activities = {
  loadMission: service.loadMission.bind(service),
  compileMission: service.compileMission.bind(service),
  ingestCompanySources: service.ingestCompanySources.bind(service),
  extractCapabilityClaims: service.extractCapabilityClaims.bind(service),
  researchMarketRoutes: service.researchMarketRoutes.bind(service),
  researchCompetitors: service.researchCompetitors.bind(service),
  researchExpertSignals: service.researchExpertSignals.bind(service),
  markMissionAwaitingRouteReview: service.markMissionAwaitingRouteReview.bind(service),
  loadApprovedRoutes: service.loadApprovedRoutes.bind(service),
  discoverEcosystem: service.discoverEcosystem.bind(service),
  resolveEntities: service.resolveEntities.bind(service),
  rankTargets: service.rankTargets.bind(service),
  createOpportunity: service.createOpportunity.bind(service),
  recordChildWorkflow: service.recordChildWorkflow.bind(service),
  markMissionActive: service.markMissionActive.bind(service),
  markMissionCompleted: service.markMissionCompleted.bind(service),
  setMissionPaused: service.setMissionPaused.bind(service),
  updateMissionBudget: service.updateMissionBudget.bind(service),
  createRefreshSchedule: service.createRefreshSchedule.bind(service),
  loadOpportunity: service.loadOpportunity.bind(service),
  resolveEntity: service.resolveEntity.bind(service),
  mapStakeholders: service.mapStakeholders.bind(service),
  findContactPaths: service.findContactPaths.bind(service),
  verifyContactPoint: service.verifyContactPoint.bind(service),
  qualifyOpportunity: service.qualifyOpportunity.bind(service),
  buildActionCard: service.buildActionCard.bind(service),
  recordActionCardDecision: service.recordActionCardDecision.bind(service),
  interpretInteraction: service.interpretInteraction.bind(service),
  applyInteractionInterpretation: service.applyInteractionInterpretation.bind(service),
  runFocusedOpportunityResearch: service.runFocusedOpportunityResearch.bind(service),
  reportOpportunityMilestone: service.reportOpportunityMilestone.bind(service),
  closeOpportunity: service.closeOpportunity.bind(service),
  loadRefreshScope: service.loadRefreshScope.bind(service),
  refreshSource: service.refreshSource.bind(service),
  refreshContact: service.refreshContact.bind(service),
  refreshCompetitor: service.refreshCompetitor.bind(service),
  createRefreshProposal: service.createRefreshProposal.bind(service),
  applyRefreshProposal: service.applyRefreshProposal.bind(service),
};

const worker = await Worker.create({
  connection,
  namespace: env.TEMPORAL_NAMESPACE,
  taskQueue,
  workflowsPath,
  activities,
  maxConcurrentActivityTaskExecutions: 10,
  maxConcurrentWorkflowTaskExecutions: 10,
});

const shutdown = async (): Promise<void> => {
  worker.shutdown();
  await database.close();
  await temporal.close();
  await connection.close();
  await telemetry.shutdown();
};
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await worker.run();
