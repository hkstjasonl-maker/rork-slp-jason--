import React, { useState, useCallback, useMemo, useEffect, useRef, memo, forwardRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  Animated,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Eye, Camera, X, Maximize2, SplitSquareHorizontal, VideoOff } from 'lucide-react-native';
import * as MediaLibrary from 'expo-media-library';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';

import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { ScaledText } from '@/components/ScaledText';
import { VimeoPlayer } from '@/components/VimeoPlayer';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import { RecordingWatermark } from '@/components/RecordingWatermark';
import { VideoProtectionOverlay } from '@/components/VideoProtectionOverlay';
import Colors from '@/constants/colors';
import { FeedingSkillAssignment, FeedingSkillReviewRequirement, Language } from '@/types';
import { log } from '@/lib/logger';
import { burnWatermarkIntoVideo } from '@/lib/videoProcessing';
import {
  fetchFeedingSkillReviewRequirement,
  countTodayFeedingSubmissions,
  uploadAndSubmitFeedingVideo,
  isTodayAllowed,
  getNextAllowedDay,
} from '@/lib/feedingSkillReview';

type MediaMode = 'video' | 'split' | 'mirror';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getFeedingTitle(video: { title_en: string; title_zh?: string | null }, language: Language | null): string {
  const lang = language || 'en';
  if (lang === 'zh_hant' || lang === 'zh_hans') {
    return video.title_zh || video.title_en;
  }
  return video.title_en;
}

function getFeedingDescription(video: { description_en?: string | null; description_zh?: string | null }, language: Language | null): string | null {
  const lang = language || 'en';
  if (lang === 'zh_hant' || lang === 'zh_hans') {
    return video.description_zh || video.description_en || null;
  }
  return video.description_en || null;
}

const LiveCamera = forwardRef<CameraView, { onCameraReady?: () => void; cameraMode?: 'picture' | 'video' }>(
  function LiveCamera({ onCameraReady, cameraMode = 'picture' }, ref) {
    return (
      <View style={[StyleSheet.absoluteFill, { transform: [{ scaleX: -1 }] }]}>
        <CameraView
          ref={ref}
          style={StyleSheet.absoluteFill}
          facing="front"
          mirror={false}
          mode={cameraMode}
          videoQuality="720p"
          onCameraReady={onCameraReady}
        />
      </View>
    );
  }
);
LiveCamera.displayName = 'LiveCamera';
const MemoLiveCamera = memo(LiveCamera, (prev, next) => prev.cameraMode === next.cameraMode && prev.onCameraReady === next.onCameraReady);

function SplitVideoLayerInner({ vimeoId, youtubeId }: { vimeoId: string | null; youtubeId: string | null }) {
  if (vimeoId) {
    if (Platform.OS === 'web') {
      const embedUrl = `https://player.vimeo.com/video/${vimeoId}?autoplay=0&quality=240p&dnt=1`;
      return (
        <View style={splitStyles.container}>
          {/* @ts-ignore */}
          <iframe
            src={embedUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="autoplay; picture-in-picture; encrypted-media"
          />
        </View>
      );
    }
    const WebView = require('react-native-webview').WebView;
    const videoHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>*{margin:0;padding:0;-webkit-touch-callout:none;}html,body{background:#000;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;touch-action:manipulation;-webkit-user-select:none;}iframe{width:100%;height:100%;border:none;}</style></head><body><iframe src="https://player.vimeo.com/video/${vimeoId}?autoplay=0&quality=240p&dnt=1&transparent=0&fullscreen=0" sandbox="allow-scripts allow-same-origin allow-popups" allow="autoplay; encrypted-media"></iframe><script>(function(){var bmt=function(e){if(e.touches&&e.touches.length>1){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();}};document.addEventListener('touchstart',bmt,{passive:false,capture:true});document.addEventListener('touchmove',bmt,{passive:false,capture:true});document.addEventListener('gesturestart',function(e){e.preventDefault();e.stopPropagation();},{passive:false,capture:true});document.addEventListener('gesturechange',function(e){e.preventDefault();e.stopPropagation();},{passive:false,capture:true});document.addEventListener('gestureend',function(e){e.preventDefault();e.stopPropagation();},{passive:false,capture:true});})();</script></body></html>`;
    return (
      <WebView
        source={{ html: videoHtml }}
        style={splitStyles.container}
        allowsInlineMediaPlayback={true}
        allowsFullscreenVideo={false}
        allowsAirPlayForMediaPlayback={false}
        allowsLinkPreview={false}
        mediaPlaybackRequiresUserAction={true}
        javaScriptEnabled={true}
        scrollEnabled={false}
        bounces={false}
      />
    );
  }
  if (youtubeId) {
    return (
      <View style={splitStyles.container}>
        <YouTubePlayer videoId={youtubeId} height={200} />
      </View>
    );
  }
  return (
    <View style={splitStyles.empty}>
      <VideoOff size={28} color="#666" />
      <ScaledText size={13} color="#999" style={{ marginTop: 6 }}>{String('No video')}</ScaledText>
    </View>
  );
}
SplitVideoLayerInner.displayName = 'SplitVideoLayer';
const SplitVideoLayer = memo(SplitVideoLayerInner, (prev, next) => prev.vimeoId === next.vimeoId && prev.youtubeId === next.youtubeId);

const splitStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
});

export default function FeedingSkillPlayerScreen() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const { t, language, patientId, patientName } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [mediaMode, setMediaMode] = useState<MediaMode>('video');
  const [cameraReady, setCameraReady] = useState(false);
  const [splitCameraReady, setSplitCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cameraMode, setCameraMode] = useState<'picture' | 'video'>('picture');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showProcessing, setShowProcessing] = useState(false);
  const [reviewRequirement, setReviewRequirement] = useState<FeedingSkillReviewRequirement | null>(null);
  const [todaySubmissionCount, setTodaySubmissionCount] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastRecordedUri, setLastRecordedUri] = useState<string | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const splitCameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordPulse = useRef(new Animated.Value(1)).current;
  const countdownScale = useRef(new Animated.Value(0.5)).current;
  const countdownFade = useRef(new Animated.Value(0)).current;

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const { width: screenWidth } = useWindowDimensions();
  const isTablet = screenWidth >= 768;
  const videoHeight = isTablet ? Math.round(screenWidth * 0.56) : 220;

  const hasCameraPermission = cameraPermission?.granted === true;

  useEffect(() => {
    const configureAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
      } catch (e) {
        log('[FeedingSkillPlayer] Audio mode config error:', e);
      }
    };
    void configureAudio();
  }, []);

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
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const assignmentQuery = useQuery({
    queryKey: ['feedingSkillAssignment', assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feeding_skill_assignments')
        .select('*, feeding_skill_videos(*)')
        .eq('id', assignmentId!)
        .single();
      if (error) {
        log('Feeding skill assignment fetch error:', error);
        throw error;
      }
      return data as FeedingSkillAssignment;
    },
    enabled: !!assignmentId,
  });

  const markViewedMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('feeding_skill_assignments')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', assignmentId!);
      if (error) {
        log('Mark feeding skill viewed error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feedingSkillAssignments', patientId] });
      void queryClient.invalidateQueries({ queryKey: ['feedingSkillAssignment', assignmentId] });
    },
  });

  useEffect(() => {
    if (assignmentQuery.data && !assignmentQuery.data.viewed_at) {
      markViewedMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentQuery.data]);

  useEffect(() => {
    if (!patientId || !assignmentQuery.data?.feeding_skill_videos) return;
    const checkReviewReq = async () => {
      const videoId = assignmentQuery.data!.video_id;
      const req = await fetchFeedingSkillReviewRequirement(patientId, videoId);
      setReviewRequirement(req);
      if (req) {
        const count = await countTodayFeedingSubmissions(req.id);
        setTodaySubmissionCount(count);
      }
    };
    void checkReviewReq();
  }, [patientId, assignmentQuery.data]);

  const assignment = assignmentQuery.data;
  const video = assignment?.feeding_skill_videos;

  const title = useMemo(() => video ? getFeedingTitle(video, language) : '', [video, language]);
  const description = useMemo(() => video ? getFeedingDescription(video, language) : null, [video, language]);

  const vimeoId = video?.vimeo_video_id || null;
  const youtubeId = video?.youtube_video_id || null;

  const isInMirror = mediaMode !== 'video';

  const canSubmitVideo = useMemo(() => {
    if (!reviewRequirement) return true;
    if (!isTodayAllowed(reviewRequirement.allowed_days)) return false;
    if (todaySubmissionCount >= reviewRequirement.max_submissions) return false;
    return true;
  }, [reviewRequirement, todaySubmissionCount]);

  const submissionStatusText = useMemo(() => {
    if (!reviewRequirement) {
      if (todaySubmissionCount > 0) return t('feedingSkillSubmittedToday');
      return t('feedingSkillVideoRequired');
    }
    if (todaySubmissionCount > 0 && todaySubmissionCount >= reviewRequirement.max_submissions) {
      return t('feedingSkillMaxSubmissions');
    }
    if (!isTodayAllowed(reviewRequirement.allowed_days)) {
      const nextDay = getNextAllowedDay(reviewRequirement.allowed_days);
      return nextDay ? `${t('feedingSkillNextSubmission')}${t(nextDay)}` : null;
    }
    if (todaySubmissionCount > 0) {
      return t('feedingSkillSubmittedToday');
    }
    return t('feedingSkillVideoRequired');
  }, [reviewRequirement, todaySubmissionCount, t]);

  const handleBack = useCallback(() => {
    if (isInMirror) {
      if (isRecording) return;
      setMediaMode('video');
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      router.back();
    }
  }, [isInMirror, isRecording, router]);

  const handleOpenMirror = useCallback(async () => {
    log('[FeedingSkillPlayer] Opening mirror mode');
    if (!hasCameraPermission) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert(t('cameraPermissionRequired'));
        return;
      }
    }
    setMediaMode('split');
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [hasCameraPermission, requestCameraPermission, t]);

  const handleSetMode = useCallback((mode: MediaMode) => {
    if (isRecording) return;
    setMediaMode(mode);
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isRecording]);

  const handleCloseMirror = useCallback(() => {
    if (isRecording) return;
    setMediaMode('video');
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isRecording]);

  const handleCameraReady = useCallback(() => {
    log('[FeedingSkillPlayer] Camera ready');
    setCameraReady(true);
  }, []);

  const handleSplitCameraReady = useCallback(() => {
    log('[FeedingSkillPlayer] Split camera ready');
    setSplitCameraReady(true);
  }, []);

  const activeRecordingRef = useCallback(() => {
    if (mediaMode === 'split') return splitCameraRef;
    return cameraRef;
  }, [mediaMode]);

  const isCameraReadyForRecording = useCallback(() => {
    if (mediaMode === 'mirror') return cameraReady;
    if (mediaMode === 'split') return splitCameraReady;
    return false;
  }, [mediaMode, cameraReady, splitCameraReady]);

  const runCountdown = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      setCountdown(3);
      countdownFade.setValue(1);
      countdownScale.setValue(0.5);
      Animated.timing(countdownScale, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const step = (n: number) => {
        if (n <= 0) { setCountdown(null); resolve(); return; }
        setTimeout(() => {
          setCountdown(n - 1 > 0 ? n - 1 : null);
          countdownScale.setValue(0.5);
          Animated.timing(countdownScale, { toValue: 1, duration: 300, useNativeDriver: true }).start();
          if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (n - 1 > 0) { step(n - 1); } else { setTimeout(resolve, 800); }
        }, 1000);
      };
      step(3);
    });
  }, [countdownFade, countdownScale]);

  const saveVideoToLibrary = useCallback(async (uri: string) => {
    setShowProcessing(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        setToastType('error');
        setToastMessage(t('videoSaveError'));
        return;
      }
      log('[FeedingSkillPlayer] Attempting watermark burn, title:', title);
      const { uri: processedUri, wasProcessed } = await burnWatermarkIntoVideo(uri, {
        exerciseName: title,
        patientName: patientName ?? undefined,
      });
      log('[FeedingSkillPlayer] Watermark result — processed:', wasProcessed, 'uri:', processedUri);

      let stableUri = processedUri;
      if (Platform.OS !== 'web') {
        try {
          const ext = processedUri.toLowerCase().endsWith('.mp4') ? 'mp4' : 'mov';
          stableUri = `${LegacyFileSystem.cacheDirectory}upload_ready_${Date.now()}.${ext}`;
          await LegacyFileSystem.copyAsync({ from: processedUri, to: stableUri });
          log('[FeedingSkillPlayer] Copied video to stable cache path:', stableUri);
          const info = await LegacyFileSystem.getInfoAsync(stableUri);
          log('[FeedingSkillPlayer] Stable copy exists:', info.exists, 'size:', (info as any).size);
        } catch (copyErr) {
          log('[FeedingSkillPlayer] Copy to stable path failed, using original:', copyErr);
          stableUri = processedUri;
        }
      }

      await MediaLibrary.saveToLibraryAsync(processedUri);
      setLastRecordedUri(stableUri);
      setToastType('success');
      if (wasProcessed) {
        setToastMessage(t('recordingSavedToAlbum'));
      } else {
        setToastMessage(t('recordingSavedWatermarkNote'));
      }
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCameraMode('picture');
    } catch (saveError) {
      log('Error saving video:', saveError);
      setToastType('error');
      setToastMessage(t('videoSaveError'));
    } finally {
      setShowProcessing(false);
    }
  }, [t, title, patientName]);

  const handleStartRecording = useCallback(async () => {
    const camRef = activeRecordingRef();
    if (!camRef.current || !isCameraReadyForRecording()) {
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
      setCameraMode('video');
      await new Promise(r => setTimeout(r, 500));
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
      } catch (e) {
        log('[FeedingSkillPlayer] Audio mode switch error:', e);
      }
      await runCountdown();
      log('Starting video recording');
      setIsRecording(true);
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const recorded = await camRef.current.recordAsync();
      log('Recording finished, uri:', recorded?.uri);
      if (recorded?.uri) {
        await saveVideoToLibrary(recorded.uri);
      }
    } catch (error) {
      log('Recording error:', error);
      setIsRecording(false);
    }
  }, [activeRecordingRef, isCameraReadyForRecording, micPermission, requestMicPermission, t, runCountdown, saveVideoToLibrary]);

  const handleStopRecording = useCallback(() => {
    const camRef = activeRecordingRef();
    if (!camRef.current) return;
    log('Stopping video recording');
    setIsRecording(false);
    camRef.current.stopRecording();
    setTimeout(async () => {
      setCameraMode('picture');
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
      } catch (e) {
        log('[FeedingSkillPlayer] Audio mode restore error:', e);
      }
    }, 500);
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [activeRecordingRef]);

  const handleSubmitVideo = useCallback(async () => {
    if (!lastRecordedUri || !patientId || !video) {
      log('[FeedingReviewSubmit] Missing data — uri:', !!lastRecordedUri, 'patient:', !!patientId, 'video:', !!video);
      return;
    }

    if (Platform.OS !== 'web') {
      try {
        const fileInfo = await LegacyFileSystem.getInfoAsync(lastRecordedUri);
        log('[FeedingReviewSubmit] File check — exists:', fileInfo.exists, 'size:', (fileInfo as any).size);
        if (!fileInfo.exists) {
          setToastType('error');
          setToastMessage(t('submissionFailed'));
          log('[FeedingReviewSubmit] Video file no longer exists at:', lastRecordedUri);
          return;
        }
      } catch (checkErr) {
        log('[FeedingReviewSubmit] File check error:', checkErr);
      }
    }

    setIsSubmitting(true);
    try {
      const result = await uploadAndSubmitFeedingVideo(
        lastRecordedUri,
        patientId,
        reviewRequirement?.id ?? null,
        assignment!.video_id,
        video.title_en
      );
      if (result.success) {
        setSubmissionSuccess(true);
        setTodaySubmissionCount((prev) => prev + 1);
        setToastType('success');
        setToastMessage(t('videoSubmitted'));
        if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        void queryClient.invalidateQueries({ queryKey: ['feedingReviewRequirements'] });
        void queryClient.invalidateQueries({ queryKey: ['feedingTodaySubmissions'] });
      } else {
        setToastType('error');
        setToastMessage(result.errorDetail || t('submissionFailed'));
        log('[FeedingReviewSubmit] Failed with detail:', result.errorDetail);
      }
    } catch (e) {
      log('[FeedingReviewSubmit] Error:', e);
      setToastType('error');
      setToastMessage(t('submissionFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }, [lastRecordedUri, patientId, reviewRequirement, video, assignment, t, queryClient]);

  const showSubmitButton = useMemo(() => {
    return lastRecordedUri && canSubmitVideo && !submissionSuccess;
  }, [lastRecordedUri, canSubmitVideo, submissionSuccess]);

  if (assignmentQuery.isLoading) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <ScaledText size={16} color={Colors.textSecondary} style={styles.loadingText}>
            {t('loading')}
          </ScaledText>
        </SafeAreaView>
      </View>
    );
  }

  if (!video) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.centered}>
          <ScaledText size={16} color={Colors.textSecondary}>
            {t('noFeedingSkills')}
          </ScaledText>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ScaledText size={16} weight="600" color={Colors.primary}>
              {t('backToHome')}
            </ScaledText>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.headerBackBtn}
            activeOpacity={0.7}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <ScaledText size={17} weight="600" color={Colors.textPrimary} numberOfLines={1}>
              {t('feedingSkillPlayer')}
            </ScaledText>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ flex: 1 }}>
          {mediaMode === 'split' && (
            <View style={isTablet ? styles.splitContainerTablet : { flex: 1 }}>
              <View style={isTablet ? styles.splitVideoSectionTablet : styles.splitVideoSection}>
                <SplitVideoLayer vimeoId={vimeoId} youtubeId={youtubeId} />
              </View>
              <View style={isTablet ? styles.splitMirrorSectionTablet : styles.splitMirrorSection}>
                {hasCameraPermission ? (
                  <CameraView
                    ref={splitCameraRef}
                    style={StyleSheet.absoluteFill}
                    facing="front"
                    mode={cameraMode}
                    onCameraReady={handleSplitCameraReady}
                  />
                ) : (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator color={Colors.primary} />
                  </View>
                )}
                {!splitCameraReady && hasCameraPermission && (
                  <View style={styles.cameraLoading}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                  </View>
                )}
                <View style={styles.mirrorBadge}>
                  <ScaledText size={11} weight="600" color={Colors.white}>{t('mirrorMode')}</ScaledText>
                </View>
                <RecordingWatermark exerciseName={title} patientName={patientName ?? undefined} visible={true} />
                {isRecording && (
                  <View style={styles.recordingIndicator}>
                    <Animated.View style={[styles.recordingDot, { opacity: recordPulse }]} />
                    <ScaledText size={14} weight="700" color={Colors.white}>{formatElapsed(elapsed)}</ScaledText>
                  </View>
                )}
                {splitCameraReady && (
                  <View style={styles.recordButtonContainer}>
                    <TouchableOpacity
                      style={[styles.recordButton, isRecording && styles.recordButtonActive]}
                      onPress={isRecording ? handleStopRecording : handleStartRecording}
                      activeOpacity={0.7}
                      testID="split-record-button"
                      disabled={countdown !== null || showProcessing}
                    >
                      {isRecording ? <View style={styles.stopIcon} /> : <View style={styles.recordIcon} />}
                    </TouchableOpacity>
                    <ScaledText size={11} weight="600" color={Colors.white} style={styles.recordLabel}>
                      {isRecording ? t('stopRecording') : t('record')}
                    </ScaledText>
                  </View>
                )}
                {countdown !== null && (
                  <View style={styles.countdownOverlay}>
                    <Animated.View style={{ transform: [{ scale: countdownScale }] }}>
                      <ScaledText size={72} weight="bold" color={Colors.white}>{String(countdown)}</ScaledText>
                    </Animated.View>
                  </View>
                )}
                {showProcessing && (
                  <View style={styles.countdownOverlay}>
                    <ActivityIndicator size="large" color={Colors.white} />
                    <ScaledText size={14} weight="600" color={Colors.white} style={{ marginTop: 8 }}>{t('processingVideo')}</ScaledText>
                  </View>
                )}
              </View>
            </View>
          )}

          {mediaMode === 'mirror' && (
            <View style={styles.cameraVisible}>
              {hasCameraPermission && (
                <MemoLiveCamera ref={cameraRef} onCameraReady={handleCameraReady} cameraMode={cameraMode} />
              )}
              {!cameraReady && hasCameraPermission && (
                <View style={styles.cameraLoading}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                </View>
              )}
              <View style={styles.mirrorBadge}>
                <ScaledText size={11} weight="600" color={Colors.white}>{t('mirrorMode')}</ScaledText>
              </View>
              <RecordingWatermark exerciseName={title} patientName={patientName ?? undefined} visible={true} />
              {isRecording && (
                <View style={styles.recordingIndicator}>
                  <Animated.View style={[styles.recordingDot, { opacity: recordPulse }]} />
                  <ScaledText size={14} weight="700" color={Colors.white}>{formatElapsed(elapsed)}</ScaledText>
                </View>
              )}
              {cameraReady && (
                <View style={styles.recordButtonContainer}>
                  <TouchableOpacity
                    style={[styles.recordButton, isRecording && styles.recordButtonActive]}
                    onPress={isRecording ? handleStopRecording : handleStartRecording}
                    activeOpacity={0.7}
                    testID="record-button"
                    disabled={countdown !== null || showProcessing}
                  >
                    {isRecording ? <View style={styles.stopIcon} /> : <View style={styles.recordIcon} />}
                  </TouchableOpacity>
                  <ScaledText size={11} weight="600" color={Colors.white} style={styles.recordLabel}>
                    {isRecording ? t('stopRecording') : t('record')}
                  </ScaledText>
                </View>
              )}
              {countdown !== null && (
                <View style={styles.countdownOverlay}>
                  <Animated.View style={{ transform: [{ scale: countdownScale }] }}>
                    <ScaledText size={72} weight="bold" color={Colors.white}>{String(countdown)}</ScaledText>
                  </Animated.View>
                </View>
              )}
              {showProcessing && (
                <View style={styles.countdownOverlay}>
                  <ActivityIndicator size="large" color={Colors.white} />
                  <ScaledText size={14} weight="600" color={Colors.white} style={{ marginTop: 8 }}>{t('processingVideo')}</ScaledText>
                </View>
              )}
            </View>
          )}

          {isInMirror && toastMessage && (
            <View style={[styles.toast, toastType === 'error' ? styles.toastError : styles.toastSuccess]}>
              <ScaledText size={13} weight="600" color={Colors.white}>{toastMessage || ''}</ScaledText>
            </View>
          )}

          {isInMirror && !isRecording && showSubmitButton && (
            <View style={styles.mirrorSubmitContainer}>
              <TouchableOpacity
                style={styles.mirrorSubmitButton}
                onPress={handleSubmitVideo}
                disabled={isSubmitting}
                activeOpacity={0.8}
                testID="mirror-submit-review-button"
              >
                {isSubmitting ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Camera size={18} color={Colors.white} />
                    <ScaledText size={14} weight="600" color={Colors.white}>
                      {t('submitVideoForReview')}
                    </ScaledText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {isInMirror && submissionSuccess && (
            <View style={styles.mirrorSubmitContainer}>
              <View style={styles.mirrorSuccessBanner}>
                <ScaledText size={13} weight="600" color={Colors.success}>
                  {t('videoSubmitted')}
                </ScaledText>
              </View>
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
                <ScaledText size={13} weight="600" color={Colors.white}>{t('closeMirror')}</ScaledText>
              </TouchableOpacity>
            </View>
          )}

          {mediaMode === 'video' && (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.videoContainer}>
                <VideoProtectionOverlay patientName={patientName ?? ''} height={videoHeight}>
                  {vimeoId ? (
                    <VimeoPlayer videoId={vimeoId} height={videoHeight} />
                  ) : youtubeId ? (
                    <YouTubePlayer videoId={youtubeId} height={videoHeight} />
                  ) : (
                    <View style={[styles.noVideo, { height: videoHeight }]}>
                      <VideoOff size={32} color="#666" />
                      <ScaledText size={14} color="#999" style={{ marginTop: 8 }}>Video unavailable</ScaledText>
                    </View>
                  )}
                </VideoProtectionOverlay>
              </View>

              <View style={styles.infoSection}>
                <ScaledText size={20} weight="bold" color={Colors.textPrimary}>
                  {title}
                </ScaledText>

                <View style={styles.metaRow}>
                  {video.category && (
                    <View style={styles.categoryBadge}>
                      <ScaledText size={12} weight="600" color="#E67E22">{video.category}</ScaledText>
                    </View>
                  )}
                  {assignment?.viewed_at && (
                    <View style={styles.viewedBadge}>
                      <Eye size={12} color={Colors.success} />
                      <ScaledText size={12} weight="600" color={Colors.success}>{t('feedingSkillViewed')}</ScaledText>
                    </View>
                  )}
                </View>

                {description && (
                  <View style={styles.descriptionCard}>
                    <ScaledText size={15} color={Colors.textSecondary} style={styles.descriptionText}>
                      {description}
                    </ScaledText>
                  </View>
                )}

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

                {showSubmitButton && (
                  <TouchableOpacity
                    style={styles.submitReviewButton}
                    onPress={handleSubmitVideo}
                    disabled={isSubmitting}
                    activeOpacity={0.8}
                    testID="submit-review-button"
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <>
                        <Camera size={20} color={Colors.white} />
                        <ScaledText size={15} weight="600" color={Colors.white}>
                          {t('submitVideoForReview')}
                        </ScaledText>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {submissionSuccess && (
                  <View style={styles.submissionSuccessBanner}>
                    <ScaledText size={14} weight="600" color={Colors.success}>
                      {t('videoSubmitted')}
                    </ScaledText>
                  </View>
                )}

                {submissionStatusText && (
                  <View style={styles.submissionStatusBanner}>
                    <ScaledText size={13} color={Colors.textSecondary}>
                      {submissionStatusText || ''}
                    </ScaledText>
                  </View>
                )}

                {!isInMirror && toastMessage && (
                  <View style={[styles.toast, toastType === 'error' ? styles.toastError : styles.toastSuccess, { alignSelf: 'center', marginTop: 12 }]}>
                    <ScaledText size={13} weight="600" color={Colors.white}>{toastMessage || ''}</ScaledText>
                  </View>
                )}
              </View>

              <CopyrightFooter />
            </ScrollView>
          )}
        </View>
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
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
  },
  backBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  videoContainer: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  noVideo: {
    borderRadius: 12,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    backgroundColor: '#FEF3E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  viewedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.successLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  descriptionCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
  },
  descriptionText: {
    lineHeight: 24,
  },
  mirrorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.primaryDark,
  },
  splitContainerTablet: {
    flex: 1,
    flexDirection: 'column' as const,
    gap: 6,
    paddingHorizontal: 16,
  },
  splitVideoSectionTablet: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative' as const,
  },
  splitMirrorSectionTablet: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative' as const,
  },
  splitVideoSection: {
    height: 200,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 6,
    backgroundColor: '#000',
    position: 'relative' as const,
  },
  splitMirrorSection: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative' as const,
  },
  cameraVisible: {
    flex: 1,
    borderRadius: 12,
    marginHorizontal: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative' as const,
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
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 30,
  },
  mirrorSubmitContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: 'center' as const,
  },
  mirrorSubmitButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    width: '100%' as const,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  mirrorSuccessBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.successLight,
  },
  submitReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  submissionSuccessBanner: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.successLight,
    alignItems: 'center',
  },
  submissionStatusBanner: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
});
