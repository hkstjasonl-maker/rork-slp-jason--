import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
  Image,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useAudioPlayer } from 'expo-audio';
import { Check, Star, Flame, Volume2, VolumeX } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ScaledText } from '@/components/ScaledText';
import { useApp } from '@/contexts/AppContext';
import { encouragements } from '@/constants/i18n';
import Colors from '@/constants/colors';
import { JASON_CARTOON } from '@/constants/images';
import { log } from '@/lib/logger';

interface EncouragementModalProps {
  visible: boolean;
  onContinue: () => void;
  hasNext: boolean;
  starsEarned?: number;
  streakDays?: number;
  isAllComplete?: boolean;
  isHalfComplete?: boolean;
  reinforcementAudioUrl?: string | null;
  reinforcementAudioId?: string | null;
}

function HiddenYouTubeAudio({ videoId, muted }: { videoId: string; muted: boolean }) {
  const muteParam = muted ? 1 : 0;

  if (Platform.OS === 'web') {
    return (
      <View style={styles.hiddenAudio}>
        {/* @ts-ignore - iframe is valid on web */}
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${muteParam}&loop=1&playlist=${videoId}&controls=0&showinfo=0&rel=0&modestbranding=1`}
          style={{ width: 1, height: 1, border: 'none', opacity: 0 }}
          allow="autoplay; encrypted-media"
        />
      </View>
    );
  }

  const html = `
<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>*{margin:0;padding:0;}html,body{width:1px;height:1px;overflow:hidden;background:transparent;}</style>
</head><body>
<iframe width="1" height="1" src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${muteParam}&loop=1&playlist=${videoId}&controls=0&showinfo=0&rel=0&modestbranding=1"
  allow="autoplay; encrypted-media" frameborder="0"></iframe>
</body></html>`;

  return (
    <View style={styles.hiddenAudio}>
      <WebView
        source={{ html }}
        style={{ width: 1, height: 1, opacity: 0 }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
      />
    </View>
  );
}

function StarRow({ count }: { count: number }) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push(
      <Animated.View key={i} style={styles.starIcon}>
        <Star size={28} color="#FFB800" fill="#FFB800" />
      </Animated.View>
    );
  }
  return <View style={styles.starsRow}>{stars}</View>;
}

function EncouragementModalInner({
  visible,
  onContinue,
  hasNext,
  starsEarned = 0,
  streakDays = 0,
  isAllComplete = false,
  isHalfComplete = false,
  reinforcementAudioUrl,
  reinforcementAudioId,
}: EncouragementModalProps) {
  const { t, language } = useApp();
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const [showAudio, setShowAudio] = useState<boolean>(false);
  const [useUrlAudio, setUseUrlAudio] = useState<boolean>(false);

  const audioPlayer = useAudioPlayer(
    useUrlAudio && reinforcementAudioUrl ? { uri: reinforcementAudioUrl } : null
  );

  useEffect(() => {
    if (visible && (reinforcementAudioUrl || reinforcementAudioId)) {
      if (reinforcementAudioUrl) {
        log('[EncouragementModal] Starting Expo Audio playback:', reinforcementAudioUrl);
        setUseUrlAudio(true);
        setShowAudio(true);
        setAudioMuted(false);
      } else if (reinforcementAudioId) {
        log('[EncouragementModal] Falling back to YouTube audio:', reinforcementAudioId);
        setUseUrlAudio(false);
        setShowAudio(true);
        setAudioMuted(false);
      }
    } else {
      setShowAudio(false);
      setUseUrlAudio(false);
    }
  }, [visible, reinforcementAudioUrl, reinforcementAudioId]);

  useEffect(() => {
    if (visible && useUrlAudio && audioPlayer && reinforcementAudioUrl) {
      try {
        audioPlayer.seekTo(0);
        audioPlayer.play();
        log('[EncouragementModal] Expo Audio play started');
      } catch (e) {
        log('[EncouragementModal] Expo Audio play error:', e);
      }
    }
    if (!visible && audioPlayer) {
      try {
        audioPlayer.pause();
      } catch (err) {
        log('[EncouragementModal] pause error on hide:', err);
      }
    }
  }, [visible, useUrlAudio, audioPlayer, reinforcementAudioUrl]);

  useEffect(() => {
    if (useUrlAudio && audioPlayer) {
      audioPlayer.muted = audioMuted;
    }
  }, [audioMuted, useUrlAudio, audioPlayer]);

  const handleContinue = useCallback(() => {
    setShowAudio(false);
    if (useUrlAudio && audioPlayer) {
      try { audioPlayer.pause(); } catch (err) { log('[EncouragementModal] pause error on continue:', err); }
    }
    setUseUrlAudio(false);
    onContinue();
  }, [onContinue, useUrlAudio, audioPlayer]);

  const toggleMute = useCallback(() => {
    setAudioMuted((prev) => !prev);
  }, []);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const starsSlideAnim = useRef(new Animated.Value(30)).current;
  const starsFadeAnim = useRef(new Animated.Value(0)).current;

  const lang = language || 'en';
  const messages = encouragements[lang];
  const randomMessage = useMemo(
    () => messages[Math.floor(Math.random() * messages.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, messages]
  );

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0);
      fadeAnim.setValue(0);
      pulseAnim.setValue(1);
      starsSlideAnim.setValue(30);
      starsFadeAnim.setValue(0);

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 40,
          friction: 5,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.05,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 800,
              useNativeDriver: true,
            }),
          ])
        ).start();

        if (starsEarned > 0) {
          Animated.parallel([
            Animated.spring(starsSlideAnim, {
              toValue: 0,
              tension: 50,
              friction: 8,
              useNativeDriver: true,
            }),
            Animated.timing(starsFadeAnim, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
          ]).start();
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const starMessage = useMemo(() => {
    if (isAllComplete) return t('allExercisesStar');
    if (isHalfComplete) return t('halfExercisesStar');
    return '';
  }, [isAllComplete, isHalfComplete, t]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
          <Animated.View
            style={[
              styles.avatarContainer,
              { transform: [{ scale: Animated.multiply(scaleAnim, pulseAnim) }] },
            ]}
          >
            <Image source={JASON_CARTOON} style={styles.avatarImage} />
            <View style={styles.checkBadge}>
              <Check size={16} color={Colors.white} strokeWidth={3} />
            </View>
          </Animated.View>

          <ScaledText size={24} weight="bold" color={Colors.textPrimary} style={styles.title}>
            {t('encouragementTitle')}
          </ScaledText>

          <ScaledText size={18} color={Colors.textSecondary} style={styles.message}>
            {randomMessage}
          </ScaledText>

          {starsEarned > 0 && (
            <Animated.View
              style={[
                styles.starsContainer,
                {
                  opacity: starsFadeAnim,
                  transform: [{ translateY: starsSlideAnim }],
                },
              ]}
            >
              <View style={styles.starsBadge}>
                <StarRow count={starsEarned} />
                {starMessage ? (
                  <ScaledText size={14} weight="600" color="#B8860B" style={styles.starLabel}>
                    {starMessage}
                  </ScaledText>
                ) : null}
              </View>
            </Animated.View>
          )}

          {streakDays >= 3 && (
            <View style={styles.streakBadge}>
              <Flame size={18} color="#FF6B35" />
              <ScaledText size={14} weight="600" color="#FF6B35">
                {streakDays} {t('dayStreak')}
              </ScaledText>
              {streakDays >= 7 && streakDays % 7 === 0 ? (
                <ScaledText size={12} color="#FF6B35">
                  +2 ⭐
                </ScaledText>
              ) : streakDays >= 3 && streakDays % 3 === 0 ? (
                <ScaledText size={12} color="#FF6B35">
                  +1 ⭐
                </ScaledText>
              ) : null}
            </View>
          )}

          {showAudio && (reinforcementAudioUrl || reinforcementAudioId) && (
            <TouchableOpacity
              style={styles.muteButton}
              onPress={toggleMute}
              activeOpacity={0.7}
              testID="audio-toggle-button"
            >
              {audioMuted ? (
                <VolumeX size={18} color={Colors.textSecondary} />
              ) : (
                <Volume2 size={18} color={Colors.primary} />
              )}
              <ScaledText size={12} color={audioMuted ? Colors.textSecondary : Colors.primary} weight="600">
                {audioMuted ? t('audioOff') : t('audioOn')}
              </ScaledText>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <ScaledText size={18} weight="600" color={Colors.white}>
              {hasNext ? t('nextExercise') : t('backToHome')}
            </ScaledText>
          </TouchableOpacity>
        </Animated.View>

        {showAudio && !useUrlAudio && reinforcementAudioId && (
          <HiddenYouTubeAudio videoId={reinforcementAudioId} muted={audioMuted} />
        )}
      </View>
    </Modal>
  );
}

export const EncouragementModal = React.memo(EncouragementModalInner);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  avatarContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: 24,
    position: 'relative' as const,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: Colors.success,
  },
  checkBadge: {
    position: 'absolute' as const,
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  title: {
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 26,
  },
  starsContainer: {
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  starsBadge: {
    backgroundColor: '#FFF8E1',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFE082',
    width: '100%',
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 6,
  },
  starIcon: {},
  starLabel: {
    textAlign: 'center',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFCC80',
  },
  continueButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
  },
  muteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  hiddenAudio: {
    position: 'absolute' as const,
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden' as const,
    top: -9999,
    left: -9999,
  },
});
