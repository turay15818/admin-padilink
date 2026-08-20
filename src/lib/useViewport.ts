import { useCallback, useSyncExternalStore } from 'react';

/**
 * Is the window narrower than `maxWidth`?
 *
 * This console has no stylesheet on purpose - every colour comes from the theme so light and
 * dark cannot drift - which leaves nowhere to put a media query. So the few places that need
 * to change shape ask here instead.
 *
 * useSyncExternalStore rather than useState with a resize listener: matchMedia IS an external
 * store, and subscribing to it directly means no re-render on every pixel of a drag, and no
 * mismatch on the first paint. The server snapshot answers "not narrow", which is the layout a
 * console is designed for and the one that degrades most gracefully if it is wrong for a
 * moment.
 */
export function useIsNarrow(maxWidth: number): boolean {
  const subscribe = useCallback((notify: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return () => {};
    }

    const query = window.matchMedia(`(max-width: ${maxWidth}px)`);
    query.addEventListener('change', notify);
    return () => query.removeEventListener('change', notify);
  }, [maxWidth]);

  const snapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }

    return window.matchMedia(`(max-width: ${maxWidth}px)`).matches;
  }, [maxWidth]);

  return useSyncExternalStore(subscribe, snapshot, () => false);
}
