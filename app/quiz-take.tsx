import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight, Check, X, Clock, Trophy, Award } from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

const ACCENT = '#10B981';
const ACCENT_DARK = '#059669';
const ERROR = '#EF4444';
const WARN = '#F59E0B';

type QuestionType = 'mcq_single' | 'mcq_multi' | 'true_false' | 'fill_blank';

type RawOption = {
  id?: string;
  key?: string;
  value?: string;
  label?: string;
  label_en?: string;
  label_zh?: string;
  text?: string;
  is_correct?: boolean;
  correct?: boolean;
};

type RawQuestion = {
  id: string;
  quiz_id: string;
  question_type: QuestionType | string;
  question_text?: string;
  question_text_en?: string;
  question_text_zh?: string;
  text_en?: string;
  text_zh?: string;
  prompt?: string;
  image_url?: string | null;
  options?: RawOption[] | string[] | null;
  options_en?: RawOption[] | string[] | null;
  options_zh?: RawOption[] | string[] | null;
  correct_answer?: string | string[] | boolean | null;
  correct_answers?: string[] | null;
  explanation?: string | null;
  explanation_en?: string | null;
  explanation_zh?: string | null;
  points?: number | null;
  order?: number | null;
  question_order?: number | null;
};

type NormalizedOption = {
  id: string;
  label: string;
  isCorrect: boolean;
};

type NormalizedQuestion = {
  id: string;
  type: QuestionType;
  text: string;
  imageUrl?: string;
  options: NormalizedOption[];
  correctAnswers: string[];
  explanation?: string;
  points: number;
  order: number;
};

type Quiz = {
  id: string;
  title?: string | null;
  title_en?: string | null;
  title_zh?: string | null;
  randomize_questions?: boolean | null;
  randomize_options?: boolean | null;
  show_correct_after?: boolean | null;
  allow_previous?: boolean | null;
  time_limit_minutes?: number | null;
  pass_score_percent?: number | null;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickLang<T extends string | undefined | null>(zh: T, en: T, isZh: boolean): string {
  if (isZh) return (zh || en || '') as string;
  return (en || zh || '') as string;
}

function normalizeQuestion(q: RawQuestion, isZh: boolean): NormalizedQuestion {
  const text =
    pickLang(q.question_text_zh ?? q.text_zh, q.question_text_en ?? q.text_en, isZh) ||
    q.question_text ||
    q.prompt ||
    '';

  const rawOptionsAny =
    (isZh ? q.options_zh : q.options_en) ?? q.options ?? [];
  const rawOptions: RawOption[] = Array.isArray(rawOptionsAny)
    ? rawOptionsAny.map((o, idx) => {
        if (typeof o === 'string') {
          return { id: String(idx), label: o };
        }
        return o;
      })
    : [];

  const correctAnswers: string[] = (() => {
    if (Array.isArray(q.correct_answers)) return q.correct_answers.map(String);
    if (Array.isArray(q.correct_answer)) return q.correct_answer.map(String);
    if (typeof q.correct_answer === 'string') return [q.correct_answer];
    if (typeof q.correct_answer === 'boolean') return [q.correct_answer ? 'true' : 'false'];
    // derive from options is_correct flags
    const fromFlags = rawOptions
      .map((o, idx) => ({ id: o.id ?? o.key ?? o.value ?? String(idx), is: !!(o.is_correct || o.correct) }))
      .filter(o => o.is)
      .map(o => o.id);
    return fromFlags;
  })();

  const options: NormalizedOption[] = rawOptions.map((o, idx) => {
    const id = String(o.id ?? o.key ?? o.value ?? idx);
    const label =
      pickLang(o.label_zh, o.label_en, isZh) ||
      o.label ||
      o.text ||
      o.value ||
      id;
    return {
      id,
      label,
      isCorrect: correctAnswers.includes(id) || !!(o.is_correct || o.correct),
    };
  });

  const type = (q.question_type as QuestionType) || 'mcq_single';

  // For true/false: ensure default options exist
  let finalOptions = options;
  if (type === 'true_false' && finalOptions.length === 0) {
    finalOptions = [
      { id: 'true', label: isZh ? '正確' : 'True', isCorrect: correctAnswers.includes('true') },
      { id: 'false', label: isZh ? '錯誤' : 'False', isCorrect: correctAnswers.includes('false') },
    ];
  }

  return {
    id: q.id,
    type,
    text,
    imageUrl: q.image_url || undefined,
    options: finalOptions,
    correctAnswers: finalOptions.length > 0 ? finalOptions.filter(o => o.isCorrect).map(o => o.id) : correctAnswers,
    explanation: pickLang(q.explanation_zh, q.explanation_en, isZh) || q.explanation || undefined,
    points: typeof q.points === 'number' && q.points > 0 ? q.points : 1,
    order: q.question_order ?? q.order ?? 0,
  };
}

function isCorrect(q: NormalizedQuestion, answer: string[] | string | undefined): boolean {
  if (!answer) return false;
  if (q.type === 'fill_blank') {
    const a = (typeof answer === 'string' ? answer : answer[0] || '').trim().toLowerCase();
    if (!a) return false;
    return q.correctAnswers.some(c => c.trim().toLowerCase() === a);
  }
  const arr = Array.isArray(answer) ? answer : [answer];
  if (arr.length !== q.correctAnswers.length) return false;
  const sortedA = [...arr].sort();
  const sortedB = [...q.correctAnswers].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

export default function QuizTakeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string; quizId?: string; sessionName?: string }>();
  const { language, patientId } = useApp();
  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<NormalizedQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [completed, setCompleted] = useState<boolean>(false);
  const [timeLeftSec, setTimeLeftSec] = useState<number | null>(null);

  const startedAtRef = useRef<number>(Date.now());
  const submittedRef = useRef<boolean>(false);

  // Load quiz + questions
  useEffect(() => {
    const quizId = params.quizId;
    if (!quizId) {
      setError(isZh ? '找不到測驗' : 'Quiz not found');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: quizData, error: quizErr } = await supabase
          .from('quizzes')
          .select('*')
          .eq('id', quizId)
          .maybeSingle();
        if (quizErr || !quizData) {
          log('[QuizTake] quiz load error:', quizErr?.message);
          if (!cancelled) {
            setError(isZh ? '載入測驗失敗' : 'Failed to load quiz');
            setLoading(false);
          }
          return;
        }

        const { data: qData, error: qErr } = await supabase
          .from('quiz_questions')
          .select('*')
          .eq('quiz_id', quizId);
        if (qErr || !qData) {
          log('[QuizTake] questions load error:', qErr?.message);
          if (!cancelled) {
            setError(isZh ? '載入題目失敗' : 'Failed to load questions');
            setLoading(false);
          }
          return;
        }

        let normalized = (qData as RawQuestion[]).map(q => normalizeQuestion(q, isZh));
        normalized.sort((a, b) => a.order - b.order);

        if (quizData.randomize_questions) {
          normalized = shuffle(normalized);
        }
        if (quizData.randomize_options) {
          normalized = normalized.map(q => ({ ...q, options: shuffle(q.options) }));
        }

        if (cancelled) return;
        setQuiz(quizData as Quiz);
        setQuestions(normalized);
        startedAtRef.current = Date.now();
        if (typeof quizData.time_limit_minutes === 'number' && quizData.time_limit_minutes > 0) {
          setTimeLeftSec(quizData.time_limit_minutes * 60);
        }
        setLoading(false);
      } catch (e) {
        log('[QuizTake] load error:', e);
        if (!cancelled) {
          setError(isZh ? '網絡錯誤' : 'Network error');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.quizId, isZh]);

  const finalizeQuiz = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const sessionId = params.sessionId;
      const responses = questions.map(q => {
        const ans = answers[q.id] || [];
        const correct = isCorrect(q, ans);
        return {
          session_id: sessionId,
          quiz_id: quiz?.id,
          question_id: q.id,
          patient_id: patientId,
          answer: ans,
          is_correct: correct,
          points_earned: correct ? q.points : 0,
          answered_at: new Date().toISOString(),
        };
      });
      if (responses.length > 0) {
        const { error: insertErr } = await supabase.from('quiz_responses').insert(responses);
        if (insertErr) log('[QuizTake] insert responses error:', insertErr.message);
      }
    } catch (e) {
      log('[QuizTake] submit error:', e);
    } finally {
      setSubmitting(false);
      setCompleted(true);
    }
  }, [answers, questions, quiz, params.sessionId, patientId]);

  // Timer
  useEffect(() => {
    if (timeLeftSec === null || completed) return;
    if (timeLeftSec <= 0) {
      void finalizeQuiz();
      return;
    }
    const t = setTimeout(() => setTimeLeftSec(s => (s !== null ? s - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [timeLeftSec, completed, finalizeQuiz]);

  const current = questions[currentIdx];
  const currentAnswer = current ? answers[current.id] || [] : [];
  const currentRevealed = current ? !!revealed[current.id] : false;
  const showCorrectAfter = !!quiz?.show_correct_after;
  const allowPrevious = !!quiz?.allow_previous;

  const isAnswered = useMemo(() => {
    if (!current) return false;
    if (current.type === 'fill_blank') {
      return (currentAnswer[0] || '').trim().length > 0;
    }
    return currentAnswer.length > 0;
  }, [current, currentAnswer]);

  const setAnswer = useCallback((qid: string, value: string[]) => {
    setAnswers(prev => ({ ...prev, [qid]: value }));
  }, []);

  const onSelectOption = useCallback((opt: NormalizedOption) => {
    if (!current) return;
    if (currentRevealed) return;
    if (current.type === 'mcq_multi') {
      const exists = currentAnswer.includes(opt.id);
      const next = exists ? currentAnswer.filter(v => v !== opt.id) : [...currentAnswer, opt.id];
      setAnswer(current.id, next);
    } else {
      setAnswer(current.id, [opt.id]);
    }
  }, [current, currentAnswer, currentRevealed, setAnswer]);

  const onNext = useCallback(() => {
    if (!current) return;
    if (showCorrectAfter && !currentRevealed) {
      setRevealed(prev => ({ ...prev, [current.id]: true }));
      return;
    }
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      void finalizeQuiz();
    }
  }, [current, currentIdx, questions.length, showCorrectAfter, currentRevealed, finalizeQuiz]);

  const onPrevious = useCallback(() => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  }, [currentIdx]);

  const handleExit = useCallback(() => {
    if (completed) {
      router.replace('/(tabs)/home' as never);
      return;
    }
    const doExit = () => router.replace('/(tabs)/home' as never);
    if (Platform.OS === 'web') {
      if (window.confirm(isZh ? '退出測驗？您的作答不會儲存。' : 'Exit quiz? Your answers will not be saved.')) {
        doExit();
      }
    } else {
      Alert.alert(
        isZh ? '退出測驗' : 'Exit Quiz',
        isZh ? '您的作答不會儲存。' : 'Your answers will not be saved.',
        [
          { text: isZh ? '取消' : 'Cancel', style: 'cancel' },
          { text: isZh ? '退出' : 'Exit', style: 'destructive', onPress: doExit },
        ]
      );
    }
  }, [completed, router, isZh]);

  // Results stats
  const stats = useMemo(() => {
    let earned = 0;
    let total = 0;
    let correctCount = 0;
    questions.forEach(q => {
      total += q.points;
      const ans = answers[q.id];
      if (isCorrect(q, ans)) {
        earned += q.points;
        correctCount += 1;
      }
    });
    const pct = total > 0 ? Math.round((earned / total) * 100) : 0;
    const passPct = quiz?.pass_score_percent ?? 0;
    const passed = pct >= passPct;
    const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000);
    return { earned, total, correctCount, pct, passed, elapsedSec: elapsed };
  }, [answers, questions, quiz]);

  if (loading) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator color={ACCENT} size="large" />
          <Text style={styles.loadingText}>{isZh ? '載入測驗中...' : 'Loading quiz...'}</Text>
        </SafeAreaView>
      </View>
    );
  }

  if (error || !quiz) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.center}>
          <Text style={styles.errorText}>{error || (isZh ? '無法載入測驗' : 'Unable to load quiz')}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/home' as never)}>
            <Text style={styles.primaryBtnText}>{isZh ? '返回主頁' : 'Back to Home'}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  if (completed) {
    const mins = Math.floor(stats.elapsedSec / 60);
    const secs = stats.elapsedSec % 60;
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.container}>
          <ScrollView contentContainerStyle={styles.resultsScroll} showsVerticalScrollIndicator={false}>
            <View style={[styles.resultBadge, { backgroundColor: stats.passed ? ACCENT : ERROR }]}>
              {stats.passed ? <Trophy size={36} color="#fff" /> : <Award size={36} color="#fff" />}
            </View>
            <Text style={styles.resultTitle}>
              {stats.passed
                ? (isZh ? '恭喜通過！' : 'Passed!')
                : (isZh ? '未達標' : 'Not passed')}
            </Text>
            <Text style={styles.resultScore}>
              {stats.earned} / {stats.total} {isZh ? '分' : 'pts'} ({stats.pct}%)
            </Text>
            <Text style={styles.resultSub}>
              {isZh
                ? `答對 ${stats.correctCount} / ${questions.length} 題 • 用時 ${mins}:${String(secs).padStart(2, '0')}`
                : `${stats.correctCount} / ${questions.length} correct • Time ${mins}:${String(secs).padStart(2, '0')}`}
            </Text>

            <View style={styles.reviewSection}>
              <Text style={styles.reviewHeader}>{isZh ? '答題回顧' : 'Review'}</Text>
              {questions.map((q, idx) => {
                const ans = answers[q.id] || [];
                const ok = isCorrect(q, ans);
                const userLabels = q.type === 'fill_blank'
                  ? [ans[0] || (isZh ? '（未作答）' : '(no answer)')]
                  : q.options.filter(o => ans.includes(o.id)).map(o => o.label);
                const correctLabels = q.type === 'fill_blank'
                  ? q.correctAnswers
                  : q.options.filter(o => o.isCorrect).map(o => o.label);
                return (
                  <View key={q.id} style={[styles.reviewCard, { borderLeftColor: ok ? ACCENT : ERROR }]}>
                    <View style={styles.reviewTop}>
                      <View style={[styles.reviewIcon, { backgroundColor: ok ? ACCENT : ERROR }]}>
                        {ok ? <Check size={14} color="#fff" /> : <X size={14} color="#fff" />}
                      </View>
                      <Text style={styles.reviewQNum}>{idx + 1}.</Text>
                      <Text style={styles.reviewQText} numberOfLines={3}>{q.text}</Text>
                    </View>
                    <Text style={styles.reviewLabel}>
                      {isZh ? '您的答案：' : 'Your answer: '}
                      <Text style={[styles.reviewVal, { color: ok ? ACCENT_DARK : ERROR }]}>
                        {userLabels.join(', ') || '—'}
                      </Text>
                    </Text>
                    {!ok && (
                      <Text style={styles.reviewLabel}>
                        {isZh ? '正確答案：' : 'Correct: '}
                        <Text style={[styles.reviewVal, { color: ACCENT_DARK }]}>{correctLabels.join(', ')}</Text>
                      </Text>
                    )}
                    {q.explanation && (
                      <Text style={styles.reviewExplain}>{q.explanation}</Text>
                    )}
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.replace('/(tabs)/home' as never)}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>{isZh ? '完成' : 'Done'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  if (!current) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.center}>
          <Text style={styles.errorText}>{isZh ? '此測驗沒有題目' : 'No questions in this quiz'}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/home' as never)}>
            <Text style={styles.primaryBtnText}>{isZh ? '返回' : 'Back'}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  const progress = (currentIdx + 1) / questions.length;
  const timerWarn = timeLeftSec !== null && timeLeftSec < 60;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={handleExit} testID="quiz-exit">
            <X size={22} color="#1F2937" />
          </TouchableOpacity>
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {currentIdx + 1} / {questions.length}
            </Text>
          </View>
          {timeLeftSec !== null && (
            <View style={[styles.timerPill, timerWarn && styles.timerPillWarn]}>
              <Clock size={14} color={timerWarn ? '#fff' : ERROR} />
              <Text style={[styles.timerText, timerWarn && { color: '#fff' }]}>
                {Math.floor(timeLeftSec / 60)}:{String(timeLeftSec % 60).padStart(2, '0')}
              </Text>
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.questionText}>{current.text}</Text>
          {current.imageUrl && (
            <Image source={{ uri: current.imageUrl }} style={styles.questionImage} resizeMode="contain" />
          )}

          {current.type === 'fill_blank' ? (
            <TextInput
              style={[styles.fillInput, currentRevealed && {
                borderColor: isCorrect(current, currentAnswer) ? ACCENT : ERROR,
              }]}
              value={currentAnswer[0] || ''}
              onChangeText={(v) => setAnswer(current.id, [v])}
              placeholder={isZh ? '輸入答案...' : 'Type your answer...'}
              placeholderTextColor="#9CA3AF"
              editable={!currentRevealed}
              autoCorrect={false}
              autoCapitalize="none"
            />
          ) : (
            <View style={{ gap: 12 }}>
              {current.options.map(opt => {
                const selected = currentAnswer.includes(opt.id);
                let bg = '#fff';
                let border = '#E5E7EB';
                let textColor = '#1F2937';
                let icon: React.ReactNode = null;
                if (currentRevealed) {
                  if (opt.isCorrect) {
                    bg = '#ECFDF5';
                    border = ACCENT;
                    textColor = ACCENT_DARK;
                    icon = <Check size={20} color={ACCENT} />;
                  } else if (selected && !opt.isCorrect) {
                    bg = '#FEF2F2';
                    border = ERROR;
                    textColor = '#B91C1C';
                    icon = <X size={20} color={ERROR} />;
                  }
                } else if (selected) {
                  bg = '#ECFDF5';
                  border = ACCENT;
                  textColor = ACCENT_DARK;
                }
                const isTrueFalse = current.type === 'true_false';
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      isTrueFalse ? styles.tfButton : styles.optionButton,
                      { backgroundColor: bg, borderColor: border },
                    ]}
                    onPress={() => onSelectOption(opt)}
                    disabled={currentRevealed}
                    activeOpacity={0.8}
                    testID={`quiz-option-${opt.id}`}
                  >
                    {!isTrueFalse && (
                      <View style={[
                        current.type === 'mcq_multi' ? styles.checkBox : styles.radioBox,
                        selected && { backgroundColor: ACCENT, borderColor: ACCENT },
                      ]}>
                        {selected && <Check size={14} color="#fff" />}
                      </View>
                    )}
                    <Text style={[
                      isTrueFalse ? styles.tfText : styles.optionText,
                      { color: textColor },
                    ]}>
                      {opt.label}
                    </Text>
                    {icon}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {currentRevealed && (
            <View style={[
              styles.feedbackBox,
              { backgroundColor: isCorrect(current, currentAnswer) ? '#ECFDF5' : '#FEF2F2' },
            ]}>
              <Text style={[
                styles.feedbackTitle,
                { color: isCorrect(current, currentAnswer) ? ACCENT_DARK : '#B91C1C' },
              ]}>
                {isCorrect(current, currentAnswer)
                  ? (isZh ? '✓ 答對了！' : '✓ Correct!')
                  : (isZh ? '✗ 答錯了' : '✗ Incorrect')}
              </Text>
              {current.explanation && (
                <Text style={styles.feedbackText}>{current.explanation}</Text>
              )}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {allowPrevious && currentIdx > 0 ? (
            <TouchableOpacity style={styles.prevBtn} onPress={onPrevious} activeOpacity={0.8}>
              <ArrowLeft size={18} color="#374151" />
              <Text style={styles.prevBtnText}>{isZh ? '上一題' : 'Previous'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 100 }} />
          )}
          <TouchableOpacity
            style={[
              styles.nextBtn,
              (!isAnswered || submitting) && styles.nextBtnDisabled,
            ]}
            onPress={onNext}
            disabled={!isAnswered || submitting}
            activeOpacity={0.85}
            testID="quiz-next"
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.nextBtnText}>
                  {showCorrectAfter && !currentRevealed
                    ? (isZh ? '確認' : 'Check')
                    : currentIdx === questions.length - 1
                      ? (isZh ? '提交' : 'Submit')
                      : (isZh ? '下一題' : 'Next')}
                </Text>
                <ArrowRight size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  loadingText: { color: '#374151', fontSize: 14, fontWeight: '500' },
  errorText: { color: '#B91C1C', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },
  progressWrap: { flex: 1, gap: 4 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: ACCENT,
    borderRadius: 4,
  },
  progressText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  timerPillWarn: { backgroundColor: ERROR, borderColor: ERROR },
  timerText: { color: ERROR, fontSize: 13, fontWeight: '700', minWidth: 36, textAlign: 'center' as const },

  body: { padding: 20, gap: 20, paddingBottom: 24 },
  questionText: { fontSize: 22, fontWeight: '700', color: '#1F2937', lineHeight: 30 },
  questionImage: { width: '100%', height: 220, borderRadius: 16, backgroundColor: '#F3F4F6' },

  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 2,
    minHeight: 56,
  },
  optionText: { fontSize: 16, fontWeight: '600', flex: 1 },
  radioBox: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  checkBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },

  tfButton: {
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
  },
  tfText: { fontSize: 22, fontWeight: '800' },

  fillInput: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    minHeight: 56,
  },

  feedbackBox: {
    padding: 16,
    borderRadius: 14,
    gap: 6,
  },
  feedbackTitle: { fontSize: 16, fontWeight: '800' },
  feedbackText: { fontSize: 14, color: '#374151', lineHeight: 20 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  prevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  prevBtnText: { color: '#374151', fontSize: 14, fontWeight: '600' },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: ACCENT,
    minWidth: 140,
    justifyContent: 'center',
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  primaryBtn: {
    backgroundColor: ACCENT,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  resultsScroll: {
    padding: 20,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 8,
  },
  resultBadge: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 16, marginBottom: 8,
  },
  resultTitle: { fontSize: 26, fontWeight: '800', color: '#1F2937' },
  resultScore: { fontSize: 32, fontWeight: '900', color: ACCENT_DARK, marginTop: 6 },
  resultSub: { fontSize: 14, color: '#6B7280', fontWeight: '500', marginBottom: 16, textAlign: 'center' as const },

  reviewSection: { width: '100%', gap: 10, marginTop: 12 },
  reviewHeader: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 4 },
  reviewCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderLeftWidth: 4,
    gap: 6,
  },
  reviewTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewIcon: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  reviewQNum: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  reviewQText: { fontSize: 14, fontWeight: '600', color: '#1F2937', flex: 1 },
  reviewLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  reviewVal: { fontWeight: '700' },
  reviewExplain: { fontSize: 13, color: '#374151', fontStyle: 'italic' as const, marginTop: 4 },
});

// Suppress unused import warning for WARN constant fallback
void WARN;
