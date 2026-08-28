import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, Res, Sse } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createMissionRequestSchema, paginationQuerySchema, updateMissionRequestSchema, type CreateMissionRequest, type UpdateMissionRequest } from '@imea/contracts';
import { z } from 'zod';
import type { AuthContext } from '../common/auth-context.js';
import { CurrentAuth } from '../common/auth-context.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { MarketService } from './market.service.js';
import { MissionExportService } from './export.service.js';

const sourceUrlSchema = z.object({ url: z.url(), sourceKind: z.enum(['website', 'manual_url']).optional() });
const claimUpdateSchema = z.object({ statement: z.string().min(1).optional(), valueJson: z.unknown().optional(), status: z.enum(['observed', 'inferred', 'user_confirmed', 'contradicted', 'unknown', 'superseded']).optional(), confidence: z.number().int().min(0).max(100).optional(), impactLevel: z.enum(['low', 'medium', 'high']).optional() });
const routeUpdateSchema = z.object({ title: z.string().optional(), hypothesis: z.string().optional(), rank: z.number().int().positive().optional(), confidence: z.number().int().min(0).max(100).optional(), entryDifficulty: z.number().int().min(0).max(100).optional(), resourceIntensity: z.number().int().min(0).max(100).optional() });
const routeReviewSchema = z.object({ approvedRouteIds: z.array(z.uuid()).min(1), acceptedArtifactVersionIds: z.array(z.uuid()).min(1), comment: z.string().optional() });

@Controller('api/v1/missions')
export class MissionsController {
  constructor(private readonly service: MarketService, private readonly exporter: MissionExportService) {}

  @Post() create(@CurrentAuth() auth: AuthContext, @Body(new ZodPipe(createMissionRequestSchema)) body: CreateMissionRequest) { return this.service.createMission(auth, body); }
  @Get() async list(@CurrentAuth() auth: AuthContext, @Query(new ZodPipe(paginationQuerySchema)) query: z.infer<typeof paginationQuerySchema>, @Req() request: FastifyRequest) { const result = await this.service.listMissions(auth, query.page, query.pageSize); return { data: result.rows, meta: { requestId: request.id, timestamp: new Date().toISOString(), page: query.page, pageSize: query.pageSize, total: result.total } }; }
  @Get(':missionId') get(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.mission(auth, missionId); }
  @Patch(':missionId') update(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Body(new ZodPipe(updateMissionRequestSchema)) body: UpdateMissionRequest) { return this.service.updateMission(auth, missionId, body); }
  @Post(':missionId/start') start(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.startMission(auth, missionId); }
  @Post(':missionId/pause') pause(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.pauseMission(auth, missionId); }
  @Post(':missionId/resume') resume(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.resumeMission(auth, missionId); }
  @Post(':missionId/refresh') refresh(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.refreshMission(auth, missionId); }
  @Post(':missionId/complete') complete(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.completeMission(auth, missionId); }
  @Get(':missionId/progress') progress(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.progress(auth, missionId); }
  @Get(':missionId/workflow-progress') workflowProgress(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.missionWorkflowProgress(auth, missionId); }
  @Get(':missionId/metrics') metrics(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.metrics(auth, missionId); }
  @Get(':missionId/export') async exportMission(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Res() reply: FastifyReply) { const result = await this.exporter.create(auth, missionId); return reply.header('Content-Type', 'application/zip').header('Content-Disposition', `attachment; filename="${result.filename}"`).send(result.bytes); }
  @Sse(':missionId/stream') stream(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Headers('last-event-id') lastEventId?: string) { return this.service.stream(auth, missionId, lastEventId); }

  @Post(':missionId/sources/upload') async upload(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Req() request: FastifyRequest) { const file = await request.file(); if (!file) throw new Error('Multipart file is required'); const bytes = await file.toBuffer(); return this.service.uploadSource(auth, missionId, { filename: file.filename, mimetype: file.mimetype, bytes }); }
  @Post(':missionId/sources/url') addUrl(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Body(new ZodPipe(sourceUrlSchema)) body: z.infer<typeof sourceUrlSchema>) { return this.service.addSourceUrl(auth, missionId, body); }
  @Get(':missionId/sources') sources(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.listSources(auth, missionId); }
  @Get(':missionId/sources/:sourceId') source(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('sourceId') sourceId: string) { return this.service.source(auth, missionId, sourceId); }
  @Get(':missionId/sources/:sourceId/snapshots') snapshots(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('sourceId') sourceId: string) { return this.service.snapshots(auth, missionId, sourceId); }

  @Get(':missionId/capabilities') capabilities(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.capabilities(auth, missionId); }
  @Patch(':missionId/capabilities/:claimId') updateCapability(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('claimId') claimId: string, @Body(new ZodPipe(claimUpdateSchema)) body: z.infer<typeof claimUpdateSchema>) { return this.service.updateCapability(auth, missionId, claimId, body); }
  @Post(':missionId/capabilities/:claimId/confirm') confirmCapability(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('claimId') claimId: string) { return this.service.confirmCapability(auth, missionId, claimId); }
  @Post(':missionId/capabilities/:claimId/contradict') contradictCapability(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('claimId') claimId: string) { return this.service.contradictCapability(auth, missionId, claimId); }
  @Post(':missionId/capabilities/research') researchCapabilities(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.researchCapabilities(auth, missionId); }

  @Get(':missionId/routes') routes(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.routes(auth, missionId); }
  @Get(':missionId/routes/:routeId') route(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('routeId') routeId: string) { return this.service.route(auth, missionId, routeId); }
  @Patch(':missionId/routes/:routeId') updateRoute(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('routeId') routeId: string, @Body(new ZodPipe(routeUpdateSchema)) body: z.infer<typeof routeUpdateSchema>) { return this.service.updateRoute(auth, missionId, routeId, body); }
  @Post(':missionId/routes/:routeId/approve') approveRoute(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('routeId') routeId: string) { return this.service.approveRoute(auth, missionId, routeId); }
  @Post(':missionId/routes/:routeId/deprioritize') deprioritizeRoute(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('routeId') routeId: string) { return this.service.deprioritizeRoute(auth, missionId, routeId); }
  @Post(':missionId/routes/:routeId/research') researchRoute(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('routeId') routeId: string) { return this.service.researchRoute(auth, missionId, routeId); }
  @Post(':missionId/routes/review-complete') completeRouteReview(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Body(new ZodPipe(routeReviewSchema)) body: z.infer<typeof routeReviewSchema>) { return this.service.completeRouteReview(auth, missionId, body); }
}
