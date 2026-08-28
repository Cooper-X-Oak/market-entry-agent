import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../common/auth-context.js';
import { CurrentAuth } from '../common/auth-context.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { MarketService } from './market.service.js';

const targetUpdateSchema = z.object({ targetStatus: z.enum(['observed', 'target', 'high_priority', 'archived']).optional(), relevanceScore: z.number().int().min(0).max(100).optional(), primaryRouteId: z.uuid().optional() });
const createOpportunitySchema = z.object({ routeId: z.uuid().optional(), title: z.string().optional(), hypothesis: z.string().optional(), priority: z.enum(['low', 'medium', 'high', 'critical']).optional() });
const batchOpportunitySchema = z.object({ entityIds: z.array(z.uuid()).min(1).max(100) });
const stakeholderSchema = z.object({ personId: z.uuid().optional(), roleType: z.enum(['end_user','technical_influencer','procurement','budget_owner','executive_approver','channel_partner','importer','distributor','epc_engineer','tender_agent','supplier_onboarding','association_contact','industry_expert','exhibition_contact','local_service_partner']), title: z.string().optional(), decisionInfluence: z.number().int().min(0).max(100), contactPriority: z.number().int().min(1).max(10), relevanceReason: z.string().min(1), confidence: z.number().int().min(0).max(100).optional() });

@Controller('api/v1/missions/:missionId')
export class EcosystemController {
  constructor(private readonly service: MarketService) {}
  @Get('entities') entities(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.entities(auth, missionId); }
  @Get('entities/:entityId') entity(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('entityId') entityId: string) { return this.service.entity(auth, missionId, entityId); }
  @Get('relationships') relationships(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.relationships(auth, missionId); }
  @Get('graph') graph(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.graph(auth, missionId); }
  @Post('entities/:entityId/promote') promote(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('entityId') entityId: string) { return this.service.promoteEntity(auth, missionId, entityId); }
  @Post('entities/:entityId/archive') archive(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('entityId') entityId: string) { return this.service.archiveEntity(auth, missionId, entityId); }
  @Post('entities/:entityId/research') research(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('entityId') entityId: string) { return this.service.researchEntity(auth, missionId, entityId); }

  @Get('targets') targets(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.targets(auth, missionId); }
  @Patch('targets/:entityId') updateTarget(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('entityId') entityId: string, @Body(new ZodPipe(targetUpdateSchema)) body: z.infer<typeof targetUpdateSchema>) { return this.service.updateTarget(auth, missionId, entityId, body); }
  @Post('targets/:entityId/create-opportunity') createOpportunity(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('entityId') entityId: string, @Body(new ZodPipe(createOpportunitySchema)) body: z.infer<typeof createOpportunitySchema>) { return this.service.createOpportunity(auth, missionId, entityId, body); }
  @Post('targets/batch-create-opportunities') batchCreate(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Body(new ZodPipe(batchOpportunitySchema)) body: z.infer<typeof batchOpportunitySchema>) { return this.service.batchCreateOpportunities(auth, missionId, body.entityIds); }

  @Get('entities/:entityId/stakeholders') stakeholders(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('entityId') entityId: string) { return this.service.stakeholders(auth, missionId, entityId); }
  @Post('entities/:entityId/stakeholders') addStakeholder(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('entityId') entityId: string, @Body(new ZodPipe(stakeholderSchema)) body: z.infer<typeof stakeholderSchema>) { return this.service.addStakeholder(auth, missionId, entityId, body); }
  @Patch('stakeholders/:stakeholderId') updateStakeholder(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('stakeholderId') stakeholderId: string, @Body(new ZodPipe(stakeholderSchema.partial())) body: Partial<z.infer<typeof stakeholderSchema>>) { return this.service.updateStakeholder(auth, missionId, stakeholderId, body); }
  @Post('entities/:entityId/stakeholders/research') researchStakeholders(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('entityId') entityId: string) { return this.service.researchStakeholders(auth, missionId, entityId); }
}
