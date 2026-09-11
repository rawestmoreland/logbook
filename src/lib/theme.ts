import { useColorScheme } from 'react-native';

export const Colors = {
  light: {
    text: '#111827',
    placeholder: '#9ca3af',
    border: '#d1d5db',
    background: '#ffffff',
    buttonBackground: '#111827',
    buttonText: '#ffffff',
    tint: '#2563eb',
    disabledText: '#9ca3af',
  },
  dark: {
    text: '#f9fafb',
    placeholder: '#6b7280',
    border: '#374151',
    background: '#1f2937',
    buttonBackground: '#f9fafb',
    buttonText: '#111827',
    tint: '#60a5fa',
    disabledText: '#6b7280',
  },
};

export function useThemeColors() {
  const colorScheme = useColorScheme();
  return Colors[colorScheme === 'dark' ? 'dark' : 'light'];
}
