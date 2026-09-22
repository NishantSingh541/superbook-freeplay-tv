/**
 * Wraps a promise with a hard timeout. If the underlying network call
 * hangs indefinitely (dead connection, silently dropped request — common
 * on unstable/emulator networking) instead of erroring, this forces a
 * rejection after `ms` so callers can surface a clean error state rather
 * than leaving the UI stuck on a spinner forever.
 */
export class TimeoutHelper {
  static async withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }
}
