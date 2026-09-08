import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ id?: string; headers?: { accept?: string } }>();
    if (request.headers?.accept?.includes('text/event-stream')) return next.handle();
    return next.handle().pipe(map((data: unknown) => {
      if (data && typeof data === 'object' && ('meta' in data || 'event' in data)) return data;
      return { data, meta: { requestId: request.id ?? crypto.randomUUID(), timestamp: new Date().toISOString() } };
    }));
  }
}
