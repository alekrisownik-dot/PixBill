#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
MODEL=$(grep -E '^PIXBILL_OLLAMA_MODEL=' .env 2>/dev/null | cut -d= -f2- || true)
MODEL=${MODEL:-qwen2.5vl:3b}
docker compose exec ollama ollama pull "$MODEL"
