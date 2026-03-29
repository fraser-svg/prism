/**
 * Typed Result wrapper for all IPC communication.
 * Every IPC handler returns Result<T> — no raw throws across the boundary.
 * The renderer gets structured error info for user-friendly messages.
 */

export interface ResultOk<T> {
  ok: true;
  data: T;
}

export interface ResultErr {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type Result<T> = ResultOk<T> | ResultErr;

export function ok<T>(data: T): ResultOk<T> {
  return { ok: true, data };
}

export function err(code: string, message: string): ResultErr {
  return { ok: false, error: { code, message } };
}

/** Wrap an async operation into a Result, catching any thrown errors. */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  errorCode = "UNKNOWN_ERROR",
): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(errorCode, message);
  }
}
