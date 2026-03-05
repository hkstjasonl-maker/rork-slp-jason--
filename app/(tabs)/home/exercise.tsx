import React, { useState, useCallback, useMemo, useEffect, useRef, memo, forwardRef } from 'react';
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
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, CheckCircle, Clock, Repeat, AlertCircle, Tag, Camera, X, Maximize2, SplitSquareHorizontal, Headphones, VideoOff } from 'lucide-react-native';
import * as MediaLibrary from 'expo-media-library';
import { Video, ResizeMode } from 'expo-av';
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

type MediaMode = 'video' | 'split' | 'mirror';

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

function getExerciseTitle(exercise: Exercise, language: Language | null): string {
  const lang = language || 'en';
  switch (lang) {
    case 'zh_hant': return exercise.title_zh_hant || exercise.title_en;
    case 'zh_hans': return exercise.title_zh_hans || exercise.title_en;
    default: return exercise.title_en;
  }
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

const PersistentCameraInner = forwardRef<CameraView, { onCameraReady?: () => void }>(
  function PersistentCameraInner({ onCameraReady }, ref) {
    return (
      <CameraView
        ref={ref}
        style={StyleSheet.absoluteFill}
        facing="front"
        mirror={true}
        mode="video"
        onCameraReady={onCameraReady}
      />
    );
  }
);
PersistentCameraInner.displayName = 'PersistentCamera';
const PersistentCamera = memo(PersistentCameraInner, () => true);

function SplitVideoLayerInner({ vimeoId, youtubeId }: { vimeoId: string | null; youtubeId: string | null }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    if (!vimeoId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFetchFailed(false);
    setVideoUrl(null);

    fetch(`https://player.vimeo.com/video/${vimeoId}/config`)
      .then(r => r.json())
      .then(config => {
        if (cancelled) return;
        const progressive = config?.request?.files?.progressive || [];
        const sorted = progressive
          .filter((f: { type?: string }) => !f.type || f.type === 'video/mp4')
          .sort((a: { height: number }, b: { height: number }) => b.height - a.height);
        const quality = sorted.find((f: { height: number }) => f.height <= 480) || sorted[0];
        if (quality?.url) {
          log('[SplitVideoLayer] Using progressive URL, height:', quality.height);
          setVideoUrl(quality.url);
          setLoading(false);
          return;
        }
        const hls = config?.request?.files?.hls?.cdns || {};
        const cdnKeys = Object.keys(hls);
        if (cdnKeys.length > 0) {
          const cdn = hls[cdnKeys[0]];
          const hlsUrl = cdn?.url || cdn?.avc_url;
          if (hlsUrl) {
            log('[SplitVideoLayer] Using HLS URL');
            setVideoUrl(hlsUrl);
            setLoading(false);
            return;
          }
        }
        log('[SplitVideoLayer] No native URL found, marking failed');
        setFetchFailed(true);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          log('[SplitVideoLayer] Fetch error:', err);
          setFetchFailed(true);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [vimeoId]);

  if (loading) {
    return (
      <View style={splitVideoStyles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (videoUrl) {
    if (Platform.OS === 'web') {
      const embedUrl = `https://player.vimeo.com/video/${vimeoId}?autoplay=0&quality=360p`;
      return (
        <View style={splitVideoStyles.container}>
          {/* @ts-ignore - iframe is valid on web */}
          <iframe
            src={embedUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
          />
        </View>
      );
    }

    return (
      <Video
        source={{ uri: videoUrl }}
        style={splitVideoStyles.container}
        resizeMode={ResizeMode.CONTAIN}
        useNativeControls={true}
        shouldPlay={false}
        isMuted={false}
      />
    );
  }

  if (fetchFailed && vimeoId && Platform.OS === 'web') {
    const embedUrl = `https://player.vimeo.com/video/${vimeoId}?autoplay=0&quality=360p`;
    return (
      <View style={splitVideoStyles.container}>
        {/* @ts-ignore */}
        <iframe
          src={embedUrl}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
        />
      </View>
    );
  }

  if (fetchFailed && vimeoId && Platform.OS !== 'web') {
    const WebView = require('react-native-webview').WebView;
    return (
      <WebView
        source={{ uri: `https://player.vimeo.com/video/${vimeoId}?autoplay=0&quality=360p` }}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        style={splitVideoStyles.container}
        javaScriptEnabled={true}
        scrollEnabled={false}
        bounces={false}
      />
    );
  }

  if (youtubeId) {
    return (
      <View style={splitVideoStyles.container}>
        <YouTubePlayer videoId={youtubeId} height={200} />
      </View>
    );
  }

  return (
    <View style={splitVideoStyles.empty}>
      <VideoOff size={28} color="#666" />
      <ScaledText size={13} color="#999" style={{ marginTop: 6 }}>No video</ScaledText>
    </View>
  );
}
SplitVideoLayerInner.displayName = 'SplitVideoLayer';
const SplitVideoLayer = memo(SplitVideoLayerInner);

const splitVideoStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
});

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

  const [mediaMode, setMediaMode] = useState<MediaMode>('video');
  const [cameraReady, setCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [narrativePlaying, setNarrativePlaying] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bubbleFade = useRef(new Animated.Value(0)).current;
  const bubbleSlide = useRef(new Animated.Value(10)).current;
  const recordPulse = useRef(new Animated.Value(1)).current;
  const speakerPulse = useRef(new Animated.Value(1)).current;

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const hasCameraPermission = cameraPermission?.granted === true;

  const isCompletedThisSession = completedThisSession.has(activeExerciseId);

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(bubbleFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(bubbleSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    }, 1500);
    return () => clearTimeout(timer);
  }, [activeExerciseId, bubbleFade, bubbleSlide]);

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
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, recordPulse]);

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
    if (mediaMode === 'split' && narrativePlaying) {
      setNarrativePlaying(false);
    }
  }, [mediaMode, narrativePlaying]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

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
  const { mutate: saveRating } = ratingMutation;

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

  const handleOpenMirror = useCallback(async () => {
    log('[ExerciseScreen] Opening mirror mode');
    if (!hasCameraPermission) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert(t('cameraPermissionRequired'));
        return;
      }
    }
    setMediaMode('split');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [hasCameraPermission, requestCameraPermission, t]);

  const handleCloseMirror = useCallback(() => {
    log('[ExerciseScreen] Closing mirror mode');
    if (isRecording) return;
    setMediaMode('video');
    setNarrativePlaying(false);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [isRecording]);

  const handleSetMode = useCallback((mode: MediaMode) => {
    if (isRecording) return;
    setMediaMode(mode);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [isRecording]);

  const handleCameraReady = useCallback(() => {
    log('[ExerciseScreen] Camera ready');
    setCameraReady(true);
  }, []);

  const handleStartRecording = useCallback(async () => {
    if (!cameraRef.current || !cameraReady) {
      log('Camera not ready for recording');
      return;
    }
    if (!micPermission?.granted) {
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
            setToastType('error');
            setToastMessage(t('videoSaveError'));
            return;
          }
          await MediaLibrary.saveToLibraryAsync(video.uri);
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

  const handlePlayNarrative = useCallback(() => {
    setNarrativePlaying(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const handleStopNarrative = useCallback(() => {
    setNarrativePlaying(false);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const exercise = exerciseQuery.data;
  const narrativeAudioId = useMemo(
    () => exercise ? getNarrativeAudioId(exercise, language) : null,
    [exercise, language]
  );

  if (exerciseQuery.isLoading || !exercise) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </SafeAreaView>
      </View>
    );
  }

  const vimeoId = getVimeoId(exercise);
  const youtubeId = getYouTubeId(exercise);
  const isInMirror = mediaMode !== 'video';

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (isInMirror) {
                handleCloseMirror();
              } else {
                router.back();
              }
            }}
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

        <View style={{ flex: 1 }}>
          {mediaMode === 'split' && (
            <View style={styles.splitVideoSection}>
              <SplitVideoLayer vimeoId={vimeoId} youtubeId={youtubeId} />
              <VideoWatermark patientName={patientName || ''} height={200} />
            </View>
          )}

          <View
            style={[
              styles.cameraContainer,
              mediaMode === 'video' && styles.cameraHidden,
              (mediaMode === 'split' || mediaMode === 'mirror') && styles.cameraVisible,
            ]}
            pointerEvents={mediaMode === 'video' ? 'none' : 'auto'}
          >
            {hasCameraPermission && (
              <PersistentCamera ref={cameraRef} onCameraReady={handleCameraReady} />
            )}

            {isInMirror && !cameraReady && hasCameraPermission && (
              <View style={styles.cameraLoading}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            )}

            {isInMirror && (
              <View style={styles.mirrorBadge}>
                <ScaledText size={11} weight="600" color={Colors.white}>
                  {t('mirrorMode')}
                </ScaledText>
              </View>
            )}

            {isInMirror && isRecording && (
              <View style={styles.recordingIndicator}>
                <Animated.View style={[styles.recordingDot, { opacity: recordPulse }]} />
                <ScaledText size={14} weight="700" color={Colors.white}>
                  {formatElapsed(elapsed)}
                </ScaledText>
              </View>
            )}

            {isInMirror && cameraReady && (
              <View style={styles.recordButtonContainer}>
                <TouchableOpacity
                  style={[styles.recordButton, isRecording && styles.recordButtonActive]}
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

          {isInMirror && narrativeAudioId && !isRecording && (
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

          {isInMirror && toastMessage && (
            <View style={[styles.toast, toastType === 'error' ? styles.toastError : styles.toastSuccess]}>
              <ScaledText size={13} weight="600" color={Colors.white}>
                {toastMessage}
              </ScaledText>
            </View>
          )}

          {isInMirror && (
            <View style={styles.modeBar}>
              <TouchableOpacity
                style={[styles.modeBtn, mediaMode === 'split' && styles.modeBtnActive]}
                onPress={() => handleSetMode('split')}
                disabled={isRecording}
                activeOpacity={0.8}
              >
                <SplitSquareHorizontal size={16} color={mediaMode === 'split' ? Colors.white : '#999'} />
                <ScaledText size={13} weight="600" color={mediaMode === 'split' ? Colors.white : '#999'}>
                  {t('splitView')}
                </ScaledText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mediaMode === 'mirror' && styles.modeBtnActive]}
                onPress={() => handleSetMode('mirror')}
                disabled={isRecording}
                activeOpacity={0.8}
              >
                <Maximize2 size={16} color={mediaMode === 'mirror' ? Colors.white : '#999'} />
                <ScaledText size={13} weight="600" color={mediaMode === 'mirror' ? Colors.white : '#999'}>
                  {t('mirrorOnly')}
                </ScaledText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, styles.modeBtnClose]}
                onPress={handleCloseMirror}
                disabled={isRecording}
                activeOpacity={0.8}
                testID="close-mirror-button"
              >
                <X size={16} color={Colors.white} />
                <ScaledText size={13} weight="600" color={Colors.white}>
                  {t('closeMirror')}
                </ScaledText>
              </TouchableOpacity>
            </View>
          )}

          {mediaMode === 'video' && (
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
        </View>

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
  cameraContainer: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  cameraHidden: {
    position: 'absolute' as const,
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  cameraVisible: {
    flex: 1,
    borderRadius: 12,
    marginHorizontal: 16,
    position: 'relative' as const,
  },
  cameraLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  splitVideoSection: {
    height: 220,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: '#000',
    position: 'relative' as const,
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
  narrativeSection: {
    marginTop: 10,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
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
  modeBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#333',
  },
  modeBtnActive: {
    backgroundColor: Colors.primary,
  },
  modeBtnClose: {
    backgroundColor: Colors.textSecondary,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  videoSection: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  videoPlayerWrapper: {
    position: 'relative' as const,
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
