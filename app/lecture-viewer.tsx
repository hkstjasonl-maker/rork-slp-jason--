import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
  Alert,
  Animated,
  Easing,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LogOut, Users, Wifi, ChevronDown, Check, Award, Clock, ClipboardList, GraduationCap } from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { VimeoPlayer } from '@/components/VimeoPlayer';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { VideoProtectionOverlay } from '@/components/VideoProtectionOverlay';
import LiveSubtitleOverlay from '@/components/LiveSubtitleOverlay';
import { AgoraAudienceView } from '@/components/AgoraAudienceView';

const ACCENT = '#3B82F6';
const ACCENT_DARK = '#2563EB';

const STORAGE_KEYS = {
  EVENT_ID: 'lecture_event_id',
  ATTENDEE_ID: 'lecture_attendee_id',
  ATTENDEE_TOKEN: 'lecture_attendee_token',
};

type SubtitleMap = Record<string, string>;

type LectureEvent = {
  id: string;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled' | string;
  title?: string | null;
  speaker_name?: string | null;
  video_provider?: 'vimeo' | 'youtube' | null;
  video_id?: string | null;
  video_url?: string | null;
  current_position?: number | null;
  is_playing?: boolean | null;
  subtitle_urls?: SubtitleMap | null;
  certificate_min_minutes?: number | null;
  certificate_min_attention_pct?: number | null;
  ended_at?: string | null;
  agora_channel_name?: string | null;
  event_type?: 'live' | 'hybrid' | 'pre_recorded' | string | null;
};

type AttentionCheck = {
  id: string;
  event_id: string;
  check_code: string;
  duration_seconds?: number | null;
  expires_at?: string | null;
  created_at?: string | null;
};

type LiveQuiz = {
  session_id: string;
  quiz_id: string;
  session_name?: string | null;
};

const { width: WIN_W } = Dimensions.get('window');

export default function LectureViewerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string; attendeeId?: string; eventTitle?: string }>();
  const { language, patientName } = useApp();
  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [eventId, setEventId] = useState<string | null>(params.eventId || null);
  const [attendeeId, setAttendeeId] = useState<string | null>(params.attendeeId || null);
  const [event, setEvent] = useState<LectureEvent | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [connected, setConnected] = useState<boolean>(true);
  const [reconnects, setReconnects] = useState<number>(0);
  const [attendeeCount, setAttendeeCount] = useState<number>(0);
  const [showSummary, setShowSummary] = useState<boolean>(false);
  const [summaryStats, setSummaryStats] = useState<{ minutes: number; passed: number; total: number } | null>(null);

  const [activeCheck, setActiveCheck] = useState<AttentionCheck | null>(null);
  const [checkAnswered, setCheckAnswered] = useState<Set<string>>(new Set());
  const [checkInput, setCheckInput] = useState<string>('');
  const [checkSeconds, setCheckSeconds] = useState<number>(0);
  const [checkSubmitting, setCheckSubmitting] = useState<boolean>(false);
  const [checkFeedback, setCheckFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [checksPassed, setChecksPassed] = useState<number>(0);
  const [checksTotal, setChecksTotal] = useState<number>(0);

  const [activeQuiz, setActiveQuiz] = useState<LiveQuiz | null>(null);
  const [quizHandledIds, setQuizHandledIds] = useState<Set<string>>(new Set());

  const [selectedSubLang, setSelectedSubLang] = useState<string | null>(null);
  const [showLangPicker, setShowLangPicker] = useState<boolean>(false);

  const [agoraAppId, setAgoraAppId] = useState<string | null>(null);
  const [agoraConfigLoading, setAgoraConfigLoading] = useState<boolean>(false);
  const [agoraConfigError, setAgoraConfigError] = useState<string | null>(null);
  const [liveStreamActive, setLiveStreamActive] = useState<boolean>(false);
  const [liveStreamEnded, setLiveStreamEnded] = useState<boolean>(false);
  const [liveStreamError, setLiveStreamError] = useState<string | null>(null);

  const lastDisconnectRef = useRef<number | null>(null);
  const dotPulse = useRef(new Animated.Value(0)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const joinedAtRef = useRef<number>(Date.now());

  // Load from storage if missing
  useEffect(() => {
    if (eventId && attendeeId) return;
    void (async () => {
      const [eid, aid] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.EVENT_ID),
        AsyncStorage.getItem(STORAGE_KEYS.ATTENDEE_ID),
      ]);
      if (eid) setEventId(eid);
      if (aid) setAttendeeId(aid);
      if (!eid || !aid) {
        router.replace('/(tabs)/home' as any);
      }
    })();
  }, [eventId, attendeeId, router]);

  // Pulse for connected dot
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(dotPulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [dotPulse]);

  const cleanupAndExit = useCallback(async (reason: 'ended' | 'manual') => {
    if (attendeeId) {
      try {
        await supabase
          .from('lecture_attendees')
          .update({
            status: reason === 'manual' ? 'left' : 'completed',
            left_at: new Date().toISOString(),
          })
          .eq('id', attendeeId);
      } catch (e) {
        log('[LectureViewer] cleanup error:', e);
      }
    }
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.EVENT_ID,
      STORAGE_KEYS.ATTENDEE_ID,
      STORAGE_KEYS.ATTENDEE_TOKEN,
    ]);
    router.replace('/(tabs)/home' as any);
  }, [attendeeId, router]);

  // Poll event state every 2s
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const { data, error } = await supabase
          .from('lecture_events')
          .select('id, status, title, speaker_name, video_provider, video_id, video_url, current_position, is_playing, subtitle_urls, certificate_min_minutes, certificate_min_attention_pct, ended_at, agora_channel_name, event_type')
          .eq('id', eventId)
          .maybeSingle();

        if (cancelled) return;

        if (error || !data) {
          if (connected) {
            lastDisconnectRef.current = Date.now();
            setConnected(false);
          }
          return;
        }

        if (!connected) {
          const gap = lastDisconnectRef.current ? Date.now() - lastDisconnectRef.current : 0;
          lastDisconnectRef.current = null;
          setConnected(true);
          setReconnects((c) => c + 1);
          if (attendeeId) {
            try {
              await supabase.from('disconnection_log').insert({
                event_id: eventId,
                attendee_id: attendeeId,
                gap_ms: gap,
                reconnected_at: new Date().toISOString(),
              });
              await supabase
                .from('lecture_attendees')
                .update({ reconnection_count: reconnects + 1 })
                .eq('id', attendeeId);
            } catch (e) {
              log('[LectureViewer] reconnect log error:', e);
            }
          }
        }

        const ev = data as LectureEvent;
        setEvent(ev);
        setLoading(false);

        // Initialize default subtitle language once we know what's available
        if (!selectedSubLang && ev.subtitle_urls && typeof ev.subtitle_urls === 'object') {
          const keys = Object.keys(ev.subtitle_urls);
          if (keys.length > 0) {
            const preferred = isZh ? (keys.find(k => k.startsWith('zh')) || keys[0]) : (keys.find(k => k.startsWith('en')) || keys[0]);
            setSelectedSubLang(preferred);
          }
        }

        if (ev.status === 'ended') {
          handleEventEnded();
        }
      } catch (e) {
        log('[LectureViewer] poll error:', e);
        if (connected) {
          lastDisconnectRef.current = Date.now();
          setConnected(false);
        }
      }
    };

    void tick();
    const interval = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, attendeeId, connected, reconnects, isZh, selectedSubLang]);

  const handleEventEnded = useCallback(() => {
    if (showSummary) return;
    const minutes = Math.max(0, Math.round((Date.now() - joinedAtRef.current) / 60000));
    setSummaryStats({ minutes, passed: checksPassed, total: checksTotal });
    setShowSummary(true);
  }, [showSummary, checksPassed, checksTotal]);

  // Heartbeat — last_seen + presence
  useEffect(() => {
    if (!attendeeId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        await supabase
          .from('lecture_attendees')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', attendeeId);
      } catch (e) {
        if (!cancelled) log('[LectureViewer] heartbeat error:', e);
      }
    };
    void tick();
    const interval = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [attendeeId]);

  // Attendee count
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { count } = await supabase
          .from('lecture_attendees')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .in('status', ['joined', 'active']);
        if (!cancelled && typeof count === 'number') setAttendeeCount(count);
      } catch {}
    };
    void tick();
    const interval = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [eventId]);

  // Poll attention checks every 10s
  useEffect(() => {
    if (!eventId || !attendeeId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const nowIso = new Date().toISOString();
        const { data } = await supabase
          .from('attention_checks')
          .select('id, event_id, check_code, duration_seconds, expires_at, created_at')
          .eq('event_id', eventId)
          .gt('expires_at', nowIso)
          .order('created_at', { ascending: false })
          .limit(1);
        if (cancelled || !data || data.length === 0) return;
        const c = data[0] as AttentionCheck;
        if (checkAnswered.has(c.id)) return;
        if (activeCheck && activeCheck.id === c.id) return;
        // Verify we haven't already responded
        const { data: existing } = await supabase
          .from('attention_responses')
          .select('id')
          .eq('check_id', c.id)
          .eq('attendee_id', attendeeId)
          .maybeSingle();
        if (cancelled) return;
        if (existing) {
          setCheckAnswered((s) => new Set(s).add(c.id));
          return;
        }
        const expiresAtMs = c.expires_at ? new Date(c.expires_at).getTime() : Date.now() + ((c.duration_seconds || 30) * 1000);
        const remaining = Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000));
        if (remaining <= 0) return;
        setActiveCheck(c);
        setCheckInput('');
        setCheckSeconds(remaining);
        setCheckFeedback(null);
        setChecksTotal((n) => n + 1);
      } catch (e) {
        log('[LectureViewer] attention poll error:', e);
      }
    };
    void tick();
    const interval = setInterval(tick, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [eventId, attendeeId, checkAnswered, activeCheck]);

  // Countdown for active check
  useEffect(() => {
    if (!activeCheck) return;
    if (checkSeconds <= 0) {
      setActiveCheck(null);
      return;
    }
    const id = setInterval(() => setCheckSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [activeCheck, checkSeconds]);

  // Poll for live quiz launched mid-lecture
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await supabase
          .from('quiz_sessions')
          .select('id, quiz_id, session_name, status, lecture_event_id')
          .eq('lecture_event_id', eventId)
          .eq('status', 'active')
          .order('started_at', { ascending: false })
          .limit(1);
        if (cancelled || !data || data.length === 0) return;
        const q = data[0] as { id: string; quiz_id: string; session_name?: string | null; status: string };
        if (quizHandledIds.has(q.id)) return;
        if (activeQuiz && activeQuiz.session_id === q.id) return;
        setActiveQuiz({ session_id: q.id, quiz_id: q.quiz_id, session_name: q.session_name || null });
      } catch (e) {
        log('[LectureViewer] quiz poll error:', e);
      }
    };
    void tick();
    const interval = setInterval(tick, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [eventId, quizHandledIds, activeQuiz]);

  const submitAttentionCheck = useCallback(async () => {
    if (!activeCheck || !attendeeId) return;
    if (!checkInput.trim()) return;
    setCheckSubmitting(true);
    try {
      const isCorrect = checkInput.trim() === (activeCheck.check_code || '').trim();
      await supabase.from('attention_responses').insert({
        check_id: activeCheck.id,
        event_id: activeCheck.event_id,
        attendee_id: attendeeId,
        entered_code: checkInput.trim(),
        is_correct: isCorrect,
        responded_at: new Date().toISOString(),
      });
      setCheckFeedback(isCorrect ? 'correct' : 'wrong');
      if (isCorrect) setChecksPassed((n) => n + 1);
      setCheckAnswered((s) => new Set(s).add(activeCheck.id));
      setTimeout(() => {
        setActiveCheck(null);
        setCheckFeedback(null);
        setCheckInput('');
      }, 1400);
    } catch (e) {
      log('[LectureViewer] check submit error:', e);
      if (Platform.OS === 'web') {
        window.alert(isZh ? '提交失敗' : 'Submit failed');
      } else {
        Alert.alert(isZh ? '提交失敗' : 'Submit failed');
      }
    } finally {
      setCheckSubmitting(false);
    }
  }, [activeCheck, attendeeId, checkInput, isZh]);

  // Subtitle URL
  const subtitleUrl = useMemo<string | null>(() => {
    if (!event?.subtitle_urls || !selectedSubLang) return null;
    const u = (event.subtitle_urls as SubtitleMap)[selectedSubLang];
    return typeof u === 'string' && u ? u : null;
  }, [event, selectedSubLang]);

  const subtitleLanguages = useMemo<{ code: string; label: string }[]>(() => {
    const map = event?.subtitle_urls as SubtitleMap | null | undefined;
    if (!map || typeof map !== 'object') return [];
    return Object.keys(map).map((k) => ({
      code: k,
      label: k.toUpperCase(),
    }));
  }, [event?.subtitle_urls]);

  // Animate overlay slide
  useEffect(() => {
    Animated.timing(overlayAnim, {
      toValue: activeCheck ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeCheck, overlayAnim]);

  const dotOpacity = dotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  const videoHeight = Math.min(WIN_W * 9 / 16, 320);

  const isLiveStream = !!(
    event?.agora_channel_name &&
    (event?.event_type === 'live' || event?.event_type === 'hybrid') &&
    event?.status === 'live'
  );

  // Fetch Agora config once when we determine this is a live stream
  useEffect(() => {
    if (!isLiveStream || !event?.agora_channel_name) return;
    if (agoraAppId || agoraConfigLoading) return;
    let cancelled = false;
    setAgoraConfigLoading(true);
    setAgoraConfigError(null);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('get_agora_config', { p_channel_name: event.agora_channel_name });
        if (cancelled) return;
        if (error) {
          setAgoraConfigError(error.message);
          log('[LectureViewer] get_agora_config error:', error);
          return;
        }
        const cfg = Array.isArray(data) ? data[0] : data;
        const appId = (cfg && (cfg.app_id || cfg.appId)) as string | undefined;
        if (appId) setAgoraAppId(appId);
        else setAgoraConfigError('Missing Agora app_id');
      } catch (e) {
        if (!cancelled) {
          setAgoraConfigError(e instanceof Error ? e.message : String(e));
          log('[LectureViewer] agora config exception:', e);
        }
      } finally {
        if (!cancelled) setAgoraConfigLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isLiveStream, event?.agora_channel_name, agoraAppId, agoraConfigLoading]);

  if (loading) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator color={ACCENT} size="large" />
          <Text style={styles.loadingText}>{isZh ? '正在連線...' : 'Connecting...'}</Text>
        </SafeAreaView>
      </View>
    );
  }

  const renderVideo = () => {
    if (isLiveStream) {
      if (!agoraAppId) {
        return (
          <View style={[styles.videoPlaceholder, { height: videoHeight }]}>
            <ActivityIndicator color={ACCENT} />
            <Text style={styles.placeholderText}>
              {agoraConfigError
                ? (isZh ? '直播設定載入失敗' : 'Live config failed')
                : (isZh ? '正在連接直播...' : 'Connecting to live stream...')}
            </Text>
          </View>
        );
      }
      return (
        <VideoProtectionOverlay patientName={patientName || ''} height={videoHeight}>
          <AgoraAudienceView
            appId={agoraAppId}
            channel={event!.agora_channel_name as string}
            height={videoHeight}
            onStreamStarted={() => { setLiveStreamActive(true); setLiveStreamEnded(false); setLiveStreamError(null); }}
            onStreamEnded={() => { setLiveStreamActive(false); setLiveStreamEnded(true); }}
            onError={(msg) => { setLiveStreamError(msg); log('[LectureViewer] agora error:', msg); }}
          />
          {liveStreamActive && (
            <View style={styles.liveBadge} pointerEvents="none">
              <View style={styles.liveBadgeDot} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          )}
          {liveStreamEnded && !liveStreamActive && (
            <View style={styles.liveOverlay} pointerEvents="none">
              <Text style={styles.liveOverlayText}>{isZh ? '直播已結束' : 'Stream ended'}</Text>
            </View>
          )}
          {liveStreamError && !liveStreamActive && (
            <View style={styles.liveOverlay} pointerEvents="none">
              <Text style={styles.liveOverlayText}>
                {isZh ? '直播錯誤' : 'Stream error'}
              </Text>
            </View>
          )}
        </VideoProtectionOverlay>
      );
    }

    if (!event?.video_id && !event?.video_url) {
      return (
        <View style={[styles.videoPlaceholder, { height: videoHeight }]}>
          <GraduationCap size={36} color="#94A3B8" />
          <Text style={styles.placeholderText}>
            {event?.status === 'scheduled' ? (isZh ? '即將開始' : 'Starting soon') : (isZh ? '等待中...' : 'Waiting...')}
          </Text>
        </View>
      );
    }
    const provider = event.video_provider || 'youtube';
    const videoId = event.video_id || event.video_url || '';
    return (
      <VideoProtectionOverlay patientName={patientName || ''} height={videoHeight}>
        {provider === 'vimeo' ? (
          <VimeoPlayer videoId={videoId} height={videoHeight} />
        ) : (
          <YouTubePlayer videoId={videoId} height={videoHeight} />
        )}
      </VideoProtectionOverlay>
    );
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <Text style={styles.sessionTitle} numberOfLines={1}>
              {event?.title || params.eventTitle || (isZh ? '講座' : 'Lecture')}
            </Text>
            <View style={styles.statusRow}>
              <Animated.View
                style={[
                  styles.statusDot,
                  { backgroundColor: connected ? '#22C55E' : '#EF4444', opacity: connected ? dotOpacity : 1 },
                ]}
              />
              <Text style={[styles.statusText, !connected && { color: '#EF4444' }]}>
                {connected
                  ? (isZh ? '已連線' : 'Connected')
                  : (isZh ? '重新連線中...' : 'Reconnecting...')}
              </Text>
              <View style={styles.divider} />
              <Users size={12} color="#9CA3AF" />
              <Text style={styles.statusText}>{attendeeCount}</Text>
            </View>
          </View>
          {!connected && (
            <View style={styles.offlineBadge}>
              <Wifi size={12} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.videoArea}>
          {renderVideo()}
          {subtitleUrl && !isLiveStream && (
            <LiveSubtitleOverlay
              subtitleUrl={subtitleUrl}
              isPlaying={!!event?.is_playing}
              audioCurrentTime={event?.current_position || 0}
              visible
              forceOverlay={false}
            />
          )}
        </View>

        <View style={styles.metaBar}>
          {subtitleLanguages.length > 0 ? (
            <TouchableOpacity
              style={styles.langPicker}
              onPress={() => setShowLangPicker(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.langPickerText}>
                {isZh ? '字幕' : 'CC'}: {selectedSubLang ? selectedSubLang.toUpperCase() : (isZh ? '無' : 'Off')}
              </Text>
              <ChevronDown size={14} color="#CBD5E1" />
            </TouchableOpacity>
          ) : <View />}
          {event?.speaker_name ? (
            <Text style={styles.speakerText} numberOfLines={1}>
              {event.speaker_name}
            </Text>
          ) : null}
        </View>

        <View style={{ flex: 1 }} />

        <View style={styles.bottomBar}>
          <Text style={styles.bottomHint}>
            {isZh ? '只供觀看' : 'View-only'} · {patientName || ''}
          </Text>
          <TouchableOpacity
            style={styles.leaveBtn}
            onPress={() => {
              if (Platform.OS === 'web') {
                if (window.confirm(isZh ? '確認離開？' : 'Leave the lecture?')) void cleanupAndExit('manual');
              } else {
                Alert.alert(
                  isZh ? '離開講座？' : 'Leave Lecture?',
                  isZh ? '確認離開此講座' : 'Are you sure you want to leave?',
                  [
                    { text: isZh ? '取消' : 'Cancel', style: 'cancel' },
                    { text: isZh ? '離開' : 'Leave', style: 'destructive', onPress: () => void cleanupAndExit('manual') },
                  ]
                );
              }
            }}
            activeOpacity={0.7}
          >
            <LogOut size={14} color="#FCA5A5" />
            <Text style={styles.leaveBtnText}>{isZh ? '離開' : 'Leave'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Subtitle language picker */}
      <Modal visible={showLangPicker} transparent animationType="fade" onRequestClose={() => setShowLangPicker(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowLangPicker(false)}>
          <View style={styles.langSheet}>
            <Text style={styles.langSheetTitle}>{isZh ? '選擇字幕語言' : 'Subtitle language'}</Text>
            <TouchableOpacity
              style={styles.langRow}
              onPress={() => { setSelectedSubLang(null); setShowLangPicker(false); }}
            >
              <Text style={styles.langRowText}>{isZh ? '關閉' : 'Off'}</Text>
              {!selectedSubLang && <Check size={18} color={ACCENT} />}
            </TouchableOpacity>
            {subtitleLanguages.map((l) => (
              <TouchableOpacity
                key={l.code}
                style={styles.langRow}
                onPress={() => { setSelectedSubLang(l.code); setShowLangPicker(false); }}
              >
                <Text style={styles.langRowText}>{l.label}</Text>
                {selectedSubLang === l.code && <Check size={18} color={ACCENT} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Attention check */}
      <Modal visible={!!activeCheck} transparent animationType="none" onRequestClose={() => {}}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View
            style={[
              styles.checkCard,
              {
                opacity: overlayAnim,
                transform: [{
                  translateY: overlayAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }),
                }],
              },
            ]}
          >
            <View style={styles.checkHeader}>
              <View style={styles.checkIconWrap}>
                <Award size={22} color="#fff" />
              </View>
              <Text style={styles.checkTitle}>
                {isZh ? '點名驗證' : 'Attention Check'}
              </Text>
              <View style={styles.timerPill}>
                <Clock size={12} color="#fff" />
                <Text style={styles.timerText}>{checkSeconds}s</Text>
              </View>
            </View>
            <Text style={styles.checkSubtitle}>
              {isZh ? '請輸入畫面上顯示的 5 位代碼' : 'Enter the 5-digit code shown on screen'}
            </Text>
            <TextInput
              style={[
                styles.checkInput,
                checkFeedback === 'correct' && styles.checkInputCorrect,
                checkFeedback === 'wrong' && styles.checkInputWrong,
              ]}
              value={checkInput}
              onChangeText={(v) => setCheckInput(v.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 8))}
              placeholder="•••••"
              placeholderTextColor="#64748B"
              keyboardType="number-pad"
              maxLength={8}
              editable={!checkSubmitting && !checkFeedback}
              autoFocus
            />
            {checkFeedback === 'correct' && (
              <Text style={styles.feedbackCorrect}>{isZh ? '✓ 正確！' : '✓ Correct!'}</Text>
            )}
            {checkFeedback === 'wrong' && (
              <Text style={styles.feedbackWrong}>{isZh ? '✗ 錯誤' : '✗ Incorrect'}</Text>
            )}
            <TouchableOpacity
              style={[styles.checkSubmit, (!checkInput.trim() || checkSubmitting || !!checkFeedback) && styles.checkSubmitDisabled]}
              onPress={() => void submitAttentionCheck()}
              disabled={!checkInput.trim() || checkSubmitting || !!checkFeedback}
              activeOpacity={0.85}
            >
              {checkSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.checkSubmitText}>{isZh ? '提交' : 'Submit'}</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Live quiz prompt */}
      <Modal visible={!!activeQuiz} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.modalBackdrop}>
          <View style={styles.quizCard}>
            <View style={styles.quizIconWrap}>
              <ClipboardList size={26} color="#fff" />
            </View>
            <Text style={styles.quizTitle}>
              {isZh ? '測驗開始' : 'Quiz Started'}
            </Text>
            <Text style={styles.quizSubtitle}>
              {activeQuiz?.session_name || (isZh ? '主持人發起測驗' : 'The host has launched a quiz')}
            </Text>
            <TouchableOpacity
              style={styles.quizPrimaryBtn}
              onPress={() => {
                if (!activeQuiz) return;
                setQuizHandledIds((s) => new Set(s).add(activeQuiz.session_id));
                const q = activeQuiz;
                setActiveQuiz(null);
                router.push({
                  pathname: '/quiz-take',
                  params: {
                    sessionId: q.session_id,
                    quizId: q.quiz_id,
                    sessionName: q.session_name || '',
                  },
                } as never);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.quizPrimaryBtnText}>{isZh ? '開始測驗' : 'Start Quiz'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quizSecondaryBtn}
              onPress={() => {
                if (activeQuiz) setQuizHandledIds((s) => new Set(s).add(activeQuiz.session_id));
                setActiveQuiz(null);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.quizSecondaryBtnText}>{isZh ? '稍後' : 'Later'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Summary */}
      <Modal visible={showSummary} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.modalBackdrop}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <Award size={32} color="#fff" />
            </View>
            <Text style={styles.summaryTitle}>{isZh ? '講座結束' : 'Lecture Ended'}</Text>
            <Text style={styles.summarySubtitle}>{isZh ? '感謝您的參與' : 'Thanks for joining'}</Text>
            <View style={styles.summaryStatsRow}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>{summaryStats?.minutes ?? 0}</Text>
                <Text style={styles.summaryStatLabel}>{isZh ? '分鐘' : 'min'}</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>
                  {summaryStats ? `${summaryStats.passed}/${summaryStats.total}` : '0/0'}
                </Text>
                <Text style={styles.summaryStatLabel}>{isZh ? '點名' : 'Checks'}</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={[
                  styles.summaryStatValue,
                  { color: certificateEligible(event, summaryStats) ? '#22C55E' : '#EF4444' },
                ]}>
                  {certificateEligible(event, summaryStats) ? '✓' : '—'}
                </Text>
                <Text style={styles.summaryStatLabel}>{isZh ? '證書' : 'Cert.'}</Text>
              </View>
            </View>
            <Text style={styles.certNote}>
              {certificateEligible(event, summaryStats)
                ? (isZh ? '您符合領取證書的資格' : 'You are eligible for a certificate')
                : (isZh ? '未達領取證書的最低要求' : 'Minimum requirements not met')}
            </Text>
            <TouchableOpacity
              style={styles.summaryBtn}
              onPress={() => void cleanupAndExit('ended')}
              activeOpacity={0.85}
            >
              <Text style={styles.summaryBtnText}>{isZh ? '完成' : 'Done'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function certificateEligible(event: LectureEvent | null, stats: { minutes: number; passed: number; total: number } | null): boolean {
  if (!event || !stats) return false;
  const minMin = event.certificate_min_minutes || 0;
  const minPct = event.certificate_min_attention_pct || 0;
  if (stats.minutes < minMin) return false;
  if (stats.total > 0) {
    const pct = (stats.passed / stats.total) * 100;
    if (pct < minPct) return false;
  }
  return true;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#E5E7EB', fontSize: 14, fontWeight: '500' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0B1220',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 12,
  },
  topLeft: { flex: 1, gap: 4 },
  sessionTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  divider: { width: 1, height: 10, backgroundColor: '#334155', marginHorizontal: 4 },
  offlineBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' },
  videoArea: { backgroundColor: '#000', position: 'relative' },
  videoPlaceholder: {
    backgroundColor: '#0F172A',
    alignItems: 'center', justifyContent: 'center',
    gap: 10,
  },
  placeholderText: { color: '#64748B', fontSize: 13, fontWeight: '600' },
  metaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0B1220',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  langPicker: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  langPickerText: { color: '#CBD5E1', fontSize: 12, fontWeight: '700' },
  speakerText: { color: '#94A3B8', fontSize: 12, fontWeight: '600', maxWidth: 200 },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#0B1220',
  },
  bottomHint: { color: '#64748B', fontSize: 12, fontWeight: '500', flex: 1 },
  leaveBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.12)',
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  leaveBtnText: { color: '#FCA5A5', fontSize: 13, fontWeight: '700' },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  langSheet: {
    width: '100%', maxWidth: 360,
    backgroundColor: '#fff', borderRadius: 16,
    padding: 8,
  },
  langSheetTitle: { fontSize: 14, fontWeight: '700', color: '#1F2937', padding: 12 },
  langRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 14,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  langRowText: { fontSize: 15, color: '#1F2937', fontWeight: '500' },

  checkCard: {
    width: '100%', maxWidth: 380,
    backgroundColor: '#0F172A',
    borderRadius: 22,
    padding: 22,
    borderWidth: 1, borderColor: '#1E293B',
    gap: 12,
  },
  checkHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  checkTitle: { color: '#fff', fontSize: 17, fontWeight: '800', flex: 1 },
  timerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: '#1E293B', borderRadius: 999,
  },
  timerText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  checkSubtitle: { color: '#94A3B8', fontSize: 13, fontWeight: '500' },
  checkInput: {
    backgroundColor: '#020617',
    color: '#fff',
    fontSize: 32, fontWeight: '800',
    letterSpacing: 12,
    textAlign: 'center',
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 2, borderColor: '#1E293B',
  },
  checkInputCorrect: { borderColor: '#22C55E', backgroundColor: 'rgba(34,197,94,0.08)' },
  checkInputWrong: { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.08)' },
  feedbackCorrect: { color: '#22C55E', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  feedbackWrong: { color: '#EF4444', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  checkSubmit: {
    backgroundColor: ACCENT, paddingVertical: 14, borderRadius: 12,
    alignItems: 'center', marginTop: 4,
  },
  checkSubmitDisabled: { opacity: 0.5 },
  checkSubmitText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  quizCard: {
    width: '100%', maxWidth: 360,
    backgroundColor: '#fff', borderRadius: 22, padding: 24,
    alignItems: 'center', gap: 8,
  },
  quizIconWrap: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  quizTitle: { fontSize: 19, fontWeight: '800', color: '#0F172A' },
  quizSubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 8 },
  quizPrimaryBtn: {
    width: '100%', backgroundColor: '#10B981',
    paddingVertical: 14, borderRadius: 12, alignItems: 'center',
  },
  quizPrimaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  quizSecondaryBtn: { paddingVertical: 12 },
  quizSecondaryBtnText: { color: '#6B7280', fontSize: 14, fontWeight: '600' },

  summaryCard: {
    width: '100%', maxWidth: 380,
    backgroundColor: '#fff', borderRadius: 22, padding: 24,
    alignItems: 'center', gap: 6,
  },
  summaryIconWrap: {
    width: 64, height: 64, borderRadius: 18, backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  summaryTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  summarySubtitle: { fontSize: 13, color: '#6B7280', marginBottom: 16 },
  summaryStatsRow: { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 12 },
  summaryStat: {
    flex: 1, backgroundColor: '#F1F5F9', borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  summaryStatValue: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  summaryStatLabel: { fontSize: 11, color: '#64748B', fontWeight: '700', marginTop: 2, letterSpacing: 0.4 },
  certNote: { fontSize: 13, color: '#374151', textAlign: 'center', marginBottom: 14, fontWeight: '500' },
  summaryBtn: {
    width: '100%', backgroundColor: ACCENT_DARK,
    paddingVertical: 14, borderRadius: 12, alignItems: 'center',
  },
  summaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  liveBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(239,68,68,0.92)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 5,
  },
  liveBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  liveOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  liveOverlayText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
