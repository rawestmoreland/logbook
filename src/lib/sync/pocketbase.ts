import AsyncStorage from '@react-native-async-storage/async-storage';
import PocketBase, { AsyncAuthStore } from 'pocketbase';

import EventSource from 'react-native-sse';

// @ts-ignore
global.EventSource = EventSource;

// `initial` is read lazily (rather than calling AsyncStorage.getItem at
// module scope) because Expo web's static output prerenders route modules
// in Node during `expo export`, where there's no browser storage to read.
const store = new AsyncAuthStore({
  save: async (serialized) => AsyncStorage.setItem('pb_auth', serialized),
  initial:
    typeof window !== 'undefined' ? AsyncStorage.getItem('pb_auth') : undefined,
});

// Set EXPO_PUBLIC_POCKETBASE_URL in a .env file (Expo inlines EXPO_PUBLIC_*
// vars at build time). Falls back to a local dev instance.
export const pb = new PocketBase(
  process.env.EXPO_PUBLIC_POCKETBASE_URL ?? 'http://127.0.0.1:8090',
  store,
);
