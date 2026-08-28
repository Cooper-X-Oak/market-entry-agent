import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from '@nestjs/common';
import { DomainError } from '@imea/domain';

const statusByCode: Record<string, number> = {
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_SESSION_EXPIRED: 401,
  AUTH_PERMISSION_DENIED: 403,
  MISSION_NOT_FOUND: 404,
  ROUTE_NOT_FOUND: 404,
  ENTITY_NOT_FOUND: 404,
  CONTACT_POINT_NOT_FOUND: 404,
  OPPORTUNITY_NOT_FOUND: 404,
  ACTION_CARD_NOT_FOUND: 404,
  CLAIM_NOT_FOUND: 404,
  STAKEHOLDER_NOT_FOUND: 404,
  WORKSPACE_MEMBER_NOT_FOUND: 404,
  REFRESH_PROPOSAL_NOT_FOUND: 404,
  RUN_NOT_FOUND: 404,
  MISSION_STAGE_CONFLICT: 409,
  OPPORTUNITY_STATE_CONFLICT: 409,
  ACTION_CARD_STATE_CONFLICT: 409,
  ACTION_CARD_APPROVAL_REQUIRED: 409,
  ROUTE_APPROVAL_REQUIRED: 409,
  ARTIFACT_VERSION_CONFLICT: 409,
  MISSION_BUDGET_EXHAUSTED: 422,
  CONNECTOR_RATE_LIMITED: 429,
  CONNECTOR_UNAVAILABLE: 503,
};

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{ status: (status: number) => { send: (body: unknown) => void } }>();
    const request = host.switchToHttp().getRequest<{ id?: string }>();
    if (exception instanceof DomainError) {
      response.status(statusByCode[exception.code] ?? 400).send({ error: { code: exception.code, message: exception.message, details: exception.details }, meta: { requestId: request.id ?? crypto.randomUUID(), timestamp: new Date().toISOString() } });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).send({ error: { code: status === 400 ? 'VALIDATION_ERROR' : `HTTP_${status}`, message: exception.message, details: exception.getResponse() }, meta: { requestId: request.id ?? crypto.randomUUID(), timestamp: new Date().toISOString() } });
      return;
    }
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: { code: 'INTERNAL_ERROR', message: exception instanceof Error ? exception.message : 'Unexpected error' }, meta: { requestId: request.id ?? crypto.randomUUID(), timestamp: new Date().toISOString() } });
  }
}
