import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface VideoWatermarkProps {
  patientName: string;
  height: number;
}

function VideoWatermarkInner({ patientName, height }: VideoWatermarkProps) {
  const watermarkText = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${patientName} · ${yyyy}-${mm}-${dd}`;
  }, [patientName]);

  return (
    <View style={[styles.overlay, { height }]} pointerEvents="none">
      <Text style={styles.watermarkText}>{watermarkText}</Text>
    </View>
  );
}

export const VideoWatermark = React.memo(VideoWatermarkInner);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 12,
    zIndex: 10,
  },
  watermarkText: {
    position: 'absolute',
    top: 32,
    left: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
    overflow: 'hidden',
  },
});
