import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Image,
  Animated,
  Easing,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LogOut, Users, Wifi } from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

const ACCENT = '#6366F1';

const STORAGE_KEYS = {
  SESSION_ID: 'group_session_id',
  PARTICIPANT_ID: 'group_participant_id',
  PARTICIPANT_TOKEN: 'group_participant_token',
};

type CurrentState = {
  type?: 'idle' | 'text' | 'image' | 'stimulus' | 'video' | 'instruction';
  title?: string;
  subtitle?: string;
  text?: string;
  imageUrl?: string;
  stimulus?: { word?: string; phonetic?: string; imageUrl?: string };
  [key: string]: unknown;
} | null;

export default function GroupParticipantScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string; participantId?: string }>();
  const { language, patientName } = useApp();
  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [sessionId, setSessionId] = useState<string | null>(params.sessionId || null);
  const [participantId, setParticipantId] = useState<string | null>(params.participantId || null);
  const [sessionName, setSessionName] = useState<string>('');
  const [sessionStatus, setSessionStatus] = useState<string>('active');
  const [currentState, setCurrentState] = useState<CurrentState>(null);
  const [participantCount, setParticipantCount] = useState<number>(0);
  const [connected, setConnected] = useState<boolean>(true);
  const [reconnects, setReconnects] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const lastDisconnectRef = useRef<number | null>(null);
  const dotPulse = useRef(new Animated.Value(0)).current;

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

  // Load from storage if missing
  useEffect(() => {
    if (sessionId && participantId) return;
    void (async () => {
      const [sid, pid] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.SESSION_ID),
        AsyncStorage.getItem(STORAGE_KEYS.PARTICIPANT_ID),
      ]);
      if (sid) setSessionId(sid);
      if (pid) setParticipantId(pid);
      if (!sid || !pid) {
        router.replace('/(tabs)/home' as any);
      }
    })();
  }, [sessionId, participantId, router]);

  const cleanupAndExit = useCallback(async (reason: 'ended' | 'manual' | 'kicked') => {
    if (participantId) {
      try {
        if (reason === 'manual') {
          await supabase.from('group_participants').update({ status: 'left' }).eq('id', participantId);
        }
      } catch (e) {
        log('[GroupParticipant] cleanup error:', e);
      }
    }
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.SESSION_ID,
      STORAGE_KEYS.PARTICIPANT_ID,
      STORAGE_KEYS.PARTICIPANT_TOKEN,
    ]);
    router.replace('/(tabs)/home' as any);
  }, [participantId, router]);

  // Poll session state every 2s
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const { data, error } = await supabase
          .from('group_sessions')
          .select('current_state, status, session_name')
          .eq('id', sessionId)
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
          // Reconnected — log gap
          const gap = lastDisconnectRef.current ? Date.now() - lastDisconnectRef.current : 0;
          lastDisconnectRef.current = null;
          setConnected(true);
          setReconnects((c) => c + 1);
          if (participantId) {
            try {
              await supabase.from('disconnection_log').insert({
                session_id: sessionId,
                participant_id: participantId,
                gap_ms: gap,
                reconnected_at: new Date().toISOString(),
              });
              await supabase.rpc('increment_reconnection_count', { p_participant_id: participantId }).catch(() => {});
              await supabase
                .from('group_participants')
                .update({ reconnection_count: reconnects + 1 })
                .eq('id', participantId)
                .catch(() => {});
            } catch (e) {
              log('[GroupParticipant] reconnect log error:', e);
            }
          }
        }

        setSessionName(data.session_name || '');
        setSessionStatus(data.status || 'active');
        setCurrentState((data.current_state as CurrentState) || null);
        setLoading(false);

        if (data.status === 'ended') {
          if (Platform.OS === 'web') {
            window.alert(isZh ? '小組已結束' : 'Session ended');
          } else {
            Alert.alert(
              isZh ? '小組已結束' : 'Session ended',
              isZh ? '感謝您的參與' : 'Thanks for participating',
              [{ text: 'OK', onPress: () => void cleanupAndExit('ended') }]
            );
          }
          if (Platform.OS === 'web') void cleanupAndExit('ended');
        }
      } catch (e) {
        log('[GroupParticipant] poll error:', e);
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
  }, [sessionId, participantId, connected, reconnects, isZh, cleanupAndExit]);

  // Verify participant still accepted; track presence
  useEffect(() => {
    if (!participantId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        await supabase
          .from('group_participants')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', participantId);

        const { data } = await supabase
          .from('group_participants')
          .select('status')
          .eq('id', participantId)
          .maybeSingle();
        if (cancelled || !data) return;
        if (data.status === 'kicked' || data.status === 'rejected') {
          if (Platform.OS === 'web') {
            window.alert(isZh ? '您已被移出小組' : 'You have been removed from the session');
          } else {
            Alert.alert(
              isZh ? '已被移出' : 'Removed',
              isZh ? '主持人已將您移出小組' : 'The host has removed you from the session',
              [{ text: 'OK', onPress: () => void cleanupAndExit('kicked') }]
            );
          }
        }
      } catch (e) {
        log('[GroupParticipant] presence error:', e);
      }
    };

    void tick();
    const interval = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [participantId, isZh, cleanupAndExit]);

  // Participant count
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { count } = await supabase
          .from('group_participants')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', sessionId)
          .in('status', ['accepted', 'active']);
        if (!cancelled && typeof count === 'number') setParticipantCount(count);
      } catch {}
    };
    void tick();
    const interval = setInterval(tick, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);

  const dotOpacity = dotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  const stateContent = useMemo(() => {
    if (!currentState || !currentState.type || currentState.type === 'idle') {
      return (
        <View style={styles.idleWrap}>
          <View style={styles.idleIconWrap}>
            <Users size={48} color={ACCENT} />
          </View>
          <Text style={styles.idleTitle}>
            {isZh ? '請稍候' : 'Hold on'}
          </Text>
          <Text style={styles.idleSubtitle}>
            {isZh ? '主持人即將開始' : 'The host will begin shortly'}
          </Text>
        </View>
      );
    }

    if (currentState.type === 'text' || currentState.type === 'instruction') {
      return (
        <ScrollView contentContainerStyle={styles.contentScroll}>
          {currentState.title ? <Text style={styles.contentTitle}>{currentState.title}</Text> : null}
          {currentState.text ? <Text style={styles.contentText}>{currentState.text}</Text> : null}
          {currentState.subtitle ? <Text style={styles.contentSubtitle}>{currentState.subtitle}</Text> : null}
        </ScrollView>
      );
    }

    if (currentState.type === 'image' && currentState.imageUrl) {
      return (
        <View style={styles.imageWrap}>
          {currentState.title ? <Text style={styles.contentTitle}>{currentState.title}</Text> : null}
          <Image source={{ uri: currentState.imageUrl }} style={styles.imageContent} resizeMode="contain" />
          {currentState.subtitle ? <Text style={styles.contentSubtitle}>{currentState.subtitle}</Text> : null}
        </View>
      );
    }

    if (currentState.type === 'stimulus' && currentState.stimulus) {
      const s = currentState.stimulus;
      return (
        <View style={styles.stimulusWrap}>
          {s.imageUrl ? (
            <Image source={{ uri: s.imageUrl }} style={styles.stimulusImage} resizeMode="contain" />
          ) : null}
          {s.word ? <Text style={styles.stimulusWord}>{s.word}</Text> : null}
          {s.phonetic ? <Text style={styles.stimulusPhonetic}>{s.phonetic}</Text> : null}
        </View>
      );
    }

    return (
      <View style={styles.idleWrap}>
        <Text style={styles.idleSubtitle}>{isZh ? '正在顯示內容...' : 'Showing content...'}</Text>
      </View>
    );
  }, [currentState, isZh]);

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

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <Text style={styles.sessionTitle} numberOfLines={1}>
              {sessionName || (isZh ? '小組訓練' : 'Group Session')}
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
              <Users size={12} color="#6B7280" />
              <Text style={styles.statusText}>{participantCount}</Text>
            </View>
          </View>
          <Text style={styles.youName} numberOfLines={1}>
            {patientName || ''}
          </Text>
          {!connected && (
            <View style={styles.offlineBadge}>
              <Wifi size={12} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.contentArea}>{stateContent}</View>

        <View style={styles.bottomBar}>
          <Text style={styles.bottomHint}>
            {isZh ? '只供觀看，請依主持人指示' : 'View-only • Follow host instructions'}
          </Text>
          <TouchableOpacity
            style={styles.leaveBtn}
            onPress={() => void cleanupAndExit('manual')}
            activeOpacity={0.7}
          >
            <LogOut size={14} color="#DC2626" />
            <Text style={styles.leaveBtnText}>{isZh ? '離開' : 'Leave'}</Text>
          </TouchableOpacity>
        </View>

        {sessionStatus === 'ended' && (
          <View style={styles.endedOverlay}>
            <Text style={styles.endedText}>{isZh ? '小組已結束' : 'Session ended'}</Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1020' },
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#E5E7EB', fontSize: 14, fontWeight: '500' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
    gap: 12,
  },
  topLeft: { flex: 1, gap: 4 },
  sessionTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#9CA3AF', fontSize: 12, fontWeight: '600' },
  divider: { width: 1, height: 10, backgroundColor: '#374151', marginHorizontal: 4 },
  youName: { color: '#9CA3AF', fontSize: 12, fontWeight: '600', maxWidth: 120 },
  offlineBadge: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
  },
  contentArea: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  contentScroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 32 },
  contentTitle: { color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  contentText: { color: '#E5E7EB', fontSize: 20, fontWeight: '500', lineHeight: 30, textAlign: 'center' },
  contentSubtitle: { color: '#9CA3AF', fontSize: 16, fontWeight: '500', textAlign: 'center', marginTop: 16 },
  imageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, width: '100%' },
  imageContent: { width: '100%', flex: 1, maxHeight: '70%' },
  stimulusWrap: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  stimulusImage: { width: 240, height: 240, borderRadius: 20 },
  stimulusWord: { color: '#fff', fontSize: 56, fontWeight: '900', letterSpacing: 2 },
  stimulusPhonetic: { color: ACCENT, fontSize: 24, fontWeight: '600', fontStyle: 'italic' },
  idleWrap: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  idleIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(99,102,241,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  idleTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  idleSubtitle: { color: '#9CA3AF', fontSize: 15, fontWeight: '500' },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    backgroundColor: '#111827',
  },
  bottomHint: { color: '#6B7280', fontSize: 12, fontWeight: '500', flex: 1 },
  leaveBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(220,38,38,0.12)',
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  leaveBtnText: { color: '#DC2626', fontSize: 13, fontWeight: '700' },
  endedOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(11,16,32,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  endedText: { color: '#fff', fontSize: 22, fontWeight: '800' },
});
