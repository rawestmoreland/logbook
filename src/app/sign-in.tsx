import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';
import { Link } from '@/components/ui/link';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { AuthError, useSession } from '@/contexts/auth-context';

import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignInScreen() {
  const { signIn } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  const handleSignIn = async () => {
    setFieldErrors({});
    setFormError('');
    try {
      await signIn(email, password);
    } catch (error) {
      if (error instanceof AuthError && error.fields) {
        setFieldErrors(error.fields);
      } else if (error instanceof AuthError) {
        setFormError(error.message);
      }
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText>Sign in</ThemedText>
        <ThemedView style={styles.formContainer}>
          <Input onChangeText={setEmail} value={email} />
          {fieldErrors.email && (
            <ThemedText style={{ color: 'red' }}>
              {fieldErrors.email}
            </ThemedText>
          )}
          <Input onChangeText={setPassword} value={password} secureTextEntry />
          {fieldErrors.password && (
            <ThemedText style={{ color: 'red' }}>
              {fieldErrors.password}
            </ThemedText>
          )}
          {!!formError && (
            <ThemedText style={{ color: 'red' }}>{formError}</ThemedText>
          )}
          <Button onPress={handleSignIn}>Submit</Button>
        </ThemedView>
        <Link href='/sign-up'>Sign up</Link>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  formContainer: {
    gap: Spacing.two,
  },
});
