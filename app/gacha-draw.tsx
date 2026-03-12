import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Animated,
  Modal,
  Image,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { log } from '@/lib/logger';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const RARITY_CAPSULE_COLORS: Record<string, string> = {
  common: '#F48FB1',
  uncommon: '#64B5F6',
  rare: '#FFD54F',
  epic: '#CE93D8',
  legendary: '#BA68C8',
};

const RARITY_CAPSULE_IMAGES: Record<string, string> = {
  common: 'https://pfgtnrlgetomfmrzbxgb.supabase.co/storage/v1/object/public/flowers/capsule-pink.png',
  uncommon: 'https://pfgtnrlgetomfmrzbxgb.supabase.co/storage/v1/object/public/flowers/capsule-blue.png',
  rare: 'https://pfgtnrlgetomfmrzbxgb.supabase.co/storage/v1/object/public/flowers/capsule-gold.png',
  epic: 'https://pfgtnrlgetomfmrzbxgb.supabase.co/storage/v1/object/public/flowers/capsule-purple.png',
  legendary: 'https://pfgtnrlgetomfmrzbxgb.supabase.co/storage/v1/object/public/flowers/capsule-purple.png',
};

const RARITY_GLOW_COLORS: Record<string, string> = {
  common: 'rgba(244,143,177,0.4)',
  uncommon: 'rgba(100,181,246,0.4)',
  rare: 'rgba(255,213,79,0.5)',
  epic: 'rgba(206,147,216,0.5)',
  legendary: 'rgba(186,104,200,0.6)',
};

const RARITY_LABELS: Record<string, { label: string; labelZh: string }> = {
  common: { label: 'Common', labelZh: '普通' },
  uncommon: { label: 'Uncommon', labelZh: '不常見' },
  rare: { label: 'Rare', labelZh: '稀有' },
  epic: { label: 'Epic', labelZh: '史詩' },
  legendary: { label: 'Legendary', labelZh: '傳說' },
};

interface FlowerType {
  id: string;
  name_en: string;
  name_zh: string;
  image_url: string;
  rarity: string;
  rarity_weight: number;
  is_active: boolean;
}

interface DrawResult {
  flower: FlowerType;
  isSecondDraw: boolean;
}

type DrawPhase =
  | 'idle'
  | 'shaking'
  | 'dropping'
  | 'opening'
  | 'revealing'
  | 'done'
  | 'waiting_second'
  | 'complete';

const GRID_COLS = 4;
const GRID_ROWS = 5;
const TOTAL_SLOTS = GRID_COLS * GRID_ROWS;

function weightedRandomPick(flowers: FlowerType[]): FlowerType {
  const totalWeight = flowers.reduce((sum, f) => sum + (f.rarity_weight || 1), 0);
  let random = Math.random() * totalWeight;
  for (const flower of flowers) {
    random -= (flower.rarity_weight || 1);
    if (random <= 0) return flower;
  }
  return flowers[flowers.length - 1];
}

const GACHA_MACHINE_URL = 'https://pfgtnrlgetomfmrzbxgb.supabase.co/storage/v1/object/public/flowers/gacha-machine.png';

function CapsuleMachine({ shakeAnim }: { shakeAnim: Animated.Value }) {
  const machineShake = shakeAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-2deg', '0deg', '2deg'],
  });

  return (
    <Animated.View style={[styles.machineContainer, { transform: [{ rotate: machineShake }] }]}>
      <Image
        source={{ uri: GACHA_MACHINE_URL }}
        style={{ width: '100%', height: undefined, aspectRatio: 0.65 }}
        resizeMode="contain"
        onError={() => log('[GachaDraw] Failed to load gacha machine image')}
      />
    </Animated.View>
  );
}

function CapsuleBall({
  rarity,
  dropAnim,
  splitAnim,
  visible,
}: {
  rarity: string;
  dropAnim: Animated.Value;
  splitAnim: Animated.Value;
  visible: boolean;
}) {
  if (!visible) return null;

  const imageUrl = RARITY_CAPSULE_IMAGES[rarity] || RARITY_CAPSULE_IMAGES.common;

  const translateY = dropAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-60, 180],
  });

  const scale = splitAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.2, 0],
  });

  const opacity = splitAnim.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: [1, 0.6, 0],
  });

  return (
    <Animated.View
      style={[
        styles.capsuleBallContainer,
        { transform: [{ translateY }] },
      ]}
    >
      <Animated.Image
        source={{ uri: imageUrl }}
        style={{
          width: 56,
          height: 56,
          transform: [{ scale }],
          opacity,
        }}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

function FlowerReveal({
  flower,
  revealAnim,
  isZh,
}: {
  flower: FlowerType | null;
  revealAnim: Animated.Value;
  isZh: boolean;
}) {
  if (!flower) return null;

  const scale = revealAnim.interpolate({
    inputRange: [0, 0.5, 0.8, 1],
    outputRange: [0, 0.3, 1.1, 1],
  });

  const opacity = revealAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0.5, 1],
  });

  const glowScale = revealAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 1.5, 1.2],
  });

  const glowOpacity = revealAnim.interpolate({
    inputRange: [0, 0.5, 0.8, 1],
    outputRange: [0, 0.8, 0.4, 0.3],
  });

  const rarity = flower.rarity || 'common';
  const glowColor = RARITY_GLOW_COLORS[rarity] || RARITY_GLOW_COLORS.common;
  const rarityInfo = RARITY_LABELS[rarity] || RARITY_LABELS.common;

  return (
    <View style={styles.revealContainer}>
      <Animated.View
        style={[
          styles.revealGlow,
          {
            backgroundColor: glowColor,
            transform: [{ scale: glowScale }],
            opacity: glowOpacity,
          },
        ]}
      />
      <Animated.View style={[styles.revealContent, { transform: [{ scale }], opacity }]}>
        <Image
          source={{ uri: flower.image_url }}
          style={styles.revealFlowerImage}
          resizeMode="contain"
        />
        <ScaledText size={20} weight="bold" color={Colors.textPrimary} style={styles.revealFlowerName}>
          {isZh ? flower.name_zh || flower.name_en : flower.name_en}
        </ScaledText>
        <View style={[styles.revealRarityBadge, { backgroundColor: RARITY_CAPSULE_COLORS[rarity] || '#F48FB1' }]}>
          <ScaledText size={13} weight="700" color="#FFF">
            {isZh ? rarityInfo.labelZh : rarityInfo.label}
          </ScaledText>
        </View>
      </Animated.View>
    </View>
  );
}

export default function GachaDrawScreen() {
  const { patientId, language, refreshPatient: refreshPatientCtx } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [drawPhase, setDrawPhase] = useState<DrawPhase>('idle');
  const [currentFlower, setCurrentFlower] = useState<FlowerType | null>(null);
  const [drawResults, setDrawResults] = useState<DrawResult[]>([]);
  const [pendingDraws, setPendingDraws] = useState<number>(0);
  const [showResultModal, setShowResultModal] = useState<boolean>(false);
  const [isStartingDraw, setIsStartingDraw] = useState<boolean>(false);

  const secondFlowerRef = useRef<FlowerType | null>(null);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const capsuleDropAnim = useRef(new Animated.Value(0)).current;
  const capsuleSplitAnim = useRef(new Animated.Value(0)).current;
  const revealAnim = useRef(new Animated.Value(0)).current;
  const [showCapsule, setShowCapsule] = useState<boolean>(false);

  const patientDataQuery = useQuery({
    queryKey: ['gachaPatientData', patientId],
    queryFn: async () => {
      log('[GachaDraw] Fetching patient data');
      const { data, error } = await supabase
        .from('patients')
        .select('stars_available, fires_available')
        .eq('id', patientId!)
        .single();
      if (error) throw error;
      return data as { stars_available: number; fires_available: number };
    },
    enabled: !!patientId,
    staleTime: 10 * 1000,
  });

  const flowerTypesQuery = useQuery({
    queryKey: ['activeFlowerTypes'],
    queryFn: async () => {
      log('[GachaDraw] Fetching active flower types');
      const { data, error } = await supabase
        .from('flower_types')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      return (data || []) as FlowerType[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const refreshAfterDraw = useCallback(() => {
    log('[GachaDraw] Refreshing data after draw');
    void queryClient.invalidateQueries({ queryKey: ['gachaPatientData', patientId] });
    void queryClient.invalidateQueries({ queryKey: ['gardenPatientData', patientId] });
    void queryClient.invalidateQueries({ queryKey: ['patientFlowerSlots', patientId] });
    void queryClient.invalidateQueries({ queryKey: ['patientFlowers', patientId] });
  }, [queryClient, patientId]);

  const resetAnimations = useCallback(() => {
    shakeAnim.setValue(0);
    capsuleDropAnim.setValue(0);
    capsuleSplitAnim.setValue(0);
    revealAnim.setValue(0);
    setShowCapsule(false);
    setCurrentFlower(null);
  }, [shakeAnim, capsuleDropAnim, capsuleSplitAnim, revealAnim]);

  const runDrawAnimation = useCallback((flower: FlowerType, isSecondDraw: boolean) => {
    setCurrentFlower(flower);

    setDrawPhase('shaking');

    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]).start(() => {
      const shakeSequence = Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -1, duration: 80, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
        ]),
        { iterations: 4 }
      );

      shakeSequence.start(() => {
        setDrawPhase('dropping');
        setShowCapsule(true);

        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }

        Animated.timing(capsuleDropAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }).start(() => {
          setDrawPhase('opening');

          setTimeout(() => {
            Animated.timing(capsuleSplitAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }).start(() => {
              setDrawPhase('revealing');

              if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              }

              Animated.spring(revealAnim, {
                toValue: 1,
                friction: 5,
                tension: 40,
                useNativeDriver: true,
              }).start(() => {
                setDrawResults((prev) => [...prev, { flower, isSecondDraw }]);
                setDrawPhase('done');
              });
            });
          }, 300);
        });
      });
    });
  }, [shakeAnim, capsuleDropAnim, capsuleSplitAnim, revealAnim]);

  const startDraw = useCallback(async (type: 'stars' | 'fires') => {
    const flowers = flowerTypesQuery.data;
    if (!flowers || flowers.length === 0) return;
    if (!patientId) return;

    setIsStartingDraw(true);

    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }

      log('[GachaDraw] Fetching existing flowers for grid position calculation');
      const { data: existingFlowers } = await supabase
        .from('patient_flowers')
        .select('grid_position')
        .eq('patient_id', patientId)
        .eq('is_stolen', false);

      const usedPositions = new Set((existingFlowers || []).map((f: { grid_position: number }) => f.grid_position));

      if (type === 'stars') {
        let nextPosition = -1;
        for (let i = 0; i < TOTAL_SLOTS; i++) {
          if (!usedPositions.has(i)) {
            nextPosition = i;
            break;
          }
        }

        if (nextPosition === -1) {
          Alert.alert(
            isZh ? '花田已滿！' : 'Garden Full!',
            isZh ? '你的花田已種滿20朵花。' : 'Your garden has 20 flowers. Remove or wait for theft.'
          );
          return;
        }

        const selectedFlower = weightedRandomPick(flowers);
        log('[GachaDraw] Single draw: flower=', selectedFlower.id, 'position=', nextPosition);

        const { data: success, error } = await supabase.rpc('perform_gacha_draw', {
          p_patient_id: patientId,
          p_cost_type: 'stars',
          p_cost_amount: 5,
          p_flower_type_id: selectedFlower.id,
          p_grid_position: nextPosition,
        });

        if (error || !success) {
          log('[GachaDraw] Single draw RPC failed:', error);
          Alert.alert(isZh ? '星星不足' : 'Not enough stars');
          return;
        }

        refreshAfterDraw();
        void refreshPatientCtx();

        setPendingDraws(0);
        setDrawResults([]);
        resetAnimations();
        secondFlowerRef.current = null;
        runDrawAnimation(selectedFlower, false);
      } else {
        const positions: number[] = [];
        for (let i = 0; i < TOTAL_SLOTS; i++) {
          if (!usedPositions.has(i)) {
            positions.push(i);
            if (positions.length >= 2) break;
          }
        }

        if (positions.length < 2) {
          Alert.alert(
            isZh ? '花田空間不足' : 'Not enough garden space',
            isZh ? '需要至少2個空位來種2朵花。' : 'Need at least 2 empty slots for 2 flowers.'
          );
          return;
        }

        const flower1 = weightedRandomPick(flowers);
        const flower2 = weightedRandomPick(flowers);
        log('[GachaDraw] Multi draw: flowers=', flower1.id, flower2.id, 'positions=', positions[0], positions[1]);

        const { data: success, error } = await supabase.rpc('perform_gacha_draw_multi', {
          p_patient_id: patientId,
          p_cost_type: 'fires',
          p_cost_amount: 10,
          p_flower_type_ids: [flower1.id, flower2.id],
          p_grid_positions: [positions[0], positions[1]],
        });

        if (error || !success) {
          log('[GachaDraw] Multi draw RPC failed:', error);
          Alert.alert(isZh ? '火焰不足' : 'Not enough fires');
          return;
        }

        refreshAfterDraw();
        void refreshPatientCtx();

        setPendingDraws(1);
        setDrawResults([]);
        resetAnimations();
        secondFlowerRef.current = flower2;
        runDrawAnimation(flower1, false);
      }
    } catch (err) {
      log('[GachaDraw] Draw error:', err);
      Alert.alert(isZh ? '抽獎失敗' : 'Draw failed', isZh ? '請稍後再試。' : 'Please try again.');
    } finally {
      setIsStartingDraw(false);
    }
  }, [flowerTypesQuery.data, patientId, isZh, resetAnimations, runDrawAnimation, refreshAfterDraw, refreshPatientCtx]);

  useEffect(() => {
    if (drawPhase === 'done' && pendingDraws > 0) {
      const timeout = setTimeout(() => {
        const secondFlower = secondFlowerRef.current;
        if (!secondFlower) return;

        resetAnimations();
        setPendingDraws(0);
        secondFlowerRef.current = null;

        runDrawAnimation(secondFlower, true);
      }, 2000);

      return () => clearTimeout(timeout);
    }

    if (drawPhase === 'done' && pendingDraws === 0) {
      const timeout = setTimeout(() => {
        setDrawPhase('complete');
        setShowResultModal(true);
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [drawPhase, pendingDraws, resetAnimations, runDrawAnimation]);

  const starsAvailable = patientDataQuery.data?.stars_available ?? 0;
  const firesAvailable = patientDataQuery.data?.fires_available ?? 0;
  const canDrawStars = starsAvailable >= 5;
  const canDrawFires = firesAvailable >= 10;
  const isDrawing = isStartingDraw || (drawPhase !== 'idle' && drawPhase !== 'complete');

  const handleBackToGarden = useCallback(() => {
    setShowResultModal(false);
    setDrawPhase('idle');
    resetAnimations();
    setDrawResults([]);
    router.back();
  }, [resetAnimations, router]);

  const handleDrawAgain = useCallback(() => {
    setShowResultModal(false);
    setDrawPhase('idle');
    resetAnimations();
    setDrawResults([]);
  }, [resetAnimations]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            testID="gacha-back"
            disabled={isDrawing}
          >
            <ChevronLeft size={24} color={isDrawing ? Colors.disabled : Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleArea}>
            <ScaledText size={20} weight="bold" color={Colors.textPrimary}>
              {isZh ? '扭蛋抽花' : 'Lucky Draw'}
            </ScaledText>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.balanceBar}>
          <View style={styles.balanceItem}>
            <ScaledText size={22}>⭐</ScaledText>
            <ScaledText size={14} weight="600" color={Colors.textPrimary}>
              {starsAvailable}
            </ScaledText>
            <ScaledText size={10} color={Colors.textSecondary}>
              {isZh ? '可用' : 'Available'}
            </ScaledText>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceItem}>
            <ScaledText size={22}>🔥</ScaledText>
            <ScaledText size={14} weight="600" color={Colors.textPrimary}>
              {firesAvailable}
            </ScaledText>
            <ScaledText size={10} color={Colors.textSecondary}>
              {isZh ? '可用' : 'Available'}
            </ScaledText>
          </View>
        </View>

        <View style={styles.machineArea}>
          <CapsuleMachine shakeAnim={shakeAnim} />

          <CapsuleBall
            rarity={currentFlower?.rarity || 'common'}
            dropAnim={capsuleDropAnim}
            splitAnim={capsuleSplitAnim}
            visible={showCapsule}
          />

          {(drawPhase === 'revealing' || drawPhase === 'done') && (
            <FlowerReveal flower={currentFlower} revealAnim={revealAnim} isZh={isZh} />
          )}

          {drawPhase === 'done' && pendingDraws > 0 && (
            <View style={styles.nextDrawHint}>
              <ScaledText size={14} weight="600" color={Colors.primary}>
                {isZh ? '準備第二次抽花...' : 'Preparing second draw...'}
              </ScaledText>
            </View>
          )}
        </View>

        {(drawPhase === 'done' || drawPhase === 'revealing') && currentFlower && (
          <View style={styles.resultBanner}>
            <ScaledText size={16} weight="bold" color="#FFF" style={styles.resultBannerText}>
              🎉 {isZh ? `你獲得了：${currentFlower.name_zh || currentFlower.name_en}！` : `You got: ${currentFlower.name_en}!`}
            </ScaledText>
          </View>
        )}

        <View style={styles.buttonArea}>
          <TouchableOpacity
            style={[styles.drawBtn, styles.starDrawBtn, (!canDrawStars || isDrawing) && styles.drawBtnDisabled]}
            onPress={() => startDraw('stars')}
            disabled={!canDrawStars || isDrawing}
            activeOpacity={0.75}
            testID="draw-stars-btn"
          >
            <Sparkles size={18} color="#FFF" />
            <View style={styles.drawBtnTextArea}>
              <ScaledText size={14} weight="700" color="#FFF">
                ⭐ {isZh ? '花費 5 星 (1次)' : 'Spend 5 Stars (1 Draw)'}
              </ScaledText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.drawBtn, styles.fireDrawBtn, (!canDrawFires || isDrawing) && styles.drawBtnDisabled]}
            onPress={() => startDraw('fires')}
            disabled={!canDrawFires || isDrawing}
            activeOpacity={0.75}
            testID="draw-fires-btn"
          >
            <Sparkles size={18} color="#FFF" />
            <View style={styles.drawBtnTextArea}>
              <ScaledText size={14} weight="700" color="#FFF">
                🔥 {isZh ? '花費 10 火 (2次)' : 'Spend 10 Fires (2 Draws)'}
              </ScaledText>
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <Modal
        visible={showResultModal}
        transparent
        animationType="fade"
        onRequestClose={handleBackToGarden}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.resultModal}>
            <ScaledText size={28} style={styles.resultEmoji}>🎉</ScaledText>
            <ScaledText size={18} weight="bold" color={Colors.textPrimary} style={styles.resultTitle}>
              {isZh ? '恭喜！' : 'Congratulations!'}
            </ScaledText>

            {drawResults.map((result, index) => {
              const rarity = result.flower.rarity || 'common';
              const rarityInfo = RARITY_LABELS[rarity] || RARITY_LABELS.common;
              return (
                <View key={index} style={styles.resultItem}>
                  <Image
                    source={{ uri: result.flower.image_url }}
                    style={styles.resultFlowerImg}
                    resizeMode="contain"
                  />
                  <View style={styles.resultItemInfo}>
                    <ScaledText size={15} weight="600" color={Colors.textPrimary}>
                      {isZh ? result.flower.name_zh || result.flower.name_en : result.flower.name_en}
                    </ScaledText>
                    <View style={[styles.resultRarityBadge, { backgroundColor: RARITY_CAPSULE_COLORS[rarity] || '#F48FB1' }]}>
                      <ScaledText size={11} weight="700" color="#FFF">
                        {isZh ? rarityInfo.labelZh : rarityInfo.label}
                      </ScaledText>
                    </View>
                  </View>
                </View>
              );
            })}

            <View style={styles.resultButtonRow}>
              {(canDrawStars || canDrawFires) && (
                <TouchableOpacity
                  style={styles.drawAgainBtn}
                  onPress={handleDrawAgain}
                  testID="draw-again-btn"
                >
                  <ScaledText size={14} weight="600" color={Colors.primary}>
                    {isZh ? '再抽一次' : 'Draw Again'}
                  </ScaledText>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.backToGardenBtn}
                onPress={handleBackToGarden}
                testID="back-to-garden-btn"
              >
                <ScaledText size={14} weight="700" color="#FFF">
                  {isZh ? '返回花田' : 'Back to Garden'}
                </ScaledText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFF5F0',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitleArea: {
    flex: 1,
    alignItems: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  balanceBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: Colors.card,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  balanceItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  balanceDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 12,
  },
  machineArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  machineContainer: {
    alignItems: 'center',
    width: SCREEN_WIDTH * 0.75,
    maxWidth: 340,
  },

  capsuleBallContainer: {
    position: 'absolute',
    flexDirection: 'row',
    zIndex: 20,
  },

  revealContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    bottom: 20,
  },
  revealGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  revealContent: {
    alignItems: 'center',
  },
  revealFlowerImage: {
    width: 90,
    height: 90,
    marginBottom: 8,
  },
  revealFlowerName: {
    textAlign: 'center',
    marginBottom: 6,
  },
  revealRarityBadge: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
  },
  nextDrawHint: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
  },
  resultBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: '#E91E63',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  resultBannerText: {
    textAlign: 'center',
  },
  buttonArea: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
  },
  drawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 18,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  starDrawBtn: {
    backgroundColor: '#FF9800',
    shadowColor: '#FF9800',
  },
  fireDrawBtn: {
    backgroundColor: '#F44336',
    shadowColor: '#F44336',
  },
  drawBtnDisabled: {
    backgroundColor: Colors.disabled,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  drawBtnTextArea: {
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultModal: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 28,
    marginHorizontal: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
    width: SCREEN_WIDTH - 56,
    maxWidth: 380,
  },
  resultEmoji: {
    marginBottom: 8,
  },
  resultTitle: {
    marginBottom: 16,
    textAlign: 'center',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    width: '100%',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultFlowerImg: {
    width: 52,
    height: 52,
  },
  resultItemInfo: {
    flex: 1,
    gap: 4,
  },
  resultRarityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  resultButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    width: '100%',
  },
  drawAgainBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backToGardenBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
});
