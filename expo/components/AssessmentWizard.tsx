import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { ScaledText as Text } from '@/components/ScaledText';
import Colors from '@/constants/colors';
import { ClipboardList, ChevronLeft, ChevronRight, Check, SkipForward } from 'lucide-react-native';
import { log } from '@/lib/logger';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.2;

const WIZARD_COLORS = {
  teal: '#1D9E75',
  tealLight: '#E1F5EE',
  tealDark: '#085041',
  amberLight: '#FAEEDA',
  amberDark: '#633806',
  redLight: '#FCEBEB',
  redDark: '#791F1F',
  iconBg: '#E1F5EE',
  progressBg: '#E8ECE9',
  dotFilled: '#1D9E75',
  dotEmpty: '#D1D5D3',
  dotCurrent: '#0D7A5A',
  summaryYes: '#D4F5E6',
  summarySometimes: '#FFF0D4',
  summaryNo: '#FFE0E0',
  summarySkipped: '#EAEAEA',
} as const;

export interface WizardQuestion {
  id: string;
  number: number;
  text: string;
  helperText?: string;
  category?: string;
}

export type WizardAnswerValue = 'yes' | 'sometimes' | 'no' | 'skipped';

interface AssessmentWizardProps {
  title: string;
  questions: WizardQuestion[];
  onSubmit: (answers: Record<string, number | string>) => void;
  onCancel: () => void;
  mapAnswer: (questionId: string, answer: WizardAnswerValue) => number | string;
  t: (key: string) => string;
  isSubmitting?: boolean;
}

export default function AssessmentWizard({
  title,
  questions,
  onSubmit,
  onCancel,
  mapAnswer,
  t,
  isSubmitting = false,
}: AssessmentWizardProps) {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, WizardAnswerValue>>({});
  const [showSummary, setShowSummary] = useState<boolean>(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const yesScale = useRef(new Animated.Value(1)).current;
  const sometimesScale = useRef(new Animated.Value(1)).current;
  const noScale = useRef(new Animated.Value(1)).current;

  const totalQuestions = questions.length;
  const currentQuestion = questions[currentIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] ?? null : null;
  const hasAnswer = currentAnswer !== null;

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const allAnswered = answeredCount === totalQuestions && totalQuestions > 0;
  const unansweredCount = totalQuestions - answeredCount;

  useEffect(() => {
    const target = totalQuestions > 0 ? answeredCount / totalQuestions : 0;
    Animated.timing(progressAnim, {
      toValue: target,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [answeredCount, totalQuestions, progressAnim]);

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

  const goNext = useCallback(() => {
    if (!hasAnswer) return;
    if (currentIndex < totalQuestions - 1) {
      animateSlide('forward', () => setCurrentIndex(prev => prev + 1));
    } else {
      setShowSummary(true);
    }
  }, [currentIndex, totalQuestions, hasAnswer, animateSlide]);

  const goBack = useCallback(() => {
    if (showSummary) {
      setShowSummary(false);
      return;
    }
    if (currentIndex > 0) {
      animateSlide('backward', () => setCurrentIndex(prev => prev - 1));
    } else {
      onCancel();
    }
  }, [currentIndex, showSummary, animateSlide, onCancel]);

  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  const hasAnswerRef = useRef(hasAnswer);
  hasAnswerRef.current = hasAnswer;
  const showSummaryRef = useRef(showSummary);
  showSummaryRef.current = showSummary;

  const panResponder = useMemo(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        !showSummaryRef.current && Math.abs(gs.dx) > 20 && Math.abs(gs.dy) < 40,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -SWIPE_THRESHOLD && hasAnswerRef.current) {
          goNextRef.current();
        } else if (gs.dx > SWIPE_THRESHOLD) {
          goBackRef.current();
        }
      },
    }),
  []);

  const animateButton = useCallback((anim: Animated.Value) => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 0.9, duration: 80, useNativeDriver: true }),
      Animated.spring(anim, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, []);

  const selectAnswer = useCallback((answer: WizardAnswerValue) => {
    if (!currentQuestion) return;
    if (answer === 'yes') animateButton(yesScale);
    else if (answer === 'sometimes') animateButton(sometimesScale);
    else if (answer === 'no') animateButton(noScale);
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: answer }));
    log('[AssessmentWizard] Answer:', currentQuestion.id, '=', answer);
  }, [currentQuestion, animateButton, yesScale, sometimesScale, noScale]);

  const skipQuestion = useCallback(() => {
    if (!currentQuestion) return;
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: 'skipped' }));
    log('[AssessmentWizard] Skipped:', currentQuestion.id);
    setTimeout(() => {
      if (currentIndex < totalQuestions - 1) {
        animateSlide('forward', () => setCurrentIndex(prev => prev + 1));
      } else {
        setShowSummary(true);
      }
    }, 150);
  }, [currentQuestion, currentIndex, totalQuestions, animateSlide]);

  const goToQuestion = useCallback((index: number) => {
    setShowSummary(false);
    setCurrentIndex(index);
    slideAnim.setValue(0);
  }, [slideAnim]);

  const handleSubmit = useCallback(() => {
    const mapped: Record<string, number | string> = {};
    for (const [qId, answer] of Object.entries(answers)) {
      mapped[qId] = mapAnswer(qId, answer);
    }
    log('[AssessmentWizard] Submitting mapped answers:', mapped);
    onSubmit(mapped);
  }, [answers, mapAnswer, onSubmit]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  if (showSummary) {
    return (
      <View style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={goBack}
            style={styles.topBarBackBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID="wizard-summary-back"
            accessibilityLabel={t('wizardBack')}
            accessibilityRole="button"
          >
            <ChevronLeft size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text size={17} weight="600" color={Colors.textPrimary} numberOfLines={1} style={styles.topBarTitle}>
            {t('wizardSummary')}
          </Text>
          <View style={styles.topBarRight} />
        </View>

        <View style={styles.progressBarWrap}>
          <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
          </View>
        </View>

        <ScrollView
          style={styles.summaryScroll}
          contentContainerStyle={styles.summaryScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {allAnswered ? (
            <View style={styles.summaryBanner}>
              <Check size={18} color={WIZARD_COLORS.teal} />
              <Text size={14} weight="600" color={WIZARD_COLORS.tealDark}>
                {t('wizardComplete')}
              </Text>
            </View>
          ) : (
            <View style={styles.summaryBannerIncomplete}>
              <Text size={14} weight="500" color={Colors.textSecondary}>
                {unansweredCount} {t('wizardIncomplete')}
              </Text>
            </View>
          )}

          {questions.map((q, idx) => {
            const ans = answers[q.id] ?? null;
            const ansLabel = ans === 'yes' ? t('wizardYes')
              : ans === 'sometimes' ? t('wizardSometimes')
              : ans === 'no' ? t('wizardNo')
              : ans === 'skipped' ? t('wizardSkipped')
              : t('wizardNotAnswered');
            const ansColor = ans === 'yes' ? WIZARD_COLORS.summaryYes
              : ans === 'sometimes' ? WIZARD_COLORS.summarySometimes
              : ans === 'no' ? WIZARD_COLORS.summaryNo
              : ans === 'skipped' ? WIZARD_COLORS.summarySkipped
              : '#F5F5F5';
            const ansTextColor = ans === 'yes' ? WIZARD_COLORS.tealDark
              : ans === 'sometimes' ? WIZARD_COLORS.amberDark
              : ans === 'no' ? WIZARD_COLORS.redDark
              : Colors.textSecondary;
            return (
              <TouchableOpacity
                key={q.id}
                style={styles.summaryCard}
                onPress={() => goToQuestion(idx)}
                activeOpacity={0.7}
                testID={`wizard-summary-q-${q.id}`}
                accessibilityLabel={`${t('wizardTapToEdit')}: ${q.text}`}
                accessibilityRole="button"
              >
                <View style={styles.summaryCardLeft}>
                  <View style={styles.summaryQNum}>
                    <Text size={12} weight="bold" color={Colors.white}>{q.number}</Text>
                  </View>
                  <Text size={14} color={Colors.textPrimary} numberOfLines={2} style={styles.summaryQText}>
                    {q.text}
                  </Text>
                </View>
                <View style={[styles.summaryAnswerBadge, { backgroundColor: ansColor }]}>
                  <Text size={12} weight="600" color={ansTextColor}>{ansLabel}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          <View style={styles.summarySubmitArea}>
            <TouchableOpacity
              style={[styles.submitBtn, !allAnswered && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!allAnswered || isSubmitting}
              activeOpacity={0.8}
              testID="wizard-submit"
              accessibilityLabel={t('wizardSubmitAssessment')}
              accessibilityRole="button"
            >
              {isSubmitting ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text size={16} weight="bold" color={Colors.white}>
                  {t('wizardSubmitAssessment')}
                </Text>
              )}
            </TouchableOpacity>
            {!allAnswered && (
              <Text size={12} color={Colors.textSecondary} style={styles.summaryHint}>
                {t('wizardAnswerAllHint')}
              </Text>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  const dotSize = totalQuestions > 20 ? 5 : 7;
  const dotGap = totalQuestions > 20 ? 3 : 4;

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      <View style={styles.topBar}>
        <Text size={15} weight="600" color={Colors.textPrimary} numberOfLines={1} style={styles.topBarTitle}>
          {title}
        </Text>
        <Text size={14} weight="500" color={Colors.textSecondary}>
          {currentIndex + 1} / {totalQuestions}
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
        <View style={styles.questionCenter}>
          <View style={styles.iconCircle}>
            <ClipboardList size={36} color={WIZARD_COLORS.teal} />
          </View>
          <Text
            size={20}
            weight="500"
            color={Colors.textPrimary}
            style={styles.questionText}
            accessibilityRole="text"
          >
            {currentQuestion?.text ?? ''}
          </Text>
          {currentQuestion?.helperText ? (
            <Text size={14} color={Colors.textSecondary} style={styles.helperText}>
              {currentQuestion.helperText}
            </Text>
          ) : null}
        </View>

        <View style={styles.responseRow}>
          <Animated.View style={[styles.responseBtnWrap, { transform: [{ scale: yesScale }] }]}>
            <TouchableOpacity
              style={[
                styles.responseBtn,
                styles.responseBtnYes,
                currentAnswer === 'yes' && styles.responseBtnYesSelected,
              ]}
              onPress={() => selectAnswer('yes')}
              activeOpacity={0.7}
              testID="wizard-yes"
              accessibilityLabel={t('wizardYes')}
              accessibilityRole="button"
            >
              <Text
                size={15}
                weight="600"
                color={WIZARD_COLORS.tealDark}
              >
                {t('wizardYes')}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={[styles.responseBtnWrap, { transform: [{ scale: sometimesScale }] }]}>
            <TouchableOpacity
              style={[
                styles.responseBtn,
                styles.responseBtnSometimes,
                currentAnswer === 'sometimes' && styles.responseBtnSometimesSelected,
              ]}
              onPress={() => selectAnswer('sometimes')}
              activeOpacity={0.7}
              testID="wizard-sometimes"
              accessibilityLabel={t('wizardSometimes')}
              accessibilityRole="button"
            >
              <Text
                size={15}
                weight="600"
                color={WIZARD_COLORS.amberDark}
              >
                {t('wizardSometimes')}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={[styles.responseBtnWrap, { transform: [{ scale: noScale }] }]}>
            <TouchableOpacity
              style={[
                styles.responseBtn,
                styles.responseBtnNo,
                currentAnswer === 'no' && styles.responseBtnNoSelected,
              ]}
              onPress={() => selectAnswer('no')}
              activeOpacity={0.7}
              testID="wizard-no"
              accessibilityLabel={t('wizardNo')}
              accessibilityRole="button"
            >
              <Text
                size={15}
                weight="600"
                color={WIZARD_COLORS.redDark}
              >
                {t('wizardNo')}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <TouchableOpacity
          onPress={skipQuestion}
          style={styles.skipBtn}
          hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
          testID="wizard-skip"
          accessibilityLabel={t('wizardSkip')}
          accessibilityRole="button"
        >
          <SkipForward size={14} color={Colors.textSecondary} />
          <Text size={13} color={Colors.textSecondary}>{t('wizardSkip')}</Text>
        </TouchableOpacity>
      </Animated.View>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={goBack}
          style={[styles.navBtn, currentIndex === 0 && styles.navBtnHidden]}
          disabled={currentIndex === 0}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          testID="wizard-back"
          accessibilityLabel={t('wizardBack')}
          accessibilityRole="button"
        >
          <ChevronLeft size={20} color={currentIndex === 0 ? 'transparent' : Colors.textSecondary} />
          <Text size={14} color={currentIndex === 0 ? 'transparent' : Colors.textSecondary}>
            {t('wizardBack')}
          </Text>
        </TouchableOpacity>

        <View style={styles.dotsRow}>
          {questions.map((q, idx) => {
            const isAnswered = answers[q.id] !== undefined;
            const isCurrent = idx === currentIndex;
            const size = isCurrent ? dotSize + 3 : dotSize;
            return (
              <TouchableOpacity
                key={q.id}
                onPress={() => {
                  if (idx < currentIndex || isAnswered) {
                    setCurrentIndex(idx);
                    slideAnim.setValue(0);
                  }
                }}
                hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                accessibilityLabel={`Question ${idx + 1}`}
              >
                <View
                  style={{
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: isCurrent
                      ? WIZARD_COLORS.dotCurrent
                      : isAnswered
                      ? WIZARD_COLORS.dotFilled
                      : WIZARD_COLORS.dotEmpty,
                    marginHorizontal: dotGap / 2,
                  }}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={goNext}
          style={[styles.nextBtn, !hasAnswer && styles.nextBtnDisabled]}
          disabled={!hasAnswer}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          testID="wizard-next"
          accessibilityLabel={currentIndex === totalQuestions - 1 ? t('wizardSummary') : t('wizardNext')}
          accessibilityRole="button"
        >
          <Text size={14} weight="600" color={Colors.white}>
            {currentIndex === totalQuestions - 1 ? t('wizardSummary') : t('wizardNext')}
          </Text>
          <ChevronRight size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
  },
  topBarBackBtn: {
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
    marginHorizontal: 8,
  },
  topBarRight: {
    width: 36,
  },
  progressBarWrap: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: WIZARD_COLORS.progressBg,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: WIZARD_COLORS.teal,
    borderRadius: 2,
  },
  questionArea: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  questionCenter: {
    alignItems: 'center',
    marginBottom: 36,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: WIZARD_COLORS.iconBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  questionText: {
    textAlign: 'center',
    lineHeight: 28,
    paddingHorizontal: 4,
  },
  helperText: {
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  responseRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  responseBtnWrap: {
    flex: 1,
  },
  responseBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  responseBtnYes: {
    backgroundColor: WIZARD_COLORS.tealLight,
  },
  responseBtnYesSelected: {
    borderColor: WIZARD_COLORS.tealDark,
  },
  responseBtnSometimes: {
    backgroundColor: WIZARD_COLORS.amberLight,
  },
  responseBtnSometimesSelected: {
    borderColor: WIZARD_COLORS.amberDark,
  },
  responseBtnNo: {
    backgroundColor: WIZARD_COLORS.redLight,
  },
  responseBtnNoSelected: {
    borderColor: WIZARD_COLORS.redDark,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
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
  navBtnHidden: {
    opacity: 0,
  },
  dotsRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    maxHeight: 24,
    overflow: 'hidden',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: WIZARD_COLORS.teal,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    minHeight: 48,
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  summaryScroll: {
    flex: 1,
  },
  summaryScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
  },
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: WIZARD_COLORS.tealLight,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  summaryBannerIncomplete: {
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  summaryCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryQNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: WIZARD_COLORS.teal,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryQText: {
    flex: 1,
  },
  summaryAnswerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  summarySubmitArea: {
    marginTop: 16,
    alignItems: 'center',
    gap: 10,
  },
  submitBtn: {
    backgroundColor: WIZARD_COLORS.teal,
    borderRadius: 14,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  summaryHint: {
    textAlign: 'center',
  },
});
