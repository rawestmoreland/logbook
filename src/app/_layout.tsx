import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { SessionProvider, useSession } from '@/contexts/auth-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <AnimatedSplashOverlay />
          <RootNavigator />
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { isValid } = useSession();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isValid}>
        <Stack.Screen name='(app)' />
      </Stack.Protected>

      <Stack.Protected guard={!isValid}>
        <Stack.Screen name='sign-in' />
        <Stack.Screen name='sign-up' />
      </Stack.Protected>
    </Stack>
  );
}
