#!/usr/bin/env bash
set -euo pipefail

cd /opt/market-entry-agent

docker compose \
  --env-file /etc/market-entry-agent/devserver.env \
  -f docker-compose.devserver.yml \
  logs --tail=200 -f api worker projector web
