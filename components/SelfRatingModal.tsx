import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { ScaledText } from '@/components/ScaledText';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';

interface SelfRatingModalProps {
  visible: boolean;
  onSkip: () => void;
  onSave: (rating: number) => void;
}

const RATINGS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function SelfRatingModalInner({ visible, onSkip, onSave }: SelfRatingModalProps) {
  const { t } = useApp();
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const scaleAnims = useRef(RATINGS.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    if (visible) {
      setSelectedRating(null);
      fadeAnim.setValue(0);
      slideAnim.setValue(40);
      scaleAnims.forEach((a) => a.setValue(1));

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 9,
          useNativeDriver: true,
        }),
      ]).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleSelect = useCallback((rating: number) => {
    setSelectedRating(rating);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Animated.sequence([
      Animated.timing(scaleAnims[rating], {
        toValue: 1.25,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnims[rating], {
        toValue: 1,
        tension: 200,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(() => {
    if (selectedRating !== null) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      onSave(selectedRating);
    }
  }, [selectedRating, onSave]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.handleBar} />

          <ScaledText size={22} weight="bold" color={Colors.textPrimary} style={styles.title}>
            {t('howDidYouDo')}
          </ScaledText>

          <ScaledText size={14} color={Colors.textSecondary} style={styles.subtitle}>
            {t('selfRating')}
          </ScaledText>

          <View style={styles.ratingsContainer}>
            {RATINGS.map((rating) => {
              const isSelected = selectedRating === rating;
              return (
                <Animated.View
                  key={rating}
                  style={{ transform: [{ scale: scaleAnims[rating] }] }}
                >
                  <TouchableOpacity
                    style={[
                      styles.ratingCircle,
                      isSelected && styles.ratingCircleSelected,
                    ]}
                    onPress={() => handleSelect(rating)}
                    activeOpacity={0.7}
                    testID={`rating-circle-${rating}`}
                  >
                    <ScaledText
                      size={13}
                      weight={isSelected ? 'bold' : '500'}
                      color={isSelected ? Colors.white : Colors.textPrimary}
                    >
                      {rating}
                    </ScaledText>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>

          <View style={styles.labelsRow}>
            <ScaledText size={12} color={Colors.textSecondary}>
              {t('veryDifficult')}
            </ScaledText>
            <ScaledText size={12} color={Colors.textSecondary}>
              {t('veryEasy')}
            </ScaledText>
          </View>

          <View style={styles.buttonsRow}>
            <TouchableOpacity
              style={styles.skipButton}
              onPress={onSkip}
              activeOpacity={0.7}
              testID="skip-rating-button"
            >
              <ScaledText size={16} weight="600" color={Colors.textSecondary}>
                {t('skipRating')}
              </ScaledText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveButton,
                selectedRating === null && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={selectedRating === null}
              activeOpacity={0.8}
              testID="save-rating-button"
            >
              <ScaledText
                size={16}
                weight="bold"
                color={selectedRating !== null ? Colors.white : Colors.disabled}
              >
                {t('saveRating')}
              </ScaledText>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export const SelfRatingModal = React.memo(SelfRatingModalInner);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 20,
  },
  title: {
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 20,
  },
  ratingsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    width: '100%',
  },
  ratingCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  ratingCircleSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  skipButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  saveButtonDisabled: {
    backgroundColor: Colors.primaryLight,
  },
});
