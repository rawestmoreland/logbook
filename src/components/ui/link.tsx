import { Link as BaseLink, LinkProps } from 'expo-router';
import { StyleSheet } from 'react-native';

import { useThemeColors } from '@/lib/theme';

export function Link({ style, ...props }: LinkProps) {
  const colors = useThemeColors();

  return (
    <BaseLink {...props} style={[styles.link, { color: colors.tint }, style]} />
  );
}

const styles = StyleSheet.create({
  link: {
    textDecorationLine: 'underline',
  },
});
