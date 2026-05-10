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
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QrCode, Keyboard, X, ScanLine, ArrowLeft } from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

const ACCENT = '#6366F1';
const ACCENT_DARK = '#4F46E5';

type Mode = 'choose' | 'scan' | 'manual' | 'waiting';

const STORAGE_KEYS = {
  SESSION_ID: 'group_session_id',
  PARTICIPANT_ID: 'group_participant_id',
  PARTICIPANT_TOKEN: 'group_participant_token',
};

function generateToken(): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand()}-${rand()}`;
}

function extractSessionCode(input: string): string {
  const trimmed = input.trim();
  // QR may be a URL like https://app/group?code=ABC123
  const m = trimmed.match(/code=([A-Za-z0-9]{4,12})/i);
  if (m) return m[1].toUpperCase();
  // or it may be just the code
  return trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export default function GroupJoinScreen() {
  const router = useRouter();
  const { language, patientId, patientName } = useApp();
  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [mode, setMode] = useState<Mode>('choose');
  const [code, setCode] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef<boolean>(false);
  const pulseAnim = useRef(new Animated.Value(0)).current;

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

  const submitJoin = useCallback(async (rawCode: string) => {
    const sessionCode = extractSessionCode(rawCode);
    if (!sessionCode || sessionCode.length < 4) {
      setError(isZh ? '請輸入有效代碼' : 'Please enter a valid code');
      return;
    }
    if (!patientId) {
      setError(isZh ? '請先登入' : 'Please log in first');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      log('[GroupJoin] Looking up session:', sessionCode);
      const { data: session, error: sessionErr } = await supabase
        .from('group_sessions')
        .select('id, status, session_name, host_user_id')
        .eq('session_code', sessionCode)
        .in('status', ['waiting', 'active'])
        .maybeSingle();

      if (sessionErr || !session) {
        log('[GroupJoin] Session lookup error:', sessionErr);
        setError(isZh ? '找不到或已過期' : 'Session not found or expired');
        setSubmitting(false);
        return;
      }

      const { data: { user: authUser } } = await supabase.auth.getUser();
      const token = generateToken();

      // Check if there's already a participant record for this patient in this session
      const { data: existing } = await supabase
        .from('group_participants')
        .select('id, status, participant_token')
        .eq('session_id', session.id)
        .eq('patient_id', patientId)
        .maybeSingle();

      let pId: string;
      let pToken: string;

      if (existing) {
        pId = existing.id;
        pToken = existing.participant_token || token;
        if (existing.status === 'rejected' || existing.status === 'kicked') {
          // re-request
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
            session_id: session.id,
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
          log('[GroupJoin] Insert participant failed:', insertErr);
          setError(isZh ? '加入失敗，請再試' : 'Failed to join, please try again');
          setSubmitting(false);
          return;
        }
        pId = inserted.id;
        pToken = token;
      }

      await AsyncStorage.multiSet([
        [STORAGE_KEYS.SESSION_ID, session.id],
        [STORAGE_KEYS.PARTICIPANT_ID, pId],
        [STORAGE_KEYS.PARTICIPANT_TOKEN, pToken],
      ]);

      setSessionId(session.id);
      setParticipantId(pId);
      setMode('waiting');
    } catch (e) {
      log('[GroupJoin] submit error:', e);
      setError(isZh ? '網絡錯誤' : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }, [isZh, patientId, patientName]);

  // Polling for approval status
  useEffect(() => {
    if (mode !== 'waiting' || !participantId || !sessionId) return;
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
            params: { sessionId, participantId },
          } as any);
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
            STORAGE_KEYS.SESSION_ID,
            STORAGE_KEYS.PARTICIPANT_ID,
            STORAGE_KEYS.PARTICIPANT_TOKEN,
          ]);
          router.back();
        }
      } catch (e) {
        log('[GroupJoin] poll error:', e);
      }
    };
    void tick();
    const interval = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mode, participantId, sessionId, router, isZh]);

  const handleQRScanned = useCallback((data: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    void submitJoin(data.data);
  }, [submitJoin]);

  const cancelWaiting = useCallback(async () => {
    if (participantId) {
      try {
        await supabase
          .from('group_participants')
          .update({ status: 'cancelled' })
          .eq('id', participantId);
      } catch (e) {
        log('[GroupJoin] cancel error:', e);
      }
    }
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.SESSION_ID,
      STORAGE_KEYS.PARTICIPANT_ID,
      STORAGE_KEYS.PARTICIPANT_TOKEN,
    ]);
    router.back();
  }, [participantId, router]);

  const headerTitle = isZh ? '加入小組' : 'Join Group Session';

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
              <Text style={styles.scanLoadingText}>{isZh ? '加入中...' : 'Joining...'}</Text>
            </View>
          )}
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
            <Text style={styles.label}>{isZh ? '輸入 6 位代碼' : 'Enter 6-character code'}</Text>
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
              onPress={() => void submitJoin(code)}
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
                ? '加入您的治療師主持的小組訓練'
                : 'Join a group session hosted by your therapist'}
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
                  {isZh ? '使用相機掃描主持人顯示的 QR 碼' : 'Use camera to scan the host\'s QR code'}
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
                  {isZh ? '手動輸入 6 位小組代碼' : 'Type the 6-character session code'}
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
});
