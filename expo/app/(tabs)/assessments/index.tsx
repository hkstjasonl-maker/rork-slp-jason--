import React, { useCallback, useMemo, useState } from 'react';
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
import { ClipboardCheck, Clock, CheckCircle, ChevronRight, FileText, Stethoscope, User, FlaskConical, Calendar, MessageSquare, Edit3 } from 'lucide-react-native';
import ResearchAssessmentModal from '@/components/ResearchAssessmentModal';
import { log } from '@/lib/logger';
import AssessmentModePicker, { AssessmentViewMode } from '@/components/AssessmentModePicker';

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
  reference: string | null;
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

function getAssessmentReference(submission: ClinicalAssessmentSubmission): string {
  const key = resolveToolKey(submission);
  if (key) return ASSESSMENT_TOOLS[key].reference || '';
  return submission.assessment_library?.reference || '';
}

interface ResearchAssessment {
  id: string;
  patient_id: string;
  assessment_name: string;
  timepoint: string;
  total_score: number | null;
  subscale_scores: Record<string, unknown> | null;
  raw_responses: Record<string, unknown> | null;
  administered_by: string | null;
  administered_date: string | null;
  completion_method: string | null;
  notes: string | null;
  created_at: string;
}

function getTimepointLabel(timepoint: string, t: (key: string) => string): string {
  switch (timepoint) {
    case 'baseline': return t('researchBaseline');
    case 'week4': return t('researchWeek4');
    case 'endpoint': return t('researchEndpoint');
    default: return timepoint;
  }
}

function getTimepointColor(timepoint: string): { bg: string; text: string } {
  switch (timepoint) {
    case 'baseline': return { bg: '#E8F8F0', text: '#1B8A4E' };
    case 'week4': return { bg: '#FFF8E1', text: '#B8860B' };
    case 'endpoint': return { bg: '#FDEDEC', text: '#C0392B' };
    default: return { bg: Colors.border, text: Colors.textSecondary };
  }
}

function getMethodLabel(method: string | null): string {
  switch (method) {
    case 'app_wizard': return 'App (Wizard)';
    case 'app_checklist': return 'App (Checklist)';
    case 'paper': return 'Paper';
    case 'interview': return 'Interview';
    default: return method || '—';
  }
}

function getDirectWizardRoute(toolKey: string, assessmentId: string): string | null {
  const key = (toolKey || assessmentId || '').toLowerCase();
  if (key === 'sus' || key === 'msus' || key.includes('sus')) return '/sus-assessment';
  if (key === 'eat_10' || key === 'eat10' || key.includes('eat')) return '/eat10-assessment';
  if (key === 'fois' || key.includes('fois')) return '/fois-assessment';
  if (key === 'dhi' || key.includes('dhi')) return '/dhi-assessment';
  if (key === 'swal_qol' || key === 'swalqol' || key.includes('swal')) return '/swalqol-assessment';
  if (key === 'coast' || key.includes('coast')) return '/coast-assessment';
  return null;
}

interface PendingNavigation {
  type: 'clinical' | 'questionnaire';
  params: Record<string, string>;
}

export default function AssessmentsScreen() {
  const { t, patientId, language } = useApp();
  const [modePickerVisible, setModePickerVisible] = useState<boolean>(false);
  const [pendingNav, setPendingNav] = useState<PendingNavigation | null>(null);
  const [selectedResearch, setSelectedResearch] = useState<ResearchAssessment | null>(null);
  const [researchModalVisible, setResearchModalVisible] = useState<boolean>(false);

  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const questionnaireQuery = useQuery({
    queryKey: ['assessments', 'all', patientId],
    queryFn: async () => {
      try {
        log('[Assessments] Fetching all questionnaire assignments for:', patientId);
        const { data, error } = await supabase
          .from('questionnaire_assignments')
          .select('*,questionnaire_templates(name,description_en,description_zh_hant,description_zh_hans)')
          .eq('patient_id', patientId!)
          .order('assigned_date', { ascending: false })
          .limit(100);

        if (error) {
          log('[Assessments] Questionnaire fetch error:', error);
          return [];
        }
        log('[Assessments] Questionnaire assignments:', data?.length, 'statuses:', data?.map(d => d.status));
        return (data || []) as QuestionnaireAssignment[];
      } catch (e) {
        log('[Assessments] Questionnaire exception:', e);
        return [];
      }
    },
    enabled: !!patientId,
    staleTime: 2 * 60 * 1000,
  });

  const clinicalQuery = useQuery({
    queryKey: ['clinical_assessments', 'all', patientId],
    queryFn: async () => {
      try {
        log('[Assessments] Fetching all clinical assessments for:', patientId);
        const { data, error } = await supabase
          .from('assessment_submissions')
          .select('*, assessment_library(id, name_en, name_zh, description_en, description_zh, type, key, reference)')
          .eq('patient_id', patientId!)
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) {
          log('[Assessments] Clinical fetch error:', error);
          return [];
        }
        log('[Assessments] Clinical assessments:', data?.length, 'statuses:', data?.map(d => d.status));
        return (data || []) as ClinicalAssessmentSubmission[];
      } catch (e) {
        log('[Assessments] Clinical exception:', e);
        return [];
      }
    },
    enabled: !!patientId,
    staleTime: 2 * 60 * 1000,
  });

  const qData = questionnaireQuery.data;
  const cData = clinicalQuery.data;

  const pendingAssignments = useMemo(() =>
    (qData || []).filter(a => a.status !== 'completed'),
    [qData]
  );
  const completedAssignments = useMemo(() =>
    (qData || []).filter(a => a.status === 'completed'),
    [qData]
  );
  const clinicalPending = useMemo(() =>
    (cData || []).filter(s => s.status !== 'completed'),
    [cData]
  );
  const clinicalCompleted = useMemo(() =>
    (cData || []).filter(s => s.status === 'completed'),
    [cData]
  );

  const isLoading = questionnaireQuery.isLoading || clinicalQuery.isLoading;
  const isFetching = questionnaireQuery.isFetching || clinicalQuery.isFetching;
  const hasError = questionnaireQuery.isError || clinicalQuery.isError;
  const errorMessage = questionnaireQuery.error?.message || clinicalQuery.error?.message || '';

  const totalPendingCount = pendingAssignments.length + clinicalPending.length;
  const totalCompletedCount = completedAssignments.length + clinicalCompleted.length;
  const hasNoData = totalPendingCount === 0 && totalCompletedCount === 0;

  const researchQuery = useQuery({
    queryKey: ['research-assessments', patientId],
    queryFn: async () => {
      try {
        log('[Assessments] Fetching research assessments for:', patientId);
        const { data, error } = await supabase
          .from('research_assessments')
          .select('*')
          .eq('patient_id', patientId!)
          .order('administered_date', { ascending: false });
        if (error) {
          log('[Assessments] Research assessments fetch error:', error);
          return [];
        }
        log('[Assessments] Research assessments:', data?.length);
        return (data || []) as ResearchAssessment[];
      } catch (e) {
        log('[Assessments] Research assessments exception:', e);
        return [];
      }
    },
    enabled: !!patientId,
    staleTime: 2 * 60 * 1000,
  });

  const researchData = researchQuery.data || [];

  const { refetch: rq } = questionnaireQuery;
  const { refetch: rcl } = clinicalQuery;
  const { refetch: rres } = researchQuery;

  const onRefresh = useCallback(() => {
    void rq(); void rcl(); void rres();
  }, [rq, rcl, rres]);

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
          ) : hasError ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <ClipboardCheck size={48} color={Colors.error} />
              </View>
              <Text size={16} color={Colors.error} style={styles.emptyText}>
                {t('error') || 'Error loading assessments'}
              </Text>
              <Text size={13} color={Colors.textSecondary} style={styles.emptyText}>
                {errorMessage}
              </Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={onRefresh}
                activeOpacity={0.7}
              >
                <Text size={14} weight="600" color={Colors.white}>
                  {t('retry') || 'Retry'}
                </Text>
              </TouchableOpacity>
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
                            {getAssessmentReference(submission) ? (
                              <Text size={11} color="#999" style={styles.referenceText} numberOfLines={2}>
                                {getAssessmentReference(submission)}
                              </Text>
                            ) : null}
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
                            log('[Assessments] Opening clinical:', submission.assessment_id, 'toolKey:', toolKey);
                            const wizardRoute = getDirectWizardRoute(toolKey, submission.assessment_id);
                            if (wizardRoute) {
                              router.push({
                                pathname: wizardRoute as any,
                                params: {
                                  submissionId: submission.id,
                                  assessmentId: submission.assessment_id,
                                },
                              });
                              return;
                            }
                            setPendingNav({
                              type: 'clinical',
                              params: {
                                assessmentId: submission.assessment_id,
                                submissionId: submission.id,
                                toolKey: toolKey || '',
                              },
                            });
                            setModePickerVisible(true);
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
                            log('[Assessments] Opening mode picker for questionnaire:', assignment.id);
                            setPendingNav({
                              type: 'questionnaire',
                              params: {
                                assignmentId: assignment.id,
                                templateId: assignment.questionnaire_template_id,
                              },
                            });
                            setModePickerVisible(true);
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
                            {getAssessmentReference(submission) ? (
                              <Text size={11} color="#999" style={styles.referenceText} numberOfLines={1}>
                                {getAssessmentReference(submission)}
                              </Text>
                            ) : null}
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

          <View style={styles.researchSection}>
            <View style={styles.researchSectionHeader}>
              <FlaskConical size={18} color={Colors.primaryDark} />
              <Text size={17} weight="bold" color={Colors.textPrimary}>
                {t('researchAssessments')}
              </Text>
            </View>

            {researchData.length === 0 ? (
              <View style={styles.researchEmptyContainer}>
                <View style={styles.researchEmptyIcon}>
                  <ClipboardCheck size={32} color={Colors.disabled} />
                </View>
                <Text size={14} color={Colors.textSecondary} style={styles.emptyText}>
                  {t('noResearchAssessments')}
                </Text>
              </View>
            ) : (
              researchData.map((item) => {
                const isCompleted = item.total_score !== null && item.total_score !== undefined;
                const tpColor = getTimepointColor(item.timepoint);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.researchCard,
                      isCompleted ? styles.researchCardCompleted : styles.researchCardPending,
                    ]}
                    testID={`research-assessment-${item.id}`}
                    activeOpacity={0.7}
                    onPress={() => {
                      log('[Assessments] Tapped research assessment:', item.id, item.assessment_name);
                      if (!isCompleted) {
                        const nameUpper = item.assessment_name?.toUpperCase() || '';
                        if (nameUpper === 'SUS' || nameUpper.includes('SUS')) {
                          router.push({
                            pathname: '/sus-assessment',
                            params: { researchAssessmentId: item.id },
                          });
                        } else if (nameUpper.includes('EAT-10') || nameUpper === 'EAT10' || nameUpper === 'EAT') {
                          router.push({
                            pathname: '/eat10-assessment',
                            params: { researchAssessmentId: item.id },
                          });
                        } else if (nameUpper.includes('FOIS')) {
                          router.push({
                            pathname: '/fois-assessment',
                            params: { researchAssessmentId: item.id },
                          });
                        } else if (nameUpper.includes('DHI')) {
                          router.push({
                            pathname: '/dhi-assessment',
                            params: { researchAssessmentId: item.id },
                          });
                        } else if (nameUpper.includes('SWAL-QOL') || nameUpper.includes('SWAL') || nameUpper.includes('SWALQOL')) {
                          router.push({
                            pathname: '/swalqol-assessment',
                            params: { researchAssessmentId: item.id },
                          });
                        } else if (nameUpper.includes('COAST')) {
                          router.push({
                            pathname: '/coast-assessment',
                            params: { researchAssessmentId: item.id },
                          });
                        } else {
                          router.push({
                            pathname: '/research-assessment-form',
                            params: {
                              assessmentId: item.id,
                              assessmentName: item.assessment_name,
                              timepoint: item.timepoint,
                            },
                          });
                        }
                      } else {
                        setSelectedResearch(item);
                        setResearchModalVisible(true);
                      }
                    }}
                  >
                    <View style={styles.researchCardHeader}>
                      <Text size={18} weight="bold" color={Colors.textPrimary} numberOfLines={1} style={styles.researchCardName}>
                        {item.assessment_name}
                      </Text>
                      <View style={[styles.timepointBadge, { backgroundColor: tpColor.bg }]}> 
                        <Text size={11} weight="700" color={tpColor.text}>
                          {getTimepointLabel(item.timepoint, t)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.researchCardBody}>
                      <View style={styles.researchMetaRow}>
                        <View style={[styles.statusBadge, isCompleted ? styles.statusCompleted : styles.statusPending]}>
                          {isCompleted ? (
                            <CheckCircle size={12} color={Colors.success} />
                          ) : (
                            <Clock size={12} color="#B8860B" />
                          )}
                          <Text size={12} weight="600" color={isCompleted ? Colors.success : '#B8860B'}>
                            {isCompleted ? t('researchCompleted') : t('researchPending')}
                          </Text>
                        </View>

                        {isCompleted && item.total_score !== null && (
                          <View style={styles.researchScoreBadge}>
                            <Text size={11} color={Colors.textSecondary}>{t('score')}</Text>
                            <Text size={16} weight="bold" color={Colors.primary}>{item.total_score}</Text>
                          </View>
                        )}
                      </View>

                      {item.administered_date && (
                        <View style={styles.researchDetailRow}>
                          <Calendar size={13} color={Colors.textSecondary} />
                          <Text size={13} color={Colors.textSecondary}>
                            {new Date(item.administered_date).toLocaleDateString()}
                          </Text>
                        </View>
                      )}

                      {item.administered_by && (
                        <View style={styles.researchDetailRow}>
                          <User size={13} color={Colors.textSecondary} />
                          <Text size={13} color={Colors.textSecondary}>
                            {t('researchAdministeredBy')}: {item.administered_by}
                          </Text>
                        </View>
                      )}

                      {item.completion_method && (
                        <View style={styles.researchDetailRow}>
                          <FileText size={13} color={Colors.textSecondary} />
                          <Text size={13} color={Colors.textSecondary}>
                            {t('researchCompletionMethod')}: {getMethodLabel(item.completion_method)}
                          </Text>
                        </View>
                      )}

                      {item.notes ? (
                        <View style={styles.researchNotesContainer}>
                          <MessageSquare size={13} color={Colors.textSecondary} />
                          <Text size={12} color={Colors.textSecondary} style={styles.researchNotesText} numberOfLines={3}>
                            {item.notes}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {!isCompleted ? (
                      <View style={styles.researchFillInButton}>
                        <Edit3 size={14} color={Colors.white} />
                        <Text size={14} weight="bold" color={Colors.white}>
                          {isZh ? '填寫 Fill In' : 'Fill In 填寫'}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.researchViewButton}>
                        <Text size={13} weight="600" color={Colors.primary}>
                          {isZh ? '查看詳情 View' : 'View Details 查看'}
                        </Text>
                        <ChevronRight size={16} color={Colors.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          <CopyrightFooter />
        </ScrollView>

      </SafeAreaView>

      <ResearchAssessmentModal
        visible={researchModalVisible}
        assessment={selectedResearch}
        onClose={() => {
          setResearchModalVisible(false);
          setSelectedResearch(null);
        }}
        onNavigateToSUS={(researchId) => {
          router.push({
            pathname: '/sus-assessment',
            params: {
              researchAssessmentId: researchId,
            },
          });
        }}
        onNavigateToEAT10={(researchId) => {
          router.push({
            pathname: '/eat10-assessment',
            params: {
              researchAssessmentId: researchId,
            },
          });
        }}
        patientId={patientId}
        t={t}
        isZh={isZh}
      />

      <AssessmentModePicker
        visible={modePickerVisible}
        onClose={() => {
          setModePickerVisible(false);
          setPendingNav(null);
        }}
        onSelectMode={(mode: AssessmentViewMode) => {
          setModePickerVisible(false);
          if (!pendingNav) return;
          log('[Assessments] Mode selected:', mode, 'nav:', pendingNav.type);
          if (pendingNav.type === 'clinical') {
            router.push({
              pathname: '/clinical-assessment',
              params: { ...pendingNav.params, mode },
            });
          } else {
            router.push({
              pathname: '/questionnaire',
              params: { ...pendingNav.params, mode },
            });
          }
          setPendingNav(null);
        }}
        t={t}
      />
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
  referenceText: {
    fontStyle: 'italic',
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
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  researchSection: {
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  researchSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  researchEmptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  researchEmptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  researchCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primaryDark,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  researchCardPending: {
    borderLeftColor: '#E6A817',
    borderColor: '#FFE082',
  },
  researchCardCompleted: {
    borderLeftColor: Colors.success,
    borderColor: Colors.successLight,
  },
  researchCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  researchCardName: {
    flex: 1,
  },
  timepointBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  researchCardBody: {
    gap: 8,
  },
  researchMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusCompleted: {
    backgroundColor: Colors.successLight,
  },
  statusPending: {
    backgroundColor: '#FFF8E1',
  },
  researchScoreBadge: {
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    minWidth: 50,
  },
  researchDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  researchNotesContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  researchNotesText: {
    flex: 1,
    fontStyle: 'italic',
  },
  researchFillInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E6A817',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 12,
  },
  researchViewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    backgroundColor: Colors.primaryLight,
  },
});
