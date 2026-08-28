import pino, { type Logger } from 'pino';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export interface LogContext {
  service: string;
  request_id?: string;
  tenant_id?: string;
  mission_id?: string;
  opportunity_id?: string;
  workflow_id?: string;
  agent_run_id?: string;
  tool_run_id?: string;
  duration_ms?: number;
  error_code?: string;
}

export function createLogger(context: LogContext): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: context,
    redact: {
      paths: ['password', 'passwordHash', 'authorization', 'cookie', '*.apiKey', '*.token', '*.secret'],
      censor: '[REDACTED]',
    },
  });
}

export interface TelemetryHandle { shutdown(): Promise<void> }

export function startTelemetry(serviceName: string, endpoint?: string): Promise<TelemetryHandle> {
  if (!endpoint) return Promise.resolve({ shutdown: () => Promise.resolve() });
  const exporter = new OTLPTraceExporter({ url: endpoint.endsWith('/v1/traces') ? endpoint : `${endpoint.replace(/\/$/, '')}/v1/traces` });
  const sdk = new NodeSDK({ resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName, [ATTR_SERVICE_VERSION]: '1.0.0' }), traceExporter: exporter, instrumentations: [getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } })] });
  sdk.start();
  return Promise.resolve({ shutdown: () => sdk.shutdown() });
}
