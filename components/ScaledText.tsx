import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { useApp } from '@/contexts/AppContext';

interface ScaledTextProps extends TextProps {
  size?: number;
  color?: string;
  weight?: 'normal' | 'bold' | '500' | '600' | '700';
}

function ScaledTextInner({ size = 16, color, weight, style, ...props }: ScaledTextProps) {
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

export const ScaledText = React.memo(ScaledTextInner);

export function useScaledSize(baseSize: number): number {
  const { fontScale } = useApp();
  return Math.round(baseSize * fontScale);
}
