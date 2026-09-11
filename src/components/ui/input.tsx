import { StyleSheet, TextInput, TextInputProps } from 'react-native';

import { useThemeColors } from '@/lib/theme';

export function Input({ style, ...props }: TextInputProps) {
  const colors = useThemeColors();

  return (
    <TextInput
      placeholderTextColor={colors.placeholder}
      {...props}
      style={[
        styles.input,
        {
          color: colors.text,
          borderColor: colors.border,
          backgroundColor: colors.background,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
});
