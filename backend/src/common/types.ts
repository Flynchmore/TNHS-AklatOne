import type { AuthUser } from "../modules/auth/auth.service.js";

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      id?: string;
    }
  }
}

export type { AuthUser };