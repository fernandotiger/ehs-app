#!/usr/bin/env bash
# Run a command against the local `prisma dev` database instead of the one in .env.
# Usage: bash scripts/localdb.sh npx prisma migrate dev --name my_change
# Variables already in the environment win over .env (dotenv never overrides), so
# DATABASE_URL and DIRECT_URL here keep Prisma and Next.js off the remote database.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
. ./.env.localdb
set +a
exec "$@"
