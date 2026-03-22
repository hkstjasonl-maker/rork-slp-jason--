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
import { X, Check, Calendar, User, FileText, MessageSquare, Award, Edit3, FlaskConical } from 'lucide-react-native';
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars

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
  const slideAnim = useRef(new Animated.Value(300)).current;

  const isCompleted = assessment?.total_score !== null && assessment?.total_score !== undefined;
  const isSUS = assessment?.assessment_name?.toUpperCase() === 'SUS';

  const [scoreInput, setScoreInput] = useState<string>('');
  const [notesInput, setNotesInput] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);

  useEffect(() => {
    if (visible && assessment) {
      setScoreInput(assessment.total_score !== null && assessment.total_score !== undefined ? String(assessment.total_score) : '');
      setNotesInput(assessment.notes || '');
      setIsEditing(false);

      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 9, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(300);
    }
  }, [visible, assessment, fadeAnim, slideAnim]);

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      onClose();
    });
  }, [fadeAnim, slideAnim, onClose]);

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
        isZh ? '成功' : 'Success',
        isZh ? '評估已提交' : 'Assessment submitted successfully.',
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <TouchableOpacity style={styles.backdropTouch} onPress={handleClose} activeOpacity={1} />
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.handleBar} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconCircle}>
                <FlaskConical size={20} color={Colors.primaryDark} />
              </View>
              <View style={styles.headerTextWrap}>
                <Text size={20} weight="bold" color={Colors.textPrimary} numberOfLines={2}>
                  {assessment.assessment_name}
                </Text>
                <View style={[styles.timepointBadge, { backgroundColor: tpColor.bg }]}>
                  <Text size={11} weight="700" color={tpColor.text}>
                    {getTimepointLabel(assessment.timepoint, t)}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} testID="research-modal-close">
              <X size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {isCompleted && !isEditing ? (
              <>
                <View style={styles.scoreDisplay}>
                  <View style={styles.scoreCircle}>
                    <Award size={24} color={Colors.primary} />
                    <Text size={36} weight="bold" color={Colors.primary}>
                      {assessment.total_score}
                    </Text>
                    <Text size={12} color={Colors.textSecondary}>
                      {isZh ? '總分' : 'Total Score'}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailsSection}>
                  {assessment.administered_date && (
                    <View style={styles.detailRow}>
                      <Calendar size={16} color={Colors.textSecondary} />
                      <Text size={14} color={Colors.textSecondary}>
                        {new Date(assessment.administered_date).toLocaleDateString()}
                      </Text>
                    </View>
                  )}

                  {assessment.administered_by && (
                    <View style={styles.detailRow}>
                      <User size={16} color={Colors.textSecondary} />
                      <Text size={14} color={Colors.textSecondary}>
                        {isZh ? '管理者' : 'Administered by'}: {assessment.administered_by}
                      </Text>
                    </View>
                  )}

                  {assessment.completion_method && (
                    <View style={styles.detailRow}>
                      <FileText size={16} color={Colors.textSecondary} />
                      <Text size={14} color={Colors.textSecondary}>
                        {isZh ? '完成方式' : 'Method'}: {getMethodLabel(assessment.completion_method)}
                      </Text>
                    </View>
                  )}

                  {assessment.notes ? (
                    <View style={styles.notesDisplay}>
                      <MessageSquare size={16} color={Colors.textSecondary} />
                      <Text size={14} color={Colors.textSecondary} style={styles.notesDisplayText}>
                        {assessment.notes}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => {
                    setScoreInput(String(assessment.total_score ?? ''));
                    setNotesInput(assessment.notes || '');
                    setIsEditing(true);
                  }}
                  activeOpacity={0.7}
                  testID="research-edit-btn"
                >
                  <Edit3 size={16} color={Colors.primary} />
                  <Text size={15} weight="600" color={Colors.primary}>
                    {isZh ? '編輯分數' : 'Edit Score'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {isSUS && !isEditing ? (
                  <View style={styles.susSection}>
                    <View style={styles.susInfoCard}>
                      <Award size={32} color="#1D9E75" />
                      <Text size={16} weight="600" color={Colors.textPrimary} style={styles.susInfoTitle}>
                        {isZh ? '系統可用性量表' : 'System Usability Scale'}
                      </Text>
                      <Text size={13} color={Colors.textSecondary} style={styles.susInfoDesc}>
                        {isZh
                          ? '此評估包含10個問題的引導式問卷。點擊下方按鈕開始填寫。'
                          : 'This assessment has a guided 10-question wizard. Tap below to start.'}
                      </Text>
                    </View>

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

                    <View style={styles.orDivider}>
                      <View style={styles.orLine} />
                      <Text size={12} color={Colors.textSecondary}>{isZh ? '或' : 'or'}</Text>
                      <View style={styles.orLine} />
                    </View>

                    <Text size={13} color={Colors.textSecondary} style={styles.manualHint}>
                      {isZh ? '手動輸入分數：' : 'Enter score manually:'}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.formSection}>
                  <View style={styles.fieldGroup}>
                    <Text size={14} weight="600" color={Colors.textPrimary} style={styles.fieldLabel}>
                      {isZh ? '總分 Total Score' : 'Total Score 總分'} *
                    </Text>
                    <TextInput
                      style={styles.scoreTextInput}
                      value={scoreInput}
                      onChangeText={setScoreInput}
                      placeholder={isZh ? '輸入分數...' : 'Enter score...'}
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
                      style={styles.notesTextInput}
                      value={notesInput}
                      onChangeText={setNotesInput}
                      placeholder={isZh ? '輸入備註...' : 'Enter notes...'}
                      placeholderTextColor={Colors.disabled}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      testID="research-notes-input"
                    />
                  </View>
                </View>

                <View style={styles.formActions}>
                  {isEditing && (
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => setIsEditing(false)}
                      activeOpacity={0.7}
                    >
                      <Text size={15} weight="600" color={Colors.textSecondary}>
                        {isZh ? '取消' : 'Cancel'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.submitButton, submitMutation.isPending && styles.submitButtonDisabled]}
                    onPress={handleSubmit}
                    disabled={submitMutation.isPending || !scoreInput.trim()}
                    activeOpacity={0.8}
                    testID="research-submit-btn"
                  >
                    {submitMutation.isPending ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <>
                        <Check size={18} color={Colors.white} />
                        <Text size={15} weight="bold" color={Colors.white}>
                          {isEditing
                            ? (isZh ? '更新 Update' : 'Update 更新')
                            : (isZh ? '提交 Submit' : 'Submit 提交')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  headerTextWrap: {
    flex: 1,
    gap: 6,
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
    marginLeft: 8,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  scoreDisplay: {
    alignItems: 'center',
    marginBottom: 24,
  },
  scoreCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.primary,
    gap: 2,
  },
  detailsSection: {
    gap: 12,
    marginBottom: 20,
    padding: 16,
    backgroundColor: Colors.background,
    borderRadius: 14,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  notesDisplay: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  notesDisplayText: {
    flex: 1,
    fontStyle: 'italic' as const,
    lineHeight: 20,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  susSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  susInfoCard: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F0FAF5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D6F0E5',
    gap: 8,
    marginBottom: 16,
    width: '100%',
  },
  susInfoTitle: {
    textAlign: 'center',
  },
  susInfoDesc: {
    textAlign: 'center',
    lineHeight: 20,
  },
  susStartButton: {
    backgroundColor: '#1D9E75',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 16,
    width: '100%',
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  manualHint: {
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  formSection: {
    gap: 18,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    marginLeft: 2,
  },
  scoreTextInput: {
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: Colors.textPrimary,
    fontWeight: '600' as const,
  },
  notesTextInput: {
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.textPrimary,
    minHeight: 80,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  submitButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
});
