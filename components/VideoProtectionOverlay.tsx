import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, PanResponder, GestureResponderEvent } from 'react-native';

interface VideoProtectionOverlayProps {
  patientName: string;
  children: React.ReactNode;
  height?: number;
}

const pinchBlockerPanResponder = PanResponder.create({
  onStartShouldSetPanResponderCapture: (e: GestureResponderEvent) =>
    (e.nativeEvent.touches?.length ?? 0) >= 2,
  onMoveShouldSetPanResponderCapture: (e: GestureResponderEvent) =>
    (e.nativeEvent.touches?.length ?? 0) >= 2,
  onPanResponderGrant: () => {},
  onPanResponderMove: () => {},
  onPanResponderRelease: () => {},
  onPanResponderTerminate: () => {},
});

function VideoProtectionOverlayInner({ patientName, children, height }: VideoProtectionOverlayProps) {
  const panResponder = useRef(pinchBlockerPanResponder).current;

  const watermarkText = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${patientName} · ${yyyy}-${mm}-${dd}`;
  }, [patientName]);

  return (
    <View style={[styles.wrapper, height ? { height } : undefined]} {...panResponder.panHandlers}>
      {children}
      <View style={styles.overlay} pointerEvents="none">
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
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    borderRadius: 12,
    overflow: 'hidden',
  },
  watermarkBox: {
    position: 'absolute' as const,
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  watermarkText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 10,
    fontWeight: '600' as const,
    letterSpacing: 0.3,
  },
});
