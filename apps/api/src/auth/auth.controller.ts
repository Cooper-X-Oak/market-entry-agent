import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AuthContext } from '../common/auth-context.js';
import { CurrentAuth, Public } from '../common/auth-context.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AuthService, type LoginInput, type RegisterInput } from './auth.service.js';

const registerSchema = z.object({ name: z.string().min(1).max(120), workspaceName: z.string().min(1).max(160), email: z.email(), password: z.string().min(10).max(200) });
const loginSchema = z.object({ email: z.email(), password: z.string().min(1).max(200) });
const selectWorkspaceSchema = z.object({ workspaceId: z.uuid() });

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Public() @Post('register')
  async register(@Body(new ZodPipe(registerSchema)) input: RegisterInput, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.service.register(input);
    response.setCookie('access_token', result.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 8 * 60 * 60 });
    return { user: { id: result.user.id, email: result.user.email, displayName: result.user.displayName }, workspace: { id: result.tenant.id, name: result.tenant.name }, role: result.role };
  }

  @Public() @Post('login')
  async login(@Body(new ZodPipe(loginSchema)) input: LoginInput, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.service.login(input);
    response.setCookie('access_token', result.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 8 * 60 * 60 });
    return { user: { id: result.user.id, email: result.user.email, displayName: result.user.displayName }, workspace: { id: result.tenant.id, name: result.tenant.name }, workspaces: result.workspaces, role: result.member.role };
  }

  @Get('workspaces') workspaces(@CurrentAuth() auth: AuthContext) { return this.service.workspaces(auth.userId); }
  @Post('select-workspace')
  async selectWorkspace(@CurrentAuth() auth: AuthContext, @Body(new ZodPipe(selectWorkspaceSchema)) input: z.infer<typeof selectWorkspaceSchema>, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.service.selectWorkspace(auth.userId, auth.email, input.workspaceId);
    response.setCookie('access_token', result.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 8 * 60 * 60 });
    return { workspace: result.workspace, role: result.role };
  }

  @Public() @Post('logout') logout(@Res({ passthrough: true }) response: FastifyReply) { response.clearCookie('access_token', { path: '/' }); return { loggedOut: true }; }
  @Get('me') me(@CurrentAuth() auth: AuthContext) { return auth; }
}
