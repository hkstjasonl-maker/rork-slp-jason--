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
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    paddingTop: 12,
    paddingLeft: 12,
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
