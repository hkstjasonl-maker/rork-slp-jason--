import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QrCode, Keyboard, X, ScanLine, ArrowLeft, GraduationCap, User, Mail, Calendar, Mic, AlertTriangle, Ticket } from 'lucide-react-native';
import { Linking } from 'react-native';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

const ACCENT = '#6366F1';
const ACCENT_DARK = '#4F46E5';
const LECTURE_ACCENT = '#3B82F6';

type Mode = 'choose' | 'scan' | 'manual' | 'waiting' | 'lectureDetails';

const STORAGE_KEYS = {
  GROUP_SESSION_ID: 'group_session_id',
  GROUP_PARTICIPANT_ID: 'group_participant_id',
  GROUP_PARTICIPANT_TOKEN: 'group_participant_token',
  LECTURE_EVENT_ID: 'lecture_event_id',
  LECTURE_ATTENDEE_ID: 'lecture_attendee_id',
  LECTURE_ATTENDEE_TOKEN: 'lecture_attendee_token',
};

type LectureEvent = {
  id: string;
  status: string;
  title_en?: string | null;
  title_zh?: string | null;
  speaker_name_en?: string | null;
  speaker_name_zh?: string | null;
  scheduled_start?: string | null;
  session_code?: string | null;
  requires_registration?: boolean | null;
  requires_payment?: boolean | null;
  ticket_price?: number | null;
  ticket_currency?: string | null;
};

function generateToken(): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand()}-${rand()}`;
}

function extractSessionCode(input: string): string {
  const trimmed = input.trim();
  const m = trimmed.match(/code=([A-Za-z0-9]{4,12})/i);
  if (m) return m[1].toUpperCase();
  return trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function formatScheduled(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SessionJoinScreen() {
  const router = useRouter();
  const { language, patientId, patientName } = useApp();
  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [mode, setMode] = useState<Mode>('choose');
  const [code, setCode] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Group state
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [groupSessionId, setGroupSessionId] = useState<string | null>(null);

  // Lecture state
  const [lectureEvent, setLectureEvent] = useState<LectureEvent | null>(null);
  const [displayName, setDisplayName] = useState<string>(patientName || '');
  const [email, setEmail] = useState<string>('');

  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef<boolean>(false);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (patientName && !displayName) setDisplayName(patientName);
  }, [patientName, displayName]);

  useEffect(() => {
    if (mode !== 'waiting') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [mode, pulseAnim]);

  const joinGroupSession = useCallback(async (sessionRow: { id: string }) => {
    if (!patientId) {
      setError(isZh ? '請先登入' : 'Please log in first');
      setSubmitting(false);
      return;
    }
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const token = generateToken();

    const { data: existing } = await supabase
      .from('group_participants')
      .select('id, status, participant_token')
      .eq('session_id', sessionRow.id)
      .eq('patient_id', patientId)
      .maybeSingle();

    let pId: string;
    let pToken: string;

    if (existing) {
      pId = existing.id;
      pToken = existing.participant_token || token;
      if (existing.status === 'rejected' || existing.status === 'kicked') {
        await supabase
          .from('group_participants')
          .update({
            status: 'requested',
            participant_token: token,
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        pToken = token;
      }
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('group_participants')
        .insert({
          session_id: sessionRow.id,
          user_type: 'patient',
          patient_id: patientId,
          auth_user_id: authUser?.id || null,
          display_name: patientName || (isZh ? '參加者' : 'Participant'),
          status: 'requested',
          participant_token: token,
          last_seen_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertErr || !inserted) {
        log('[SessionJoin] Insert participant failed:', insertErr);
        setError(isZh ? '加入失敗，請再試' : 'Failed to join, please try again');
        setSubmitting(false);
        return;
      }
      pId = inserted.id;
      pToken = token;
    }

    await AsyncStorage.multiSet([
      [STORAGE_KEYS.GROUP_SESSION_ID, sessionRow.id],
      [STORAGE_KEYS.GROUP_PARTICIPANT_ID, pId],
      [STORAGE_KEYS.GROUP_PARTICIPANT_TOKEN, pToken],
    ]);

    setGroupSessionId(sessionRow.id);
    setParticipantId(pId);
    setMode('waiting');
    setSubmitting(false);
  }, [isZh, patientId, patientName]);

  const lookupAndRoute = useCallback(async (rawCode: string) => {
    const sessionCode = extractSessionCode(rawCode);
    if (!sessionCode || sessionCode.length < 4) {
      setError(isZh ? '請輸入有效代碼' : 'Please enter a valid code');
      scannedRef.current = false;
      return;
    }
    if (!patientId) {
      setError(isZh ? '請先登入' : 'Please log in first');
      scannedRef.current = false;
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      log('[SessionJoin] Looking up session code:', sessionCode);

      // 1. Try group_sessions
      const { data: groupSession } = await supabase
        .from('group_sessions')
        .select('id, status, session_name')
        .eq('session_code', sessionCode)
        .in('status', ['waiting', 'active'])
        .maybeSingle();

      if (groupSession) {
        log('[SessionJoin] Matched group_sessions:', groupSession.id);
        await joinGroupSession(groupSession);
        return;
      }

      // 2. Try quiz_sessions
      const { data: quizSession } = await supabase
        .from('quiz_sessions')
        .select('id, status, quiz_id, session_name')
        .eq('session_code', sessionCode)
        .in('status', ['active', 'waiting'])
        .maybeSingle();

      if (quizSession) {
        log('[SessionJoin] Matched quiz_sessions:', quizSession.id);
        router.replace({
          pathname: '/quiz-take',
          params: {
            sessionId: quizSession.id,
            quizId: quizSession.quiz_id,
            sessionName: quizSession.session_name || '',
          },
        } as never);
        return;
      }

      // 3. Try lecture_events
      const { data: lectureRow } = await supabase
        .from('lecture_events')
        .select('id, status, title_en, title_zh, speaker_name_en, speaker_name_zh, scheduled_start, session_code, requires_registration, requires_payment, ticket_price, ticket_currency')
        .eq('session_code', sessionCode)
        .in('status', ['scheduled', 'live'])
        .maybeSingle();

      if (lectureRow) {
        log('[SessionJoin] Matched lecture_events:', lectureRow.id);
        setLectureEvent(lectureRow as LectureEvent);
        setMode('lectureDetails');
        setSubmitting(false);
        return;
      }

      setError(isZh ? '找不到或已過期' : 'Session not found or expired');
      setSubmitting(false);
      scannedRef.current = false;
    } catch (e) {
      log('[SessionJoin] lookup error:', e);
      setError(isZh ? '網絡錯誤' : 'Network error');
      setSubmitting(false);
      scannedRef.current = false;
    }
  }, [isZh, patientId, joinGroupSession, router]);

  // Polling for group approval
  useEffect(() => {
    if (mode !== 'waiting' || !participantId || !groupSessionId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data, error: err } = await supabase
          .from('group_participants')
          .select('status')
          .eq('id', participantId)
          .maybeSingle();
        if (cancelled || err || !data) return;
        if (data.status === 'accepted' || data.status === 'active') {
          router.replace({
            pathname: '/group-participant',
            params: { sessionId: groupSessionId, participantId },
          } as never);
        } else if (data.status === 'rejected' || data.status === 'kicked') {
          if (Platform.OS === 'web') {
            window.alert(isZh ? '主持人未批准您的請求' : 'Host did not approve your request');
          } else {
            Alert.alert(
              isZh ? '請求被拒絕' : 'Request Rejected',
              isZh ? '主持人未批准您的請求' : 'Host did not approve your request'
            );
          }
          await AsyncStorage.multiRemove([
            STORAGE_KEYS.GROUP_SESSION_ID,
            STORAGE_KEYS.GROUP_PARTICIPANT_ID,
            STORAGE_KEYS.GROUP_PARTICIPANT_TOKEN,
          ]);
          router.back();
        }
      } catch (e) {
        log('[SessionJoin] poll error:', e);
      }
    };
    void tick();
    const interval = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mode, participantId, groupSessionId, router, isZh]);

  const submitLectureJoin = useCallback(async () => {
    if (!lectureEvent) return;
    const name = displayName.trim();
    if (!name) {
      setError(isZh ? '請輸入您的名稱' : 'Please enter your name');
      return;
    }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(isZh ? '電郵格式無效' : 'Invalid email');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();

      // Registration check for paid/registered events
      let registrationId: string | null = null;
      try {
        const { data: regResult, error: regErr } = await supabase.rpc('check_lecture_registration', {
          p_event_id: lectureEvent.id,
          p_auth_user_id: authUser?.id || null,
        });
        if (regErr) {
          log('[SessionJoin] check_lecture_registration error:', regErr);
        }
        const result = (Array.isArray(regResult) ? regResult[0] : regResult) as { status?: string; registration_id?: string | null } | null;
        const status = result?.status;
        if (status === 'not_registered') {
          setSubmitting(false);
          const title = isZh ? '需要登記 Registration Required' : 'Registration Required 需要登記';
          const msg = isZh
            ? '您必須先登記此活動才可加入。請前往我們的網站登記。\nYou need to register for this event before joining. Please visit our website to register.'
            : 'You need to register for this event before joining. Please visit our website to register.\n您必須先登記此活動才可加入。請前往我們的網站登記。';
          if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
          else Alert.alert(title, msg);
          return;
        }
        if (status === 'payment_pending') {
          setSubmitting(false);
          const title = isZh ? '付款待確認 Payment Pending' : 'Payment Pending 付款待確認';
          const msg = isZh
            ? '已找到您的登記，但付款尚未確認。請聯絡主辦方。\nYour registration was found but payment has not been confirmed yet. Please contact the organizer.'
            : 'Your registration was found but payment has not been confirmed yet. Please contact the organizer.\n已找到您的登記，但付款尚未確認。請聯絡主辦方。';
          if (Platform.OS === 'web') {
            window.alert(`${title}\n\n${msg}`);
          } else {
            Alert.alert(title, msg, [
              { text: isZh ? '聯絡 Contact' : 'Contact 聯絡', onPress: () => { void Linking.openURL('mailto:info@dravive.com'); } },
              { text: isZh ? '取消 Cancel' : 'Cancel 取消', style: 'cancel' },
            ]);
          }
          return;
        }
        registrationId = result?.registration_id || null;
      } catch (regCatchErr) {
        log('[SessionJoin] registration check threw:', regCatchErr);
      }

      const token = generateToken();

      const { data: existing } = await supabase
        .from('lecture_attendees')
        .select('id, participant_token')
        .eq('event_id', lectureEvent.id)
        .eq('patient_id', patientId || '')
        .maybeSingle();

      let attendeeId: string;
      let attendeeToken: string;

      if (existing) {
        attendeeId = existing.id;
        attendeeToken = existing.participant_token || token;
        await supabase
          .from('lecture_attendees')
          .update({
            display_name: name,
            email: email.trim() || null,
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('lecture_attendees')
          .insert({
            event_id: lectureEvent.id,
            patient_id: patientId || null,
            auth_user_id: authUser?.id || null,
            display_name: name,
            email: email.trim() || null,
            participant_token: token,
            status: 'joined',
            first_join_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            ...(registrationId ? { registration_id: registrationId, auto_approved: true } : {}),
          })
          .select('id')
          .single();

        if (insertErr || !inserted) {
          console.log('[SessionJoin] insert attendee error:', JSON.stringify(insertErr));
          log('[SessionJoin] insert attendee failed:', insertErr);
          setError(insertErr?.message || (isZh ? '加入失敗，請再試' : 'Failed to join, please try again'));
          setSubmitting(false);
          return;
        }
        attendeeId = inserted.id;
        attendeeToken = token;
      }

      await AsyncStorage.multiSet([
        [STORAGE_KEYS.LECTURE_EVENT_ID, lectureEvent.id],
        [STORAGE_KEYS.LECTURE_ATTENDEE_ID, attendeeId],
        [STORAGE_KEYS.LECTURE_ATTENDEE_TOKEN, attendeeToken],
      ]);

      router.replace({
        pathname: '/lecture-viewer',
        params: {
          eventId: lectureEvent.id,
          attendeeId,
          eventTitle: lectureEvent.title_en || '',
        },
      } as never);
    } catch (e) {
      console.log('[SessionJoin] submit lecture exception:', JSON.stringify(e instanceof Error ? { message: e.message, stack: e.stack } : e));
      log('[SessionJoin] submit lecture error:', e);
      const msg = e instanceof Error ? e.message : null;
      setError(msg || (isZh ? '網絡錯誤' : 'Network error'));
    } finally {
      setSubmitting(false);
    }
  }, [lectureEvent, displayName, email, isZh, patientId, router]);

  const handleQRScanned = useCallback((data: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    void lookupAndRoute(data.data);
  }, [lookupAndRoute]);

  const cancelWaiting = useCallback(async () => {
    if (participantId) {
      try {
        await supabase
          .from('group_participants')
          .update({ status: 'cancelled' })
          .eq('id', participantId);
      } catch (e) {
        log('[SessionJoin] cancel error:', e);
      }
    }
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.GROUP_SESSION_ID,
      STORAGE_KEYS.GROUP_PARTICIPANT_ID,
      STORAGE_KEYS.GROUP_PARTICIPANT_TOKEN,
    ]);
    router.back();
  }, [participantId, router]);

  const headerTitle = isZh ? '加入活動' : 'Join Session';

  if (mode === 'waiting') {
    const scale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });
    const opacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0.4] });
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.waitContainer}>
          <View style={styles.pulseWrap}>
            <Animated.View style={[styles.pulseRing, { transform: [{ scale }], opacity }]} />
            <View style={styles.pulseCore}>
              <QrCode size={42} color="#fff" />
            </View>
          </View>
          <Text style={styles.waitTitle}>
            {isZh ? '等待批准...' : 'Waiting for approval...'}
          </Text>
          <Text style={styles.waitSubtitle}>
            {isZh ? '主持人需確認您的請求' : 'The host needs to approve your request'}
          </Text>
          <TouchableOpacity style={styles.cancelButton} onPress={cancelWaiting} activeOpacity={0.8}>
            <Text style={styles.cancelButtonText}>{isZh ? '取消' : 'Cancel'}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  if (mode === 'scan') {
    if (!permission) {
      return (
        <View style={styles.root}>
          <SafeAreaView style={styles.center}><ActivityIndicator color={ACCENT} /></SafeAreaView>
        </View>
      );
    }
    if (!permission.granted) {
      return (
        <View style={styles.root}>
          <SafeAreaView style={styles.center}>
            <Text style={styles.permissionText}>
              {isZh ? '需要相機權限以掃描 QR 碼' : 'Camera permission is required to scan QR codes'}
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void requestPermission()}>
              <Text style={styles.primaryBtnText}>{isZh ? '允許相機' : 'Grant Permission'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={() => setMode('choose')}>
              <Text style={styles.linkBtnText}>{isZh ? '返回' : 'Back'}</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      );
    }
    return (
      <View style={styles.scanRoot}>
        {Platform.OS !== 'web' && (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleQRScanned}
          />
        )}
        <SafeAreaView style={styles.scanOverlay}>
          <View style={styles.scanHeader}>
            <TouchableOpacity style={styles.scanCloseBtn} onPress={() => { scannedRef.current = false; setMode('choose'); }}>
              <X size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.scanHeaderTitle}>{isZh ? '掃描 QR 碼' : 'Scan QR Code'}</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.scanCenter}>
            <View style={styles.scanFrame}>
              <ScanLine size={64} color={ACCENT} />
            </View>
            <Text style={styles.scanHint}>
              {isZh ? '將 QR 碼置於框內' : 'Position the QR code inside the frame'}
            </Text>
          </View>
          {submitting && (
            <View style={styles.scanLoading}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.scanLoadingText}>{isZh ? '查詢中...' : 'Looking up...'}</Text>
            </View>
          )}
        </SafeAreaView>
      </View>
    );
  }

  if (mode === 'lectureDetails' && lectureEvent) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => { setLectureEvent(null); setError(null); setMode('choose'); }}>
              <ArrowLeft size={22} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{isZh ? '參加講座' : 'Join Lecture'}</Text>
            <View style={{ width: 40 }} />
          </View>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView contentContainerStyle={styles.detailsBody} keyboardShouldPersistTaps="handled">
              <View style={styles.eventCard}>
                <View style={styles.eventIconWrap}>
                  <GraduationCap size={28} color="#fff" />
                </View>
                <Text style={styles.eventTitle}>{lectureEvent.title_en || (isZh ? '講座' : 'Lecture')}</Text>
                {lectureEvent.title_zh ? (
                  <Text style={[styles.eventTitle, { fontSize: 16, marginTop: 2, opacity: 0.85 }]}>{lectureEvent.title_zh}</Text>
                ) : null}
                {lectureEvent.speaker_name_en ? (
                  <View style={styles.eventRow}>
                    <Mic size={14} color="#6B7280" />
                    <Text style={styles.eventMeta}>
                      {lectureEvent.speaker_name_en}
                      {lectureEvent.speaker_name_zh ? ` / ${lectureEvent.speaker_name_zh}` : ''}
                    </Text>
                  </View>
                ) : null}
                {lectureEvent.scheduled_start ? (
                  <View style={styles.eventRow}>
                    <Calendar size={14} color="#6B7280" />
                    <Text style={styles.eventMeta}>{formatScheduled(lectureEvent.scheduled_start)}</Text>
                  </View>
                ) : null}
                <View style={[styles.statusPill, lectureEvent.status === 'live' ? styles.statusLive : styles.statusScheduled]}>
                  <Text style={styles.statusPillText}>
                    {lectureEvent.status === 'live'
                      ? (isZh ? '直播中' : 'LIVE')
                      : (isZh ? '即將開始' : 'Scheduled')}
                  </Text>
                </View>
                {lectureEvent.requires_payment && typeof lectureEvent.ticket_price === 'number' && lectureEvent.ticket_price > 0 ? (
                  <View style={styles.ticketRow}>
                    <Ticket size={14} color="#92400E" />
                    <Text style={styles.ticketText}>
                      {(isZh ? '門票' : 'Ticket')}: {(lectureEvent.ticket_currency || 'HKD')} {lectureEvent.ticket_price}
                    </Text>
                  </View>
                ) : null}
              </View>

              {lectureEvent.requires_registration ? (
                <View style={styles.regBanner}>
                  <AlertTriangle size={18} color="#92400E" />
                  <Text style={styles.regBannerText}>
                    {isZh
                      ? '此活動需要登記。您必須先登記並付款才能加入。\nThis event requires registration. You must register and pay before joining.'
                      : 'This event requires registration. You must register and pay before joining.\n此活動需要登記。您必須先登記並付款才能加入。'}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.sectionLabel}>
                {isZh ? '輸入您希望顯示在證書上的名稱' : 'Enter your name as you want it on the certificate'}
              </Text>
              <View style={styles.inputWrap}>
                <User size={18} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder={isZh ? '您的姓名' : 'Your full name'}
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="words"
                  maxLength={80}
                />
              </View>

              <Text style={styles.sectionLabel}>
                {isZh ? '電郵（可選，用於發送證書）' : 'Email (optional, for certificate delivery)'}
              </Text>
              <View style={styles.inputWrap}>
                <Mail size={18} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="name@example.com"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  maxLength={120}
                />
              </View>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: LECTURE_ACCENT }, (submitting || !displayName.trim()) && styles.primaryBtnDisabled]}
                onPress={() => void submitLectureJoin()}
                disabled={submitting || !displayName.trim()}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>{isZh ? '加入' : 'Join'}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={22} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <View style={{ width: 40 }} />
        </View>

        {mode === 'manual' ? (
          <View style={styles.body}>
            <Text style={styles.label}>{isZh ? '輸入活動代碼' : 'Enter session code'}</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              placeholder={isZh ? '例如：ABC123' : 'e.g. ABC123'}
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              autoFocus
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
            <TouchableOpacity
              style={[styles.primaryBtn, (!code.trim() || submitting) && styles.primaryBtnDisabled]}
              onPress={() => void lookupAndRoute(code)}
              disabled={!code.trim() || submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>{isZh ? '加入' : 'Join'}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={() => { setError(null); setMode('choose'); }}>
              <Text style={styles.linkBtnText}>{isZh ? '使用其他方式' : 'Try another method'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.body}>
            <Text style={styles.intro}>
              {isZh
                ? '加入小組訓練、測驗或講座'
                : 'Join a group session, quiz, or lecture'}
            </Text>
            <TouchableOpacity
              style={styles.choiceCard}
              onPress={() => { scannedRef.current = false; setMode('scan'); }}
              activeOpacity={0.85}
            >
              <View style={[styles.choiceIcon, { backgroundColor: ACCENT }]}>
                <QrCode size={28} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.choiceTitle}>{isZh ? '掃描 QR 碼' : 'Scan QR Code'}</Text>
                <Text style={styles.choiceSubtitle}>
                  {isZh ? '使用相機掃描主持人顯示的 QR 碼' : "Use camera to scan the host's QR code"}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.choiceCard}
              onPress={() => setMode('manual')}
              activeOpacity={0.85}
            >
              <View style={[styles.choiceIcon, { backgroundColor: '#0EA5E9' }]}>
                <Keyboard size={28} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.choiceTitle}>{isZh ? '輸入代碼' : 'Enter Code'}</Text>
                <Text style={styles.choiceSubtitle}>
                  {isZh ? '手動輸入活動代碼' : 'Type the session code'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1F2937' },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 24, gap: 14 },
  intro: { fontSize: 14, color: '#6B7280', marginBottom: 8, lineHeight: 20 },
  choiceCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  choiceIcon: {
    width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  choiceTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  choiceSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    letterSpacing: 4,
    textAlign: 'center',
  },
  errorText: { color: '#DC2626', fontSize: 13, fontWeight: '500' },
  primaryBtn: {
    backgroundColor: ACCENT,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkBtn: { alignItems: 'center', paddingVertical: 12 },
  linkBtnText: { color: ACCENT_DARK, fontSize: 14, fontWeight: '600' },
  permissionText: { fontSize: 15, color: '#1F2937', textAlign: 'center', lineHeight: 22 },

  scanRoot: { flex: 1, backgroundColor: '#000' },
  scanOverlay: { flex: 1, justifyContent: 'space-between' },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  scanCloseBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  scanHeaderTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  scanCenter: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  scanFrame: {
    width: 240, height: 240, borderRadius: 24,
    borderWidth: 3, borderColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  scanHint: { color: '#fff', fontSize: 14, fontWeight: '500', textAlign: 'center', paddingHorizontal: 24 },
  scanLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 28,
  },
  scanLoadingText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  waitContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  pulseWrap: {
    width: 140, height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  pulseRing: {
    position: 'absolute',
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: ACCENT,
  },
  pulseCore: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: ACCENT_DARK,
    alignItems: 'center', justifyContent: 'center',
  },
  waitTitle: { fontSize: 22, fontWeight: '700', color: '#1F2937', textAlign: 'center' },
  waitSubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 4, marginBottom: 24 },
  cancelButton: {
    paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff',
  },
  cancelButtonText: { color: '#374151', fontSize: 15, fontWeight: '600' },

  detailsBody: { padding: 20, gap: 12, paddingBottom: 40 },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
    marginBottom: 8,
  },
  eventIconWrap: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: LECTURE_ACCENT,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  eventTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  eventMeta: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  statusPill: { marginTop: 10, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  statusLive: { backgroundColor: '#FEE2E2' },
  statusScheduled: { backgroundColor: '#DBEAFE' },
  statusPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: '#1F2937' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 8 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  textInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '500',
  },
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  ticketText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  regBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 4,
  },
  regBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#78350F',
    fontWeight: '600',
  },
});
