import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import { ScaledText as Text } from '@/components/ScaledText';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import {
  ArrowLeft,
  Check,
  CheckCircle,
  ChevronRight,
  Minus,
  Plus,
  ClipboardList,
} from 'lucide-react-native';
import { log } from '@/lib/logger';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type WizardStep = 'intro' | 'form' | 'done';

function getTimepointLabel(timepoint: string, isZh: boolean): string {
  switch (timepoint) {
    case 'baseline':
      return isZh ? '基線 Baseline' : 'Baseline 基線';
    case 'week4':
      return isZh ? '第4週 Week 4' : 'Week 4 第4週';
    case 'endpoint':
      return isZh ? '終點 Endpoint' : 'Endpoint 終點';
    default:
      return timepoint;
  }
}

function getTimepointColor(timepoint: string): { bg: string; text: string; accent: string } {
  switch (timepoint) {
    case 'baseline':
      return { bg: '#E8F8F0', text: '#1B8A4E', accent: '#27AE60' };
    case 'week4':
      return { bg: '#FFF8E1', text: '#7A5600', accent: '#E6A817' };
    case 'endpoint':
      return { bg: '#FDEDEC', text: '#922B21', accent: '#C0392B' };
    default:
      return { bg: Colors.border, text: Colors.textSecondary, accent: Colors.textSecondary };
  }
}

export default function ResearchAssessmentFormScreen() {
  const params = useLocalSearchParams<{
    assessmentId?: string;
    assessmentName?: string;
    timepoint?: string;
    existingScore?: string;
    existingNotes?: string;
    isEdit?: string;
  }>();

  const assessmentId = Array.isArray(params.assessmentId) ? params.assessmentId[0] : params.assessmentId;
  const assessmentName = Array.isArray(params.assessmentName) ? params.assessmentName[0] : params.assessmentName;
  const timepoint = Array.isArray(params.timepoint) ? params.timepoint[0] : params.timepoint;
  const existingScore = Array.isArray(params.existingScore) ? params.existingScore[0] : params.existingScore;
  const existingNotes = Array.isArray(params.existingNotes) ? params.existingNotes[0] : params.existingNotes;
  const isEditParam = Array.isArray(params.isEdit) ? params.isEdit[0] : params.isEdit;
  const isEdit = isEditParam === 'true';

  const { language } = useApp();
  const queryClient = useQueryClient();
  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [step, setStep] = useState<WizardStep>(isEdit ? 'form' : 'intro');
  const [scoreInput, setScoreInput] = useState<string>(existingScore || '');
  const [notesInput, setNotesInput] = useState<string>(existingNotes || '');
  const [submittedScore, setSubmittedScore] = useState<number>(0);

  const introFade = useRef(new Animated.Value(1)).current;
  const formSlide = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const doneFade = useRef(new Animated.Value(0)).current;
  const doneScale = useRef(new Animated.Value(0.6)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  const tpColor = getTimepointColor(timepoint || 'baseline');

  useEffect(() => {
    if (isEdit) {
      introFade.setValue(0);
      formSlide.setValue(0);
    }
  }, [isEdit, introFade, formSlide]);

  const goToForm = useCallback(() => {
    Animated.parallel([
      Animated.timing(introFade, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(formSlide, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setStep('form');
    });
  }, [introFade, formSlide]);

  const goToDone = useCallback((score: number) => {
    setSubmittedScore(score);
    setStep('done');
    Animated.parallel([
      Animated.timing(doneFade, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(doneScale, {
        toValue: 1,
        friction: 6,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(200),
        Animated.spring(checkScale, {
          toValue: 1,
          friction: 5,
          tension: 60,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [doneFade, doneScale, checkScale]);

  const incrementScore = useCallback(() => {
    const current = parseFloat(scoreInput) || 0;
    setScoreInput(String(Math.round((current + 1) * 10) / 10));
  }, [scoreInput]);

  const decrementScore = useCallback(() => {
    const current = parseFloat(scoreInput) || 0;
    if (current > 0) {
      setScoreInput(String(Math.round((current - 1) * 10) / 10));
    }
  }, [scoreInput]);

  const submitMutation = useMutation({
    mutationFn: async ({ score, notes }: { score: number; notes: string }) => {
      if (!assessmentId) throw new Error('No assessment ID');
      log('[ResearchAssessmentForm] Submitting score:', score, 'for:', assessmentId);

      const { error } = await supabase
        .from('research_assessments')
        .update({
          total_score: score,
          notes: notes || null,
          completion_method: 'app_wizard',
          administered_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', assessmentId);

      if (error) {
        log('[ResearchAssessmentForm] Update error:', error);
        throw error;
      }
      return score;
    },
    onSuccess: (score) => {
      log('[ResearchAssessmentForm] Submit success, score:', score);
      void queryClient.invalidateQueries({ queryKey: ['research-assessments'] });
      goToDone(score);
    },
    onError: (error) => {
      log('[ResearchAssessmentForm] Submit error:', error);
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

  const handleDone = useCallback(() => {
    router.back();
  }, []);

  const handleBack = useCallback(() => {
    if (step === 'form' && !isEdit) {
      setStep('intro');
      Animated.parallel([
        Animated.timing(introFade, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(formSlide, { toValue: SCREEN_WIDTH, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      router.back();
    }
  }, [step, isEdit, introFade, formSlide]);

  if (step === 'done') {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <Animated.View
            style={[
              styles.doneContainer,
              {
                opacity: doneFade,
                transform: [{ scale: doneScale }],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.checkCircle,
                { transform: [{ scale: checkScale }] },
              ]}
            >
              <CheckCircle size={64} color={Colors.success} />
            </Animated.View>

            <Text size={24} weight="bold" color={Colors.textPrimary} style={styles.doneTitle}>
              {isZh ? '評估已完成' : 'Assessment Completed'}
            </Text>
            <Text size={15} color={Colors.textSecondary} style={styles.doneSubtitle}>
              {isZh ? '評估已成功提交' : 'Assessment submitted successfully'}
            </Text>

            <View style={styles.doneScoreCard}>
              <Text size={14} color={Colors.textSecondary}>
                {assessmentName}
              </Text>
              <Text size={52} weight="bold" color={Colors.primary}>
                {submittedScore}
              </Text>
              <View style={[styles.doneTimepointBadge, { backgroundColor: tpColor.bg }]}>
                <Text size={12} weight="700" color={tpColor.text}>
                  {getTimepointLabel(timepoint || '', isZh)}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.doneButton}
              onPress={handleDone}
              activeOpacity={0.8}
              testID="research-form-done"
            >
              <Text size={17} weight="bold" color={Colors.white}>
                {isZh ? '完成 Done' : 'Done 完成'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {step === 'intro' && !isEdit ? (
          <Animated.View style={[styles.introContainer, { opacity: introFade }]}>
            <View style={[styles.introHeader, { backgroundColor: tpColor.accent }]}>
              <TouchableOpacity
                style={styles.introBackBtn}
                onPress={() => router.back()}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                testID="research-form-intro-back"
              >
                <ArrowLeft size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.introBody}>
              <View style={[styles.introIconCircle, { backgroundColor: tpColor.bg }]}>
                <ClipboardList size={48} color={tpColor.accent} />
              </View>

              <Text size={28} weight="bold" color={Colors.textPrimary} style={styles.introName}>
                {assessmentName || 'Assessment'}
              </Text>

              <View style={[styles.introTimepointBadge, { backgroundColor: tpColor.bg }]}>
                <Text size={14} weight="700" color={tpColor.text}>
                  {getTimepointLabel(timepoint || '', isZh)}
                </Text>
              </View>

              <Text size={16} color={Colors.textSecondary} style={styles.introInstruction}>
                {isZh
                  ? '請完成此評估\nPlease complete this assessment'
                  : 'Please complete this assessment\n請完成此評估'}
              </Text>
            </View>

            <View style={styles.introBottom}>
              <TouchableOpacity
                style={[styles.startButton, { backgroundColor: tpColor.accent }]}
                onPress={goToForm}
                activeOpacity={0.8}
                testID="research-form-start"
              >
                <Text size={18} weight="bold" color="#fff">
                  {isZh ? '開始 Start' : 'Start 開始'}
                </Text>
                <ChevronRight size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : null}

        <Animated.View
          style={[
            styles.formContainer,
            {
              transform: [{ translateX: formSlide }],
              ...(step === 'intro' && !isEdit
                ? { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 }
                : {}),
            },
          ]}
          pointerEvents={step === 'form' || isEdit ? 'auto' : 'none'}
        >
          <View style={styles.formHeader}>
            <TouchableOpacity
              style={styles.formBackBtn}
              onPress={handleBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              testID="research-form-back"
            >
              <ArrowLeft size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.formHeaderCenter}>
              <Text size={17} weight="bold" color={Colors.textPrimary} numberOfLines={1}>
                {assessmentName || 'Assessment'}
              </Text>
              <View style={[styles.formTimepointBadge, { backgroundColor: tpColor.bg }]}>
                <Text size={10} weight="700" color={tpColor.text}>
                  {getTimepointLabel(timepoint || '', isZh)}
                </Text>
              </View>
            </View>
            <View style={styles.formHeaderSpacer} />
          </View>

          <KeyboardAvoidingView
            style={styles.formKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
          >
            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.formScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.scoreSection}>
                <Text size={15} weight="600" color={Colors.textSecondary} style={styles.sectionLabel}>
                  {isZh ? '總分 Total Score' : 'Total Score 總分'}
                </Text>

                <View style={styles.scoreInputRow}>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={decrementScore}
                    activeOpacity={0.7}
                    testID="research-form-decrement"
                  >
                    <Minus size={24} color={Colors.textPrimary} />
                  </TouchableOpacity>

                  <TextInput
                    style={styles.scoreInput}
                    value={scoreInput}
                    onChangeText={setScoreInput}
                    placeholder="0"
                    placeholderTextColor={Colors.disabled}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    testID="research-form-score"
                  />

                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={incrementScore}
                    activeOpacity={0.7}
                    testID="research-form-increment"
                  >
                    <Plus size={24} color={Colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.notesSection}>
                <Text size={15} weight="600" color={Colors.textSecondary} style={styles.sectionLabel}>
                  {isZh ? '備註 Notes' : 'Notes 備註'}
                </Text>
                <TextInput
                  style={styles.notesInput}
                  value={notesInput}
                  onChangeText={setNotesInput}
                  placeholder={
                    isZh
                      ? '評估備註（選填）\nOptional notes about this assessment'
                      : 'Optional notes about this assessment\n評估備註（選填）'
                  }
                  placeholderTextColor={Colors.disabled}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  testID="research-form-notes"
                />
              </View>
            </ScrollView>

            <View style={styles.formBottom}>
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (submitMutation.isPending || !scoreInput.trim()) && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={submitMutation.isPending || !scoreInput.trim()}
                activeOpacity={0.8}
                testID="research-form-submit"
              >
                {submitMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Check size={22} color={Colors.white} />
                    <Text size={18} weight="bold" color={Colors.white}>
                      {isEdit
                        ? (isZh ? '更新 Update' : 'Update 更新')
                        : (isZh ? '提交 Submit' : 'Submit 提交')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  introContainer: {
    flex: 1,
  },
  introHeader: {
    height: 200,
    justifyContent: 'flex-start',
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  introBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  introBody: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: -60,
  },
  introIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: Colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  introName: {
    textAlign: 'center',
    marginTop: 24,
  },
  introTimepointBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 12,
  },
  introInstruction: {
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 24,
  },
  introBottom: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  formContainer: {
    flex: 1,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  formBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formHeaderCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  formTimepointBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  formHeaderSpacer: {
    width: 40,
  },
  formKeyboard: {
    flex: 1,
  },
  formScroll: {
    flex: 1,
  },
  formScrollContent: {
    padding: 24,
    paddingBottom: 40,
    gap: 28,
  },
  scoreSection: {
    gap: 14,
  },
  sectionLabel: {
    marginLeft: 4,
  },
  scoreInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepperButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.card,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  scoreInput: {
    flex: 1,
    backgroundColor: Colors.card,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    fontSize: 36,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    textAlign: 'center',
    minHeight: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  notesSection: {
    gap: 10,
  },
  notesInput: {
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    color: Colors.textPrimary,
    minHeight: 120,
    lineHeight: 24,
  },
  formBottom: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 12 : 20,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: Colors.secondary,
    minHeight: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  doneContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  checkCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.successLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  doneTitle: {
    textAlign: 'center',
  },
  doneSubtitle: {
    textAlign: 'center',
    marginBottom: 8,
  },
  doneScoreCard: {
    alignItems: 'center',
    backgroundColor: Colors.card,
    paddingHorizontal: 40,
    paddingVertical: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 6,
    marginBottom: 8,
  },
  doneTimepointBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 4,
  },
  doneButton: {
    backgroundColor: Colors.success,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 48,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
});
