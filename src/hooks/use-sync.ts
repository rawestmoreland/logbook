import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { synchronizeWithPocketBase } from '@/lib/sync/sync';

/**
 * Triggers a WatermelonDB <-> PocketBase sync on mount and whenever the app
 * returns to the foreground. Only mount this within an authenticated subtree
 * (e.g. the (app) layout) — sync requires a valid PocketBase auth session.
 */
export function useSync() {
  // Guards against overlapping runs (mount + an immediate foreground event
  // firing back to back) — synchronize() isn't safe to call concurrently.
  const isSyncing = useRef(false);

  useEffect(() => {
    const runSync = async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      try {
        await synchronizeWithPocketBase();
      } catch (err) {
        // Offline-first: sync failures (e.g. no connection) shouldn't
        // surface as app errors — they'll retry on the next trigger.
        console.warn('Sync failed:', err);
      } finally {
        isSyncing.current = false;
      }
    };

    runSync();

    const subscription = AppState.addEventListener(
      'change',
      (nextState) => {
        if (nextState === 'active') {
          runSync();
        }
      },
    );

    return () => subscription.remove();
  }, []);
}
