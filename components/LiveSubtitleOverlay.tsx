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
  forceOverlay?: boolean;
}

export default function LiveSubtitleOverlay({
  subtitleUrl,
  isPlaying,
  audioCurrentTime,
  visible,
  subtitleSizeLevel = 'medium',
  forceOverlay = false,
}: LiveSubtitleOverlayProps) {
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [currentText, setCurrentText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<boolean>(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const prevTextRef = useRef<string | null>(null);
  const fetchedUrlRef = useRef<string | null>(null);

  const fontSize = SUBTITLE_FONT_SIZES[subtitleSizeLevel] || 22;
  const lineHeight = Math.round(fontSize * 1.4);
  const paddingV = subtitleSizeLevel === 'extraLarge' ? 16 : subtitleSizeLevel === 'large' ? 14 : 10;
  const paddingH = subtitleSizeLevel === 'extraLarge' ? 24 : subtitleSizeLevel === 'large' ? 22 : 18;

  useEffect(() => {
    if (!subtitleUrl) {
      console.log('[LiveSubtitle] No subtitle URL provided');
      setCues([]);
      setLoadError(false);
      setIsLoading(false);
      fetchedUrlRef.current = null;
      return;
    }

    if (fetchedUrlRef.current === subtitleUrl && cues.length > 0) {
      console.log('[LiveSubtitle] Already fetched URL:', subtitleUrl, 'cues:', cues.length);
      return;
    }

    let cancelled = false;

    const loadSubtitles = async () => {
      try {
        console.log('[LiveSubtitle] Fetching subtitle from:', subtitleUrl);
        setIsLoading(true);
        setLoadError(false);
        const response = await fetch(subtitleUrl);
        if (!response.ok) {
          console.warn('[LiveSubtitle] Subtitle fetch failed:', response.status, subtitleUrl);
          if (!cancelled) {
            setCues([]);
            setLoadError(true);
            setIsLoading(false);
          }
          return;
        }
        const text = await response.text();
        console.log('[LiveSubtitle] Fetched text length:', text.length, 'first 200 chars:', text.substring(0, 200));
        if (!cancelled) {
          const parsed = parseVTT(text);
          console.log('[LiveSubtitle] Parsed', parsed.length, 'subtitle cues');
          if (parsed.length > 0) {
            console.log('[LiveSubtitle] First cue:', JSON.stringify(parsed[0]));
            console.log('[LiveSubtitle] Last cue:', JSON.stringify(parsed[parsed.length - 1]));
          }
          setCues(parsed);
          fetchedUrlRef.current = subtitleUrl;
          setLoadError(false);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('[LiveSubtitle] Subtitle load error:', err);
        if (!cancelled) {
          setCues([]);
          setLoadError(true);
          setIsLoading(false);
        }
      }
    };

    void loadSubtitles();

    return () => {
      cancelled = true;
    };
  }, [subtitleUrl, cues.length]);

  useEffect(() => {
    if (!isPlaying || cues.length === 0) {
      if (currentText !== null) {
        console.log('[LiveSubtitle] Clearing text: isPlaying=', isPlaying, 'cues=', cues.length);
      }
      setCurrentText(null);
      return;
    }

    const cue = getCurrentCue(cues, audioCurrentTime);
    const newText = cue ? cue.text : null;

    if (newText !== currentText) {
      console.log('[LiveSubtitle] time=', audioCurrentTime.toFixed(2), 'cue=', newText ? newText.substring(0, 40) : 'none', 'totalCues=', cues.length);
    }
    setCurrentText(newText);
  }, [isPlaying, audioCurrentTime, cues, currentText]);

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

  if (!visible) {
    return null;
  }

  const containerStyle = forceOverlay ? styles.forceOverlayContainer : styles.container;

  if (isLoading) {
    return (
      <View style={containerStyle} pointerEvents="none">
        <View style={[styles.banner, styles.statusBanner, { paddingVertical: 8, paddingHorizontal: 14 }]}>
          <ScaledText size={14} weight="600" color="#FFFFFF" style={styles.text}>
            {'⏳ Loading subtitles...'}
          </ScaledText>
        </View>
      </View>
    );
  }

  if (loadError) {
    return null;
  }

  if (isPlaying && currentText === null && cues.length > 0) {
    return (
      <View style={containerStyle} pointerEvents="none">
        <Animated.View style={[styles.banner, styles.statusBanner, { opacity: 0.7, paddingVertical: 8, paddingHorizontal: 14 }]}>
          <ScaledText size={14} weight="600" color="#FFFFFF" style={styles.text}>
            {'🔊 ...'}
          </ScaledText>
        </Animated.View>
      </View>
    );
  }

  if (currentText === null) {
    return null;
  }

  return (
    <View style={containerStyle} pointerEvents="none">
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
    zIndex: 9999,
  },
  forceOverlayContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 90,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 9999,
    elevation: 9999,
  },
  banner: {
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 14,
    maxWidth: '96%',
    minWidth: '50%',
  },
  statusBanner: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    minWidth: 'auto' as unknown as number,
  },
  text: {
    textAlign: 'center' as const,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
});
