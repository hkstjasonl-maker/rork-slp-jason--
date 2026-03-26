import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/contexts/AppContext';
import { ScaledText as Text } from '@/components/ScaledText';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { ArrowLeft, Check, CheckCircle } from 'lucide-react-native';
import { log } from '@/lib/logger';

interface FOISOption {
  level: number;
  text_en: string;
  text_zh: string;
}

const FOIS_OPTIONS: FOISOption[] = [
  { level: 1, text_en: 'No oral intake', text_zh: '完全無法經口進食' },
  { level: 2, text_en: 'Tube dependent with minimal attempts of food or liquid', text_zh: '依賴管餵，偶爾嘗試少量食物或液體' },
  { level: 3, text_en: 'Tube dependent with consistent oral intake of food or liquid', text_zh: '依賴管餵，持續經口攝取食物或液體' },
  { level: 4, text_en: 'Total oral diet of a single consistency', text_zh: '完全經口進食，限單一質地' },
  { level: 5, text_en: 'Total oral diet with multiple consistencies, but requiring special preparation', text_zh: '完全經口進食，多種質地，需特殊處理' },
  { level: 6, text_en: 'Total oral diet with multiple consistencies without special preparation, but with specific food limitations', text_zh: '完全經口進食，多種質地，無需特殊處理，但有特定食物限制' },
  { level: 7, text_en: 'Total oral diet with no restrictions', text_zh: '完全經口進食，無任何限制' },
];

const THEME = {
  purple: '#6C5CE7',
  purpleLight: '#F0EDFF',
  purpleDark: '#3B2E8A',
  optionBg: '#F5F5FA',
  optionSelectedBg: '#E4E0FF',
  selectedBorder: '#6C5CE7',
} as const;

export default function FOISAssessmentScreen() {
  const params = useLocalSearchParams<{
    researchAssessmentId?: string;
    assessmentName?: string;
    timepoint?: string;
  }>();
  const researchAssessmentId = Array.isArray(params.researchAssessmentId)
    ? params.researchAssessmentId[0]
    : params.researchAssessmentId;

  const { language } = useApp();
  const queryClient = useQueryClient();
  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [showResult, setShowResult] = useState<boolean>(false);
  const [finalScore, setFinalScore] = useState<number>(0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const buttonScales = useRef<Animated.Value[]>(
    FOIS_OPTIONS.map(() => new Animated.Value(1))
  ).current;

  const selectLevel = useCallback((level: number, idx: number) => {
    if (buttonScales[idx]) {
      Animated.sequence([
        Animated.timing(buttonScales[idx], { toValue: 0.95, duration: 60, useNativeDriver: true }),
        Animated.spring(buttonScales[idx], { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
    setSelectedLevel(level);
    log('[FOIS] Selected level:', level);
  }, [buttonScales]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (selectedLevel === null) throw new Error('No level selected');
      if (!researchAssessmentId) throw new Error('No assessment ID');
      log('[FOIS] Submitting level:', selectedLevel);

      const { error } = await supabase
        .from('research_assessments')
        .update({
          total_score: selectedLevel,
          raw_responses: { level: selectedLevel },
          completion_method: 'app_wizard',
          administered_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', researchAssessmentId);

      if (error) {
        log('[FOIS] Update error:', error);
        throw error;
      }
      return selectedLevel;
    },
    onSuccess: (score) => {
      log('[FOIS] Submit success, score:', score);
      setFinalScore(score);
      setShowResult(true);
      void queryClient.invalidateQueries({ queryKey: ['research-assessments'] });
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
    },
    onError: (error) => {
      log('[FOIS] Submit error:', error);
      Alert.alert(
        isZh ? '錯誤' : 'Error',
        isZh ? '提交失敗，請重試。' : 'Failed to submit. Please try again.'
      );
    },
  });

  if (showResult) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safeArea}>
          <Animated.View
            style={[styles.resultContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}
          >
            <View style={styles.resultIconCircle}>
              <CheckCircle size={48} color={Colors.success} />
            </View>
            <Text size={22} weight="bold" color={Colors.textPrimary} style={styles.resultTitle}>
              {isZh ? 'FOIS 評估已完成' : 'FOIS Assessment Completed'}
            </Text>
            <View style={[styles.scoreCard, { borderColor: THEME.purple }]}>
              <Text size={14} color={Colors.textSecondary}>
                {isZh ? '等級 Level' : 'Level 等級'}
              </Text>
              <Text size={52} weight="bold" color={THEME.purple}>
                {finalScore}
              </Text>
              <Text size={13} color={Colors.textSecondary}>/ 7</Text>
            </View>
            <Text size={14} color={Colors.textSecondary} style={styles.interpretationText}>
              {isZh
                ? '分數越高表示口服攝食能力越好。'
                : 'Higher scores indicate better oral intake ability.'}
            </Text>
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => router.back()}
              activeOpacity={0.8}
              testID="fois-done"
            >
              <Text size={16} weight="bold" color={Colors.white}>
                {isZh ? '返回評估列表' : 'Back to Assessments'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID="fois-back"
          >
            <ArrowLeft size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text size={15} weight="600" color={Colors.textPrimary} numberOfLines={1} style={styles.topBarTitle}>
            {isZh ? '功能性口服攝食量表' : 'FOIS'}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text size={18} weight="bold" color={Colors.textPrimary} style={styles.heading}>
            {isZh
              ? '功能性口服攝食量表 (FOIS)\nFunctional Oral Intake Scale'
              : 'Functional Oral Intake Scale (FOIS)\n功能性口服攝食量表'}
          </Text>
          <Text size={14} color={Colors.textSecondary} style={styles.instruction}>
            {isZh
              ? '請選擇最符合目前情況的等級'
              : 'Select the level that best describes the current status'}
          </Text>

          <View style={styles.optionsColumn}>
            {FOIS_OPTIONS.map((option, idx) => {
              const isSelected = selectedLevel === option.level;
              return (
                <Animated.View
                  key={option.level}
                  style={{ transform: [{ scale: buttonScales[idx] || new Animated.Value(1) }] }}
                >
                  <TouchableOpacity
                    style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                    onPress={() => selectLevel(option.level, idx)}
                    activeOpacity={0.7}
                    testID={`fois-option-${option.level}`}
                  >
                    <View style={[styles.levelBadge, isSelected && styles.levelBadgeSelected]}>
                      <Text size={18} weight="bold" color={isSelected ? Colors.white : THEME.purple}>
                        {option.level}
                      </Text>
                    </View>
                    <View style={styles.optionTextWrap}>
                      <Text
                        size={14}
                        weight={isSelected ? '600' : 'normal'}
                        color={isSelected ? THEME.purpleDark : Colors.textPrimary}
                      >
                        {isZh ? option.text_zh : option.text_en}
                      </Text>
                      <Text size={11} color={isSelected ? THEME.purple : Colors.textSecondary}>
                        {isZh ? option.text_en : option.text_zh}
                      </Text>
                    </View>
                    {isSelected && <Check size={20} color={THEME.purple} />}
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.submitBtn, selectedLevel === null && styles.submitBtnDisabled]}
            onPress={() => submitMutation.mutate()}
            disabled={selectedLevel === null || submitMutation.isPending}
            activeOpacity={0.8}
            testID="fois-submit"
          >
            {submitMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Check size={22} color={Colors.white} />
                <Text size={18} weight="bold" color={Colors.white}>
                  {isZh ? '提交 Submit' : 'Submit 提交'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  heading: {
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 8,
  },
  instruction: {
    textAlign: 'center',
    marginBottom: 20,
  },
  optionsColumn: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: THEME.optionBg,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 12,
    minHeight: 60,
  },
  optionCardSelected: {
    backgroundColor: THEME.optionSelectedBg,
    borderColor: THEME.selectedBorder,
  },
  levelBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: THEME.purpleLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelBadgeSelected: {
    backgroundColor: THEME.purple,
  },
  optionTextWrap: {
    flex: 1,
    gap: 2,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 20,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: THEME.purple,
    minHeight: 60,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  resultContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  resultIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.successLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultTitle: {
    textAlign: 'center',
  },
  scoreCard: {
    alignItems: 'center',
    backgroundColor: Colors.card,
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 20,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 4,
  },
  interpretationText: {
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  doneButton: {
    backgroundColor: THEME.purple,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
    marginTop: 12,
  },
});
