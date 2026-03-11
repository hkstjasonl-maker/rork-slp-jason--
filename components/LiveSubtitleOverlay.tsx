import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { ScaledText } from '@/components/ScaledText';
import { parseVTT, getCurrentCue } from '@/utils/vttParser';
import type { SubtitleCue } from '@/utils/vttParser';

interface LiveSubtitleOverlayProps {
  subtitleUrl: string | null;
  isPlaying: boolean;
  audioCurrentTime: number;
  visible: boolean;
}

export default function LiveSubtitleOverlay({
  subtitleUrl,
  isPlaying,
  audioCurrentTime,
  visible,
}: LiveSubtitleOverlayProps) {
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [currentText, setCurrentText] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const prevTextRef = useRef<string | null>(null);

  useEffect(() => {
    if (!subtitleUrl) {
      setCues([]);
      return;
    }

    let cancelled = false;

    const fetchVTT = async () => {
      try {
        console.log('[LiveSubtitleOverlay] Fetching VTT from:', subtitleUrl);
        const response = await fetch(subtitleUrl);
        const text = await response.text();
        if (!cancelled) {
          const parsed = parseVTT(text);
          console.log('[LiveSubtitleOverlay] Parsed', parsed.length, 'cues');
          setCues(parsed);
        }
      } catch (err) {
        console.error('[LiveSubtitleOverlay] Failed to fetch VTT:', err);
        if (!cancelled) {
          setCues([]);
        }
      }
    };

    void fetchVTT();

    return () => {
      cancelled = true;
    };
  }, [subtitleUrl]);

  useEffect(() => {
    if (!isPlaying || cues.length === 0) {
      setCurrentText(null);
      return;
    }

    const cue = getCurrentCue(cues, audioCurrentTime);
    setCurrentText(cue ? cue.text : null);
  }, [isPlaying, audioCurrentTime, cues]);

  const animateTransition = useCallback(
    (show: boolean) => {
      Animated.timing(fadeAnim, {
        toValue: show ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    },
    [fadeAnim],
  );

  useEffect(() => {
    const shouldShow = visible && currentText !== null;

    if (shouldShow && currentText !== prevTextRef.current) {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (!shouldShow) {
      animateTransition(false);
    } else if (shouldShow && prevTextRef.current === null) {
      animateTransition(true);
    }

    prevTextRef.current = currentText;
  }, [currentText, visible, fadeAnim, animateTransition]);

  if (!visible || currentText === null) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[styles.banner, { opacity: fadeAnim }]}>
        <ScaledText size={18} weight="700" color="#FFFFFF" style={styles.text}>
          {currentText}
        </ScaledText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 60,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  banner: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    maxWidth: '95%' as const,
  },
  text: {
    textAlign: 'center' as const,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    lineHeight: 24,
  },
});
