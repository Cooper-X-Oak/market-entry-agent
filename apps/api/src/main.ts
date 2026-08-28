import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { startTelemetry } from '@imea/observability';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const telemetry = await startTelemetry('imea-api', process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: true, bodyLimit: 50 * 1024 * 1024 }));
  await app.register(cookie as unknown as Parameters<typeof app.register>[0], { secret: process.env.COOKIE_SECRET });
  await app.register(multipart as unknown as Parameters<typeof app.register>[0], { limits: { fileSize: 50 * 1024 * 1024, files: 1 } });
  app.enableCors({ origin: process.env.APP_BASE_URL ?? 'http://localhost:3000', credentials: true });
  app.enableShutdownHooks();
  process.once('SIGTERM', () => void telemetry.shutdown());
  process.once('SIGINT', () => void telemetry.shutdown());
  await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
}

await bootstrap();
