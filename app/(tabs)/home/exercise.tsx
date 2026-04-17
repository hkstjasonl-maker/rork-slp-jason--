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
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, CheckCircle, Clock, Repeat, AlertCircle, Tag, Camera, X, Maximize2, SplitSquareHorizontal, Headphones, VideoOff, Coffee, Play, Pause, FileText } from 'lucide-react-native';
import * as MediaLibrary from 'expo-media-library';


import { useApp } from '@/contexts/AppContext';
import MiniMahjongGame from '@/components/MiniMahjongGame';
import { ScaledText } from '@/components/ScaledText';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { VimeoPlayer } from '@/components/VimeoPlayer';
import LiveSubtitleOverlay from '@/components/LiveSubtitleOverlay';
import MarketingDrawModal from '@/components/MarketingDrawModal';
import AppAdOverlay from '@/components/AppAdOverlay';
import { checkAndQueueCampaigns, getTodayExerciseCount } from '@/lib/marketingDraw';

import { EncouragementModal } from '@/components/EncouragementModal';
import { SelfRatingModal } from '@/components/SelfRatingModal';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import { RestTimer } from '@/components/RestTimer';
import { RecordingWatermark } from '@/components/RecordingWatermark';
import { FacePositionGuide } from '@/components/FacePositionGuide';
import { VideoProtectionOverlay } from '@/components/VideoProtectionOverlay';
import { supabase } from '@/lib/supabase';
import { getStarsForSession, calculateStars, calculateStarsAndFires } from '@/lib/stars';
import { getExerciseDosage } from '@/lib/dosage';
import { getLocalizedField } from '@/constants/i18n';
import Colors from '@/constants/colors';
import { TherapistImage } from '@/components/TherapistImage';
import { Exercise, ExerciseLog, Language, ExerciseReviewRequirement } from '@/types';
import { log } from '@/lib/logger';
import { FULLSCREEN_PREVENTION_CSS, FULLSCREEN_PREVENTION_JS, INJECTED_JS_BEFORE_LOAD } from '@/lib/fullscreenPrevention';
import {
  fetchReviewRequirement,
  countTodaySubmissions,
  uploadAndSubmitVideo,
  isTodayAllowed,
  getNextAllowedDay,
} from '@/lib/reviewRequirements';
import { burnWatermarkIntoVideo } from '@/lib/videoProcessing';
import { Audio } from 'expo-av';
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
  return getLocalizedField(exercise, 'audio_instruction_url', language || 'en') || null;
}

function getSubtitleUrl(exercise: Exercise, language: Language | null): string | null {
  return getLocalizedField(exercise, 'subtitle_url', language || 'en') || null;
}

function getAudioTranscript(exercise: Exercise, language: Language | null): string | null {
  return getLocalizedField(exercise, 'audio_transcript', language || 'en') || null;
}

function getExerciseTitle(exercise: Exercise, language: Language | null): string {
  return getLocalizedField(exercise, 'title', language || 'en');
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getVimeoId(exercise: Exercise): string | null {
  const id = exercise.vimeo_video_id;
  return (id && typeof id === 'string' && id.trim().length > 0) ? id.trim() : null;
}

function getYouTubeId(exercise: Exercise): string | null {
  const id = exercise.youtube_video_id;
  return (id && typeof id === 'string' && id.trim().length > 0) ? id.trim() : null;
}

const LiveCamera = forwardRef<CameraView, { onCameraReady?: () => void; cameraMode?: 'picture' | 'video' }>(
  function LiveCamera({ onCameraReady, cameraMode = 'picture' }, ref) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <CameraView
          ref={ref}
          style={StyleSheet.absoluteFill}
          facing="front"
          mirror={true}
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

interface MirrorAudioButtonProps {
  audioUrl: string;
  label: string;
  stopLabel: string;
  onPlaybackUpdate?: (isPlaying: boolean, currentTimeSec: number) => void;
}

function MirrorAudioButtonInner({ audioUrl, label, stopLabel, onPlaybackUpdate }: MirrorAudioButtonProps) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const onPlaybackUpdateRef = useRef(onPlaybackUpdate);
  useEffect(() => {
    onPlaybackUpdateRef.current = onPlaybackUpdate;
  });

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const handleToggle = useCallback(async () => {
    try {
      if (isPlaying && soundRef.current) {
        log('[MirrorAudio] Pausing');
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
        onPlaybackUpdateRef.current?.(false, 0);
      } else {
        if (!soundRef.current) {
          log('[MirrorAudio] Creating sound from:', audioUrl);
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
          });
          const { sound } = await Audio.Sound.createAsync(
            { uri: audioUrl },
            { shouldPlay: true, progressUpdateIntervalMillis: 150 }
          );
          soundRef.current = sound;
          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded) {
              const pos = status.positionMillis / 1000;
              if (status.isPlaying) {
                onPlaybackUpdateRef.current?.(true, pos);
              } else if (!status.isBuffering && !status.didJustFinish) {
                onPlaybackUpdateRef.current?.(false, pos);
              }
              if (status.didJustFinish) {
                setIsPlaying(false);
                onPlaybackUpdateRef.current?.(false, 0);
              }
            }
          });
          setIsPlaying(true);
          onPlaybackUpdateRef.current?.(true, 0);
        } else {
          const status = await soundRef.current.getStatusAsync();
          if (status.isLoaded && status.didJustFinish) {
            await soundRef.current.replayAsync();
          } else {
            await soundRef.current.playAsync();
          }
          setIsPlaying(true);
          onPlaybackUpdateRef.current?.(true, 0);
        }
      }
    } catch (e) {
      log('[MirrorAudio] Error:', e);
    }
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [isPlaying, audioUrl]);

  return (
    <TouchableOpacity
      style={[mirrorAudioStyles.iconBtn, isPlaying && mirrorAudioStyles.iconBtnActive]}
      onPress={handleToggle}
      activeOpacity={0.7}
      testID="mirror-audio-toggle"
    >
      {isPlaying ? (
        <Pause size={16} color={Colors.white} />
      ) : (
        <Headphones size={16} color={Colors.white} />
      )}
      <ScaledText size={10} weight="600" color={Colors.white} numberOfLines={1}>
        {isPlaying ? stopLabel : label}
      </ScaledText>
    </TouchableOpacity>
  );
}
const MirrorAudioButton = memo(MirrorAudioButtonInner);

function TranscriptOverlay({ transcript, onClose }: { transcript: string; onClose: () => void }) {
  return (
    <View style={mirrorAudioStyles.transcriptOverlay}>
      <View style={mirrorAudioStyles.transcriptHeader}>
        <ScaledText size={13} weight="700" color={Colors.white}>
          {String('')}
        </ScaledText>
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>
      <ScrollView style={mirrorAudioStyles.transcriptScroll} showsVerticalScrollIndicator={true}>
        <ScaledText size={14} color={Colors.white} style={mirrorAudioStyles.transcriptText}>
          {transcript}
        </ScaledText>
      </ScrollView>
    </View>
  );
}

const mirrorAudioStyles = StyleSheet.create({
  iconBtn: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
    minWidth: 52,
  },
  iconBtnActive: {
    backgroundColor: '#E74C3C',
  },
  transcriptOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    maxHeight: '60%' as unknown as number,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    zIndex: 20,
  },
  transcriptHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 6,
  },
  transcriptScroll: {
    maxHeight: 180,
  },
  transcriptText: {
    lineHeight: 22,
  },
});

function SplitVideoLayerInner({ vimeoId, youtubeId }: { vimeoId: string | null; youtubeId: string | null }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const webViewRef = useRef<any>(null);

  const togglePlayPause = useCallback(() => {
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (vimeoId) {
      const method = nextPlaying ? 'play' : 'pause';
      if (Platform.OS === 'web') {
        try {
          const iframe = document.querySelector('#split-vimeo-iframe') as HTMLIFrameElement | null;
          if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage(JSON.stringify({ method }), '*');
          }
        } catch (e) {
          log('[SplitVideo] Web postMessage error:', e);
        }
      } else if (webViewRef.current) {
        const js = `try{document.querySelector('iframe').contentWindow.postMessage(JSON.stringify({method:'${method}'}),'*');}catch(e){}`;
        webViewRef.current.injectJavaScript(js + ';true;');
      }
    } else if (youtubeId) {
      if (Platform.OS === 'web') {
        try {
          const iframe = document.querySelector('#split-yt-iframe') as HTMLIFrameElement | null;
          if (iframe?.contentWindow) {
            const cmd = nextPlaying ? 'playVideo' : 'pauseVideo';
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: cmd, args: [] }), '*');
          }
        } catch (e) {
          log('[SplitVideo] YT Web postMessage error:', e);
        }
      }
    }
  }, [isPlaying, vimeoId, youtubeId]);

  const playPauseButton = (
    <TouchableOpacity
      style={splitVideoStyles.playPauseButton}
      onPress={togglePlayPause}
      activeOpacity={0.7}
      testID="split-video-play-pause"
    >
      {isPlaying ? (
        <Pause size={18} color="#fff" />
      ) : (
        <Play size={18} color="#fff" />
      )}
    </TouchableOpacity>
  );

  if (vimeoId) {
    if (Platform.OS === 'web') {
      const embedUrl = `https://player.vimeo.com/video/${vimeoId}?autoplay=0&quality=240p&dnt=1&fullscreen=0&playsinline=1`;
      return (
        <View style={splitVideoStyles.container}>
          {/* @ts-ignore */}
          <iframe
            id="split-vimeo-iframe"
            src={embedUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="autoplay; encrypted-media"
            allowFullScreen={false}
          />
          <View style={splitVideoStyles.touchBlocker} />
          {playPauseButton}
        </View>
      );
    }

    const WebView = require('react-native-webview').WebView;
    const videoHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>*{margin:0;padding:0;-webkit-touch-callout:none;-webkit-user-select:none;}html,body{background:#000;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;touch-action:none;-webkit-user-select:none;}iframe{width:100%;height:100%;border:none;pointer-events:none !important;}${FULLSCREEN_PREVENTION_CSS}</style></head><body><iframe src="https://player.vimeo.com/video/${vimeoId}?autoplay=0&quality=240p&dnt=1&transparent=0&fullscreen=0&playsinline=1" sandbox="allow-scripts allow-same-origin" allow="autoplay; encrypted-media" allowfullscreen="false" webkitallowfullscreen="false"></iframe><script>${FULLSCREEN_PREVENTION_JS}</script></body></html>`;

    return (
      <View style={splitVideoStyles.container}>
        <WebView
          ref={webViewRef}
          source={{ html: videoHtml }}
          style={splitVideoStyles.webview}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          allowsAirPlayForMediaPlayback={false}
          allowsFullscreenVideo={false}
          allowsLinkPreview={false}
          allowsPictureInPictureMediaPlayback={false}
          javaScriptEnabled={true}
          scrollEnabled={false}
          bounces={false}
          scalesPageToFit={false}
          injectedJavaScriptBeforeContentLoaded={INJECTED_JS_BEFORE_LOAD}
          setSupportMultipleWindows={false}
        />
        <View style={splitVideoStyles.touchBlocker} />
        {playPauseButton}
      </View>
    );
  }

  if (youtubeId) {
    if (Platform.OS === 'web') {
      const embedUrl = `https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&autoplay=0&controls=0&modestbranding=1&playsinline=1&rel=0`;
      return (
        <View style={splitVideoStyles.container}>
          {/* @ts-ignore */}
          <iframe
            id="split-yt-iframe"
            src={embedUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="autoplay; encrypted-media"
            allowFullScreen={false}
          />
          <View style={splitVideoStyles.touchBlocker} />
          {playPauseButton}
        </View>
      );
    }
    return (
      <View style={splitVideoStyles.container}>
        <YouTubePlayer videoId={youtubeId} height={200} />
        {playPauseButton}
      </View>
    );
  }

  return (
    <View style={splitVideoStyles.empty}>
      <VideoOff size={28} color="#666" />
      <ScaledText size={13} color="#999" style={{ marginTop: 6 }}>{String('No video')}</ScaledText>
    </View>
  );
}
SplitVideoLayerInner.displayName = 'SplitVideoLayer';
const SplitVideoLayer = memo(SplitVideoLayerInner, (prev, next) => prev.vimeoId === next.vimeoId && prev.youtubeId === next.youtubeId);

const splitVideoStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative' as const,
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  touchBlocker: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    backgroundColor: 'rgba(0,0,0,0.005)',
  },
  playPauseButton: {
    position: 'absolute' as const,
    bottom: 8,
    left: 8,
    zIndex: 1100,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.01)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
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
      <ScaledText size={14} color="#999" style={{ marginTop: 8 }}>{String('No video available')}</ScaledText>
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
  const { t, patientId, patientName, language, reinforcementAudioId, reinforcementAudioUrl, liveSubtitlesEnabled, subtitleSizeLevel, mahjongGameEnabled, mahjongGameLevel, refreshPatient: refreshPatientCtx, addToDrawQueue, drawQueue, drawModalVisible, consumeDrawFromQueue, dismissDrawModal } = useApp();

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
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [showRestPrompt, setShowRestPrompt] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showProcessing, setShowProcessing] = useState(false);
  const [showTranscriptOverlay, setShowTranscriptOverlay] = useState(false);
  const [showFaceGuide, setShowFaceGuide] = useState(false);

  const [mirrorAudioIsPlaying, setMirrorAudioIsPlaying] = useState(false);
  const [mirrorAudioCurrentTime, setMirrorAudioCurrentTime] = useState(0);
  const [faceGuideForRecording, setFaceGuideForRecording] = useState(false);
  const [reviewRequirement, setReviewRequirement] = useState<ExerciseReviewRequirement | null>(null);
  const [todaySubmissionCount, setTodaySubmissionCount] = useState<number>(0);
  const [_showSubmitPrompt, setShowSubmitPrompt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastRecordedUri, setLastRecordedUri] = useState<string | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [showMahjongGame, setShowMahjongGame] = useState(false);
  const [showMahjongAd, setShowMahjongAd] = useState(false);

  const countdownFade = useRef(new Animated.Value(0)).current;
  const countdownScale = useRef(new Animated.Value(0.5)).current;

  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bubbleFade = useRef(new Animated.Value(0)).current;
  const bubbleSlide = useRef(new Animated.Value(10)).current;
  const recordPulse = useRef(new Animated.Value(1)).current;
  const speakerPulse = useRef(new Animated.Value(1)).current;

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const splitCameraRef = useRef<CameraView>(null);
  const [splitCameraReady, setSplitCameraReady] = useState(false);
  const [cameraMode, setCameraMode] = useState<'picture' | 'video'>('picture');
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isTablet = screenWidth >= 768;
  const videoHeight = isTablet ? Math.round(screenHeight * 0.45) : 220;


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
    const configureAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
      } catch (e) {
        log('[ExerciseScreen] Audio mode config error:', e);
      }
    };
    void configureAudio();
  }, []);



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
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (exerciseQuery.data) {
      log('[Exercise] Loaded:', JSON.stringify({
        id: exerciseQuery.data.id,
        title: exerciseQuery.data.title_en,
        vimeo_video_id: exerciseQuery.data.vimeo_video_id,
        youtube_video_id: exerciseQuery.data.youtube_video_id,
      }));
    }
  }, [exerciseQuery.data]);

  useEffect(() => {
    if (!patientId || !exerciseQuery.data) return;
    const checkReviewReq = async () => {
      const req = await fetchReviewRequirement(patientId, exerciseQuery.data!.title_en);
      setReviewRequirement(req);
      if (req) {
        const count = await countTodaySubmissions(req.id);
        setTodaySubmissionCount(count);
      }
    };
    void checkReviewReq();
  }, [patientId, exerciseQuery.data]);

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
    staleTime: 5 * 60 * 1000,
  });

  const totalExercises = useMemo(() => {
    return programQuery.data?.exercises?.length || 0;
  }, [programQuery.data]);

  const allLogsQuery = useQuery({
    queryKey: ['exerciseLogs', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercise_logs')
        .select('id, exercise_id, completed_at, self_rating, exercises(title_en, title_zh_hant, title_zh_hans)')
        .eq('patient_id', patientId!)
        .order('completed_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as ExerciseLog[];
    },
    enabled: !!patientId,
    staleTime: 60 * 1000,
  });

  const todayLogsQuery = useQuery({
    queryKey: ['todayLogs', patientId],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('exercise_logs')
        .select('id, exercise_id, completed_at')
        .eq('patient_id', patientId!)
        .gte('completed_at', today.toISOString());
      if (error) return [];
      return (data || []) as ExerciseLog[];
    },
    enabled: !!patientId,
    staleTime: 30 * 1000,
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

      const oldLogs = allLogsQuery.data || [];
      const oldResult = calculateStarsAndFires(oldLogs, totalExercises);

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

      const newFakeLog = {
        id: data?.id || 'temp',
        patient_id: patientId!,
        exercise_id: activeExerciseId,
        completed_at: new Date().toISOString(),
      };
      const newLogs = [...oldLogs, newFakeLog];
      const newResult = calculateStarsAndFires(newLogs, totalExercises);

      const deltaStars = newResult.totalSessionStars - oldResult.totalSessionStars;
      const deltaFires = newResult.totalFires - oldResult.totalFires;

      if ((deltaStars > 0 || deltaFires > 0) && patientId) {
        try {
          const { data: patientData } = await supabase
            .from('patients')
            .select('stars_total, stars_available, fires_total, fires_available')
            .eq('id', patientId)
            .single();

          const cur = patientData || { stars_total: 0, stars_available: 0, fires_total: 0, fires_available: 0 };
          await supabase
            .from('patients')
            .update({
              stars_total: (cur.stars_total || 0) + deltaStars,
              stars_available: (cur.stars_available || 0) + deltaStars,
              fires_total: (cur.fires_total || 0) + deltaFires,
              fires_available: (cur.fires_available || 0) + deltaFires,
            })
            .eq('id', patientId);
          log('[Exercise] Updated patient stars/fires:', { deltaStars, deltaFires });
        } catch (e) {
          log('[Exercise] Failed to update patient stars/fires:', e);
        }
      }

      if (patientId) {
        try {
          await supabase.from('patients').update({
            consecutive_inactive_days: 0,
            last_exercise_date: new Date().toISOString().split('T')[0],
          }).eq('id', patientId);
          log('[Exercise] Reset inactive days and updated last_exercise_date');
        } catch (e) {
          log('[Exercise] Failed to reset inactive days:', e);
        }
      }

      return data;
    },
    onSuccess: (data) => {
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setPendingLogId(data?.id ?? null);
      void queryClient.invalidateQueries({ queryKey: ['todayLogs'] });
      void queryClient.invalidateQueries({ queryKey: ['exerciseLogs'] });
      void queryClient.invalidateQueries({ queryKey: ['patientRewards'] });
      setCompletedThisSession((prev) => new Set(prev).add(activeExerciseId));
      setShowEncouragement(true);

      if (patientId) {
        void refreshPatientCtx();
        void (async () => {
          try {
            const todayCount = await getTodayExerciseCount(patientId);
            const queued = await checkAndQueueCampaigns(patientId, 'exercise_count', todayCount);
            if (queued.length > 0) {
              addToDrawQueue(queued);
            }
          } catch {
            // silently fail
          }
        })();
      }
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
      void queryClient.invalidateQueries({ queryKey: ['exerciseLogs'] });
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

  const proceedAfterRating = useCallback(() => {
    if (hasNext) {
      setShowRestPrompt(true);
    } else {
      router.back();
    }
  }, [hasNext, router]);

  const handleRatingSkip = useCallback(() => {
    setShowRating(false);
    setPendingLogId(null);
    proceedAfterRating();
  }, [proceedAfterRating]);

  const handleRatingSave = useCallback((rating: number) => {
    setShowRating(false);
    if (pendingLogId) {
      saveRating({ logId: pendingLogId, rating });
    }
    setPendingLogId(null);
    proceedAfterRating();
  }, [pendingLogId, saveRating, proceedAfterRating]);

  const handleRestPromptRest = useCallback(() => {
    setShowRestPrompt(false);
    setShowRestTimer(true);
  }, []);

  const handleRestPromptMahjong = useCallback(() => {
    setShowRestPrompt(false);
    setShowMahjongGame(true);
  }, []);

  const handleMahjongClose = useCallback((starsEarned: number) => {
    setShowMahjongGame(false);
    if (starsEarned > 0) {
      setToastType('success');
      setToastMessage('🀄 +3 ⭐');
    }
    setShowMahjongAd(true);
  }, []);

  const handleMahjongAdClose = useCallback(() => {
    setShowMahjongAd(false);
    if (hasNext) {
      setCurrentIdx((prev) => prev + 1);
    }
  }, [hasNext]);

  const handleRestPromptSkip = useCallback(() => {
    setShowRestPrompt(false);
    setCurrentIdx((prev) => prev + 1);
  }, []);

  const handleRestTimerClose = useCallback(() => {
    setShowRestTimer(false);
  }, []);

  const handleRestTimerContinue = useCallback(() => {
    setShowRestTimer(false);
    if (hasNext) {
      setCurrentIdx((prev) => prev + 1);
    }
  }, [hasNext]);

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
    setShowFaceGuide(true);
    setFaceGuideForRecording(false);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [hasCameraPermission, requestCameraPermission, t]);

  const handleCloseMirror = useCallback(() => {
    log('[ExerciseScreen] Closing mirror mode');
    if (isRecording) return;
    setMediaMode('video');
    setNarrativePlaying(false);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [isRecording]);

  const handleSetMode = useCallback((mode: MediaMode) => {
    setShowFaceGuide(false);
    setFaceGuideForRecording(false);
    if (isRecording) return;
    setMediaMode(mode);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [isRecording]);

  const handleCameraReady = useCallback(() => {
    log('[ExerciseScreen] Camera ready');
    setCameraReady(true);
  }, []);

  const runCountdown = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      setCountdown(3);
      countdownFade.setValue(1);
      countdownScale.setValue(0.5);
      Animated.timing(countdownScale, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const step = (n: number) => {
        if (n <= 0) {
          setCountdown(null);
          resolve();
          return;
        }
        setTimeout(() => {
          setCountdown(n - 1 > 0 ? n - 1 : null);
          countdownScale.setValue(0.5);
          Animated.timing(countdownScale, { toValue: 1, duration: 300, useNativeDriver: true }).start();
          if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (n - 1 > 0) {
            step(n - 1);
          } else {
            setTimeout(resolve, 800);
          }
        }, 1000);
      };
      step(3);
    });
  }, [countdownFade, countdownScale]);

  const activeRecordingRef = useCallback(() => {
    if (mediaMode === 'split') return splitCameraRef;
    return cameraRef;
  }, [mediaMode]);

  const isCameraReadyForRecording = useCallback(() => {
    if (mediaMode === 'mirror') return cameraReady;
    if (mediaMode === 'split') return splitCameraReady;
    return false;
  }, [mediaMode, cameraReady, splitCameraReady]);

  const handleSplitCameraReady = useCallback(() => {
    log('[ExerciseScreen] Split camera ready');
    setSplitCameraReady(true);
  }, []);

  const saveVideoToLibrary = useCallback(async (uri: string) => {
    setShowProcessing(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      log('[SaveVideo] MediaLibrary permission status:', status);
      if (status !== 'granted') {
        setToastType('error');
        setToastMessage(`${t('videoSaveError')}: Permission ${status}`);
        return;
      }

      const ex = exerciseQuery.data;
      const exTitle = ex ? getExerciseTitle(ex, language) : '';
      log('[SaveVideo] Attempting watermark burn, exercise:', exTitle);

      const processedUri = await burnWatermarkIntoVideo(uri, exTitle, patientName ?? undefined);
      const wasProcessed = false;

      log('[SaveVideo] Watermark result — processed:', wasProcessed, 'uri:', processedUri);

      await MediaLibrary.saveToLibraryAsync(processedUri);
      setLastRecordedUri(processedUri);
      setToastType('success');

      if (wasProcessed) {
        setToastMessage(t('recordingSavedToAlbum'));
      } else {
        setToastMessage(t('recordingSavedWatermarkNote'));
      }

      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setCameraMode('picture');

      if (reviewRequirement && isTodayAllowed(reviewRequirement.allowed_days) && todaySubmissionCount < reviewRequirement.max_submissions) {
        setTimeout(() => setShowSubmitPrompt(true), 1500);
      }
    } catch (saveError: any) {
      const errMsg = saveError?.message || saveError?.toString() || 'Unknown error';
      log('Error saving video:', errMsg, JSON.stringify(saveError));
      console.error('[SaveVideo] Full error:', saveError);
      setToastType('error');
      setToastMessage(`${t('videoSaveError')}: ${errMsg}`);
    } finally {
      setShowProcessing(false);
    }
  }, [t, reviewRequirement, todaySubmissionCount, exerciseQuery.data, language, patientName]);

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
    setFaceGuideForRecording(true);
    setShowFaceGuide(true);
  }, [activeRecordingRef, isCameraReadyForRecording, micPermission, requestMicPermission, t]);

  const handleFacePositionConfirmed = useCallback(async () => {
    setShowFaceGuide(false);
    setFaceGuideForRecording(false);

    const camRef = activeRecordingRef();
    if (!camRef.current || !isCameraReadyForRecording()) {
      log('Camera not ready after face position confirmed');
      return;
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
        log('[ExerciseScreen] Audio mode switch error:', e);
      }

      await runCountdown();
      log('Starting video recording');
      setIsRecording(true);
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const video = await camRef.current.recordAsync();
      log('Recording finished, uri:', video?.uri);
      if (video?.uri) {
        await saveVideoToLibrary(video.uri);
      }
    } catch (error) {
      log('Recording error:', error);
      setIsRecording(false);
    }
  }, [activeRecordingRef, isCameraReadyForRecording, runCountdown, saveVideoToLibrary]);

  const handleFaceGuideDismiss = useCallback(() => {
    setShowFaceGuide(false);
    setFaceGuideForRecording(false);
  }, []);

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
        log('[ExerciseScreen] Audio mode restore error:', e);
      }
    }, 500);

    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [activeRecordingRef]);

  const handlePlayNarrative = useCallback(() => {
    setNarrativePlaying(true);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const handleStopNarrative = useCallback(() => {
    setNarrativePlaying(false);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const exercise = exerciseQuery.data;

  const canSubmitVideo = useMemo(() => {
    if (!reviewRequirement) return false;
    if (!isTodayAllowed(reviewRequirement.allowed_days)) return false;
    if (todaySubmissionCount >= reviewRequirement.max_submissions) return false;
    return true;
  }, [reviewRequirement, todaySubmissionCount]);

  const submissionStatusText = useMemo(() => {
    if (!reviewRequirement) return null;
    if (todaySubmissionCount > 0 && todaySubmissionCount >= reviewRequirement.max_submissions) {
      return t('maxSubmissionsReached');
    }
    if (!isTodayAllowed(reviewRequirement.allowed_days)) {
      const nextDay = getNextAllowedDay(reviewRequirement.allowed_days);
      return nextDay ? `${t('nextSubmission')}${t(nextDay)}` : null;
    }
    if (todaySubmissionCount > 0) {
      return t('submittedToday');
    }
    return t('videoRequired');
  }, [reviewRequirement, todaySubmissionCount, t]);

  const handleSubmitVideo = useCallback(async () => {
    if (!lastRecordedUri || !patientId || !reviewRequirement || !exercise) return;
    setIsSubmitting(true);
    try {
      const result = await uploadAndSubmitVideo(
        lastRecordedUri,
        patientId,
        reviewRequirement.id,
        exercise.title_en
      );
      if (result.success) {
        setSubmissionSuccess(true);
        setTodaySubmissionCount((prev) => prev + 1);
        setShowSubmitPrompt(false);
        setToastType('success');
        setToastMessage(t('videoSubmitted'));
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        void queryClient.invalidateQueries({ queryKey: ['reviewRequirements'] });
        void queryClient.invalidateQueries({ queryKey: ['videoSubmissions'] });
        void queryClient.invalidateQueries({ queryKey: ['todaySubmissions'] });

        if (patientId) {
          void (async () => {
            try {
              const queued = await checkAndQueueCampaigns(patientId, 'video_submit');
              if (queued.length > 0) {
                addToDrawQueue(queued);
              }
            } catch {
              // silently fail
            }
          })();
        }
      } else {
        setToastType('error');
        setToastMessage(result.error || t('submissionFailed'));
      }
    } catch (e) {
      log('[ReviewSubmit] Error:', e);
      setToastType('error');
      setToastMessage(t('submissionFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }, [lastRecordedUri, patientId, reviewRequirement, exercise, t, queryClient, addToDrawQueue]);
  const narrativeAudioId = useMemo(
    () => exercise ? getNarrativeAudioId(exercise, language) : null,
    [exercise, language]
  );

  const exerciseTitle = useMemo(
    () => exercise ? getExerciseTitle(exercise, language) : '',
    [exercise, language]
  );

  const mirrorAudioUrl = useMemo(
    () => exercise ? getAudioInstructionUrl(exercise, language) : null,
    [exercise, language]
  );

  const mirrorTranscript = useMemo(
    () => exercise ? getAudioTranscript(exercise, language) : null,
    [exercise, language]
  );

  const subtitleUrl = useMemo(
    () => exercise ? getSubtitleUrl(exercise, language) : null,
    [exercise, language]
  );

  const handleToggleTranscript = useCallback(() => {
    setShowTranscriptOverlay(prev => !prev);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const handleMirrorAudioPlaybackUpdate = useCallback((playing: boolean, currentTimeSec: number) => {
    log('[LiveSub] Mirror audio playback update: playing=', playing, 'time=', currentTimeSec.toFixed(2), 'liveSubEnabled=', liveSubtitlesEnabled, 'subtitleUrl=', subtitleUrl);
    setMirrorAudioIsPlaying(playing);
    setMirrorAudioCurrentTime(currentTimeSec);
  }, [liveSubtitlesEnabled, subtitleUrl]);

  useEffect(() => {
    if (mediaMode !== 'video') {
      log('[RenderDebug] Mirror/Split active. liveSubEnabled:', liveSubtitlesEnabled, 'transcript:', mirrorTranscript ? mirrorTranscript.substring(0, 50) : null, 'audioUrl:', mirrorAudioUrl, 'subtitleUrl:', subtitleUrl, 'audioPlaying:', mirrorAudioIsPlaying);
    }
  }, [mediaMode, liveSubtitlesEnabled, mirrorTranscript, mirrorAudioUrl, subtitleUrl, mirrorAudioIsPlaying]);

  useEffect(() => {
    if (mediaMode === 'video') {
      setMirrorAudioIsPlaying(false);
      setMirrorAudioCurrentTime(0);
    }
  }, [mediaMode]);

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
          <TouchableOpacity
            style={styles.restButton}
            onPress={() => setShowRestTimer(true)}
            activeOpacity={0.7}
            testID="rest-timer-button"
          >
            <Coffee size={18} color={Colors.primary} />
          </TouchableOpacity>
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
                  <ScaledText size={11} weight="600" color={Colors.white}>
                    {t('mirrorMode')}
                  </ScaledText>
                </View>
                <RecordingWatermark exerciseName={exerciseTitle} patientName={patientName ?? undefined} visible={true} />

                {!liveSubtitlesEnabled && showTranscriptOverlay && mirrorTranscript && !isRecording && (
                  <TranscriptOverlay transcript={mirrorTranscript} onClose={() => setShowTranscriptOverlay(false)} />
                )}

                {isRecording && (
                  <View style={styles.recordingIndicator}>
                    <Animated.View style={[styles.recordingDot, { opacity: recordPulse }]} />
                    <ScaledText size={14} weight="700" color={Colors.white}>
                      {formatElapsed(elapsed)}
                    </ScaledText>
                  </View>
                )}

                {!isRecording && (
                  <View style={styles.mirrorAudioControls}>
                    {mirrorAudioUrl && (
                      <MirrorAudioButton audioUrl={mirrorAudioUrl} label={t('playInstructions')} stopLabel={t('stopInstructions')} onPlaybackUpdate={handleMirrorAudioPlaybackUpdate} />
                    )}
                    {!liveSubtitlesEnabled && mirrorTranscript ? (
                      <TouchableOpacity
                        style={[mirrorAudioStyles.iconBtn, showTranscriptOverlay && mirrorAudioStyles.iconBtnActive]}
                        onPress={handleToggleTranscript}
                        activeOpacity={0.7}
                        testID="split-transcript-toggle"
                      >
                        <FileText size={16} color={Colors.white} />
                        <ScaledText size={10} weight="600" color={Colors.white} numberOfLines={1}>
                          {showTranscriptOverlay ? t('hideTranscript') : t('viewTranscript')}
                        </ScaledText>
                      </TouchableOpacity>
                    ) : null}
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
                <FacePositionGuide
                  visible={showFaceGuide}
                  isRecordingMode={faceGuideForRecording}
                  onConfirmPositioned={handleFacePositionConfirmed}
                  onDismiss={handleFaceGuideDismiss}
                />
                {countdown !== null && (
                  <View style={styles.countdownOverlay}>
                    <Animated.View style={{ transform: [{ scale: countdownScale }] }}>
                      <ScaledText size={72} weight="bold" color={Colors.white}>
                        {String(countdown)}
                      </ScaledText>
                    </Animated.View>
                  </View>
                )}
                {showProcessing && (
                  <View style={styles.countdownOverlay}>
                    <ActivityIndicator size="large" color={Colors.white} />
                    <ScaledText size={14} weight="600" color={Colors.white} style={{ marginTop: 8 }}>
                      {t('processingVideo')}
                    </ScaledText>
                  </View>
                )}

                {liveSubtitlesEnabled && !isRecording && (
                  <LiveSubtitleOverlay
                    subtitleUrl={subtitleUrl}
                    isPlaying={mirrorAudioIsPlaying}
                    audioCurrentTime={mirrorAudioCurrentTime}
                    visible={mirrorAudioIsPlaying}
                    subtitleSizeLevel={subtitleSizeLevel}
                    forceOverlay={true}
                  />
                )}

              </View>

            </View>
          )}

          {mediaMode === 'mirror' && (
            <View style={styles.mirrorWrapper}>
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
                <ScaledText size={11} weight="600" color={Colors.white}>
                  {t('mirrorMode')}
                </ScaledText>
              </View>

              <RecordingWatermark exerciseName={exerciseTitle} patientName={patientName ?? undefined} visible={true} />

              {!liveSubtitlesEnabled && showTranscriptOverlay && mirrorTranscript && !isRecording && (
                <TranscriptOverlay transcript={mirrorTranscript} onClose={() => setShowTranscriptOverlay(false)} />
              )}

              {isRecording && (
                <View style={styles.recordingIndicator}>
                  <Animated.View style={[styles.recordingDot, { opacity: recordPulse }]} />
                  <ScaledText size={14} weight="700" color={Colors.white}>
                    {formatElapsed(elapsed)}
                  </ScaledText>
                </View>
              )}

              {!isRecording && (
                <View style={styles.mirrorAudioControls}>
                  {mirrorAudioUrl && (
                    <MirrorAudioButton audioUrl={mirrorAudioUrl} label={t('playInstructions')} stopLabel={t('stopInstructions')} onPlaybackUpdate={handleMirrorAudioPlaybackUpdate} />
                  )}
                  {!liveSubtitlesEnabled && mirrorTranscript ? (
                    <TouchableOpacity
                      style={[mirrorAudioStyles.iconBtn, showTranscriptOverlay && mirrorAudioStyles.iconBtnActive]}
                      onPress={handleToggleTranscript}
                      activeOpacity={0.7}
                      testID="mirror-transcript-toggle"
                    >
                      <FileText size={16} color={Colors.white} />
                      <ScaledText size={10} weight="600" color={Colors.white} numberOfLines={1}>
                        {showTranscriptOverlay ? t('hideTranscript') : t('viewTranscript')}
                      </ScaledText>
                    </TouchableOpacity>
                  ) : null}
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

              <FacePositionGuide
                visible={showFaceGuide}
                isRecordingMode={faceGuideForRecording}
                onConfirmPositioned={handleFacePositionConfirmed}
                onDismiss={handleFaceGuideDismiss}
              />

              {countdown !== null && (
                <View style={styles.countdownOverlay}>
                  <Animated.View style={{ transform: [{ scale: countdownScale }] }}>
                    <ScaledText size={72} weight="bold" color={Colors.white}>
                      {String(countdown)}
                    </ScaledText>
                  </Animated.View>
                </View>
              )}

              {showProcessing && (
                <View style={styles.countdownOverlay}>
                  <ActivityIndicator size="large" color={Colors.white} />
                  <ScaledText size={14} weight="600" color={Colors.white} style={{ marginTop: 8 }}>
                    {t('processingVideo')}
                  </ScaledText>
                </View>
              )}

              {liveSubtitlesEnabled && !isRecording && (
                <LiveSubtitleOverlay
                  subtitleUrl={subtitleUrl}
                  isPlaying={mirrorAudioIsPlaying}
                  audioCurrentTime={mirrorAudioCurrentTime}
                  visible={mirrorAudioIsPlaying}
                  subtitleSizeLevel={subtitleSizeLevel}
                  forceOverlay={true}
                />
              )}

            </View>

            </View>
          )}

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
                {toastMessage || ''}
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
                <VideoProtectionOverlay patientName={patientName ?? ''} height={videoHeight}>
                  <ExerciseVideoPlayer exercise={exercise} height={videoHeight} />
                </VideoProtectionOverlay>
                <Animated.View
                  style={[
                    styles.slpBubbleRow,
                    { opacity: bubbleFade, transform: [{ translateY: bubbleSlide }] },
                  ]}
                >
                  <TherapistImage type="cartoon" style={styles.slpAvatar} />
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

              {reviewRequirement && canSubmitVideo && lastRecordedUri && !submissionSuccess && (
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

        <RestTimer
          visible={showRestTimer}
          onClose={handleRestTimerClose}
          onContinue={handleRestTimerContinue}
          hasNext={hasNext}
        />

        {showRestPrompt && (
          <Modal
            visible={showRestPrompt}
            transparent
            animationType="fade"
            onRequestClose={handleRestPromptSkip}
          >
            <View style={styles.restPromptOverlay}>
              <View style={styles.restPromptCard}>
                <View style={styles.restPromptIcon}>
                  <Coffee size={28} color={Colors.primary} />
                </View>
                {mahjongGameEnabled ? (
                  <>
                    <ScaledText size={18} weight="700" color={Colors.textPrimary} style={styles.restPromptTitle}>
                      {t('restOrPlay')}
                    </ScaledText>
                    <View style={styles.restPromptActions}>
                      <View style={styles.restPromptRow}>
                        <TouchableOpacity
                          style={styles.restPromptRestBtnHalf}
                          onPress={handleRestPromptRest}
                          activeOpacity={0.8}
                          testID="rest-prompt-rest"
                        >
                          <ScaledText size={16} weight="700" color={Colors.white}>
                            {`😴 ${t('restBtn')}`}
                          </ScaledText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.restPromptMahjongBtn}
                          onPress={handleRestPromptMahjong}
                          activeOpacity={0.8}
                          testID="rest-prompt-mahjong"
                        >
                          <ScaledText size={16} weight="700" color={Colors.white}>
                            {`🀄 ${t('miniMahjongBtn')}`}
                          </ScaledText>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        style={styles.restPromptSkipBtn}
                        onPress={handleRestPromptSkip}
                        activeOpacity={0.7}
                        testID="rest-prompt-skip"
                      >
                        <ScaledText size={15} weight="600" color={Colors.textSecondary}>
                          {t('skip')}
                        </ScaledText>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <ScaledText size={18} weight="700" color={Colors.textPrimary} style={styles.restPromptTitle}>
                      {t('restBeforeNext')}
                    </ScaledText>
                    <View style={styles.restPromptActions}>
                      <TouchableOpacity
                        style={styles.restPromptRestBtn}
                        onPress={handleRestPromptRest}
                        activeOpacity={0.8}
                        testID="rest-prompt-rest"
                      >
                        <ScaledText size={16} weight="700" color={Colors.white}>
                          {t('rest')}
                        </ScaledText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.restPromptSkipBtn}
                        onPress={handleRestPromptSkip}
                        activeOpacity={0.7}
                        testID="rest-prompt-skip"
                      >
                        <ScaledText size={15} weight="600" color={Colors.textSecondary}>
                          {t('skip')}
                        </ScaledText>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </View>
          </Modal>
        )}

        <MiniMahjongGame
          visible={showMahjongGame}
          level={(mahjongGameLevel as 'basic' | 'moderate' | 'difficult') || 'basic'}
          onClose={handleMahjongClose}
          patientId={patientId || ''}
        />

        {showMahjongAd && patientId && (
          <AppAdOverlay
            patientId={patientId}
            placement="mahjong"
            onClose={handleMahjongAdClose}
            language={language ?? undefined}
          />
        )}

        {drawModalVisible && drawQueue.length > 0 && (
          <MarketingDrawModal
            visible={drawModalVisible}
            queue={drawQueue}
            patientId={patientId || ''}
            onClose={dismissDrawModal}
            onDrawConsumed={consumeDrawFromQueue}
            onPrizeClaimed={refreshPatientCtx}
          />
        )}
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
  cameraVisible: {
    flex: 1,
    borderRadius: 12,
    marginHorizontal: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative' as const,
  },
  mirrorWrapper: {
    flex: 1,
    position: 'relative' as const,
  },
  subtitleOverlayAbsolute: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 100,
  },
  splitMirrorSection: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 12,
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
  mirrorAudioControls: {
    position: 'absolute' as const,
    top: 36,
    left: 10,
    flexDirection: 'row' as const,
    gap: 6,
    zIndex: 15,
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
  restButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  restPromptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  restPromptCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  restPromptIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  restPromptTitle: {
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 26,
  },
  restPromptActions: {
    width: '100%',
    gap: 10,
  },
  restPromptRestBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  restPromptRow: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  restPromptRestBtnHalf: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center' as const,
  },
  restPromptMahjongBtn: {
    flex: 1,
    backgroundColor: '#2B6B35',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center' as const,
  },
  restPromptSkipBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 30,
  },
  submitReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
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
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.successLight,
    alignItems: 'center',
  },
  submissionStatusBanner: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
});
