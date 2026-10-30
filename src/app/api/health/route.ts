/**
 * Liveness check for load balancers and container health checks (AWS ALB target group, Docker
 * HEALTHCHECK). Public and deliberately free of database calls, so a slow database never makes
 * the orchestrator kill healthy app containers.
 */
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
