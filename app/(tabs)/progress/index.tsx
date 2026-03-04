import React, { useMemo, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import { supabase } from '@/lib/supabase';
import { calculateStars } from '@/lib/stars';
import { fetchExerciseCompliance } from '@/lib/analytics';
import Colors from '@/constants/colors';
import { ExerciseLog, ExerciseProgram, Language } from '@/types';
import { log } from '@/lib/logger';
import { TrendingUp, Calendar, Award, Zap, CheckCircle2, Star, Flame, Trophy, Activity, ClipboardCheck, ThumbsUp, Gauge } from 'lucide-react-native';

function getLogTitle(log: ExerciseLog, language: Language | null): string {
  const lang = language || 'en';
  if (!log.exercises) return '-';
  switch (lang) {
    case 'zh_hant': return log.exercises.title_zh_hant || log.exercises.title_en;
    case 'zh_hans': return log.exercises.title_zh_hans || log.exercises.title_en;
    default: return log.exercises.title_en;
  }
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString();
}

function formatTimeShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function isYesterday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return d.toDateString() === yesterday.toDateString();
}

interface GroupedLogs {
  dateKey: string;
  displayDate: string;
  logs: ExerciseLog[];
}

export default function ProgressScreen() {
  const { t, patientId, language } = useApp();

  const programQuery = useQuery({
    queryKey: ['program', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercise_programs')
        .select('*, exercises(*)')
        .eq('patient_id', patientId!)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error) throw error;
      return data as ExerciseProgram;
    },
    enabled: !!patientId,
  });

  const totalExercises = useMemo(() => {
    return programQuery.data?.exercises?.length || 0;
  }, [programQuery.data]);

  const logsQuery = useQuery({
    queryKey: ['exerciseLogs', patientId],
    queryFn: async () => {
      log('Fetching exercise logs for patient:', patientId);
      const { data, error } = await supabase
        .from('exercise_logs')
        .select('id, patient_id, exercise_id, completed_at, self_rating, exercises(title_en, title_zh_hant, title_zh_hans)')
        .eq('patient_id', patientId!)
        .order('completed_at', { ascending: false })
        .limit(200);

      if (error) {
        log('Exercise logs fetch error:', error);
        throw error;
      }
      return (data || []).map((d: any) => ({
        ...d,
        exercises: Array.isArray(d.exercises) ? d.exercises[0] : d.exercises,
      })) as ExerciseLog[];
    },
    enabled: !!patientId,
  });

  const programId = programQuery.data?.id;

  const complianceQuery = useQuery({
    queryKey: ['compliance', patientId, programId],
    queryFn: async () => {
      return fetchExerciseCompliance(patientId!, programId!);
    },
    enabled: !!patientId && !!programId,
  });

  const overallCompliance = useMemo(() => {
    const exercises = complianceQuery.data?.exercises || [];
    if (exercises.length === 0) return 0;
    const sum = exercises.reduce((acc, e) => acc + e.daily_compliance_rate, 0);
    return Math.round((sum / exercises.length) * 100);
  }, [complianceQuery.data]);

  const getComplianceColor = useCallback((rate: number): string => {
    if (rate >= 80) return Colors.success;
    if (rate >= 50) return '#E6A817';
    return Colors.error;
  }, []);

  const getComplianceLabel = useCallback((rate: number): string => {
    if (rate >= 80) return t('excellent');
    if (rate >= 50) return t('good');
    return t('needsImprovement');
  }, [t]);

  const stats = useMemo(() => {
    const logs = logsQuery.data || [];
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    let todayCount = 0;
    let weekCount = 0;
    const weekDays = new Set<string>();

    logs.forEach((log) => {
      const logDate = new Date(log.completed_at);
      if (logDate >= todayStart) todayCount++;
      if (logDate >= weekStart) {
        weekCount++;
        weekDays.add(logDate.toDateString());
      }
    });

    return {
      today: todayCount,
      week: weekCount,
      allTime: logs.length,
      activeDaysThisWeek: weekDays.size,
    };
  }, [logsQuery.data]);

  const starSummary = useMemo(() => {
    const logs = logsQuery.data || [];
    return calculateStars(logs, totalExercises);
  }, [logsQuery.data, totalExercises]);

  const groupedLogs = useMemo(() => {
    const logs = logsQuery.data || [];
    const groups: Record<string, GroupedLogs> = {};

    logs.forEach((log) => {
      const key = getDateKey(log.completed_at);
      if (!groups[key]) {
        let displayDate: string;
        if (isToday(log.completed_at)) {
          displayDate = t('today');
        } else if (isYesterday(log.completed_at)) {
          displayDate = language === 'en' ? 'Yesterday' : language === 'zh_hant' ? '昨天' : '昨天';
        } else {
          displayDate = formatDateShort(log.completed_at);
        }
        groups[key] = { dateKey: key, displayDate, logs: [] };
      }
      groups[key].logs.push(log);
    });

    return Object.values(groups).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [logsQuery.data, t, language]);

  const logs = logsQuery.data || [];

  const complianceData = complianceQuery.data;

  const getExComplianceTitle = useCallback((ex: { title_en: string; title_zh_hant: string; title_zh_hans: string }) => {
    const lang = language || 'en';
    switch (lang) {
      case 'zh_hant': return ex.title_zh_hant || ex.title_en;
      case 'zh_hans': return ex.title_zh_hans || ex.title_en;
      default: return ex.title_en;
    }
  }, [language]);

  const { refetch: refetchLogs } = logsQuery;
  const { refetch: refetchCompliance } = complianceQuery;
  const { refetch: refetchProgram } = programQuery;

  const onRefresh = useCallback(() => {
    refetchLogs();
    refetchCompliance();
    refetchProgram();
  }, [refetchLogs, refetchCompliance, refetchProgram]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.headerSection}>
          <ScaledText size={26} weight="bold" color={Colors.textPrimary}>
            {t('progressTitle')}
          </ScaledText>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={(logsQuery.isFetching || complianceQuery.isFetching) && !logsQuery.isLoading}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        >
          {logsQuery.isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <>
              <View style={styles.starRewardsCard}>
                <View style={styles.starRewardsHeader}>
                  <Star size={22} color="#FFB800" fill="#FFB800" />
                  <ScaledText size={18} weight="bold" color={Colors.textPrimary}>
                    {t('starRewards')}
                  </ScaledText>
                </View>

                <View style={styles.starTotalRow}>
                  <View style={styles.starTotalCircle}>
                    <ScaledText size={32} weight="bold" color="#B8860B">
                      {starSummary.totalStars}
                    </ScaledText>
                    <ScaledText size={11} weight="600" color="#B8860B">
                      {t('totalStars')}
                    </ScaledText>
                  </View>

                  <View style={styles.starDetailsColumn}>
                    <View style={styles.streakRow}>
                      <Flame size={18} color="#FF6B35" />
                      <View style={styles.streakTextCol}>
                        <ScaledText size={14} weight="600" color={Colors.textPrimary}>
                          {starSummary.currentStreak} {t('days')}
                        </ScaledText>
                        <ScaledText size={11} color={Colors.textSecondary}>
                          {t('currentStreak')}
                        </ScaledText>
                      </View>
                    </View>
                    <View style={styles.streakRow}>
                      <Trophy size={18} color={Colors.secondary} />
                      <View style={styles.streakTextCol}>
                        <ScaledText size={14} weight="600" color={Colors.textPrimary}>
                          {starSummary.longestStreak} {t('days')}
                        </ScaledText>
                        <ScaledText size={11} color={Colors.textSecondary}>
                          {t('longestStreak')}
                        </ScaledText>
                      </View>
                    </View>
                  </View>
                </View>

                {starSummary.todayStars > 0 && (
                  <View style={styles.todayStarsBadge}>
                    <ScaledText size={13} weight="600" color="#B8860B">
                      {t('today')}: +{starSummary.todayStars} ⭐
                    </ScaledText>
                  </View>
                )}

                {starSummary.totalStars === 0 && (
                  <ScaledText size={13} color={Colors.textSecondary} style={styles.noStarsText}>
                    {t('noStarsYet')}
                  </ScaledText>
                )}
              </View>

              <View style={styles.statsRow}>
                <View style={[styles.statCard, { backgroundColor: Colors.primaryLight }]}>
                  <Zap size={22} color={Colors.primary} />
                  <ScaledText size={28} weight="bold" color={Colors.primary}>
                    {stats.today}
                  </ScaledText>
                  <ScaledText size={12} color={Colors.textSecondary}>
                    {t('today')}
                  </ScaledText>
                </View>
                <View style={[styles.statCard, { backgroundColor: Colors.secondaryLight }]}>
                  <Calendar size={22} color={Colors.secondary} />
                  <ScaledText size={28} weight="bold" color={Colors.secondary}>
                    {stats.week}
                  </ScaledText>
                  <ScaledText size={12} color={Colors.textSecondary}>
                    {t('thisWeek')}
                  </ScaledText>
                </View>
                <View style={[styles.statCard, { backgroundColor: Colors.successLight }]}>
                  <Award size={22} color={Colors.success} />
                  <ScaledText size={28} weight="bold" color={Colors.success}>
                    {stats.allTime}
                  </ScaledText>
                  <ScaledText size={12} color={Colors.textSecondary}>
                    {t('allTime')}
                  </ScaledText>
                </View>
              </View>

              {stats.activeDaysThisWeek > 0 && (
                <View style={styles.weeklyCard}>
                  <View style={styles.weeklyHeader}>
                    <CheckCircle2 size={18} color={Colors.primary} />
                    <ScaledText size={15} weight="600" color={Colors.textPrimary}>
                      {t('weeklyCompliance')}
                    </ScaledText>
                  </View>
                  <View style={styles.weeklyBarContainer}>
                    <View style={styles.weeklyBarBg}>
                      <View
                        style={[
                          styles.weeklyBarFill,
                          { width: `${Math.min(100, (stats.activeDaysThisWeek / 7) * 100)}%` },
                        ]}
                      />
                    </View>
                    <ScaledText size={13} weight="600" color={Colors.primary}>
                      {stats.activeDaysThisWeek}/7 {t('daysThisWeek')}
                    </ScaledText>
                  </View>
                </View>
              )}

              {complianceData && complianceData.sessionCount > 0 && (
                <View style={styles.usageCard}>
                  <View style={styles.usageCardHeader}>
                    <Activity size={20} color={Colors.primary} />
                    <ScaledText size={17} weight="bold" color={Colors.textPrimary}>
                      {t('usageStats')}
                    </ScaledText>
                  </View>
                  <View style={styles.usageStatsRow}>
                    <View style={styles.usageStatItem}>
                      <ScaledText size={24} weight="bold" color={Colors.primary}>
                        {complianceData.sessionCount}
                      </ScaledText>
                      <ScaledText size={11} color={Colors.textSecondary}>
                        {t('appSessions')}
                      </ScaledText>
                    </View>
                    <View style={styles.usageStatDivider} />
                    <View style={styles.usageStatItem}>
                      <ScaledText size={24} weight="bold" color={Colors.secondary}>
                        {complianceData.avgSessionDurationMinutes}
                      </ScaledText>
                      <ScaledText size={11} color={Colors.textSecondary}>
                        {t('avgDuration')} ({t('minutesShort')})
                      </ScaledText>
                    </View>
                    <View style={styles.usageStatDivider} />
                    <View style={styles.usageStatItem}>
                      <ScaledText size={24} weight="bold" color={Colors.success}>
                        {complianceData.activeDaysTotal}
                      </ScaledText>
                      <ScaledText size={11} color={Colors.textSecondary}>
                        {t('activeDays')}
                      </ScaledText>
                    </View>
                  </View>
                </View>
              )}

              {complianceData && complianceData.exercises.length > 0 && (
                <View style={styles.complianceSection}>
                  <View style={styles.complianceSectionHeader}>
                    <ClipboardCheck size={20} color={Colors.primary} />
                    <ScaledText size={17} weight="bold" color={Colors.textPrimary}>
                      {t('exerciseCompliance')}
                    </ScaledText>
                  </View>

                  <View style={styles.overallComplianceCard}>
                    <View style={styles.overallComplianceCircle}>
                      <ScaledText size={28} weight="bold" color={getComplianceColor(overallCompliance)}>
                        {overallCompliance}%
                      </ScaledText>
                      <ScaledText size={11} weight="600" color={getComplianceColor(overallCompliance)}>
                        {getComplianceLabel(overallCompliance)}
                      </ScaledText>
                    </View>
                    <View style={styles.overallComplianceInfo}>
                      <ScaledText size={15} weight="600" color={Colors.textPrimary}>
                        {t('overallCompliance')}
                      </ScaledText>
                      <View style={styles.overallBarBg}>
                        <View
                          style={[
                            styles.overallBarFill,
                            {
                              width: `${overallCompliance}%`,
                              backgroundColor: getComplianceColor(overallCompliance),
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </View>

                  {complianceData.exercises.map((ex) => {
                    const rate = Math.round(ex.daily_compliance_rate * 100);
                    return (
                      <View key={ex.exercise_id} style={styles.complianceItem}>
                        <View style={styles.complianceItemHeader}>
                          <View style={styles.complianceItemTitleRow}>
                            <ScaledText size={14} weight="600" color={Colors.textPrimary} numberOfLines={2} style={styles.complianceItemTitle}>
                              {getExComplianceTitle(ex)}
                            </ScaledText>
                            <ScaledText size={14} weight="bold" color={getComplianceColor(rate)}>
                              {rate}%
                            </ScaledText>
                          </View>
                          {ex.category && (
                            <ScaledText size={11} color={Colors.textSecondary}>
                              {ex.category}
                            </ScaledText>
                          )}
                        </View>
                        <View style={styles.complianceBarBg}>
                          <View
                            style={[
                              styles.complianceBarFill,
                              {
                                width: `${rate}%`,
                                backgroundColor: getComplianceColor(rate),
                              },
                            ]}
                          />
                        </View>
                        <View style={styles.complianceDetails}>
                          <ScaledText size={11} color={Colors.textSecondary}>
                            {ex.total_completions} {t('timesCompleted')} · {ex.days_with_completions} {t('daysActive')} ({t('outOfDays')} {ex.program_days} {t('days')})
                          </ScaledText>
                          <View style={styles.complianceDetailsBottom}>
                            {ex.dosage_per_day ? (
                              <ScaledText size={11} color={Colors.textSecondary}>
                                {t('prescribed')}: {ex.dosage_per_day}{t('perDay')}
                              </ScaledText>
                            ) : null}
                            {ex.average_self_rating !== null && ex.average_self_rating !== undefined ? (
                              <View style={styles.ratingPill}>
                                <ThumbsUp size={10} color={Colors.primary} />
                                <ScaledText size={11} weight="600" color={Colors.primary}>
                                  {t('averageRating')}: {ex.average_self_rating}/10
                                </ScaledText>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <ScaledText size={18} weight="bold" color={Colors.textPrimary} style={styles.sectionTitle}>
                {t('recentActivity')}
              </ScaledText>

              {logs.length === 0 ? (
                <View style={styles.emptyCard}>
                  <TrendingUp size={40} color={Colors.disabled} />
                  <ScaledText size={15} color={Colors.textSecondary} style={styles.emptyText}>
                    {t('noProgress')}
                  </ScaledText>
                </View>
              ) : (
                groupedLogs.map((group) => (
                  <View key={group.dateKey} style={styles.dateGroup}>
                    <View style={styles.dateHeader}>
                      <ScaledText size={14} weight="600" color={Colors.primary}>
                        {group.displayDate}
                      </ScaledText>
                      <View style={styles.dateBadge}>
                        <ScaledText size={11} weight="600" color={Colors.textSecondary}>
                          {group.logs.length} {t('exercisesCompleted')}
                        </ScaledText>
                      </View>
                    </View>
                    {group.logs.map((log) => (
                      <View key={log.id} style={styles.logItem}>
                        <View style={styles.logDot} />
                        <View style={styles.logContent}>
                          <ScaledText size={15} weight="600" color={Colors.textPrimary} numberOfLines={1}>
                            {getLogTitle(log, language)}
                          </ScaledText>
                          <View style={styles.logMeta}>
                            <ScaledText size={12} color={Colors.textSecondary}>
                              {formatTimeShort(log.completed_at)}
                            </ScaledText>
                            {log.self_rating != null && (
                              <View style={styles.logRatingBadge}>
                                <Gauge size={11} color={Colors.primary} />
                                <ScaledText size={12} weight="600" color={Colors.primary}>
                                  {log.self_rating}/10
                                </ScaledText>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                ))
              )}
            </>
          )}

          <CopyrightFooter />
        </ScrollView>
      </SafeAreaView>
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
  headerSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
  },
  starRewardsCard: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 16,
    backgroundColor: '#FFFDF5',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#FFE082',
    shadowColor: '#FFB800',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  starRewardsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  starTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  starTotalCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFF8E1',
    borderWidth: 3,
    borderColor: '#FFD54F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  starDetailsColumn: {
    flex: 1,
    gap: 12,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  streakTextCol: {
    gap: 1,
  },
  todayStarsBadge: {
    marginTop: 14,
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  noStarsText: {
    marginTop: 10,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  weeklyCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },
  weeklyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  weeklyBarContainer: {
    gap: 6,
  },
  weeklyBarBg: {
    height: 8,
    backgroundColor: Colors.primaryLight,
    borderRadius: 4,
    overflow: 'hidden' as const,
  },
  weeklyBarFill: {
    height: 8,
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  sectionTitle: {
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  emptyCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyText: {
    textAlign: 'center',
  },
  dateGroup: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dateBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  logDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  logContent: {
    flex: 1,
    gap: 3,
  },
  logMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  usageCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  usageCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  usageStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  usageStatItem: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  usageStatDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
  },
  complianceSection: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  complianceSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  overallComplianceCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  overallComplianceCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  overallComplianceInfo: {
    flex: 1,
    gap: 10,
  },
  overallBarBg: {
    height: 10,
    backgroundColor: Colors.border,
    borderRadius: 5,
    overflow: 'hidden' as const,
  },
  overallBarFill: {
    height: 10,
    borderRadius: 5,
  },
  complianceItem: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  complianceItemHeader: {
    marginBottom: 8,
    gap: 2,
  },
  complianceItemTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  complianceItemTitle: {
    flex: 1,
  },
  complianceBarBg: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden' as const,
    marginBottom: 6,
  },
  complianceBarFill: {
    height: 6,
    borderRadius: 3,
  },
  complianceDetails: {
    gap: 2,
  },
  complianceDetailsBottom: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
});
