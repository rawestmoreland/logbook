import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useThemeColors } from '@/lib/theme';

type FormRowProps = {
  label: string;
  value?: ReactNode;
  placeholder?: string;
  onPress?: () => void;
  chevron?: boolean;
  error?: string;
  children?: ReactNode;
};

/** Label-above-value row used throughout the new-flight form, e.g. "Date" /
 * "12 Sep 2026". Tappable rows (aircraft, route) navigate elsewhere;
 * non-pressable rows (date, block times) render an inline input as
 * `children` instead. */
export function FormRow({
  label,
  value,
  placeholder,
  onPress,
  chevron,
  error,
  children,
}: FormRowProps) {
  const colors = useThemeColors();

  const content = (
    <>
      <View style={styles.main}>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        {children ?? (
          <ThemedText
            type="default"
            themeColor={value ? 'text' : 'textSecondary'}
            style={styles.value}
          >
            {value || placeholder}
          </ThemedText>
        )}
        {!!error && (
          <ThemedText type="small" style={{ color: '#dc2626' }}>
            {error}
          </ThemedText>
        )}
      </View>
      {chevron && (
        <ThemedText themeColor="textSecondary" style={styles.chevron}>
          {'›'}
        </ThemedText>
      )}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: colors.border },
          pressed && styles.pressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.6,
  },
  main: {
    flex: 1,
    gap: Spacing.half,
  },
  value: {
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
  },
});
