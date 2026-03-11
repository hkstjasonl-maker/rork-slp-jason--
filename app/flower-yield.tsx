import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  Modal,
  Pressable,
  Image,
  Dimensions,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Gift, X, ChevronLeft } from 'lucide-react-native';

import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { log } from '@/lib/logger';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const GRID_COLS = 4;
const GRID_ROWS = 5;
const TOTAL_SLOTS = GRID_COLS * GRID_ROWS;

const CELL_SIZE = (SCREEN_WIDTH - 40) / GRID_COLS;
const GARDEN_HEIGHT = CELL_SIZE * GRID_ROWS;

const RARITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  common: { bg: '#E8F5E9', text: '#2E7D32', label: '★' },
  uncommon: { bg: '#E3F2FD', text: '#1565C0', label: '★★' },
  rare: { bg: '#F3E5F5', text: '#7B1FA2', label: '★★★' },
  epic: { bg: '#FFF3E0', text: '#E65100', label: '★★★★' },
  legendary: { bg: '#FFF8E1', text: '#F57F17', label: '★★★★★' },
};

interface FlowerType {
  id: string;
  name_en: string;
  name_zh: string;
  image_url: string;
  rarity: string;
}

interface PatientFlower {
  id: string;
  patient_id: string;
  flower_type_id: string;
  slot_index: number;
  is_stolen: boolean;
  stolen_at: string | null;
  obtained_at: string;
  flower_types?: FlowerType;
}

interface PatientGardenData {
  garden_background_url: string | null;
  consecutive_inactive_days: number;
  stars_available: number;
  fires_available: number;
}

function FlowerItem({ flowerType, slotIndex, onPress }: {
  flower: PatientFlower;
  flowerType: FlowerType | undefined;
  slotIndex: number;
  onPress: () => void;
}) {
  const swayAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const randomDelay = Math.random() * 1500;
    const randomDuration = 2000 + Math.random() * 1000;

    const timeout = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(swayAnim, {
            toValue: 1,
            duration: randomDuration,
            useNativeDriver: true,
          }),
          Animated.timing(swayAnim, {
            toValue: -1,
            duration: randomDuration,
            useNativeDriver: true,
          }),
          Animated.timing(swayAnim, {
            toValue: 0,
            duration: randomDuration,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }, randomDelay);

    return () => clearTimeout(timeout);
  }, [swayAnim]);

  const rotation = swayAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-3deg', '0deg', '3deg'],
  });

  const col = slotIndex % GRID_COLS;
  const row = Math.floor(slotIndex / GRID_COLS);

  if (!flowerType) return null;

  return (
    <Animated.View
      style={[
        styles.flowerSlot,
        {
          left: col * CELL_SIZE,
          top: row * CELL_SIZE,
          width: CELL_SIZE,
          height: CELL_SIZE,
          transform: [{ rotate: rotation }],
          opacity: fadeAnim,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        style={styles.flowerTouchable}
        testID={`flower-slot-${slotIndex}`}
      >
        <Image
          source={{ uri: flowerType.image_url }}
          style={styles.flowerImage}
          resizeMode="contain"
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

const MemoFlowerItem = React.memo(FlowerItem);

function StolenFlowerOverlay({ flowerType, slotIndex }: {
  flower: PatientFlower;
  flowerType: FlowerType | undefined;
  slotIndex: number;
}) {
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 1500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const col = slotIndex % GRID_COLS;
  const row = Math.floor(slotIndex / GRID_COLS);

  if (!flowerType) return null;

  return (
    <Animated.View
      style={[
        styles.flowerSlot,
        {
          left: col * CELL_SIZE,
          top: row * CELL_SIZE,
          width: CELL_SIZE,
          height: CELL_SIZE,
          opacity: fadeAnim,
        },
      ]}
    >
      <Image
        source={{ uri: flowerType.image_url }}
        style={[styles.flowerImage, { tintColor: '#8B7355' }]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

export default function FlowerYieldScreen() {
  const { patientId, patientName, language } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedFlower, setSelectedFlower] = useState<PatientFlower | null>(null);
  const [theftModalVisible, setTheftModalVisible] = useState<boolean>(false);
  const [stolenCount, setStolenCount] = useState<number>(0);
  const [stolenFlowers, setStolenFlowers] = useState<PatientFlower[]>([]);
  const [theftProcessed, setTheftProcessed] = useState<boolean>(false);

  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const gardenTitle = useMemo(() => {
    const name = patientName || (isZh ? '你' : 'Your');
    return isZh ? `${name}的花田` : `${name}'s Garden`;
  }, [patientName, isZh]);

  const patientDataQuery = useQuery({
    queryKey: ['gardenPatientData', patientId],
    queryFn: async () => {
      log('[FlowerYield] Fetching patient garden data for:', patientId);
      const { data, error } = await supabase
        .from('patients')
        .select('garden_background_url, consecutive_inactive_days, stars_available, fires_available')
        .eq('id', patientId!)
        .single();
      if (error) {
        log('[FlowerYield] Patient data fetch error:', error);
        throw error;
      }
      return (data || {
        garden_background_url: null,
        consecutive_inactive_days: 0,
        stars_available: 0,
        fires_available: 0,
      }) as PatientGardenData;
    },
    enabled: !!patientId,
    staleTime: 30 * 1000,
  });

  const flowersQuery = useQuery({
    queryKey: ['patientFlowers', patientId],
    queryFn: async () => {
      log('[FlowerYield] Fetching patient flowers for:', patientId);
      const { data, error } = await supabase
        .from('patient_flowers')
        .select('*, flower_types(*)')
        .eq('patient_id', patientId!)
        .eq('is_stolen', false)
        .order('slot_index');
      if (error) {
        log('[FlowerYield] Flowers fetch error:', error);
        throw error;
      }
      return (data || []) as PatientFlower[];
    },
    enabled: !!patientId,
    staleTime: 30 * 1000,
  });

  const flowerTypesQuery = useQuery({
    queryKey: ['flowerTypes'],
    queryFn: async () => {
      log('[FlowerYield] Fetching flower types');
      const { data, error } = await supabase
        .from('flower_types')
        .select('*');
      if (error) {
        log('[FlowerYield] Flower types fetch error:', error);
        throw error;
      }
      return (data || []) as FlowerType[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const flowerTypeMap = useMemo(() => {
    const map: Record<string, FlowerType> = {};
    (flowerTypesQuery.data || []).forEach((ft) => {
      map[ft.id] = ft;
    });
    return map;
  }, [flowerTypesQuery.data]);

  const theftMutation = useMutation({
    mutationFn: async ({ flowersToSteal }: { flowersToSteal: PatientFlower[] }) => {
      log('[FlowerYield] Stealing', flowersToSteal.length, 'flowers');
      const ids = flowersToSteal.map((f) => f.id);
      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('patient_flowers')
        .update({ is_stolen: true, stolen_at: now })
        .in('id', ids);
      if (updateError) throw updateError;

      const { error: resetError } = await supabase
        .from('patients')
        .update({ consecutive_inactive_days: 0 })
        .eq('id', patientId!);
      if (resetError) throw resetError;

      return flowersToSteal;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patientFlowers', patientId] });
      void queryClient.invalidateQueries({ queryKey: ['gardenPatientData', patientId] });
    },
  });

  useEffect(() => {
    if (theftProcessed) return;
    const patientData = patientDataQuery.data;
    const flowers = flowersQuery.data;
    if (!patientData || !flowers) return;

    const inactiveDays = patientData.consecutive_inactive_days || 0;
    const nonStolenFlowers = flowers.filter((f) => !f.is_stolen);

    if (inactiveDays >= 3 && nonStolenFlowers.length > 1) {
      const maxToSteal = Math.floor(inactiveDays / 3);
      const canSteal = Math.min(maxToSteal, nonStolenFlowers.length - 1);

      if (canSteal > 0) {
        const toSteal = nonStolenFlowers.slice(-canSteal);
        setStolenCount(canSteal);
        setStolenFlowers(toSteal);
        setTheftModalVisible(true);
        theftMutation.mutate({ flowersToSteal: toSteal });
      }
    }
    setTheftProcessed(true);
  }, [patientDataQuery.data, flowersQuery.data, theftProcessed, theftMutation, patientId]);

  const getFlowerName = useCallback((ft: FlowerType | undefined): string => {
    if (!ft) return '';
    if (isZh) return ft.name_zh || ft.name_en;
    return ft.name_en;
  }, [isZh]);

  const patientData = patientDataQuery.data;
  const flowers = flowersQuery.data || [];
  const isLoading = patientDataQuery.isLoading || flowersQuery.isLoading || flowerTypesQuery.isLoading;

  const selectedFlowerType = selectedFlower
    ? (selectedFlower.flower_types || flowerTypeMap[selectedFlower.flower_type_id])
    : undefined;

  const stolenFlowerIds = useMemo(() => new Set(stolenFlowers.map((f) => f.id)), [stolenFlowers]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            testID="flower-yield-back"
          >
            <ChevronLeft size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleArea}>
            <ScaledText size={20} weight="bold" color={Colors.textPrimary} numberOfLines={1}>
              {gardenTitle}
            </ScaledText>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.resourceBar}>
            <View style={styles.resourceItem}>
              <ScaledText size={13} color={Colors.textSecondary}>
                ⭐ {isZh ? '可用' : 'Available'}: {patientData?.stars_available ?? 0}
              </ScaledText>
              <ScaledText size={10} color={Colors.disabled}>
                (5⭐ = 1 draw)
              </ScaledText>
            </View>
            <View style={styles.resourceDivider} />
            <View style={styles.resourceItem}>
              <ScaledText size={13} color={Colors.textSecondary}>
                🔥 {isZh ? '可用' : 'Available'}: {patientData?.fires_available ?? 0}
              </ScaledText>
              <ScaledText size={10} color={Colors.disabled}>
                (10🔥 = 2 draws)
              </ScaledText>
            </View>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.luckyDrawBtn}
              activeOpacity={0.75}
              testID="lucky-draw-btn"
            >
              <Sparkles size={18} color="#FFF" />
              <ScaledText size={14} weight="700" color="#FFF">
                {isZh ? '抽花 Lucky Draw' : 'Lucky Draw 抽花'}
              </ScaledText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.treasureBtn}
              activeOpacity={0.75}
              testID="treasure-chest-btn"
            >
              <Gift size={18} color="#8B4513" />
              <ScaledText size={14} weight="700" color="#8B4513">
                {isZh ? '寶箱 Treasure' : 'Treasure 寶箱'}
              </ScaledText>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.gardenContainer}>
              {patientData?.garden_background_url ? (
                <Image
                  source={{ uri: patientData.garden_background_url }}
                  style={styles.gardenBackground}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.gardenDefaultBg}>
                  {Array.from({ length: TOTAL_SLOTS }).map((_, i) => {
                    const col = i % GRID_COLS;
                    const row = Math.floor(i / GRID_COLS);
                    const isEven = (col + row) % 2 === 0;
                    return (
                      <View
                        key={`grass-${i}`}
                        style={[
                          styles.grassCell,
                          {
                            left: col * CELL_SIZE,
                            top: row * CELL_SIZE,
                            width: CELL_SIZE,
                            height: CELL_SIZE,
                            backgroundColor: isEven ? '#A8D5A2' : '#96C990',
                          },
                        ]}
                      />
                    );
                  })}

                  {Array.from({ length: TOTAL_SLOTS }).map((_, i) => {
                    const col = i % GRID_COLS;
                    const row = Math.floor(i / GRID_COLS);
                    return (
                      <View
                        key={`iso-${i}`}
                        style={[
                          styles.isoOverlay,
                          {
                            left: col * CELL_SIZE + 2,
                            top: row * CELL_SIZE + CELL_SIZE - 8,
                            width: CELL_SIZE - 4,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              )}

              {flowers
                .filter((f) => !stolenFlowerIds.has(f.id))
                .map((flower) => {
                  const ft = flower.flower_types || flowerTypeMap[flower.flower_type_id];
                  return (
                    <MemoFlowerItem
                      key={flower.id}
                      flower={flower}
                      flowerType={ft}
                      slotIndex={flower.slot_index}
                      onPress={() => setSelectedFlower(flower)}
                    />
                  );
                })}

              {stolenFlowers.map((flower) => {
                const ft = flower.flower_types || flowerTypeMap[flower.flower_type_id];
                return (
                  <StolenFlowerOverlay
                    key={`stolen-${flower.id}`}
                    flower={flower}
                    flowerType={ft}
                    slotIndex={flower.slot_index}
                  />
                );
              })}

              {flowers.length === 0 && (
                <View style={styles.emptyGardenOverlay}>
                  <ScaledText size={16} weight="600" color="#5D4037" style={styles.emptyGardenText}>
                    {isZh ? '花田還是空的！\n完成練習來抽花吧 🌱' : 'Your garden is empty!\nComplete exercises to draw flowers 🌱'}
                  </ScaledText>
                </View>
              )}
            </View>
          )}

          {flowers.length > 0 && (
            <View style={styles.flowerCount}>
              <ScaledText size={13} color={Colors.textSecondary}>
                🌸 {flowers.filter((f) => !stolenFlowerIds.has(f.id)).length} / {TOTAL_SLOTS} {isZh ? '朵花' : 'flowers'}
              </ScaledText>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={theftModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTheftModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.theftModal}>
            <ScaledText size={40} style={styles.theftEmoji}>😢</ScaledText>
            <ScaledText size={18} weight="bold" color="#5D4037" style={styles.theftTitle}>
              {isZh ? '你的花田被偷了！' : 'Your garden was raided!'}
            </ScaledText>
            <ScaledText size={15} color="#795548" style={styles.theftBody}>
              {isZh
                ? `Oh no! 你的花田被偷了 ${stolenCount} 朵花！\n記得每天做練習保護花田！`
                : `Oh no! ${stolenCount} flower${stolenCount > 1 ? 's were' : ' was'} stolen from your garden!\nPractice daily to protect your flowers!`}
            </ScaledText>
            <TouchableOpacity
              style={styles.theftCloseBtn}
              onPress={() => setTheftModalVisible(false)}
              testID="theft-modal-close"
            >
              <ScaledText size={15} weight="700" color="#FFF">
                {isZh ? '我知道了' : 'I understand'}
              </ScaledText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedFlower}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedFlower(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedFlower(null)}>
          <View style={styles.tooltipModal}>
            <TouchableOpacity
              style={styles.tooltipClose}
              onPress={() => setSelectedFlower(null)}
              testID="tooltip-close"
            >
              <X size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
            {selectedFlowerType && (
              <>
                <Image
                  source={{ uri: selectedFlowerType.image_url }}
                  style={styles.tooltipFlowerImage}
                  resizeMode="contain"
                />
                <ScaledText size={18} weight="bold" color={Colors.textPrimary} style={styles.tooltipName}>
                  {getFlowerName(selectedFlowerType)}
                </ScaledText>
                {selectedFlowerType.rarity && (
                  <View style={[
                    styles.rarityBadge,
                    { backgroundColor: RARITY_COLORS[selectedFlowerType.rarity]?.bg ?? '#F5F5F5' },
                  ]}>
                    <ScaledText
                      size={12}
                      weight="700"
                      color={RARITY_COLORS[selectedFlowerType.rarity]?.text ?? '#757575'}
                    >
                      {RARITY_COLORS[selectedFlowerType.rarity]?.label ?? selectedFlowerType.rarity}{' '}
                      {selectedFlowerType.rarity.charAt(0).toUpperCase() + selectedFlowerType.rarity.slice(1)}
                    </ScaledText>
                  </View>
                )}
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F0F7EC',
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  resourceBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  resourceItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  resourceDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 8,
  },
  actionRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 10,
  },
  luckyDrawBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#E91E63',
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#E91E63',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  treasureBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFE0B2',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FFCC80',
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
  },
  gardenContainer: {
    marginHorizontal: 20,
    height: GARDEN_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#8BC34A',
    position: 'relative',
  },
  gardenBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  gardenDefaultBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  grassCell: {
    position: 'absolute',
  },
  isoOverlay: {
    position: 'absolute',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  flowerSlot: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  flowerTouchable: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  flowerImage: {
    width: '80%',
    height: '80%',
  },
  emptyGardenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
    zIndex: 20,
  },
  emptyGardenText: {
    textAlign: 'center',
    lineHeight: 24,
  },
  flowerCount: {
    alignItems: 'center',
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  theftModal: {
    backgroundColor: '#FFF8E1',
    borderRadius: 24,
    padding: 28,
    marginHorizontal: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFE082',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  theftEmoji: {
    marginBottom: 12,
  },
  theftTitle: {
    marginBottom: 12,
    textAlign: 'center',
  },
  theftBody: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  theftCloseBtn: {
    backgroundColor: '#8D6E63',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 14,
  },
  tooltipModal: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 48,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  tooltipClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipFlowerImage: {
    width: 80,
    height: 80,
    marginBottom: 12,
  },
  tooltipName: {
    marginBottom: 8,
    textAlign: 'center',
  },
  rarityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
});
