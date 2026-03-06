import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface RecordingWatermarkProps {
  exerciseName: string;
  visible: boolean;
}

function RecordingWatermarkInner({ exerciseName, visible }: RecordingWatermarkProps) {
  const watermarkText = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${exerciseName} · ${yyyy}-${mm}-${dd}`;
  }, [exerciseName]);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Text style={styles.watermarkText}>{watermarkText}</Text>
    </View>
  );
}

export const RecordingWatermark = React.memo(RecordingWatermarkInner);

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 20,
  },
  watermarkText: {
    color: 'rgba(255, 255, 255, 0.25)',
    fontSize: 12,
    fontWeight: '500' as const,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
