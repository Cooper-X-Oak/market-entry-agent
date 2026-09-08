#!/usr/bin/env bash
set -euo pipefail

cd /opt/market-entry-agent

docker compose \
  --env-file /etc/market-entry-agent/devserver.env \
  -f docker-compose.devserver.yml \
  up -d postgres temporal minio

docker compose \
  --env-file /etc/market-entry-agent/devserver.env \
  -f docker-compose.devserver.yml \
  run --rm deps

docker compose \
  --env-file /etc/market-entry-agent/devserver.env \
  -f docker-compose.devserver.yml \
  run --rm deps sh -lc "corepack enable && for project in packages/contracts/tsconfig.json packages/domain/tsconfig.json packages/config/tsconfig.json packages/evidence/tsconfig.json packages/policies/tsconfig.json packages/connectors/tsconfig.json packages/database/tsconfig.json packages/agents/tsconfig.json packages/workflows/tsconfig.json packages/observability/tsconfig.json; do pnpm exec tsc -p \"\$project\" --pretty false || exit 1; done && pnpm exec tsc -p apps/api/tsconfig.json --noCheck --tsBuildInfoFile /tmp/imea-api.tsbuildinfo"

docker compose \
  --env-file /etc/market-entry-agent/devserver.env \
  -f docker-compose.devserver.yml \
  run --rm postgres-migrate

docker compose \
  --env-file /etc/market-entry-agent/devserver.env \
  -f docker-compose.devserver.yml \
  run --rm postgres-bootstrap

docker compose \
  --env-file /etc/market-entry-agent/devserver.env \
  -f docker-compose.devserver.yml \
  up -d minio-init api worker projector web temporal-ui

docker compose \
  --env-file /etc/market-entry-agent/devserver.env \
  -f docker-compose.devserver.yml \
  ps
