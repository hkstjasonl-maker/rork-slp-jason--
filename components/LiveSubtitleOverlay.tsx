import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { ScaledText } from '@/components/ScaledText';
import { parseVTT, getCurrentCue } from '@/utils/vttParser';
import type { SubtitleCue } from '@/utils/vttParser';
import { SUBTITLE_FONT_SIZES, SubtitleSizeLevel } from '@/types';

interface LiveSubtitleOverlayProps {
  subtitleUrl: string | null;
  isPlaying: boolean;
  audioCurrentTime: number;
  visible: boolean;
  subtitleSizeLevel?: SubtitleSizeLevel;
}

export default function LiveSubtitleOverlay({
  subtitleUrl,
  isPlaying,
  audioCurrentTime,
  visible,
  subtitleSizeLevel = 'medium',
}: LiveSubtitleOverlayProps) {
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [currentText, setCurrentText] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const prevTextRef = useRef<string | null>(null);

  const fontSize = SUBTITLE_FONT_SIZES[subtitleSizeLevel] || 22;
  const lineHeight = Math.round(fontSize * 1.4);
  const paddingV = subtitleSizeLevel === 'extraLarge' ? 16 : subtitleSizeLevel === 'large' ? 14 : 10;
  const paddingH = subtitleSizeLevel === 'extraLarge' ? 24 : subtitleSizeLevel === 'large' ? 22 : 18;

  useEffect(() => {
    if (!subtitleUrl) {
      setCues([]);
      return;
    }

    let cancelled = false;

    const loadSubtitles = async () => {
      try {
        console.log('[LiveSubtitle] Fetching subtitle from:', subtitleUrl);
        const response = await fetch(subtitleUrl);
        if (!response.ok) {
          console.warn('[LiveSubtitle] Subtitle fetch failed:', response.status, subtitleUrl);
          if (!cancelled) setCues([]);
          return;
        }
        const text = await response.text();
        if (!cancelled) {
          const parsed = parseVTT(text);
          console.log('[LiveSubtitle] Parsed', parsed.length, 'subtitle cues');
          setCues(parsed);
        }
      } catch (err) {
        console.warn('[LiveSubtitle] Subtitle load error:', err);
        if (!cancelled) setCues([]);
      }
    };

    void loadSubtitles();

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
    const newText = cue ? cue.text : null;
    console.log('[LiveSubtitle] time=', audioCurrentTime.toFixed(2), 'cue=', newText ? newText.substring(0, 30) : 'none');
    setCurrentText(newText);
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
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 120,
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
      <Animated.View style={[styles.banner, { opacity: fadeAnim, paddingVertical: paddingV, paddingHorizontal: paddingH }]}>
        <ScaledText
          size={fontSize}
          weight="700"
          color="#FFFFFF"
          style={[styles.text, { lineHeight }]}
        >
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
    bottom: 100,
    alignItems: 'center',
    paddingHorizontal: 12,
    zIndex: 10,
  },
  banner: {
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 14,
    maxWidth: '96%' as const,
    minWidth: '50%' as const,
  },
  text: {
    textAlign: 'center' as const,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
});
