import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import { AppTutorial } from '@/components/AppTutorial';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { JASON_CARTOON } from '@/constants/images';
import { Exercise, ExerciseProgram, ExerciseLog, Language, ExerciseReviewRequirement } from '@/types';
import { getDosageProgressText, getExerciseDosage } from '@/lib/dosage';
import { log } from '@/lib/logger';
import {
  fetchAllReviewRequirements,
  fetchTodaySubmissionsForExercises,
  isTodayAllowed,
  getNextAllowedDay,
} from '@/lib/reviewRequirements';
import { calculateStars, getStarsForSession } from '@/lib/stars';
import {
  Play,
  Clock,
  Repeat,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  CalendarDays,
  FileText,
  CheckCircle2,
  Layers,
  Star,
  Flame,
  Video,
  MessageSquare,
} from 'lucide-react-native';

interface CategoryGroup {
  category: string;
  exercises: Exercise[];
}

const CATEGORY_ICONS: Record<string, string> = {
  lips: '👄',
  tongue: '👅',
  lips_tongue_coordination: '🔄',
  speech: '🗣️',
  voice: '🎙️',
  breathing: '🌬️',
  swallowing: '💧',
  jaw: '🦷',
  facial: '😊',
  resonance: '🔔',
  fluency: '💬',
  cognitive: '🧠',
};

function getCategoryIcon(category: string): string {
  const key = category.toLowerCase().replace(/[\s\-\/]+/g, '_');
  return CATEGORY_ICONS[key] || '📋';
}

function getExerciseTitle(exercise: Exercise, language: Language | null): string {
  const lang = language || 'en';
  switch (lang) {
    case 'zh_hant': return exercise.title_zh_hant || exercise.title_en;
    case 'zh_hans': return exercise.title_zh_hans || exercise.title_en;
    default: return exercise.title_en;
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString();
}

function CategorySection({
  group,
  todayCounts,
  language,
  t,
  onExercisePress,
  onDoAllInCategory,
  isExpired,
  reviewRequirements,
  todaySubmissions,
}: {
  group: CategoryGroup;
  todayCounts: Record<string, number>;
  language: Language | null;
  t: (key: string) => string;
  onExercisePress: (id: string) => void;
  onDoAllInCategory: (ids: string[]) => void;
  isExpired: boolean;
  reviewRequirements: ExerciseReviewRequirement[];
  todaySubmissions: Record<string, number>;
}) {
  const [expanded, setExpanded] = useState<boolean>(true);
  const icon = getCategoryIcon(group.category);

  const completedCount = useMemo(() => {
    return group.exercises.filter((e) => {
      const count = todayCounts[e.id] || 0;
      return e.dosage_per_day ? count >= e.dosage_per_day : count > 0;
    }).length;
  }, [group.exercises, todayCounts]);

  const totalCount = group.exercises.length;
  const allDone = completedCount === totalCount && totalCount > 0;

  const handleDoAll = useCallback(() => {
    const ids = group.exercises.map((e) => e.id);
    onDoAllInCategory(ids);
  }, [group.exercises, onDoAllInCategory]);

  return (
    <View style={styles.categorySection}>
      <TouchableOpacity
        style={[styles.categoryHeader, allDone && styles.categoryHeaderDone]}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.categoryHeaderLeft}>
          <ScaledText size={20} style={styles.categoryIcon}>{icon}</ScaledText>
          <View style={styles.categoryTitleBlock}>
            <ScaledText size={16} weight="bold" color={allDone ? Colors.success : Colors.textPrimary}>
              {group.category}
            </ScaledText>
            <ScaledText size={12} color={Colors.textSecondary}>
              {completedCount}/{totalCount} {t('exercisesCompleted')}
            </ScaledText>
          </View>
        </View>
        <View style={styles.categoryHeaderRight}>
          {!isExpired && group.exercises.length > 1 && (
            <TouchableOpacity
              style={styles.doAllCategoryBtn}
              onPress={handleDoAll}
              activeOpacity={0.7}
            >
              <Play size={12} color={Colors.white} />
              <ScaledText size={11} weight="600" color={Colors.white}>
                {t('doAllInCategory')}
              </ScaledText>
            </TouchableOpacity>
          )}
          {expanded ? (
            <ChevronDown size={20} color={Colors.textSecondary} />
          ) : (
            <ChevronRight size={20} color={Colors.textSecondary} />
          )}
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.categoryExercises}>
          {group.exercises.map((exercise, index) => {
            const count = todayCounts[exercise.id] || 0;
            return (
              <TouchableOpacity
                key={exercise.id}
                style={styles.exerciseCard}
                onPress={() => onExercisePress(exercise.id)}
                activeOpacity={0.7}
                testID={`exercise-card-${exercise.id}`}
                accessibilityRole="button"
              >
                <View style={styles.exerciseIndex}>
                  <ScaledText size={14} weight="bold" color={Colors.primary}>
                    {index + 1}
                  </ScaledText>
                </View>
                <View style={styles.exerciseInfo}>
                  <ScaledText size={16} weight="600" color={Colors.textPrimary} numberOfLines={2}>
                    {getExerciseTitle(exercise, language)}
                  </ScaledText>
                  <View style={styles.exerciseMeta}>
                    <View style={styles.metaItem}>
                      <Clock size={13} color={Colors.textSecondary} />
                      <ScaledText size={13} color={Colors.textSecondary}>
                        {exercise.duration_minutes} {t('minutes')}
                      </ScaledText>
                    </View>
                    <View style={styles.metaItem}>
                      <Repeat size={13} color={Colors.textSecondary} />
                      <ScaledText size={13} color={Colors.textSecondary} numberOfLines={1}>
                        {getExerciseDosage(exercise, language)}
                      </ScaledText>
                    </View>
                  </View>
                  {(() => {
                    const req = reviewRequirements.find(r => r.exercise_title_en === exercise.title_en);
                    if (!req) return null;
                    const subCount = todaySubmissions[exercise.title_en] || 0;
                    if (subCount > 0 && subCount >= req.max_submissions) {
                      return (
                        <View style={styles.reviewBadgeSubmitted}>
                          <ScaledText size={11} weight="600" color={Colors.success}>
                            {t('submittedToday')}
                          </ScaledText>
                        </View>
                      );
                    }
                    if (isTodayAllowed(req.allowed_days)) {
                      return (
                        <View style={styles.reviewBadgeRequired}>
                          <ScaledText size={11} weight="600" color="#2563EB">
                            {t('videoRequired')}
                          </ScaledText>
                        </View>
                      );
                    }
                    const nextDay = getNextAllowedDay(req.allowed_days);
                    if (nextDay) {
                      return (
                        <View style={styles.reviewBadgeNext}>
                          <ScaledText size={11} weight="600" color={Colors.textSecondary}>
                            {String(`${t('nextSubmission')}${t(nextDay)}`)}
                          </ScaledText>
                        </View>
                      );
                    }
                    return null;
                  })()}
                  {exercise.dosage_per_day && (
                    <View style={styles.dosageProgress}>
                      <View style={styles.dosageBarBg}>
                        <View
                          style={[
                            styles.dosageBarFill,
                            {
                              width: `${Math.min(100, (count / exercise.dosage_per_day) * 100)}%`,
                              backgroundColor: count >= exercise.dosage_per_day ? Colors.success : Colors.primary,
                            },
                          ]}
                        />
                      </View>
                      <ScaledText size={11} color={count >= exercise.dosage_per_day ? Colors.success : Colors.textSecondary} weight="600">
                        {getDosageProgressText(count, exercise.dosage_per_day, t)}
                      </ScaledText>
                    </View>
                  )}
                </View>
                <View style={styles.exerciseRight}>
                  {count > 0 && (
                    <View style={styles.badge}>
                      <CheckCircle2 size={12} color={Colors.success} />
                      <ScaledText size={11} weight="600" color={Colors.success}>
                        {count}
                      </ScaledText>
                    </View>
                  )}
                  <ChevronRight size={20} color={Colors.disabled} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const { t, patientId, patientName, language, tutorialCompleted, setTutorialCompleted } = useApp();
  const router = useRouter();

  const programQuery = useQuery({
    queryKey: ['program', patientId],
    queryFn: async () => {
      log('Fetching program for patient:', patientId);
      const { data, error } = await supabase
        .from('exercise_programs')
        .select('*, exercises(*)')
        .eq('patient_id', patientId!)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        log('Program fetch error:', error);
        throw error;
      }

      if (data?.exercises) {
        data.exercises.sort((a: Exercise, b: Exercise) => a.sort_order - b.sort_order);
      }

      return data as ExerciseProgram;
    },
    enabled: !!patientId,
    staleTime: 5 * 60 * 1000,
  });

  const todayLogsQuery = useQuery({
    queryKey: ['todayLogs', patientId],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('exercise_logs')
        .select('id, exercise_id, completed_at')
        .eq('patient_id', patientId!)
        .gte('completed_at', today.toISOString());

      if (error) {
        log('Today logs fetch error:', error);
        return [];
      }
      return (data || []) as ExerciseLog[];
    },
    enabled: !!patientId,
    staleTime: 30 * 1000,
  });

  const todayCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (todayLogsQuery.data || []).forEach((log) => {
      counts[log.exercise_id] = (counts[log.exercise_id] || 0) + 1;
    });
    return counts;
  }, [todayLogsQuery.data]);

  const program = programQuery.data;
  const exercises = useMemo(() => program?.exercises || [], [program?.exercises]);
  const isExpired = program ? new Date(program.expiry_date) < new Date() : false;

  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    const groupMap = new Map<string, Exercise[]>();
    const orderMap = new Map<string, number>();

    exercises.forEach((exercise) => {
      const cat = exercise.category || t('uncategorized');
      if (!groupMap.has(cat)) {
        groupMap.set(cat, []);
        orderMap.set(cat, exercise.sort_order);
      }
      groupMap.get(cat)!.push(exercise);
    });

    const groups: CategoryGroup[] = [];
    groupMap.forEach((exs, category) => {
      groups.push({ category, exercises: exs });
    });

    groups.sort((a, b) => {
      const aOrder = orderMap.get(a.category) ?? 999;
      const bOrder = orderMap.get(b.category) ?? 999;
      return aOrder - bOrder;
    });

    return groups;
  }, [exercises, t]);

  const allLogsQuery = useQuery({
    queryKey: ['exerciseLogs', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercise_logs')
        .select('id, exercise_id, completed_at, self_rating, exercises(title_en, title_zh_hant, title_zh_hans)')
        .eq('patient_id', patientId!)
        .order('completed_at', { ascending: false })
        .limit(200);
      if (error) return [];
      return (data || []) as unknown as ExerciseLog[];
    },
    enabled: !!patientId,
    staleTime: 60 * 1000,
  });

  const starInfo = useMemo(() => {
    const total = exercises.length;
    const todayLogs = todayLogsQuery.data || [];
    const uniqueToday = new Set(todayLogs.map((l) => l.exercise_id));
    const session = getStarsForSession(uniqueToday.size, total);
    const allLogs = allLogsQuery.data || [];
    const summary = calculateStars(allLogs, total);
    return {
      totalStars: summary.totalStars,
      todayStars: summary.todayStars,
      currentStreak: summary.currentStreak,
      sessionStars: session.sessionStars,
      isHalf: session.isHalf,
      isAll: session.isAll,
      uniqueToday: uniqueToday.size,
    };
  }, [exercises.length, todayLogsQuery.data, allLogsQuery.data]);

  const [showTutorial, setShowTutorial] = useState(false);
  const [remarksExpanded, setRemarksExpanded] = useState(false);

  const reviewReqQuery = useQuery({
    queryKey: ['reviewRequirements', patientId],
    queryFn: () => fetchAllReviewRequirements(patientId!),
    enabled: !!patientId,
    staleTime: 2 * 60 * 1000,
  });

  const todaySubsQuery = useQuery({
    queryKey: ['todaySubmissionsForExercises', patientId],
    queryFn: () => fetchTodaySubmissionsForExercises(patientId!),
    enabled: !!patientId,
    staleTime: 30 * 1000,
  });

  const reviewRequirements = reviewReqQuery.data || [];
  const todaySubmissions = todaySubsQuery.data || {};

  useEffect(() => {
    if (!tutorialCompleted && patientId) {
      const timer = setTimeout(() => setShowTutorial(true), 500);
      return () => clearTimeout(timer);
    }
  }, [tutorialCompleted, patientId]);

  const handleTutorialComplete = useCallback(() => {
    setShowTutorial(false);
    void setTutorialCompleted();
  }, [setTutorialCompleted]);

  const handleExercisePress = useCallback((exerciseId: string) => {
    router.push({
      pathname: '/home/exercise',
      params: { exerciseId },
    });
  }, [router]);

  const handleDoAll = useCallback(() => {
    if (exercises.length === 0) return;
    const ids = exercises.map((e) => e.id);
    router.push({
      pathname: '/home/exercise',
      params: {
        exerciseId: ids[0],
        allExerciseIds: JSON.stringify(ids),
        currentIndex: '0',
      },
    });
  }, [exercises, router]);

  const handleDoAllInCategory = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    router.push({
      pathname: '/home/exercise',
      params: {
        exerciseId: ids[0],
        allExerciseIds: JSON.stringify(ids),
        currentIndex: '0',
      },
    });
  }, [router]);

  const submissionsQuery = useQuery({
    queryKey: ['videoSubmissions', patientId],
    queryFn: async () => {
      if (!patientId) return [];
      const { data, error } = await supabase
        .from('exercise_video_submissions')
        .select('id, exercise_title_en, review_status, reviewer_notes, created_at, submission_date')
        .eq('patient_id', patientId!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) return [];
      return (data || []) as any[];
    },
    enabled: !!patientId,
    staleTime: 30 * 1000,
  });

  const submissions = submissionsQuery.data || [];

  const { refetch: refetchProgram } = programQuery;
  const { refetch: refetchLogs } = todayLogsQuery;
  const { refetch: refetchAllLogs } = allLogsQuery;
  const { refetch: refetchSubmissions } = submissionsQuery;
  const { refetch: refetchReviewReqs } = reviewReqQuery;
  const { refetch: refetchTodaySubs } = todaySubsQuery;

  const onRefresh = useCallback(() => {
    void refetchProgram();
    void refetchLogs();
    void refetchAllLogs();
    void refetchSubmissions();
    void refetchReviewReqs();
    void refetchTodaySubs();
  }, [refetchProgram, refetchLogs, refetchAllLogs, refetchSubmissions, refetchReviewReqs, refetchTodaySubs]);

  if (programQuery.isLoading) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <ScaledText size={16} color={Colors.textSecondary} style={styles.loadingText}>
            {t('loading')}
          </ScaledText>
        </SafeAreaView>
      </View>
    );
  }

  if (programQuery.isError || !program) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.centered}>
          <AlertTriangle size={48} color={Colors.secondary} />
          <ScaledText size={16} color={Colors.textSecondary} style={styles.loadingText}>
            {t('noExercises')}
          </ScaledText>
          <TouchableOpacity style={styles.retryButton} onPress={() => programQuery.refetch()}>
            <ScaledText size={16} weight="600" color={Colors.primary}>
              {t('retry')}
            </ScaledText>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={programQuery.isFetching && !programQuery.isLoading}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        >
          <View style={styles.welcomeSection}>
            <View style={styles.welcomeRow}>
              <View style={styles.welcomeTextBlock}>
                <ScaledText size={15} color={Colors.textSecondary}>
                  {t('welcomeBack')}
                </ScaledText>
                <ScaledText size={26} weight="bold" color={Colors.textPrimary}>
                  {patientName}
                </ScaledText>
              </View>
              <Image source={JASON_CARTOON} style={styles.welcomeAvatar} />
            </View>
          </View>

          <View style={styles.programCard}>
            <View style={styles.programHeader}>
              <CalendarDays size={18} color={Colors.primary} />
              <ScaledText size={15} weight="600" color={Colors.primary}>
                {t('programInfo')}
              </ScaledText>
            </View>
            <View style={styles.programDates}>
              <View style={styles.dateItem}>
                <ScaledText size={12} color={Colors.textSecondary}>
                  {t('issueDate')}
                </ScaledText>
                <ScaledText size={15} weight="600" color={Colors.textPrimary}>
                  {formatDate(program.issue_date)}
                </ScaledText>
              </View>
              <View style={styles.dateDivider} />
              <View style={styles.dateItem}>
                <ScaledText size={12} color={Colors.textSecondary}>
                  {t('expiryDate')}
                </ScaledText>
                <ScaledText size={15} weight="600" color={isExpired ? Colors.error : Colors.textPrimary}>
                  {formatDate(program.expiry_date)}
                </ScaledText>
              </View>
            </View>
          </View>

          {(starInfo.totalStars > 0 || starInfo.currentStreak > 0) && (
            <View style={styles.starSummaryCard}>
              <View style={styles.starSummaryRow}>
                <View style={styles.starSummaryItem}>
                  <Star size={20} color="#FFB800" fill="#FFB800" />
                  <ScaledText size={22} weight="bold" color="#B8860B">
                    {starInfo.totalStars}
                  </ScaledText>
                  <ScaledText size={11} color={Colors.textSecondary}>
                    {t('totalStars')}
                  </ScaledText>
                </View>
                <View style={styles.starDivider} />
                <View style={styles.starSummaryItem}>
                  <Flame size={20} color="#FF6B35" />
                  <ScaledText size={22} weight="bold" color="#FF6B35">
                    {starInfo.currentStreak}
                  </ScaledText>
                  <ScaledText size={11} color={Colors.textSecondary}>
                    {t('currentStreak')}
                  </ScaledText>
                </View>
                <View style={styles.starDivider} />
                <View style={styles.starSummaryItem}>
                  <Star size={20} color={Colors.primary} />
                  <ScaledText size={22} weight="bold" color={Colors.primary}>
                    {starInfo.todayStars}
                  </ScaledText>
                  <ScaledText size={11} color={Colors.textSecondary}>
                    {t('today')}
                  </ScaledText>
                </View>
              </View>
              {starInfo.uniqueToday > 0 && !starInfo.isAll && (
                <View style={styles.starProgressHint}>
                  <ScaledText size={12} color={Colors.textSecondary}>
                    {starInfo.uniqueToday}/{exercises.length} — {starInfo.isHalf ? t('halfExercisesStar') : t('keepPracticing')}
                  </ScaledText>
                </View>
              )}
            </View>
          )}

          {isExpired && (
            <View style={styles.expiredBanner}>
              <AlertTriangle size={18} color={Colors.error} />
              <ScaledText size={14} color={Colors.error} style={styles.expiredText}>
                {t('programExpired')}
              </ScaledText>
            </View>
          )}

          {program.remarks && (
            <TouchableOpacity
              style={styles.remarksCard}
              onPress={() => setRemarksExpanded(!remarksExpanded)}
              activeOpacity={0.7}
            >
              <View style={styles.remarksHeader}>
                <FileText size={18} color={Colors.secondary} />
                <ScaledText size={15} weight="600" color={Colors.textPrimary} style={styles.remarksTitle}>
                  {t('remarks')}
                </ScaledText>
                <ChevronRight
                  size={18}
                  color={Colors.textSecondary}
                  style={remarksExpanded ? styles.chevronDown : undefined}
                />
              </View>
              {remarksExpanded && (
                <ScaledText size={14} color={Colors.textSecondary} style={styles.remarksBody}>
                  {program.remarks}
                </ScaledText>
              )}
            </TouchableOpacity>
          )}

          {exercises.length > 0 && !isExpired && (
            <TouchableOpacity
              style={styles.doAllButton}
              onPress={handleDoAll}
              activeOpacity={0.8}
              accessibilityLabel={t('doAllExercises')}
              accessibilityRole="button"
            >
              <Play size={22} color={Colors.white} />
              <ScaledText size={18} weight="bold" color={Colors.white} style={styles.doAllText}>
                {t('doAllExercises')}
              </ScaledText>
            </TouchableOpacity>
          )}

          <View style={styles.exercisesSection}>
            <View style={styles.sectionTitleRow}>
              <Layers size={20} color={Colors.primary} />
              <ScaledText size={18} weight="bold" color={Colors.textPrimary}>
                {t('exercises')}
              </ScaledText>
            </View>

            {exercises.length === 0 ? (
              <View style={styles.emptyCard}>
                <ScaledText size={15} color={Colors.textSecondary}>
                  {t('noExercises')}
                </ScaledText>
              </View>
            ) : (
              categoryGroups.map((group) => (
                <CategorySection
                  key={group.category}
                  group={group}
                  todayCounts={todayCounts}
                  language={language}
                  t={t}
                  onExercisePress={handleExercisePress}
                  onDoAllInCategory={handleDoAllInCategory}
                  isExpired={isExpired}
                  reviewRequirements={reviewRequirements}
                  todaySubmissions={todaySubmissions}
                />
              ))
            )}
          </View>

          {submissions.length > 0 && (
            <View style={styles.submissionsSection}>
              <TouchableOpacity
                style={styles.submissionsHeader}
                onPress={() => router.push('/my-submissions')}
                activeOpacity={0.7}
              >
                <View style={styles.submissionsHeaderLeft}>
                  <Video size={20} color="#2563EB" />
                  <ScaledText size={18} weight="bold" color={Colors.textPrimary}>
                    {t('mySubmissions')}
                  </ScaledText>
                </View>
                <ChevronRight size={20} color={Colors.textSecondary} />
              </TouchableOpacity>

              {submissions.slice(0, 3).map((sub: any) => {
                const isRedo = sub.review_status === 'redo_requested';
                const isReviewed = sub.review_status === 'reviewed';
                const statusColor = isReviewed ? Colors.success : isRedo ? Colors.error : '#F59E0B';
                const statusBg = isReviewed ? Colors.successLight : isRedo ? Colors.errorLight : '#FEF3C7';
                const statusLabel = isReviewed ? t('reviewed') : isRedo ? t('redoRequested') : t('pending');

                return (
                  <TouchableOpacity
                    key={sub.id}
                    style={[styles.submissionCard, isRedo && styles.submissionCardRedo]}
                    onPress={() => router.push('/my-submissions')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.submissionCardTop}>
                      <ScaledText size={14} weight="600" color={Colors.textPrimary} numberOfLines={1} style={{ flex: 1 }}>
                        {sub.exercise_title_en}
                      </ScaledText>
                      <View style={[styles.submissionStatusBadge, { backgroundColor: statusBg }]}>
                        <ScaledText size={10} weight="600" color={statusColor}>
                          {String(statusLabel)}
                        </ScaledText>
                      </View>
                    </View>
                    <ScaledText size={11} color={Colors.textSecondary}>
                      {sub.created_at ? new Date(sub.created_at).toLocaleString() : sub.submission_date || ''}
                    </ScaledText>
                    {sub.reviewer_notes && (
                      <View style={styles.submissionNotePreview}>
                        <MessageSquare size={11} color={Colors.primary} />
                        <ScaledText size={11} color={Colors.primary} numberOfLines={1} style={{ flex: 1 }}>
                          {sub.reviewer_notes}
                        </ScaledText>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              {submissions.length > 3 && (
                <TouchableOpacity
                  style={styles.viewAllSubmissions}
                  onPress={() => router.push('/my-submissions')}
                  activeOpacity={0.7}
                >
                  <ScaledText size={13} weight="600" color={Colors.primary}>
                    {language === 'zh_hant' || language === 'zh_hans' ? `查看全部 ${submissions.length} 項提交` : `View all ${submissions.length} submissions`}
                  </ScaledText>
                  <ChevronRight size={16} color={Colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          )}

          <CopyrightFooter />
        </ScrollView>
      </SafeAreaView>
      <AppTutorial visible={showTutorial} onComplete={handleTutorialComplete} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  welcomeSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  welcomeTextBlock: {
    flex: 1,
  },
  welcomeAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.primaryLight,
    marginLeft: 12,
  },
  programCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  programHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  programDates: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateItem: {
    flex: 1,
    gap: 2,
  },
  dateDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
  },
  expiredBanner: {
    marginHorizontal: 20,
    backgroundColor: Colors.errorLight,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 10,
    marginBottom: 12,
  },
  expiredText: {
    flex: 1,
  },
  remarksCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.secondaryLight,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  remarksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  remarksTitle: {
    flex: 1,
  },
  chevronDown: {
    transform: [{ rotate: '90deg' }],
  },
  remarksBody: {
    marginTop: 12,
    lineHeight: 22,
  },
  doAllButton: {
    marginHorizontal: 20,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 10,
    marginBottom: 24,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  doAllText: {
    letterSpacing: 0.5,
  },
  exercisesSection: {
    paddingHorizontal: 20,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categorySection: {
    marginBottom: 16,
  },
  categoryHeader: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  categoryHeaderDone: {
    borderColor: Colors.success,
    backgroundColor: Colors.successLight,
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  categoryIcon: {
    lineHeight: 28,
  },
  categoryTitleBlock: {
    flex: 1,
    gap: 2,
  },
  categoryHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  doAllCategoryBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  categoryExercises: {
    paddingTop: 8,
    paddingLeft: 12,
  },
  exerciseCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  exerciseIndex: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  exerciseInfo: {
    flex: 1,
    gap: 5,
  },
  exerciseMeta: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  exerciseRight: {
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  dosageProgress: {
    marginTop: 4,
    gap: 3,
  },
  dosageBarBg: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden' as const,
  },
  dosageBarFill: {
    height: 4,
    borderRadius: 2,
  },
  starSummaryCard: {
    marginHorizontal: 20,
    backgroundColor: '#FFFDF5',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#FFE082',
    marginBottom: 12,
  },
  starSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  starSummaryItem: {
    alignItems: 'center',
    gap: 3,
    flex: 1,
  },
  starDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#FFE082',
  },
  starProgressHint: {
    marginTop: 10,
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#FFE082',
  },
  reviewBadgeSubmitted: {
    marginTop: 4,
    backgroundColor: Colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start' as const,
  },
  reviewBadgeRequired: {
    marginTop: 4,
    backgroundColor: '#EBF5FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start' as const,
  },
  reviewBadgeNext: {
    marginTop: 4,
    backgroundColor: Colors.card,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start' as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  submissionsSection: {
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  submissionsHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 12,
  },
  submissionsHeaderLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  submissionCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  submissionCardRedo: {
    borderColor: Colors.error,
    borderWidth: 1.5,
    backgroundColor: '#FFF5F5',
  },
  submissionCardTop: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
  },
  submissionStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  submissionNotePreview: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    marginTop: 2,
  },
  viewAllSubmissions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
    paddingVertical: 10,
  },
});
