import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ScaledText as Text } from '@/components/ScaledText';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { X, Check, Calendar, User, FileText, MessageSquare, Award, Edit3, ArrowLeft } from 'lucide-react-native';
import { log } from '@/lib/logger';

interface ResearchAssessment {
  id: string;
  patient_id: string;
  assessment_name: string;
  timepoint: string;
  total_score: number | null;
  subscale_scores: Record<string, unknown> | null;
  raw_responses: Record<string, unknown> | null;
  administered_by: string | null;
  administered_date: string | null;
  completion_method: string | null;
  notes: string | null;
  created_at: string;
}

interface Props {
  visible: boolean;
  assessment: ResearchAssessment | null;
  onClose: () => void;
  onNavigateToSUS: (assessmentId: string) => void;
  patientId: string | null;
  t: (key: string) => string;
  isZh: boolean;
}

function getTimepointLabel(timepoint: string, t: (key: string) => string): string {
  switch (timepoint) {
    case 'baseline': return t('researchBaseline');
    case 'week4': return t('researchWeek4');
    case 'endpoint': return t('researchEndpoint');
    default: return timepoint;
  }
}

function getTimepointColor(timepoint: string): { bg: string; text: string } {
  switch (timepoint) {
    case 'baseline': return { bg: '#E8F8F0', text: '#1B8A4E' };
    case 'week4': return { bg: '#FFF8E1', text: '#B8860B' };
    case 'endpoint': return { bg: '#FDEDEC', text: '#C0392B' };
    default: return { bg: Colors.border, text: Colors.textSecondary };
  }
}

function getMethodLabel(method: string | null): string {
  switch (method) {
    case 'app_wizard': return 'App (Wizard)';
    case 'app_checklist': return 'App (Checklist)';
    case 'paper': return 'Paper';
    case 'interview': return 'Interview';
    default: return method || '—';
  }
}

export default function ResearchAssessmentModal({
  visible,
  assessment,
  onClose,
  onNavigateToSUS,
  patientId: _patientId,
  t,
  isZh,
}: Props) {
  const queryClient = useQueryClient();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const isCompleted = assessment?.total_score !== null && assessment?.total_score !== undefined;
  const isSUS = assessment?.assessment_name?.toUpperCase() === 'SUS';

  const [scoreInput, setScoreInput] = useState<string>('');
  const [notesInput, setNotesInput] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [mode, setMode] = useState<'view' | 'form'>('view');

  useEffect(() => {
    if (visible && assessment) {
      setScoreInput(assessment.total_score !== null && assessment.total_score !== undefined ? String(assessment.total_score) : '');
      setNotesInput(assessment.notes || '');
      setIsEditing(false);

      if (isCompleted) {
        setMode('view');
      } else {
        setMode('form');
      }

      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible, assessment, fadeAnim, isCompleted]);

  const handleClose = useCallback(() => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      onClose();
    });
  }, [fadeAnim, onClose]);

  const submitMutation = useMutation({
    mutationFn: async ({ score, notes }: { score: number; notes: string }) => {
      if (!assessment) throw new Error('No assessment');
      log('[ResearchAssessment] Submitting score:', score, 'for:', assessment.id);

      const { error } = await supabase
        .from('research_assessments')
        .update({
          total_score: score,
          notes: notes || null,
          completion_method: 'app_wizard',
          administered_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', assessment.id);

      if (error) {
        log('[ResearchAssessment] Update error:', error);
        throw error;
      }
      return score;
    },
    onSuccess: () => {
      log('[ResearchAssessment] Submit success');
      void queryClient.invalidateQueries({ queryKey: ['research-assessments'] });
      Alert.alert(
        isZh ? '評估已完成' : 'Assessment Completed',
        isZh ? '評估已成功提交。' : 'Assessment completed successfully.',
        [{ text: 'OK', onPress: handleClose }]
      );
    },
    onError: (error) => {
      log('[ResearchAssessment] Submit error:', error);
      Alert.alert(
        isZh ? '錯誤' : 'Error',
        isZh ? '提交失敗，請重試。' : 'Failed to submit. Please try again.'
      );
    },
  });

  const handleSubmit = useCallback(() => {
    const score = parseFloat(scoreInput);
    if (isNaN(score)) {
      Alert.alert(
        isZh ? '無效分數' : 'Invalid Score',
        isZh ? '請輸入有效的數字分數。' : 'Please enter a valid numeric score.'
      );
      return;
    }
    submitMutation.mutate({ score, notes: notesInput });
  }, [scoreInput, notesInput, submitMutation, isZh]);

  const handleSUSNavigate = useCallback(() => {
    if (!assessment) return;
    handleClose();
    setTimeout(() => {
      onNavigateToSUS(assessment.id);
    }, 300);
  }, [assessment, handleClose, onNavigateToSUS]);

  if (!assessment) return null;

  const tpColor = getTimepointColor(assessment.timepoint);

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={handleClose}
        style={styles.backBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        testID="research-modal-back"
      >
        <ArrowLeft size={22} color={Colors.textPrimary} />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text size={18} weight="bold" color={Colors.textPrimary} numberOfLines={1}>
          {assessment.assessment_name}
        </Text>
        <View style={[styles.timepointBadge, { backgroundColor: tpColor.bg }]}>
          <Text size={11} weight="700" color={tpColor.text}>
            {getTimepointLabel(assessment.timepoint, t)}
          </Text>
        </View>
      </View>
      <TouchableOpacity onPress={handleClose} style={styles.closeBtn} testID="research-modal-close">
        <X size={20} color={Colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  const renderCompletedView = () => (
    <ScrollView
      style={styles.scrollBody}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.scoreDisplaySection}>
        <View style={styles.scoreCircle}>
          <Award size={28} color={Colors.primary} />
          <Text size={42} weight="bold" color={Colors.primary}>
            {assessment.total_score}
          </Text>
          <Text size={13} color={Colors.textSecondary}>
            {isZh ? '總分 Total Score' : 'Total Score 總分'}
          </Text>
        </View>

        <View style={styles.completedBadge}>
          <Check size={14} color={Colors.success} />
          <Text size={13} weight="600" color={Colors.success}>
            {isZh ? '已完成 Completed' : 'Completed 已完成'}
          </Text>
        </View>
      </View>

      <View style={styles.detailsCard}>
        {assessment.administered_date && (
          <View style={styles.detailRow}>
            <View style={styles.detailIconWrap}>
              <Calendar size={16} color={Colors.textSecondary} />
            </View>
            <View style={styles.detailTextWrap}>
              <Text size={12} color={Colors.textSecondary}>
                {isZh ? '日期 Date' : 'Date 日期'}
              </Text>
              <Text size={15} weight="500" color={Colors.textPrimary}>
                {new Date(assessment.administered_date).toLocaleDateString()}
              </Text>
            </View>
          </View>
        )}

        {assessment.administered_by && (
          <View style={styles.detailRow}>
            <View style={styles.detailIconWrap}>
              <User size={16} color={Colors.textSecondary} />
            </View>
            <View style={styles.detailTextWrap}>
              <Text size={12} color={Colors.textSecondary}>
                {isZh ? '管理者 Administered by' : 'Administered by 管理者'}
              </Text>
              <Text size={15} weight="500" color={Colors.textPrimary}>
                {assessment.administered_by}
              </Text>
            </View>
          </View>
        )}

        {assessment.completion_method && (
          <View style={styles.detailRow}>
            <View style={styles.detailIconWrap}>
              <FileText size={16} color={Colors.textSecondary} />
            </View>
            <View style={styles.detailTextWrap}>
              <Text size={12} color={Colors.textSecondary}>
                {isZh ? '完成方式 Method' : 'Method 完成方式'}
              </Text>
              <Text size={15} weight="500" color={Colors.textPrimary}>
                {getMethodLabel(assessment.completion_method)}
              </Text>
            </View>
          </View>
        )}

        {assessment.notes ? (
          <View style={styles.notesSection}>
            <View style={styles.detailIconWrap}>
              <MessageSquare size={16} color={Colors.textSecondary} />
            </View>
            <View style={styles.detailTextWrap}>
              <Text size={12} color={Colors.textSecondary}>
                {isZh ? '備註 Notes' : 'Notes 備註'}
              </Text>
              <Text size={14} color={Colors.textPrimary} style={styles.notesText}>
                {assessment.notes}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.editButton}
        onPress={() => {
          handleClose();
          setTimeout(() => {
            const { router } = require('expo-router');
            router.push({
              pathname: '/research-assessment-form',
              params: {
                assessmentId: assessment.id,
                assessmentName: assessment.assessment_name,
                timepoint: assessment.timepoint,
                existingScore: String(assessment.total_score ?? ''),
                existingNotes: assessment.notes || '',
                isEdit: 'true',
              },
            });
          }, 350);
        }}
        activeOpacity={0.7}
        testID="research-edit-btn"
      >
        <Edit3 size={16} color={Colors.secondary} />
        <Text size={15} weight="600" color={Colors.secondary}>
          {isZh ? '編輯 Edit' : 'Edit 編輯'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderFormView = () => (
    <KeyboardAvoidingView
      style={styles.formKeyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isSUS && !isEditing ? (
          <View style={styles.susSection}>
            <View style={styles.susInfoCard}>
              <Award size={36} color="#1D9E75" />
              <Text size={17} weight="bold" color={Colors.textPrimary} style={styles.susTitle}>
                {isZh ? '系統可用性量表' : 'System Usability Scale'}
              </Text>
              <Text size={13} color={Colors.textSecondary} style={styles.susDesc}>
                {isZh
                  ? '此評估包含10個問題的引導式問卷。點擊下方按鈕開始填寫。'
                  : 'This assessment has a guided 10-question wizard. Tap below to start.'}
              </Text>
              <TouchableOpacity
                style={styles.susStartButton}
                onPress={handleSUSNavigate}
                activeOpacity={0.8}
                testID="research-sus-start"
              >
                <Text size={16} weight="bold" color={Colors.white}>
                  {isZh ? '開始填寫 SUS' : 'Start SUS Wizard'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.orDivider}>
              <View style={styles.orLine} />
              <Text size={12} color={Colors.textSecondary}>{isZh ? '或手動輸入' : 'or enter manually'}</Text>
              <View style={styles.orLine} />
            </View>
          </View>
        ) : null}

        <View style={styles.formCard}>
          <View style={styles.fieldGroup}>
            <Text size={14} weight="600" color={Colors.textPrimary} style={styles.fieldLabel}>
              {isZh ? '總分 Total Score' : 'Total Score 總分'} *
            </Text>
            <TextInput
              style={styles.scoreInput}
              value={scoreInput}
              onChangeText={setScoreInput}
              placeholder={isZh ? '輸入分數' : 'Enter score'}
              placeholderTextColor={Colors.disabled}
              keyboardType="decimal-pad"
              returnKeyType="done"
              testID="research-score-input"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text size={14} weight="600" color={Colors.textPrimary} style={styles.fieldLabel}>
              {isZh ? '備註 Notes' : 'Notes 備註'} ({isZh ? '選填' : 'optional'})
            </Text>
            <TextInput
              style={styles.notesInput}
              value={notesInput}
              onChangeText={setNotesInput}
              placeholder={isZh ? '輸入備註...' : 'Enter notes...'}
              placeholderTextColor={Colors.disabled}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              testID="research-notes-input"
            />
          </View>

          {assessment.administered_date && (
            <View style={styles.dateDisplay}>
              <Calendar size={16} color={Colors.textSecondary} />
              <View>
                <Text size={12} color={Colors.textSecondary}>
                  {isZh ? '管理日期 Administered Date' : 'Administered Date 管理日期'}
                </Text>
                <Text size={15} weight="500" color={Colors.textPrimary}>
                  {new Date(assessment.administered_date).toLocaleDateString()}
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.bottomActions}>
        {isEditing && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              setIsEditing(false);
              setMode('view');
            }}
            activeOpacity={0.7}
          >
            <Text size={15} weight="600" color={Colors.textSecondary}>
              {isZh ? '取消' : 'Cancel'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.submitButton,
            (submitMutation.isPending || !scoreInput.trim()) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={submitMutation.isPending || !scoreInput.trim()}
          activeOpacity={0.8}
          testID="research-submit-btn"
        >
          {submitMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <Check size={20} color={Colors.white} />
              <Text size={17} weight="bold" color={Colors.white}>
                {isEditing
                  ? (isZh ? '更新 Update' : 'Update 更新')
                  : (isZh ? '提交 Submit' : 'Submit 提交')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <View style={styles.safeTop} />
        {renderHeader()}
        {mode === 'view' && isCompleted && !isEditing ? renderCompletedView() : renderFormView()}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeTop: {
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    backgroundColor: Colors.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    gap: 4,
  },
  timepointBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  scoreDisplaySection: {
    alignItems: 'center',
    marginBottom: 28,
    gap: 14,
  },
  scoreCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.primary,
    gap: 2,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.successLight,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  detailsCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  detailTextWrap: {
    flex: 1,
    gap: 2,
  },
  notesSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  notesText: {
    lineHeight: 22,
    marginTop: 2,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondaryLight,
  },
  formKeyboardView: {
    flex: 1,
  },
  susSection: {
    marginBottom: 8,
  },
  susInfoCard: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F0FAF5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D6F0E5',
    gap: 10,
  },
  susTitle: {
    textAlign: 'center',
  },
  susDesc: {
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  susStartButton: {
    backgroundColor: '#1D9E75',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginTop: 6,
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  formCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    gap: 22,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    marginLeft: 4,
  },
  scoreInput: {
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 30,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    textAlign: 'center',
    minHeight: 72,
  },
  notesInput: {
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.textPrimary,
    minHeight: 100,
    lineHeight: 22,
  },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    minHeight: 58,
  },
  submitButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: 14,
    backgroundColor: Colors.secondary,
    minHeight: 58,
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
});
