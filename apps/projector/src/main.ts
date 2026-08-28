import { databaseUrlFor, getEnvironment } from '@imea/config';
import { createDatabaseClient } from '@imea/database';
import { Projector } from './projector.js';
import { startTelemetry } from '@imea/observability';

const env = getEnvironment();
const telemetry = await startTelemetry('imea-projector', env.OTEL_EXPORTER_OTLP_ENDPOINT);
const client = createDatabaseClient(databaseUrlFor(env, 'projector'), 5);
const projector = new Projector(client, client.db);

const shutdown = async (): Promise<void> => { projector.stop(); await client.close(); await telemetry.shutdown(); };
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await projector.run();
