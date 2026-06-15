import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Animated,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import Colors from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import Constants from 'expo-constants';
import {
  Send,
  MessageSquare,
  Bug,
  Lightbulb,
  Wrench,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';

type FeedbackCategory = 'general' | 'bug' | 'feature' | 'troubleshooting';
type FeedbackStatus = 'new' | 'read' | 'resolved';

interface FeedbackItem {
  id: string;
  category: FeedbackCategory;
  subject: string | null;
  message: string;
  created_at: string;
  status: FeedbackStatus;
  admin_notes: string | null;
}

const CATEGORIES: { value: FeedbackCategory; labelEn: string; labelZh: string; icon: React.ReactNode; color: string }[] = [
  { value: 'general', labelEn: 'General', labelZh: '一般', icon: <MessageSquare size={16} color="#636E72" />, color: '#636E72' },
  { value: 'bug', labelEn: 'Bug Report', labelZh: '問題回報', icon: <Bug size={16} color="#E74C3C" />, color: '#E74C3C' },
  { value: 'feature', labelEn: 'Feature Request', labelZh: '功能建議', icon: <Lightbulb size={16} color="#2980B9" />, color: '#2980B9' },
  { value: 'troubleshooting', labelEn: 'Troubleshooting', labelZh: '故障排除', icon: <Wrench size={16} color="#E67E22" />, color: '#E67E22' },
];

function getCategoryInfo(cat: FeedbackCategory) {
  return CATEGORIES.find(c => c.value === cat) || CATEGORIES[0];
}

function getStatusInfo(status: FeedbackStatus, _isZh: boolean) {
  switch (status) {
    case 'new':
      return { labelEn: 'Pending', labelZh: '待處理', color: '#95a5a6', icon: <Clock size={12} color="#95a5a6" /> };
    case 'read':
      return { labelEn: 'Received', labelZh: '已收到', color: '#2980B9', icon: <AlertCircle size={12} color="#2980B9" /> };
    case 'resolved':
      return { labelEn: 'Resolved', labelZh: '已解決', color: '#27AE60', icon: <CheckCircle size={12} color="#27AE60" /> };
    default:
      return { labelEn: 'Pending', labelZh: '待處理', color: '#95a5a6', icon: <Clock size={12} color="#95a5a6" /> };
  }
}

export default function FeedbackScreen() {
  const { language, patientId } = useApp();
  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [subject, setSubject] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedbackHistory, setFeedbackHistory] = useState<FeedbackItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);
  const [showHistory, setShowHistory] = useState<boolean>(true);
  const [successAnim] = useState(() => new Animated.Value(0));

  const fetchHistory = useCallback(async () => {
    if (!patientId) return;
    try {
      setLoadingHistory(true);
      log('[Feedback] Fetching feedback history for patient:', patientId);
      const { data, error } = await supabase
        .from('user_feedback')
        .select('id, category, subject, message, created_at, status, admin_notes')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) {
        log('[Feedback] Error fetching history:', error);
      } else {
        setFeedbackHistory((data || []) as FeedbackItem[]);
      }
    } catch (e) {
      log('[Feedback] Failed to fetch history:', e);
    } finally {
      setLoadingHistory(false);
    }
  }, [patientId]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const showSuccessAnimation = useCallback(() => {
    successAnim.setValue(0);
    Animated.sequence([
      Animated.timing(successAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(successAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [successAnim]);

  const handleSubmit = useCallback(async () => {
    if (!message.trim()) {
      if (Platform.OS === 'web') {
        window.alert(isZh ? '請輸入反饋內容' : 'Please enter your feedback message');
      } else {
        Alert.alert(
          isZh ? '缺少內容' : 'Missing Content',
          isZh ? '請輸入反饋內容' : 'Please enter your feedback message'
        );
      }
      return;
    }

    if (!patientId) return;

    setSubmitting(true);
    try {
      const deviceInfo = {
        platform: Platform.OS,
        osVersion: Platform.Version,
        appVersion: Constants.expoConfig?.version || 'unknown',
        deviceModel: Platform.OS === 'ios' ? 'iOS Device' : Platform.OS === 'android' ? 'Android Device' : 'Web',
      };

      log('[Feedback] Submitting feedback:', { category, subject: subject || null });

      const { error } = await supabase.from('user_feedback').insert({
        patient_id: patientId,
        category,
        subject: subject.trim() || null,
        message: message.trim(),
        device_info: deviceInfo,
        app_version: Constants.expoConfig?.version || null,
      });

      if (error) {
        log('[Feedback] Submit error:', error);
        if (Platform.OS === 'web') {
          window.alert(isZh ? '提交失敗，請重試' : 'Failed to submit. Please try again.');
        } else {
          Alert.alert(
            isZh ? '提交失敗' : 'Submit Failed',
            isZh ? '請重試' : 'Please try again.'
          );
        }
        return;
      }

      setCategory('general');
      setSubject('');
      setMessage('');
      showSuccessAnimation();
      void fetchHistory();
    } catch (e) {
      log('[Feedback] Submit exception:', e);
    } finally {
      setSubmitting(false);
    }
  }, [message, patientId, category, subject, isZh, showSuccessAnimation, fetchHistory]);

  const formatDate = useCallback((dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(isZh ? 'zh-HK' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }, [isZh]);

  const successOpacity = successAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const successScale = successAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 1.05, 1] });

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: isZh ? '意見反饋' : 'Feedback & Support',
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroSection}>
            <View style={styles.heroIconCircle}>
              <MessageSquare size={28} color={Colors.primary} />
            </View>
            <ScaledText size={15} color={Colors.textSecondary} style={styles.heroText}>
              {isZh
                ? '我們重視您的意見！請告訴我們如何改進。'
                : 'We value your feedback! Let us know how we can improve.'}
            </ScaledText>
          </View>

          <View style={styles.formSection}>
            <ScaledText size={13} weight="600" color={Colors.textSecondary} style={styles.fieldLabel}>
              {isZh ? '類別 Category' : 'Category'}
            </ScaledText>
            <View style={styles.categoryRow}>
              {CATEGORIES.map((cat) => {
                const selected = category === cat.value;
                return (
                  <TouchableOpacity
                    key={cat.value}
                    style={[
                      styles.categoryChip,
                      selected && { backgroundColor: cat.color + '18', borderColor: cat.color },
                    ]}
                    onPress={() => setCategory(cat.value)}
                    activeOpacity={0.7}
                  >
                    {cat.icon}
                    <Text
                      style={[
                        styles.categoryChipText,
                        selected && { color: cat.color, fontWeight: '700' as const },
                      ]}
                    >
                      {isZh ? cat.labelZh : cat.labelEn}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScaledText size={13} weight="600" color={Colors.textSecondary} style={styles.fieldLabel}>
              {isZh ? '主題 Subject（選填）' : 'Subject (optional)'}
            </ScaledText>
            <TextInput
              style={styles.textInput}
              value={subject}
              onChangeText={setSubject}
              placeholder={isZh ? '簡要描述' : 'Brief description'}
              placeholderTextColor={Colors.disabled}
              maxLength={200}
              testID="feedback-subject"
            />

            <ScaledText size={13} weight="600" color={Colors.textSecondary} style={styles.fieldLabel}>
              {isZh ? '內容 Message *' : 'Message *'}
            </ScaledText>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={message}
              onChangeText={setMessage}
              placeholder={
                isZh
                  ? '請告訴我們發生了什麼或您想看到什麼...'
                  : 'Tell us what happened or what you\'d like to see...'
              }
              placeholderTextColor={Colors.disabled}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxLength={2000}
              testID="feedback-message"
            />

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
              testID="feedback-submit"
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Send size={18} color="#fff" />
                  <Text style={styles.submitButtonText}>
                    {isZh ? '提交反饋' : 'Send Feedback'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <Animated.View
            style={[
              styles.successBanner,
              { opacity: successOpacity, transform: [{ scale: successScale }] },
            ]}
            pointerEvents="none"
          >
            <CheckCircle size={20} color="#27AE60" />
            <Text style={styles.successText}>
              {isZh ? '感謝！您的反饋已提交。' : 'Thank you! Your feedback has been sent.'}
            </Text>
          </Animated.View>

          <TouchableOpacity
            style={styles.historyHeader}
            onPress={() => setShowHistory(!showHistory)}
            activeOpacity={0.7}
          >
            <ScaledText size={16} weight="700" color={Colors.textPrimary}>
              {isZh ? '反饋記錄' : 'My Feedback History'}
            </ScaledText>
            <View style={styles.historyToggle}>
              {feedbackHistory.length > 0 && (
                <View style={styles.historyCountBadge}>
                  <Text style={styles.historyCountText}>{feedbackHistory.length}</Text>
                </View>
              )}
              {showHistory ? (
                <ChevronUp size={20} color={Colors.textSecondary} />
              ) : (
                <ChevronDown size={20} color={Colors.textSecondary} />
              )}
            </View>
          </TouchableOpacity>

          {showHistory && (
            <View style={styles.historySection}>
              {loadingHistory ? (
                <View style={styles.historyLoading}>
                  <ActivityIndicator color={Colors.primary} />
                </View>
              ) : feedbackHistory.length === 0 ? (
                <View style={styles.emptyHistory}>
                  <ScaledText size={14} color={Colors.disabled}>
                    {isZh ? '尚無反饋記錄' : 'No feedback yet'}
                  </ScaledText>
                </View>
              ) : (
                feedbackHistory.map((item) => {
                  const catInfo = getCategoryInfo(item.category);
                  const statusInfo = getStatusInfo(item.status || 'new', isZh);
                  return (
                    <View key={item.id} style={styles.historyCard}>
                      <View style={styles.historyCardTop}>
                        <View style={[styles.historyBadge, { backgroundColor: catInfo.color + '18' }]}>
                          {catInfo.icon}
                          <Text style={[styles.historyBadgeText, { color: catInfo.color }]}>
                            {isZh ? catInfo.labelZh : catInfo.labelEn}
                          </Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '18' }]}>
                          {statusInfo.icon}
                          <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
                            {isZh ? statusInfo.labelZh : statusInfo.labelEn}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.historySubject} numberOfLines={2}>
                        {item.subject || item.message.substring(0, 50)}
                        {!item.subject && item.message.length > 50 ? '...' : ''}
                      </Text>
                      <Text style={styles.historyDate}>{formatDate(item.created_at)}</Text>
                      {item.admin_notes && (
                        <View style={styles.adminResponse}>
                          <Text style={styles.adminResponseLabel}>
                            {isZh ? '回覆 Response' : 'Response'}
                          </Text>
                          <Text style={styles.adminResponseText}>{item.admin_notes}</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
  },
  heroIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroText: {
    textAlign: 'center',
    lineHeight: 22,
  },
  formSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  fieldLabel: {
    marginBottom: 8,
    marginTop: 16,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  categoryChipText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  textInput: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  textArea: {
    minHeight: 120,
    paddingTop: 14,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 20,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E8F8F0',
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#b8e6cc',
  },
  successText: {
    color: '#27AE60',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 12,
  },
  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyCountBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  historyCountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700' as const,
  },
  historySection: {
    paddingHorizontal: 20,
  },
  historyLoading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyHistory: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  historyCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 10,
  },
  historyCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  historyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  historyBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  historySubject: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '500' as const,
    lineHeight: 20,
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 12,
    color: Colors.disabled,
  },
  adminResponse: {
    marginTop: 10,
    backgroundColor: '#F0F7FA',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  adminResponseLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.primary,
    marginBottom: 4,
  },
  adminResponseText: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 19,
  },
  bottomSpacer: {
    height: 20,
  },
});
