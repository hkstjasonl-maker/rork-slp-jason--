import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QrCode, Keyboard, X, ScanLine, ArrowLeft, GraduationCap, User, Mail, Calendar, Mic } from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

const ACCENT = '#3B82F6';
const ACCENT_DARK = '#2563EB';

const STORAGE_KEYS = {
  EVENT_ID: 'lecture_event_id',
  ATTENDEE_ID: 'lecture_attendee_id',
  ATTENDEE_TOKEN: 'lecture_attendee_token',
};

type Mode = 'choose' | 'scan' | 'manual' | 'details';

type LectureEvent = {
  id: string;
  status: string;
  title?: string | null;
  speaker_name?: string | null;
  scheduled_at?: string | null;
  session_code?: string | null;
};

function generateToken(): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand()}-${rand()}`;
}

function extractCode(input: string): string {
  const trimmed = input.trim();
  const m = trimmed.match(/code=([A-Za-z0-9]{4,12})/i);
  if (m) return m[1].toUpperCase();
  return trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function formatScheduled(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function LectureJoinScreen() {
  const router = useRouter();
  const { language, patientId, patientName } = useApp();
  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [mode, setMode] = useState<Mode>('choose');
  const [code, setCode] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [event, setEvent] = useState<LectureEvent | null>(null);
  const [displayName, setDisplayName] = useState<string>(patientName || '');
  const [email, setEmail] = useState<string>('');

  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef<boolean>(false);

  useEffect(() => {
    if (patientName && !displayName) setDisplayName(patientName);
  }, [patientName, displayName]);

  const lookupEvent = useCallback(async (rawCode: string) => {
    const sessionCode = extractCode(rawCode);
    if (!sessionCode || sessionCode.length < 4) {
      setError(isZh ? '請輸入有效代碼' : 'Please enter a valid code');
      scannedRef.current = false;
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      log('[LectureJoin] Looking up event:', sessionCode);
      const { data, error: err } = await supabase
        .from('lecture_events')
        .select('id, status, title, speaker_name, scheduled_at, session_code')
        .eq('session_code', sessionCode)
        .in('status', ['scheduled', 'live'])
        .maybeSingle();

      if (err || !data) {
        log('[LectureJoin] lookup error:', err?.message, 'code:', sessionCode);
        setError(isZh ? '找不到或已結束' : 'Lecture not found or ended');
        setSubmitting(false);
        scannedRef.current = false;
        return;
      }

      setEvent(data as LectureEvent);
      setMode('details');
    } catch (e) {
      log('[LectureJoin] lookup error:', e);
      setError(isZh ? '網絡錯誤' : 'Network error');
      scannedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [isZh]);

  const submitJoin = useCallback(async () => {
    if (!event) return;
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
      const token = generateToken();

      const { data: existing } = await supabase
        .from('lecture_attendees')
        .select('id, attendee_token, reconnection_count')
        .eq('event_id', event.id)
        .eq('patient_id', patientId || '')
        .maybeSingle();

      let attendeeId: string;
      let attendeeToken: string;

      if (existing) {
        attendeeId = existing.id;
        attendeeToken = existing.attendee_token || token;
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
            event_id: event.id,
            patient_id: patientId || null,
            auth_user_id: authUser?.id || null,
            display_name: name,
            email: email.trim() || null,
            attendee_token: token,
            status: 'joined',
            joined_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (insertErr || !inserted) {
          log('[LectureJoin] insert attendee failed:', insertErr);
          setError(isZh ? '加入失敗，請再試' : 'Failed to join, please try again');
          setSubmitting(false);
          return;
        }
        attendeeId = inserted.id;
        attendeeToken = token;
      }

      await AsyncStorage.multiSet([
        [STORAGE_KEYS.EVENT_ID, event.id],
        [STORAGE_KEYS.ATTENDEE_ID, attendeeId],
        [STORAGE_KEYS.ATTENDEE_TOKEN, attendeeToken],
      ]);

      router.replace({
        pathname: '/lecture-viewer',
        params: {
          eventId: event.id,
          attendeeId,
          eventTitle: event.title || '',
        },
      } as never);
    } catch (e) {
      log('[LectureJoin] submit error:', e);
      setError(isZh ? '網絡錯誤' : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }, [event, displayName, email, isZh, patientId, router]);

  const handleQRScanned = useCallback((data: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    void lookupEvent(data.data);
  }, [lookupEvent]);

  const headerTitle = isZh ? '參加講座' : 'Join Lecture';

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

  if (mode === 'details' && event) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => { setEvent(null); setMode('choose'); }}>
              <ArrowLeft size={22} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
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
                <Text style={styles.eventTitle}>{event.title || (isZh ? '講座' : 'Lecture')}</Text>
                {event.speaker_name ? (
                  <View style={styles.eventRow}>
                    <Mic size={14} color="#6B7280" />
                    <Text style={styles.eventMeta}>{event.speaker_name}</Text>
                  </View>
                ) : null}
                {event.scheduled_at ? (
                  <View style={styles.eventRow}>
                    <Calendar size={14} color="#6B7280" />
                    <Text style={styles.eventMeta}>{formatScheduled(event.scheduled_at)}</Text>
                  </View>
                ) : null}
                <View style={[styles.statusPill, event.status === 'live' ? styles.statusLive : styles.statusScheduled]}>
                  <Text style={styles.statusPillText}>
                    {event.status === 'live'
                      ? (isZh ? '直播中' : 'LIVE')
                      : (isZh ? '即將開始' : 'Scheduled')}
                  </Text>
                </View>
              </View>

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
                  placeholder={isZh ? 'name@example.com' : 'name@example.com'}
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  maxLength={120}
                />
              </View>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <TouchableOpacity
                style={[styles.primaryBtn, (submitting || !displayName.trim()) && styles.primaryBtnDisabled]}
                onPress={() => void submitJoin()}
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
            <Text style={styles.label}>{isZh ? '輸入講座代碼' : 'Enter lecture code'}</Text>
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
              onPress={() => void lookupEvent(code)}
              disabled={!code.trim() || submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>{isZh ? '繼續' : 'Continue'}</Text>
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
                ? '加入由講者主持的講座或網路研討會'
                : 'Join a lecture or webinar hosted by your speaker'}
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
                  {isZh ? '使用相機掃描講座 QR 碼' : 'Use camera to scan the lecture QR code'}
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
                  {isZh ? '手動輸入講座代碼' : 'Type the lecture session code'}
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
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
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
  },
  choiceIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
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
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  scanHint: { color: '#fff', fontSize: 14, fontWeight: '500', textAlign: 'center', paddingHorizontal: 24 },
  scanLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 28 },
  scanLoadingText: { color: '#fff', fontSize: 14, fontWeight: '600' },

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
    backgroundColor: ACCENT,
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
});
