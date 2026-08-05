/**
 * Shared 1 Hz "now" source for ticking labels and countdowns.
 *
 * Status renders several independent per-second widgets (next-tick
 * countdown, "updated Xs ago" ages, refresh countdowns, the
 * next-action progress bar). Each used to own a setInterval + local
 * state, so the page paid one timer wakeup and one isolated render
 * per widget per second, spread across the second. One shared
 * interval means one wakeup, and all subscribers re-render in the
 * same React batch.
 */

import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let currentNow = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    currentNow = Date.now();
    timer = setInterval(() => {
      currentNow = Date.now();
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const NOOP_SUBSCRIBE = () => () => {};

function getNow(): number {
  return currentNow;
}

/**
 * Subscribe to the shared once-per-second tick. Returns the shared
 * "now" timestamp (ms). Pass `enabled: false` to opt out without
 * violating the rules of hooks - the component then reads the last
 * shared value but never re-renders on ticks.
 */
export function useNowSecond(enabled = true): number {
  return useSyncExternalStore(enabled ? subscribe : NOOP_SUBSCRIBE, getNow, getNow);
}
