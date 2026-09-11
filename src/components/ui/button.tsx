import { Pressable, PressableProps, StyleSheet, Text } from 'react-native';

import { useThemeColors } from '@/lib/theme';

type ButtonVariant = 'default' | 'link';

interface ButtonProps extends PressableProps {
  variant?: ButtonVariant;
  children: React.ReactNode;
}

export function Button({
  variant = 'default',
  disabled,
  style,
  ...props
}: ButtonProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={(state) => [
        styles.base,
        variant === 'default' && {
          borderColor: colors.buttonBackground,
          backgroundColor: colors.buttonBackground,
        },
        variant === 'link' && styles.link,
        disabled && styles.disabled,
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      <Text
        style={[
          styles.text,
          variant === 'default' && { color: colors.buttonText },
          variant === 'link' && { color: colors.tint, textDecorationLine: 'underline' },
          disabled && { color: colors.disabledText },
        ]}
      >
        {props.children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 40,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    height: undefined,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
  },
});
