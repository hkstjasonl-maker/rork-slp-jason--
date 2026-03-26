import { AppState, AppStateStatus, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

let currentSessionId: string | null = null;
let sessionStartTime: Date | null = null;

export async function startSession(patientId: string): Promise<void> {
  try {
    log('[Analytics] Starting session for patient:', patientId);
    sessionStartTime = new Date();

    const { data, error } = await supabase
      .from('app_sessions')
      .insert({
        patient_id: patientId,
        opened_at: sessionStartTime.toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      log('[Analytics] Failed to start session:', error);
      return;
    }

    currentSessionId = data.id;
    log('[Analytics] Session started:', currentSessionId);
  } catch (e) {
    log('[Analytics] Start session error:', e);
  }
}

export async function endSession(): Promise<void> {
  if (!currentSessionId || !sessionStartTime) return;

  try {
    const now = new Date();
    const durationSeconds = Math.round((now.getTime() - sessionStartTime.getTime()) / 1000);

    log('[Analytics] Ending session:', currentSessionId, 'duration:', durationSeconds, 's');

    await supabase
      .from('app_sessions')
      .update({
        closed_at: now.toISOString(),
        duration_seconds: durationSeconds,
      })
      .eq('id', currentSessionId);

    currentSessionId = null;
    sessionStartTime = null;
  } catch (e) {
    log('[Analytics] End session error:', e);
  }
}

export function setupSessionTracking(patientId: string): () => void {
  if (Platform.OS === 'web') {
    startSession(patientId);
    const handleBeforeUnload = () => {
      endSession();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }
    return () => {
      endSession();
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
    };
  }

  startSession(patientId);

  const handleAppStateChange = (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      if (!currentSessionId) {
        startSession(patientId);
      }
    } else if (nextState === 'background') {
      endSession();
    }
  };

  const sub = AppState.addEventListener('change', handleAppStateChange);

  return () => {
    sub.remove();
    endSession();
  };
}

export async function fetchExerciseCompliance(
  patientId: string,
  programId: string,
): Promise<{
  exercises: {
    exercise_id: string;
    title_en: string;
    title_zh_hant: string;
    title_zh_hans: string;
    category: string | null;
    dosage_per_day: number | null;
    dosage_days_per_week: number | null;
    total_completions: number;
    days_with_completions: number;
    program_days: number;
    daily_compliance_rate: number;
    weekly_compliance_rate: number;
    average_self_rating: number | null;
  }[];
  sessionCount: number;
  avgSessionDurationMinutes: number;
  activeDaysTotal: number;
}> {
  log('[Analytics] Fetching compliance for patient:', patientId, 'program:', programId);

  const { data: exercises, error: exError } = await supabase
    .from('exercises')
    .select('id, title_en, title_zh_hant, title_zh_hans, category, dosage_per_day, dosage_days_per_week')
    .eq('program_id', programId);

  if (exError || !exercises) {
    log('[Analytics] Exercises fetch error:', exError);
    return { exercises: [], sessionCount: 0, avgSessionDurationMinutes: 0, activeDaysTotal: 0 };
  }

  const { data: program } = await supabase
    .from('exercise_programs')
    .select('issue_date, expiry_date')
    .eq('id', programId)
    .single();

  const issueDate = program ? new Date(program.issue_date) : new Date();
  const now = new Date();
  const expiryDate = program ? new Date(program.expiry_date) : now;
  const endDate = expiryDate < now ? expiryDate : now;
  const programDays = Math.max(1, Math.ceil((endDate.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24)));
  const programWeeks = Math.max(1, Math.ceil(programDays / 7));

  const { data: logs, error: logError } = await supabase
    .from('exercise_logs')
    .select('exercise_id, completed_at, self_rating')
    .eq('patient_id', patientId)
    .gte('completed_at', issueDate.toISOString());

  if (logError) {
    log('[Analytics] Logs fetch error:', logError);
  }

  const allLogs = logs || [];

  const logsByExercise = new Map<string, { completed_at: string; self_rating: number | null }[]>();
  const allActiveDays = new Set<string>();
  allLogs.forEach((log) => {
    const arr = logsByExercise.get(log.exercise_id) || [];
    arr.push({ completed_at: log.completed_at, self_rating: log.self_rating ?? null });
    logsByExercise.set(log.exercise_id, arr);
    const dateKey = new Date(log.completed_at).toISOString().split('T')[0];
    allActiveDays.add(dateKey);
  });

  const complianceData = exercises.map((ex) => {
    const exLogs = logsByExercise.get(ex.id) || [];
    const totalCompletions = exLogs.length;

    const ratings = exLogs
      .map((l) => l.self_rating)
      .filter((r): r is number => r !== null && r !== undefined);
    const averageSelfRating = ratings.length > 0
      ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
      : null;

    const daysSet = new Set<string>();
    exLogs.forEach((l) => {
      daysSet.add(new Date(l.completed_at).toISOString().split('T')[0]);
    });
    const daysWithCompletions = daysSet.size;

    let dailyComplianceRate = 0;
    if (ex.dosage_per_day && ex.dosage_per_day > 0) {
      const expectedTotal = ex.dosage_per_day * programDays;
      dailyComplianceRate = expectedTotal > 0 ? Math.min(1, totalCompletions / expectedTotal) : 0;
    } else {
      dailyComplianceRate = programDays > 0 ? Math.min(1, daysWithCompletions / programDays) : 0;
    }

    let weeklyComplianceRate = 0;
    if (ex.dosage_days_per_week && ex.dosage_days_per_week > 0) {
      const expectedWeeklyDays = ex.dosage_days_per_week * programWeeks;
      weeklyComplianceRate = expectedWeeklyDays > 0 ? Math.min(1, daysWithCompletions / expectedWeeklyDays) : 0;
    } else {
      weeklyComplianceRate = dailyComplianceRate;
    }

    return {
      exercise_id: ex.id,
      title_en: ex.title_en,
      title_zh_hant: ex.title_zh_hant,
      title_zh_hans: ex.title_zh_hans,
      category: ex.category,
      dosage_per_day: ex.dosage_per_day,
      dosage_days_per_week: ex.dosage_days_per_week,
      total_completions: totalCompletions,
      days_with_completions: daysWithCompletions,
      program_days: programDays,
      daily_compliance_rate: dailyComplianceRate,
      weekly_compliance_rate: weeklyComplianceRate,
      average_self_rating: averageSelfRating,
    };
  });

  const { data: sessions } = await supabase
    .from('app_sessions')
    .select('id, duration_seconds')
    .eq('patient_id', patientId);

  const sessionCount = sessions?.length || 0;
  const totalDuration = (sessions || []).reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
  const avgSessionDurationMinutes = sessionCount > 0 ? Math.round(totalDuration / sessionCount / 60 * 10) / 10 : 0;

  return {
    exercises: complianceData,
    sessionCount,
    avgSessionDurationMinutes,
    activeDaysTotal: allActiveDays.size,
  };
}
