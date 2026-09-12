import { Stack } from 'expo-router';

import { useSync } from '@/hooks/use-sync';

export default function AppLayout() {
  useSync();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name='(tabs)' />
      <Stack.Screen name='new-flight' options={{ presentation: 'modal' }} />
    </Stack>
  );
}
