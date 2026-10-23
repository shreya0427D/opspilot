import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, forbidden } from "./errors";
import { log } from "./log";

/** Rejects cross-site mutations: the Origin header must match our own host. */
export function assertSameOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) throw forbidden("Cross-site request blocked");
}

export async function readJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError(400, "bad_json", "Request body must be JSON");
  }
  return schema.parse(body);
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wraps a route handler with origin checks and consistent error responses. */
export function handler<C>(fn: Handler<C>, opts: { sameOrigin?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    try {
      if (opts.sameOrigin !== false) assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof AppError) {
        return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          {
            error: {
              code: "invalid_input",
              message: "Some fields are invalid",
              fields: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            },
          },
          { status: 400 },
        );
      }
      const errorId = crypto.randomUUID();
      log.error("Unhandled route error", { errorId, path: req.nextUrl.pathname, err });
      return NextResponse.json(
        { error: { code: "internal", message: "Something went wrong", errorId } },
        { status: 500 },
      );
    }
  };
}

export const ok = (data: unknown = { ok: true }, status = 200) => NextResponse.json(data, { status });
