#!/usr/bin/env bash
set -euo pipefail

cd /opt/market-entry-agent

docker compose \
  --env-file /etc/market-entry-agent/devserver.env \
  -f docker-compose.devserver.yml \
  restart api worker projector web

docker compose \
  --env-file /etc/market-entry-agent/devserver.env \
  -f docker-compose.devserver.yml \
  ps
