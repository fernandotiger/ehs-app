import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { ModuleKey } from "@/lib/modules";
import type { Permission } from "@/lib/permissions";
import { moduleEnabled, requireAnyPermission } from "@/server/auth/authorization";
import { getCurrentUser, type CurrentUser } from "@/server/auth/current-user";
import { runWithTenant } from "@/server/tenancy/context";
import { AppError, ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "./errors";

/** Request metadata captured for audit trails. */
export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

interface HandlerOptions<TBody, TQuery> {
  /** Require an authenticated user (default true). */
  auth?: boolean;
  /** Require at least one of these permissions (held in any scope). */
  permission?: Permission | readonly Permission[];
  /** The endpoint belongs to this module; 404 when the tenant has not enabled it. */
  module?: ModuleKey;
  /** Zod schema for the JSON body. */
  body?: ZodType<TBody>;
  /** Zod schema for query string parameters. */
  query?: ZodType<TQuery>;
}

export interface HandlerContext<TBody, TQuery, TAuth extends boolean> {
  req: NextRequest;
  user: TAuth extends false ? CurrentUser | null : CurrentUser;
  body: TBody;
  query: TQuery;
  params: Record<string, string>;
  meta: RequestMeta;
}

type RouteContext = { params: Promise<Record<string, string | string[]>> };

/**
 * Wraps a Route Handler with the cross-cutting concerns every endpoint needs
 * (Template Method / pipeline):
 *   authentication → tenant context → module check → authorisation → input validation
 *   → handler → error mapping.
 *
 * The handler runs inside runWithTenant(user.organizationId), so every Prisma query it makes
 * is scoped to the caller's company.
 *
 * Handlers return plain data (serialised as JSON), `undefined` (204) or a Response.
 */
export function apiHandler<TBody = undefined, TQuery = undefined, TAuth extends boolean = true>(
  options: HandlerOptions<TBody, TQuery> & { auth?: TAuth },
  handler: (ctx: HandlerContext<TBody, TQuery, TAuth>) => Promise<unknown>,
) {
  return async (req: NextRequest, routeCtx: RouteContext): Promise<Response> => {
    try {
      const requireAuth = options.auth !== false;
      const user = await getCurrentUser();
      if (requireAuth && !user) throw new UnauthorizedError();

      if (options.module && user && !moduleEnabled(user, options.module)) throw new NotFoundError();

      if (options.permission && user) {
        const list = (Array.isArray(options.permission) ? options.permission : [options.permission]) as Permission[];
        requireAnyPermission(user, list);
      }

      const rawParams = routeCtx?.params ? await routeCtx.params : {};
      const params = Object.fromEntries(
        Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v.join("/") : v]),
      );

      let body = undefined as TBody;
      if (options.body) {
        const json = await req.json().catch(() => {
          throw new ValidationError("Request body must be valid JSON");
        });
        body = options.body.parse(json);
      }

      let query = undefined as TQuery;
      if (options.query) {
        query = options.query.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
      }

      const meta: RequestMeta = {
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip"),
        userAgent: req.headers.get("user-agent"),
      };

      const ctx: HandlerContext<TBody, TQuery, TAuth> = {
        req,
        user: user as HandlerContext<TBody, TQuery, TAuth>["user"],
        body,
        query,
        params,
        meta,
      };
      const result = user ? await runWithTenant(user.organizationId, () => handler(ctx)) : await handler(ctx);

      if (result instanceof Response) return result;
      if (result === undefined) return new NextResponse(null, { status: 204 });
      return NextResponse.json(result);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export function toErrorResponse(error: unknown): Response {
  const appError = normaliseError(error);
  if (appError.status >= 500) console.error("[api] unhandled error", error);
  return NextResponse.json(
    { error: { code: appError.code, message: appError.message, details: appError.details } },
    { status: appError.status },
  );
}

function normaliseError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return new ValidationError("Validation failed", error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return new ConflictError("A record with the same unique value already exists", error.meta);
    if (error.code === "P2025") return new NotFoundError();
  }
  return new AppError("An unexpected error occurred", 500, "INTERNAL_ERROR");
}
