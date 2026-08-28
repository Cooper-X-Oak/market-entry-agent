import { Controller, Get, Param, Post } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context.js';
import { CurrentAuth } from '../common/auth-context.js';
import { MarketService } from './market.service.js';

@Controller('api/v1/missions/:missionId')
export class OperationsController {
  constructor(private readonly service: MarketService) {}
  @Get('timeline') timeline(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.timeline(auth, missionId); }
  @Get('runs') runs(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.runs(auth, missionId); }
  @Get('runs/:runId') run(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('runId') runId: string) { return this.service.run(auth, missionId, runId); }
  @Get('refresh-proposals') refreshProposals(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string) { return this.service.refreshProposals(auth, missionId); }
  @Get('refresh-proposals/:proposalId') refreshProposal(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('proposalId') proposalId: string) { return this.service.refreshProposal(auth, missionId, proposalId); }
  @Post('refresh-proposals/:proposalId/accept') acceptRefresh(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('proposalId') proposalId: string) { return this.service.acceptRefreshProposal(auth, missionId, proposalId); }
  @Post('refresh-proposals/:proposalId/research') researchRefresh(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('proposalId') proposalId: string) { return this.service.researchRefreshProposal(auth, missionId, proposalId); }
  @Post('refresh-proposals/:proposalId/defer') deferRefresh(@CurrentAuth() auth: AuthContext, @Param('missionId') missionId: string, @Param('proposalId') proposalId: string) { return this.service.deferRefreshProposal(auth, missionId, proposalId); }
}
