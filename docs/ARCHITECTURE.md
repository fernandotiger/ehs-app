# EHS Platform – Architecture & Conventions

A modular monolith on Next.js 16 (App Router). The browser talks to the backend **only through
Route Handlers under `src/app/api`**; pages are thin and render feature components that call the
API through TanStack Query.

```
Browser (PWA) ──fetch──▶ app/api/**/route.ts ──▶ apiHandler pipeline ──▶ module service ──▶ Prisma ─▶ Postgres (Neon / RDS)
      │                                                                   └─▶ StorageProvider ─▶ Vercel Blob / S3 / local disk
      └─ IndexedDB outbox ──(Sync button)──▶ /api/sync ──▶ sync registry ──▶ module sync handlers
```

## Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Pages | `src/app/(app)/**/page.tsx` | Routing + composition only. Usually render a feature component. |
| Feature UI | `src/features/<module>/` | `api.ts` (query keys + React Query hooks), `components/*`. |
| Shared UI | `src/components/common`, `src/components/layout`, `src/components/ui` (shadcn) | Reusable, module-agnostic. |
| Route handlers | `src/app/api/**/route.ts` | 3-10 lines: declare permission + zod schemas, call a service. |
| HTTP pipeline | `src/server/http/api-handler.ts` | Auth → permission → validation → handler → error mapping. |
| Services | `src/server/modules/<module>/*.service.ts` | Business logic, transactions, audit, notifications. |
| Policies | `src/server/modules/<module>/*.policy.ts` | Pure authorisation / visibility rules (Specification pattern → Prisma `where`). |
| Workflow | `src/server/modules/incidents/workflow.ts` | Pure state machine: transitions + guards. |
| Validation | `src/lib/validation/<module>.ts` | Zod schemas shared by client forms and API. |
| Infrastructure | `src/server/db`, `src/server/storage`, `src/server/auth`, `src/server/audit` | Swappable adapters. |

## Design patterns in use

- **Strategy** – `StorageProvider` (local / Vercel Blob / S3) and Prisma driver adapter (Neon / pg) chosen by env.
- **Factory** – `getStorage()`, `createPrismaClient()`, org-unit service factory.
- **Template method / pipeline** – `apiHandler()` wraps every endpoint with the same cross-cutting steps.
- **Specification** – access policies return Prisma `where` fragments, so the *same* rule is used for lists and single-record reads (a user can never open a record they couldn't list).
- **State machine** – incident & corrective-action lifecycles in one `workflow.ts`.
- **Registry** – offline sync handlers contributed per module (`src/server/modules/sync/sync.registry.ts`).
- **Observer-ready notifications** – `notificationService.notify()` is the single entry point; new channels (email/push) plug in there.

## Rules of thumb

1. **Authorisation lives on the server.** UI hides what users can't do (`useCurrentUser().can()`), but every API call re-checks. Check *permissions*, never role names – roles are data.
2. **Return 404, not 403, for records outside a user's scope** (don't leak existence).
3. **Every mutation writes an audit record in the same transaction**: `recordAudit({...}, tx)`.
4. **Acknowledgements and audit logs are append-only** – enforced by DB triggers (migration `immutable_audit_trail`) and HMAC-signed (`src/server/audit/signing.ts`).
5. **Files never leave storage except via an authorised API route** using `streamFile()`. Storage keys/URLs are never sent to the client.
6. **Uploads are two-phase**: `uploadFile()` on the client → `uploadId`; the domain API calls `uploadService.consume(uploadId, user, purpose, tx)` inside its transaction.
7. **Throw `AppError` subclasses** (`NotFoundError`, `ForbiddenError`, `ValidationError`, `BusinessRuleError`, `ConflictError`) – never build HTTP responses in services.
8. **Pagination is server-side** for anything user-scaled (15k users): `paginationQuerySchema` + `Paginated<T>`.
9. **Dates travel as ISO strings**; format on the client with `date-fns`.

## Adding an endpoint (example)

```ts
// src/app/api/admin/departments/route.ts
export const POST = apiHandler(
  { permission: PERMISSIONS.ADMIN_ORGANISATION, body: orgUnitSchema },
  async ({ body, user, meta }) => departmentService.create(body, user, meta),
);
```

## Offline / PWA

- `public/sw.js` – network-first caching for pages, API GETs and document files; cache-first for static assets.
- React Query cache is persisted to IndexedDB (`QueryProvider`), so previously loaded lists work offline.
- Offline writes go to the Dexie outbox (`src/lib/offline`). Use `enqueue()` / `stageFile()`; the header **Sync** button replays them through `POST /api/sync`. Operation types are declared in `src/lib/offline/operations.ts` and handled by module `sync-handlers.ts`. Operation ids are idempotency keys.
- The service worker is registered in production builds (or `NEXT_PUBLIC_ENABLE_SW=true` in dev).

## Infrastructure switches

| Variable | Values | Notes |
| --- | --- | --- |
| `DATABASE_DRIVER` | `neon` · `pg` | `neon` for Vercel + Neon, `pg` for local Postgres / AWS RDS / Aurora |
| `STORAGE_DRIVER` | `vercel-blob` · `s3` · `local` | Each file row stores its `storageDriver`, so old files stay readable after switching |
