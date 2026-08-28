# API

Base path: `/api/v1`. Authentication uses an HTTP-only `access_token` cookie or `Authorization: Bearer ...`. Normal success responses use `{ data, meta }`; errors use `{ error: { code, message, details }, meta }`. Raw download and SSE endpoints are not wrapped.

## Auth and workspace

```text
POST  /auth/register
POST  /auth/login
POST  /auth/logout
GET   /auth/me
GET   /workspace
PATCH /workspace
GET   /workspace/members
POST  /workspace/members
PATCH /workspace/members/:memberId
```

## Missions and sources

```text
POST  /missions
GET   /missions?page=1&pageSize=50
GET   /missions/:missionId
PATCH /missions/:missionId
POST  /missions/:missionId/start
POST  /missions/:missionId/pause
POST  /missions/:missionId/resume
POST  /missions/:missionId/refresh
POST  /missions/:missionId/complete
GET   /missions/:missionId/progress
GET   /missions/:missionId/workflow-progress
GET   /missions/:missionId/metrics
GET   /missions/:missionId/export
GET   /missions/:missionId/stream
POST  /missions/:missionId/sources/upload
POST  /missions/:missionId/sources/url
GET   /missions/:missionId/sources
GET   /missions/:missionId/sources/:sourceId
GET   /missions/:missionId/sources/:sourceId/snapshots
```

The full Mission export is a ZIP. Source upload is multipart, one file, maximum 50 MB.

## Capabilities and routes

```text
GET   /missions/:missionId/capabilities
PATCH /missions/:missionId/capabilities/:claimId
POST  /missions/:missionId/capabilities/:claimId/confirm
POST  /missions/:missionId/capabilities/:claimId/contradict
POST  /missions/:missionId/capabilities/research
GET   /missions/:missionId/routes
GET   /missions/:missionId/routes/:routeId
PATCH /missions/:missionId/routes/:routeId
POST  /missions/:missionId/routes/:routeId/approve
POST  /missions/:missionId/routes/:routeId/deprioritize
POST  /missions/:missionId/routes/:routeId/research
POST  /missions/:missionId/routes/review-complete
```

## Ecosystem, targets and stakeholders

```text
GET   /missions/:missionId/entities
GET   /missions/:missionId/entities/:entityId
GET   /missions/:missionId/relationships
GET   /missions/:missionId/graph
POST  /missions/:missionId/entities/:entityId/promote
POST  /missions/:missionId/entities/:entityId/archive
POST  /missions/:missionId/entities/:entityId/research
GET   /missions/:missionId/targets
PATCH /missions/:missionId/targets/:entityId
POST  /missions/:missionId/targets/:entityId/create-opportunity
POST  /missions/:missionId/targets/batch-create-opportunities
GET   /missions/:missionId/entities/:entityId/stakeholders
POST  /missions/:missionId/entities/:entityId/stakeholders
PATCH /missions/:missionId/stakeholders/:stakeholderId
POST  /missions/:missionId/entities/:entityId/stakeholders/research
```

## Contacts, opportunities and actions

```text
GET   /missions/:missionId/contact-points
GET   /missions/:missionId/contact-points/:contactPointId
PATCH /missions/:missionId/contact-points/:contactPointId
POST  /missions/:missionId/contact-points/:contactPointId/verify
POST  /missions/:missionId/contact-points/:contactPointId/confirm
POST  /missions/:missionId/contact-points/:contactPointId/mark-stale
POST  /missions/:missionId/entities/:entityId/contact-research
GET   /missions/:missionId/opportunities
POST  /missions/:missionId/opportunities
GET   /missions/:missionId/opportunities/:opportunityId
GET   /missions/:missionId/opportunities/:opportunityId/workflow-progress
PATCH /missions/:missionId/opportunities/:opportunityId
POST  /missions/:missionId/opportunities/:opportunityId/research
POST  /missions/:missionId/opportunities/:opportunityId/pause
POST  /missions/:missionId/opportunities/:opportunityId/resume
POST  /missions/:missionId/opportunities/:opportunityId/archive
GET   /missions/:missionId/opportunities/:opportunityId/scores
GET   /missions/:missionId/action-cards
GET   /missions/:missionId/action-cards/:actionCardId
PATCH /missions/:missionId/action-cards/:actionCardId
POST  /missions/:missionId/action-cards/:actionCardId/decision
POST  /missions/:missionId/action-cards/:actionCardId/regenerate
POST  /missions/:missionId/action-cards/:actionCardId/execute
GET   /missions/:missionId/action-cards/:actionCardId/export?format=markdown|csv
```

Action export requires an approved/exported/executed/completed card and writes an audit event.

The decision body is `{ decision: "approve" | "request_changes", expectedVersionNo, comment? }`; `comment` is required for `request_changes`. Route review submits `{ approvedRouteIds, acceptedArtifactVersionIds, comment? }`. Accepted commands return a receipt containing `commandId`, `correlationId`, aggregate/workflow IDs and `acceptedAt`; the receipt means durable command acceptance, while Workflow Progress and SSE report the resulting state.

## Interactions, audit and refresh

```text
POST /missions/:missionId/opportunities/:opportunityId/interactions
GET  /missions/:missionId/opportunities/:opportunityId/interactions
GET  /missions/:missionId/interactions
GET  /missions/:missionId/timeline
GET  /missions/:missionId/runs
GET  /missions/:missionId/runs/:runId
GET  /missions/:missionId/refresh-proposals
GET  /missions/:missionId/refresh-proposals/:proposalId
POST /missions/:missionId/refresh-proposals/:proposalId/accept
POST /missions/:missionId/refresh-proposals/:proposalId/research
POST /missions/:missionId/refresh-proposals/:proposalId/defer
```

## SSE

`GET /missions/:missionId/stream` emits events shaped as:

```json
{
  "id": "event-id",
  "type": "opportunity.state_transitioned.v1",
  "missionId": "mission-id",
  "opportunityId": "optional-opportunity-id",
  "occurredAt": "2026-08-28T00:00:00.000Z",
  "readModelVersion": 12,
  "payload": {}
}
```

Clients establish REST state first, then invalidate/refetch on SSE events. Reconnect uses `Last-Event-ID`; the server retains a bounded recent buffer and the client falls back to a full refetch when necessary.

## Idempotency

Send `Idempotency-Key` on mutations. The Web client generates one automatically. A replay with the same tenant, route and request hash returns the original response; a different body with the same key returns `409`.
