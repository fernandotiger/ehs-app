# syntax=docker/dockerfile:1.7
#
# OleoQ EHS – production image for AWS (ECS / App Runner / EC2).
#
#   docker build -t oleoq-ehs .                              # the app (default target, Next.js standalone server)
#   docker build --target migrate -t oleoq-ehs-migrate .     # one-off "prisma migrate deploy" per release
#
# No secrets are baked in. DATABASE_URL, BETTER_AUTH_SECRET, CRON_SECRET, S3_* … are passed at run time
# (ECS task definition, ideally from Secrets Manager / SSM Parameter Store) – see docs/deploy-aws.md.

ARG NODE_VERSION=22

# ── base ─────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS base
# openssl: Prisma's schema engine (migrations); ca-certificates: outbound TLS (S3, RDS).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# ── deps: all dependencies (the build and the prisma CLI need the dev ones) ─
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall runs "prisma generate", which reads the schema copied above.
RUN npm ci --no-audit --no-fund

# ── builder: next build with standalone output ──────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_OUTPUT=standalone
# The server config is validated lazily at run time; these build-only placeholders let "next build"
# load server modules. They are not stored in the image (scoped to this RUN) and never used at run time.
RUN npx prisma generate \
 && DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" \
    BETTER_AUTH_SECRET="build-time-placeholder-not-a-secret" \
    npx next build

# ── migrate: run once per release, before the new app version takes traffic ─
#   docker run --rm -e DATABASE_URL=… oleoq-ehs-migrate
# Also the tools image for one-off tasks against the same database, e.g.
#   … oleoq-ehs-migrate npm run tenant:create -- …     /  ALLOW_REMOTE_SEED=1 … npm run db:seed
FROM base AS migrate
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json prisma.config.ts tsconfig.json ./
COPY --chown=node:node prisma ./prisma
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/src ./src
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ── runner (default): the app ───────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# node-postgres verifies the server certificate for sslmode=require; RDS / Aurora certificates are
# signed by Amazon's RDS CA, which is not in Node's default trust store.
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
