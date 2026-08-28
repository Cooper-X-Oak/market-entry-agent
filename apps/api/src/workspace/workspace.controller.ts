import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { tenantRoleSchema } from '@imea/contracts';
import { z } from 'zod';
import type { AuthContext } from '../common/auth-context.js';
import { CurrentAuth } from '../common/auth-context.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { WorkspaceService } from './workspace.service.js';

const updateWorkspaceSchema = z.object({ name: z.string().min(1).max(160).optional() });
const addMemberSchema = z.object({ email: z.email(), role: tenantRoleSchema });
const updateMemberSchema = z.object({ role: tenantRoleSchema.optional(), status: z.enum(['active', 'invited', 'suspended']).optional() });

@Controller('api/v1/workspace')
export class WorkspaceController {
  constructor(private readonly service: WorkspaceService) {}
  @Get() get(@CurrentAuth() auth: AuthContext) { return this.service.get(auth); }
  @Patch() update(@CurrentAuth() auth: AuthContext, @Body(new ZodPipe(updateWorkspaceSchema)) body: z.infer<typeof updateWorkspaceSchema>) { return this.service.update(auth, body); }
  @Get('members') members(@CurrentAuth() auth: AuthContext) { return this.service.members(auth); }
  @Post('members') addMember(@CurrentAuth() auth: AuthContext, @Body(new ZodPipe(addMemberSchema)) body: z.infer<typeof addMemberSchema>) { return this.service.addMember(auth, body); }
  @Patch('members/:memberId') updateMember(@CurrentAuth() auth: AuthContext, @Param('memberId') memberId: string, @Body(new ZodPipe(updateMemberSchema)) body: z.infer<typeof updateMemberSchema>) { return this.service.updateMember(auth, memberId, body); }
}
