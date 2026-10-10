import type { FastifyError, FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import type { ApiError } from "../shared/api";

/** Throw from a route to send `{ error: { code, message } }` with the given status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = "bad_request") => new HttpError(400, code, message);
export const unauthorized = (message = "Sign in required", code = "unauthorized") =>
  new HttpError(401, code, message);
export const forbidden = (message = "Not allowed", code = "forbidden") => new HttpError(403, code, message);
export const notFound = (message = "Not found", code = "not_found") => new HttpError(404, code, message);
export const conflict = (message: string, code = "conflict") => new HttpError(409, code, message);

/** Validates input against a zod schema; failures become 400 `invalid_request`. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data);
}

export function errorBody(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | HttpError | ZodError, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send(errorBody(err.code, err.message));
    }
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
      return reply.status(400).send(errorBody("invalid_request", `${where}${issue?.message ?? "Invalid request"}`));
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) {
      req.log.error(err);
      return reply.status(status).send(errorBody("internal", "Internal server error"));
    }
    return reply.status(status).send(errorBody((err.code ?? "bad_request").toLowerCase(), err.message));
  });
}
