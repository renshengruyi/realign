import { useEffect, useRef, useState } from 'preact/hooks';

/** Re-renders every `ms` while `active`. */
export function useTick(active: boolean, ms = 250): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return n;
}

/**
 * A pausable stopwatch driven by timestamps, so it stays right when the tab
 * sleeps in the background.
 */
export function useStopwatch() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [pausedTotal, setPausedTotal] = useState(0);
  useTick(startedAt !== null && pausedAt === null, 250);
  const now = Date.now();
  const elapsedMs = startedAt === null ? 0 : (pausedAt ?? now) - startedAt - pausedTotal;
  return {
    running: startedAt !== null && pausedAt === null,
    started: startedAt !== null,
    paused: pausedAt !== null,
    elapsed: Math.max(0, elapsedMs / 1000),
    startedAt,
    start() {
      setStartedAt(Date.now());
      setPausedAt(null);
      setPausedTotal(0);
    },
    pause() {
      if (startedAt !== null && pausedAt === null) setPausedAt(Date.now());
    },
    resume() {
      if (pausedAt !== null) {
        setPausedTotal((p) => p + (Date.now() - pausedAt));
        setPausedAt(null);
      }
    },
    reset() {
      setStartedAt(null);
      setPausedAt(null);
      setPausedTotal(0);
    },
  };
}

/** Calls `fn` once when `cond` turns true. */
export function useOnce(cond: boolean, fn: () => void) {
  const fired = useRef(false);
  useEffect(() => {
    if (cond && !fired.current) {
      fired.current = true;
      fn();
    }
    if (!cond) fired.current = false;
  }, [cond]);
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
