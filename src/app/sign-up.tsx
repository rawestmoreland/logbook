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

export default function SignUpScreen() {
  const { signUp } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  const handleSignUp = async () => {
    setFieldErrors({});
    setFormError('');
    try {
      await signUp(email, password, passwordConfirm);
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
        <ThemedText>Sign up</ThemedText>
        <ThemedView style={styles.formContainer}>
          <Input
            onChangeText={setEmail}
            value={email}
            keyboardType='email-address'
          />
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
          <Input
            onChangeText={setPasswordConfirm}
            value={passwordConfirm}
            secureTextEntry
          />
          {fieldErrors.passwordConfirm && (
            <ThemedText style={{ color: 'red' }}>
              {fieldErrors.passwordConfirm}
            </ThemedText>
          )}
          {!!formError && (
            <ThemedText style={{ color: 'red' }}>{formError}</ThemedText>
          )}
          <Button onPress={handleSignUp}>Submit</Button>
        </ThemedView>
        <Link href='/sign-in'>Sign in</Link>
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
