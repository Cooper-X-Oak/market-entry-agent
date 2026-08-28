import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { databaseUrlFor, getEnvironment, type Environment } from '@imea/config';
import { ObjectStorageConnector } from '@imea/connectors';
import { createDatabaseClient, TransactionManager } from '@imea/database';
import { TemporalGateway } from '@imea/workflows';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { AuthGuard } from './common/auth.guard.js';
import { DomainExceptionFilter } from './common/domain-exception.filter.js';
import { EventStreamService } from './common/event-stream.service.js';
import { IdempotencyInterceptor } from './common/idempotency.interceptor.js';
import { ResponseInterceptor } from './common/response.interceptor.js';
import { HealthController } from './health.controller.js';
import { EcosystemController } from './market/ecosystem.controller.js';
import { ExecutionController } from './market/execution.controller.js';
import { MarketService } from './market/market.service.js';
import { MissionExportService } from './market/export.service.js';
import { MissionsController } from './market/missions.controller.js';
import { OperationsController } from './market/operations.controller.js';
import { DATABASE, DATABASE_CLIENT, ENVIRONMENT, OBJECT_STORAGE, TEMPORAL_GATEWAY, TRANSACTION_MANAGER } from './tokens.js';
import { WorkspaceController } from './workspace/workspace.controller.js';
import { WorkspaceService } from './workspace/workspace.service.js';

@Module({
  imports: [JwtModule.register({ global: true })],
  controllers: [HealthController, AuthController, WorkspaceController, MissionsController, EcosystemController, ExecutionController, OperationsController],
  providers: [
    { provide: ENVIRONMENT, useFactory: (): Environment => getEnvironment() },
    { provide: DATABASE_CLIENT, inject: [ENVIRONMENT], useFactory: (env: Environment) => createDatabaseClient(databaseUrlFor(env, 'api')) },
    { provide: DATABASE, inject: [DATABASE_CLIENT], useFactory: (client: ReturnType<typeof createDatabaseClient>) => client.db },
    { provide: TRANSACTION_MANAGER, inject: [DATABASE], useFactory: (database: ReturnType<typeof createDatabaseClient>['db']) => new TransactionManager(database) },
    { provide: OBJECT_STORAGE, inject: [ENVIRONMENT], useFactory: (env: Environment) => new ObjectStorageConnector({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION, bucket: env.S3_BUCKET, accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY, forcePathStyle: env.S3_FORCE_PATH_STYLE }) },
    { provide: TEMPORAL_GATEWAY, inject: [ENVIRONMENT], useFactory: (env: Environment) => TemporalGateway.connect(env.TEMPORAL_ADDRESS, env.TEMPORAL_NAMESPACE, `${env.TEMPORAL_TASK_QUEUE_PREFIX}-mission-orchestration`) },
    AuthService,
    WorkspaceService,
    MarketService,
    MissionExportService,
    EventStreamService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
