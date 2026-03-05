import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  Image,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, CheckCircle, Clock, Repeat, AlertCircle, Tag, Camera, X, Maximize2, SplitSquareHorizontal, Headphones, VideoOff } from 'lucide-react-native';
import * as MediaLibrary from 'expo-media-library';
import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { VimeoPlayer } from '@/components/VimeoPlayer';
import { AudioInstructionPlayer } from '@/components/AudioInstructionPlayer';
import { EncouragementModal } from '@/components/EncouragementModal';
import { SelfRatingModal } from '@/components/SelfRatingModal';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import { VideoWatermark } from '@/components/VideoWatermark';
import { supabase } from '@/lib/supabase';
import { getStarsForSession, calculateStars } from '@/lib/stars';
import { getExerciseDosage } from '@/lib/dosage';
import Colors from '@/constants/colors';
import { JASON_CARTOON } from '@/constants/images';
import { Exercise, ExerciseLog, Language } from '@/types';

import { log } from '@/lib/logger';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';

function getNarrativeAudioId(exercise: Exercise, language: Language | null): string | null {
  const lang = language || 'en';
  switch (lang) {
    case 'zh_hant':
      return exercise.narrative_audio_youtube_id_zh_hant || exercise.narrative_audio_youtube_id || null;
    case 'zh_hans':
      return exercise.narrative_audio_youtube_id_zh_hans || exercise.narrative_audio_youtube_id || null;
    default:
      return exercise.narrative_audio_youtube_id || null;
  }
}

function getAudioInstructionUrl(exercise: Exercise, language: Language | null): string | null {
  const lang = language || 'en';
  switch (lang) {
    case 'zh_hant':
      return exercise.audio_instruction_url_zh_hant || exercise.audio_instruction_url_en || null;
    case 'zh_hans':
      return exercise.audio_instruction_url_zh_hans || exercise.audio_instruction_url_en || null;
    default:
      return exercise.audio_instruction_url_en || null;
  }
}

type MirrorViewMode = 'split' | 'full';

function getExerciseTitle(exercise: Exercise, language: Language | null): string {
  const lang = language || 'en';
  switch (lang) {
    case 'zh_hant': return exercise.title_zh_hant || exercise.title_en;
    case 'zh_hans': return exercise.title_zh_hans || exercise.title_en;
    default: return exercise.title_en;
  }
}

export default function ExerciseScreen() {
  const params = useLocalSearchParams<{
    exerciseId: string;
    allExerciseIds?: string;
    currentIndex?: string;
  }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, patientId, patientName, language, reinforcementAudioId, reinforcementAudioUrl } = useApp();

  const allIds: string[] = useMemo(() => {
    if (params.allExerciseIds) {
      try { return JSON.parse(params.allExerciseIds); } catch { return []; }
    }
    return [];
  }, [params.allExerciseIds]);

  const [currentIdx, setCurrentIdx] = useState(
    params.currentIndex ? parseInt(params.currentIndex, 10) : 0
  );

  const activeExerciseId = allIds.length > 0 ? allIds[currentIdx] : params.exerciseId;
  const hasNext = allIds.length > 0 && currentIdx < allIds.length - 1;

  const [showEncouragement, setShowEncouragement] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [pendingLogId, setPendingLogId] = useState<string | null>(null);
  const [completedThisSession, setCompletedThisSession] = useState<Set<string>>(new Set());
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const [mirrorViewMode, setMirrorViewMode] = useState<MirrorViewMode>('split');
  const [cameraReady, setCameraReady] = useState(false);
  const bubbleFade = useRef(new Animated.Value(0)).current;
  const bubbleSlide = useRef(new Animated.Value(10)).current;
  const mirrorFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(bubbleFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(bubbleSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    }, 1500);
    return () => clearTimeout(timer);
  }, [activeExerciseId, bubbleFade, bubbleSlide]);

  const isCompletedThisSession = completedThisSession.has(activeExerciseId);

  const exerciseQuery = useQuery({
    queryKey: ['exercise', activeExerciseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', activeExerciseId)
        .single();

      if (error) throw error;
      return data as Exercise;
    },
    enabled: !!activeExerciseId,
  });

  const programQuery = useQuery({
    queryKey: ['program', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercise_programs')
        .select('*, exercises(*)')
        .eq('patient_id', patientId!)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!patientId,
  });

  const totalExercises = useMemo(() => {
    return programQuery.data?.exercises?.length || 0;
  }, [programQuery.data]);

  const allLogsQuery = useQuery({
    queryKey: ['exerciseLogs', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercise_logs')
        .select('*, exercises(title_en, title_zh_hant, title_zh_hans)')
        .eq('patient_id', patientId!)
        .order('completed_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as ExerciseLog[];
    },
    enabled: !!patientId,
  });

  const todayLogsQuery = useQuery({
    queryKey: ['todayLogs', patientId],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('exercise_logs')
        .select('*')
        .eq('patient_id', patientId!)
        .gte('completed_at', today.toISOString());
      if (error) return [];
      return (data || []) as ExerciseLog[];
    },
    enabled: !!patientId,
  });

  const starInfo = useMemo(() => {
    const todayLogs = todayLogsQuery.data || [];
    const uniqueToday = new Set(todayLogs.map((l) => l.exercise_id));
    const sessionResult = getStarsForSession(uniqueToday.size, totalExercises);
    const allLogs = allLogsQuery.data || [];
    const summary = calculateStars(allLogs, totalExercises);
    return {
      ...sessionResult,
      currentStreak: summary.currentStreak,
    };
  }, [todayLogsQuery.data, allLogsQuery.data, totalExercises]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      log('Logging exercise completion:', activeExerciseId);
      const { data, error } = await supabase
        .from('exercise_logs')
        .insert({
          patient_id: patientId,
          exercise_id: activeExerciseId,
          completed_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setPendingLogId(data?.id ?? null);
      queryClient.invalidateQueries({ queryKey: ['todayLogs'] });
      queryClient.invalidateQueries({ queryKey: ['exerciseLogs'] });
      setCompletedThisSession((prev) => new Set(prev).add(activeExerciseId));
      setShowEncouragement(true);
    },
    onError: (error) => {
      log('Complete exercise error:', error);
    },
  });

  const ratingMutation = useMutation({
    mutationFn: async ({ logId, rating }: { logId: string; rating: number }) => {
      log('Saving self-rating:', rating, 'for log:', logId);
      const { error } = await supabase
        .from('exercise_logs')
        .update({ self_rating: rating })
        .eq('id', logId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exerciseLogs'] });
    },
    onError: (error) => {
      log('Save rating error:', error);
    },
  });

  const { reset } = completeMutation;
  useEffect(() => {
    reset();
  }, [activeExerciseId, reset]);

  const { mutate: completeExercise } = completeMutation;

  const handleMarkComplete = useCallback(() => {
    completeExercise();
  }, [completeExercise]);

  const handleEncouragementContinue = useCallback(() => {
    setShowEncouragement(false);
    setShowRating(true);
  }, []);

  const handleRatingSkip = useCallback(() => {
    setShowRating(false);
    setPendingLogId(null);
    if (hasNext) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      router.back();
    }
  }, [hasNext, router]);

  const { mutate: saveRating } = ratingMutation;

  const handleRatingSave = useCallback((rating: number) => {
    setShowRating(false);
    if (pendingLogId) {
      saveRating({ logId: pendingLogId, rating });
    }
    setPendingLogId(null);
    if (hasNext) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      router.back();
    }
  }, [hasNext, router, pendingLogId, saveRating]);

  const handleOpenMirror = useCallback(() => {
    log('Opening mirror mode');
    setMirrorOpen(true);
    setCameraReady(false);
    Animated.timing(mirrorFade, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [mirrorFade]);

  const handleCloseMirror = useCallback(() => {
    log('Closing mirror mode');
    Animated.timing(mirrorFade, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setMirrorOpen(false);
      setCameraReady(false);
    });
  }, [mirrorFade]);

  const handleToggleMirrorView = useCallback(() => {
    setMirrorViewMode((prev) => (prev === 'split' ? 'full' : 'split'));
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const exercise = exerciseQuery.data;

  if (exerciseQuery.isLoading || !exercise) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <ScaledText size={17} weight="600" color={Colors.textPrimary} numberOfLines={1}>
              {allIds.length > 0
                ? `${t('exercisePlayer')} ${currentIdx + 1}/${allIds.length}`
                : t('exercisePlayer')}
            </ScaledText>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        {mirrorOpen && (
          <MirrorModeView
            exercise={exercise}
            mirrorViewMode={mirrorViewMode}
            cameraReady={cameraReady}
            mirrorFade={mirrorFade}
            onClose={handleCloseMirror}
            onToggleView={handleToggleMirrorView}
            onCameraReady={() => setCameraReady(true)}
            t={t}
            language={language}
            patientName={patientName || ''}
          />
        )}

        {!mirrorOpen && (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.videoSection}>
              <View style={styles.videoPlayerWrapper}>
                <ExerciseVideoPlayer exercise={exercise} height={220} />
                <VideoWatermark patientName={patientName || ''} height={220} />
              </View>
              <Animated.View
                style={[
                  styles.slpBubbleRow,
                  { opacity: bubbleFade, transform: [{ translateY: bubbleSlide }] },
                ]}
              >
                <Image source={JASON_CARTOON} style={styles.slpAvatar} />
                <View style={styles.speechBubble}>
                  <View style={styles.speechBubbleArrow} />
                  <ScaledText size={13} color={Colors.textPrimary} style={styles.speechBubbleText}>
                    {t('askSlpHint')}
                  </ScaledText>
                </View>
              </Animated.View>
            </View>

          <View style={styles.titleSection}>
            <ScaledText size={22} weight="bold" color={Colors.textPrimary}>
              {getExerciseTitle(exercise, language)}
            </ScaledText>
            {exercise.category && (
              <View style={styles.categoryChip}>
                <Tag size={12} color={Colors.primary} />
                <ScaledText size={13} weight="600" color={Colors.primary}>
                  {exercise.category}
                </ScaledText>
              </View>
            )}
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Clock size={14} color={Colors.primary} />
                <ScaledText size={13} color={Colors.primary} weight="600">
                  {exercise.duration_minutes} {t('minutes')}
                </ScaledText>
              </View>
              <View style={styles.metaChip}>
                <Repeat size={14} color={Colors.primary} />
                <ScaledText size={13} color={Colors.primary} weight="600">
                  {getExerciseDosage(exercise, language)}
                </ScaledText>
              </View>
            </View>
          </View>

          {(() => {
            const audioUrl = getAudioInstructionUrl(exercise, language);
            return audioUrl ? (
              <AudioInstructionPlayer
                audioUrl={audioUrl}
                label={t('playInstructions')}
                stopLabel={t('stopInstructions')}
              />
            ) : null;
          })()}

          <TouchableOpacity
            style={styles.mirrorButton}
            onPress={handleOpenMirror}
            activeOpacity={0.8}
            testID="open-mirror-button"
            accessibilityLabel={t('openMirror')}
            accessibilityRole="button"
          >
            <Camera size={20} color={Colors.white} />
            <ScaledText size={15} weight="600" color={Colors.white}>
              {t('openMirror')}
            </ScaledText>
          </TouchableOpacity>

          {exercise.modifications && (
            <View style={styles.modificationsCard}>
              <View style={styles.modHeader}>
                <AlertCircle size={16} color={Colors.secondary} />
                <ScaledText size={15} weight="600" color={Colors.textPrimary}>
                  {t('modifications')}
                </ScaledText>
              </View>
              <ScaledText size={14} color={Colors.textSecondary} style={styles.modBody}>
                {exercise.modifications}
              </ScaledText>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.completeButton,
              completeMutation.isPending && styles.completeButtonLoading,
              isCompletedThisSession && !completeMutation.isPending && styles.completeButtonDone,
            ]}
            onPress={handleMarkComplete}
            disabled={completeMutation.isPending}
            activeOpacity={0.8}
            testID="mark-complete-button"
            accessibilityLabel={t('markComplete')}
            accessibilityRole="button"
          >
            {completeMutation.isPending ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <CheckCircle size={22} color={Colors.white} />
                <ScaledText size={18} weight="bold" color={Colors.white} style={styles.completeText}>
                  {isCompletedThisSession ? t('markCompleteAgain') : t('markComplete')}
                </ScaledText>
              </>
            )}
          </TouchableOpacity>

          {isCompletedThisSession && (
            <ScaledText size={13} color={Colors.success} style={styles.completedHint}>
              {t('alreadyCompletedHint')}
            </ScaledText>
          )}

          <CopyrightFooter />
        </ScrollView>
        )}

        <EncouragementModal
          visible={showEncouragement}
          onContinue={handleEncouragementContinue}
          hasNext={hasNext}
          starsEarned={starInfo.sessionStars}
          streakDays={starInfo.currentStreak}
          isAllComplete={starInfo.isAll}
          isHalfComplete={starInfo.isHalf}
          reinforcementAudioUrl={reinforcementAudioUrl}
          reinforcementAudioId={reinforcementAudioId}
        />

        <SelfRatingModal
          visible={showRating}
          onSkip={handleRatingSkip}
          onSave={handleRatingSave}
        />
      </SafeAreaView>
    </View>
  );
}

interface MirrorModeViewProps {
  exercise: Exercise;
  mirrorViewMode: MirrorViewMode;
  cameraReady: boolean;
  mirrorFade: Animated.Value;
  onClose: () => void;
  onToggleView: () => void;
  onCameraReady: () => void;
  t: (key: string) => string;
  language: Language | null;
  patientName: string;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getVimeoId(exercise: Exercise): string | null {
  return exercise.vimeo_video_id || null;
}

function getYouTubeId(exercise: Exercise): string | null {
  return exercise.youtube_video_id || null;
}

function ExerciseVideoPlayer({ exercise, height, lowQuality }: { exercise: Exercise; height: number; lowQuality?: boolean }) {
  const vimeoId = getVimeoId(exercise);
  const youtubeId = getYouTubeId(exercise);

  if (vimeoId) {
    return <VimeoPlayer videoId={vimeoId} height={height} lowQuality={lowQuality} />;
  }
  if (youtubeId) {
    return <YouTubePlayer videoId={youtubeId} height={height} />;
  }
  return (
    <View style={[{ height, borderRadius: 12, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
      <VideoOff size={32} color="#666" />
      <ScaledText size={14} color="#999" style={{ marginTop: 8 }}>No video available</ScaledText>
    </View>
  );
}

function HiddenNarrativeAudio({ videoId }: { videoId: string }) {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.hiddenAudio}>
        {/* @ts-ignore - iframe is valid on web */}
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&controls=0&showinfo=0&rel=0&modestbranding=1`}
          style={{ width: 1, height: 1, border: 'none', opacity: 0 }}
          allow="autoplay; encrypted-media"
        />
      </View>
    );
  }

  const WebView = require('react-native-webview').WebView;
  const html = `
<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>*{margin:0;padding:0;}html,body{width:1px;height:1px;overflow:hidden;background:transparent;}</style>
</head><body>
<iframe width="1" height="1" src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&controls=0&showinfo=0&rel=0&modestbranding=1"
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

function MirrorModeViewInner({
  exercise,
  mirrorViewMode,
  cameraReady,
  mirrorFade,
  onClose,
  onToggleView,
  onCameraReady,
  t,
  language,
  patientName,
}: MirrorModeViewProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permissionResponse, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordPulse = useRef(new Animated.Value(1)).current;
  const [narrativePlaying, setNarrativePlaying] = useState(false);
  const speakerPulse = useRef(new Animated.Value(1)).current;
  const narrativeAudioId = useMemo(() => getNarrativeAudioId(exercise, language), [exercise, language]);
  const [cameraTimedReady, setCameraTimedReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      log('[MirrorMode] Camera timed ready fallback triggered');
      setCameraTimedReady(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const isCameraUsable = cameraReady || cameraTimedReady;

  useEffect(() => {
    log('[MirrorMode] narrativeAudioId:', narrativeAudioId);
    log('[MirrorMode] exercise narrative fields:', {
      en: exercise.narrative_audio_youtube_id,
      zh_hant: exercise.narrative_audio_youtube_id_zh_hant,
      zh_hans: exercise.narrative_audio_youtube_id_zh_hans,
    });
    log('[MirrorMode] cameraReady:', cameraReady, 'cameraTimedReady:', cameraTimedReady, 'isRecording:', isRecording);
  }, [narrativeAudioId, exercise, cameraReady, cameraTimedReady, isRecording]);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
      Animated.loop(
        Animated.sequence([
          Animated.timing(recordPulse, { toValue: 0.4, duration: 600, useNativeDriver: true }),
          Animated.timing(recordPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsed(0);
      recordPulse.stopAnimation();
      recordPulse.setValue(1);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording, recordPulse]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleStartRecording = useCallback(async () => {
    if (!cameraRef.current || !cameraReady) {
      log('Camera not ready for recording');
      return;
    }
    if (!micPermission?.granted) {
      log('Requesting microphone permission');
      const result = await requestMicPermission();
      if (!result.granted) {
        Alert.alert(t('cameraPermissionRequired'));
        return;
      }
    }

    try {
      log('Starting video recording');
      setIsRecording(true);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const video = await cameraRef.current.recordAsync();
      log('Recording finished, uri:', video?.uri);

      if (video?.uri) {
        try {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status !== 'granted') {
            log('Media library permission denied');
            setToastType('error');
            setToastMessage(t('videoSaveError'));
            return;
          }
          await MediaLibrary.saveToLibraryAsync(video.uri);
          log('Video saved to library');
          setToastType('success');
          setToastMessage(t('videoSaved'));
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        } catch (saveError) {
          log('Error saving video:', saveError);
          setToastType('error');
          setToastMessage(t('videoSaveError'));
        }
      }
    } catch (error) {
      log('Recording error:', error);
      setIsRecording(false);
    }
  }, [cameraReady, micPermission, requestMicPermission, t]);

  const handleStopRecording = useCallback(() => {
    if (!cameraRef.current) return;
    log('Stopping video recording');
    setIsRecording(false);
    cameraRef.current.stopRecording();
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  useEffect(() => {
    if (narrativePlaying) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(speakerPulse, { toValue: 1.2, duration: 500, useNativeDriver: true }),
          Animated.timing(speakerPulse, { toValue: 0.8, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      speakerPulse.stopAnimation();
      speakerPulse.setValue(1);
    }
  }, [narrativePlaying, speakerPulse]);

  useEffect(() => {
    if (mirrorViewMode === 'split' && narrativePlaying) {
      log('[MirrorMode] Switching to split view, stopping narrative audio');
      setNarrativePlaying(false);
    }
  }, [mirrorViewMode, narrativePlaying]);

  const handlePlayNarrative = useCallback(() => {
    log('[MirrorMode] Playing narrative audio:', narrativeAudioId);
    setNarrativePlaying(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [narrativeAudioId]);

  const handleStopNarrative = useCallback(() => {
    log('[MirrorMode] Stopping narrative audio');
    setNarrativePlaying(false);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const screenHeight = Dimensions.get('window').height;
  const isSplit = mirrorViewMode === 'split';
  const videoHeight = isSplit ? screenHeight * 0.28 : 0;
  const cameraHeight = isSplit ? screenHeight * 0.42 : screenHeight * 0.7;

  if (!permissionResponse || !permissionResponse.granted) {
    return (
      <Animated.View style={[styles.mirrorContainer, { opacity: mirrorFade }]}> 
        <View style={styles.mirrorPermissionCard}>
          <Camera size={48} color={Colors.primary} />
          <ScaledText size={17} weight="600" color={Colors.textPrimary} style={styles.mirrorPermText}>
            {t('mirrorMode')}
          </ScaledText>
          <ScaledText size={14} color={Colors.textSecondary} style={styles.mirrorPermSubtext}>
            Camera access is needed to use the mirror
          </ScaledText>
          <TouchableOpacity
            style={styles.mirrorPermButton}
            onPress={requestPermission}
            activeOpacity={0.8}
          >
            <ScaledText size={15} weight="600" color={Colors.white}>
              Grant Access
            </ScaledText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mirrorPermCancel}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <ScaledText size={14} color={Colors.textSecondary}>
              {t('closeMirror')}
            </ScaledText>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.mirrorContainer, { opacity: mirrorFade }]}>
      {isSplit && (
        <View style={[styles.mirrorVideoSection, { height: videoHeight }]}>
          <ExerciseVideoPlayer exercise={exercise} height={videoHeight - 8} lowQuality />
          <VideoWatermark patientName={patientName} height={videoHeight - 8} />
        </View>
      )}

      <View style={[styles.mirrorCameraSection, { height: cameraHeight }]}>
        <CameraView
          key="camera-mirror"
          ref={cameraRef}
          style={styles.cameraPreview}
          facing="front"
          mirror={true}
          mode="video"
          active={true}
          videoStabilizationMode="off"
          onCameraReady={onCameraReady}
        />
        {!cameraReady && (
          <View style={styles.cameraLoading}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}
        <View style={styles.mirrorBadge}>
          <ScaledText size={11} weight="600" color={Colors.white}>
            {t('mirrorMode')}
          </ScaledText>
        </View>

        {isRecording && (
          <View style={styles.recordingIndicator}>
            <Animated.View style={[styles.recordingDot, { opacity: recordPulse }]} />
            <ScaledText size={14} weight="700" color={Colors.white}>
              {formatElapsed(elapsed)}
            </ScaledText>
          </View>
        )}

        {isCameraUsable && (
          <View style={styles.recordButtonContainer}>
            <TouchableOpacity
              style={[
                styles.recordButton,
                isRecording && styles.recordButtonActive,
              ]}
              onPress={isRecording ? handleStopRecording : handleStartRecording}
              activeOpacity={0.7}
              testID="record-button"
            >
              {isRecording ? (
                <View style={styles.stopIcon} />
              ) : (
                <View style={styles.recordIcon} />
              )}
            </TouchableOpacity>
            <ScaledText size={11} weight="600" color={Colors.white} style={styles.recordLabel}>
              {isRecording ? t('stopRecording') : t('record')}
            </ScaledText>
          </View>
        )}


      </View>

      {narrativeAudioId && !isRecording && (
        <View style={styles.narrativeSection}>
          {narrativePlaying ? (
            <TouchableOpacity
              style={styles.narrativeStopBtnOuter}
              onPress={handleStopNarrative}
              activeOpacity={0.7}
              testID="stop-narrative-button"
            >
              <Animated.View style={{ transform: [{ scale: speakerPulse }] }}>
                <Headphones size={20} color={Colors.white} />
              </Animated.View>
              <ScaledText size={14} weight="600" color={Colors.white}>
                {t('stopInstructions')}
              </ScaledText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.narrativePlayBtnOuter}
              onPress={handlePlayNarrative}
              activeOpacity={0.7}
              testID="play-narrative-button"
            >
              <Headphones size={20} color={Colors.white} />
              <ScaledText size={14} weight="600" color={Colors.white}>
                {t('playInstructions')}
              </ScaledText>
            </TouchableOpacity>
          )}
        </View>
      )}

      {narrativePlaying && narrativeAudioId && (
        <HiddenNarrativeAudio videoId={narrativeAudioId} />
      )}

      {toastMessage && (
        <View style={[styles.toast, toastType === 'error' ? styles.toastError : styles.toastSuccess]}>
          <ScaledText size={13} weight="600" color={Colors.white}>
            {toastMessage}
          </ScaledText>
        </View>
      )}

      <View style={styles.mirrorControls}>
        <TouchableOpacity
          style={[styles.mirrorControlBtn, isRecording && styles.mirrorControlDisabled]}
          onPress={onToggleView}
          activeOpacity={0.8}
          disabled={isRecording}
          testID="toggle-mirror-view"
        >
          {isSplit ? (
            <Maximize2 size={18} color={Colors.white} />
          ) : (
            <SplitSquareHorizontal size={18} color={Colors.white} />
          )}
          <ScaledText size={13} weight="600" color={Colors.white}>
            {isSplit ? t('mirrorOnly') : t('splitView')}
          </ScaledText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mirrorCloseBtn, isRecording && styles.mirrorControlDisabled]}
          onPress={onClose}
          activeOpacity={0.8}
          disabled={isRecording}
          testID="close-mirror-button"
        >
          <X size={18} color={Colors.white} />
          <ScaledText size={13} weight="600" color={Colors.white}>
            {t('closeMirror')}
          </ScaledText>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const MirrorModeView = React.memo(MirrorModeViewInner);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  mirrorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.primaryDark,
  },
  mirrorContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  mirrorVideoSection: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  mirrorCameraSection: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative' as const,
  },
  cameraPreview: {
    flex: 1,
  },
  cameraLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  mirrorBadge: {
    position: 'absolute' as const,
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  mirrorControls: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  mirrorControlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  mirrorCloseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.textSecondary,
  },
  mirrorUnavailable: {
    padding: 40,
    alignItems: 'center',
  },
  mirrorPermissionCard: {
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 32,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mirrorPermText: {
    marginTop: 16,
  },
  mirrorPermSubtext: {
    marginTop: 6,
    textAlign: 'center',
  },
  mirrorPermButton: {
    marginTop: 20,
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
  },
  mirrorPermCancel: {
    marginTop: 12,
    paddingVertical: 8,
  },
  recordingIndicator: {
    position: 'absolute' as const,
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  recordButtonContainer: {
    position: 'absolute' as const,
    bottom: 16,
    alignSelf: 'center',
    alignItems: 'center',
  },
  recordButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: Colors.white,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  recordButtonActive: {
    borderColor: '#FF3B30',
  },
  recordIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF3B30',
  },
  stopIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  recordLabel: {
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  toast: {
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  toastSuccess: {
    backgroundColor: Colors.success,
  },
  toastError: {
    backgroundColor: Colors.error,
  },
  mirrorControlDisabled: {
    opacity: 0.4,
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
  narrativeSection: {
    marginTop: 10,
    alignItems: 'center' as const,
  },
  narrativePlayBtnOuter: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  narrativeStopBtnOuter: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: '#E74C3C',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  videoPlayerWrapper: {
    position: 'relative' as const,
  },
  videoSection: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  slpBubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  slpAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: Colors.primaryLight,
  },
  speechBubble: {
    flex: 1,
    backgroundColor: Colors.primaryLight,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginLeft: 8,
    position: 'relative' as const,
  },
  speechBubbleArrow: {
    position: 'absolute' as const,
    left: -6,
    top: 12,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderRightWidth: 8,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: Colors.primaryLight,
  },
  speechBubbleText: {
    lineHeight: 20,
  },
  titleSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  metaChip: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  modificationsCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.secondaryLight,
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.secondary,
    marginBottom: 24,
  },
  modHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  modBody: {
    lineHeight: 22,
  },
  completeButton: {
    marginHorizontal: 20,
    backgroundColor: Colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 10,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  completeButtonLoading: {
    opacity: 0.7,
  },
  completeButtonDone: {
    backgroundColor: Colors.primary,
  },
  completeText: {
    letterSpacing: 0.3,
  },
  completedHint: {
    textAlign: 'center',
    marginTop: 10,
    marginHorizontal: 20,
  },
});
