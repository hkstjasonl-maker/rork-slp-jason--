import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScaledText as Text } from '@/components/ScaledText';
import Colors from '@/constants/colors';
import { List, Wand2 } from 'lucide-react-native';
import { log } from '@/lib/logger';

export type AssessmentViewMode = 'checklist' | 'guided';

const STORAGE_KEY = 'assessment_view_mode';

export async function getSavedViewMode(): Promise<AssessmentViewMode> {
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEY);
    if (val === 'guided' || val === 'checklist') return val;
  } catch (e) {
    log('[AssessmentModePicker] Error reading saved mode:', e);
  }
  return 'checklist';
}

export async function saveViewMode(mode: AssessmentViewMode): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, mode);
    log('[AssessmentModePicker] Saved mode:', mode);
  } catch (e) {
    log('[AssessmentModePicker] Error saving mode:', e);
  }
}

interface Props {
  visible: boolean;
  onSelectMode: (mode: AssessmentViewMode) => void;
  onClose: () => void;
  t: (key: string) => string;
}

export default function AssessmentModePicker({ visible, onSelectMode, onClose, t }: Props) {
  const slideAnim = useRef(new Animated.Value(300)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, slideAnim, backdropAnim]);

  const handleSelect = (mode: AssessmentViewMode) => {
    void saveViewMode(mode);
    onSelectMode(mode);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.handle} />

          <Text size={18} weight="bold" color={Colors.textPrimary} style={styles.sheetTitle}>
            {t('wizardModeTitle')}
          </Text>

          <View style={styles.cardsRow}>
            <TouchableOpacity
              style={styles.modeCard}
              onPress={() => handleSelect('checklist')}
              activeOpacity={0.7}
              testID="mode-checklist"
              accessibilityLabel={t('wizardChecklist')}
              accessibilityRole="button"
            >
              <View style={[styles.modeIconWrap, { backgroundColor: '#EBF3FE' }]}>
                <List size={28} color="#3B7DD8" />
              </View>
              <Text size={16} weight="600" color={Colors.textPrimary} style={styles.modeLabel}>
                {t('wizardChecklist')}
              </Text>
              <Text size={13} color={Colors.textSecondary} style={styles.modeDesc}>
                {t('wizardChecklistDesc')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modeCard}
              onPress={() => handleSelect('guided')}
              activeOpacity={0.7}
              testID="mode-guided"
              accessibilityLabel={t('wizardGuided')}
              accessibilityRole="button"
            >
              <View style={[styles.modeIconWrap, { backgroundColor: '#E1F5EE' }]}>
                <Wand2 size={28} color="#1D9E75" />
              </View>
              <Text size={16} weight="600" color={Colors.textPrimary} style={styles.modeLabel}>
                {t('wizardGuided')}
              </Text>
              <Text size={13} color={Colors.textSecondary} style={styles.modeDesc}>
                {t('wizardGuidedDesc')}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetTitle: {
    textAlign: 'center',
    marginBottom: 20,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modeCard: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 8,
  },
  modeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  modeLabel: {
    textAlign: 'center',
  },
  modeDesc: {
    textAlign: 'center',
    lineHeight: 18,
  },
});
