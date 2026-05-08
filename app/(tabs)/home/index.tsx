import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Platform,
  Animated,
  Image,
  Linking,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import MarketingDrawModal from '@/components/MarketingDrawModal';
import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import { AppTutorial } from '@/components/AppTutorial';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { TherapistImage } from '@/components/TherapistImage';
import { Exercise, ExerciseProgram, ExerciseLog, Language, ExerciseReviewRequirement, FeedingSkillAssignment, ProgramObjective, HolisticObjective, ProgramSchedule } from '@/types';
import { getDosageProgressText, getExerciseDosage } from '@/lib/dosage';
import { getLocalizedField } from '@/constants/i18n';
import { log } from '@/lib/logger';
import {
  fetchAllReviewRequirements,
  fetchTodaySubmissionsForExercises,
  isTodayAllowed,
  getNextAllowedDay,
} from '@/lib/reviewRequirements';
import {
  fetchAllFeedingReviewRequirements,
  fetchTodayFeedingSubmissions,
  isTodayAllowed as isFeedingTodayAllowed,
  getNextAllowedDay as getFeedingNextAllowedDay,
} from '@/lib/feedingSkillReview';
import { calculateStars, getStarsForSession } from '@/lib/stars';
import { playAssistantOpen } from '@/utils/soundEffects';
import {
  Play,
  Clock,
  Repeat,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CalendarDays,
  FileText,
  CheckCircle2,
  Layers,
  Star,
  Flame,
  Video,
  MessageSquare,
  UtensilsCrossed,
  Eye,
  Target,
  Sparkles,
  X,
  Bell,
} from 'lucide-react-native';

const PROGRAM_ACCENT_COLORS = [
  '#3B82F6',
  '#EC4899',
  '#10B981',
  '#8B5CF6',
  '#F59E0B',
  '#F97316',
  '#06B6D4',
  '#DB2777',
];

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
  const key = category.toLowerCase().replace(/[\s\-/]+/g, '_');
  return CATEGORY_ICONS[key] || '📋';
}

function getExerciseTitle(exercise: Exercise, language: Language | null): string {
  return getLocalizedField(exercise, 'title', language || 'en');
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

  const notificationsQuery = useQuery({
    queryKey: ['patient-notifications', patientId],
    queryFn: async () => {
      if (!patientId) return [];
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('is_active', true)
        .lte('start_date', today)
        .gte('end_date', today)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.log('Notifications query error:', error);
        return [];
      }
      return data || [];
    },
    enabled: !!patientId,
    staleTime: 5 * 60 * 1000,
  });

  const programQuery = useQuery({
    queryKey: ['programs', patientId],
    queryFn: async () => {
      log('Fetching all active programs for patient:', patientId);
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('exercise_programs')
        .select('*, exercises(*)')
        .eq('patient_id', patientId!)
        .eq('is_active', true)
        .lte('issue_date', today)
        .gte('expiry_date', today)
        .order('sort_order', { ascending: true });

      if (error) {
        log('Programs fetch error:', error);
        throw error;
      }

      if (data) {
        for (const p of data) {
          if (p.exercises) {
            p.exercises.sort((a: Exercise, b: Exercise) => a.sort_order - b.sort_order);
          }
        }
      }

      return (data || []) as ExerciseProgram[];
    },
    enabled: !!patientId,
    staleTime: 5 * 60 * 1000,
  });

  const allPrograms = useMemo(() => programQuery.data || [], [programQuery.data]);

  const programIdKey = useMemo(() => allPrograms.map(p => p.id).join(','), [allPrograms]);

  const schedulesQuery = useQuery({
    queryKey: ['programSchedules', programIdKey],
    queryFn: async () => {
      const programIds = allPrograms.map(p => p.id);
      if (programIds.length === 0) return [];
      log('Fetching schedules for programs:', programIds);
      const { data, error } = await supabase
        .from('program_schedules')
        .select('*')
        .in('program_id', programIds);
      if (error) {
        log('Schedules fetch error:', error);
        return [];
      }
      return (data || []) as ProgramSchedule[];
    },
    enabled: allPrograms.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const schedules = useMemo(() => schedulesQuery.data || [], [schedulesQuery.data]);

  const todaysPrograms = useMemo(() => {
    const todayDow = new Date().getDay();
    return allPrograms.filter(p => {
      if (p.schedule_type === 'daily' || !p.schedule_type) return true;

      // Check custom_days array on the program itself (primary source)
      if (p.custom_days && Array.isArray(p.custom_days) && p.custom_days.length > 0) {
        return p.custom_days.some(d => Number(d) === todayDow);
      }

      // Fallback: check program_schedules table (legacy)
      return schedules.some(s => s.program_id === p.id && s.day_of_week === todayDow);
    });
  }, [allPrograms, schedules]);

  const [expandedPrograms, setExpandedPrograms] = useState<Record<string, boolean>>({});

  const expandedInitialized = React.useRef(false);
  useEffect(() => {
    if (todaysPrograms.length > 0 && !expandedInitialized.current) {
      expandedInitialized.current = true;
      setExpandedPrograms({ [todaysPrograms[0].id]: true });
    }
  }, [todaysPrograms]);

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

  const program = todaysPrograms.length > 0 ? todaysPrograms[0] : null;
  const exercises = useMemo(() => {
    const allExercises: Exercise[] = [];
    for (const p of todaysPrograms) {
      if (p.exercises) allExercises.push(...p.exercises);
    }
    return allExercises;
  }, [todaysPrograms]);

  const allExercisesDone = useMemo(() => {
    return exercises.length > 0 && exercises.every(e => {
      const count = todayCounts[e.id] || 0;
      return e.dosage_per_day ? count >= e.dosage_per_day : count > 0;
    });
  }, [exercises, todayCounts]);

  const submissionTitleMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (language !== 'zh_hant' && language !== 'zh_hans') return map;
    for (const ex of exercises) {
      const translated = language === 'zh_hant' ? ex.title_zh_hant : ex.title_zh_hans;
      if (translated) {
        map[ex.title_en] = translated;
      }
    }
    return map;
  }, [exercises, language]);
  const isExpired = program ? new Date(program.expiry_date) < new Date() : false;

  const getCategoryGroupsForProgram = useCallback((programExercises: Exercise[]): CategoryGroup[] => {
    const groupMap = new Map<string, Exercise[]>();
    const orderMap = new Map<string, number>();

    programExercises.forEach((exercise) => {
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
  }, [t]);

  const _categoryGroups = useMemo<CategoryGroup[]>(() => {
    return getCategoryGroupsForProgram(exercises);
  }, [exercises, getCategoryGroupsForProgram]);

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
  const [submissionsExpanded, setSubmissionsExpanded] = useState<boolean>(false);
  const [feedingSkillsExpanded, setFeedingSkillsExpanded] = useState<boolean>(true);

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

  const objectivesQuery = useQuery({
    queryKey: ['programObjectives', todaysPrograms.map(p => p.id).join(',')],
    queryFn: async () => {
      const ids = todaysPrograms.map(p => p.id);
      if (ids.length === 0) return [];
      log('Fetching objectives for programs:', ids);
      const { data, error } = await supabase
        .from('program_objectives')
        .select('*')
        .in('program_id', ids)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) {
        log('Objectives fetch error:', error);
        return [];
      }
      return (data || []) as ProgramObjective[];
    },
    enabled: todaysPrograms.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const objectives = objectivesQuery.data || [];
  const [objectivesExpanded, setObjectivesExpanded] = useState<boolean>(false);

  const holisticObjectivesQuery = useQuery({
    queryKey: ['holisticObjectives', patientId],
    queryFn: async () => {
      if (!patientId) return [];
      log('Fetching holistic objectives for patient:', patientId);
      const { data, error } = await supabase
        .from('holistic_objectives')
        .select('*')
        .eq('patient_id', patientId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) {
        log('Holistic objectives fetch error:', error);
        return [];
      }
      return (data || []) as HolisticObjective[];
    },
    enabled: !!patientId,
    staleTime: 5 * 60 * 1000,
  });

  const holisticObjectives = useMemo(
    () => holisticObjectivesQuery.data || [],
    [holisticObjectivesQuery.data]
  );
  const [holisticExpanded, setHolisticExpanded] = useState<boolean>(false);
  const holisticAnimHeight = useRef(new Animated.Value(0)).current;

  const periodInfo = useMemo(() => {
    const progs = allPrograms;
    if (progs.length === 0) return null;
    const issueDates = progs.map(p => p.issue_date).filter(Boolean).sort();
    const expiryDates = progs.map(p => p.expiry_date).filter(Boolean).sort().reverse();
    const earliestStart = issueDates[0];
    const latestEnd = expiryDates[0];
    if (!earliestStart || !latestEnd) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(earliestStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(latestEnd);
    end.setHours(0, 0, 0, 0);
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const elapsedDays = Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const progress = Math.max(0, Math.min(1, elapsedDays / totalDays));
    const isExpiredPeriod = today.getTime() > end.getTime();
    const notStarted = today.getTime() < start.getTime();
    const daysUntilStart = notStarted ? Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    return {
      startDate: earliestStart,
      endDate: latestEnd,
      totalDays,
      elapsedDays: Math.max(0, Math.min(elapsedDays, totalDays)),
      progress,
      isExpired: isExpiredPeriod,
      notStarted,
      daysUntilStart,
    };
  }, [allPrograms]);

  const toggleHolisticExpanded = useCallback(() => {
    const toValue = holisticExpanded ? 0 : 1;
    setHolisticExpanded(!holisticExpanded);
    Animated.spring(holisticAnimHeight, {
      toValue,
      useNativeDriver: false,
      friction: 12,
      tension: 80,
    }).start();
  }, [holisticExpanded, holisticAnimHeight]);

  const [showRecommendation, setShowRecommendation] = useState(false);
  const { drawQueue, drawModalVisible, consumeDrawFromQueue, dismissDrawModal, refreshPatient: refreshPatientCtx } = useApp();

  const recommendations = useMemo(() => {
    if (exercises.length === 0) return [];
    const recs: { exercise: Exercise; reason: string; count: number; target: number }[] = [];
    for (const ex of exercises) {
      const count = todayCounts[ex.id] || 0;
      const target = ex.dosage_per_day ?? 1;
      if (count === 0) {
        recs.push({ exercise: ex, reason: 'notStartedToday', count, target });
      } else if (ex.dosage_per_day && count < ex.dosage_per_day) {
        recs.push({ exercise: ex, reason: 'belowTarget', count, target });
      }
    }
    recs.sort((a, b) => {
      if (a.count === 0 && b.count > 0) return -1;
      if (a.count > 0 && b.count === 0) return 1;
      const aRatio = a.target > 0 ? a.count / a.target : 1;
      const bRatio = b.target > 0 ? b.count / b.target : 1;
      return aRatio - bRatio;
    });
    return recs;
  }, [exercises, todayCounts]);

  const feedingSkillsQuery = useQuery({
    queryKey: ['feedingSkillAssignments', patientId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('feeding_skill_assignments')
        .select('*, feeding_skill_videos(*)')
        .eq('patient_id', patientId!)
        .eq('is_active', true)
        .lte('start_date', today)
        .gte('end_date', today);
      if (error) {
        log('Feeding skills fetch error:', error);
        return [];
      }
      return (data || []) as FeedingSkillAssignment[];
    },
    enabled: !!patientId,
    staleTime: 5 * 60 * 1000,
  });

  const feedingSkills = feedingSkillsQuery.data || [];

  const feedingReviewReqQuery = useQuery({
    queryKey: ['feedingReviewRequirements', patientId],
    queryFn: () => fetchAllFeedingReviewRequirements(patientId!),
    enabled: !!patientId,
    staleTime: 2 * 60 * 1000,
  });

  const feedingTodaySubsQuery = useQuery({
    queryKey: ['feedingTodaySubmissions', patientId],
    queryFn: () => fetchTodayFeedingSubmissions(patientId!),
    enabled: !!patientId,
    staleTime: 30 * 1000,
  });

  const feedingReviewRequirements = feedingReviewReqQuery.data || [];
  const feedingTodaySubmissions = feedingTodaySubsQuery.data || {};

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

  const rewardsQuery = useQuery({
    queryKey: ['patientRewards', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('stars_total, stars_available, fires_total, fires_available')
        .eq('id', patientId!)
        .single();
      if (error) throw error;
      return data || { stars_total: 0, stars_available: 0, fires_total: 0, fires_available: 0 };
    },
    enabled: !!patientId,
    staleTime: 30 * 1000,
  });

  const { refetch: refetchObjectives } = objectivesQuery;
  const { refetch: refetchHolisticObjectives } = holisticObjectivesQuery;
  const { refetch: refetchProgram } = programQuery;
  const { refetch: refetchSchedules } = schedulesQuery;
  const { refetch: refetchLogs } = todayLogsQuery;
  const { refetch: refetchAllLogs } = allLogsQuery;
  const { refetch: refetchSubmissions } = submissionsQuery;
  const { refetch: refetchReviewReqs } = reviewReqQuery;
  const { refetch: refetchTodaySubs } = todaySubsQuery;
  const { refetch: refetchFeedingSkills } = feedingSkillsQuery;
  const { refetch: refetchFeedingReviewReqs } = feedingReviewReqQuery;
  const { refetch: refetchFeedingTodaySubs } = feedingTodaySubsQuery;
  const { refetch: refetchRewards } = rewardsQuery;

  const onRefresh = useCallback(() => {
    void refetchProgram();
    void refetchSchedules();
    void refetchLogs();
    void refetchAllLogs();
    void refetchSubmissions();
    void refetchReviewReqs();
    void refetchTodaySubs();
    void refetchFeedingSkills();
    void refetchFeedingReviewReqs();
    void refetchFeedingTodaySubs();
    void refetchObjectives();
    void refetchHolisticObjectives();
    void refetchRewards();
    void notificationsQuery.refetch();
  }, [refetchProgram, refetchSchedules, refetchLogs, refetchAllLogs, refetchSubmissions, refetchReviewReqs, refetchTodaySubs, refetchFeedingSkills, refetchFeedingReviewReqs, refetchFeedingTodaySubs, refetchObjectives, refetchHolisticObjectives, refetchRewards, notificationsQuery]);

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

  if (programQuery.isError) {
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

  const getProgramName = (p: ExerciseProgram): string => {
    const lang = language || 'en';
    if (lang === 'zh_hant') return p.name_zh_hant || p.name_en || t('exercises');
    if (lang === 'zh_hans') return p.name_zh_hans || p.name_en || t('exercises');
    return p.name_en || t('exercises');
  };

  const getScheduleLabel = (p: ExerciseProgram): string => {
    if (p.schedule_type === 'daily' || !p.schedule_type) return t('everyDay');

    const dayKeys = ['sunShort', 'monShort', 'tueShort', 'wedShort', 'thuShort', 'friShort', 'satShort'];

    if (p.custom_days && Array.isArray(p.custom_days) && p.custom_days.length > 0) {
      const days = p.custom_days.map(d => t(dayKeys[Number(d)])).join(', ');
      return days || t('customSchedule');
    }

    const programSchedules = schedules.filter(s => s.program_id === p.id);
    const days = programSchedules.map(s => t(dayKeys[s.day_of_week])).join(', ');
    return days || t('customSchedule');
  };

  const toggleProgramExpanded = (programId: string) => {
    setExpandedPrograms(prev => ({ ...prev, [programId]: !prev[programId] }));
  };

  const handleDoAllInProgram = (programExercises: Exercise[]) => {
    if (programExercises.length === 0) return;
    const ids = programExercises.map(e => e.id);
    router.push({
      pathname: '/home/exercise',
      params: {
        exerciseId: ids[0],
        allExerciseIds: JSON.stringify(ids),
        currentIndex: '0',
      },
    });
  };

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
              <TherapistImage type="cartoon" style={styles.welcomeAvatar} />
            </View>
          </View>

          {notificationsQuery.data && notificationsQuery.data.length > 0 && (
            <View style={styles.notificationsSection}>
              {notificationsQuery.data.map((notif: any) => {
                const title = language === 'zh_hant' ? (notif.title_zh || notif.title_en) :
                              language === 'zh_hans' ? (notif.title_zh || notif.title_en) :
                              notif.title_en;
                const body = language === 'zh_hant' ? (notif.body_zh || notif.body_en) :
                             language === 'zh_hans' ? (notif.body_zh || notif.body_en) :
                             notif.body_en;

                const typeColors: Record<string, string> = {
                  announcement: '#3B82F6',
                  festive: '#F59E0B',
                  poster: '#8B5CF6',
                  video: '#EC4899',
                  link: '#06B6D4',
                  info: '#6B7280',
                };
                const borderColor = typeColors[notif.type] || '#6B7280';

                return (
                  <TouchableOpacity
                    key={notif.id}
                    style={[styles.notificationCard, { borderLeftColor: borderColor }]}
                    activeOpacity={notif.link_url ? 0.7 : 1}
                    onPress={() => {
                      if (notif.link_url) {
                        Linking.openURL(notif.link_url).catch(() => {});
                      }
                    }}
                  >
                    <View style={styles.notificationHeader}>
                      <Bell size={14} color={borderColor} />
                      <ScaledText size={14} weight="700" color={Colors.textPrimary} style={{ flex: 1 }}>
                        {title}
                      </ScaledText>
                    </View>
                    {body ? (
                      <ScaledText size={13} color={Colors.textSecondary} style={styles.notificationBody}>
                        {body}
                      </ScaledText>
                    ) : null}
                    {notif.image_url ? (
                      <View style={styles.notificationImageContainer}>
                        <Image
                          source={{ uri: notif.image_url }}
                          style={styles.notificationImage}
                          resizeMode="cover"
                        />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {(starInfo.totalStars > 0 || starInfo.currentStreak > 0 || periodInfo) && (
            <View style={styles.starSummaryCard}>
              {periodInfo && (
                <View style={styles.periodSection}>
                  <View style={styles.periodTopRow}>
                    <CalendarDays size={14} color={periodInfo.isExpired ? '#DC2626' : periodInfo.notStarted ? '#F59E0B' : '#5b8a72'} />
                    <ScaledText size={12} weight="600" color={periodInfo.isExpired ? '#DC2626' : periodInfo.notStarted ? '#F59E0B' : Colors.textPrimary}>
                      {(() => {
                        const fmt = (d: string) => {
                          const date = new Date(d);
                          const lang = language || 'en';
                          if (lang === 'zh_hant' || lang === 'zh_hans') {
                            return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
                          }
                          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        };
                        return `${fmt(periodInfo.startDate)} – ${fmt(periodInfo.endDate)}`;
                      })()}
                    </ScaledText>
                    {periodInfo.isExpired && (
                      <View style={styles.periodExpiredBadge}>
                        <ScaledText size={10} weight="700" color="#DC2626">{t('periodExpired')}</ScaledText>
                      </View>
                    )}
                    {periodInfo.notStarted && (
                      <View style={styles.periodNotStartedBadge}>
                        <ScaledText size={10} weight="700" color="#F59E0B">{t('startsInXDays')} {periodInfo.daysUntilStart} {t('daysUnit')}</ScaledText>
                      </View>
                    )}
                  </View>
                  <View style={styles.periodBarBg}>
                    <View style={[styles.periodBarFill, { width: `${Math.round(periodInfo.progress * 100)}%`, backgroundColor: periodInfo.isExpired ? '#DC2626' : '#5b8a72' }]} />
                  </View>
                  {!periodInfo.notStarted && !periodInfo.isExpired && (
                    <ScaledText size={10} color={Colors.textSecondary}>
                      {language === 'zh_hant' || language === 'zh_hans'
                        ? `${t('dayXofY')} ${periodInfo.elapsedDays} ${t('ofDays')} ${periodInfo.totalDays} ${t('daysUnit')}`
                        : `${t('dayXofY')} ${periodInfo.elapsedDays} ${t('ofDays')} ${periodInfo.totalDays}`}
                    </ScaledText>
                  )}
                </View>
              )}
              <View style={styles.starSummaryRow}>
                <View style={styles.starSummaryItem}>
                  <Star size={20} color="#FFB800" fill="#FFB800" />
                  <ScaledText size={22} weight="bold" color="#B8860B">
                    {rewardsQuery.data?.stars_total ?? starInfo.totalStars}
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

              {holisticObjectives.length > 0 && (
                <View style={styles.holisticSection}>
                  <TouchableOpacity
                    style={styles.holisticToggle}
                    onPress={toggleHolisticExpanded}
                    activeOpacity={0.7}
                    testID="holistic-objectives-toggle"
                  >
                    <View style={styles.holisticToggleLeft}>
                      <Target size={15} color="#10B981" />
                      <ScaledText size={13} weight="700" color="#10B981">
                        {t('trainingObjectives')}
                      </ScaledText>
                    </View>
                    <View style={styles.holisticToggleRight}>
                      <View style={styles.holisticCountBadge}>
                        <ScaledText size={10} weight="700" color="#10B981">
                          {holisticObjectives.length} {t('goalsCount')}
                        </ScaledText>
                      </View>
                      {holisticExpanded ? (
                        <ChevronUp size={16} color="#10B981" />
                      ) : (
                        <ChevronDown size={16} color="#10B981" />
                      )}
                    </View>
                  </TouchableOpacity>

                  <Animated.View
                    style={[
                      styles.holisticListWrap,
                      {
                        maxHeight: holisticAnimHeight.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 220],
                        }),
                        opacity: holisticAnimHeight.interpolate({
                          inputRange: [0, 0.3, 1],
                          outputRange: [0, 0.5, 1],
                        }),
                      },
                    ]}
                  >
                    <ScrollView
                      style={styles.holisticScroll}
                      showsVerticalScrollIndicator={false}
                      nestedScrollEnabled
                    >
                      {holisticObjectives.map((obj: HolisticObjective) => {
                        const lang = language || 'en';
                        const text = lang === 'zh_hant'
                          ? (obj.objective_zh_hant || obj.objective_en)
                          : lang === 'zh_hans'
                            ? (obj.objective_zh_hans || obj.objective_en)
                            : obj.objective_en;
                        return (
                          <View key={obj.id} style={styles.holisticItem}>
                            <View style={styles.holisticCheckIcon}>
                              <View style={styles.holisticCircle} />
                            </View>
                            <View style={styles.holisticItemContent}>
                              <ScaledText size={13} color={Colors.textPrimary} style={styles.holisticItemText}>
                                {text}
                              </ScaledText>
                            </View>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </Animated.View>
                </View>
              )}
            </View>
          )}

          {todaysPrograms.length === 0 && allPrograms.length > 0 && (
            <View style={styles.restDayCard}>
              <ScaledText size={48} style={{ textAlign: 'center' as const, marginBottom: 12 }}>{'\u2615'}</ScaledText>
              <ScaledText size={18} weight="bold" color={Colors.textPrimary} style={{ textAlign: 'center' as const, marginBottom: 8 }}>
                {t('noExercisesToday')}
              </ScaledText>
              <ScaledText size={14} color={Colors.textSecondary} style={{ textAlign: 'center' as const, lineHeight: 20 }}>
                {t('keepPracticing')}
              </ScaledText>
            </View>
          )}

          {todaysPrograms.length === 0 && allPrograms.length === 0 && !programQuery.isLoading && (
            <View style={styles.emptyCard}>
              <AlertTriangle size={36} color={Colors.secondary} />
              <ScaledText size={15} color={Colors.textSecondary} style={{ marginTop: 12 }}>
                {t('noExercises')}
              </ScaledText>
            </View>
          )}

          {todaysPrograms.length > 0 && exercises.length > 0 && !isExpired && (
            <TouchableOpacity
              style={[styles.doAllButton, allExercisesDone && styles.doAllButtonDone]}
              onPress={handleDoAll}
              activeOpacity={0.8}
              accessibilityLabel={allExercisesDone ? t('allComplete') : t('doAllExercises')}
              accessibilityRole="button"
            >
              {allExercisesDone ? (
                <CheckCircle2 size={22} color={Colors.white} />
              ) : (
                <Play size={22} color={Colors.white} />
              )}
              <ScaledText size={18} weight="bold" color={Colors.white} style={styles.doAllText}>
                {allExercisesDone ? t('allComplete') : t('doAllExercises')}
              </ScaledText>
            </TouchableOpacity>
          )}

          {todaysPrograms.length > 0 && (
            <View style={styles.exercisesSection}>
              <View style={styles.sectionDivider}>
                <View style={[styles.sectionDividerLine, { backgroundColor: Colors.primary }]} />
                <View style={[styles.sectionDividerDot, { backgroundColor: Colors.primary }]} />
                <View style={[styles.sectionDividerLine, { backgroundColor: Colors.primary }]} />
              </View>
              <View style={[styles.sectionTitleRow, styles.exercisesSectionTitle]}>
                <View style={[styles.sectionIconWrap, { backgroundColor: Colors.primaryLight }]}>
                  <Layers size={18} color={Colors.primary} />
                </View>
                <ScaledText size={18} weight="bold" color={Colors.textPrimary} style={{ flex: 1 }}>
                  {t('exercises')}
                </ScaledText>
                {exercises.length > 0 && !isExpired && (
                  <TouchableOpacity
                    style={styles.assistantButton}
                    onPress={() => {
                      setShowRecommendation(true);
                      if (Platform.OS !== 'web') {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                      void playAssistantOpen();
                    }}
                    activeOpacity={0.7}
                    testID="personal-assistant-button"
                  >
                    <Sparkles size={14} color="#F59E0B" />
                    <ScaledText size={12} weight="600" color="#F59E0B">
                      {t('personalAssistant')}
                    </ScaledText>
                  </TouchableOpacity>
                )}
              </View>

              {todaysPrograms.map((prog) => {
                const progExercises = prog.exercises || [];
                const progExpired = new Date(prog.expiry_date) < new Date();
                const isExpanded = expandedPrograms[prog.id] ?? false;
                const progCategoryGroups = getCategoryGroupsForProgram(progExercises);
                const progCompletedCount = progExercises.filter(e => {
                  const count = todayCounts[e.id] || 0;
                  return e.dosage_per_day ? count >= e.dosage_per_day : count > 0;
                }).length;
                const progObjectives = objectives.filter(o => o.program_id === prog.id);
                const progAccentColor = PROGRAM_ACCENT_COLORS[todaysPrograms.indexOf(prog) % PROGRAM_ACCENT_COLORS.length];

                return (
                  <View key={prog.id} style={styles.programCardSection}>
                    <TouchableOpacity
                      style={[
                        styles.programCardHeader,
                        { borderLeftWidth: 5, borderLeftColor: progAccentColor },
                        progCompletedCount === progExercises.length && progExercises.length > 0 && styles.programCardHeaderDone,
                      ]}
                      onPress={() => toggleProgramExpanded(prog.id)}
                      activeOpacity={0.7}
                      testID={`program-card-${prog.id}`}
                    >
                      <View style={styles.programCardHeaderLeft}>
                        <View style={[styles.programCardIcon, { backgroundColor: progCompletedCount === progExercises.length && progExercises.length > 0 ? Colors.successLight : progAccentColor + '20' }]}>
                          <Layers size={16} color={progCompletedCount === progExercises.length && progExercises.length > 0 ? Colors.success : progAccentColor} />
                        </View>
                        <View style={styles.programCardTitleBlock}>
                          <ScaledText size={15} weight="bold" color={progCompletedCount === progExercises.length && progExercises.length > 0 ? Colors.success : progAccentColor} numberOfLines={2}>
                            {getProgramName(prog)}
                          </ScaledText>
                          <View style={styles.programCardMeta}>
                            <View style={styles.programScheduleBadge}>
                              <CalendarDays size={11} color={Colors.textSecondary} />
                              <ScaledText size={11} color={Colors.textSecondary}>
                                {getScheduleLabel(prog)}
                              </ScaledText>
                            </View>
                            <View style={styles.programExerciseCountBadge}>
                              <ScaledText size={11} weight="600" color={Colors.primary}>
                                {progCompletedCount}/{progExercises.length} {t('programExercises')}
                              </ScaledText>
                            </View>
                          </View>
                        </View>
                      </View>
                      <View style={styles.programCardHeaderRight}>
                        {!progExpired && progExercises.length > 1 && (
                          <TouchableOpacity
                            style={styles.doAllProgramBtn}
                            onPress={() => handleDoAllInProgram(progExercises)}
                            activeOpacity={0.7}
                          >
                            <Play size={11} color={Colors.white} />
                            <ScaledText size={10} weight="600" color={Colors.white}>
                              {t('doAllInProgram')}
                            </ScaledText>
                          </TouchableOpacity>
                        )}
                        {isExpanded ? (
                          <ChevronUp size={20} color={Colors.textSecondary} />
                        ) : (
                          <ChevronDown size={20} color={Colors.textSecondary} />
                        )}
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={[styles.programCardBody, { borderLeftWidth: 3, borderLeftColor: progAccentColor + '30', marginLeft: 2, paddingLeft: 12 }]}>
                        {prog.remarks && (
                          <TouchableOpacity
                            style={styles.programRemarksCard}
                            onPress={() => setRemarksExpanded(!remarksExpanded)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.remarksHeader}>
                              <FileText size={14} color={Colors.secondary} />
                              <ScaledText size={13} weight="600" color={Colors.textPrimary} style={styles.remarksTitle}>
                                {t('remarks')}
                              </ScaledText>
                              <ChevronRight
                                size={14}
                                color={Colors.textSecondary}
                                style={remarksExpanded ? styles.chevronDown : undefined}
                              />
                            </View>
                            {remarksExpanded && (
                              <ScaledText size={13} color={Colors.textSecondary} style={styles.remarksBody}>
                                {prog.remarks}
                              </ScaledText>
                            )}
                          </TouchableOpacity>
                        )}

                        {progObjectives.length > 0 && (
                          <View style={styles.programObjectivesInline}>
                            <TouchableOpacity
                              style={styles.objectivesToggle}
                              onPress={() => setObjectivesExpanded(!objectivesExpanded)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.objectivesToggleLeft}>
                                <Target size={14} color="#8B5CF6" />
                                <ScaledText size={13} weight="600" color="#8B5CF6">
                                  {t('trainingObjectives')}
                                </ScaledText>
                              </View>
                              {objectivesExpanded ? (
                                <ChevronUp size={14} color="#8B5CF6" />
                              ) : (
                                <ChevronDown size={14} color="#8B5CF6" />
                              )}
                            </TouchableOpacity>
                            {objectivesExpanded && (
                              <View style={styles.objectivesList}>
                                {progObjectives.map((obj, idx) => {
                                  const lang = language || 'en';
                                  const text = lang === 'zh_hant'
                                    ? (obj.objective_zh_hant || obj.objective_en)
                                    : lang === 'zh_hans'
                                      ? (obj.objective_zh_hans || obj.objective_en)
                                      : obj.objective_en;
                                  return (
                                    <View key={obj.id} style={styles.objectiveItem}>
                                      <View style={styles.objectiveBullet}>
                                        <ScaledText size={10} weight="bold" color="#8B5CF6">
                                          {idx + 1}
                                        </ScaledText>
                                      </View>
                                      <ScaledText size={13} color={Colors.textPrimary} style={styles.objectiveText}>
                                        {text}
                                      </ScaledText>
                                    </View>
                                  );
                                })}
                              </View>
                            )}
                          </View>
                        )}

                        <View style={styles.programDateRow}>
                          <ScaledText size={11} color={Colors.textSecondary}>
                            {formatDate(prog.issue_date)} - {formatDate(prog.expiry_date)}
                          </ScaledText>
                        </View>

                        {progExpired && (
                          <View style={styles.expiredBannerInline}>
                            <AlertTriangle size={14} color={Colors.error} />
                            <ScaledText size={12} color={Colors.error}>
                              {t('programExpired')}
                            </ScaledText>
                          </View>
                        )}

                          {progCategoryGroups.map((group) => (
                          <CategorySection
                            key={`${prog.id}-${group.category}`}
                            group={group}
                            todayCounts={todayCounts}
                            language={language}
                            t={t}
                            onExercisePress={handleExercisePress}
                            onDoAllInCategory={handleDoAllInCategory}
                            isExpired={progExpired}
                            reviewRequirements={reviewRequirements}
                            todaySubmissions={todaySubmissions}
                          />
                        ))}

                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {feedingSkills.length > 0 && (
            <View style={styles.feedingSkillsSection}>
              <View style={styles.sectionDivider}>
                <View style={[styles.sectionDividerLine, { backgroundColor: '#E67E22' }]} />
                <View style={[styles.sectionDividerDot, { backgroundColor: '#E67E22' }]} />
                <View style={[styles.sectionDividerLine, { backgroundColor: '#E67E22' }]} />
              </View>
              <TouchableOpacity
                style={styles.feedingSkillsHeader}
                onPress={() => setFeedingSkillsExpanded(prev => !prev)}
                activeOpacity={0.7}
              >
                <View style={styles.feedingSkillsHeaderLeft}>
                  <View style={[styles.sectionIconWrap, { backgroundColor: '#FEF3E2' }]}>
                    <UtensilsCrossed size={18} color="#E67E22" />
                  </View>
                  <ScaledText size={18} weight="bold" color={Colors.textPrimary}>
                    {t('feedingSkills')}
                  </ScaledText>
                  <View style={styles.feedingSkillsCountBadge}>
                    <ScaledText size={11} weight="600" color={Colors.white}>
                      {feedingSkills.length}
                    </ScaledText>
                  </View>
                </View>
                {feedingSkillsExpanded ? (
                  <ChevronUp size={20} color={Colors.textSecondary} />
                ) : (
                  <ChevronDown size={20} color={Colors.textSecondary} />
                )}
              </TouchableOpacity>

              {feedingSkillsExpanded && (
                <>
                  {feedingSkills.map((assignment) => {
                    const video = assignment.feeding_skill_videos;
                    if (!video) return null;
                    const lang = language || 'en';
                    const title = (lang === 'zh_hant' || lang === 'zh_hans')
                      ? (video.title_zh || video.title_en)
                      : video.title_en;
                    const isViewed = !!assignment.viewed_at;
                    const feedReq = feedingReviewRequirements.find(r => r.feeding_skill_video_id === assignment.video_id);
                    const feedSubCount = feedingTodaySubmissions[assignment.video_id] || 0;

                    return (
                      <TouchableOpacity
                        key={assignment.id}
                        style={styles.feedingSkillCard}
                        onPress={() => router.push({
                          pathname: '/feeding-skill-player' as any,
                          params: { assignmentId: assignment.id },
                        })}
                        activeOpacity={0.7}
                        testID={`feeding-skill-card-${assignment.id}`}
                      >
                        <View style={styles.feedingSkillCardContent}>
                          <View style={styles.feedingSkillIconWrap}>
                            <Play size={18} color={Colors.white} />
                          </View>
                          <View style={styles.feedingSkillInfo}>
                            <ScaledText size={15} weight="600" color={Colors.textPrimary} numberOfLines={2}>
                              {title}
                            </ScaledText>
                            <View style={styles.feedingSkillMeta}>
                              {video.category && (
                                <View style={styles.feedingSkillCategoryBadge}>
                                  <ScaledText size={10} weight="600" color="#E67E22">
                                    {video.category}
                                  </ScaledText>
                                </View>
                              )}
                              {isViewed && (
                                <View style={styles.feedingSkillViewedBadge}>
                                  <Eye size={10} color={Colors.success} />
                                  <ScaledText size={10} weight="600" color={Colors.success}>
                                    {t('feedingSkillViewed')}
                                  </ScaledText>
                                </View>
                              )}
                            </View>
                            {(() => {
                              if (!feedReq) return null;
                              if (feedSubCount > 0 && feedSubCount >= feedReq.max_submissions) {
                                return (
                                  <View style={styles.reviewBadgeSubmitted}>
                                    <ScaledText size={11} weight="600" color={Colors.success}>
                                      {t('feedingSkillSubmittedToday')}
                                    </ScaledText>
                                  </View>
                                );
                              }
                              if (isFeedingTodayAllowed(feedReq.allowed_days)) {
                                return (
                                  <View style={styles.reviewBadgeRequired}>
                                    <ScaledText size={11} weight="600" color="#2563EB">
                                      {t('feedingSkillVideoRequired')}
                                    </ScaledText>
                                  </View>
                                );
                              }
                              const nextDay = getFeedingNextAllowedDay(feedReq.allowed_days);
                              if (nextDay) {
                                return (
                                  <View style={styles.reviewBadgeNext}>
                                    <ScaledText size={11} weight="600" color={Colors.textSecondary}>
                                      {String(`${t('feedingSkillNextSubmission')}${t(nextDay)}`)}
                                    </ScaledText>
                                  </View>
                                );
                              }
                              return null;
                            })()}
                          </View>
                          <ChevronRight size={20} color={Colors.disabled} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </View>
          )}

          {submissions.length > 0 && (
            <View style={styles.submissionsSection}>
              <View style={styles.sectionDivider}>
                <View style={[styles.sectionDividerLine, { backgroundColor: '#2563EB' }]} />
                <View style={[styles.sectionDividerDot, { backgroundColor: '#2563EB' }]} />
                <View style={[styles.sectionDividerLine, { backgroundColor: '#2563EB' }]} />
              </View>
              <TouchableOpacity
                style={styles.submissionsHeader}
                onPress={() => setSubmissionsExpanded(prev => !prev)}
                activeOpacity={0.7}
              >
                <View style={styles.submissionsHeaderLeft}>
                  <View style={[styles.sectionIconWrap, { backgroundColor: '#EBF5FF' }]}>
                    <Video size={18} color="#2563EB" />
                  </View>
                  <ScaledText size={18} weight="bold" color={Colors.textPrimary}>
                    {t('mySubmissions')}
                  </ScaledText>
                  <View style={styles.submissionsCountBadge}>
                    <ScaledText size={11} weight="600" color={Colors.white}>
                      {submissions.length}
                    </ScaledText>
                  </View>
                </View>
                {submissionsExpanded ? (
                  <ChevronUp size={20} color={Colors.textSecondary} />
                ) : (
                  <ChevronDown size={20} color={Colors.textSecondary} />
                )}
              </TouchableOpacity>

              {submissionsExpanded && (
                <>
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
                            {submissionTitleMap[sub.exercise_title_en] || sub.exercise_title_en}
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
                </>
              )}
            </View>
          )}

          <CopyrightFooter />
        </ScrollView>
      </SafeAreaView>
      <AppTutorial visible={showTutorial} onComplete={handleTutorialComplete} />

      {drawModalVisible && drawQueue.length > 0 && (
        <MarketingDrawModal
          visible={drawModalVisible}
          queue={drawQueue}
          patientId={patientId || ''}
          onClose={dismissDrawModal}
          onDrawConsumed={consumeDrawFromQueue}
          onPrizeClaimed={refreshPatientCtx}
        />
      )}

      <Modal
        visible={showRecommendation}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRecommendation(false)}
      >
        <TouchableOpacity
          style={styles.recommendOverlay}
          activeOpacity={1}
          onPress={() => setShowRecommendation(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.recommendBubble}>
            <View style={styles.recommendBubbleArrowContainer}>
              <View style={styles.recommendBubbleArrow} />
            </View>
            <View style={styles.recommendHeader}>
              <View style={styles.recommendHeaderLeft}>
                <Sparkles size={18} color="#F59E0B" />
                <ScaledText size={16} weight="700" color={Colors.textPrimary}>
                  {t('recommendedExercises')}
                </ScaledText>
              </View>
              <TouchableOpacity
                onPress={() => setShowRecommendation(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScaledText size={13} color={Colors.textSecondary} style={styles.recommendIntro}>
              {t('recommendationIntro')}
            </ScaledText>
            {recommendations.length === 0 ? (
              <View style={styles.recommendEmptyWrap}>
                <ScaledText size={14} color={Colors.success} weight="600">
                  {t('noRecommendations')}
                </ScaledText>
              </View>
            ) : (
              <ScrollView style={styles.recommendList} showsVerticalScrollIndicator={false}>
                {recommendations.map((rec, idx) => (
                  <TouchableOpacity
                    key={rec.exercise.id}
                    style={styles.recommendItem}
                    onPress={() => {
                      setShowRecommendation(false);
                      handleExercisePress(rec.exercise.id);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.recommendItemIndex}>
                      <ScaledText size={12} weight="bold" color={Colors.primary}>
                        {idx + 1}
                      </ScaledText>
                    </View>
                    <View style={styles.recommendItemInfo}>
                      <ScaledText size={14} weight="600" color={Colors.textPrimary} numberOfLines={2}>
                        {getExerciseTitle(rec.exercise, language)}
                      </ScaledText>
                      <View style={styles.recommendItemMeta}>
                        <View style={[
                          styles.recommendReasonBadge,
                          { backgroundColor: rec.count === 0 ? '#FEF3C7' : '#FEE2E2' },
                        ]}>
                          <ScaledText size={10} weight="600" color={rec.count === 0 ? '#D97706' : '#DC2626'}>
                            {t(rec.reason)} ({rec.count}/{rec.target})
                          </ScaledText>
                        </View>
                      </View>
                    </View>
                    <ChevronRight size={16} color={Colors.disabled} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity
              style={styles.recommendCloseBtn}
              onPress={() => setShowRecommendation(false)}
              activeOpacity={0.8}
            >
              <ScaledText size={14} weight="600" color={Colors.white}>
                {t('closeRecommendation')}
              </ScaledText>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  notificationsSection: {
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  notificationCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationBody: {
    marginTop: 6,
    lineHeight: 20,
  },
  notificationImageContainer: {
    marginTop: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  notificationImage: {
    width: '100%',
    height: 160,
    borderRadius: 8,
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
  doAllButtonDone: {
    backgroundColor: Colors.success,
    shadowColor: Colors.success,
  },
  exercisesSection: {
    paddingHorizontal: 20,
  },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  sectionDividerLine: {
    flex: 1,
    height: 1,
    opacity: 0.3,
  },
  sectionDividerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.5,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  exercisesSectionTitle: {
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
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
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
    marginTop: 16,
    marginBottom: 16,
  },
  submissionsHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 12,
  },
  submissionsCountBadge: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 5,
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
    borderLeftWidth: 3,
    borderLeftColor: '#2563EB',
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
  feedingSkillsSection: {
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
  },
  feedingSkillsHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 12,
  },
  feedingSkillsHeaderLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  feedingSkillsCountBadge: {
    backgroundColor: '#E67E22',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 5,
  },
  feedingSkillCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: '#E67E22',
  },
  feedingSkillCardContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  feedingSkillIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E67E22',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  feedingSkillInfo: {
    flex: 1,
    gap: 6,
  },
  feedingSkillMeta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  feedingSkillCategoryBadge: {
    backgroundColor: '#FEF3E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  feedingSkillViewedBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    backgroundColor: Colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  objectivesSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  objectivesToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  objectivesToggleLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  objectivesList: {
    marginTop: 12,
    gap: 10,
  },
  objectiveItem: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
  },
  objectiveBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F3EAFF',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginTop: 1,
  },
  objectiveText: {
    flex: 1,
    lineHeight: 22,
  },
  assistantButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  recommendOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 24,
  },
  recommendBubble: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 20,
    width: '100%' as const,
    maxHeight: '75%' as unknown as number,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  recommendBubbleArrowContainer: {
    alignItems: 'center' as const,
    marginTop: -28,
    marginBottom: 4,
  },
  recommendBubbleArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: Colors.card,
  },
  recommendHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 8,
  },
  recommendHeaderLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  recommendIntro: {
    marginBottom: 14,
    lineHeight: 20,
  },
  recommendEmptyWrap: {
    paddingVertical: 20,
    alignItems: 'center' as const,
  },
  recommendList: {
    maxHeight: 300,
  },
  recommendItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recommendItemIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: 10,
  },
  recommendItemInfo: {
    flex: 1,
    gap: 4,
  },
  recommendItemMeta: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  recommendReasonBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recommendCloseBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center' as const,
    marginTop: 12,
  },
  restDayCard: {
    marginHorizontal: 20,
    backgroundColor: '#F0FAF5',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center' as const,
    borderWidth: 1.5,
    borderColor: '#C8E6D8',
    marginBottom: 16,
  },
  programCardSection: {
    marginBottom: 12,
  },
  programCardHeader: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  programCardHeaderDone: {
    borderColor: Colors.success,
    backgroundColor: Colors.successLight,
  },
  programCardHeaderLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    flex: 1,
  },
  programCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  programCardTitleBlock: {
    flex: 1,
    gap: 4,
  },
  programCardMeta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  programScheduleBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
  },
  programExerciseCountBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  programCardHeaderRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginLeft: 8,
  },
  doAllProgramBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 3,
  },
  programCardBody: {
    paddingTop: 8,
    paddingLeft: 8,
  },

  programRemarksCard: {
    backgroundColor: Colors.secondaryLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  programObjectivesInline: {
    backgroundColor: '#FAFAFE',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F0EEFA',
  },
  programDateRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  expiredBannerInline: {
    backgroundColor: Colors.errorLight,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 10,
    borderRadius: 10,
    gap: 8,
    marginBottom: 8,
  },
  holisticSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E8F5E9',
  },
  holisticToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  holisticToggleLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  holisticToggleRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  holisticCountBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  holisticListWrap: {
    overflow: 'hidden' as const,
  },
  holisticScroll: {
    marginTop: 10,
  },
  holisticItem: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F0',
  },
  holisticItemDimmed: {
    opacity: 0.5,
  },
  holisticCheckIcon: {
    width: 20,
    height: 20,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginTop: 1,
  },
  holisticCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#10B981',
  },
  holisticItemContent: {
    flex: 1,
    gap: 2,
  },
  holisticItemText: {
    lineHeight: 20,
  },
  holisticItemTextDone: {
    textDecorationLine: 'line-through' as const,
  },
  periodSection: {
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE082',
    gap: 6,
  },
  periodTopRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  periodBarBg: {
    height: 4,
    backgroundColor: '#F0EDE5',
    borderRadius: 2,
    overflow: 'hidden' as const,
  },
  periodBarFill: {
    height: 4,
    borderRadius: 2,
  },
  periodExpiredBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  periodNotStartedBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
});
