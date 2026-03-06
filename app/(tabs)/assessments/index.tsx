import React, { useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '@/contexts/AppContext';
import { ScaledText as Text } from '@/components/ScaledText';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { Language } from '@/types';
import { ASSESSMENT_TOOLS } from '@/constants/assessments';
import { router } from 'expo-router';
import { ClipboardCheck, Clock, CheckCircle, ChevronRight, FileText, Stethoscope, User } from 'lucide-react-native';
import { log } from '@/lib/logger';

interface QuestionnaireTemplate {
  name: string;
  description_en: string | null;
  description_zh_hant: string | null;
  description_zh_hans: string | null;
}

interface QuestionnaireAssignment {
  id: string;
  patient_id: string;
  questionnaire_template_id: string;
  status: string;
  assigned_date: string;
  due_date: string | null;
  completed_date: string | null;
  score: number | null;
  questionnaire_templates: QuestionnaireTemplate;
}

interface AssessmentLibraryRecord {
  id: string;
  name_en: string | null;
  name_zh: string | null;
  description_en: string | null;
  description_zh: string | null;
  type: string | null;
  key: string | null;
}

interface ClinicalAssessmentSubmission {
  id: string;
  patient_id: string;
  assessment_id: string;
  status: string;
  language: string | null;
  total_score: number | null;
  subscale_scores: Record<string, unknown> | null;
  severity_rating: number | null;
  completed_at: string | null;
  scheduled_date: string | null;
  assigned_at: string | null;
  created_at: string;
  assessment_library?: AssessmentLibraryRecord | null;
}

function getDescription(template: QuestionnaireTemplate, language: Language | null): string {
  const lang = language || 'en';
  switch (lang) {
    case 'zh_hant':
      return template.description_zh_hant || template.description_en || '';
    case 'zh_hans':
      return template.description_zh_hans || template.description_en || '';
    default:
      return template.description_en || '';
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString();
}

function isDueSoon(dueDateStr: string | null): boolean {
  if (!dueDateStr) return false;
  const due = new Date(dueDateStr);
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  const daysLeft = diff / (1000 * 60 * 60 * 24);
  return daysLeft >= 0 && daysLeft <= 3;
}

function isOverdue(dueDateStr: string | null): boolean {
  if (!dueDateStr) return false;
  const due = new Date(dueDateStr);
  const now = new Date();
  return due.getTime() < now.getTime();
}

function resolveToolKey(submission: ClinicalAssessmentSubmission): string {
  const lib = submission.assessment_library;
  if (lib?.key && ASSESSMENT_TOOLS[lib.key]) return lib.key;
  if (ASSESSMENT_TOOLS[submission.assessment_id]) return submission.assessment_id;
  return '';
}

function getAssessmentName(submission: ClinicalAssessmentSubmission, language: Language | null): string {
  const key = resolveToolKey(submission);
  if (key) {
    const tool = ASSESSMENT_TOOLS[key];
    return language === 'zh_hant' || language === 'zh_hans' ? tool.name_zh : tool.name_en;
  }
  const lib = submission.assessment_library;
  if (lib) {
    const name = language === 'zh_hant' || language === 'zh_hans' ? lib.name_zh : lib.name_en;
    return name || lib.name_en || submission.assessment_id;
  }
  return submission.assessment_id;
}

function getAssessmentDescription(submission: ClinicalAssessmentSubmission, language: Language | null): string {
  const key = resolveToolKey(submission);
  if (key) {
    const tool = ASSESSMENT_TOOLS[key];
    return language === 'zh_hant' || language === 'zh_hans' ? tool.description_zh : tool.description_en;
  }
  const lib = submission.assessment_library;
  if (lib) {
    const desc = language === 'zh_hant' || language === 'zh_hans' ? lib.description_zh : lib.description_en;
    return desc || lib.description_en || '';
  }
  return '';
}

function getAssessmentType(submission: ClinicalAssessmentSubmission): string {
  const key = resolveToolKey(submission);
  if (key) return ASSESSMENT_TOOLS[key].type;
  return submission.assessment_library?.type || 'patient_self_report';
}

export default function AssessmentsScreen() {
  const { t, patientId, language } = useApp();

  const pendingQuery = useQuery({
    queryKey: ['assessments', 'pending', patientId],
    queryFn: async () => {
      log('[Assessments] Fetching pending assignments for:', patientId);
      const { data, error } = await supabase
        .from('questionnaire_assignments')
        .select('*,questionnaire_templates(name,description_en,description_zh_hant,description_zh_hans)')
        .eq('patient_id', patientId!)
        .eq('status', 'pending')
        .order('assigned_date', { ascending: false });

      if (error) {
        log('[Assessments] Pending fetch error:', error);
        throw error;
      }
      log('[Assessments] Pending assignments:', data?.length);
      return (data || []) as QuestionnaireAssignment[];
    },
    enabled: !!patientId,
  });

  const completedQuery = useQuery({
    queryKey: ['assessments', 'completed', patientId],
    queryFn: async () => {
      log('[Assessments] Fetching completed assignments for:', patientId);
      const { data, error } = await supabase
        .from('questionnaire_assignments')
        .select('*,questionnaire_templates(name,description_en,description_zh_hant,description_zh_hans)')
        .eq('patient_id', patientId!)
        .eq('status', 'completed')
        .order('completed_date', { ascending: false })
        .limit(50);

      if (error) {
        log('[Assessments] Completed fetch error:', error);
        throw error;
      }
      log('[Assessments] Completed assignments:', data?.length);
      return (data || []) as QuestionnaireAssignment[];
    },
    enabled: !!patientId,
  });

  const clinicalPendingQuery = useQuery({
    queryKey: ['clinical_assessments', 'pending', patientId],
    queryFn: async () => {
      log('[Assessments] Fetching pending clinical assessments for:', patientId);
      const { data, error } = await supabase
        .from('assessment_submissions')
        .select('*, assessment_library(id, name_en, name_zh, description_en, description_zh, type, key)')
        .eq('patient_id', patientId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        log('[Assessments] Clinical pending fetch error:', error);
        throw error;
      }
      log('[Assessments] Clinical pending:', data?.length);
      return (data || []) as ClinicalAssessmentSubmission[];
    },
    enabled: !!patientId,
  });

  const clinicalCompletedQuery = useQuery({
    queryKey: ['clinical_assessments', 'completed', patientId],
    queryFn: async () => {
      log('[Assessments] Fetching completed clinical assessments for:', patientId);
      const { data, error } = await supabase
        .from('assessment_submissions')
        .select('*, assessment_library(id, name_en, name_zh, description_en, description_zh, type, key)')
        .eq('patient_id', patientId!)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(50);

      if (error) {
        log('[Assessments] Clinical completed fetch error:', error);
        throw error;
      }
      log('[Assessments] Clinical completed:', data?.length);
      return (data || []) as ClinicalAssessmentSubmission[];
    },
    enabled: !!patientId,
  });

  const pendingAssignments = pendingQuery.data || [];
  const completedAssignments = completedQuery.data || [];
  const clinicalPending = clinicalPendingQuery.data || [];
  const clinicalCompleted = clinicalCompletedQuery.data || [];

  const isLoading = pendingQuery.isLoading || completedQuery.isLoading || clinicalPendingQuery.isLoading || clinicalCompletedQuery.isLoading;
  const isFetching = pendingQuery.isFetching || completedQuery.isFetching || clinicalPendingQuery.isFetching || clinicalCompletedQuery.isFetching;

  const totalPendingCount = pendingAssignments.length + clinicalPending.length;
  const totalCompletedCount = completedAssignments.length + clinicalCompleted.length;
  const hasNoData = totalPendingCount === 0 && totalCompletedCount === 0;

  const { refetch: rp } = pendingQuery;
  const { refetch: rc } = completedQuery;
  const { refetch: rcp } = clinicalPendingQuery;
  const { refetch: rcc } = clinicalCompletedQuery;

  const onRefresh = useCallback(() => {
    void rp(); void rc(); void rcp(); void rcc();
  }, [rp, rc, rcp, rcc]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.headerSection}>
          <Text size={26} weight="bold" color={Colors.textPrimary}>
            {t('assessments')}
          </Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : hasNoData ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <ClipboardCheck size={48} color={Colors.disabled} />
              </View>
              <Text size={16} color={Colors.textSecondary} style={styles.emptyText}>
                {t('noAssessments')}
              </Text>
            </View>
          ) : (
            <>
              {totalPendingCount > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionHeaderLeft}>
                      <Clock size={18} color={Colors.secondary} />
                      <Text size={17} weight="bold" color={Colors.textPrimary}>
                        {t('pendingAssessments')}
                      </Text>
                    </View>
                    <View style={styles.countBadge}>
                      <Text size={13} weight="bold" color={Colors.white}>
                        {totalPendingCount}
                      </Text>
                    </View>
                  </View>

                  {clinicalPending.map((submission) => {
                    const toolType = getAssessmentType(submission);
                    const isClinician = toolType === 'clinician_rated';
                    const overdue = isOverdue(submission.scheduled_date);
                    const dueSoon = isDueSoon(submission.scheduled_date);
                    return (
                      <View
                        key={`ca-${submission.id}`}
                        style={[
                          styles.card,
                          overdue && styles.cardOverdue,
                          dueSoon && !overdue && styles.cardDueSoon,
                        ]}
                      >
                        <View style={styles.cardTop}>
                          <View style={[styles.cardIconContainer, isClinician && styles.cardIconClinician]}>
                            {isClinician ? (
                              <Stethoscope size={22} color="#B8860B" />
                            ) : (
                              <User size={22} color={Colors.primary} />
                            )}
                          </View>
                          <View style={styles.cardContent}>
                            <Text size={16} weight="bold" color={Colors.textPrimary} numberOfLines={2}>
                              {getAssessmentName(submission, language)}
                            </Text>
                            <Text size={12} color={Colors.textSecondary} numberOfLines={2} style={styles.descriptionText}>
                              {getAssessmentDescription(submission, language)}
                            </Text>
                            <View style={styles.toolTypeBadge}>
                              <Text size={10} weight="600" color={isClinician ? '#B8860B' : Colors.primary}>
                                {isClinician ? t('clinicianRated') : t('selfReport')}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View style={styles.cardMeta}>
                          <View style={styles.metaRow}>
                            <Text size={12} color={Colors.textSecondary}>
                              {formatDate(submission.assigned_at || submission.created_at)}
                            </Text>
                            {submission.scheduled_date && (
                              <View style={[
                                styles.dueBadge,
                                overdue && styles.dueBadgeOverdue,
                                dueSoon && !overdue && styles.dueBadgeSoon,
                              ]}>
                                <Text
                                  size={11}
                                  weight="600"
                                  color={overdue ? Colors.error : dueSoon ? '#B8860B' : Colors.textSecondary}
                                >
                                  {t('dueDate')}: {formatDate(submission.scheduled_date)}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>

                        <TouchableOpacity
                          style={styles.startButton}
                          activeOpacity={0.8}
                          testID={`start-clinical-${submission.id}`}
                          onPress={() => {
                            const toolKey = resolveToolKey(submission);
                            log('[Assessments] Starting clinical assessment:', submission.assessment_id, 'toolKey:', toolKey);
                            router.push({
                              pathname: '/clinical-assessment',
                              params: {
                                assessmentId: submission.assessment_id,
                                submissionId: submission.id,
                                toolKey: toolKey || '',
                              },
                            });
                          }}
                        >
                          <Text size={15} weight="bold" color={Colors.white}>
                            {t('startAssessment')}
                          </Text>
                          <ChevronRight size={18} color={Colors.white} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}

                  {pendingAssignments.map((assignment) => {
                    const overdue = isOverdue(assignment.due_date);
                    const dueSoon = isDueSoon(assignment.due_date);
                    return (
                      <View
                        key={assignment.id}
                        style={[
                          styles.card,
                          overdue && styles.cardOverdue,
                          dueSoon && !overdue && styles.cardDueSoon,
                        ]}
                      >
                        <View style={styles.cardTop}>
                          <View style={styles.cardIconContainer}>
                            <FileText size={22} color={Colors.primary} />
                          </View>
                          <View style={styles.cardContent}>
                            <Text size={16} weight="bold" color={Colors.textPrimary} numberOfLines={2}>
                              {assignment.questionnaire_templates.name}
                            </Text>
                            {getDescription(assignment.questionnaire_templates, language) ? (
                              <Text size={13} color={Colors.textSecondary} numberOfLines={2} style={styles.descriptionText}>
                                {getDescription(assignment.questionnaire_templates, language)}
                              </Text>
                            ) : null}
                          </View>
                        </View>

                        <View style={styles.cardMeta}>
                          <View style={styles.metaRow}>
                            <Text size={12} color={Colors.textSecondary}>
                              {formatDate(assignment.assigned_date)}
                            </Text>
                            {assignment.due_date && (
                              <View style={[
                                styles.dueBadge,
                                overdue && styles.dueBadgeOverdue,
                                dueSoon && !overdue && styles.dueBadgeSoon,
                              ]}>
                                <Text
                                  size={11}
                                  weight="600"
                                  color={overdue ? Colors.error : dueSoon ? '#B8860B' : Colors.textSecondary}
                                >
                                  {t('dueDate')}: {formatDate(assignment.due_date)}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>

                        <TouchableOpacity
                          style={styles.startButton}
                          activeOpacity={0.8}
                          testID={`start-assessment-${assignment.id}`}
                          onPress={() => {
                            log('[Assessments] Starting assessment:', assignment.id, 'template:', assignment.questionnaire_template_id);
                            router.push({
                              pathname: '/questionnaire',
                              params: {
                                assignmentId: assignment.id,
                                templateId: assignment.questionnaire_template_id,
                              },
                            });
                          }}
                        >
                          <Text size={15} weight="bold" color={Colors.white}>
                            {t('startAssessment')}
                          </Text>
                          <ChevronRight size={18} color={Colors.white} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {totalCompletedCount > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionHeaderLeft}>
                      <CheckCircle size={18} color={Colors.success} />
                      <Text size={17} weight="bold" color={Colors.textPrimary}>
                        {t('completedAssessments')}
                      </Text>
                    </View>
                  </View>

                  {clinicalCompleted.map((submission) => {
                    const isClinician = getAssessmentType(submission) === 'clinician_rated';
                    return (
                      <View key={`cc-${submission.id}`} style={styles.completedCard}>
                        <View style={styles.completedCardLeft}>
                          <View style={[styles.completedIconCircle, isClinician && styles.completedIconClinician]}>
                            <CheckCircle size={16} color={isClinician ? '#B8860B' : Colors.success} />
                          </View>
                          <View style={styles.completedCardContent}>
                            <Text size={15} weight="600" color={Colors.textPrimary} numberOfLines={1}>
                              {getAssessmentName(submission, language)}
                            </Text>
                            <View style={styles.completedMeta}>
                              {submission.completed_at && (
                                <Text size={12} color={Colors.textSecondary}>
                                  {t('completedOn')} {formatDate(submission.completed_at)}
                                </Text>
                              )}
                            </View>
                          </View>
                        </View>
                        {submission.total_score !== null && submission.total_score !== undefined && (
                          <View style={styles.scoreBadge}>
                            <Text size={11} color={Colors.textSecondary}>
                              {t('score')}
                            </Text>
                            <Text size={18} weight="bold" color={Colors.primary}>
                              {submission.total_score}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {completedAssignments.map((assignment) => (
                    <View key={assignment.id} style={styles.completedCard}>
                      <View style={styles.completedCardLeft}>
                        <View style={styles.completedIconCircle}>
                          <CheckCircle size={16} color={Colors.success} />
                        </View>
                        <View style={styles.completedCardContent}>
                          <Text size={15} weight="600" color={Colors.textPrimary} numberOfLines={1}>
                            {assignment.questionnaire_templates.name}
                          </Text>
                          <View style={styles.completedMeta}>
                            {assignment.completed_date && (
                              <Text size={12} color={Colors.textSecondary}>
                                {t('completedOn')} {formatDate(assignment.completed_date)}
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>
                      {assignment.score !== null && assignment.score !== undefined && (
                        <View style={styles.scoreBadge}>
                          <Text size={11} color={Colors.textSecondary}>
                            {t('score')}
                          </Text>
                          <Text size={18} weight="bold" color={Colors.primary}>
                            {assignment.score}
                          </Text>
                        </View>
                      )}
                    </View>
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
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.card,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countBadge: {
    backgroundColor: Colors.secondary,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardOverdue: {
    borderColor: Colors.errorLight,
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
  },
  cardDueSoon: {
    borderColor: '#FFE082',
    borderLeftWidth: 4,
    borderLeftColor: '#E6A817',
  },
  cardTop: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  cardIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardIconClinician: {
    backgroundColor: '#FFF8E1',
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  descriptionText: {
    marginTop: 2,
  },
  toolTypeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
    marginTop: 4,
  },
  cardMeta: {
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  dueBadge: {
    backgroundColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dueBadgeOverdue: {
    backgroundColor: Colors.errorLight,
  },
  dueBadgeSoon: {
    backgroundColor: '#FFF8E1',
  },
  startButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  completedCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  completedCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  completedIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.successLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completedIconClinician: {
    backgroundColor: '#FFF8E1',
  },
  completedCardContent: {
    flex: 1,
    gap: 3,
  },
  completedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreBadge: {
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 56,
  },
});
