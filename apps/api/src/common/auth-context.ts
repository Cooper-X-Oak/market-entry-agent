import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { TenantRole } from '@imea/contracts';

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: TenantRole;
  email: string;
}

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentAuth = createParamDecorator((_data: unknown, context: ExecutionContext): AuthContext => {
  const request = context.switchToHttp().getRequest<{ auth: AuthContext }>();
  return request.auth;
});
