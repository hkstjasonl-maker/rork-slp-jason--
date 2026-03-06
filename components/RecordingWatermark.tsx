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
      <Text style={styles.disclaimerText}>Recorded with SLP Jason 使用SLP Jason錄製</Text>
    </View>
  );
}

export const RecordingWatermark = React.memo(RecordingWatermarkInner);

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 32,
    left: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    zIndex: 20,
  },
  watermarkText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  disclaimerText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '500' as const,
    opacity: 0.85,
    marginTop: 2,
  },
});
