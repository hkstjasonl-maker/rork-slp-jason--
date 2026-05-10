import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { QrCode, Keyboard, X, ScanLine, ArrowLeft } from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

const ACCENT = '#10B981';
const ACCENT_DARK = '#059669';

type Mode = 'choose' | 'scan' | 'manual';

function extractSessionCode(input: string): string {
  const trimmed = input.trim();
  const m = trimmed.match(/code=([A-Za-z0-9]{4,12})/i);
  if (m) return m[1].toUpperCase();
  return trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export default function QuizJoinScreen() {
  const router = useRouter();
  const { language, patientId } = useApp();
  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [mode, setMode] = useState<Mode>('choose');
  const [code, setCode] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef<boolean>(false);

  const submitJoin = useCallback(async (rawCode: string) => {
    const sessionCode = extractSessionCode(rawCode);
    if (!sessionCode || sessionCode.length < 4) {
      setError(isZh ? '請輸入有效代碼' : 'Please enter a valid code');
      scannedRef.current = false;
      return;
    }
    if (!patientId) {
      setError(isZh ? '請先登入' : 'Please log in first');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      log('[QuizJoin] Looking up quiz session:', sessionCode);
      const { data: session, error: sessionErr } = await supabase
        .from('quiz_sessions')
        .select('id, status, quiz_id, session_name, session_code')
        .eq('session_code', sessionCode)
        .in('status', ['active', 'waiting'])
        .maybeSingle();

      if (sessionErr || !session) {
        log('[QuizJoin] Session lookup error:', sessionErr?.message, 'code:', sessionCode);
        setError(isZh ? '找不到或已結束' : 'Quiz not found or ended');
        setSubmitting(false);
        scannedRef.current = false;
        return;
      }

      router.replace({
        pathname: '/quiz-take',
        params: {
          sessionId: session.id,
          quizId: session.quiz_id,
          sessionName: session.session_name || '',
        },
      } as never);
    } catch (e) {
      log('[QuizJoin] submit error:', e);
      setError(isZh ? '網絡錯誤' : 'Network error');
      scannedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [isZh, patientId, router]);

  const handleQRScanned = useCallback((data: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    void submitJoin(data.data);
  }, [submitJoin]);

  const headerTitle = isZh ? '參加測驗' : 'Join Quiz';

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
            <Text style={styles.label}>{isZh ? '輸入測驗代碼' : 'Enter quiz code'}</Text>
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
                <Text style={styles.primaryBtnText}>{isZh ? '開始' : 'Start'}</Text>
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
                ? '參加由治療師提供的測驗'
                : 'Take a quiz provided by your therapist'}
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
                  {isZh ? '使用相機掃描測驗 QR 碼' : "Use camera to scan the quiz QR code"}
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
                  {isZh ? '手動輸入測驗代碼' : 'Type the quiz session code'}
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
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
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
});
