import { Inject, Injectable, type MessageEvent, OnModuleInit } from '@nestjs/common';
import type { DatabaseClient } from '@imea/database';
import { filter, interval, map, merge, Observable, Subject } from 'rxjs';
import { DATABASE_CLIENT } from '../tokens.js';

interface InternalEvent { id: string; type: string; missionId: string; opportunityId?: string; occurredAt: string; readModelVersion: number; payload: Record<string, unknown> }

@Injectable()
export class EventStreamService implements OnModuleInit {
  private readonly events = new Subject<InternalEvent>();
  private readonly history = new Map<string, InternalEvent[]>();

  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async onModuleInit(): Promise<void> {
    await this.database.sql.listen('mission_events', (payload) => {
      try {
        const event = JSON.parse(payload) as InternalEvent;
        this.record(event);
      } catch {
        // Invalid database notifications are ignored; canonical evidence remains in domain_events.
      }
    });
  }

  publish(event: Omit<InternalEvent, 'id' | 'occurredAt' | 'readModelVersion'>): void {
    this.record({ ...event, id: crypto.randomUUID(), occurredAt: new Date().toISOString(), readModelVersion: 0 });
  }

  private record(event: InternalEvent): void {
    const items = this.history.get(event.missionId) ?? [];
    items.push(event);
    if (items.length > 100) items.splice(0, items.length - 100);
    this.history.set(event.missionId, items);
    this.events.next(event);
  }

  stream(missionId: string, lastEventId?: string): Observable<MessageEvent> {
    const businessEvents = this.events.pipe(filter((event) => event.missionId === missionId), map((event) => ({ id: event.id, type: event.type, data: event })));
    const heartbeat = interval(25_000).pipe(map(() => ({ type: 'heartbeat', data: { missionId, occurredAt: new Date().toISOString() } })));
    return new Observable<MessageEvent>((subscriber) => {
      const subscription = merge(businessEvents, heartbeat).subscribe(subscriber);
      if (lastEventId) {
        const history = this.history.get(missionId) ?? [];
        const index = history.findIndex((event) => event.id === lastEventId);
        if (index >= 0) for (const event of history.slice(index + 1)) subscriber.next({ id: event.id, type: event.type, data: event });
        else subscriber.next({ type: 'stream.reset_required', data: { missionId, reason: 'last_event_not_in_recent_buffer' } });
      }
      return () => subscription.unsubscribe();
    });
  }
}
