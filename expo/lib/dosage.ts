import { Exercise, ExerciseLog, Language } from '@/types';

export interface DosageTarget {
  perDay: number | null;
  daysPerWeek: number | null;
}

export function getExerciseDosage(exercise: Exercise, language: Language | null): string {
  const lang = language || 'en';
  switch (lang) {
    case 'zh_hant': return exercise.dosage_zh_hant || exercise.dosage;
    case 'zh_hans': return exercise.dosage_zh_hans || exercise.dosage;
    default: return exercise.dosage;
  }
}

export function parseDosage(exercise: Exercise): DosageTarget {
  return {
    perDay: exercise.dosage_per_day ?? null,
    daysPerWeek: exercise.dosage_days_per_week ?? null,
  };
}

export function getDosageProgressText(
  completedToday: number,
  targetPerDay: number,
  t: (key: string) => string,
): string {
  if (completedToday >= targetPerDay) {
    return `${completedToday}/${targetPerDay} ${t('dosageComplete')}`;
  }
  return `${completedToday}/${targetPerDay} ${t('dosageToday')}`;
}

export function getWeeklyCompletionDays(
  logs: ExerciseLog[],
  exerciseId: string,
): number {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const daysSet = new Set<string>();
  logs.forEach((log) => {
    if (log.exercise_id !== exerciseId) return;
    const logDate = new Date(log.completed_at);
    if (logDate >= weekStart) {
      daysSet.add(logDate.toDateString());
    }
  });

  return daysSet.size;
}

export function getTodayCount(
  logs: ExerciseLog[],
  exerciseId: string,
): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return logs.filter((log) => {
    if (log.exercise_id !== exerciseId) return false;
    return new Date(log.completed_at) >= today;
  }).length;
}
