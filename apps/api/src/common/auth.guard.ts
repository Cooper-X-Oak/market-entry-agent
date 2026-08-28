import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Environment } from '@imea/config';
import { tenantRoleSchema } from '@imea/contracts';
import type { AuthContext } from './auth-context.js';
import { IS_PUBLIC } from './auth-context.js';
import { ENVIRONMENT } from '../tokens.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService, @Inject(ENVIRONMENT) private readonly env: Environment) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<{ cookies?: Record<string, string>; headers: Record<string, string | undefined>; auth?: AuthContext }>();
    const bearer = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined;
    const token = request.cookies?.access_token ?? bearer;
    if (!token) throw new UnauthorizedException('Authentication required');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; tenantId: string; role: string; email: string }>(token, { secret: this.env.JWT_SECRET });
      request.auth = { userId: payload.sub, tenantId: payload.tenantId, role: tenantRoleSchema.parse(payload.role), email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException('Session expired or invalid');
    }
  }
}
