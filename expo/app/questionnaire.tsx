import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { Language } from '@/types';
import { ArrowLeft, CheckCircle2 } from 'lucide-react-native';
import { log } from '@/lib/logger';
import AssessmentWizard, { WizardQuestion, WizardAnswerValue } from '@/components/AssessmentWizard';

interface QuestionChoice {
  value: number;
  en: string;
  zh_hant?: string;
  zh_hans?: string;
}

interface QuestionItem {
  id: string;
  type: 'numeric_scale' | 'single_choice';
  en: string;
  zh_hant?: string;
  zh_hans?: string;
  min?: number;
  max?: number;
  min_label_en?: string;
  min_label_zh_hant?: string;
  min_label_zh_hans?: string;
  max_label_en?: string;
  max_label_zh_hant?: string;
  max_label_zh_hans?: string;
  step?: number;
  choices?: QuestionChoice[];
  positive?: boolean;
}

interface QuestionnaireTemplate {
  id: string;
  name: string;
  questions: QuestionItem[];
  scoring_method?: string;
}

function getTranslatedText(
  item: { en: string; zh_hant?: string; zh_hans?: string },
  language: Language | null
): string {
  const lang = language || 'en';
  if (lang === 'zh_hant') return item.zh_hant || item.en;
  if (lang === 'zh_hans') return item.zh_hans || item.en;
  return item.en;
}

function getLabel(
  prefix: string,
  item: Record<string, unknown>,
  language: Language | null
): string {
  const lang = language || 'en';
  const key = prefix + (lang === 'en' ? '_en' : lang === 'zh_hant' ? '_zh_hant' : '_zh_hans');
  const fallback = prefix + '_en';
  return (item[key] as string) || (item[fallback] as string) || '';
}

function calculateScore(questions: QuestionItem[], answers: Record<string, number>, scoringMethod?: string): number {
  if (scoringMethod === 'custom') {
    let adjustedSum = 0;
    for (const q of questions) {
      const val = answers[q.id] ?? 0;
      if (q.positive === true) {
        adjustedSum += val - 1;
      } else {
        adjustedSum += 5 - val;
      }
    }
    return Math.round(adjustedSum * 2.5 * 10) / 10;
  }
  let total = 0;
  for (const q of questions) {
    total += answers[q.id] ?? 0;
  }
  return total;
}

export default function QuestionnaireScreen() {
  const params = useLocalSearchParams<{ assignmentId: string; templateId: string; mode?: string }>();
  const assignmentId = Array.isArray(params.assignmentId) ? params.assignmentId[0] : params.assignmentId;
  const templateId = Array.isArray(params.templateId) ? params.templateId[0] : params.templateId;
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  log('[Questionnaire] Params received - mode:', mode, 'assignmentId:', assignmentId, 'templateId:', templateId);
  const { t, language, patientId } = useApp();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showCompletion, setShowCompletion] = useState<boolean>(false);
  const [finalScore, setFinalScore] = useState<number>(0);
  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  const templateQuery = useQuery({
    queryKey: ['questionnaire_template', templateId],
    queryFn: async () => {
      log('[Questionnaire] Fetching template:', templateId);
      const { data, error } = await supabase
        .from('questionnaire_templates')
        .select('id, name, questions, scoring_method')
        .eq('id', templateId!)
        .single();
      if (error) {
        log('[Questionnaire] Template fetch error:', error);
        throw error;
      }
      log('[Questionnaire] Template loaded:', data?.name, 'questions:', data?.questions?.length);
      return data as QuestionnaireTemplate;
    },
    enabled: !!templateId,
  });

  const template = templateQuery.data;
  const questions: QuestionItem[] = useMemo(() => template?.questions || [], [template]);
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const allAnswered = answeredCount === questions.length && questions.length > 0;
  const progressPercent = questions.length > 0 ? answeredCount / questions.length : 0;

  const submitMutation = useMutation({
    mutationFn: async () => {
      const score = calculateScore(questions, answers, template?.scoring_method);
      log('[Questionnaire] Submitting. Score:', score, 'Answers:', answers);

      const { error: responseError } = await supabase
        .from('questionnaire_responses')
        .insert({
          assignment_id: assignmentId,
          patient_id: patientId,
          questionnaire_template_id: templateId,
          answers,
          total_score: score,
          completed_at: new Date().toISOString(),
        });

      if (responseError) {
        log('[Questionnaire] Response insert error:', responseError);
        throw responseError;
      }

      const { error: updateError } = await supabase
        .from('questionnaire_assignments')
        .update({
          status: 'completed',
          completed_date: new Date().toISOString(),
          score,
        })
        .eq('id', assignmentId!);

      if (updateError) {
        log('[Questionnaire] Assignment update error:', updateError);
        throw updateError;
      }

      return score;
    },
    onSuccess: (score) => {
      log('[Questionnaire] Submission success. Score:', score);
      setFinalScore(score);
      setShowCompletion(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
      void queryClient.invalidateQueries({ queryKey: ['assessments'] });
    },
    onError: (error) => {
      log('[Questionnaire] Submit error:', error);
      Alert.alert('Error', 'Failed to submit assessment. Please try again.');
    },
  });

  const handleAnswer = useCallback((questionId: string, value: number) => {
    log('[Questionnaire] Answer:', questionId, '=', value);
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const { mutate: submitMutate, isPending: isSubmitting } = submitMutation;

  const handleSubmit = useCallback(() => {
    if (!allAnswered) {
      Alert.alert('', t('pleaseAnswerAll'));
      return;
    }
    submitMutate();
  }, [allAnswered, submitMutate, t]);

  const handleDone = useCallback(() => {
    router.back();
  }, []);

  const wizardQuestions = useMemo<WizardQuestion[]>(() => {
    if (mode !== 'guided' || questions.length === 0) return [];
    return questions.map((q, i) => ({
      id: q.id,
      number: i + 1,
      text: getTranslatedText(q, language),
      helperText: q.type === 'single_choice' && q.choices
        ? q.choices.map(c => getTranslatedText(c, language)).join(' / ')
        : undefined,
    }));
  }, [mode, questions, language]);

  const mapWizardAnswer = useCallback((_questionId: string, answer: WizardAnswerValue): number => {
    const q = questions.find(item => item.id === _questionId);
    const min = q?.min ?? 0;
    const max = q?.max ?? 10;
    const mid = Math.round((min + max) / 2);
    switch (answer) {
      case 'yes': return max;
      case 'sometimes': return mid;
      case 'no': return min;
      case 'skipped': return min;
      default: return min;
    }
  }, [questions]);

  const wizardSubmitMutation = useMutation({
    mutationFn: async (wizardAnswers: Record<string, number>) => {
      const score = calculateScore(questions, wizardAnswers, template?.scoring_method);
      log('[Questionnaire] Wizard submitting. Score:', score);

      const { error: responseError } = await supabase
        .from('questionnaire_responses')
        .insert({
          assignment_id: assignmentId,
          patient_id: patientId,
          questionnaire_template_id: templateId,
          answers: wizardAnswers,
          total_score: score,
          completed_at: new Date().toISOString(),
        });

      if (responseError) {
        log('[Questionnaire] Wizard response insert error:', responseError);
        throw responseError;
      }

      const { error: updateError } = await supabase
        .from('questionnaire_assignments')
        .update({
          status: 'completed',
          completed_date: new Date().toISOString(),
          score,
        })
        .eq('id', assignmentId!);

      if (updateError) {
        log('[Questionnaire] Wizard assignment update error:', updateError);
        throw updateError;
      }

      return score;
    },
    onSuccess: (score) => {
      log('[Questionnaire] Wizard submission success. Score:', score);
      setFinalScore(score);
      setShowCompletion(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
      void queryClient.invalidateQueries({ queryKey: ['assessments'] });
    },
    onError: (error) => {
      log('[Questionnaire] Wizard submit error:', error);
      Alert.alert('Error', 'Failed to submit assessment. Please try again.');
    },
  });

  const handleWizardSubmit = useCallback((mapped: Record<string, number | string>) => {
    const numericAnswers: Record<string, number> = {};
    for (const [k, v] of Object.entries(mapped)) {
      numericAnswers[k] = typeof v === 'number' ? v : Number(v) || 0;
    }
    log('[Questionnaire] Wizard final submit:', numericAnswers);
    wizardSubmitMutation.mutate(numericAnswers);
  }, [wizardSubmitMutation]);

  if (showCompletion) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.completionContainer}>
          <Animated.View style={[styles.completionContent, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.completionIconCircle}>
              <CheckCircle2 size={64} color={Colors.success} />
            </View>
            <ScaledText size={24} weight="bold" color={Colors.textPrimary} style={styles.completionTitle}>
              {t('assessmentComplete')}
            </ScaledText>
            <View style={styles.scoreCard}>
              <ScaledText size={14} color={Colors.textSecondary}>
                {t('yourScore')}
              </ScaledText>
              <ScaledText size={42} weight="bold" color={Colors.primary}>
                {finalScore}
              </ScaledText>
            </View>
            <TouchableOpacity style={styles.doneButton} onPress={handleDone} activeOpacity={0.8} testID="done-button">
              <ScaledText size={17} weight="bold" color={Colors.white}>
                {t('continue')}
              </ScaledText>
            </TouchableOpacity>
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  if (templateQuery.isLoading) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (mode === 'guided') {
    log('[Questionnaire] Guided mode active. wizardQuestions.length:', wizardQuestions.length, 'questions.length:', questions.length);
    if (wizardQuestions.length > 0) {
      return (
        <View style={styles.root}>
          <SafeAreaView style={styles.container}>
            <AssessmentWizard
              title={template?.name || ''}
              questions={wizardQuestions}
              onSubmit={handleWizardSubmit}
              onCancel={() => router.back()}
              mapAnswer={mapWizardAnswer}
              t={t}
              isSubmitting={wizardSubmitMutation.isPending}
            />
          </SafeAreaView>
        </View>
      );
    }
    log('[Questionnaire] Guided mode: no wizard questions generated, falling back to checklist');
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="back-button">
            <ArrowLeft size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleArea}>
            <ScaledText size={17} weight="bold" color={Colors.textPrimary} numberOfLines={1}>
              {template?.name || ''}
            </ScaledText>
            <ScaledText size={13} color={Colors.textSecondary}>
              {answeredCount} {t('questionOf')} {questions.length}
            </ScaledText>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, { width: `${Math.round(progressPercent * 100)}%` }]} />
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              question={question}
              index={index}
              total={questions.length}
              language={language}
              selectedValue={answers[question.id]}
              onSelect={handleAnswer}
              t={t}
            />
          ))}

          <View style={styles.submitArea}>
            <TouchableOpacity
              style={[styles.submitButton, !allAnswered && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!allAnswered || isSubmitting}
              activeOpacity={0.8}
              testID="submit-button"
            >
              {isSubmitting ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <ScaledText size={17} weight="bold" color={Colors.white}>
                  {t('submitAssessment')}
                </ScaledText>
              )}
            </TouchableOpacity>
            {!allAnswered && (
              <ScaledText size={12} color={Colors.textSecondary} style={styles.hintText}>
                {t('pleaseAnswerAll')}
              </ScaledText>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

interface QuestionCardProps {
  question: QuestionItem;
  index: number;
  total: number;
  language: Language | null;
  selectedValue: number | undefined;
  onSelect: (questionId: string, value: number) => void;
  t: (key: string) => string;
}

const QuestionCard = React.memo(function QuestionCard({
  question,
  index,
  total: _total,
  language,
  selectedValue,
  onSelect,
  t,
}: QuestionCardProps) {
  const questionText = getTranslatedText(question, language);
  const isAnswered = selectedValue !== undefined;

  const min = question.min ?? 0;
  const max = question.max ?? 10;
  const step = question.step ?? 1;
  const isDHI = step === 2;

  const values: number[] = useMemo(() => {
    const vals: number[] = [];
    for (let i = min; i <= max; i += step) {
      vals.push(i);
    }
    return vals;
  }, [min, max, step]);

  const minLabel = getLabel('min_label', question as unknown as Record<string, unknown>, language);
  const maxLabel = getLabel('max_label', question as unknown as Record<string, unknown>, language);

  const getDHILabel = useCallback((val: number): string => {
    if (val === 0) return t('never');
    if (val === 2) return t('sometimes');
    if (val === 4) return t('always');
    return String(val);
  }, [t]);

  if (question.type === 'single_choice' && question.choices) {
    return (
      <View style={[styles.questionCard, isAnswered && styles.questionCardAnswered]}>
        <View style={styles.questionHeader}>
          <View style={styles.questionNumberBadge}>
            <ScaledText size={12} weight="bold" color={Colors.white}>
              {index + 1}
            </ScaledText>
          </View>
          <ScaledText size={15} weight="600" color={Colors.textPrimary} style={styles.questionText}>
            {questionText}
          </ScaledText>
        </View>
        <View style={styles.choicesContainer}>
          {question.choices.map((choice) => {
            const isSelected = selectedValue === choice.value;
            const choiceLabel = getTranslatedText(choice, language);
            return (
              <TouchableOpacity
                key={choice.value}
                style={[styles.choiceRow, isSelected && styles.choiceRowSelected]}
                onPress={() => onSelect(question.id, choice.value)}
                activeOpacity={0.7}
                testID={`choice-${question.id}-${choice.value}`}
              >
                <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
                <ScaledText
                  size={14}
                  color={isSelected ? Colors.primary : Colors.textPrimary}
                  weight={isSelected ? '600' : 'normal'}
                  style={styles.choiceText}
                >
                  {choiceLabel}
                </ScaledText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.questionCard, isAnswered && styles.questionCardAnswered]}>
      <View style={styles.questionHeader}>
        <View style={styles.questionNumberBadge}>
          <ScaledText size={12} weight="bold" color={Colors.white}>
            {index + 1}
          </ScaledText>
        </View>
        <ScaledText size={15} weight="600" color={Colors.textPrimary} style={styles.questionText}>
          {questionText}
        </ScaledText>
      </View>

      {isDHI ? (
        <View style={styles.dhiContainer}>
          {values.map((val) => {
            const isSelected = selectedValue === val;
            return (
              <TouchableOpacity
                key={val}
                style={[styles.dhiOption, isSelected && styles.dhiOptionSelected]}
                onPress={() => onSelect(question.id, val)}
                activeOpacity={0.7}
                testID={`dhi-${question.id}-${val}`}
              >
                <View style={[styles.dhiCircle, isSelected && styles.dhiCircleSelected]}>
                  <ScaledText size={16} weight="bold" color={isSelected ? Colors.white : Colors.textSecondary}>
                    {val}
                  </ScaledText>
                </View>
                <ScaledText
                  size={11}
                  color={isSelected ? Colors.primary : Colors.textSecondary}
                  weight={isSelected ? '600' : 'normal'}
                  style={styles.dhiLabel}
                >
                  {getDHILabel(val)}
                </ScaledText>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.scaleContainer}>
          {(minLabel || maxLabel) && (
            <View style={styles.scaleLabels}>
              <ScaledText size={11} color={Colors.textSecondary} style={styles.scaleLabelLeft}>
                {minLabel}
              </ScaledText>
              <ScaledText size={11} color={Colors.textSecondary} style={styles.scaleLabelRight}>
                {maxLabel}
              </ScaledText>
            </View>
          )}
          <View style={styles.scaleCircles}>
            {values.map((val) => {
              const isSelected = selectedValue === val;
              return (
                <TouchableOpacity
                  key={val}
                  style={[styles.scaleCircle, isSelected && styles.scaleCircleSelected]}
                  onPress={() => onSelect(question.id, val)}
                  activeOpacity={0.7}
                  testID={`scale-${question.id}-${val}`}
                >
                  <ScaledText
                    size={13}
                    weight={isSelected ? 'bold' : 'normal'}
                    color={isSelected ? Colors.white : Colors.textSecondary}
                  >
                    {val}
                  </ScaledText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitleArea: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  progressBarContainer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
  },
  questionCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  questionCardAnswered: {
    borderColor: Colors.primaryLight,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
  },
  questionNumberBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  questionText: {
    flex: 1,
    lineHeight: 22,
  },
  scaleContainer: {
    gap: 8,
  },
  scaleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  scaleLabelLeft: {
    textAlign: 'left',
    maxWidth: '45%',
  },
  scaleLabelRight: {
    textAlign: 'right',
    maxWidth: '45%',
  },
  scaleCircles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  scaleCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.card,
  },
  scaleCircleSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dhiContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  dhiOption: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  dhiOptionSelected: {},
  dhiCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.card,
  },
  dhiCircleSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dhiLabel: {
    textAlign: 'center',
  },
  choicesContainer: {
    gap: 8,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    gap: 12,
  },
  choiceRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.disabled,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  choiceText: {
    flex: 1,
  },
  submitArea: {
    marginTop: 10,
    alignItems: 'center',
    gap: 10,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.disabled,
  },
  hintText: {
    textAlign: 'center',
  },
  completionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completionContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 24,
  },
  completionIconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.successLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completionTitle: {
    textAlign: 'center',
  },
  scoreCard: {
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 40,
    paddingVertical: 24,
    borderRadius: 20,
    minWidth: 160,
    gap: 4,
  },
  doneButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 60,
    marginTop: 8,
  },
});
