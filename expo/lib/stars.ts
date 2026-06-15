import { ExerciseLog } from '@/types';

export interface DailyStarResult {
  date: string;
  exercisesDone: number;
  totalExercises: number;
  sessionStars: number;
  streakBonus: number;
}

export interface StarSummary {
  totalStars: number;
  todayStars: number;
  todaySessionStars: number;
  todayStreakBonus: number;
  currentStreak: number;
  longestStreak: number;
  dailyBreakdown: DailyStarResult[];
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTodayKey(): string {
  return getDateKey(new Date().toISOString());
}

export function calculateStars(
  logs: ExerciseLog[],
  totalExercisesInProgram: number,
): StarSummary {
  if (totalExercisesInProgram === 0) {
    return {
      totalStars: 0,
      todayStars: 0,
      todaySessionStars: 0,
      todayStreakBonus: 0,
      currentStreak: 0,
      longestStreak: 0,
      dailyBreakdown: [],
    };
  }

  const dailyExercises = new Map<string, Set<string>>();

  logs.forEach((log) => {
    const key = getDateKey(log.completed_at);
    if (!dailyExercises.has(key)) {
      dailyExercises.set(key, new Set());
    }
    dailyExercises.get(key)!.add(log.exercise_id);
  });

  const sortedDays = Array.from(dailyExercises.keys()).sort();

  const streakAtDay = new Map<string, number>();
  for (let i = 0; i < sortedDays.length; i++) {
    const current = sortedDays[i];
    if (i === 0) {
      streakAtDay.set(current, 1);
      continue;
    }
    const prev = sortedDays[i - 1];
    const currentDate = new Date(current + 'T00:00:00');
    const prevDate = new Date(prev + 'T00:00:00');
    const diffMs = currentDate.getTime() - prevDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      streakAtDay.set(current, (streakAtDay.get(prev) || 0) + 1);
    } else {
      streakAtDay.set(current, 1);
    }
  }

  let totalStars = 0;
  let longestStreak = 0;
  const dailyBreakdown: DailyStarResult[] = [];
  const todayKey = getTodayKey();

  sortedDays.forEach((day) => {
    const uniqueExercises = dailyExercises.get(day)!.size;
    const half = totalExercisesInProgram / 2;
    const streak = streakAtDay.get(day) || 0;

    let sessionStars = 0;
    if (uniqueExercises >= totalExercisesInProgram) {
      sessionStars = 3;
    } else if (uniqueExercises > half) {
      sessionStars = 1;
    }

    let streakBonus = 0;
    if (streak >= 7 && streak % 7 === 0) {
      streakBonus = 2;
    } else if (streak >= 3 && streak % 3 === 0) {
      streakBonus = 1;
    }

    if (streak > longestStreak) {
      longestStreak = streak;
    }

    totalStars += sessionStars + streakBonus;

    dailyBreakdown.push({
      date: day,
      exercisesDone: uniqueExercises,
      totalExercises: totalExercisesInProgram,
      sessionStars,
      streakBonus,
    });
  });

  const todayBreakdown = dailyBreakdown.find((d) => d.date === todayKey);

  const actualCurrentStreak = (() => {
    if (sortedDays.length === 0) return 0;
    const lastDay = sortedDays[sortedDays.length - 1];
    const lastDate = new Date(lastDay + 'T00:00:00');
    const today = new Date(todayKey + 'T00:00:00');
    const diffMs = today.getTime() - lastDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 1) return 0;
    return streakAtDay.get(lastDay) || 0;
  })();

  return {
    totalStars,
    todayStars: todayBreakdown ? todayBreakdown.sessionStars + todayBreakdown.streakBonus : 0,
    todaySessionStars: todayBreakdown?.sessionStars || 0,
    todayStreakBonus: todayBreakdown?.streakBonus || 0,
    currentStreak: actualCurrentStreak,
    longestStreak,
    dailyBreakdown,
  };
}

export interface StarsAndFires {
  totalSessionStars: number;
  totalFires: number;
}

export function calculateStarsAndFires(
  logs: ExerciseLog[],
  totalExercisesInProgram: number,
): StarsAndFires {
  const summary = calculateStars(logs, totalExercisesInProgram);
  const totalSessionStars = summary.dailyBreakdown.reduce((sum, d) => sum + d.sessionStars, 0);
  const totalFires = summary.dailyBreakdown.reduce((sum, d) => sum + d.streakBonus, 0);
  return { totalSessionStars, totalFires };
}

export function getStarsForSession(
  uniqueExercisesToday: number,
  totalExercisesInProgram: number,
): { sessionStars: number; isHalf: boolean; isAll: boolean } {
  if (totalExercisesInProgram === 0) {
    return { sessionStars: 0, isHalf: false, isAll: false };
  }

  const half = totalExercisesInProgram / 2;
  const isAll = uniqueExercisesToday >= totalExercisesInProgram;
  const isHalf = uniqueExercisesToday > half;

  let sessionStars = 0;
  if (isAll) {
    sessionStars = 3;
  } else if (isHalf) {
    sessionStars = 1;
  }

  return { sessionStars, isHalf, isAll };
}
