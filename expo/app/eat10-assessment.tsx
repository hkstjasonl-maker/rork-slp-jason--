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
import { ChevronLeft, ChevronRight, Check, AlertTriangle, CheckCircle, ArrowLeft } from 'lucide-react-native';
import { log } from '@/lib/logger';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface EAT10Question {
  number: number;
  text_en: string;
  text_zh: string;
}

const EAT10_QUESTIONS: EAT10Question[] = [
  { number: 1, text_en: 'How much of a problem is swallowing for you?', text_zh: '吞嚥對你來說有多大問題？' },
  { number: 2, text_en: 'My swallowing problem interferes with my ability to eat out.', text_zh: '我的吞嚥問題影響了我外出進食的能力。' },
  { number: 3, text_en: 'Swallowing liquids takes extra effort.', text_zh: '吞嚥液體需要額外的力氣。' },
  { number: 4, text_en: 'Swallowing solids takes extra effort.', text_zh: '吞嚥固體食物需要額外的力氣。' },
  { number: 5, text_en: 'Swallowing pills takes extra effort.', text_zh: '吞嚥藥丸需要額外的力氣。' },
  { number: 6, text_en: 'Swallowing is painful.', text_zh: '吞嚥時感到疼痛。' },
  { number: 7, text_en: 'The pleasure of eating is affected by my swallowing.', text_zh: '我的吞嚥問題影響了進食的樂趣。' },
  { number: 8, text_en: 'When I swallow, food sticks in my throat.', text_zh: '吞嚥時食物卡在喉嚨。' },
  { number: 9, text_en: 'I cough when I eat.', text_zh: '進食時我會咳嗽。' },
  { number: 10, text_en: 'Swallowing is stressful.', text_zh: '吞嚥讓我感到有壓力。' },
];

interface ResponseOption {
  value: number;
  label_en: string;
  label_zh: string;
}

const RESPONSE_OPTIONS: ResponseOption[] = [
  { value: 0, label_en: 'No problem', label_zh: '沒有問題' },
  { value: 1, label_en: 'Mild', label_zh: '輕微' },
  { value: 2, label_en: 'Moderate', label_zh: '中度' },
  { value: 3, label_en: 'Severe', label_zh: '嚴重' },
  { value: 4, label_en: 'Severe problem', label_zh: '非常嚴重' },
];

const THEME = {
  blue: '#2980B9',
  blueLight: '#EBF5FB',
  blueDark: '#1A5276',
  progressBg: '#E8ECF0',
  selectedBorder: '#2471A3',
  optionBg: '#F4F6F8',
  optionSelectedBg: '#D4E6F1',
  warning: '#E67E22',
  warningLight: '#FEF5E7',
  safe: '#27AE60',
  safeLight: '#E8F8F0',
} as const;

export default function EAT10AssessmentScreen() {
  const params = useLocalSearchParams<{
    researchAssessmentId?: string;
    submissionId?: string;
    assessmentId?: string;
    assessmentName?: string;
    timepoint?: string;
  }>();
  const researchAssessmentId = Array.isArray(params.researchAssessmentId)
    ? params.researchAssessmentId[0]
    : params.researchAssessmentId;
  const submissionId = Array.isArray(params.submissionId)
    ? params.submissionId[0]
    : params.submissionId;
  const _assessmentId = Array.isArray(params.assessmentId)
    ? params.assessmentId[0]
    : params.assessmentId;

  const { language } = useApp();
  const queryClient = useQueryClient();
  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResult, setShowResult] = useState<boolean>(false);
  const [totalScore, setTotalScore] = useState<number>(0);


  const slideAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const buttonScales = useRef<Animated.Value[]>(
    RESPONSE_OPTIONS.map(() => new Animated.Value(1))
  ).current;

  const currentQuestion = EAT10_QUESTIONS[currentIndex];
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

  const animateSlide = useCallback(
    (dir: 'forward' | 'backward', cb: () => void) => {
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
    },
    [slideAnim]
  );

  const selectAnswer = useCallback(
    (value: number) => {
      if (!currentQuestion) return;
      const idx = value;
      if (buttonScales[idx]) {
        Animated.sequence([
          Animated.timing(buttonScales[idx], { toValue: 0.93, duration: 60, useNativeDriver: true }),
          Animated.spring(buttonScales[idx], { toValue: 1, friction: 4, useNativeDriver: true }),
        ]).start();
      }
      setAnswers((prev) => ({ ...prev, [currentQuestion.number]: value }));
      log('[EAT-10] Answer Q', currentQuestion.number, '=', value);

      setTimeout(() => {
        if (currentIndex < 9) {
          animateSlide('forward', () => setCurrentIndex((prev) => prev + 1));
        }
      }, 300);
    },
    [currentQuestion, currentIndex, animateSlide, buttonScales]
  );

  const goNext = useCallback(() => {
    if (currentAnswer === null) return;
    if (currentIndex < 9) {
      animateSlide('forward', () => setCurrentIndex((prev) => prev + 1));
    }
  }, [currentIndex, currentAnswer, animateSlide]);

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      animateSlide('backward', () => setCurrentIndex((prev) => prev - 1));
    } else {
      router.back();
    }
  }, [currentIndex, animateSlide]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      let sum = 0;
      for (let i = 1; i <= 10; i++) {
        sum += answers[i] ?? 0;
      }
      log('[EAT-10] Calculated total score:', sum);

      const rawResponses: Record<string, number> = {};
      for (let i = 1; i <= 10; i++) {
        rawResponses[`q${i}`] = answers[i] ?? 0;
      }

      if (submissionId) {
        log('[EAT-10] Updating assessment_submissions row:', submissionId);
        const { error } = await supabase
          .from('assessment_submissions')
          .update({
            responses: rawResponses,
            total_score: sum,
            subscale_scores: {},
            status: 'completed',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', submissionId);

        if (error) {
          log('[EAT-10] assessment_submissions update error:', error);
          throw error;
        }
      }

      if (researchAssessmentId) {
        log('[EAT-10] Updating research_assessments row:', researchAssessmentId);
        const { error } = await supabase
          .from('research_assessments')
          .update({
            total_score: sum,
            raw_responses: rawResponses,
            notes: null,
            completion_method: 'app_wizard',
            administered_date: new Date().toISOString().split('T')[0],
          })
          .eq('id', researchAssessmentId);

        if (error) {
          log('[EAT-10] research_assessments update error:', error);
          throw error;
        }
      }

      return sum;
    },
    onSuccess: (score) => {
      log('[EAT-10] Submission success, score:', score);
      setTotalScore(score);
      setShowResult(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
      void queryClient.invalidateQueries({ queryKey: ['research-assessments'] });
      void queryClient.invalidateQueries({ queryKey: ['clinical_assessments'] });
      void queryClient.invalidateQueries({ queryKey: ['assessments'] });
    },
    onError: (error) => {
      log('[EAT-10] Submit error:', error);
      Alert.alert(
        isZh ? '錯誤' : 'Error',
        isZh ? '提交失敗，請重試。' : 'Failed to submit. Please try again.'
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
    const hasDifficulty = totalScore >= 3;
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safeArea}>
          <Animated.View
            style={[
              styles.resultContainer,
              { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
            ]}
          >
            <View
              style={[
                styles.resultIconCircle,
                { backgroundColor: hasDifficulty ? THEME.warningLight : THEME.safeLight },
              ]}
            >
              {hasDifficulty ? (
                <AlertTriangle size={48} color={THEME.warning} />
              ) : (
                <CheckCircle size={48} color={THEME.safe} />
              )}
            </View>

            <Text size={22} weight="bold" color={Colors.textPrimary} style={styles.resultTitle}>
              {isZh ? 'EAT-10 分數' : 'Your EAT-10 Score'}
            </Text>

            <View
              style={[
                styles.scoreCard,
                { borderColor: hasDifficulty ? THEME.warning : THEME.safe },
              ]}
            >
              <Text
                size={48}
                weight="bold"
                color={hasDifficulty ? THEME.warning : THEME.safe}
              >
                {totalScore}
              </Text>
              <Text size={14} color={Colors.textSecondary}>
                / 40
              </Text>
            </View>

            <View
              style={[
                styles.interpretationBadge,
                {
                  backgroundColor: hasDifficulty ? THEME.warningLight : THEME.safeLight,
                },
              ]}
            >
              <Text
                size={16}
                weight="600"
                color={hasDifficulty ? '#7A4B00' : '#1B8A4E'}
              >
                {hasDifficulty
                  ? isZh
                    ? '可能有吞嚥困難'
                    : 'Possible Swallowing Difficulty'
                  : isZh
                  ? '正常範圍'
                  : 'Normal Range'}
              </Text>
            </View>

            <Text size={14} color={Colors.textSecondary} style={styles.interpretationText}>
              {hasDifficulty
                ? isZh
                  ? '分數 ≥ 3 表示可能存在吞嚥困難，建議諮詢專業人士。'
                  : 'A score of 3 or higher may indicate swallowing difficulty. Consider consulting a professional.'
                : isZh
                ? '分數 < 3 表示吞嚥功能正常。'
                : 'A score below 3 suggests normal swallowing function.'}
            </Text>

            <Text size={12} color="#999" style={styles.referenceText}>
              Belafsky et al. (2008). Validity and reliability of the Eating Assessment Tool (EAT-10).
            </Text>

            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => router.back()}
              activeOpacity={0.8}
              testID="eat10-done"
            >
              <Text size={16} weight="bold" color={Colors.white}>
                {isZh ? '返回評估列表' : 'Back to Assessments'}
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
            testID="eat10-back"
          >
            <ArrowLeft size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text
            size={15}
            weight="600"
            color={Colors.textPrimary}
            numberOfLines={1}
            style={styles.topBarTitle}
          >
            EAT-10
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

          <Text size={14} color={Colors.textSecondary} style={styles.questionSubtext}>
            {isZh ? currentQuestion?.text_en : currentQuestion?.text_zh}
          </Text>

          <View style={styles.optionsColumn}>
            {RESPONSE_OPTIONS.map((option) => {
              const isSelected = currentAnswer === option.value;
              return (
                <Animated.View
                  key={option.value}
                  style={[
                    styles.optionBtnWrap,
                    {
                      transform: [
                        { scale: buttonScales[option.value] || new Animated.Value(1) },
                      ],
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={[styles.optionBtn, isSelected && styles.optionBtnSelected]}
                    onPress={() => selectAnswer(option.value)}
                    activeOpacity={0.7}
                    testID={`eat10-option-${option.value}`}
                  >
                    <View style={[styles.optionNumber, isSelected && styles.optionNumberSelected]}>
                      <Text
                        size={18}
                        weight="bold"
                        color={isSelected ? Colors.white : THEME.blue}
                      >
                        {option.value}
                      </Text>
                    </View>
                    <View style={styles.optionLabelWrap}>
                      <Text
                        size={16}
                        weight={isSelected ? '600' : 'normal'}
                        color={isSelected ? THEME.blueDark : Colors.textPrimary}
                      >
                        {isZh ? option.label_zh : option.label_en}
                      </Text>
                      <Text
                        size={12}
                        color={isSelected ? THEME.blue : Colors.textSecondary}
                      >
                        {isZh ? option.label_en : option.label_zh}
                      </Text>
                    </View>
                    {isSelected && (
                      <Check size={20} color={THEME.blue} />
                    )}
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            onPress={goBack}
            style={styles.navBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID="eat10-prev"
          >
            <ChevronLeft
              size={20}
              color={currentIndex === 0 ? Colors.disabled : Colors.textSecondary}
            />
            <Text
              size={14}
              color={currentIndex === 0 ? Colors.disabled : Colors.textSecondary}
            >
              {isZh ? '上一題' : 'Back'}
            </Text>
          </TouchableOpacity>

          <View style={styles.dotsRow}>
            {EAT10_QUESTIONS.map((q, idx) => {
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
                        ? THEME.blue
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
              testID="eat10-submit"
            >
              {submitMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Check size={18} color={Colors.white} />
                  <Text size={14} weight="bold" color={Colors.white}>
                    {isZh ? '提交' : 'Submit'}
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
              testID="eat10-next"
            >
              <Text size={14} weight="600" color={Colors.white}>
                {isZh ? '下一題' : 'Next'}
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
    backgroundColor: THEME.blue,
    borderRadius: 2,
  },
  questionArea: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  questionNumberBadge: {
    alignSelf: 'center',
    backgroundColor: THEME.blue,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 16,
  },
  questionText: {
    textAlign: 'center',
    lineHeight: 30,
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  questionSubtext: {
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
    marginBottom: 24,
  },
  optionsColumn: {
    gap: 8,
  },
  optionBtnWrap: {},
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: THEME.optionBg,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 12,
    minHeight: 52,
  },
  optionBtnSelected: {
    backgroundColor: THEME.optionSelectedBg,
    borderColor: THEME.selectedBorder,
  },
  optionNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.blueLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionNumberSelected: {
    backgroundColor: THEME.blue,
  },
  optionLabelWrap: {
    flex: 1,
    gap: 1,
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
    backgroundColor: THEME.blue,
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
    backgroundColor: Colors.secondary,
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
    backgroundColor: THEME.blue,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
    marginTop: 12,
  },
});
