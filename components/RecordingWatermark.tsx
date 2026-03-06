import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface RecordingWatermarkProps {
  exerciseName: string;
  visible: boolean;
}

function RecordingWatermarkInner({ exerciseName, visible }: RecordingWatermarkProps) {
  const dateStr = useMemo(() => {
    if (!visible) return '';
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.watermarkBox}>
        <Text style={styles.line1}>Recorded with SLP Jason 言語治療師黎頌謙</Text>
        <Text style={styles.line2}>{exerciseName}</Text>
        <Text style={styles.line3}>{dateStr}</Text>
      </View>
    </View>
  );
}

export const RecordingWatermark = React.memo(RecordingWatermarkInner);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    zIndex: 20,
  },
  watermarkBox: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    opacity: 0.85,
  },
  line1: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600' as const,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  line2: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700' as const,
    marginTop: 2,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  line3: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600' as const,
    marginTop: 2,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    opacity: 0.9,
  },
});
