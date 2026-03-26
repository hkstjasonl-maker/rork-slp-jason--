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
import { ChevronLeft, ChevronRight, Check, CheckCircle, ArrowLeft } from 'lucide-react-native';
import { log } from '@/lib/logger';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface SWALQuestion {
  number: number;
  domain_en: string;
  domain_zh: string;
  text_en: string;
  text_zh: string;
}

const SWALQOL_QUESTIONS: SWALQuestion[] = [
  { number: 1, domain_en: 'Burden', domain_zh: '負擔', text_en: 'Dealing with my swallowing problem is a major challenge.', text_zh: '處理我的吞嚥問題是一大挑戰。' },
  { number: 2, domain_en: 'Burden', domain_zh: '負擔', text_en: 'My swallowing problem is a major distraction in my life.', text_zh: '吞嚥問題嚴重分散了我的生活注意力。' },
  { number: 3, domain_en: 'Eating duration', domain_zh: '進食時間', text_en: 'It takes me longer to eat than other people.', text_zh: '我比其他人吃得更慢。' },
  { number: 4, domain_en: 'Eating desire', domain_zh: '進食慾望', text_en: 'I have lost my appetite because of my swallowing problem.', text_zh: '因吞嚥問題我失去了食慾。' },
  { number: 5, domain_en: 'Food selection', domain_zh: '食物選擇', text_en: 'I cannot eat many of the foods I would like.', text_zh: '很多想吃的食物我都不能吃。' },
  { number: 6, domain_en: 'Communication', domain_zh: '溝通', text_en: 'My swallowing problem makes it hard to talk to people.', text_zh: '吞嚥問題讓我難以與人交談。' },
  { number: 7, domain_en: 'Fear', domain_zh: '恐懼', text_en: 'I am afraid of choking when I eat.', text_zh: '進食時我害怕噎住。' },
  { number: 8, domain_en: 'Fear', domain_zh: '恐懼', text_en: 'I worry about getting pneumonia.', text_zh: '我擔心得肺炎。' },
  { number: 9, domain_en: 'Mental health', domain_zh: '心理健康', text_en: 'I feel depressed because I can\'t eat what I want.', text_zh: '因為不能吃想吃的東西我感到沮喪。' },
  { number: 10, domain_en: 'Mental health', domain_zh: '心理健康', text_en: 'My swallowing problem frustrates me.', text_zh: '吞嚥問題讓我感到沮喪。' },
  { number: 11, domain_en: 'Social', domain_zh: '社交', text_en: "I don't go out to eat because of my swallowing.", text_zh: '因吞嚥問題我不外出進食。' },
  { number: 12, domain_en: 'Social', domain_zh: '社交', text_en: 'My swallowing problem limits my social life.', text_zh: '吞嚥問題限制了我的社交生活。' },
  { number: 13, domain_en: 'Fatigue', domain_zh: '疲勞', text_en: 'I feel weak because I am not eating enough.', text_zh: '因為吃得不夠我感到虛弱。' },
  { number: 14, domain_en: 'Sleep', domain_zh: '睡眠', text_en: 'My swallowing problem makes it hard to sleep.', text_zh: '吞嚥問題讓我難以入睡。' },
];

interface ResponseOption {
  value: number;
  label_en: string;
  label_zh: string;
}

const RESPONSE_OPTIONS: ResponseOption[] = [
  { value: 1, label_en: 'Strongly Agree / Almost always', label_zh: '非常同意/幾乎總是' },
  { value: 2, label_en: 'Agree / Often', label_zh: '同意/經常' },
  { value: 3, label_en: 'Undecided / Sometimes', label_zh: '不確定/有時' },
  { value: 4, label_en: 'Disagree / Hardly ever', label_zh: '不同意/很少' },
  { value: 5, label_en: 'Strongly Disagree / Never', label_zh: '非常不同意/從不' },
];

const THEME = {
  indigo: '#34495E',
  indigoLight: '#EBF0F5',
  indigoDark: '#1C2833',
  progressBg: '#D5DBDB',
  selectedBorder: '#2C3E50',
  optionBg: '#F2F4F4',
  optionSelectedBg: '#D4E6F1',
} as const;

const TOTAL_Q = SWALQOL_QUESTIONS.length;

export default function SWALQOLAssessmentScreen() {
  const params = useLocalSearchParams<{ researchAssessmentId?: string }>();
  const researchAssessmentId = Array.isArray(params.researchAssessmentId)
    ? params.researchAssessmentId[0]
    : params.researchAssessmentId;

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

  const currentQuestion = SWALQOL_QUESTIONS[currentIndex];
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

  const selectAnswer = useCallback((value: number, btnIdx: number) => {
    if (!currentQuestion) return;
    Animated.sequence([
      Animated.timing(buttonScales[btnIdx], { toValue: 0.93, duration: 60, useNativeDriver: true }),
      Animated.spring(buttonScales[btnIdx], { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    setAnswers(prev => ({ ...prev, [currentQuestion.number]: value }));
    log('[SWAL-QOL] Answer Q', currentQuestion.number, '=', value);
    setTimeout(() => {
      if (currentIndex < TOTAL_Q - 1) {
        animateSlide('forward', () => setCurrentIndex(prev => prev + 1));
      }
    }, 300);
  }, [currentQuestion, currentIndex, animateSlide, buttonScales]);

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
      if (!researchAssessmentId) throw new Error('No assessment ID');
      const rawResponses: Record<string, number> = {};
      let sum = 0;
      for (let i = 1; i <= TOTAL_Q; i++) {
        const val = answers[i] ?? 3;
        rawResponses[`q${i}`] = val;
        sum += val;
      }
      const score = Math.round((sum / TOTAL_Q) * 20 * 10) / 10;
      log('[SWAL-QOL] Calculated score:', score);

      const { error } = await supabase
        .from('research_assessments')
        .update({
          total_score: score,
          raw_responses: rawResponses,
          completion_method: 'app_wizard',
          administered_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', researchAssessmentId);

      if (error) { log('[SWAL-QOL] Update error:', error); throw error; }
      return score;
    },
    onSuccess: (score) => {
      setTotalScore(score);
      setShowResult(true);
      void queryClient.invalidateQueries({ queryKey: ['research-assessments'] });
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
    const isGood = totalScore >= 60;
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safeArea}>
          <Animated.View style={[styles.resultContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
            <View style={[styles.resultIconCircle, { backgroundColor: isGood ? Colors.successLight : '#FFF3E0' }]}>
              <CheckCircle size={48} color={isGood ? Colors.success : '#E67E22'} />
            </View>
            <Text size={22} weight="bold" color={Colors.textPrimary} style={styles.resultTitle}>
              {isZh ? 'SWAL-QOL 評估已完成' : 'SWAL-QOL Completed'}
            </Text>
            <View style={[styles.scoreCard, { borderColor: isGood ? Colors.success : '#E67E22' }]}>
              <Text size={48} weight="bold" color={isGood ? Colors.success : '#E67E22'}>{totalScore}</Text>
              <Text size={14} color={Colors.textSecondary}>/ 100</Text>
            </View>
            <Text size={14} color={Colors.textSecondary} style={styles.interpretationText}>
              {isZh
                ? '分數越高表示吞嚥相關生活品質越好（100為最佳）。'
                : 'Higher scores indicate better swallowing-related quality of life (100 = best).'}
            </Text>
            <TouchableOpacity style={styles.doneButton} onPress={() => router.back()} activeOpacity={0.8} testID="swalqol-done">
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
          <TouchableOpacity onPress={goBack} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID="swalqol-back">
            <ArrowLeft size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text size={15} weight="600" color={Colors.textPrimary} numberOfLines={1} style={styles.topBarTitle}>SWAL-QOL</Text>
          <Text size={14} weight="500" color={Colors.textSecondary}>{currentIndex + 1} / {TOTAL_Q}</Text>
        </View>

        <View style={styles.progressBarWrap}>
          <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
          </View>
        </View>

        <Animated.View style={[styles.questionArea, { transform: [{ translateX: slideAnim }] }]}>
          <View style={styles.domainBadge}>
            <Text size={11} weight="bold" color={THEME.indigo}>
              {isZh ? currentQuestion?.domain_zh : currentQuestion?.domain_en}
            </Text>
          </View>
          <View style={styles.questionNumberBadge}>
            <Text size={13} weight="bold" color={Colors.white}>Q{currentQuestion?.number}</Text>
          </View>
          <Text size={19} weight="500" color={Colors.textPrimary} style={styles.questionText}>
            {isZh ? currentQuestion?.text_zh : currentQuestion?.text_en}
          </Text>
          <Text size={13} color={Colors.textSecondary} style={styles.questionSubtext}>
            {isZh ? currentQuestion?.text_en : currentQuestion?.text_zh}
          </Text>
          <View style={styles.optionsColumn}>
            {RESPONSE_OPTIONS.map((option, idx) => {
              const isSelected = currentAnswer === option.value;
              return (
                <Animated.View key={option.value} style={{ transform: [{ scale: buttonScales[idx] || new Animated.Value(1) }] }}>
                  <TouchableOpacity
                    style={[styles.optionBtn, isSelected && styles.optionBtnSelected]}
                    onPress={() => selectAnswer(option.value, idx)}
                    activeOpacity={0.7}
                    testID={`swalqol-option-${option.value}`}
                  >
                    <View style={[styles.optionNumber, isSelected && styles.optionNumberSelected]}>
                      <Text size={16} weight="bold" color={isSelected ? Colors.white : THEME.indigo}>{option.value}</Text>
                    </View>
                    <View style={styles.optionLabelWrap}>
                      <Text size={14} weight={isSelected ? '600' : 'normal'} color={isSelected ? THEME.indigoDark : Colors.textPrimary}>
                        {isZh ? option.label_zh : option.label_en}
                      </Text>
                    </View>
                    {isSelected && <Check size={18} color={THEME.indigo} />}
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>

        <View style={styles.bottomBar}>
          <TouchableOpacity onPress={goBack} style={styles.navBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID="swalqol-prev">
            <ChevronLeft size={20} color={currentIndex === 0 ? Colors.disabled : Colors.textSecondary} />
            <Text size={14} color={currentIndex === 0 ? Colors.disabled : Colors.textSecondary}>{isZh ? '上一題' : 'Back'}</Text>
          </TouchableOpacity>

          <Text size={13} weight="600" color={Colors.textSecondary}>
            {isZh ? `第${currentIndex + 1}題/共${TOTAL_Q}題` : `Question ${currentIndex + 1} of ${TOTAL_Q}`}
          </Text>

          {isLastQuestion && allAnswered ? (
            <TouchableOpacity onPress={() => submitMutation.mutate()} style={styles.submitBtn} disabled={submitMutation.isPending} activeOpacity={0.8} testID="swalqol-submit">
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
              testID="swalqol-next"
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
  progressBarFill: { height: '100%', backgroundColor: THEME.indigo, borderRadius: 2 },
  questionArea: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  domainBadge: { alignSelf: 'center', backgroundColor: THEME.indigoLight, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
  questionNumberBadge: { alignSelf: 'center', backgroundColor: THEME.indigo, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12, marginBottom: 16 },
  questionText: { textAlign: 'center', lineHeight: 28, paddingHorizontal: 4, marginBottom: 6 },
  questionSubtext: { textAlign: 'center', lineHeight: 20, paddingHorizontal: 8, marginBottom: 20 },
  optionsColumn: { gap: 8 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: THEME.optionBg, borderWidth: 2, borderColor: 'transparent', gap: 12, minHeight: 50 },
  optionBtnSelected: { backgroundColor: THEME.optionSelectedBg, borderColor: THEME.selectedBorder },
  optionNumber: { width: 36, height: 36, borderRadius: 18, backgroundColor: THEME.indigoLight, justifyContent: 'center', alignItems: 'center' },
  optionNumberSelected: { backgroundColor: THEME.indigo },
  optionLabelWrap: { flex: 1, gap: 1 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 20 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 70, minHeight: 48, justifyContent: 'center' },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: THEME.indigo, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, minHeight: 48 },
  nextBtnDisabled: { opacity: 0.4 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: THEME.indigo, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, minHeight: 48 },
  resultContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  resultIconCircle: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  resultTitle: { textAlign: 'center' },
  scoreCard: { alignItems: 'center', backgroundColor: Colors.card, paddingHorizontal: 32, paddingVertical: 20, borderRadius: 20, borderWidth: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, gap: 4 },
  interpretationText: { textAlign: 'center', lineHeight: 20, paddingHorizontal: 12 },
  doneButton: { backgroundColor: THEME.indigo, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40, marginTop: 12 },
});
