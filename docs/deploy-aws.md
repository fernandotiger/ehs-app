# Deploying to AWS (GitLab → Docker → ECS, S3, RDS, OpenTofu)

The app ships as one Docker image. It needs no build-time secrets: everything is read from environment variables
when the container starts. Vercel keeps working from the same repository.

## What is in the repo

| File | Purpose |
| --- | --- |
| `Dockerfile` | Multi-stage build on `node:22-bookworm-slim`. The default target is the app: Next.js `standalone` server, non-root `node` user, port 3000, `HEALTHCHECK` on `/api/health`. Target `migrate` runs `prisma migrate deploy` and doubles as the tools image for seeds and tenant creation. Both include the Amazon RDS CA bundle (`NODE_EXTRA_CA_CERTS`). |
| `.dockerignore` | Keeps `.env*`, `storage/`, the client spreadsheet, `.git`, `node_modules`, `.next`, docs and tests out of the build context. |
| `next.config.ts` | Uses `output: "standalone"` only when `NEXT_OUTPUT=standalone`, which the Dockerfile sets. Vercel builds are unchanged. |
| `src/app/api/health/route.ts` | Public liveness check (`{"status":"ok"}`, no database call) for the ALB target group and Docker. |

```bash
docker build -t oleoq-ehs .                            # app image
docker build --target migrate -t oleoq-ehs-migrate .   # migrations / tools image
```

## Release order (per deploy)

1. The pipeline builds and pushes **both** images to ECR, tagged with the commit SHA.
2. Run the **migrate** image once as a one-off ECS task (same VPC/subnets/security group as the app, same `DATABASE_URL`
   secret) and wait for exit code 0. Migrations are additive, and Prisma takes a database lock, so a retry is safe.
3. Update the ECS service to the new app image. Rolling deploys are fine: there are no Server Actions, sessions live in the
   database, and every task runs the same build.

The pipeline itself (GitLab runner → ECR → ECS) is owned by the team's existing `.gitlab-ci.yml` / OpenTofu. Ask the colleague
who wrote it whether it already builds a second target and runs a migration task. If not, those are the two additions above.

## Runtime environment variables

Set these on the ECS task definition. **Secret** = store in AWS Secrets Manager (or SSM Parameter Store `SecureString`) and
reference it with `secrets`/`valueFrom`; never as a plain `environment` value, in the image, in Git or in OpenTofu code.

| Variable | Secret? | Value on AWS |
| --- | --- | --- |
| `DATABASE_DRIVER` | no | `pg` |
| `DATABASE_URL` | **yes** | `postgresql://USER:PASSWORD@<rds-endpoint>:5432/<db>?sslmode=require` (TLS verified with the bundled RDS CA). See "PostgreSQL" below for a self-managed server. |
| `DIRECT_URL` | **yes** | Only if `DATABASE_URL` goes through RDS Proxy / a pooler: the direct endpoint, used by the migrate image. |
| `DATABASE_POOL_MAX` | no | Optional, e.g. `10` per task. Keep tasks × pool below the RDS `max_connections`. |
| `STORAGE_DRIVER` | no | `s3` |
| `S3_BUCKET` / `S3_REGION` | no | Bucket name and region, e.g. `eu-west-1`. |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | – | **Leave unset.** Give the ECS *task role* S3 access instead (default AWS credential chain). |
| `BETTER_AUTH_SECRET` | **yes** | 32+ random bytes: `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | no | The exact public origin users type, e.g. `https://ehs.example.ie` (no trailing slash). Sign-in fails if it differs. |
| `AUDIT_SIGNING_SECRET` | **yes** | Optional. Defaults to `BETTER_AUTH_SECRET`. Signs audit/acknowledgement records – **never rotate or lose it**. |
| `CRON_SECRET` | **yes** | Random string. EventBridge sends it as `Authorization: Bearer <CRON_SECRET>`. |
| `OPENROUTER_API_KEY` | **yes** | Optional. The OpenRouter key (`sk-or-v1-…`) for the AI assistant (✦ button). Unset = the assistant shows "not set up yet" to admins and is hidden for everyone else. The tasks need outbound HTTPS to `openrouter.ai` (NAT gateway in private subnets). See `docs/modules/assistant.md`. |
| `NODE_ENV`, `PORT`, `HOSTNAME` | no | Already set in the image (`production`, `3000`, `0.0.0.0`). |

Not used on AWS: `BLOB_READ_WRITE_TOKEN`, `LOCAL_STORAGE_DIR`, `SHADOW_DATABASE_URL`, `NEXT_PUBLIC_ENABLE_SW`.

**New database or moved data?** On a fresh RDS database, generate new `BETTER_AUTH_SECRET` / `AUDIT_SIGNING_SECRET` values.
If the Neon data is ever copied to RDS, copy the **same** two values from Vercel, or existing signatures stop verifying and
every session is invalidated.

## Keeping the keys safe

- `.env*` files are git-ignored and docker-ignored. Never paste real values into the Dockerfile, `--build-arg`, `.gitlab-ci.yml`
  or `*.tf` files. The image needs no secrets to build.
- **Runtime secrets live in Secrets Manager.** Create them once from your machine (or the console), so the values never
  pass through Git or the pipeline:
  ```bash
  aws secretsmanager create-secret --name oleoq/prod/BETTER_AUTH_SECRET --secret-string "$(openssl rand -base64 32)"
  aws secretsmanager create-secret --name oleoq/prod/CRON_SECRET        --secret-string "$(openssl rand -base64 32)"
  aws secretsmanager create-secret --name oleoq/prod/DATABASE_URL       --secret-string 'postgresql://…?sslmode=require'
  aws secretsmanager create-secret --name oleoq/prod/OPENROUTER_API_KEY --secret-string 'sk-or-v1-…'   # optional – AI assistant
  ```
  OpenTofu then only *references* them by name/ARN. If OpenTofu creates the RDS password itself (`random_password`), the
  value ends up in state: keep state in an encrypted, access-restricted backend (S3 + KMS, or OpenTofu state encryption).
- The ECS **execution role** needs `secretsmanager:GetSecretValue` (and `kms:Decrypt` for a customer KMS key) on exactly those
  secrets. The **task role** needs `s3:GetObject`, `s3:PutObject` and `s3:DeleteObject` on `arn:aws:s3:::<bucket>/org/*`, and
  nothing else.
- **GitLab CI/CD variables** are only for the pipeline's own AWS access. Prefer GitLab OIDC (`id_tokens`) assuming an IAM role
  over long-lived access keys. Any variable you add: mark it **Protected** and **Masked** (Settings → CI/CD → Variables).
- Rotation: `CRON_SECRET` can rotate any time (update the EventBridge connection too). Rotating `BETTER_AUTH_SECRET` signs
  everyone out. `AUDIT_SIGNING_SECRET` must not rotate. `OPENROUTER_API_KEY` can rotate any time (create the new key on
  openrouter.ai, update the secret, redeploy the service so tasks read it, then delete the old key).

OpenTofu sketch for the container definition (adapt names to the existing module):

```hcl
secrets = [
  for name in ["DATABASE_URL", "BETTER_AUTH_SECRET", "CRON_SECRET", "OPENROUTER_API_KEY"] :
  { name = name, valueFrom = data.aws_secretsmanager_secret.app[name].arn }
]
environment = [
  { name = "DATABASE_DRIVER", value = "pg" },
  { name = "STORAGE_DRIVER",  value = "s3" },
  { name = "S3_BUCKET",       value = aws_s3_bucket.files.bucket },
  { name = "S3_REGION",       value = var.region },
  { name = "BETTER_AUTH_URL", value = "https://${var.domain}" },
]
```

## PostgreSQL

The app runs on any PostgreSQL 14+ with `DATABASE_DRIVER=pg` (node-postgres + Prisma). Amazon RDS for PostgreSQL or Aurora
PostgreSQL is the simplest choice: create an empty database and a login user that owns it, then let the migrate image create
the tables. In the connection string, node-postgres treats `sslmode=require` as "encrypt **and** verify the certificate".
- **RDS / Aurora:** works as is, because the image trusts the Amazon RDS CA bundle.
- **Self-managed PostgreSQL** (EC2, container) with its own certificate: add that CA to the image and point
  `NODE_EXTRA_CA_CERTS` at it. If the server has no TLS and sits in the same private subnet, use `sslmode=disable` there.
- Keep the database in private subnets. Its security group should allow port 5432 only from the app's and the migrate task's
  security group.
- One Prisma migration history per database: don't point the app at a database that another tool also migrates.

## Other AWS settings

- **S3 bucket:** Block Public Access on, default encryption on, versioning recommended. Add a CORS rule that allows `PUT` and
  `GET` from `https://<your domain>`, because browsers upload with presigned URLs. Files are only ever streamed through the
  app after an access check.
- **Load balancer:** HTTPS listener (ACM certificate) → target group on port 3000, health check path `/api/health`. Keep
  the default idle timeout of 60 s or more, because pages stream.
- **Scheduled work:** EventBridge (Scheduler or rule) → **API destination** + **connection** with API-key auth (header
  `Authorization`, value `Bearer <CRON_SECRET>`). Targets: `GET https://<domain>/api/cron/jobs` every 15 minutes and
  `GET https://<domain>/api/cron/reminders` daily at 06:00 UTC.
- **Logs:** the app writes to stdout/stderr, so use the `awslogs` log driver → CloudWatch.

## First start on an empty RDS database

Run these as one-off tasks with the **migrate** image (command override), in this order:

1. `npx prisma migrate deploy` (the default command).
2. Either create a real company:
   `npm run tenant:create -- --name "Port of Cork" --slug portofcork --admin-email … --admin-name … --password <temporary>`
   (change the password at first sign-in; a command override is visible in the ECS console),
   or load the demo data: `npm run db:seed` with `ALLOW_REMOTE_SEED=1` set on the task for the module seed scripts.

## Tested locally (30 Oct 2026)

Both images were built and run against an empty `postgres:17` container:
- `migrate` applied all migrations, and a second run was a no-op.
- `npm run db:seed` worked from the tools image.
- The app container became healthy, and `/login` returned 200.
- Sign-in as the demo admin worked, and the dashboard and APIs returned 200.
- The cron endpoint returned 401 without the secret and 200 with it.

Sizes: app ≈ 510 MB, migrate/tools ≈ 2 GB (full toolchain).

## Troubleshooting

- **`npm ci` fails with "Missing: … from lock file"** (Docker or CI): `package-lock.json` was written on Windows without
  the other platforms' optional packages. Regenerate it in Linux and commit the result:
  `docker run --rm -v "$PWD":/w -w /w node:22-bookworm-slim npm install --package-lock-only --ignore-scripts`.
- **Sign-in fails right after deploy:** `BETTER_AUTH_URL` must equal the public URL exactly (scheme, host, no trailing slash).
- **"self-signed certificate in certificate chain" from the database:** the server's CA is not trusted. RDS is covered by
  the image; for other servers see "PostgreSQL" above.
- **Git Bash on Windows:** prefix `docker run … -e SOME_DIR=/tmp/x` with `MSYS_NO_PATHCONV=1`, or Git Bash rewrites the path.

## Pushing this repository to GitLab

The repo already pushes to GitHub (`origin`, used by Vercel). Add GitLab as a second remote:

```bash
git remote add gitlab https://gitlab.com/<group>/<project>.git
git push gitlab master
```

If the pipeline runs on `main`, push with `git push gitlab master:main`. Sign in with a GitLab personal access token
(scope `write_repository`) when Git asks for a password, or use an SSH key. Check with your colleague which branch triggers
the deploy and whether it is protected.
