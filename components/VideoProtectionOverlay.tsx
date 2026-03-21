import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface VideoProtectionOverlayProps {
  patientName: string;
  children: React.ReactNode;
  height?: number;
}

function VideoProtectionOverlayInner({ patientName, children, height }: VideoProtectionOverlayProps) {
  const watermarkText = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${patientName} · ${yyyy}-${mm}-${dd}`;
  }, [patientName]);

  return (
    <View style={[styles.wrapper, height ? { height } : undefined]}>
      {children}
      <View style={styles.watermarkContainer} pointerEvents="none">
        <View style={styles.watermarkBox}>
          <Text style={styles.watermarkText}>{watermarkText}</Text>
        </View>
      </View>
    </View>
  );
}

export const VideoProtectionOverlay = React.memo(VideoProtectionOverlayInner);

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative' as const,
    overflow: 'hidden',
    borderRadius: 12,
  },
  watermarkContainer: {
    position: 'absolute' as const,
    bottom: 0,
    right: 0,
    left: 0,
    alignItems: 'flex-end' as const,
    justifyContent: 'flex-end' as const,
    zIndex: 1000,
  },
  watermarkBox: {
    marginBottom: 10,
    marginRight: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  watermarkText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
