import React, { useState, useMemo, useCallback, useRef } from 'react';
import AssessmentWizard, { WizardQuestion, WizardAnswerValue } from '@/components/AssessmentWizard';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Alert,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/contexts/AppContext';
import { ScaledText as Text } from '@/components/ScaledText';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { Language } from '@/types';
import {
  ASSESSMENT_TOOLS,
  AssessmentTool,
  ScaleLabel,
  MCASection,
  OHATItem,
  BeckmanStructure,
  BeckmanAdditionalObs,
  AssessmentItem,
  AssessmentDomain,
  FOISItem,
  FDA2Section,
  DToMsDimension,
} from '@/constants/assessments';
import { ArrowLeft, CheckCircle2, Info, ChevronDown, ChevronUp, BookOpen } from 'lucide-react-native';
import { log } from '@/lib/logger';

function txt(en: string, zh: string, language: Language | null): string {
  if (language === 'zh_hant' || language === 'zh_hans') return zh;
  return en;
}

function getScaleLabel(labels: Record<string, ScaleLabel>, value: string, language: Language | null): string {
  const label = labels[value];
  if (!label) return value;
  return language === 'zh_hant' || language === 'zh_hans' ? label.zh : label.en;
}

interface ScoreResult {
  total_score: number | null;
  subscale_scores: Record<string, number | string>;
  severity_rating?: number;
  max_score?: number;
}

function calculateScores(tool: AssessmentTool, answers: Record<string, number | string>): ScoreResult {
  const result: ScoreResult = { total_score: null, subscale_scores: {} };

  switch (tool.scoring_method) {
    case 'summation': {
      let total = 0;
      const items = tool.items || [];
      for (const item of items) {
        total += (answers[String(item.item_number)] as number) ?? 0;
      }
      result.total_score = total;
      result.max_score = tool.total_max ?? 0;
      if (tool.subscales) {
        for (const [key, sub] of Object.entries(tool.subscales)) {
          let subTotal = 0;
          for (const itemNum of sub.items) {
            subTotal += (answers[String(itemNum)] as number) ?? 0;
          }
          result.subscale_scores[key] = subTotal;
        }
      }
      break;
    }
    case 'dhi': {
      let total = 0;
      const items = tool.items || [];
      for (const item of items) {
        total += (answers[String(item.item_number)] as number) ?? 0;
      }
      result.total_score = total;
      result.max_score = 100;
      if (tool.subscales) {
        for (const [key, sub] of Object.entries(tool.subscales)) {
          let subTotal = 0;
          for (const itemNum of sub.items) {
            subTotal += (answers[String(itemNum)] as number) ?? 0;
          }
          result.subscale_scores[key] = subTotal;
        }
      }
      if (answers['severity'] !== undefined) {
        result.severity_rating = answers['severity'] as number;
      }
      break;
    }
    case 'sus_formula': {
      let adjustedSum = 0;
      const items = tool.items || [];
      for (const item of items) {
        const val = (answers[String(item.item_number)] as number) ?? 3;
        if (item.tone === 'positive') {
          adjustedSum += val - 1;
        } else {
          adjustedSum += 5 - val;
        }
      }
      result.total_score = Math.round(adjustedSum * 2.5 * 10) / 10;
      result.max_score = 100;
      break;
    }
    case 'domain_scoring': {
      const domains = tool.domains || [];
      let allDomainScoresSum = 0;
      let domainCount = 0;
      for (const domain of domains) {
        const numItems = domain.items.length;
        let sum = 0;
        for (const item of domain.items) {
          sum += (answers[String(item.item_number)] as number) ?? 1;
        }
        const domainScore = Math.round(((sum - numItems) / (4 * numItems)) * 100 * 10) / 10;
        result.subscale_scores[domain.domain_id] = domainScore;
        allDomainScoresSum += domainScore;
        domainCount++;
      }
      result.total_score = domainCount > 0 ? Math.round((allDomainScoresSum / domainCount) * 10) / 10 : 0;
      result.max_score = 100;
      break;
    }
    case 'single_level': {
      result.total_score = (answers['level'] as number) ?? null;
      result.max_score = 7;
      break;
    }
    case 'coast_scoring': {
      let total = 0;
      const domains = tool.domains || [];
      for (const domain of domains) {
        let domainTotal = 0;
        for (const item of domain.items) {
          domainTotal += (answers[String(item.item_number)] as number) ?? 0;
        }
        result.subscale_scores[domain.domain_id] = domainTotal;
        total += domainTotal;
      }
      result.total_score = total;
      result.max_score = 80;
      break;
    }
    case 'fda2_rating': {
      const sections = tool.fda2_sections || [];
      for (const section of sections) {
        const sectionAnswers: Record<string, string> = {};
        for (const item of section.items) {
          const val = answers[item.item_id];
          if (val !== undefined) {
            sectionAnswers[item.item_id] = val as string;
          }
        }
        result.subscale_scores[`section_${section.section_number}`] = JSON.stringify(sectionAnswers);
      }
      result.total_score = null;
      break;
    }
    case 'dtoms_rating': {
      const dims = tool.dtoms_dimensions || [];
      for (const dim of dims) {
        const val = answers[dim.dimension_id];
        if (val !== undefined) {
          result.subscale_scores[dim.dimension_id] = val as number;
        }
      }
      result.total_score = null;
      break;
    }
    case 'categorical_risk_pathway': {
      const sections = tool.mca_sections || [];
      const oralSection = sections.find(s => s.section_id === 'oral_assessment');
      let oralTotal = 0;
      let hasAnySevere = false;
      if (oralSection) {
        for (const item of oralSection.items) {
          const val = (answers[item.item_id] as number) ?? 0;
          oralTotal += val;
          if (val === 3) hasAnySevere = true;
        }
      }
      const riskSection = sections.find(s => s.section_id === 'risk_screening');
      let riskCount = 0;
      if (riskSection) {
        for (const item of riskSection.items) {
          if (answers[item.item_id] === 'yes') riskCount++;
        }
      }
      let pathway = 'A';
      if (hasAnySevere || oralTotal >= 14) pathway = 'C';
      else if (riskCount >= 2 || oralTotal >= 10) pathway = 'B';
      result.total_score = oralTotal;
      result.max_score = 21;
      result.subscale_scores = {
        risk_factor_count: riskCount,
        oral_assessment_total: oralTotal,
        pathway: pathway,
      };
      break;
    }
    case 'ohat_summation': {
      const ohatItems = tool.ohat_items || [];
      let total = 0;
      for (const item of ohatItems) {
        total += (answers[String(item.item_number)] as number) ?? 0;
      }
      result.total_score = total;
      result.max_score = ohatItems.length * 3;
      break;
    }
    case 'beckman_recording': {
      const structures = tool.beckman_structures || [];
      for (const structure of structures) {
        const structureAnswers: Record<string, number | string> = {};
        for (const area of structure.assessment_areas) {
          for (const item of area.items) {
            if (answers[item.item_id] !== undefined) {
              structureAnswers[item.item_id] = answers[item.item_id];
            }
          }
        }
        result.subscale_scores[structure.structure_id] = JSON.stringify(structureAnswers);
      }
      if (tool.beckman_additional) {
        const addAnswers: Record<string, number | string> = {};
        for (const item of tool.beckman_additional.items) {
          if (answers[item.item_id] !== undefined) {
            addAnswers[item.item_id] = answers[item.item_id];
          }
        }
        result.subscale_scores['functional_observations'] = JSON.stringify(addAnswers);
      }
      result.total_score = null;
      break;
    }
  }

  return result;
}

function getTotalItemCount(tool: AssessmentTool): number {
  if (tool.scoring_method === 'single_level') return 1;
  if (tool.scoring_method === 'fda2_rating') {
    return (tool.fda2_sections || []).reduce((sum, s) => sum + s.items.length, 0);
  }
  if (tool.scoring_method === 'dtoms_rating') {
    return (tool.dtoms_dimensions || []).length;
  }
  if (tool.scoring_method === 'categorical_risk_pathway') {
    return (tool.mca_sections || []).reduce((sum, s) => sum + s.items.length, 0);
  }
  if (tool.scoring_method === 'ohat_summation') {
    return (tool.ohat_items || []).length;
  }
  if (tool.scoring_method === 'beckman_recording') {
    let count = 0;
    for (const s of tool.beckman_structures || []) {
      for (const a of s.assessment_areas) {
        count += a.items.length;
      }
    }
    if (tool.beckman_additional) count += tool.beckman_additional.items.length;
    return count;
  }
  if (tool.domains) {
    return tool.domains.reduce((sum, d) => sum + d.items.length, 0) + (tool.severity_question ? 1 : 0);
  }
  return (tool.items?.length ?? 0) + (tool.severity_question ? 1 : 0);
}

function getAnsweredCount(tool: AssessmentTool, answers: Record<string, number | string>): number {
  if (tool.scoring_method === 'single_level') {
    return answers['level'] !== undefined ? 1 : 0;
  }
  return Object.keys(answers).length;
}

interface AssessmentLibraryRow {
  id: string;
  name_en: string | null;
  name_zh: string | null;
  description_en: string | null;
  description_zh: string | null;
  type: string | null;
  key: string | null;
  items: unknown;
  scoring_config: unknown;
  reference: string | null;
  interpretation_en: string | null;
  interpretation_zh: string | null;
}

function buildDynamicTool(record: AssessmentLibraryRow): AssessmentTool | null {
  log('[ClinicalAssessment] Building dynamic tool from assessment_library:', record.id);
  const base: AssessmentTool = {
    id: record.key || record.id,
    name_en: record.name_en || record.id,
    name_zh: record.name_zh || record.name_en || record.id,
    description_en: record.description_en || '',
    description_zh: record.description_zh || '',
    reference: record.reference || '',
    type: (record.type as 'patient_self_report' | 'clinician_rated') || 'clinician_rated',
    scoring_method: 'summation',
    interpretation_en: record.interpretation_en || undefined,
    interpretation_zh: record.interpretation_zh || undefined,
  };

  const items = record.items;
  const sc = (record.scoring_config || {}) as Record<string, unknown>;

  if (!items || !Array.isArray(items) || items.length === 0) {
    log('[ClinicalAssessment] No items found in assessment_library record');
    return { ...base, items: [] };
  }

  const first = items[0] as Record<string, unknown>;

  if (first.section_id && Array.isArray(first.items)) {
    log('[ClinicalAssessment] Detected MCA-style sections');
    return {
      ...base,
      scoring_method: (sc.scoring_method as string) || 'categorical_risk_pathway',
      mca_sections: items as unknown as MCASection[],
      risk_pathways: sc.risk_pathways as Record<string, { en: string; zh: string }> | undefined,
      total_max: sc.total_max as number | undefined,
    };
  }

  if (first.structure_id && Array.isArray(first.assessment_areas)) {
    log('[ClinicalAssessment] Detected Beckman-style structures');
    return {
      ...base,
      scoring_method: (sc.scoring_method as string) || 'beckman_recording',
      beckman_structures: items as unknown as BeckmanStructure[],
      beckman_additional: sc.beckman_additional as BeckmanAdditionalObs | undefined,
    };
  }

  if (first.category_en && first.scores && first.item_number !== undefined) {
    log('[ClinicalAssessment] Detected OHAT-style items');
    return {
      ...base,
      scoring_method: (sc.scoring_method as string) || 'ohat_summation',
      ohat_items: items as unknown as OHATItem[],
      total_min: sc.total_min as number | undefined,
      total_max: sc.total_max as number | undefined,
    };
  }

  if (first.domain_id && Array.isArray(first.items)) {
    log('[ClinicalAssessment] Detected domain-style items');
    return {
      ...base,
      scoring_method: (sc.scoring_method as string) || 'domain_scoring',
      domains: items as unknown as AssessmentDomain[],
      scale_min: sc.scale_min as number | undefined,
      scale_max: sc.scale_max as number | undefined,
      total_min: sc.total_min as number | undefined,
      total_max: sc.total_max as number | undefined,
    };
  }

  if (first.level !== undefined && first.category_en && first.text_en) {
    log('[ClinicalAssessment] Detected FOIS-style items');
    return {
      ...base,
      scoring_method: (sc.scoring_method as string) || 'single_level',
      fois_items: items as unknown as FOISItem[],
      total_min: sc.total_min as number | undefined,
      total_max: sc.total_max as number | undefined,
    };
  }

  if (first.section_number !== undefined && first.name_en && Array.isArray(first.items)) {
    log('[ClinicalAssessment] Detected FDA2-style sections');
    return {
      ...base,
      scoring_method: (sc.scoring_method as string) || 'fda2_rating',
      fda2_sections: items as unknown as FDA2Section[],
      fda2_scale: sc.fda2_scale as Record<string, ScaleLabel> | undefined,
    };
  }

  if (first.dimension_id && Array.isArray(first.levels)) {
    log('[ClinicalAssessment] Detected DToMs-style dimensions');
    return {
      ...base,
      scoring_method: (sc.scoring_method as string) || 'dtoms_rating',
      dtoms_dimensions: items as unknown as DToMsDimension[],
    };
  }

  if (first.item_number !== undefined && first.text_en) {
    log('[ClinicalAssessment] Detected flat scale items');
    return {
      ...base,
      scoring_method: (sc.scoring_method as string) || 'summation',
      items: items as unknown as AssessmentItem[],
      scale_min: sc.scale_min as number | undefined,
      scale_max: sc.scale_max as number | undefined,
      scale_labels: sc.scale_labels as Record<string, ScaleLabel> | undefined,
      total_min: sc.total_min as number | undefined,
      total_max: sc.total_max as number | undefined,
      subscales: sc.subscales as Record<string, { items: number[]; max: number }> | undefined,
      severity_question: sc.severity_question as { text_en: string; text_zh: string; scale_min: number; scale_max: number } | undefined,
    };
  }

  log('[ClinicalAssessment] Unknown item structure, returning base tool');
  return { ...base, items: [] };
}

function buildWizardQuestions(tool: AssessmentTool, language: Language | null): WizardQuestion[] {
  const isZh = language === 'zh_hant' || language === 'zh_hans';
  const questions: WizardQuestion[] = [];
  let num = 1;

  if (tool.items && tool.items.length > 0) {
    for (const item of tool.items) {
      questions.push({
        id: String(item.item_number),
        number: num++,
        text: isZh ? item.text_zh : item.text_en,
        helperText: item.subscale ? item.subscale : undefined,
      });
    }
  } else if (tool.domains && tool.domains.length > 0) {
    for (const domain of tool.domains) {
      for (const item of domain.items) {
        questions.push({
          id: String(item.item_number),
          number: num++,
          text: isZh ? item.text_zh : item.text_en,
          helperText: isZh ? domain.name_zh : domain.name_en,
          category: domain.name_en,
        });
      }
    }
  } else if (tool.fois_items && tool.fois_items.length > 0) {
    for (const item of tool.fois_items) {
      questions.push({
        id: String(item.level),
        number: num++,
        text: isZh ? item.text_zh : item.text_en,
        helperText: isZh ? item.category_zh : item.category_en,
      });
    }
  } else if (tool.ohat_items && tool.ohat_items.length > 0) {
    for (const item of tool.ohat_items) {
      questions.push({
        id: String(item.item_number),
        number: num++,
        text: isZh ? item.category_zh : item.category_en,
      });
    }
  } else if (tool.mca_sections && tool.mca_sections.length > 0) {
    for (const section of tool.mca_sections) {
      for (const item of section.items) {
        questions.push({
          id: item.item_id,
          number: num++,
          text: isZh ? (item.text_zh || item.text_en || item.item_id) : (item.text_en || item.item_id),
          helperText: isZh ? section.name_zh : section.name_en,
          category: section.name_en,
        });
      }
    }
  } else if (tool.beckman_structures && tool.beckman_structures.length > 0) {
    for (const structure of tool.beckman_structures) {
      for (const area of structure.assessment_areas) {
        for (const item of area.items) {
          questions.push({
            id: item.item_id,
            number: num++,
            text: isZh ? item.text_zh : item.text_en,
            helperText: isZh ? `${structure.name_zh} - ${area.name_zh}` : `${structure.name_en} - ${area.name_en}`,
            category: structure.name_en,
          });
        }
      }
    }
  } else if (tool.fda2_sections && tool.fda2_sections.length > 0) {
    for (const section of tool.fda2_sections) {
      for (const item of section.items) {
        questions.push({
          id: item.item_id,
          number: num++,
          text: isZh ? item.text_zh : item.text_en,
          helperText: isZh ? section.name_zh : section.name_en,
          category: section.name_en,
        });
      }
    }
  } else if (tool.dtoms_dimensions && tool.dtoms_dimensions.length > 0) {
    for (const dim of tool.dtoms_dimensions) {
      questions.push({
        id: dim.dimension_id,
        number: num++,
        text: isZh ? dim.name_zh : dim.name_en,
        helperText: isZh ? dim.description_zh : dim.description_en,
      });
    }
  }

  if (tool.severity_question) {
    questions.push({
      id: 'severity',
      number: num,
      text: isZh ? tool.severity_question.text_zh : tool.severity_question.text_en,
      helperText: `${tool.severity_question.scale_min} - ${tool.severity_question.scale_max}`,
    });
  }

  log('[ClinicalAssessment] buildWizardQuestions produced', questions.length, 'questions for tool:', tool.id);
  return questions;
}

function mapClinicalWizardAnswer(
  tool: AssessmentTool,
  questionId: string,
  answer: WizardAnswerValue
): number | string {
  if (questionId === 'severity' && tool.severity_question) {
    const min = tool.severity_question.scale_min;
    const max = tool.severity_question.scale_max;
    const mid = Math.round((min + max) / 2);
    switch (answer) {
      case 'yes': return max;
      case 'sometimes': return mid;
      case 'no': return min;
      case 'skipped': return min;
      default: return min;
    }
  }

  const scaleMin = tool.scale_min ?? 0;
  const scaleMax = tool.scale_max ?? 4;
  const mid = Math.round((scaleMin + scaleMax) / 2);
  switch (answer) {
    case 'yes': return scaleMax;
    case 'sometimes': return mid;
    case 'no': return scaleMin;
    case 'skipped': return scaleMin;
    default: return scaleMin;
  }
}

export default function ClinicalAssessmentScreen() {
  const params = useLocalSearchParams<{ assessmentId: string; submissionId: string; toolKey?: string; mode?: string }>();
  const assessmentId = Array.isArray(params.assessmentId) ? params.assessmentId[0] : params.assessmentId;
  const submissionId = Array.isArray(params.submissionId) ? params.submissionId[0] : params.submissionId;
  const toolKey = Array.isArray(params.toolKey) ? params.toolKey[0] : params.toolKey;
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  log('[ClinicalAssessment] Params received - mode:', mode, 'assessmentId:', assessmentId, 'toolKey:', toolKey);
  const { t, language, patientId } = useApp();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [showCompletion, setShowCompletion] = useState<boolean>(false);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  const localTool = useMemo(() => {
    if (toolKey && ASSESSMENT_TOOLS[toolKey]) return ASSESSMENT_TOOLS[toolKey];
    if (assessmentId && ASSESSMENT_TOOLS[assessmentId]) return ASSESSMENT_TOOLS[assessmentId];
    return null;
  }, [assessmentId, toolKey]);

  const libraryQuery = useQuery({
    queryKey: ['assessment_library', assessmentId],
    queryFn: async () => {
      log('[ClinicalAssessment] Fetching assessment_library for:', assessmentId);
      const { data, error } = await supabase
        .from('assessment_library')
        .select('id, name_en, name_zh, description_en, description_zh, type, key, items, scoring_config, reference, interpretation_en, interpretation_zh')
        .eq('id', assessmentId!)
        .maybeSingle();

      if (error) {
        log('[ClinicalAssessment] assessment_library fetch error:', error);
        return null;
      }
      log('[ClinicalAssessment] assessment_library record:', data?.id, data?.name_en);
      return data as AssessmentLibraryRow | null;
    },
    enabled: !localTool && !!assessmentId,
  });

  const tool = useMemo(() => {
    if (localTool) return localTool;
    if (libraryQuery.data) {
      const libRecord = libraryQuery.data;
      if (libRecord.key && ASSESSMENT_TOOLS[libRecord.key]) {
        return ASSESSMENT_TOOLS[libRecord.key];
      }
      return buildDynamicTool(libRecord);
    }
    return null;
  }, [localTool, libraryQuery.data]);

  const totalItems = useMemo(() => tool ? getTotalItemCount(tool) : 0, [tool]);
  const answeredCount = useMemo(() => tool ? getAnsweredCount(tool, answers) : 0, [tool, answers]);
  const allAnswered = answeredCount >= totalItems && totalItems > 0;
  const progressPercent = totalItems > 0 ? answeredCount / totalItems : 0;

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!tool || !patientId) throw new Error('Missing data');
      const scores = calculateScores(tool, answers);
      log('[ClinicalAssessment] Submitting. Scores:', scores);

      const langCode = language === 'zh_hant' || language === 'zh_hans' ? 'zh' : 'en';

      if (submissionId) {
        const { error } = await supabase
          .from('assessment_submissions')
          .update({
            responses: JSON.stringify(answers),
            subscale_scores: JSON.stringify(scores.subscale_scores),
            total_score: scores.total_score,
            severity_rating: scores.severity_rating ?? null,
            language: langCode,
            status: 'completed',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', submissionId);

        if (error) {
          log('[ClinicalAssessment] Update error:', error);
          throw error;
        }
      } else {
        const { error } = await supabase
          .from('assessment_submissions')
          .insert({
            patient_id: patientId,
            assessment_id: assessmentId,
            language: langCode,
            responses: JSON.stringify(answers),
            subscale_scores: JSON.stringify(scores.subscale_scores),
            total_score: scores.total_score,
            severity_rating: scores.severity_rating ?? null,
            status: 'completed',
            completed_at: new Date().toISOString(),
          });

        if (error) {
          log('[ClinicalAssessment] Insert error:', error);
          throw error;
        }
      }

      return scores;
    },
    onSuccess: (scores) => {
      log('[ClinicalAssessment] Success:', scores);
      setScoreResult(scores);
      setShowCompletion(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
      void queryClient.invalidateQueries({ queryKey: ['clinical_assessments'] });
      void queryClient.invalidateQueries({ queryKey: ['assessments'] });
    },
    onError: (error) => {
      log('[ClinicalAssessment] Submit error:', error);
      Alert.alert('Error', 'Failed to submit assessment. Please try again.');
    },
  });

  const handleAnswer = useCallback((key: string, value: number | string) => {
    log('[ClinicalAssessment] Answer:', key, '=', value);
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const { mutate: submitMutate, isPending: isSubmitting } = submitMutation;

  const handleSubmit = useCallback(() => {
    if (!allAnswered) {
      Alert.alert('', t('pleaseAnswerAll'));
      return;
    }
    submitMutate();
  }, [allAnswered, submitMutate, t]);

  const handleDone = useCallback(() => {
    router.back();
  }, []);

  if (!tool) {
    if (libraryQuery.isLoading) {
      return (
        <View style={styles.root}>
          <SafeAreaView style={styles.container}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          </SafeAreaView>
        </View>
      );
    }
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.container}>
          <View style={styles.loadingContainer}>
            <Text size={16} color={Colors.textSecondary}>Assessment not found</Text>
            <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
              <Text size={14} color={Colors.primary}>{t('goBack')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const wizardQuestions = useMemo<WizardQuestion[]>(() => {
    if (mode !== 'guided' || !tool) return [];
    return buildWizardQuestions(tool, language);
  }, [mode, tool, language]);

  const mapWizardAnswer = useCallback((questionId: string, answer: WizardAnswerValue): number | string => {
    if (!tool) return 0;
    return mapClinicalWizardAnswer(tool, questionId, answer);
  }, [tool]);

  const wizardSubmitMutation = useMutation({
    mutationFn: async (wizardAnswers: Record<string, number | string>) => {
      if (!tool || !patientId) throw new Error('Missing data');
      const scores = calculateScores(tool, wizardAnswers);
      log('[ClinicalAssessment] Wizard submitting. Scores:', scores);

      const langCode = language === 'zh_hant' || language === 'zh_hans' ? 'zh' : 'en';

      if (submissionId) {
        const { error } = await supabase
          .from('assessment_submissions')
          .update({
            responses: JSON.stringify(wizardAnswers),
            subscale_scores: JSON.stringify(scores.subscale_scores),
            total_score: scores.total_score,
            severity_rating: scores.severity_rating ?? null,
            language: langCode,
            status: 'completed',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', submissionId);

        if (error) {
          log('[ClinicalAssessment] Wizard update error:', error);
          throw error;
        }
      } else {
        const { error } = await supabase
          .from('assessment_submissions')
          .insert({
            patient_id: patientId,
            assessment_id: assessmentId,
            language: langCode,
            responses: JSON.stringify(wizardAnswers),
            subscale_scores: JSON.stringify(scores.subscale_scores),
            total_score: scores.total_score,
            severity_rating: scores.severity_rating ?? null,
            status: 'completed',
            completed_at: new Date().toISOString(),
          });

        if (error) {
          log('[ClinicalAssessment] Wizard insert error:', error);
          throw error;
        }
      }

      return scores;
    },
    onSuccess: (scores) => {
      log('[ClinicalAssessment] Wizard success:', scores);
      setScoreResult(scores);
      setShowCompletion(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
      void queryClient.invalidateQueries({ queryKey: ['clinical_assessments'] });
      void queryClient.invalidateQueries({ queryKey: ['assessments'] });
    },
    onError: (error) => {
      log('[ClinicalAssessment] Wizard submit error:', error);
      Alert.alert('Error', 'Failed to submit assessment. Please try again.');
    },
  });

  const handleWizardSubmit = useCallback((mapped: Record<string, number | string>) => {
    log('[ClinicalAssessment] Wizard final submit:', mapped);
    setAnswers(mapped);
    wizardSubmitMutation.mutate(mapped);
  }, [wizardSubmitMutation]);

  if (showCompletion && scoreResult) {
    return (
      <CompletionScreen
        tool={tool}
        scoreResult={scoreResult}
        answers={answers}
        language={language}
        fadeAnim={fadeAnim}
        scaleAnim={scaleAnim}
        onDone={handleDone}
        t={t}
      />
    );
  }

  const toolName = txt(tool.name_en, tool.name_zh, language);

  if (mode === 'guided') {
    log('[ClinicalAssessment] Guided mode active. wizardQuestions.length:', wizardQuestions.length, 'tool.id:', tool.id);
    if (wizardQuestions.length > 0) {
      return (
        <View style={styles.root}>
          <SafeAreaView style={styles.container}>
            <AssessmentWizard
              title={toolName}
              questions={wizardQuestions}
              onSubmit={handleWizardSubmit}
              onCancel={() => router.back()}
              mapAnswer={mapWizardAnswer}
              t={t}
              isSubmitting={wizardSubmitMutation.isPending}
            />
          </SafeAreaView>
        </View>
      );
    }
    log('[ClinicalAssessment] Guided mode: no wizard questions generated, falling back to checklist');
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="back-button">
            <ArrowLeft size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleArea}>
            <Text size={16} weight="bold" color={Colors.textPrimary} numberOfLines={1}>
              {toolName}
            </Text>
            <Text size={12} color={Colors.textSecondary}>
              {answeredCount} {t('questionOf')} {totalItems}
            </Text>
          </View>
          <View style={styles.typeBadge}>
            <Text size={10} weight="600" color={tool.type === 'clinician_rated' ? '#B8860B' : Colors.primary}>
              {tool.type === 'clinician_rated' ? t('clinicianRated') : t('selfReport')}
            </Text>
          </View>
        </View>

        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, { width: `${Math.round(progressPercent * 100)}%` }]} />
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {tool.reference ? (
            <ReferenceBox reference={tool.reference} t={t} />
          ) : null}

          <AssessmentBody
            tool={tool}
            answers={answers}
            language={language}
            onAnswer={handleAnswer}
            t={t}
          />

          <View style={styles.submitArea}>
            <TouchableOpacity
              style={[styles.submitButton, !allAnswered && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!allAnswered || isSubmitting}
              activeOpacity={0.8}
              testID="submit-assessment-button"
            >
              {isSubmitting ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text size={17} weight="bold" color={Colors.white}>
                  {t('submitAssessment')}
                </Text>
              )}
            </TouchableOpacity>
            {!allAnswered && (
              <Text size={12} color={Colors.textSecondary} style={styles.hintText}>
                {t('pleaseAnswerAll')}
              </Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ReferenceBox({ reference, t }: { reference: string; t: (key: string) => string }) {
  const [expanded, setExpanded] = useState<boolean>(false);
  return (
    <TouchableOpacity
      style={styles.referenceBox}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.7}
    >
      <View style={styles.referenceBoxHeader}>
        <BookOpen size={14} color={Colors.textSecondary} />
        <Text size={13} weight="600" color={Colors.textSecondary} style={{ flex: 1 }}>
          {t('reference')}
        </Text>
        {expanded ? <ChevronUp size={14} color={Colors.textSecondary} /> : <ChevronDown size={14} color={Colors.textSecondary} />}
      </View>
      {expanded && (
        <Text size={12} color="#666" style={styles.referenceBoxText}>
          {reference}
        </Text>
      )}
    </TouchableOpacity>
  );
}

interface AssessmentBodyProps {
  tool: AssessmentTool;
  answers: Record<string, number | string>;
  language: Language | null;
  onAnswer: (key: string, value: number | string) => void;
  t: (key: string) => string;
}

const AssessmentBody = React.memo(function AssessmentBody({ tool, answers, language, onAnswer, t }: AssessmentBodyProps) {
  switch (tool.scoring_method) {
    case 'summation':
    case 'sus_formula':
      return <ScaleItems tool={tool} answers={answers} language={language} onAnswer={onAnswer} />;
    case 'dhi':
      return <DHIItems tool={tool} answers={answers} language={language} onAnswer={onAnswer} t={t} />;
    case 'single_level':
      return <FOISItems tool={tool} answers={answers} language={language} onAnswer={onAnswer} />;
    case 'domain_scoring':
      return <DomainItems tool={tool} answers={answers} language={language} onAnswer={onAnswer} />;
    case 'coast_scoring':
      return <COASTItems tool={tool} answers={answers} language={language} onAnswer={onAnswer} />;
    case 'fda2_rating':
      return <FDA2Items tool={tool} answers={answers} language={language} onAnswer={onAnswer} />;
    case 'dtoms_rating':
      return <DToMsItems tool={tool} answers={answers} language={language} onAnswer={onAnswer} />;
    case 'categorical_risk_pathway':
      return <AllWalesMCAItems tool={tool} answers={answers} language={language} onAnswer={onAnswer} />;
    case 'ohat_summation':
      return <KoreanOHATItems tool={tool} answers={answers} language={language} onAnswer={onAnswer} />;
    case 'beckman_recording':
      return <BeckmanOMAItems tool={tool} answers={answers} language={language} onAnswer={onAnswer} />;
    default:
      return null;
  }
});

interface ItemProps {
  tool: AssessmentTool;
  answers: Record<string, number | string>;
  language: Language | null;
  onAnswer: (key: string, value: number | string) => void;
  t?: (key: string) => string;
}

function ScaleItems({ tool, answers, language, onAnswer }: ItemProps) {
  const items = tool.items || [];
  const min = tool.scale_min ?? 0;
  const max = tool.scale_max ?? 4;
  const labels = tool.scale_labels;

  return (
    <View>
      {items.map((item, index) => {
        const key = String(item.item_number);
        const isAnswered = answers[key] !== undefined;
        const itemText = txt(item.text_en, item.text_zh, language);

        return (
          <View key={key} style={[styles.questionCard, isAnswered && styles.questionCardAnswered]}>
            <View style={styles.questionHeader}>
              <View style={styles.questionNumberBadge}>
                <Text size={12} weight="bold" color={Colors.white}>{index + 1}</Text>
              </View>
              <Text size={15} weight="600" color={Colors.textPrimary} style={styles.questionText}>
                {itemText}
              </Text>
            </View>
            <View style={styles.scaleButtonsRow}>
              {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((val) => {
                const isSelected = answers[key] === val;
                const label = labels ? getScaleLabel(labels, String(val), language) : '';
                return (
                  <TouchableOpacity
                    key={val}
                    style={[styles.scaleButton, isSelected && styles.scaleButtonSelected]}
                    onPress={() => onAnswer(key, val)}
                    activeOpacity={0.7}
                    testID={`scale-${key}-${val}`}
                  >
                    <Text size={15} weight={isSelected ? 'bold' : 'normal'} color={isSelected ? Colors.white : Colors.textPrimary}>
                      {val}
                    </Text>
                    {label ? (
                      <Text size={9} color={isSelected ? 'rgba(255,255,255,0.85)' : Colors.textSecondary} numberOfLines={2} style={styles.scaleButtonLabel}>
                        {label}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function DHIItems({ tool, answers, language, onAnswer }: ItemProps) {
  const items = tool.items || [];
  const dhiValues = [0, 2, 4] as const;
  const labels = tool.scale_labels;

  return (
    <View>
      {items.map((item, index) => {
        const key = String(item.item_number);
        const isAnswered = answers[key] !== undefined;
        const itemText = txt(item.text_en, item.text_zh, language);
        const subscaleLabel = item.subscale ? ` (${item.subscale})` : '';

        return (
          <View key={key} style={[styles.questionCard, isAnswered && styles.questionCardAnswered]}>
            <View style={styles.questionHeader}>
              <View style={styles.questionNumberBadge}>
                <Text size={12} weight="bold" color={Colors.white}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text size={15} weight="600" color={Colors.textPrimary} style={styles.questionText}>
                  {itemText}
                </Text>
                <Text size={10} color={Colors.textSecondary}>{subscaleLabel}</Text>
              </View>
            </View>
            <View style={styles.dhiRow}>
              {dhiValues.map((val) => {
                const isSelected = answers[key] === val;
                const label = labels ? getScaleLabel(labels, String(val), language) : '';
                return (
                  <TouchableOpacity
                    key={val}
                    style={[styles.dhiButton, isSelected && styles.dhiButtonSelected]}
                    onPress={() => onAnswer(key, val)}
                    activeOpacity={0.7}
                  >
                    <Text size={14} weight={isSelected ? 'bold' : 'normal'} color={isSelected ? Colors.white : Colors.textPrimary}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}

      {tool.severity_question && (
        <View style={[styles.questionCard, answers['severity'] !== undefined && styles.questionCardAnswered]}>
          <View style={styles.questionHeader}>
            <View style={[styles.questionNumberBadge, { backgroundColor: Colors.secondary }]}>
              <Text size={10} weight="bold" color={Colors.white}>★</Text>
            </View>
            <Text size={15} weight="600" color={Colors.textPrimary} style={styles.questionText}>
              {txt(tool.severity_question.text_en, tool.severity_question.text_zh, language)}
            </Text>
          </View>
          <View style={styles.scaleButtonsRow}>
            {Array.from({ length: tool.severity_question.scale_max - tool.severity_question.scale_min + 1 }, (_, i) => tool.severity_question!.scale_min + i).map((val) => {
              const isSelected = answers['severity'] === val;
              return (
                <TouchableOpacity
                  key={val}
                  style={[styles.scaleButton, isSelected && styles.scaleButtonSelected]}
                  onPress={() => onAnswer('severity', val)}
                  activeOpacity={0.7}
                >
                  <Text size={15} weight={isSelected ? 'bold' : 'normal'} color={isSelected ? Colors.white : Colors.textPrimary}>
                    {val}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function FOISItems({ tool, answers, language, onAnswer }: ItemProps) {
  const items = tool.fois_items || [];
  const selectedLevel = answers['level'] as number | undefined;

  return (
    <View>
      {items.map((item) => {
        const isSelected = selectedLevel === item.level;
        const category = txt(item.category_en, item.category_zh, language);
        const text = txt(item.text_en, item.text_zh, language);

        return (
          <TouchableOpacity
            key={item.level}
            style={[styles.foisCard, isSelected && styles.foisCardSelected]}
            onPress={() => onAnswer('level', item.level)}
            activeOpacity={0.7}
            testID={`fois-level-${item.level}`}
          >
            <View style={styles.foisHeader}>
              <View style={[styles.foisLevelBadge, isSelected && styles.foisLevelBadgeSelected]}>
                <Text size={16} weight="bold" color={isSelected ? Colors.white : Colors.primary}>
                  {item.level}
                </Text>
              </View>
              <View style={styles.foisContent}>
                <Text size={10} weight="600" color={isSelected ? Colors.primary : Colors.textSecondary} style={styles.foisCategory}>
                  {category}
                </Text>
                <Text size={14} weight={isSelected ? '600' : 'normal'} color={Colors.textPrimary}>
                  {text}
                </Text>
              </View>
            </View>
            <View style={[styles.foisRadio, isSelected && styles.foisRadioSelected]}>
              {isSelected && <View style={styles.foisRadioInner} />}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function DomainItems({ tool, answers, language, onAnswer }: ItemProps) {
  const domains = tool.domains || [];
  const min = tool.scale_min ?? 1;
  const max = tool.scale_max ?? 5;
  return (
    <View>
      {domains.map((domain) => {
        const domainName = txt(domain.name_en, domain.name_zh, language);
        const domainLabels = domain.scale_labels;

        return (
          <View key={domain.domain_id}>
            <View style={styles.domainHeader}>
              <View style={styles.domainHeaderLine} />
              <Text size={14} weight="bold" color={Colors.primary} style={styles.domainHeaderText}>
                {domainName}
              </Text>
              <View style={styles.domainHeaderLine} />
            </View>

            {domain.items.map((item) => {
              const key = String(item.item_number);
              const isAnswered = answers[key] !== undefined;
              const itemText = txt(item.text_en, item.text_zh, language);
              const itemLabels = item.scale_labels || domainLabels;

              return (
                <View key={key} style={[styles.questionCard, isAnswered && styles.questionCardAnswered]}>
                  <View style={styles.questionHeader}>
                    <View style={styles.questionNumberBadge}>
                      <Text size={11} weight="bold" color={Colors.white}>{item.item_number}</Text>
                    </View>
                    <Text size={14} weight="600" color={Colors.textPrimary} style={styles.questionText}>
                      {itemText}
                    </Text>
                  </View>
                  <View style={styles.scaleButtonsRow}>
                    {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((val) => {
                      const isSelected = answers[key] === val;
                      const label = itemLabels ? getScaleLabel(itemLabels, String(val), language) : '';
                      return (
                        <TouchableOpacity
                          key={val}
                          style={[styles.scaleButton, isSelected && styles.scaleButtonSelected]}
                          onPress={() => onAnswer(key, val)}
                          activeOpacity={0.7}
                        >
                          <Text size={14} weight={isSelected ? 'bold' : 'normal'} color={isSelected ? Colors.white : Colors.textPrimary}>
                            {val}
                          </Text>
                          {label ? (
                            <Text size={8} color={isSelected ? 'rgba(255,255,255,0.85)' : Colors.textSecondary} numberOfLines={2} style={styles.scaleButtonLabel}>
                              {label}
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function COASTItems({ tool, answers, language, onAnswer }: ItemProps) {
  const domains = tool.domains || [];

  return (
    <View>
      {domains.map((domain) => {
        const domainName = txt(domain.name_en, domain.name_zh, language);

        return (
          <View key={domain.domain_id}>
            <View style={styles.domainHeader}>
              <View style={styles.domainHeaderLine} />
              <Text size={14} weight="bold" color={Colors.primary} style={styles.domainHeaderText}>
                {domainName}
              </Text>
              <View style={styles.domainHeaderLine} />
            </View>

            {domain.items.map((item) => {
              const key = String(item.item_number);
              const isAnswered = answers[key] !== undefined;
              const itemText = txt(item.text_en, item.text_zh, language);
              const itemLabels = item.scale_labels;

              return (
                <View key={key} style={[styles.questionCard, isAnswered && styles.questionCardAnswered]}>
                  <View style={styles.questionHeader}>
                    <View style={styles.questionNumberBadge}>
                      <Text size={11} weight="bold" color={Colors.white}>{item.item_number}</Text>
                    </View>
                    <Text size={14} weight="600" color={Colors.textPrimary} style={styles.questionText}>
                      {itemText}
                    </Text>
                  </View>
                  {itemLabels ? (
                    <View style={styles.coastChoices}>
                      {Object.entries(itemLabels).map(([val, label]) => {
                        const numVal = Number(val);
                        const isSelected = answers[key] === numVal;
                        const labelText = language === 'zh_hant' || language === 'zh_hans' ? label.zh : label.en;
                        return (
                          <TouchableOpacity
                            key={val}
                            style={[styles.coastChoice, isSelected && styles.coastChoiceSelected]}
                            onPress={() => onAnswer(key, numVal)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.coastChoiceNumber, isSelected && styles.coastChoiceNumberSelected]}>
                              <Text size={13} weight="bold" color={isSelected ? Colors.white : Colors.textSecondary}>
                                {val}
                              </Text>
                            </View>
                            <Text size={13} color={isSelected ? Colors.primary : Colors.textPrimary} weight={isSelected ? '600' : 'normal'} style={{ flex: 1 }}>
                              {labelText}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.scaleButtonsRow}>
                      {[0, 1, 2, 3, 4].map((val) => {
                        const isSelected = answers[key] === val;
                        return (
                          <TouchableOpacity
                            key={val}
                            style={[styles.scaleButton, isSelected && styles.scaleButtonSelected]}
                            onPress={() => onAnswer(key, val)}
                            activeOpacity={0.7}
                          >
                            <Text size={14} weight={isSelected ? 'bold' : 'normal'} color={isSelected ? Colors.white : Colors.textPrimary}>
                              {val}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function FDA2Items({ tool, answers, language, onAnswer }: ItemProps) {
  const sections = tool.fda2_sections || [];
  const scale = tool.fda2_scale || {};
  const ratingKeys = ['a', 'b', 'c', 'd', 'e'] as const;

  return (
    <View>
      {sections.map((section) => {
        const sectionName = txt(section.name_en, section.name_zh, language);

        return (
          <View key={section.section_number}>
            <View style={styles.domainHeader}>
              <View style={styles.domainHeaderLine} />
              <Text size={14} weight="bold" color={Colors.primary} style={styles.domainHeaderText}>
                {section.section_number}. {sectionName}
              </Text>
              <View style={styles.domainHeaderLine} />
            </View>

            {section.items.map((item) => {
              const isAnswered = answers[item.item_id] !== undefined;
              const itemText = txt(item.text_en, item.text_zh, language);

              return (
                <View key={item.item_id} style={[styles.questionCard, isAnswered && styles.questionCardAnswered]}>
                  <View style={styles.questionHeader}>
                    <View style={styles.questionNumberBadge}>
                      <Text size={10} weight="bold" color={Colors.white}>{item.item_id}</Text>
                    </View>
                    <Text size={14} weight="600" color={Colors.textPrimary} style={styles.questionText}>
                      {itemText}
                    </Text>
                  </View>
                  <View style={styles.fda2Ratings}>
                    {ratingKeys.map((rk) => {
                      const isSelected = answers[item.item_id] === rk;
                      const label = scale[rk] ? (language === 'zh_hant' || language === 'zh_hans' ? scale[rk].zh : scale[rk].en) : rk;
                      const shortLabel = rk.toUpperCase();
                      return (
                        <TouchableOpacity
                          key={rk}
                          style={[styles.fda2Button, isSelected && styles.fda2ButtonSelected]}
                          onPress={() => onAnswer(item.item_id, rk)}
                          activeOpacity={0.7}
                        >
                          <Text size={14} weight="bold" color={isSelected ? Colors.white : Colors.textPrimary}>
                            {shortLabel}
                          </Text>
                          <Text size={8} color={isSelected ? 'rgba(255,255,255,0.85)' : Colors.textSecondary} numberOfLines={2} style={styles.fda2Label}>
                            {label.split('(')[0].trim()}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function DToMsItems({ tool, answers, language, onAnswer }: ItemProps) {
  const dimensions = tool.dtoms_dimensions || [];
  const halfPointValues = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

  return (
    <View>
      {dimensions.map((dim) => {
        const dimName = txt(dim.name_en, dim.name_zh, language);
        const dimDesc = txt(dim.description_en, dim.description_zh, language);
        const selectedVal = answers[dim.dimension_id] as number | undefined;

        return (
          <View key={dim.dimension_id} style={styles.dtomsCard}>
            <View style={styles.dtomsHeader}>
              <Text size={16} weight="bold" color={Colors.textPrimary}>
                {dimName}
              </Text>
              <Text size={12} color={Colors.textSecondary} style={{ marginTop: 4 }}>
                {dimDesc}
              </Text>
            </View>

            <View style={styles.dtomsScaleRow}>
              {halfPointValues.map((val) => {
                const isSelected = selectedVal === val;
                const isWholeNumber = val % 1 === 0;
                return (
                  <TouchableOpacity
                    key={val}
                    style={[
                      isWholeNumber ? styles.dtomsCircle : styles.dtomsHalfCircle,
                      isSelected && styles.dtomsCircleSelected,
                    ]}
                    onPress={() => onAnswer(dim.dimension_id, val)}
                    activeOpacity={0.7}
                  >
                    <Text
                      size={isWholeNumber ? 13 : 10}
                      weight={isSelected ? 'bold' : 'normal'}
                      color={isSelected ? Colors.white : Colors.textSecondary}
                    >
                      {val}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedVal !== undefined && (
              <View style={styles.dtomsLevelDesc}>
                {dim.levels.map((level) => {
                  const isActive = Math.floor(selectedVal) === level.score || (selectedVal > level.score && selectedVal < level.score + 1);
                  if (!isActive) return null;
                  return (
                    <Text key={level.score} size={12} color={Colors.primary} weight="600">
                      {txt(level.label_en, level.label_zh, language)}
                    </Text>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const BECKMAN_OBS_SCALE: Record<string, { en: string; zh: string }> = {
  '1': { en: 'Within Normal Limits', zh: '正常範圍內' },
  '2': { en: 'Mildly Impaired', zh: '輕度受損' },
  '3': { en: 'Severely Impaired', zh: '嚴重受損' },
};

function AllWalesMCAItems({ tool, answers, language, onAnswer }: ItemProps) {
  const sections = tool.mca_sections || [];

  return (
    <View>
      {sections.map((section) => {
        const sectionName = txt(section.name_en, section.name_zh, language);
        const sectionDesc = txt(section.description_en, section.description_zh, language);

        return (
          <View key={section.section_id}>
            <View style={styles.domainHeader}>
              <View style={styles.domainHeaderLine} />
              <Text size={14} weight="bold" color={Colors.primary} style={styles.domainHeaderText}>
                {sectionName}
              </Text>
              <View style={styles.domainHeaderLine} />
            </View>
            <Text size={12} color={Colors.textSecondary} style={styles.mcaSectionDesc}>
              {sectionDesc}
            </Text>

            {section.items.map((item) => {
              const isAnswered = answers[item.item_id] !== undefined;

              if (item.scores) {
                const categoryText = txt(item.category_en || '', item.category_zh || '', language);
                return (
                  <View key={item.item_id} style={[styles.questionCard, isAnswered && styles.questionCardAnswered]}>
                    <View style={styles.questionHeader}>
                      <View style={styles.questionNumberBadge}>
                        <Text size={10} weight="bold" color={Colors.white}>{item.item_id}</Text>
                      </View>
                      <Text size={15} weight="600" color={Colors.textPrimary} style={styles.questionText}>
                        {categoryText}
                      </Text>
                    </View>
                    <View style={styles.coastChoices}>
                      {Object.entries(item.scores).map(([val, label]) => {
                        const numVal = Number(val);
                        const isSelected = answers[item.item_id] === numVal;
                        const labelText = language === 'zh_hant' || language === 'zh_hans' ? label.zh : label.en;
                        return (
                          <TouchableOpacity
                            key={val}
                            style={[styles.coastChoice, isSelected && styles.coastChoiceSelected]}
                            onPress={() => onAnswer(item.item_id, numVal)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.coastChoiceNumber, isSelected && styles.coastChoiceNumberSelected]}>
                              <Text size={13} weight="bold" color={isSelected ? Colors.white : Colors.textSecondary}>
                                {val}
                              </Text>
                            </View>
                            <Text size={13} color={isSelected ? Colors.primary : Colors.textPrimary} weight={isSelected ? '600' : 'normal'} style={{ flex: 1 }}>
                              {labelText}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              }

              if (item.response_type === 'text') {
                const itemText = txt(item.text_en || '', item.text_zh || '', language);
                return (
                  <View key={item.item_id} style={[styles.questionCard, isAnswered && styles.questionCardAnswered]}>
                    <View style={styles.questionHeader}>
                      <View style={styles.questionNumberBadge}>
                        <Text size={10} weight="bold" color={Colors.white}>{item.item_id}</Text>
                      </View>
                      <Text size={14} weight="600" color={Colors.textPrimary} style={styles.questionText}>
                        {itemText}
                      </Text>
                    </View>
                    <TextInput
                      style={styles.mcaTextInput}
                      value={String(answers[item.item_id] ?? '')}
                      onChangeText={(text) => onAnswer(item.item_id, text)}
                      placeholder={language === 'zh_hant' || language === 'zh_hans' ? '請輸入...' : 'Enter...'}
                      placeholderTextColor={Colors.disabled}
                    />
                  </View>
                );
              }

              const itemText = txt(item.text_en || '', item.text_zh || '', language);
              const yesLabel = language === 'zh_hant' || language === 'zh_hans' ? '是' : 'Yes';
              const noLabel = language === 'zh_hant' || language === 'zh_hans' ? '否' : 'No';
              return (
                <View key={item.item_id} style={[styles.questionCard, isAnswered && styles.questionCardAnswered]}>
                  <View style={styles.questionHeader}>
                    <View style={styles.questionNumberBadge}>
                      <Text size={10} weight="bold" color={Colors.white}>{item.item_id}</Text>
                    </View>
                    <Text size={14} weight="600" color={Colors.textPrimary} style={styles.questionText}>
                      {itemText}
                    </Text>
                  </View>
                  <View style={styles.dhiRow}>
                    <TouchableOpacity
                      style={[styles.dhiButton, answers[item.item_id] === 'yes' && styles.dhiButtonSelected]}
                      onPress={() => onAnswer(item.item_id, 'yes')}
                      activeOpacity={0.7}
                    >
                      <Text size={14} weight={answers[item.item_id] === 'yes' ? 'bold' : 'normal'} color={answers[item.item_id] === 'yes' ? Colors.white : Colors.textPrimary}>
                        {yesLabel}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dhiButton, answers[item.item_id] === 'no' && styles.dhiButtonSelected]}
                      onPress={() => onAnswer(item.item_id, 'no')}
                      activeOpacity={0.7}
                    >
                      <Text size={14} weight={answers[item.item_id] === 'no' ? 'bold' : 'normal'} color={answers[item.item_id] === 'no' ? Colors.white : Colors.textPrimary}>
                        {noLabel}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function KoreanOHATItems({ tool, answers, language, onAnswer }: ItemProps) {
  const items = tool.ohat_items || [];

  return (
    <View>
      {items.map((item, index) => {
        const key = String(item.item_number);
        const isAnswered = answers[key] !== undefined;
        const categoryText = txt(item.category_en, item.category_zh, language);

        return (
          <View key={key} style={[styles.questionCard, isAnswered && styles.questionCardAnswered]}>
            <View style={styles.questionHeader}>
              <View style={styles.questionNumberBadge}>
                <Text size={12} weight="bold" color={Colors.white}>{index + 1}</Text>
              </View>
              <Text size={15} weight="600" color={Colors.textPrimary} style={styles.questionText}>
                {categoryText}
              </Text>
            </View>
            <View style={styles.coastChoices}>
              {Object.entries(item.scores).map(([val, label]) => {
                const numVal = Number(val);
                const isSelected = answers[key] === numVal;
                const labelText = language === 'zh_hant' || language === 'zh_hans' ? label.zh : label.en;
                return (
                  <TouchableOpacity
                    key={val}
                    style={[styles.coastChoice, isSelected && styles.coastChoiceSelected]}
                    onPress={() => onAnswer(key, numVal)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.coastChoiceNumber, isSelected && styles.coastChoiceNumberSelected]}>
                      <Text size={13} weight="bold" color={isSelected ? Colors.white : Colors.textSecondary}>
                        {val}
                      </Text>
                    </View>
                    <Text size={13} color={isSelected ? Colors.primary : Colors.textPrimary} weight={isSelected ? '600' : 'normal'} style={{ flex: 1 }}>
                      {labelText}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function BeckmanOMAItems({ tool, answers, language, onAnswer }: ItemProps) {
  const structures = tool.beckman_structures || [];
  const additional = tool.beckman_additional;

  const renderObservationItem = (itemId: string, itemText: string) => {
    const isAnswered = answers[itemId] !== undefined;
    return (
      <View key={itemId} style={[styles.questionCard, isAnswered && styles.questionCardAnswered]}>
        <Text size={13} weight="600" color={Colors.textPrimary} style={{ marginBottom: 10 }}>
          {itemText}
        </Text>
        <View style={styles.scaleButtonsRow}>
          {['1', '2', '3'].map((val) => {
            const numVal = Number(val);
            const isSelected = answers[itemId] === numVal;
            const label = BECKMAN_OBS_SCALE[val];
            const labelText = language === 'zh_hant' || language === 'zh_hans' ? label.zh : label.en;
            return (
              <TouchableOpacity
                key={val}
                style={[styles.scaleButton, isSelected && styles.scaleButtonSelected]}
                onPress={() => onAnswer(itemId, numVal)}
                activeOpacity={0.7}
              >
                <Text size={13} weight={isSelected ? 'bold' : 'normal'} color={isSelected ? Colors.white : Colors.textPrimary}>
                  {val}
                </Text>
                <Text size={8} color={isSelected ? 'rgba(255,255,255,0.85)' : Colors.textSecondary} numberOfLines={2} style={styles.scaleButtonLabel}>
                  {labelText}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderScoredItem = (itemId: string, itemText: string, maxScore: number) => {
    const isAnswered = answers[itemId] !== undefined;
    if (maxScore > 6) {
      return (
        <View key={itemId} style={[styles.questionCard, isAnswered && styles.questionCardAnswered]}>
          <Text size={13} weight="600" color={Colors.textPrimary} style={{ marginBottom: 10 }}>
            {itemText}
          </Text>
          <View style={styles.beckmanNumericRow}>
            <TextInput
              style={styles.beckmanNumericInput}
              value={answers[itemId] !== undefined ? String(answers[itemId]) : ''}
              onChangeText={(text) => {
                const num = Number(text);
                if (!isNaN(num) && num >= 0 && num <= maxScore) {
                  onAnswer(itemId, num);
                } else if (text === '') {
                  onAnswer(itemId, 0);
                }
              }}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={Colors.disabled}
              maxLength={String(maxScore).length}
            />
            <Text size={12} color={Colors.textSecondary}>
              {'/ '}{maxScore}
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View key={itemId} style={[styles.questionCard, isAnswered && styles.questionCardAnswered]}>
        <Text size={13} weight="600" color={Colors.textPrimary} style={{ marginBottom: 10 }}>
          {itemText}
        </Text>
        <View style={styles.scaleButtonsRow}>
          {Array.from({ length: maxScore + 1 }, (_, i) => i).map((val) => {
            const isSelected = answers[itemId] === val;
            return (
              <TouchableOpacity
                key={val}
                style={[styles.scaleButton, isSelected && styles.scaleButtonSelected]}
                onPress={() => onAnswer(itemId, val)}
                activeOpacity={0.7}
              >
                <Text size={13} weight={isSelected ? 'bold' : 'normal'} color={isSelected ? Colors.white : Colors.textPrimary}>
                  {String(val)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View>
      {structures.map((structure) => {
        const structureName = txt(structure.name_en, structure.name_zh, language);
        return (
          <View key={structure.structure_id}>
            <View style={styles.beckmanStructureHeader}>
              <Text size={16} weight="bold" color={Colors.primary}>
                {structureName}
              </Text>
            </View>

            {structure.assessment_areas.map((area) => {
              const areaName = txt(area.name_en, area.name_zh, language);
              return (
                <View key={area.area_id}>
                  <View style={styles.domainHeader}>
                    <View style={styles.domainHeaderLine} />
                    <Text size={13} weight="600" color={Colors.secondary} style={styles.domainHeaderText}>
                      {areaName}
                    </Text>
                    <View style={styles.domainHeaderLine} />
                  </View>

                  {area.items.map((item) => {
                    const itemText = txt(item.text_en, item.text_zh, language);
                    if (item.max_score !== undefined) {
                      return renderScoredItem(item.item_id, itemText, item.max_score);
                    }
                    return renderObservationItem(item.item_id, itemText);
                  })}
                </View>
              );
            })}
          </View>
        );
      })}

      {additional && (
        <View>
          <View style={styles.beckmanStructureHeader}>
            <Text size={16} weight="bold" color={Colors.primary}>
              {txt(additional.name_en, additional.name_zh, language)}
            </Text>
          </View>
          {additional.items.map((item) => {
            const itemText = txt(item.text_en, item.text_zh, language);
            return renderObservationItem(item.item_id, itemText);
          })}
        </View>
      )}
    </View>
  );
}

interface CompletionScreenProps {
  tool: AssessmentTool;
  scoreResult: ScoreResult;
  answers: Record<string, number | string>;
  language: Language | null;
  fadeAnim: Animated.Value;
  scaleAnim: Animated.Value;
  onDone: () => void;
  t: (key: string) => string;
}

function CompletionScreen({ tool, scoreResult, language, fadeAnim, scaleAnim, onDone, t }: CompletionScreenProps) {
  const [showInterpretation, setShowInterpretation] = useState<boolean>(false);

  const hasTotalScore = scoreResult.total_score !== null;
  const hasSubscales = Object.keys(scoreResult.subscale_scores).length > 0;
  const interpretation = tool.interpretation_en
    ? txt(tool.interpretation_en, tool.interpretation_zh || '', language)
    : null;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.completionScrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.completionContent, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.completionIconCircle}>
              <CheckCircle2 size={64} color={Colors.success} />
            </View>
            <Text size={24} weight="bold" color={Colors.textPrimary} style={styles.completionTitle}>
              {t('assessmentComplete')}
            </Text>
            <Text size={14} color={Colors.textSecondary} style={styles.completionTitle}>
              {txt(tool.name_en, tool.name_zh, language)}
            </Text>

            {hasTotalScore && (
              <View style={styles.scoreCard}>
                <Text size={13} color={Colors.textSecondary}>
                  {t('totalScore')}
                </Text>
                <Text size={42} weight="bold" color={Colors.primary}>
                  {scoreResult.total_score}
                </Text>
                {scoreResult.max_score !== undefined && (
                  <Text size={13} color={Colors.textSecondary}>
                    {t('outOf')} {scoreResult.max_score}
                  </Text>
                )}
              </View>
            )}

            {scoreResult.severity_rating !== undefined && (
              <View style={styles.subscaleCard}>
                <Text size={14} weight="bold" color={Colors.textPrimary} style={styles.subscaleTitle}>
                  {t('severityRating')}
                </Text>
                <View style={styles.subscaleRow}>
                  <Text size={28} weight="bold" color={Colors.secondary}>
                    {scoreResult.severity_rating}
                  </Text>
                  <Text size={13} color={Colors.textSecondary}> / 7</Text>
                </View>
              </View>
            )}

            {hasSubscales && tool.scoring_method !== 'fda2_rating' && (
              <View style={styles.subscaleCard}>
                <Text size={14} weight="bold" color={Colors.textPrimary} style={styles.subscaleTitle}>
                  {tool.scoring_method === 'dtoms_rating' ? t('dimensionScores') :
                   tool.domains ? t('domainScores') : t('subscaleScores')}
                </Text>
                {Object.entries(scoreResult.subscale_scores).map(([key, value]) => {
                  let displayName = key;
                  if (tool.domains) {
                    const domain = tool.domains.find(d => d.domain_id === key);
                    if (domain) displayName = txt(domain.name_en, domain.name_zh, language);
                  } else if (tool.dtoms_dimensions) {
                    const dim = tool.dtoms_dimensions.find(d => d.dimension_id === key);
                    if (dim) displayName = txt(dim.name_en, dim.name_zh, language);
                  } else if (tool.subscales) {
                    displayName = key.charAt(0).toUpperCase() + key.slice(1);
                  }
                  return (
                    <View key={key} style={styles.subscaleItemRow}>
                      <Text size={13} color={Colors.textSecondary} style={{ flex: 1 }}>
                        {displayName}
                      </Text>
                      <Text size={15} weight="bold" color={Colors.textPrimary}>
                        {typeof value === 'number' ? value : '-'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {tool.scoring_method === 'fda2_rating' && hasSubscales && (
              <View style={styles.subscaleCard}>
                <Text size={14} weight="bold" color={Colors.textPrimary} style={styles.subscaleTitle}>
                  {t('sectionResults')}
                </Text>
                {(tool.fda2_sections || []).map((section) => {
                  const sectionKey = `section_${section.section_number}`;
                  const rawVal = scoreResult.subscale_scores[sectionKey];
                  let parsed: Record<string, string> = {};
                  try { parsed = typeof rawVal === 'string' ? JSON.parse(rawVal) : {}; } catch { parsed = {}; }
                  const sectionName = txt(section.name_en, section.name_zh, language);
                  return (
                    <View key={sectionKey} style={styles.fda2ResultSection}>
                      <Text size={13} weight="600" color={Colors.primary}>{sectionName}</Text>
                      <View style={styles.fda2ResultItems}>
                        {section.items.map((item) => {
                          const rating = parsed[item.item_id] || '-';
                          return (
                            <View key={item.item_id} style={styles.fda2ResultItem}>
                              <Text size={12} color={Colors.textSecondary}>
                                {txt(item.text_en, item.text_zh, language)}
                              </Text>
                              <View style={styles.fda2ResultBadge}>
                                <Text size={12} weight="bold" color={Colors.primary}>
                                  {String(rating).toUpperCase()}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {tool.reference ? (
              <View style={styles.completionReferenceBox}>
                <Text size={12} color={Colors.textSecondary} style={{ fontStyle: 'italic' as const }}>
                  {t('assessmentAdministeredUsing')}
                </Text>
                <Text size={12} color="#666" style={{ marginTop: 4, lineHeight: 18, paddingLeft: 28 }}>
                  {tool.reference}
                </Text>
              </View>
            ) : null}

            {interpretation && (
              <TouchableOpacity
                style={styles.interpretationToggle}
                onPress={() => setShowInterpretation(!showInterpretation)}
                activeOpacity={0.7}
              >
                <View style={styles.interpretationToggleRow}>
                  <Info size={16} color={Colors.primary} />
                  <Text size={14} weight="600" color={Colors.primary}>{t('interpretation')}</Text>
                  {showInterpretation ? <ChevronUp size={16} color={Colors.primary} /> : <ChevronDown size={16} color={Colors.primary} />}
                </View>
                {showInterpretation && (
                  <Text size={13} color={Colors.textSecondary} style={styles.interpretationText}>
                    {interpretation}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.doneButton} onPress={onDone} activeOpacity={0.8} testID="done-button">
              <Text size={17} weight="bold" color={Colors.white}>
                {t('continue')}
              </Text>
            </TouchableOpacity>
          </Animated.View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
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
  headerTitleArea: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
  },
  progressBarContainer: {
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  progressBarBg: {
    height: 5,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 4,
  },
  questionCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  questionCardAnswered: {
    borderColor: Colors.primaryLight,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },
  questionNumberBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  questionText: {
    flex: 1,
    lineHeight: 22,
  },
  scaleButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  scaleButton: {
    minWidth: 44,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
  },
  scaleButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  scaleButtonLabel: {
    textAlign: 'center',
    marginTop: 2,
  },
  dhiRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dhiButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
  },
  dhiButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  foisCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  foisCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  foisHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  foisLevelBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  foisLevelBadgeSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  foisContent: {
    flex: 1,
    gap: 4,
  },
  foisCategory: {
    letterSpacing: 0.5,
  },
  foisRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.disabled,
    justifyContent: 'center',
    alignItems: 'center',
  },
  foisRadioSelected: {
    borderColor: Colors.primary,
  },
  foisRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  domainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 12,
  },
  domainHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  domainHeaderText: {
    paddingHorizontal: 4,
  },
  coastChoices: {
    gap: 6,
  },
  coastChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    gap: 10,
  },
  coastChoiceSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  coastChoiceNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coastChoiceNumberSelected: {
    backgroundColor: Colors.primary,
  },
  fda2Ratings: {
    flexDirection: 'row',
    gap: 6,
  },
  fda2Button: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
  },
  fda2ButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  fda2Label: {
    textAlign: 'center',
    marginTop: 2,
  },
  dtomsCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dtomsHeader: {
    marginBottom: 14,
  },
  dtomsScaleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'center',
  },
  dtomsCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.card,
  },
  dtomsHalfCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  dtomsCircleSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dtomsLevelDesc: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  submitArea: {
    marginTop: 12,
    alignItems: 'center',
    gap: 10,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.disabled,
  },
  hintText: {
    textAlign: 'center',
  },
  completionScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 20,
  },
  completionContent: {
    alignItems: 'center',
    gap: 16,
  },
  completionIconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.successLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completionTitle: {
    textAlign: 'center',
  },
  scoreCard: {
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 20,
    minWidth: 160,
    gap: 4,
  },
  subscaleCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 18,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subscaleTitle: {
    marginBottom: 12,
  },
  subscaleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  subscaleItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  fda2ResultSection: {
    marginBottom: 12,
    gap: 6,
  },
  fda2ResultItems: {
    gap: 4,
  },
  fda2ResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 8,
  },
  fda2ResultBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  interpretationToggle: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  interpretationToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  interpretationText: {
    marginTop: 12,
    lineHeight: 20,
  },
  doneButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 60,
    marginTop: 8,
  },
  referenceBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  referenceBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  referenceBoxText: {
    marginTop: 8,
    lineHeight: 18,
    fontStyle: 'italic',
    paddingLeft: 28,
  },
  completionReferenceBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  mcaSectionDesc: {
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  mcaTextInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
  beckmanStructureHeader: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  beckmanNumericRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  beckmanNumericInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
    minWidth: 60,
    textAlign: 'center' as const,
  },
});
