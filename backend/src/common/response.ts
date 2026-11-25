import type { Response } from "express";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown;
}

export function ok<T>(res: Response, data: T, message = "OK", status = 200): Response {
  return res.status(status).json({ success: true, message, data } satisfies ApiResponse<T>);
}

export function created<T>(res: Response, data: T, message = "Created"): Response {
  return ok(res, data, message, 201);
}

export function fail(res: Response, status: number, message: string, errors?: unknown): Response {
  return res.status(status).json({ success: false, message, errors } satisfies ApiResponse);
}