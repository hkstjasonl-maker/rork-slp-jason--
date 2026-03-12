import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  Easing,
  Modal,
  Pressable,
  Image,
  Dimensions,
  PanResponder,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Gift, X, ChevronLeft } from 'lucide-react-native';

import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { log } from '@/lib/logger';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SUPABASE_STORAGE = 'https://pfgtnrlgetomfmrzbxgb.supabase.co/storage/v1/object/public/flowers/';

const TOTAL_SLOTS = 20;

const RARITY_COLORS: Record<string, { bg: string; dot: string; label: string }> = {
  common: { bg: '#E8F5E9', dot: '#4CAF50', label: '★' },
  uncommon: { bg: '#E3F2FD', dot: '#2196F3', label: '★★' },
  rare: { bg: '#F3E5F5', dot: '#9C27B0', label: '★★★' },
  epic: { bg: '#FFF3E0', dot: '#FF9800', label: '★★★★' },
  legendary: { bg: '#FFF8E1', dot: '#FFD700', label: '★★★★★' },
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
  grid_position: number;
  is_stolen: boolean;
  stolen_at: string | null;
  obtained_at: string;
  flower_types?: FlowerType;
}

function SparkleParticles() {
  const particles = useRef(
    Array.from({ length: 8 }, () => ({
      x: new Animated.Value(Math.random() * SCREEN_WIDTH * 0.8),
      y: new Animated.Value(Math.random() * 200),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0.3 + Math.random() * 0.7),
    }))
  ).current;

  useEffect(() => {
    const animations: Animated.CompositeAnimation[] = [];
    particles.forEach((p, i) => {
      const animate = () => {
        p.opacity.setValue(0);
        p.y.setValue(Math.random() * 180 + 20);
        p.x.setValue(Math.random() * (SCREEN_WIDTH - 80) + 20);
        const anim = Animated.sequence([
          Animated.delay(i * 400 + Math.random() * 2000),
          Animated.parallel([
            Animated.timing(p.opacity, { toValue: 0.8, duration: 600, useNativeDriver: true }),
            Animated.timing(p.y, { toValue: (p.y as any)._value - 30, duration: 2000, useNativeDriver: true }),
          ]),
          Animated.timing(p.opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]);
        anim.start(() => animate());
        animations.push(anim);
      };
      animate();
    });
    return () => {
      animations.forEach((a) => a.stop());
    };
  }, []);

  return (
    <>
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute' as const,
            transform: [{ translateX: p.x }, { translateY: p.y }, { scale: p.scale }],
            opacity: p.opacity,
            zIndex: 15,
          }}
        >
          <ScaledText size={14}>✨</ScaledText>
        </Animated.View>
      ))}
    </>
  );
}

function FlowerCard({ flower: _flower, flowerType, index, isZh, onPress }: {
  flower: PatientFlower;
  flowerType: FlowerType | undefined;
  index: number;
  isZh: boolean;
  onPress: () => void;
}) {
  const popAnim = useRef(new Animated.Value(0)).current;
  const swayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(popAnim, {
      toValue: 1,
      friction: 5,
      tension: 40,
      delay: index * 80,
      useNativeDriver: true,
    }).start();

    const delay = Math.random() * 1000;
    const duration = 2000 + Math.random() * 1000;
    let loopAnim: Animated.CompositeAnimation;
    const timer = setTimeout(() => {
      loopAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(swayAnim, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(swayAnim, { toValue: -1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(swayAnim, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
      loopAnim.start();
    }, delay);

    return () => {
      clearTimeout(timer);
      if (loopAnim) loopAnim.stop();
    };
  }, []);

  const scale = popAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const rotate = swayAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-3deg', '0deg', '3deg'] });

  if (!flowerType) return <View style={styles.flowerCardEmpty} />;

  const rarity = flowerType.rarity || 'common';
  const rarityInfo = RARITY_COLORS[rarity] || RARITY_COLORS.common;

  return (
    <Animated.View style={[styles.flowerCard, { transform: [{ scale }] }]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.flowerCardInner}>
        <View style={[styles.flowerShadow, { backgroundColor: rarityInfo.dot + '20' }]} />
        <Animated.Image
          source={{ uri: flowerType.image_url }}
          style={[styles.flowerCardImage, { transform: [{ rotate }] }]}
          resizeMode="contain"
        />
        <ScaledText size={11} weight="600" color={Colors.textPrimary} numberOfLines={1} style={styles.flowerCardName}>
          {isZh ? (flowerType.name_zh || flowerType.name_en) : flowerType.name_en}
        </ScaledText>
        <View style={[styles.rarityDot, { backgroundColor: rarityInfo.dot }]} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const MemoFlowerCard = React.memo(FlowerCard);

function CollectionProgress({ count, total, isZh }: { count: number; total: number; isZh: boolean }) {
  const progress = total > 0 ? count / total : 0;
  const milestones = [5, 10, 15, 20];

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressHeader}>
        <ScaledText size={13} weight="700" color="#5D4037">
          🌸 {isZh ? '花田收藏' : 'Collection'}
        </ScaledText>
        <ScaledText size={13} weight="600" color="#8D6E63">
          {count}/{total}
        </ScaledText>
      </View>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${Math.min(100, progress * 100)}%` }]} />
        {milestones.map((m) => (
          <View key={m} style={[styles.progressMilestone, { left: `${(m / total) * 100}%` }]}>
            <ScaledText size={10}>{count >= m ? '🌸' : '🌱'}</ScaledText>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function FlowerYieldScreen() {
  const { patientId, patientName, language, flowersJustStolen, clearFlowersStolen } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const scrollY = useRef(new Animated.Value(0)).current;

  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const lastPan = useRef({ x: 0, y: 0 });

  const gardenPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
      onPanResponderGrant: () => {
        panX.setOffset(lastPan.current.x);
        panY.setOffset(lastPan.current.y);
        panX.setValue(0);
        panY.setValue(0);
      },
      onPanResponderMove: (_, g) => {
        const clampedDx = Math.max(-40, Math.min(40, g.dx));
        const clampedDy = Math.max(-40, Math.min(40, g.dy));
        panX.setValue(clampedDx);
        panY.setValue(clampedDy);
      },
      onPanResponderRelease: (_, g) => {
        const finalX = Math.max(-40, Math.min(40, lastPan.current.x + g.dx));
        const finalY = Math.max(-40, Math.min(40, lastPan.current.y + g.dy));
        lastPan.current = { x: finalX, y: finalY };
        panX.flattenOffset();
        panY.flattenOffset();
        Animated.parallel([
          Animated.spring(panX, { toValue: 0, friction: 7, tension: 40, useNativeDriver: true }),
          Animated.spring(panY, { toValue: 0, friction: 7, tension: 40, useNativeDriver: true }),
        ]).start(() => {
          lastPan.current = { x: 0, y: 0 };
        });
      },
    })
  ).current;

  const [selectedFlower, setSelectedFlower] = useState<PatientFlower | null>(null);
  const [theftModalVisible, setTheftModalVisible] = useState<boolean>(false);

  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const patientDataQuery = useQuery({
    queryKey: ['gardenPatientData', patientId],
    queryFn: async () => {
      log('[FlowerYield] Fetching patient garden data for:', patientId);
      const { data, error } = await supabase
        .from('patients')
        .select('consecutive_inactive_days, stars_available, fires_available')
        .eq('id', patientId!)
        .single();
      if (error) {
        log('[FlowerYield] Patient data fetch error:', error);
        throw error;
      }
      return data || { consecutive_inactive_days: 0, stars_available: 0, fires_available: 0 };
    },
    enabled: !!patientId,
    staleTime: 5 * 1000,
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
        .order('grid_position');
      if (error) {
        log('[FlowerYield] Flowers fetch error:', error);
        throw error;
      }
      return (data || []) as PatientFlower[];
    },
    enabled: !!patientId,
    staleTime: 5 * 1000,
  });

  const flowerTypesQuery = useQuery({
    queryKey: ['flowerTypes'],
    queryFn: async () => {
      log('[FlowerYield] Fetching flower types');
      const { data, error } = await supabase.from('flower_types').select('*');
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
    (flowerTypesQuery.data || []).forEach((ft) => { map[ft.id] = ft; });
    return map;
  }, [flowerTypesQuery.data]);

  useEffect(() => {
    if (flowersJustStolen > 0) {
      setTheftModalVisible(true);
      void queryClient.invalidateQueries({ queryKey: ['patientFlowers', patientId] });
      void queryClient.invalidateQueries({ queryKey: ['gardenPatientData', patientId] });
    }
  }, [flowersJustStolen, queryClient, patientId]);

  const patientData = patientDataQuery.data;
  const flowers = flowersQuery.data || [];
  const isLoading = patientDataQuery.isLoading || flowersQuery.isLoading || flowerTypesQuery.isLoading;

  const selectedFlowerType = selectedFlower
    ? (selectedFlower.flower_types || flowerTypeMap[selectedFlower.flower_type_id])
    : undefined;

  const gardenTranslateY = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [0, -30],
    extrapolate: 'clamp',
  });

  const gardenScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.1, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="flower-yield-back">
            <ChevronLeft size={24} color="#5D4037" />
          </TouchableOpacity>
          <View style={styles.woodenSign}>
            <ScaledText size={18} weight="bold" color="#4E342E" numberOfLines={1}>
              {patientName ? (isZh ? `${patientName}的花田` : `${patientName}'s Garden`) : (isZh ? '我的花田' : 'My Garden')}
            </ScaledText>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
        >
          <View style={styles.topBar}>
            <View style={styles.resourceChip}>
              <ScaledText size={12} weight="600" color="#B8860B">⭐ {patientData?.stars_available ?? 0}</ScaledText>
            </View>
            <View style={styles.resourceChip}>
              <ScaledText size={12} weight="600" color="#E65100">🔥 {patientData?.fires_available ?? 0}</ScaledText>
            </View>
            <TouchableOpacity style={styles.drawBtn} onPress={() => router.push('/gacha-draw')} activeOpacity={0.75} testID="lucky-draw-btn">
              <Sparkles size={14} color="#FFF" />
              <ScaledText size={11} weight="700" color="#FFF">
                {language === 'zh_hant' ? '抽出幸運花朵' : language === 'zh_hans' ? '抽出幸运花朵' : 'Lucky Flower Draw'}
              </ScaledText>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                backgroundColor: '#FFE0B2',
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: '#FFCC80',
              }}
              onPress={() => router.push('/treasure-chest')}
              activeOpacity={0.75}
              testID="treasure-chest-btn"
            >
              <Gift size={14} color="#8B4513" />
              <ScaledText size={11} weight="700" color="#8B4513">
                {language === 'zh_hant' ? '我的寶箱' : language === 'zh_hans' ? '我的宝箱' : 'Treasure'}
              </ScaledText>
            </TouchableOpacity>
          </View>

          <CollectionProgress count={flowers.length} total={TOTAL_SLOTS} isZh={isZh} />

          <View style={styles.gardenHeroContainer} {...gardenPanResponder.panHandlers}>
            <Animated.View style={{ transform: [{ translateY: gardenTranslateY }, { scale: gardenScale }] }}>
              <Animated.Image
                source={{ uri: SUPABASE_STORAGE + 'garden-bg.png' }}
                style={[styles.gardenHeroImage, {
                  transform: [{ translateX: panX }, { translateY: panY }],
                }]}
                resizeMode="contain"
              />
            </Animated.View>
            <SparkleParticles />
            {flowers.length === 0 && (
              <View style={styles.emptyGardenHint}>
                <ScaledText size={14} weight="600" color="#5D4037">
                  {isZh ? '快去抽花裝飾你的花田吧！🌱' : 'Draw flowers to decorate your garden! 🌱'}
                </ScaledText>
              </View>
            )}
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : flowers.length > 0 ? (
            <View style={styles.collectionSection}>
              <ScaledText size={16} weight="bold" color="#5D4037" style={styles.collectionTitle}>
                {isZh ? '🌸 我的花朵收藏' : '🌸 My Flower Collection'}
              </ScaledText>
              <View style={styles.flowerGrid}>
                {flowers.map((flower, index) => {
                  const ft = flower.flower_types || flowerTypeMap[flower.flower_type_id];
                  return (
                    <MemoFlowerCard
                      key={flower.id}
                      flower={flower}
                      flowerType={ft}
                      index={index}
                      isZh={isZh}
                      onPress={() => setSelectedFlower(flower)}
                    />
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={{ height: 40 }} />
        </Animated.ScrollView>
      </SafeAreaView>

      <Modal visible={theftModalVisible} transparent animationType="fade" onRequestClose={() => setTheftModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.theftModal}>
            <ScaledText size={40}>😢</ScaledText>
            <ScaledText size={18} weight="bold" color="#5D4037" style={{ textAlign: 'center' as const, marginVertical: 12 }}>
              {isZh ? '你的花田被偷了！' : 'Your garden was raided!'}
            </ScaledText>
            <ScaledText size={15} color="#795548" style={{ textAlign: 'center' as const, lineHeight: 22, marginBottom: 20 }}>
              {isZh
                ? `${flowersJustStolen} 朵花因為你沒有練習而被偷走了！\n記得每天做練習保護花田！`
                : `${flowersJustStolen} flower${flowersJustStolen > 1 ? 's were' : ' was'} stolen!\nPractice daily to protect your flowers!`}
            </ScaledText>
            <TouchableOpacity
              style={styles.theftCloseBtn}
              onPress={() => { setTheftModalVisible(false); clearFlowersStolen(); }}
              testID="theft-modal-close"
            >
              <ScaledText size={15} weight="700" color="#FFF">{isZh ? '我知道了' : 'I understand'}</ScaledText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedFlower} transparent animationType="fade" onRequestClose={() => setSelectedFlower(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedFlower(null)}>
          <View style={styles.tooltipModal}>
            <TouchableOpacity style={styles.tooltipClose} onPress={() => setSelectedFlower(null)} testID="tooltip-close">
              <X size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
            {selectedFlowerType && (
              <>
                <Image source={{ uri: selectedFlowerType.image_url }} style={styles.tooltipFlowerImage} resizeMode="contain" />
                <ScaledText size={18} weight="bold" color={Colors.textPrimary} style={{ textAlign: 'center' as const, marginBottom: 8 }}>
                  {isZh ? (selectedFlowerType.name_zh || selectedFlowerType.name_en) : selectedFlowerType.name_en}
                </ScaledText>
                {selectedFlowerType.rarity && (
                  <View style={[styles.rarityBadge, { backgroundColor: (RARITY_COLORS[selectedFlowerType.rarity]?.bg) || '#F5F5F5' }]}>
                    <View style={[styles.rarityDotLarge, { backgroundColor: (RARITY_COLORS[selectedFlowerType.rarity]?.dot) || '#999' }]} />
                    <ScaledText size={12} weight="700" color={(RARITY_COLORS[selectedFlowerType.rarity]?.dot) || '#999'}>
                      {selectedFlowerType.rarity.charAt(0).toUpperCase() + selectedFlowerType.rarity.slice(1)}
                    </ScaledText>
                  </View>
                )}
                {selectedFlower?.obtained_at && (
                  <ScaledText size={12} color={Colors.textSecondary} style={{ marginTop: 10 }}>
                    {isZh ? '獲得日期：' : 'Acquired: '}
                    {new Date(selectedFlower.obtained_at).toLocaleDateString(isZh ? 'zh-TW' : 'en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </ScaledText>
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
    backgroundColor: '#F7F3E9',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF8E7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#D7CCC8',
  },
  woodenSign: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#FFECB3',
    marginHorizontal: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#D7A54A',
    shadowColor: '#8D6E63',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
    gap: 6,
  },
  resourceChip: {
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  drawBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#E91E63',
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#E91E63',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  chestBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFE0B2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFCC80',
  },
  progressContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#FFF8E7',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F0E0C0',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressBarBg: {
    height: 20,
    backgroundColor: '#E8E0D0',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: '#8BC34A',
    borderRadius: 10,
  },
  progressMilestone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -8,
  },
  gardenHeroContainer: {
    marginHorizontal: -20,
    height: SCREEN_WIDTH * 1.15,
    position: 'relative',
    overflow: 'hidden',
  },
  gardenHeroImage: {
    width: SCREEN_WIDTH * 1.3,
    height: SCREEN_WIDTH * 1.3,
    alignSelf: 'center',
    marginLeft: -SCREEN_WIDTH * 0.15,
  },
  emptyGardenHint: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    marginHorizontal: 40,
    paddingVertical: 10,
    borderRadius: 12,
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
  },
  collectionSection: {
    marginHorizontal: 16,
    marginTop: 4,
  },
  collectionTitle: {
    marginBottom: 12,
  },
  flowerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  flowerCard: {
    width: (SCREEN_WIDTH - 32 - 24) / 4,
    alignItems: 'center',
  },
  flowerCardEmpty: {
    width: (SCREEN_WIDTH - 32 - 24) / 4,
    height: 100,
  },
  flowerCardInner: {
    alignItems: 'center',
    backgroundColor: '#FFFDF5',
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: '#F0E8D8',
    width: '100%',
    shadowColor: '#8D6E63',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  flowerShadow: {
    position: 'absolute',
    bottom: 28,
    width: '60%',
    height: 8,
    borderRadius: 50,
    opacity: 0.5,
  },
  flowerCardImage: {
    width: 52,
    height: 52,
    marginBottom: 4,
  },
  flowerCardName: {
    textAlign: 'center',
    marginBottom: 4,
  },
  rarityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
  rarityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  rarityDotLarge: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
