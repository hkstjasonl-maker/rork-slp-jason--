import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Platform, PanResponder } from 'react-native';

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

  const multiTouchActive = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        if (evt.nativeEvent.touches && evt.nativeEvent.touches.length > 1) {
          multiTouchActive.current = true;
          return true;
        }
        return false;
      },
      onStartShouldSetPanResponderCapture: (evt) => {
        if (evt.nativeEvent.touches && evt.nativeEvent.touches.length > 1) {
          multiTouchActive.current = true;
          return true;
        }
        return false;
      },
      onMoveShouldSetPanResponder: (evt) => {
        if (evt.nativeEvent.touches && evt.nativeEvent.touches.length > 1) {
          multiTouchActive.current = true;
          return true;
        }
        return false;
      },
      onMoveShouldSetPanResponderCapture: (evt) => {
        if (evt.nativeEvent.touches && evt.nativeEvent.touches.length > 1) {
          multiTouchActive.current = true;
          return true;
        }
        return false;
      },
      onPanResponderGrant: () => {},
      onPanResponderMove: () => {},
      onPanResponderRelease: () => { multiTouchActive.current = false; },
      onPanResponderTerminate: () => { multiTouchActive.current = false; },
    })
  ).current;

  return (
    <View style={[styles.wrapper, height ? { height } : undefined]}>
      {children}
      <View
        style={styles.touchInterceptor}
        {...(Platform.OS !== 'web' ? panResponder.panHandlers : {})}
      >
        <View style={styles.watermarkContainer} pointerEvents="none">
          <View style={styles.watermarkBox}>
            <Text style={styles.watermarkText}>{watermarkText}</Text>
          </View>
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
  touchInterceptor: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    borderRadius: 12,
    ...(Platform.OS === 'web' ? {} : { elevation: 999 }),
  },
  watermarkContainer: {
    flex: 1,
    justifyContent: 'flex-end' as const,
    alignItems: 'flex-end' as const,
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
