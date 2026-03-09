import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Dimensions } from 'react-native';
import { ScaledText } from '@/components/ScaledText';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';

let FaceDetection: any = null;
try {
  FaceDetection = require('../modules/face-detection');
} catch {
  // Module not available (Expo Go), will use manual confirmation fallback
}

type FaceStatus = 'noFace' | 'tooSmall' | 'tooFarLeft' | 'tooFarRight' | 'tooFarUp' | 'tooFarDown' | 'inPosition';

interface FacePositionGuideProps {
  visible: boolean;
  isRecordingMode?: boolean;
  onConfirmPositioned?: () => void;
  onDismiss?: () => void;
  containerWidth?: number;
  containerHeight?: number;
}

const OVAL_WIDTH_RATIO = 0.55;
const OVAL_HEIGHT_RATIO = 0.40;
const SIZE_THRESHOLD = 0.15;
const POSITION_TOLERANCE = 0.25;

function getStatusText(status: FaceStatus, t: (key: string) => string): { en: string; zh: string } {
  switch (status) {
    case 'noFace': return { en: 'No face detected', zh: t('faceStatusNoFace') };
    case 'tooSmall': return { en: 'Move closer', zh: t('faceStatusTooSmall') };
    case 'tooFarLeft': return { en: 'Move right', zh: t('faceStatusMoveRight') };
    case 'tooFarRight': return { en: 'Move left', zh: t('faceStatusMoveLeft') };
    case 'tooFarUp': return { en: 'Move down', zh: t('faceStatusMoveDown') };
    case 'tooFarDown': return { en: 'Move up', zh: t('faceStatusMoveUp') };
    case 'inPosition': return { en: 'Perfect! Face in position ✓', zh: t('faceStatusInPosition') };
  }
}

function getStatusColor(status: FaceStatus): string {
  switch (status) {
    case 'inPosition': return '#22C55E';
    case 'noFace': return 'rgba(255,255,255,0.7)';
    default: return '#F97316';
  }
}

function getOvalColor(status: FaceStatus): string {
  switch (status) {
    case 'inPosition': return '#22C55E';
    case 'noFace': return 'rgba(255,255,255,0.7)';
    default: return '#EF4444';
  }
}

function FacePositionGuideInner({
  visible,
  isRecordingMode = false,
  onConfirmPositioned,
  onDismiss,
  containerWidth,
  containerHeight,
}: FacePositionGuideProps) {
  const { t } = useApp();
  const [faceStatus, setFaceStatus] = useState<FaceStatus>('noFace');
  const [hasFaceDetection, setHasFaceDetection] = useState<boolean>(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const stableCountRef = useRef<number>(0);
  const subscriptionRef = useRef<any>(null);

  const screenW = containerWidth || Dimensions.get('window').width;
  const screenH = containerHeight || Dimensions.get('window').height;

  const ovalW = screenW * OVAL_WIDTH_RATIO;
  const ovalH = screenH * OVAL_HEIGHT_RATIO;
  const ovalX = (screenW - ovalW) / 2;
  const ovalY = (screenH - ovalH) / 2 - screenH * 0.05;

  useEffect(() => {
    if (FaceDetection && FaceDetection.startDetection) {
      setHasFaceDetection(true);
    }
  }, []);

  useEffect(() => {
    if (!visible || !hasFaceDetection) return;

    try {
      FaceDetection.startDetection();
    } catch (e) {
      console.log('[FaceGuide] Failed to start face detection:', e);
      setHasFaceDetection(false);
      return;
    }

    subscriptionRef.current = FaceDetection.addFaceDetectionListener(
      (event: { hasFace: boolean; bounds: { x: number; y: number; width: number; height: number } | null }) => {
        if (!event.hasFace || !event.bounds) {
          stableCountRef.current = 0;
          setFaceStatus('noFace');
          return;
        }

        const b = event.bounds;
        const faceScreenX = b.x * screenW;
        const faceScreenY = (1 - b.y - b.height) * screenH;
        const faceScreenW = b.width * screenW;
        const faceScreenH = b.height * screenH;

        const faceArea = faceScreenW * faceScreenH;
        const ovalArea = ovalW * ovalH;
        const sizeRatio = faceArea / ovalArea;

        if (sizeRatio < SIZE_THRESHOLD) {
          stableCountRef.current = 0;
          setFaceStatus('tooSmall');
          return;
        }

        const faceCenterX = faceScreenX + faceScreenW / 2;
        const faceCenterY = faceScreenY + faceScreenH / 2;
        const ovalCenterX = ovalX + ovalW / 2;
        const ovalCenterY = ovalY + ovalH / 2;

        const toleranceX = ovalW * POSITION_TOLERANCE;
        const toleranceY = ovalH * POSITION_TOLERANCE;

        const dx = faceCenterX - ovalCenterX;
        const dy = faceCenterY - ovalCenterY;

        if (Math.abs(dx) > toleranceX) {
          stableCountRef.current = 0;
          setFaceStatus(dx > 0 ? 'tooFarRight' : 'tooFarLeft');
          return;
        }

        if (Math.abs(dy) > toleranceY) {
          stableCountRef.current = 0;
          setFaceStatus(dy > 0 ? 'tooFarDown' : 'tooFarUp');
          return;
        }

        stableCountRef.current += 1;
        setFaceStatus('inPosition');
      }
    );

    return () => {
      try {
        FaceDetection.stopDetection();
      } catch (e) {
        console.log('[FaceGuide] Failed to stop face detection:', e);
      }
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      stableCountRef.current = 0;
    };
  }, [visible, hasFaceDetection, screenW, screenH, ovalW, ovalH, ovalX, ovalY]);

  useEffect(() => {
    if (visible) {
      setFaceStatus('noFace');
      stableCountRef.current = 0;
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.03, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.97, duration: 1200, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [visible, fadeAnim, pulseAnim]);

  const handleConfirm = useCallback(() => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      onConfirmPositioned?.();
    });
  }, [fadeAnim, onConfirmPositioned]);

  const handleDismiss = useCallback(() => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      onDismiss?.();
    });
  }, [fadeAnim, onDismiss]);

  // Auto-confirm in recording mode when face stable for ~1.5 seconds
  useEffect(() => {
    if (!isRecordingMode || !hasFaceDetection || faceStatus !== 'inPosition') return;

    if (stableCountRef.current >= 6) {
      handleConfirm();
    }
  }, [faceStatus, isRecordingMode, hasFaceDetection, handleConfirm]);

  if (!visible) return null;

  const ovalColor = getOvalColor(faceStatus);
  const isInPosition = faceStatus === 'inPosition';
  const statusInfo = getStatusText(faceStatus, t);

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} pointerEvents="box-none">
      <View style={styles.topSection} pointerEvents="none">
        {hasFaceDetection ? (
          <>
            <ScaledText size={16} weight="700" color={getStatusColor(faceStatus)} style={styles.statusText}>
              {statusInfo.en}
            </ScaledText>
            <ScaledText size={13} color={getStatusColor(faceStatus)} style={styles.statusSubtext}>
              {statusInfo.zh}
            </ScaledText>
          </>
        ) : (
          <>
            <ScaledText size={15} weight="700" color="#fff" style={styles.statusText}>
              {t('positionYourFace')}
            </ScaledText>
            <ScaledText size={12} color="rgba(255,255,255,0.8)" style={styles.statusSubtext}>
              {t('positionYourFaceHint')}
            </ScaledText>
          </>
        )}
      </View>

      <View style={styles.guideContainer} pointerEvents="none">
        <Animated.View style={[{ transform: [{ scale: pulseAnim }] }]}>
          <View
            style={[
              styles.headOval,
              {
                width: ovalW,
                height: ovalH,
                borderRadius: ovalW / 2,
                borderColor: ovalColor,
                borderStyle: isInPosition ? 'solid' as const : 'dashed' as const,
                borderWidth: isInPosition ? 3 : 2,
              },
            ]}
          >
            <View style={styles.eyeRow}>
              <View style={[styles.eyeGuide, { borderColor: 'rgba(255,255,255,0.35)' }]} />
              <View style={[styles.eyeGuide, { borderColor: 'rgba(255,255,255,0.35)' }]} />
            </View>
            <View style={[styles.noseGuide, { borderColor: 'rgba(255,255,255,0.3)' }]} />
            <View style={[styles.mouthGuide, { borderColor: 'rgba(255,255,255,0.3)' }]} />
          </View>
          <View style={styles.shoulderRow}>
            <View style={styles.shoulderLine} />
            <View style={styles.shoulderGap} />
            <View style={styles.shoulderLine} />
          </View>
        </Animated.View>
      </View>

      <View style={styles.bottomSection}>
        {isRecordingMode ? (
          hasFaceDetection ? (
            <TouchableOpacity
              style={[
                styles.confirmButton,
                { backgroundColor: isInPosition ? Colors.success : 'rgba(255,255,255,0.15)' },
              ]}
              onPress={isInPosition ? handleConfirm : undefined}
              activeOpacity={isInPosition ? 0.8 : 1}
              disabled={!isInPosition}
            >
              <ScaledText size={16} weight="700" color={isInPosition ? '#fff' : 'rgba(255,255,255,0.4)'}>
                {isInPosition ? t('imInPosition') : t('positionBeforeRecording')}
              </ScaledText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <ScaledText size={16} weight="700" color="#fff">
                {t('imInPosition')}
              </ScaledText>
            </TouchableOpacity>
          )
        ) : (
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={handleDismiss}
            activeOpacity={0.8}
          >
            <ScaledText size={14} weight="600" color="#fff">
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
  topSection: {
    paddingTop: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingBottom: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  statusText: {
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  statusSubtext: {
    textAlign: 'center',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  guideContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headOval: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  eyeRow: {
    flexDirection: 'row',
    gap: 36,
    marginBottom: 16,
    marginTop: -10,
  },
  eyeGuide: {
    width: 24,
    height: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  noseGuide: {
    width: 8,
    height: 18,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    marginBottom: 12,
  },
  mouthGuide: {
    width: 32,
    height: 10,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  shoulderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    width: 200,
  },
  shoulderLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 1,
  },
  shoulderGap: {
    width: 50,
  },
  bottomSection: {
    paddingBottom: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  confirmButton: {
    backgroundColor: Colors.success,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    minWidth: 200,
    alignItems: 'center',
  },
  dismissButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
});
