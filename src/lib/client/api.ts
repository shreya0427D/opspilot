"use client";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public fields?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** Calls our route handlers. Mutations are same-origin; the session cookie authenticates. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error ?? {};
    const detail = err.fields?.length ? `: ${err.fields.map((f: { message: string }) => f.message).join(", ")}` : "";
    throw new ApiRequestError(`${err.message ?? "Request failed"}${detail}`, res.status, err.code ?? "error", err.fields);
  }
  return data as T;
}

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : "Something went wrong";
