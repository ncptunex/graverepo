// In-flight deduplication (task 8.3, design 4.7; Req 7.12, 7.13, D21).
// Identical requests that run at the same time share one network request. A caller that
// cancels stops receiving the result, but the shared request keeps running for the others.

export type SharedOutcome<T> =
  | { readonly cancelled: true }
  | { readonly cancelled: false; readonly value: T };

export type InFlight = {
  /**
   * Runs `start` once for all concurrent callers with the same key and gives each caller the
   * result. A caller whose signal aborts gets `cancelled: true` and never the result.
   * `start` must not depend on any one caller's signal.
   */
  run<T>(key: string, start: () => Promise<T>, signal?: AbortSignal): Promise<SharedOutcome<T>>;
  /** Number of requests currently running. */
  size(): number;
};

export function createInFlight(): InFlight {
  const running = new Map<string, Promise<unknown>>();

  return {
    run<T>(key: string, start: () => Promise<T>, signal?: AbortSignal): Promise<SharedOutcome<T>> {
      // A caller that has already cancelled never starts or joins a request.
      if (signal?.aborted) return Promise.resolve({ cancelled: true });

      let shared = running.get(key) as Promise<T> | undefined;
      if (shared === undefined) {
        shared = Promise.resolve()
          .then(start)
          .finally(() => {
            running.delete(key);
          });
        running.set(key, shared);
      }
      const request = shared;

      return new Promise<SharedOutcome<T>>((resolve, reject) => {
        const onAbort = () => resolve({ cancelled: true });
        signal?.addEventListener('abort', onAbort, { once: true });
        request.then(
          (value) => {
            signal?.removeEventListener('abort', onAbort);
            resolve({ cancelled: false, value });
          },
          (error: unknown) => {
            signal?.removeEventListener('abort', onAbort);
            reject(error);
          },
        );
      });
    },

    size: () => running.size,
  };
}
