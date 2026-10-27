/**
 * Typed fetch wrapper used by all client-side data hooks.
 * Normalises API error envelopes into ApiError instances.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True when the request never reached the server (offline / network failure). */
  get isNetworkError() {
    return this.status === 0 || this.code === "NETWORK_ERROR";
  }
}

type Query = Record<string, string | number | boolean | null | undefined | string[]>;

function buildUrl(path: string, query?: Query) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(method: string, path: string, options: { body?: unknown; query?: Query; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), {
      method,
      headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      credentials: "same-origin",
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new ApiError("You appear to be offline", 0, "NETWORK_ERROR");
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const err = data?.error;
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth")) {
      window.dispatchEvent(new CustomEvent("ehs:unauthorized"));
    }
    throw new ApiError(err?.message ?? res.statusText, res.status, err?.code ?? "HTTP_ERROR", err?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>("GET", path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

/** Human friendly message for toasts. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "VALIDATION_ERROR" && Array.isArray(error.details) && error.details.length) {
      const first = error.details[0] as { path?: string; message?: string };
      return first.path ? `${first.path}: ${first.message}` : (first.message ?? error.message);
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong";
}
