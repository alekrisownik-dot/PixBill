#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
STAMP=$(date +%F)
docker compose exec -T app python -c "import sqlite3; s=sqlite3.connect('/data/pixbill.db'); d=sqlite3.connect('/data/backup.db'); s.backup(d); d.close()"
tar -czf "backups/pixbill-$STAMP.tar.gz" -C data backup.db photos
rm -f data/backup.db
find backups -name 'pixbill-*.tar.gz' -mtime +30 -delete
echo "Zapisano backups/pixbill-$STAMP.tar.gz"
