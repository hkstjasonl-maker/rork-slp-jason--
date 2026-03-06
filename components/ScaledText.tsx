import React from 'react';
import { Text, TextProps } from 'react-native';
import { useApp } from '@/contexts/AppContext';

interface ScaledTextProps extends TextProps {
  size?: number;
  color?: string;
  weight?: 'normal' | 'bold' | '500' | '600' | '700';
}

export function ScaledText({ size = 16, color, weight, style, ...props }: ScaledTextProps) {
  const { fontScale } = useApp();
  const scaledSize = Math.round(size * fontScale);

  return (
    <Text
      style={[
        { fontSize: scaledSize },
        color ? { color } : undefined,
        weight ? { fontWeight: weight } : undefined,
        style,
      ]}
      {...props}
    />
  );
}

export function useScaledSize(baseSize: number): number {
  const { fontScale } = useApp();
  return Math.round(baseSize * fontScale);
}
