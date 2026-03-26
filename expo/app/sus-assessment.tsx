import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Alert,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/contexts/AppContext';
import { ScaledText as Text } from '@/components/ScaledText';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { ASSESSMENT_TOOLS } from '@/constants/assessments';
import { ChevronLeft, ChevronRight, Check, Award, ArrowLeft } from 'lucide-react-native';
import { log } from '@/lib/logger';

const SCREEN_WIDTH = Dimensions.get('window').width;

const SUS_TOOL = ASSESSMENT_TOOLS['sus'];

interface SUSQuestion {
  number: number;
  text_en: string;
  text_zh: string;
  tone: 'positive' | 'negative';
}

const SUS_QUESTIONS: SUSQuestion[] = (SUS_TOOL.items || []).map((item) => ({
  number: item.item_number,
  text_en: item.text_en,
  text_zh: item.text_zh,
  tone: item.tone || 'positive',
}));

interface LikertOption {
  value: number;
  label_en: string;
  label_zh: string;
}

const LIKERT_OPTIONS: LikertOption[] = [
  { value: 1, label_en: 'Strongly\nDisagree', label_zh: '非常\n不同意' },
  { value: 2, label_en: 'Disagree', label_zh: '不同意' },
  { value: 3, label_en: 'Neutral', label_zh: '中立' },
  { value: 4, label_en: 'Agree', label_zh: '同意' },
  { value: 5, label_en: 'Strongly\nAgree', label_zh: '非常\n同意' },
];

const THEME = {
  teal: '#1D9E75',
  tealLight: '#E1F5EE',
  tealDark: '#085041',
  progressBg: '#E8ECE9',
  selectedBorder: '#0D7A5A',
  optionBg: '#F4F6F5',
  optionSelectedBg: '#D6F0E5',
  scoreBg: '#F0FAF5',
  aboveAvg: '#1D9E75',
  belowAvg: '#E67E22',
} as const;

function calculateSUSScore(answers: Record<number, number>): number {
  let sum = 0;
  for (let i = 1; i <= 10; i++) {
    const val = answers[i] ?? 3;
    if (i % 2 === 1) {
      sum += val - 1;
    } else {
      sum += 5 - val;
    }
  }
  return Math.round(sum * 2.5 * 10) / 10;
}

export default function SUSAssessmentScreen() {
  const params = useLocalSearchParams<{ submissionId?: string; assessmentId?: string; researchAssessmentId?: string }>();
  const submissionId = Array.isArray(params.submissionId) ? params.submissionId[0] : params.submissionId;
  const assessmentId = Array.isArray(params.assessmentId) ? params.assessmentId[0] : params.assessmentId;
  const researchAssessmentId = Array.isArray(params.researchAssessmentId) ? params.researchAssessmentId[0] : params.researchAssessmentId;
  const { t, language, patientId } = useApp();
  const queryClient = useQueryClient();

  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResult, setShowResult] = useState<boolean>(false);
  const [susScore, setSusScore] = useState<number>(0);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const buttonScales = useRef<Animated.Value[]>(
    LIKERT_OPTIONS.map(() => new Animated.Value(1))
  ).current;

  const currentQuestion = SUS_QUESTIONS[currentIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.number] ?? null : null;
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === 10;

  useEffect(() => {
    const target = answeredCount / 10;
    Animated.timing(progressAnim, {
      toValue: target,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [answeredCount, progressAnim]);

  const animateSlide = useCallback((dir: 'forward' | 'backward', cb: () => void) => {
    const exitVal = dir === 'forward' ? -SCREEN_WIDTH : SCREEN_WIDTH;
    const enterVal = dir === 'forward' ? SCREEN_WIDTH : -SCREEN_WIDTH;
    Animated.timing(slideAnim, {
      toValue: exitVal,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      cb();
      slideAnim.setValue(enterVal);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    });
  }, [slideAnim]);

  const selectAnswer = useCallback((value: number) => {
    if (!currentQuestion) return;
    const idx = value - 1;
    Animated.sequence([
      Animated.timing(buttonScales[idx], { toValue: 0.9, duration: 60, useNativeDriver: true }),
      Animated.spring(buttonScales[idx], { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    setAnswers(prev => ({ ...prev, [currentQuestion.number]: value }));
    log('[SUS] Answer Q', currentQuestion.number, '=', value);

    setTimeout(() => {
      if (currentIndex < 9) {
        animateSlide('forward', () => setCurrentIndex(prev => prev + 1));
      }
    }, 300);
  }, [currentQuestion, currentIndex, animateSlide, buttonScales]);

  const goNext = useCallback(() => {
    if (currentAnswer === null) return;
    if (currentIndex < 9) {
      animateSlide('forward', () => setCurrentIndex(prev => prev + 1));
    }
  }, [currentIndex, currentAnswer, animateSlide]);

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      animateSlide('backward', () => setCurrentIndex(prev => prev - 1));
    } else {
      router.back();
    }
  }, [currentIndex, animateSlide]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!patientId) throw new Error('Missing patient ID');
      const score = calculateSUSScore(answers);
      log('[SUS] Calculated score:', score);

      const langCode = isZh ? 'zh' : 'en';
      const responses: Record<string, number> = {};
      for (const [k, v] of Object.entries(answers)) {
        responses[k] = v;
      }

      if (submissionId) {
        const { error } = await supabase
          .from('assessment_submissions')
          .update({
            responses,
            total_score: score,
            subscale_scores: {},
            language: langCode,
            status: 'completed',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', submissionId);

        if (error) {
          log('[SUS] Update error:', error);
          throw error;
        }
      } else {
        const { error } = await supabase
          .from('assessment_submissions')
          .insert({
            patient_id: patientId,
            assessment_id: assessmentId || 'sus',
            language: langCode,
            responses,
            total_score: score,
            subscale_scores: {},
            status: 'completed',
            completed_at: new Date().toISOString(),
          });

        if (error) {
          log('[SUS] Insert error:', error);
          throw error;
        }
      }

      if (researchAssessmentId) {
        try {
          log('[SUS] Updating research_assessments row:', researchAssessmentId);
          await supabase
            .from('research_assessments')
            .update({
              total_score: score,
              raw_responses: responses,
              completion_method: 'app_wizard',
              administered_date: new Date().toISOString().split('T')[0],
            })
            .eq('id', researchAssessmentId);
        } catch (researchErr) {
          log('[SUS] Research assessment update error (non-blocking):', researchErr);
        }
      } else {
        try {
          const { data: patientData } = await supabase
            .from('patients')
            .select('is_research_participant')
            .eq('id', patientId)
            .maybeSingle();

          if (patientData?.is_research_participant) {
            log('[SUS] Patient is research participant, logging to research_assessments');
            await supabase.from('research_assessments').insert({
              patient_id: patientId,
              assessment_type: 'SUS',
              responses,
              total_score: score,
              language: langCode,
              completed_at: new Date().toISOString(),
            });
          }
        } catch (researchErr) {
          log('[SUS] Research logging error (non-blocking):', researchErr);
        }
      }

      return score;
    },
    onSuccess: (score) => {
      log('[SUS] Submission success, score:', score);
      setSusScore(score);
      setShowResult(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
      void queryClient.invalidateQueries({ queryKey: ['clinical_assessments'] });
      void queryClient.invalidateQueries({ queryKey: ['assessments'] });
      void queryClient.invalidateQueries({ queryKey: ['research-assessments'] });
    },
    onError: (error) => {
      log('[SUS] Submit error:', error);
      Alert.alert(
        t('error') || 'Error',
        t('susSubmitError') || 'Failed to submit. Please try again.'
      );
    },
  });

  const handleFinish = useCallback(() => {
    if (!allAnswered) return;
    submitMutation.mutate();
  }, [allAnswered, submitMutation]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  if (showResult) {
    const isAboveAverage = susScore >= 68;
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safeArea}>
          <Animated.View
            style={[
              styles.resultContainer,
              { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
            ]}
          >
            <View style={[styles.resultIconCircle, { backgroundColor: isAboveAverage ? THEME.tealLight : '#FFF3E0' }]}>
              <Award size={48} color={isAboveAverage ? THEME.teal : THEME.belowAvg} />
            </View>

            <Text size={22} weight="bold" color={Colors.textPrimary} style={styles.resultTitle}>
              {t('susResultTitle') || 'SUS Score'}
            </Text>

            <View style={[styles.scoreCard, { borderColor: isAboveAverage ? THEME.teal : THEME.belowAvg }]}>
              <Text size={48} weight="bold" color={isAboveAverage ? THEME.teal : THEME.belowAvg}>
                {susScore}
              </Text>
              <Text size={14} color={Colors.textSecondary}>
                {t('outOf') || 'out of'} 100
              </Text>
            </View>

            <View style={[
              styles.interpretationBadge,
              { backgroundColor: isAboveAverage ? THEME.tealLight : '#FFF3E0' },
            ]}>
              <Text
                size={16}
                weight="600"
                color={isAboveAverage ? THEME.tealDark : '#7A4B00'}
              >
                {isAboveAverage
                  ? (isZh ? '高於平均' : 'Above Average')
                  : (isZh ? '低於平均' : 'Below Average')}
              </Text>
            </View>

            <Text size={14} color={Colors.textSecondary} style={styles.interpretationText}>
              {isAboveAverage
                ? (isZh
                  ? '分數 ≥ 68 表示系統可用性高於平均水平。'
                  : 'A score of 68 or above indicates above-average usability.')
                : (isZh
                  ? '分數 < 68 表示系統可用性低於平均水平，可能需要改進。'
                  : 'A score below 68 indicates below-average usability and potential areas for improvement.')}
            </Text>

            <Text size={12} color="#999" style={styles.referenceText}>
              Brooke, J. (1996). SUS: A "quick and dirty" usability scale.
            </Text>

            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => router.back()}
              activeOpacity={0.8}
              testID="sus-done"
            >
              <Text size={16} weight="bold" color={Colors.white}>
                {t('backToAssessments') || 'Back to Assessments'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  const isLastQuestion = currentIndex === 9;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={goBack}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID="sus-back"
          >
            <ArrowLeft size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text size={15} weight="600" color={Colors.textPrimary} numberOfLines={1} style={styles.topBarTitle}>
            {isZh ? '系統可用性量表 (SUS)' : 'System Usability Scale'}
          </Text>
          <Text size={14} weight="500" color={Colors.textSecondary}>
            {currentIndex + 1} / 10
          </Text>
        </View>

        <View style={styles.progressBarWrap}>
          <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
          </View>
        </View>

        <Animated.View
          style={[styles.questionArea, { transform: [{ translateX: slideAnim }] }]}
        >
          <View style={styles.questionNumberBadge}>
            <Text size={13} weight="bold" color={Colors.white}>
              Q{currentQuestion?.number}
            </Text>
          </View>

          <Text
            size={20}
            weight="500"
            color={Colors.textPrimary}
            style={styles.questionText}
          >
            {isZh ? currentQuestion?.text_zh : currentQuestion?.text_en}
          </Text>

          {isZh ? (
            <Text size={14} color={Colors.textSecondary} style={styles.questionSubtext}>
              {currentQuestion?.text_en}
            </Text>
          ) : (
            <Text size={14} color={Colors.textSecondary} style={styles.questionSubtext}>
              {currentQuestion?.text_zh}
            </Text>
          )}

          <View style={styles.likertRow}>
            {LIKERT_OPTIONS.map((option, idx) => {
              const isSelected = currentAnswer === option.value;
              return (
                <Animated.View
                  key={option.value}
                  style={[
                    styles.likertBtnWrap,
                    { transform: [{ scale: buttonScales[idx] }] },
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.likertBtn,
                      isSelected && styles.likertBtnSelected,
                    ]}
                    onPress={() => selectAnswer(option.value)}
                    activeOpacity={0.7}
                    testID={`sus-likert-${option.value}`}
                  >
                    <Text
                      size={22}
                      weight="bold"
                      color={isSelected ? THEME.teal : Colors.textPrimary}
                    >
                      {option.value}
                    </Text>
                    <Text
                      size={10}
                      weight="500"
                      color={isSelected ? THEME.tealDark : Colors.textSecondary}
                      style={styles.likertLabel}
                    >
                      {isZh ? option.label_zh : option.label_en}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>

          <View style={styles.likertScaleLabels}>
            <Text size={11} color={Colors.textSecondary}>
              {isZh ? '非常不同意' : 'Strongly Disagree'}
            </Text>
            <Text size={11} color={Colors.textSecondary}>
              {isZh ? '非常同意' : 'Strongly Agree'}
            </Text>
          </View>
        </Animated.View>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            onPress={goBack}
            style={styles.navBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID="sus-prev"
          >
            <ChevronLeft size={20} color={currentIndex === 0 ? Colors.disabled : Colors.textSecondary} />
            <Text size={14} color={currentIndex === 0 ? Colors.disabled : Colors.textSecondary}>
              {t('wizardBack') || 'Back'}
            </Text>
          </TouchableOpacity>

          <View style={styles.dotsRow}>
            {SUS_QUESTIONS.map((q, idx) => {
              const isAnswered = answers[q.number] !== undefined;
              const isCurrent = idx === currentIndex;
              const size = isCurrent ? 10 : 7;
              return (
                <TouchableOpacity
                  key={q.number}
                  onPress={() => {
                    if (idx < currentIndex || isAnswered) {
                      setCurrentIndex(idx);
                      slideAnim.setValue(0);
                    }
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                >
                  <View
                    style={{
                      width: size,
                      height: size,
                      borderRadius: size / 2,
                      backgroundColor: isCurrent
                        ? THEME.selectedBorder
                        : isAnswered
                        ? THEME.teal
                        : THEME.progressBg,
                      marginHorizontal: 3,
                    }}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          {isLastQuestion && allAnswered ? (
            <TouchableOpacity
              onPress={handleFinish}
              style={styles.submitBtn}
              disabled={submitMutation.isPending}
              activeOpacity={0.8}
              testID="sus-submit"
            >
              {submitMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Check size={18} color={Colors.white} />
                  <Text size={14} weight="bold" color={Colors.white}>
                    {t('submitAssessment') || 'Submit'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={goNext}
              style={[styles.nextBtn, currentAnswer === null && styles.nextBtnDisabled]}
              disabled={currentAnswer === null}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="sus-next"
            >
              <Text size={14} weight="600" color={Colors.white}>
                {t('wizardNext') || 'Next'}
              </Text>
              <ChevronRight size={18} color={Colors.white} />
            </TouchableOpacity>
          )}
        </View>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  topBarTitle: {
    flex: 1,
  },
  progressBarWrap: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: THEME.progressBg,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: THEME.teal,
    borderRadius: 2,
  },
  questionArea: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  questionNumberBadge: {
    alignSelf: 'center',
    backgroundColor: THEME.teal,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 20,
  },
  questionText: {
    textAlign: 'center',
    lineHeight: 30,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  questionSubtext: {
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
    marginBottom: 32,
  },
  likertRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  likertBtnWrap: {
    flex: 1,
  },
  likertBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: THEME.optionBg,
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 80,
  },
  likertBtnSelected: {
    backgroundColor: THEME.optionSelectedBg,
    borderColor: THEME.selectedBorder,
  },
  likertLabel: {
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 13,
  },
  likertScaleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 20,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 70,
    minHeight: 48,
    justifyContent: 'center',
  },
  dotsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME.teal,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    minHeight: 48,
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.teal,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    minHeight: 48,
  },
  resultContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  resultIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultTitle: {
    textAlign: 'center',
  },
  scoreCard: {
    alignItems: 'center',
    backgroundColor: Colors.card,
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderRadius: 20,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 4,
  },
  interpretationBadge: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  interpretationText: {
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  referenceText: {
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 4,
  },
  doneButton: {
    backgroundColor: THEME.teal,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
    marginTop: 12,
  },
});
