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

interface DHIQuestion {
  id: string;
  subscale: 'P' | 'F' | 'E';
  number: number;
  text_en: string;
  text_zh: string;
}

const DHI_QUESTIONS: DHIQuestion[] = [
  { id: 'P1', subscale: 'P', number: 1, text_en: 'I cough when I drink liquids.', text_zh: '喝液體時我會咳嗽。' },
  { id: 'P2', subscale: 'P', number: 2, text_en: 'I cough when I eat solid food.', text_zh: '吃固體食物時我會咳嗽。' },
  { id: 'P3', subscale: 'P', number: 3, text_en: 'I have to swallow again before food will go down.', text_zh: '食物要再吞一次才能嚥下。' },
  { id: 'P4', subscale: 'P', number: 4, text_en: 'Swallowing is more difficult at the end of the day.', text_zh: '一天結束時吞嚥更困難。' },
  { id: 'P5', subscale: 'P', number: 5, text_en: 'I have to clear my throat frequently.', text_zh: '我需要經常清喉嚨。' },
  { id: 'P6', subscale: 'P', number: 6, text_en: 'Food gets stuck in my throat.', text_zh: '食物卡在喉嚨裡。' },
  { id: 'P7', subscale: 'P', number: 7, text_en: 'I have pain when I swallow.', text_zh: '吞嚥時感到疼痛。' },
  { id: 'P8', subscale: 'P', number: 8, text_en: 'My mouth is dry.', text_zh: '我的口腔乾燥。' },
  { id: 'P9', subscale: 'P', number: 9, text_en: 'I drool.', text_zh: '我會流口水。' },
  { id: 'F1', subscale: 'F', number: 10, text_en: 'I have to restrict the amount I eat at meals.', text_zh: '進餐時我必須限制食量。' },
  { id: 'F2', subscale: 'F', number: 11, text_en: 'I avoid some foods because of difficulty swallowing.', text_zh: '因吞嚥困難我避免某些食物。' },
  { id: 'F3', subscale: 'F', number: 12, text_en: 'I take longer to eat than others.', text_zh: '我比別人吃得更慢。' },
  { id: 'F4', subscale: 'F', number: 13, text_en: 'I eat less because of my swallowing problem.', text_zh: '因吞嚥問題我吃得更少。' },
  { id: 'F5', subscale: 'F', number: 14, text_en: 'It takes me longer to swallow liquids.', text_zh: '我吞嚥液體需要更長時間。' },
  { id: 'F6', subscale: 'F', number: 15, text_en: 'I have to eat smaller bites.', text_zh: '我必須吃小口一點。' },
  { id: 'F7', subscale: 'F', number: 16, text_en: 'I have difficulty swallowing pills/tablets.', text_zh: '我難以吞嚥藥丸/藥片。' },
  { id: 'F8', subscale: 'F', number: 17, text_en: 'I chew my food more carefully.', text_zh: '我更仔細地咀嚼食物。' },
  { id: 'F9', subscale: 'F', number: 18, text_en: 'I need to wash food down with liquids.', text_zh: '我需要用液體把食物沖下去。' },
  { id: 'E1', subscale: 'E', number: 19, text_en: 'I am embarrassed by my swallowing difficulty.', text_zh: '我為吞嚥困難感到尷尬。' },
  { id: 'E2', subscale: 'E', number: 20, text_en: 'I am afraid of choking.', text_zh: '我害怕噎住。' },
  { id: 'E3', subscale: 'E', number: 21, text_en: 'I feel anxious because of my swallowing problem.', text_zh: '因吞嚥問題我感到焦慮。' },
  { id: 'E4', subscale: 'E', number: 22, text_en: 'I feel depressed because of my swallowing problem.', text_zh: '因吞嚥問題我感到沮喪。' },
  { id: 'E5', subscale: 'E', number: 23, text_en: 'I am frustrated by my swallowing problem.', text_zh: '我對吞嚥問題感到沮喪。' },
  { id: 'E6', subscale: 'E', number: 24, text_en: 'My swallowing difficulty limits my social life.', text_zh: '吞嚥困難限制了我的社交生活。' },
  { id: 'E7', subscale: 'E', number: 25, text_en: 'I feel isolated because of my swallowing problem.', text_zh: '因吞嚥問題我感到孤立。' },
];

interface ResponseOption {
  value: number;
  label_en: string;
  label_zh: string;
}

const RESPONSE_OPTIONS: ResponseOption[] = [
  { value: 0, label_en: 'Never', label_zh: '從不' },
  { value: 2, label_en: 'Sometimes', label_zh: '有時' },
  { value: 4, label_en: 'Always', label_zh: '總是' },
];

const THEME = {
  red: '#C0392B',
  redLight: '#FDEDEC',
  redDark: '#6E1710',
  progressBg: '#F0E0DE',
  selectedBorder: '#A93226',
  optionBg: '#FAF2F1',
  optionSelectedBg: '#F5D5D2',
} as const;

const TOTAL_Q = DHI_QUESTIONS.length;

function getSubscaleLabel(subscale: 'P' | 'F' | 'E', isZh: boolean): string {
  switch (subscale) {
    case 'P': return isZh ? '身體 Physical' : 'Physical 身體';
    case 'F': return isZh ? '功能 Functional' : 'Functional 功能';
    case 'E': return isZh ? '情緒 Emotional' : 'Emotional 情緒';
  }
}

export default function DHIAssessmentScreen() {
  const params = useLocalSearchParams<{
    researchAssessmentId?: string;
  }>();
  const researchAssessmentId = Array.isArray(params.researchAssessmentId)
    ? params.researchAssessmentId[0]
    : params.researchAssessmentId;

  const { language } = useApp();
  const queryClient = useQueryClient();
  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showResult, setShowResult] = useState<boolean>(false);
  const [totalScore, setTotalScore] = useState<number>(0);
  const [subscaleScores, setSubscaleScores] = useState<{ physical: number; functional: number; emotional: number }>({ physical: 0, functional: 0, emotional: 0 });

  const slideAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const buttonScales = useRef<Animated.Value[]>(
    RESPONSE_OPTIONS.map(() => new Animated.Value(1))
  ).current;

  const currentQuestion = DHI_QUESTIONS[currentIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] ?? null : null;
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === TOTAL_Q;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: answeredCount / TOTAL_Q,
      duration: 300,
      useNativeDriver: false,
    }).start();
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
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: value }));
    log('[DHI] Answer', currentQuestion.id, '=', value);
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
      let physical = 0, functional = 0, emotional = 0;
      const rawResponses: Record<string, number> = {};

      for (const q of DHI_QUESTIONS) {
        const val = answers[q.id] ?? 0;
        rawResponses[q.id] = val;
        if (q.subscale === 'P') physical += val;
        else if (q.subscale === 'F') functional += val;
        else emotional += val;
      }
      const total = physical + functional + emotional;
      log('[DHI] Scores - Total:', total, 'P:', physical, 'F:', functional, 'E:', emotional);

      const { error } = await supabase
        .from('research_assessments')
        .update({
          total_score: total,
          subscale_scores: { physical, functional, emotional },
          raw_responses: rawResponses,
          completion_method: 'app_wizard',
          administered_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', researchAssessmentId);

      if (error) {
        log('[DHI] Update error:', error);
        throw error;
      }
      return { total, physical, functional, emotional };
    },
    onSuccess: (scores) => {
      setTotalScore(scores.total);
      setSubscaleScores({ physical: scores.physical, functional: scores.functional, emotional: scores.emotional });
      setShowResult(true);
      void queryClient.invalidateQueries({ queryKey: ['research-assessments'] });
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
    },
    onError: (error) => {
      log('[DHI] Submit error:', error);
      Alert.alert(isZh ? '錯誤' : 'Error', isZh ? '提交失敗，請重試。' : 'Failed to submit. Please try again.');
    },
  });

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  if (showResult) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safeArea}>
          <Animated.View style={[styles.resultContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.resultIconCircle}>
              <CheckCircle size={48} color={Colors.success} />
            </View>
            <Text size={22} weight="bold" color={Colors.textPrimary} style={styles.resultTitle}>
              {isZh ? 'DHI 評估已完成' : 'DHI Assessment Completed'}
            </Text>
            <View style={[styles.scoreCard, { borderColor: THEME.red }]}>
              <Text size={48} weight="bold" color={THEME.red}>{totalScore}</Text>
              <Text size={14} color={Colors.textSecondary}>/ 100</Text>
            </View>
            <View style={styles.subscaleRow}>
              {(['physical', 'functional', 'emotional'] as const).map(key => (
                <View key={key} style={styles.subscaleBox}>
                  <Text size={12} color={Colors.textSecondary}>
                    {getSubscaleLabel(key === 'physical' ? 'P' : key === 'functional' ? 'F' : 'E', isZh)}
                  </Text>
                  <Text size={20} weight="bold" color={THEME.red}>
                    {subscaleScores[key]}
                  </Text>
                  <Text size={10} color={Colors.textSecondary}>
                    / {key === 'physical' ? 36 : key === 'functional' ? 36 : 28}
                  </Text>
                </View>
              ))}
            </View>
            <Text size={14} color={Colors.textSecondary} style={styles.interpretationText}>
              {isZh ? '分數越高表示吞嚥障礙對生活影響越大。' : 'Higher scores indicate greater swallowing handicap.'}
            </Text>
            <TouchableOpacity style={styles.doneButton} onPress={() => router.back()} activeOpacity={0.8} testID="dhi-done">
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
          <TouchableOpacity onPress={goBack} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID="dhi-back">
            <ArrowLeft size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text size={15} weight="600" color={Colors.textPrimary} numberOfLines={1} style={styles.topBarTitle}>
            DHI
          </Text>
          <Text size={14} weight="500" color={Colors.textSecondary}>
            {currentIndex + 1} / {TOTAL_Q}
          </Text>
        </View>

        <View style={styles.progressBarWrap}>
          <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
          </View>
        </View>

        <Animated.View style={[styles.questionArea, { transform: [{ translateX: slideAnim }] }]}>
          <View style={styles.subscaleBadge}>
            <Text size={11} weight="bold" color={THEME.red}>
              {getSubscaleLabel(currentQuestion?.subscale || 'P', isZh)}
            </Text>
          </View>
          <View style={styles.questionNumberBadge}>
            <Text size={13} weight="bold" color={Colors.white}>
              {currentQuestion?.id}
            </Text>
          </View>
          <Text size={20} weight="500" color={Colors.textPrimary} style={styles.questionText}>
            {isZh ? currentQuestion?.text_zh : currentQuestion?.text_en}
          </Text>
          <Text size={14} color={Colors.textSecondary} style={styles.questionSubtext}>
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
                    testID={`dhi-option-${option.value}`}
                  >
                    <View style={[styles.optionNumber, isSelected && styles.optionNumberSelected]}>
                      <Text size={18} weight="bold" color={isSelected ? Colors.white : THEME.red}>{option.value}</Text>
                    </View>
                    <View style={styles.optionLabelWrap}>
                      <Text size={16} weight={isSelected ? '600' : 'normal'} color={isSelected ? THEME.redDark : Colors.textPrimary}>
                        {isZh ? option.label_zh : option.label_en}
                      </Text>
                      <Text size={12} color={isSelected ? THEME.red : Colors.textSecondary}>
                        {isZh ? option.label_en : option.label_zh}
                      </Text>
                    </View>
                    {isSelected && <Check size={20} color={THEME.red} />}
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>

        <View style={styles.bottomBar}>
          <TouchableOpacity onPress={goBack} style={styles.navBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID="dhi-prev">
            <ChevronLeft size={20} color={currentIndex === 0 ? Colors.disabled : Colors.textSecondary} />
            <Text size={14} color={currentIndex === 0 ? Colors.disabled : Colors.textSecondary}>
              {isZh ? '上一題' : 'Back'}
            </Text>
          </TouchableOpacity>

          <Text size={13} weight="600" color={Colors.textSecondary}>
            {isZh ? `第${currentIndex + 1}題/共${TOTAL_Q}題` : `Question ${currentIndex + 1} of ${TOTAL_Q}`}
          </Text>

          {isLastQuestion && allAnswered ? (
            <TouchableOpacity onPress={() => submitMutation.mutate()} style={styles.submitBtn} disabled={submitMutation.isPending} activeOpacity={0.8} testID="dhi-submit">
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
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="dhi-next"
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
  progressBarFill: { height: '100%', backgroundColor: THEME.red, borderRadius: 2 },
  questionArea: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  subscaleBadge: { alignSelf: 'center', backgroundColor: THEME.redLight, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
  questionNumberBadge: { alignSelf: 'center', backgroundColor: THEME.red, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12, marginBottom: 16 },
  questionText: { textAlign: 'center', lineHeight: 30, paddingHorizontal: 4, marginBottom: 6 },
  questionSubtext: { textAlign: 'center', lineHeight: 20, paddingHorizontal: 8, marginBottom: 24 },
  optionsColumn: { gap: 10 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, backgroundColor: THEME.optionBg, borderWidth: 2, borderColor: 'transparent', gap: 12, minHeight: 56 },
  optionBtnSelected: { backgroundColor: THEME.optionSelectedBg, borderColor: THEME.selectedBorder },
  optionNumber: { width: 40, height: 40, borderRadius: 20, backgroundColor: THEME.redLight, justifyContent: 'center', alignItems: 'center' },
  optionNumberSelected: { backgroundColor: THEME.red },
  optionLabelWrap: { flex: 1, gap: 1 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 20 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 70, minHeight: 48, justifyContent: 'center' },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: THEME.red, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, minHeight: 48 },
  nextBtnDisabled: { opacity: 0.4 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: THEME.red, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, minHeight: 48 },
  resultContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  resultIconCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.successLight, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  resultTitle: { textAlign: 'center' },
  scoreCard: { alignItems: 'center', backgroundColor: Colors.card, paddingHorizontal: 32, paddingVertical: 20, borderRadius: 20, borderWidth: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, gap: 4 },
  subscaleRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  subscaleBox: { alignItems: 'center', backgroundColor: Colors.card, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, gap: 2 },
  interpretationText: { textAlign: 'center', lineHeight: 20, paddingHorizontal: 12 },
  doneButton: { backgroundColor: THEME.red, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40, marginTop: 8 },
});
