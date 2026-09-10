import PocketBase from 'pocketbase';

// Set EXPO_PUBLIC_POCKETBASE_URL in a .env file (Expo inlines EXPO_PUBLIC_*
// vars at build time). Falls back to a local dev instance.
export const pb = new PocketBase(
  process.env.EXPO_PUBLIC_POCKETBASE_URL ?? 'http://127.0.0.1:8090'
);
