import "server-only";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = (msg = "Sign in required") => new AppError(401, "unauthorized", msg);
export const forbidden = (msg = "You don't have access to this") => new AppError(403, "forbidden", msg);
export const notFound = (msg = "Not found") => new AppError(404, "not_found", msg);
export const conflict = (msg: string) => new AppError(409, "conflict", msg);
export const badRequest = (msg: string) => new AppError(400, "bad_request", msg);
export const limitReached = (msg: string) => new AppError(429, "limit_reached", msg);
