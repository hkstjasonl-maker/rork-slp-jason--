import React, { useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Video, Clock, Star, AlertTriangle, CheckCircle2, MessageSquare } from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import Colors from '@/constants/colors';
import { fetchPatientSubmissions } from '@/lib/reviewRequirements';
import { ExerciseVideoSubmission, ReviewStatus } from '@/types';

function getStatusColor(status: ReviewStatus): string {
  switch (status) {
    case 'pending': return '#F59E0B';
    case 'reviewed': return Colors.success;
    case 'redo_requested': return Colors.error;
    default: return Colors.textSecondary;
  }
}

function getStatusBgColor(status: ReviewStatus): string {
  switch (status) {
    case 'pending': return '#FEF3C7';
    case 'reviewed': return Colors.successLight;
    case 'redo_requested': return Colors.errorLight;
    default: return Colors.card;
  }
}

function getStatusIcon(status: ReviewStatus) {
  switch (status) {
    case 'pending': return <Clock size={14} color="#F59E0B" />;
    case 'reviewed': return <CheckCircle2 size={14} color={Colors.success} />;
    case 'redo_requested': return <AlertTriangle size={14} color={Colors.error} />;
    default: return null;
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

function renderStars(rating: number) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Star
        key={i}
        size={14}
        color={i <= rating ? '#FFB800' : '#DDD'}
        fill={i <= rating ? '#FFB800' : 'transparent'}
      />
    );
  }
  return stars;
}

export default function MySubmissionsScreen() {
  const router = useRouter();
  const { t, patientId, language } = useApp();

  const submissionsQuery = useQuery({
    queryKey: ['videoSubmissions', patientId],
    queryFn: async () => {
      if (!patientId) return [];
      return fetchPatientSubmissions(patientId);
    },
    enabled: !!patientId,
    staleTime: 30 * 1000,
  });

  useFocusEffect(
    React.useCallback(() => {
      void submissionsQuery.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const submissions = submissionsQuery.data || [];

  const grouped = useMemo(() => {
    const redoRequested: ExerciseVideoSubmission[] = [];
    const pendingItems: ExerciseVideoSubmission[] = [];
    const reviewedItems: ExerciseVideoSubmission[] = [];

    submissions.forEach((s) => {
      switch (s.review_status) {
        case 'redo_requested':
          redoRequested.push(s);
          break;
        case 'pending':
          pendingItems.push(s);
          break;
        case 'reviewed':
          reviewedItems.push(s);
          break;
      }
    });

    return { redoRequested, pendingItems, reviewedItems };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionsQuery.data]);

  if (submissionsQuery.isLoading) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
              <ArrowLeft size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <ScaledText size={17} weight="600" color={Colors.textPrimary}>
                {t('mySubmissions')}
              </ScaledText>
            </View>
            <View style={styles.headerSpacer} />
          </View>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
            <ArrowLeft size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <ScaledText size={17} weight="600" color={Colors.textPrimary}>
              {t('mySubmissions')}
            </ScaledText>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={submissionsQuery.isFetching && !submissionsQuery.isLoading}
              onRefresh={() => submissionsQuery.refetch()}
              tintColor={Colors.primary}
            />
          }
        >
          {submissions.length === 0 ? (
            <View style={styles.emptyState}>
              <Video size={48} color={Colors.disabled} />
              <ScaledText size={16} color={Colors.textSecondary} style={styles.emptyText}>
                {t('noSubmissions')}
              </ScaledText>
            </View>
          ) : (
            <>
              {grouped.redoRequested.length > 0 && (
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionHeader}>
                    <AlertTriangle size={18} color={Colors.error} />
                    <ScaledText size={16} weight="700" color={Colors.error}>
                      {t('redoRequested')}
                    </ScaledText>
                  </View>
                  {grouped.redoRequested.map((sub) => (
                    <SubmissionCard key={sub.id} submission={sub} t={t} language={language} />
                  ))}
                </View>
              )}

              {grouped.pendingItems.length > 0 && (
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionHeader}>
                    <Clock size={18} color="#F59E0B" />
                    <ScaledText size={16} weight="700" color="#F59E0B">
                      {t('pending')}
                    </ScaledText>
                  </View>
                  {grouped.pendingItems.map((sub) => (
                    <SubmissionCard key={sub.id} submission={sub} t={t} language={language} />
                  ))}
                </View>
              )}

              {grouped.reviewedItems.length > 0 && (
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionHeader}>
                    <CheckCircle2 size={18} color={Colors.success} />
                    <ScaledText size={16} weight="700" color={Colors.success}>
                      {t('reviewed')}
                    </ScaledText>
                  </View>
                  {grouped.reviewedItems.map((sub) => (
                    <SubmissionCard key={sub.id} submission={sub} t={t} language={language} />
                  ))}
                </View>
              )}
            </>
          )}

          <CopyrightFooter />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SubmissionCard({
  submission,
  t,
  language,
}: {
  submission: ExerciseVideoSubmission;
  t: (key: string) => string;
  language: string | null;
}) {
  const statusLabel = useMemo(() => {
    switch (submission.review_status) {
      case 'pending': return t('pending');
      case 'reviewed': return t('reviewed');
      case 'redo_requested': return t('redoRequested');
      default: return submission.review_status;
    }
  }, [submission.review_status, t]);

  const isRedo = submission.review_status === 'redo_requested';

  return (
    <View style={[styles.card, isRedo && styles.cardRedo]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Video size={16} color={Colors.primary} />
          <ScaledText size={15} weight="600" color={Colors.textPrimary} numberOfLines={2} style={styles.cardTitle}>
            {submission.exercise_title_en}
          </ScaledText>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusBgColor(submission.review_status) }]}>
          {getStatusIcon(submission.review_status)}
          <ScaledText size={11} weight="600" color={getStatusColor(submission.review_status)}>
            {String(statusLabel)}
          </ScaledText>
        </View>
      </View>

      <View style={styles.cardMeta}>
        <View style={styles.dateRow}>
          <ScaledText size={11} weight="600" color={Colors.textSecondary}>
            {language === 'zh_hant' || language === 'zh_hans' ? '提交時間：' : 'Submitted: '}
          </ScaledText>
          <ScaledText size={11} color={Colors.textSecondary}>
            {submission.created_at ? new Date(submission.created_at).toLocaleString() : formatDate(submission.submission_date)}
          </ScaledText>
        </View>
        {submission.reviewed_at && (
          <View style={styles.dateRow}>
            <ScaledText size={11} weight="600" color={Colors.primary}>
              {language === 'zh_hant' || language === 'zh_hans' ? '審閱時間：' : 'Reviewed: '}
            </ScaledText>
            <ScaledText size={11} color={Colors.primary}>
              {new Date(submission.reviewed_at).toLocaleString()}
            </ScaledText>
          </View>
        )}
      </View>

      {submission.rating !== null && submission.rating !== undefined && (
        <View style={styles.ratingRow}>
          <ScaledText size={12} weight="600" color={Colors.textSecondary}>
            {t('ratingLabel')}
          </ScaledText>
          <View style={styles.starsRow}>
            {renderStars(submission.rating)}
          </View>
        </View>
      )}

      {submission.reviewer_notes && (
        <View style={[styles.notesBox, isRedo && styles.notesBoxRedo]}>
          <View style={styles.notesHeader}>
            <MessageSquare size={13} color={isRedo ? Colors.error : Colors.primary} />
            <ScaledText size={12} weight="600" color={isRedo ? Colors.error : Colors.primary}>
              {t('clinicianNotes')}
            </ScaledText>
          </View>
          <ScaledText size={13} color={Colors.textPrimary} style={styles.notesText}>
            {submission.reviewer_notes}
          </ScaledText>
        </View>
      )}

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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    textAlign: 'center',
  },
  sectionBlock: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardRedo: {
    borderColor: Colors.error,
    borderWidth: 1.5,
    backgroundColor: '#FFF5F5',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  cardTitle: {
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cardMeta: {
    marginTop: 8,
    gap: 4,
  },
  dateRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  notesBox: {
    marginTop: 10,
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    padding: 12,
  },
  notesBoxRedo: {
    backgroundColor: Colors.errorLight,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  notesText: {
    lineHeight: 20,
  },

});
