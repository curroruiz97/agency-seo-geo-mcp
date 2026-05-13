import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestId(req: Request, res: Response, next: NextFunction) {
  const existing = req.header("x-request-id");
  const id = existing && existing.length <= 128 ? existing : randomUUID();

  res.setHeader("x-request-id", id);
  next();
}
