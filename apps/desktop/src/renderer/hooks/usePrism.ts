import { useCallback, useEffect, useState } from "react";
import type { Result } from "../../shared/result";

/**
 * Hook to call a Prism IPC method and manage its loading/error/data state.
 * Automatically refreshes when workspace:changed events fire.
 */
export function usePrismQuery<T>(
  queryFn: () => Promise<Result<T>>,
  deps: unknown[] = [],
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await queryFn();
      if (result.ok) {
        setData(result.data);
      } else {
        setError(result.error.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Listen for external workspace changes (5-second poll from main process)
  useEffect(() => {
    const unsubscribe = window.prism.workspace.onChanged(() => {
      fetch();
    });
    return unsubscribe;
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
