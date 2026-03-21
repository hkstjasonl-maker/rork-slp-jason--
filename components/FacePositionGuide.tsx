import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Platform, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ScaledText } from '@/components/ScaledText';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const OVAL_WIDTH = Math.min(SCREEN_WIDTH * 0.52, 200);
const OVAL_HEIGHT = OVAL_WIDTH * 1.35;

interface FacePositionGuideProps {
  visible: boolean;
  isRecordingMode?: boolean;
  onConfirmPositioned?: () => void;
  onDismiss?: () => void;
}

function FacePositionGuideInner({ visible, isRecordingMode = false, onConfirmPositioned, onDismiss }: FacePositionGuideProps) {
  const { t } = useApp();
  const [confirmed, setConfirmed] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setConfirmed(false);
      fadeAnim.setValue(0);
      scanAnim.setValue(0);
      arrowAnim.setValue(0);

      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.02, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.98, duration: 1500, useNativeDriver: true }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, { toValue: 1, duration: 2500, useNativeDriver: true }),
          Animated.timing(scanAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 0.9, duration: 1200, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.4, duration: 1200, useNativeDriver: true }),
        ])
      ).start();

      if (!isRecordingMode) {
        Animated.loop(
          Animated.sequence([
            Animated.timing(arrowAnim, { toValue: 8, duration: 600, useNativeDriver: true }),
            Animated.timing(arrowAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
          ])
        ).start();
      }
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      scanAnim.stopAnimation();
      glowAnim.stopAnimation();
      arrowAnim.stopAnimation();
    }
  }, [visible, isRecordingMode, fadeAnim, pulseAnim, scanAnim, glowAnim, arrowAnim]);

  const handleConfirm = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setConfirmed(true);
    Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      onConfirmPositioned?.();
    });
  }, [fadeAnim, onConfirmPositioned]);

  const handleDismiss = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
      onDismiss?.();
    });
  }, [fadeAnim, onDismiss]);

  if (!visible || confirmed) return null;

  const scanTranslate = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-OVAL_HEIGHT / 2, OVAL_HEIGHT / 2],
  });

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} pointerEvents="box-none">
      <View style={styles.vignetteTop} pointerEvents="none" />
      <View style={styles.vignetteBottom} pointerEvents="none" />

      <View style={styles.topBanner} pointerEvents="none">
        <View style={styles.topBannerBg}>
          <ScaledText size={16} weight="700" color="#fff" style={styles.topText}>
            {isRecordingMode ? t('positionBeforeRecording') : t('positionYourFace')}
          </ScaledText>
          <ScaledText size={12} color="rgba(255,255,255,0.85)" style={styles.topSubtext}>
            {t('positionYourFaceHint')}
          </ScaledText>
        </View>
      </View>

      <View style={styles.guideContainer} pointerEvents="none">
        <Animated.View style={[styles.ovalWrapper, { transform: [{ scale: pulseAnim }] }]}>
          <Animated.View style={[styles.ovalGlow, { opacity: glowAnim }]} />

          <View style={styles.headOval}>
            <Animated.View
              style={[
                styles.scanLine,
                { transform: [{ translateY: scanTranslate }] },
              ]}
            />

            <View style={styles.faceHints}>
              <View style={styles.eyebrowRow}>
                <View style={styles.eyebrow} />
                <View style={styles.eyebrow} />
              </View>

              <View style={styles.eyeRow}>
                <View style={styles.eyeGuide}>
                  <View style={styles.iris} />
                </View>
                <View style={styles.eyeGuide}>
                  <View style={styles.iris} />
                </View>
              </View>

              <View style={styles.noseGuide}>
                <View style={styles.noseTip} />
              </View>

              <View style={styles.mouthGuide} />
            </View>
          </View>

          {!isRecordingMode && (
            <>
              <Animated.View style={[styles.arrowDown, { transform: [{ translateY: arrowAnim }] }]}>
                <ScaledText size={18} color="rgba(255,255,255,0.6)">↓</ScaledText>
              </Animated.View>
              <Animated.View style={[styles.arrowUp, { transform: [{ translateY: Animated.multiply(arrowAnim, new Animated.Value(-1)) }] }]}>
                <ScaledText size={18} color="rgba(255,255,255,0.6)">↑</ScaledText>
              </Animated.View>
            </>
          )}

          <View style={styles.shoulderRow}>
            <View style={styles.shoulderLine} />
            <View style={styles.shoulderGap} />
            <View style={styles.shoulderLine} />
          </View>
        </Animated.View>
      </View>

      <View style={styles.bottomSection}>
        {isRecordingMode ? (
          <>
            <View style={styles.recordingHintBox}>
              <ScaledText size={13} weight="600" color="rgba(255,255,255,0.9)" style={styles.recordingHintText}>
                {t('faceStatusAlignHint')}
              </ScaledText>
            </View>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirm}
              activeOpacity={0.8}
              testID="face-position-confirm"
            >
              <View style={styles.confirmButtonInner}>
                <View style={styles.confirmCheckmark}>
                  <ScaledText size={18} color="#fff">✓</ScaledText>
                </View>
                <ScaledText size={16} weight="700" color="#fff">
                  {t('imInPosition')}
                </ScaledText>
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={handleDismiss}
            activeOpacity={0.8}
            testID="face-position-dismiss"
          >
            <ScaledText size={15} weight="600" color="#fff">
              {t('gotIt')}
            </ScaledText>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

export const FacePositionGuide = React.memo(FacePositionGuideInner);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 25,
    justifyContent: 'space-between',
  },
  vignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '25%',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  vignetteBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '20%',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  topBanner: {
    paddingTop: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 30,
  },
  topBannerBg: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
  },
  topText: {
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  topSubtext: {
    textAlign: 'center',
    marginTop: 4,
  },
  guideContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ovalWrapper: {
    alignItems: 'center',
  },
  ovalGlow: {
    position: 'absolute',
    width: OVAL_WIDTH + 16,
    height: OVAL_HEIGHT + 16,
    borderRadius: (OVAL_WIDTH + 16) / 2,
    borderWidth: 3,
    borderColor: 'rgba(74,155,173,0.5)',
    top: -8,
    left: -8,
  },
  headOval: {
    width: OVAL_WIDTH,
    height: OVAL_HEIGHT,
    borderRadius: OVAL_WIDTH / 2,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.75)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  scanLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: 'rgba(74,155,173,0.4)',
    borderRadius: 1,
  },
  faceHints: {
    alignItems: 'center',
    gap: 8,
  },
  eyebrowRow: {
    flexDirection: 'row',
    gap: 40,
    marginBottom: -2,
  },
  eyebrow: {
    width: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  eyeRow: {
    flexDirection: 'row',
    gap: 32,
  },
  eyeGuide: {
    width: 28,
    height: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iris: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  noseGuide: {
    alignItems: 'center',
    marginTop: 4,
  },
  noseTip: {
    width: 14,
    height: 10,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  mouthGuide: {
    width: 30,
    height: 8,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    marginTop: 6,
  },
  arrowDown: {
    position: 'absolute',
    bottom: -30,
    alignSelf: 'center',
  },
  arrowUp: {
    position: 'absolute',
    top: -30,
    alignSelf: 'center',
  },
  shoulderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    width: OVAL_WIDTH * 1.3,
  },
  shoulderLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
  },
  shoulderGap: {
    width: OVAL_WIDTH * 0.35,
  },
  bottomSection: {
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    zIndex: 30,
  },
  recordingHintBox: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 14,
  },
  recordingHintText: {
    textAlign: 'center',
  },
  confirmButton: {
    backgroundColor: Colors.success,
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 30,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 240,
    alignItems: 'center',
  },
  confirmButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confirmCheckmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    minWidth: 160,
    alignItems: 'center',
  },
});
