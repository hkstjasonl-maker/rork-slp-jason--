import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Modal,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { X, Wind, Play } from 'lucide-react-native';
import { ScaledText } from '@/components/ScaledText';
import { useApp } from '@/contexts/AppContext';

const STORAGE_KEY_DURATION = 'rest_timer_last_duration';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CIRCLE_SIZE = SCREEN_WIDTH * 0.58;
const STROKE_WIDTH = 8;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const DURATIONS = [
  { label: '30', unit: 'sec', seconds: 30 },
  { label: '1', unit: 'min', seconds: 60 },
  { label: '2', unit: 'min', seconds: 120 },
  { label: '5', unit: 'min', seconds: 300 },
  { label: '10', unit: 'min', seconds: 600 },
];

const REST_MESSAGES_KEYS = [
  'restMsg1', 'restMsg2', 'restMsg3', 'restMsg4', 'restMsg5',
  'restMsg6', 'restMsg7', 'restMsg8', 'restMsg9', 'restMsg10',
];

const BREATHE_IN_MS = 4000;
const HOLD_MS = 2000;
const BREATHE_OUT_MS = 6000;
const BREATH_CYCLE_MS = BREATHE_IN_MS + HOLD_MS + BREATHE_OUT_MS;

type TimerPhase = 'select' | 'running' | 'done';

interface RestTimerProps {
  visible: boolean;
  onClose: () => void;
  onContinue: () => void;
  hasNext?: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function RestTimer({ visible, onClose, onContinue, hasNext = false }: RestTimerProps) {
  const { t } = useApp();
  const [phase, setPhase] = useState<TimerPhase>('select');
  const [totalSeconds, setTotalSeconds] = useState<number>(60);
  const [remaining, setRemaining] = useState<number>(60);
  const [messageIndex, setMessageIndex] = useState<number>(0);
  const [showBreathing, setShowBreathing] = useState<boolean>(false);
  const [breathPhase, setBreathPhase] = useState<'in' | 'hold' | 'out'>('in');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breathTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ringProgress = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const breathScale = useRef(new Animated.Value(0.6)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const doneScale = useRef(new Animated.Value(0.8)).current;

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (messageTimerRef.current) { clearInterval(messageTimerRef.current); messageTimerRef.current = null; }
    if (breathTimerRef.current) { clearInterval(breathTimerRef.current); breathTimerRef.current = null; }
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
    ringProgress.stopAnimation();
    breathScale.stopAnimation();
  }, [pulseAnim, ringProgress, breathScale]);

  useEffect(() => {
    if (visible) {
      AsyncStorage.getItem(STORAGE_KEY_DURATION).then((val) => {
        if (val) {
          const parsed = parseInt(val, 10);
          if (parsed > 0) {
            setTotalSeconds(parsed);
            setRemaining(parsed);
          }
        }
      }).catch(() => {});
      setPhase('select');
      fadeIn.setValue(0);
      Animated.timing(fadeIn, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } else {
      cleanup();
      setPhase('select');
      setShowBreathing(false);
      setBreathPhase('in');
    }
  }, [visible, fadeIn, cleanup]);

  const startTimer = useCallback((seconds: number) => {
    cleanup();
    setTotalSeconds(seconds);
    setRemaining(seconds);
    setPhase('running');
    setMessageIndex(Math.floor(Math.random() * REST_MESSAGES_KEYS.length));

    AsyncStorage.setItem(STORAGE_KEY_DURATION, String(seconds)).catch(() => {});

    ringProgress.setValue(0);
    Animated.timing(ringProgress, {
      toValue: 1,
      duration: seconds * 1000,
      useNativeDriver: false,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.96, duration: 2000, useNativeDriver: true }),
      ])
    ).start();

    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setPhase('done');
          if (Platform.OS !== 'web') {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          doneScale.setValue(0.8);
          Animated.spring(doneScale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    messageTimerRef.current = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % REST_MESSAGES_KEYS.length);
    }, 15000);

    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [cleanup, ringProgress, pulseAnim, doneScale]);

  useEffect(() => {
    if (phase === 'done') {
      cleanup();
    }
  }, [phase, cleanup]);

  useEffect(() => {
    if (!showBreathing || phase !== 'running') {
      if (breathTimerRef.current) { clearInterval(breathTimerRef.current); breathTimerRef.current = null; }
      breathScale.stopAnimation();
      breathScale.setValue(0.6);
      return;
    }

    const runBreathCycle = () => {
      setBreathPhase('in');
      breathScale.setValue(0.6);
      Animated.timing(breathScale, { toValue: 1, duration: BREATHE_IN_MS, useNativeDriver: true }).start(() => {
        if (!showBreathing) return;
        setBreathPhase('hold');
        setTimeout(() => {
          if (!showBreathing) return;
          setBreathPhase('out');
          Animated.timing(breathScale, { toValue: 0.6, duration: BREATHE_OUT_MS, useNativeDriver: true }).start();
        }, HOLD_MS);
      });
    };

    runBreathCycle();
    breathTimerRef.current = setInterval(runBreathCycle, BREATH_CYCLE_MS);

    return () => {
      if (breathTimerRef.current) { clearInterval(breathTimerRef.current); breathTimerRef.current = null; }
    };
  }, [showBreathing, phase, breathScale]);

  const handleClose = useCallback(() => {
    cleanup();
    onClose();
  }, [cleanup, onClose]);

  const handleContinue = useCallback(() => {
    cleanup();
    onContinue();
  }, [cleanup, onContinue]);

  const handleRestMore = useCallback(() => {
    cleanup();
    setPhase('select');
    setShowBreathing(false);
  }, [cleanup]);

  const strokeDashoffset = useMemo(() => {
    return ringProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, CIRCUMFERENCE],
    });
  }, [ringProgress]);

  const currentMessage = t(REST_MESSAGES_KEYS[messageIndex]);

  const breathLabel = breathPhase === 'in' ? t('breatheIn')
    : breathPhase === 'hold' ? t('hold')
    : t('breatheOut');

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <Animated.View style={[styles.container, { opacity: fadeIn }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleClose}
            activeOpacity={0.7}
            testID="rest-timer-close"
          >
            <X size={22} color="#fff" />
          </TouchableOpacity>
          <ScaledText size={17} weight="600" color="#fff">
            {t('takeABreak')}
          </ScaledText>
          <View style={{ width: 40 }} />
        </View>

        {phase === 'select' && (
          <View style={styles.selectContainer}>
            <View style={styles.selectIconCircle}>
              <Wind size={40} color="#B8D8E8" />
            </View>
            <ScaledText size={20} weight="700" color="#fff" style={styles.selectTitle}>
              {t('selectDuration')}
            </ScaledText>
            <View style={styles.durationRow}>
              {DURATIONS.map((d) => {
                const isSelected = d.seconds === totalSeconds;
                return (
                  <TouchableOpacity
                    key={d.seconds}
                    style={[styles.durationBtn, isSelected && styles.durationBtnSelected]}
                    onPress={() => startTimer(d.seconds)}
                    activeOpacity={0.7}
                    testID={`rest-duration-${d.seconds}`}
                  >
                    <ScaledText size={18} weight="700" color={isSelected ? '#1a3a4a' : '#fff'}>
                      {d.label}
                    </ScaledText>
                    <ScaledText size={11} weight="600" color={isSelected ? '#1a3a4a' : 'rgba(255,255,255,0.7)'}>
                      {d.unit === 'sec' ? t('sec') : t('min')}
                    </ScaledText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {phase === 'running' && (
          <View style={styles.runningContainer}>
            <Animated.View style={[styles.timerCircleOuter, { transform: [{ scale: pulseAnim }] }]}>
              <View style={styles.timerCircle}>
                {Platform.OS === 'web' ? (
                  <View style={styles.webCircleTrack}>
                    <ScaledText size={48} weight="700" color="#fff" style={styles.timeText}>
                      {formatTime(remaining)}
                    </ScaledText>
                  </View>
                ) : (
                  <>
                    <View style={styles.svgContainer}>
                      {(() => {
                        const Svg = require('react-native-svg');
                        return (
                          <Svg.Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
                            <Svg.Circle
                              cx={CIRCLE_SIZE / 2}
                              cy={CIRCLE_SIZE / 2}
                              r={RADIUS}
                              stroke="rgba(255,255,255,0.15)"
                              strokeWidth={STROKE_WIDTH}
                              fill="transparent"
                            />
                            <AnimatedCircle
                              cx={CIRCLE_SIZE / 2}
                              cy={CIRCLE_SIZE / 2}
                              r={RADIUS}
                              stroke="#B8D8E8"
                              strokeWidth={STROKE_WIDTH}
                              fill="transparent"
                              strokeLinecap="round"
                              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                              strokeDashoffset={strokeDashoffset}
                              transform={`rotate(-90 ${CIRCLE_SIZE / 2} ${CIRCLE_SIZE / 2})`}
                            />
                          </Svg.Svg>
                        );
                      })()}
                    </View>
                    <View style={styles.timeOverlay}>
                      <ScaledText size={48} weight="700" color="#fff" style={styles.timeText}>
                        {formatTime(remaining)}
                      </ScaledText>
                    </View>
                  </>
                )}
              </View>
            </Animated.View>

            <View style={styles.messageContainer}>
              <ScaledText size={15} weight="500" color="rgba(255,255,255,0.85)" style={styles.messageText}>
                {String(currentMessage)}
              </ScaledText>
            </View>

            {showBreathing && (
              <View style={styles.breathContainer}>
                <Animated.View style={[styles.breathCircle, { transform: [{ scale: breathScale }] }]}>
                  <ScaledText size={14} weight="700" color="#1a3a4a">
                    {String(breathLabel)}
                  </ScaledText>
                </Animated.View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.breathToggle, showBreathing && styles.breathToggleActive]}
              onPress={() => {
                setShowBreathing((prev) => !prev);
                if (Platform.OS !== 'web') {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
              }}
              activeOpacity={0.7}
              testID="breathing-toggle"
            >
              <Wind size={16} color={showBreathing ? '#1a3a4a' : 'rgba(255,255,255,0.8)'} />
              <ScaledText size={13} weight="600" color={showBreathing ? '#1a3a4a' : 'rgba(255,255,255,0.8)'}>
                {t('breathingGuide')}
              </ScaledText>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'done' && (
          <Animated.View style={[styles.doneContainer, { transform: [{ scale: doneScale }] }]}>
            <View style={styles.doneIconCircle}>
              <Play size={36} color="#B8D8E8" />
            </View>
            <ScaledText size={20} weight="700" color="#fff" style={styles.doneTitle}>
              {t('readyToContinue')}
            </ScaledText>
            <TouchableOpacity
              style={styles.continueBtn}
              onPress={handleContinue}
              activeOpacity={0.8}
              testID="rest-continue"
            >
              <ScaledText size={17} weight="700" color="#1a3a4a">
                {hasNext ? t('continueExercises') : t('continue')}
              </ScaledText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.restMoreBtn}
              onPress={handleRestMore}
              activeOpacity={0.7}
              testID="rest-more"
            >
              <ScaledText size={15} weight="600" color="rgba(255,255,255,0.8)">
                {t('restMore')}
              </ScaledText>
            </TouchableOpacity>
          </Animated.View>
        )}
      </Animated.View>
    </Modal>
  );
}

let AnimatedCircle: React.ComponentType<any>;
if (Platform.OS !== 'web') {
  try {
    const Svg = require('react-native-svg');
    AnimatedCircle = Animated.createAnimatedComponent(Svg.Circle);
  } catch {
    AnimatedCircle = View as any;
  }
} else {
  AnimatedCircle = View as any;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a3a4a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  selectIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(184,216,232,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  selectTitle: {
    textAlign: 'center',
    marginBottom: 32,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  durationBtn: {
    width: 64,
    height: 74,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: 2,
  },
  durationBtnSelected: {
    backgroundColor: '#B8D8E8',
    borderColor: '#B8D8E8',
  },
  runningContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  timerCircleOuter: {
    marginBottom: 24,
  },
  timerCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  svgContainer: {
    position: 'absolute',
  },
  webCircleTrack: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: STROKE_WIDTH,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeText: {
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  messageContainer: {
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  messageText: {
    textAlign: 'center',
    lineHeight: 22,
  },
  breathContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  breathCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#B8D8E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  breathToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  breathToggleActive: {
    backgroundColor: '#B8D8E8',
    borderColor: '#B8D8E8',
  },
  doneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  doneIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(184,216,232,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  doneTitle: {
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 28,
  },
  continueBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#B8D8E8',
    alignItems: 'center',
    marginBottom: 14,
  },
  restMoreBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
});
