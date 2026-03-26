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
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/contexts/AppContext';
import { ScaledText as Text } from '@/components/ScaledText';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { ChevronLeft, ChevronRight, Check, CheckCircle, ArrowLeft } from 'lucide-react-native';
import { log } from '@/lib/logger';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface COASTQuestion {
  number: number;
  text_en: string;
  text_zh: string;
}

const COAST_QUESTIONS: COASTQuestion[] = [
  { number: 1, text_en: 'How well can you talk to people close to you?', text_zh: '你能多好地與親近的人交談？' },
  { number: 2, text_en: 'How well can you talk to strangers?', text_zh: '你能多好地與陌生人交談？' },
  { number: 3, text_en: 'How well can you talk on the phone?', text_zh: '你能多好地打電話交談？' },
  { number: 4, text_en: 'How well can you follow a conversation in a group?', text_zh: '你能多好地跟上群體對話？' },
  { number: 5, text_en: 'How well can you understand TV/radio?', text_zh: '你能多好地理解電視/廣播？' },
  { number: 6, text_en: 'How well can you read?', text_zh: '你的閱讀能力如何？' },
  { number: 7, text_en: 'How well can you write?', text_zh: '你的書寫能力如何？' },
  { number: 8, text_en: 'How well can you deal with money?', text_zh: '你能多好地處理金錢事務？' },
  { number: 9, text_en: 'How well can you make your needs known?', text_zh: '你能多好地表達自己的需要？' },
  { number: 10, text_en: 'How confident are you in communicating?', text_zh: '你對溝通有多大信心？' },
];

const SCORE_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const THEME = {
  ocean: '#0077B6',
  oceanLight: '#E8F4FD',
  oceanDark: '#023E73',
  progressBg: '#D4E8F5',
  selectedBg: '#CAF0F8',
  selectedBorder: '#0077B6',
} as const;

const TOTAL_Q = COAST_QUESTIONS.length;

export default function COASTAssessmentScreen() {
  const params = useLocalSearchParams<{ researchAssessmentId?: string; submissionId?: string }>();
  const researchAssessmentId = Array.isArray(params.researchAssessmentId)
    ? params.researchAssessmentId[0]
    : params.researchAssessmentId;
  const submissionId = Array.isArray(params.submissionId)
    ? params.submissionId[0]
    : params.submissionId;

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

  const currentQuestion = COAST_QUESTIONS[currentIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.number] ?? null : null;
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === TOTAL_Q;

  useEffect(() => {
    Animated.timing(progressAnim, { toValue: answeredCount / TOTAL_Q, duration: 300, useNativeDriver: false }).start();
  }, [answeredCount, progressAnim]);

  const animateSlide = useCallback((dir: 'forward' | 'backward', cb: () => void) => {
    const exitVal = dir === 'forward' ? -SCREEN_WIDTH : SCREEN_WIDTH;
    const enterVal = dir === 'forward' ? SCREEN_WIDTH : -SCREEN_WIDTH;
    Animated.timing(slideAnim, { toValue: exitVal, duration: 180, useNativeDriver: true }).start(() => {
      cb();
      slideAnim.setValue(enterVal);
      Animated.timing(slideAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    });
  }, [slideAnim]);

  const selectAnswer = useCallback((value: number) => {
    if (!currentQuestion) return;
    setAnswers(prev => ({ ...prev, [currentQuestion.number]: value }));
    log('[COAST] Answer Q', currentQuestion.number, '=', value);
    setTimeout(() => {
      if (currentIndex < TOTAL_Q - 1) {
        animateSlide('forward', () => setCurrentIndex(prev => prev + 1));
      }
    }, 400);
  }, [currentQuestion, currentIndex, animateSlide]);

  const goNext = useCallback(() => {
    if (currentAnswer === null) return;
    if (currentIndex < TOTAL_Q - 1) {
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
      if (!researchAssessmentId && !submissionId) throw new Error('No assessment ID');
      const rawResponses: Record<string, number> = {};
      let sum = 0;
      for (let i = 1; i <= TOTAL_Q; i++) {
        const val = answers[i] ?? 0;
        rawResponses[`q${i}`] = val;
        sum += val;
      }
      const score = Math.round((sum / TOTAL_Q) * 10) / 10;
      log('[COAST] Calculated mean score:', score);

      if (submissionId) {
        log('[COAST] Updating assessment_submissions row:', submissionId);
        const { error } = await supabase
          .from('assessment_submissions')
          .update({
            responses: rawResponses,
            total_score: score,
            subscale_scores: {},
            status: 'completed',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', submissionId);

        if (error) { log('[COAST] assessment_submissions update error:', error); throw error; }
      }

      if (researchAssessmentId) {
        log('[COAST] Updating research_assessments row:', researchAssessmentId);
        const { error } = await supabase
          .from('research_assessments')
          .update({
            total_score: score,
            raw_responses: rawResponses,
            completion_method: 'app_wizard',
            administered_date: new Date().toISOString().split('T')[0],
          })
          .eq('id', researchAssessmentId);

        if (error) { log('[COAST] research_assessments update error:', error); throw error; }
      }

      return score;
    },
    onSuccess: (score) => {
      setTotalScore(score);
      setShowResult(true);
      void queryClient.invalidateQueries({ queryKey: ['research-assessments'] });
      void queryClient.invalidateQueries({ queryKey: ['clinical_assessments'] });
      void queryClient.invalidateQueries({ queryKey: ['assessments'] });
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
    },
    onError: () => {
      Alert.alert(isZh ? '錯誤' : 'Error', isZh ? '提交失敗，請重試。' : 'Failed to submit. Please try again.');
    },
  });

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  if (showResult) {
    const isGood = totalScore >= 5;
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safeArea}>
          <Animated.View style={[styles.resultContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
            <View style={[styles.resultIconCircle, { backgroundColor: isGood ? Colors.successLight : '#FFF3E0' }]}>
              <CheckCircle size={48} color={isGood ? Colors.success : '#E67E22'} />
            </View>
            <Text size={22} weight="bold" color={Colors.textPrimary} style={styles.resultTitle}>
              {isZh ? 'COAST 評估已完成' : 'COAST Completed'}
            </Text>
            <View style={[styles.scoreCard, { borderColor: isGood ? Colors.success : '#E67E22' }]}>
              <Text size={48} weight="bold" color={isGood ? Colors.success : '#E67E22'}>{totalScore}</Text>
              <Text size={14} color={Colors.textSecondary}>/ 10</Text>
            </View>
            <Text size={14} color={Colors.textSecondary} style={styles.interpretationText}>
              {isZh
                ? '分數越高表示溝通能力越好（10為最佳）。'
                : 'Higher scores indicate better communication ability (10 = best).'}
            </Text>
            <TouchableOpacity style={styles.doneButton} onPress={() => router.back()} activeOpacity={0.8} testID="coast-done">
              <Text size={16} weight="bold" color={Colors.white}>{isZh ? '返回評估列表' : 'Back to Assessments'}</Text>
            </TouchableOpacity>
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  const isLastQuestion = currentIndex === TOTAL_Q - 1;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={goBack} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID="coast-back">
            <ArrowLeft size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text size={15} weight="600" color={Colors.textPrimary} numberOfLines={1} style={styles.topBarTitle}>COAST</Text>
          <Text size={14} weight="500" color={Colors.textSecondary}>{currentIndex + 1} / {TOTAL_Q}</Text>
        </View>

        <View style={styles.progressBarWrap}>
          <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
          </View>
        </View>

        <Animated.View style={[styles.questionArea, { transform: [{ translateX: slideAnim }] }]}>
          <View style={styles.questionNumberBadge}>
            <Text size={13} weight="bold" color={Colors.white}>Q{currentQuestion?.number}</Text>
          </View>
          <Text size={20} weight="500" color={Colors.textPrimary} style={styles.questionText}>
            {isZh ? currentQuestion?.text_zh : currentQuestion?.text_en}
          </Text>
          <Text size={14} color={Colors.textSecondary} style={styles.questionSubtext}>
            {isZh ? currentQuestion?.text_en : currentQuestion?.text_zh}
          </Text>

          <View style={styles.scaleRow}>
            {SCORE_VALUES.map((val) => {
              const isSelected = currentAnswer === val;
              return (
                <TouchableOpacity
                  key={val}
                  style={[styles.scaleBtn, isSelected && styles.scaleBtnSelected]}
                  onPress={() => selectAnswer(val)}
                  activeOpacity={0.7}
                  testID={`coast-score-${val}`}
                >
                  <Text
                    size={Platform.OS === 'web' ? 14 : 16}
                    weight="bold"
                    color={isSelected ? Colors.white : THEME.ocean}
                  >
                    {val}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.scaleLabels}>
            <Text size={11} color={Colors.textSecondary}>{isZh ? '最差' : 'Worst'}</Text>
            <Text size={11} color={Colors.textSecondary}>{isZh ? '最佳' : 'Best'}</Text>
          </View>
        </Animated.View>

        <View style={styles.bottomBar}>
          <TouchableOpacity onPress={goBack} style={styles.navBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID="coast-prev">
            <ChevronLeft size={20} color={currentIndex === 0 ? Colors.disabled : Colors.textSecondary} />
            <Text size={14} color={currentIndex === 0 ? Colors.disabled : Colors.textSecondary}>{isZh ? '上一題' : 'Back'}</Text>
          </TouchableOpacity>

          <Text size={13} weight="600" color={Colors.textSecondary}>
            {isZh ? `第${currentIndex + 1}題/共${TOTAL_Q}題` : `Question ${currentIndex + 1} of ${TOTAL_Q}`}
          </Text>

          {isLastQuestion && allAnswered ? (
            <TouchableOpacity onPress={() => submitMutation.mutate()} style={styles.submitBtn} disabled={submitMutation.isPending} activeOpacity={0.8} testID="coast-submit">
              {submitMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Check size={18} color={Colors.white} />
                  <Text size={14} weight="bold" color={Colors.white}>{isZh ? '提交' : 'Submit'}</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={goNext}
              style={[styles.nextBtn, currentAnswer === null && styles.nextBtnDisabled]}
              disabled={currentAnswer === null}
              testID="coast-next"
            >
              <Text size={14} weight="600" color={Colors.white}>{isZh ? '下一題' : 'Next'}</Text>
              <ChevronRight size={18} color={Colors.white} />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  safeArea: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, gap: 8 },
  backButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  topBarTitle: { flex: 1 },
  progressBarWrap: { paddingHorizontal: 20, paddingBottom: 4 },
  progressBarBg: { height: 4, backgroundColor: THEME.progressBg, borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: THEME.ocean, borderRadius: 2 },
  questionArea: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  questionNumberBadge: { alignSelf: 'center', backgroundColor: THEME.ocean, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12, marginBottom: 20 },
  questionText: { textAlign: 'center', lineHeight: 30, paddingHorizontal: 4, marginBottom: 8 },
  questionSubtext: { textAlign: 'center', lineHeight: 20, paddingHorizontal: 8, marginBottom: 32 },
  scaleRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4 },
  scaleBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: THEME.oceanLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  scaleBtnSelected: {
    backgroundColor: THEME.ocean,
    borderColor: THEME.oceanDark,
  },
  scaleLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, marginTop: 8 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 20 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 70, minHeight: 48, justifyContent: 'center' },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: THEME.ocean, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, minHeight: 48 },
  nextBtnDisabled: { opacity: 0.4 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: THEME.ocean, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, minHeight: 48 },
  resultContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  resultIconCircle: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  resultTitle: { textAlign: 'center' },
  scoreCard: { alignItems: 'center', backgroundColor: Colors.card, paddingHorizontal: 32, paddingVertical: 20, borderRadius: 20, borderWidth: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, gap: 4 },
  interpretationText: { textAlign: 'center', lineHeight: 20, paddingHorizontal: 12 },
  doneButton: { backgroundColor: THEME.ocean, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40, marginTop: 12 },
});
