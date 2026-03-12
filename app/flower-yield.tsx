import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
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
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Gift, X, ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react-native';

import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { log } from '@/lib/logger';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TOTAL_SLOTS = 20;
const GRID_COLS = 4;
const GRID_ROWS = 5;
const PATH_HEIGHT = 320;

const RARITY_COLORS: Record<string, { bg: string; dot: string; label: string; glow: string }> = {
  common: { bg: '#E8F5E9', dot: '#4CAF50', label: '★', glow: '#A5D6A7' },
  uncommon: { bg: '#E3F2FD', dot: '#2196F3', label: '★★', glow: '#90CAF9' },
  rare: { bg: '#F3E5F5', dot: '#9C27B0', label: '★★★', glow: '#CE93D8' },
  epic: { bg: '#FFF3E0', dot: '#FF9800', label: '★★★★', glow: '#FFCC80' },
  legendary: { bg: '#FFF8E1', dot: '#FFD700', label: '★★★★★', glow: '#FFE082' },
};

const RARITY_ORDER: Record<string, number> = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };

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

interface GroupedFlower {
  flowerType: FlowerType;
  count: number;
  flowers: PatientFlower[];
}

function getStonePositions(width: number, height: number) {
  const positions: { x: number; y: number; index: number }[] = [];
  const marginX = width * 0.08;
  const marginY = height * 0.06;
  const usableW = width - marginX * 2;
  const usableH = height - marginY * 2;
  const rowH = usableH / (GRID_ROWS - 1);

  for (let row = 0; row < GRID_ROWS; row++) {
    const isEvenRow = row % 2 === 0;
    for (let col = 0; col < GRID_COLS; col++) {
      const colW = usableW / (GRID_COLS - 1);
      let x = marginX + col * colW;
      if (!isEvenRow) {
        x = marginX + (GRID_COLS - 1 - col) * colW;
      }
      const offsetX = Math.sin(row * 3 + col * 7) * 6;
      const offsetY = Math.cos(row * 5 + col * 3) * 4;
      positions.push({
        x: x + offsetX,
        y: marginY + row * rowH + offsetY,
        index: row * GRID_COLS + col,
      });
    }
  }
  return positions;
}

function PathDots({ positions }: { positions: { x: number; y: number }[] }) {
  const dots: { x: number; y: number }[] = [];
  for (let i = 0; i < positions.length - 1; i++) {
    const from = positions[i];
    const to = positions[i + 1];
    const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
    const numDots = Math.max(2, Math.floor(dist / 12));
    for (let d = 1; d < numDots; d++) {
      const t = d / numDots;
      dots.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
    }
  }
  return (
    <>
      {dots.map((dot, i) => (
        <View
          key={`dot-${i}`}
          style={{
            position: 'absolute' as const,
            left: dot.x - 2,
            top: dot.y - 2,
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: '#A5D6A7',
            opacity: 0.5,
          }}
        />
      ))}
    </>
  );
}

function StoneFlower({ flower: _flower, flowerType, stoneSize }: {
  flower: PatientFlower;
  flowerType: FlowerType | undefined;
  stoneSize: number;
}) {
  const swayAnim = useRef(new Animated.Value(0)).current;
  const popAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    Animated.spring(popAnim, {
      toValue: 1,
      friction: 5,
      tension: 50,
      useNativeDriver: true,
    }).start();

    const duration = 2200 + Math.random() * 800;
    const loopAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(swayAnim, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(swayAnim, { toValue: -1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(swayAnim, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const timer = setTimeout(() => loopAnim.start(), Math.random() * 600);
    return () => { clearTimeout(timer); loopAnim.stop(); };
  }, [popAnim, swayAnim]);

  if (!flowerType) return null;

  const rotate = swayAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-4deg', '0deg', '4deg'] });
  const scale = popAnim;
  const imgSize = stoneSize * 0.78;

  return (
    <Animated.Image
      source={{ uri: flowerType.image_url }}
      style={{
        width: imgSize,
        height: imgSize,
        position: 'absolute' as const,
        transform: [{ rotate }, { scale }],
      }}
      resizeMode="contain"
    />
  );
}

const MemoStoneFlower = React.memo(StoneFlower);

function SparkleParticles({ width: areaW, height: areaH }: { width: number; height: number }) {
  const particles = useRef(
    Array.from({ length: 6 }, () => ({
      x: new Animated.Value(Math.random() * areaW),
      y: new Animated.Value(Math.random() * areaH),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0.4 + Math.random() * 0.6),
    }))
  ).current;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const anims: Animated.CompositeAnimation[] = [];
    particles.forEach((p, i) => {
      const animate = () => {
        p.opacity.setValue(0);
        p.y.setValue(Math.random() * areaH * 0.8 + areaH * 0.1);
        p.x.setValue(Math.random() * areaW * 0.8 + areaW * 0.1);
        const anim = Animated.sequence([
          Animated.delay(i * 500 + Math.random() * 1500),
          Animated.parallel([
            Animated.timing(p.opacity, { toValue: 0.9, duration: 500, useNativeDriver: true }),
            Animated.timing(p.y, { toValue: (p.y as any)._value - 20, duration: 1800, useNativeDriver: true }),
          ]),
          Animated.timing(p.opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]);
        anim.start(() => animate());
        anims.push(anim);
      };
      animate();
    });
    return () => anims.forEach((a) => a.stop());
  }, [particles, areaW, areaH]);

  return (
    <>
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute' as const,
            transform: [{ translateX: p.x }, { translateY: p.y }, { scale: p.scale }],
            opacity: p.opacity,
            zIndex: 20,
          }}
        >
          <ScaledText size={12}>✨</ScaledText>
        </Animated.View>
      ))}
    </>
  );
}

function SteppingStonePath({ flowers, flowerTypeMap, onStonePress }: {
  flowers: PatientFlower[];
  flowerTypeMap: Record<string, FlowerType>;
  onStonePress: (flower: PatientFlower) => void;
}) {
  const pathWidth = SCREEN_WIDTH - 32;
  const positions = useMemo(() => getStonePositions(pathWidth, PATH_HEIGHT), [pathWidth]);
  const stoneSize = 50;

  const flowerBySlot = useMemo(() => {
    const map: Record<number, PatientFlower> = {};
    flowers.forEach((f) => { map[f.grid_position] = f; });
    return map;
  }, [flowers]);

  return (
    <View style={[styles.pathContainer, { height: PATH_HEIGHT }]}>
      <View style={styles.pathGrassBg}>
        <View style={styles.grassStripe1} />
        <View style={styles.grassStripe2} />
        <View style={styles.grassStripe3} />
      </View>

      <PathDots positions={positions} />

      <SparkleParticles width={pathWidth} height={PATH_HEIGHT} />

      {positions.map((pos) => {
        const flower = flowerBySlot[pos.index];
        const ft = flower ? (flower.flower_types || flowerTypeMap[flower.flower_type_id]) : undefined;
        const hasFlower = !!flower && !!ft;

        return (
          <TouchableOpacity
            key={pos.index}
            activeOpacity={hasFlower ? 0.7 : 1}
            onPress={hasFlower ? () => onStonePress(flower) : undefined}
            style={{
              position: 'absolute' as const,
              left: pos.x - stoneSize / 2,
              top: pos.y - stoneSize / 2,
              width: stoneSize,
              height: stoneSize,
              alignItems: 'center' as const,
              justifyContent: 'center' as const,
            }}
          >
            {hasFlower && (
              <View style={[styles.stoneGlow, { backgroundColor: (RARITY_COLORS[ft!.rarity]?.glow || '#A5D6A7') + '40' }]} />
            )}
            <View style={[
              styles.stone,
              hasFlower ? styles.stoneOccupied : styles.stoneEmpty,
            ]}>
              {hasFlower ? (
                <MemoStoneFlower flower={flower} flowerType={ft} stoneSize={stoneSize} />
              ) : (
                <View style={styles.stoneEmptyDot} />
              )}
            </View>
            <ScaledText size={8} color="#A5D6A7" style={{ marginTop: 1, opacity: 0.7 }}>
              {pos.index + 1}
            </ScaledText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function CollectionCard({ group, index, isZh, onPress: _onPress, expanded, onToggleExpand }: {
  group: GroupedFlower;
  index: number;
  isZh: boolean;
  onPress: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const popAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    Animated.spring(popAnim, {
      toValue: 1,
      friction: 6,
      tension: 50,
      delay: index * 60,
      useNativeDriver: true,
    }).start();
  }, [popAnim, index]);

  const scale = popAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const opacity = popAnim;

  const { flowerType, count, flowers: flowerInstances } = group;
  const rarity = flowerType.rarity || 'common';
  const rarityInfo = RARITY_COLORS[rarity] || RARITY_COLORS.common;

  return (
    <Animated.View style={[styles.collectionCard, { transform: [{ scale }], opacity }]}>
      <TouchableOpacity onPress={onToggleExpand} activeOpacity={0.8} style={styles.collectionCardInner}>
        <View style={[styles.cardGlow, { backgroundColor: rarityInfo.glow + '18' }]} />

        {count > 1 && (
          <View style={styles.countBadge}>
            <ScaledText size={10} weight="bold" color="#FFF">×{count}</ScaledText>
          </View>
        )}

        <Image
          source={{ uri: flowerType.image_url }}
          style={styles.cardFlowerImage}
          resizeMode="contain"
        />

        <ScaledText size={11} weight="600" color={Colors.textPrimary} numberOfLines={1} style={styles.cardFlowerName}>
          {isZh ? (flowerType.name_zh || flowerType.name_en) : flowerType.name_en}
        </ScaledText>

        <View style={[styles.cardRarityBadge, { backgroundColor: rarityInfo.bg }]}>
          <View style={[styles.cardRarityDot, { backgroundColor: rarityInfo.dot }]} />
          <ScaledText size={9} weight="700" color={rarityInfo.dot}>
            {rarity.charAt(0).toUpperCase() + rarity.slice(1)}
          </ScaledText>
        </View>

        {expanded && (
          <View style={styles.cardExpandedSection}>
            <View style={styles.cardDivider} />
            <ScaledText size={10} weight="600" color="#8D6E63" style={{ marginBottom: 4 }}>
              {isZh ? '獲得日期' : 'Acquired'}
            </ScaledText>
            {flowerInstances.slice(0, 5).map((fi) => (
              <ScaledText key={fi.id} size={9} color={Colors.textSecondary} style={{ marginTop: 2 }}>
                {new Date(fi.obtained_at).toLocaleDateString(isZh ? 'zh-TW' : 'en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </ScaledText>
            ))}
            {flowerInstances.length > 5 && (
              <ScaledText size={9} color={Colors.textSecondary} style={{ marginTop: 2 }}>
                +{flowerInstances.length - 5} more
              </ScaledText>
            )}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const MemoCollectionCard = React.memo(CollectionCard);

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

  const [selectedFlower, setSelectedFlower] = useState<PatientFlower | null>(null);
  const [theftModalVisible, setTheftModalVisible] = useState<boolean>(false);
  const [collectionExpanded, setCollectionExpanded] = useState<boolean>(true);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

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

  const flowersData = flowersQuery.data;
  const groupedFlowers = useMemo(() => {
    const groups: Record<string, GroupedFlower> = {};
    (flowersData || []).forEach((f) => {
      const ft = f.flower_types || flowerTypeMap[f.flower_type_id];
      if (!ft) return;
      if (!groups[ft.id]) {
        groups[ft.id] = { flowerType: ft, count: 0, flowers: [] };
      }
      groups[ft.id].count += 1;
      groups[ft.id].flowers.push(f);
    });
    return Object.values(groups).sort((a, b) => {
      const ra = RARITY_ORDER[a.flowerType.rarity] ?? 5;
      const rb = RARITY_ORDER[b.flowerType.rarity] ?? 5;
      if (ra !== rb) return ra - rb;
      return b.count - a.count;
    });
  }, [flowersData, flowerTypeMap]);

  const selectedFlowerType = selectedFlower
    ? (selectedFlower.flower_types || flowerTypeMap[selectedFlower.flower_type_id])
    : undefined;

  const selectedFlowerCount = selectedFlowerType
    ? groupedFlowers.find((g) => g.flowerType.id === selectedFlowerType.id)?.count ?? 1
    : 1;

  const handleStonePress = useCallback((flower: PatientFlower) => {
    setSelectedFlower(flower);
  }, []);

  const toggleCollection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollectionExpanded((prev) => !prev);
  }, []);

  const toggleCardExpand = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCardId((prev) => (prev === id ? null : id));
  }, []);

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

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
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
              style={styles.chestBtn}
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

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <>
              <View style={styles.pathSectionHeader}>
                <ScaledText size={14} weight="700" color="#5D4037">
                  🌿 {isZh ? '花田小路' : 'Garden Path'}
                </ScaledText>
              </View>
              <SteppingStonePath
                flowers={flowers}
                flowerTypeMap={flowerTypeMap}
                onStonePress={handleStonePress}
              />

              {flowers.length === 0 && (
                <View style={styles.emptyHint}>
                  <ScaledText size={14} weight="600" color="#5D4037">
                    {isZh ? '快去抽花裝飾你的花田吧！🌱' : 'Draw flowers to decorate your garden! 🌱'}
                  </ScaledText>
                </View>
              )}

              {groupedFlowers.length > 0 && (
                <View style={styles.collectionSection}>
                  <TouchableOpacity onPress={toggleCollection} activeOpacity={0.7} style={styles.collectionHeader}>
                    <ScaledText size={16} weight="bold" color="#5D4037">
                      🌸 {isZh ? '我的花朵收藏' : 'My Collection'}
                    </ScaledText>
                    <View style={styles.collectionToggle}>
                      <ScaledText size={12} color="#8D6E63">
                        {groupedFlowers.length} {isZh ? '種' : 'types'}
                      </ScaledText>
                      {collectionExpanded ? (
                        <ChevronUp size={16} color="#8D6E63" />
                      ) : (
                        <ChevronDown size={16} color="#8D6E63" />
                      )}
                    </View>
                  </TouchableOpacity>

                  {collectionExpanded && (
                    <View style={styles.collectionGrid}>
                      {groupedFlowers.map((group, index) => (
                        <MemoCollectionCard
                          key={group.flowerType.id}
                          group={group}
                          index={index}
                          isZh={isZh}
                          onPress={() => {
                            const firstFlower = group.flowers[0];
                            if (firstFlower) setSelectedFlower(firstFlower);
                          }}
                          expanded={expandedCardId === group.flowerType.id}
                          onToggleExpand={() => toggleCardExpand(group.flowerType.id)}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
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
                <ScaledText size={18} weight="bold" color={Colors.textPrimary} style={{ textAlign: 'center' as const, marginBottom: 4 }}>
                  {isZh ? (selectedFlowerType.name_zh || selectedFlowerType.name_en) : selectedFlowerType.name_en}
                </ScaledText>
                {selectedFlowerCount > 1 && (
                  <ScaledText size={13} weight="600" color="#8D6E63" style={{ marginBottom: 8 }}>
                    ×{selectedFlowerCount} {isZh ? '朵' : 'owned'}
                  </ScaledText>
                )}
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

const CARD_WIDTH = (SCREEN_WIDTH - 32 - 10) / 2;

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
  pathSectionHeader: {
    marginHorizontal: 16,
    marginBottom: 6,
  },
  pathContainer: {
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#D5EDCE',
    borderWidth: 2,
    borderColor: '#B8D4AA',
    marginBottom: 16,
  },
  pathGrassBg: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  grassStripe1: {
    position: 'absolute',
    top: '20%',
    left: -10,
    right: -10,
    height: 30,
    backgroundColor: '#C8E6B4',
    opacity: 0.4,
    borderRadius: 15,
    transform: [{ rotate: '-3deg' }],
  },
  grassStripe2: {
    position: 'absolute',
    top: '50%',
    left: -10,
    right: -10,
    height: 25,
    backgroundColor: '#B9DCA4',
    opacity: 0.35,
    borderRadius: 15,
    transform: [{ rotate: '2deg' }],
  },
  grassStripe3: {
    position: 'absolute',
    top: '75%',
    left: -10,
    right: -10,
    height: 20,
    backgroundColor: '#C8E6B4',
    opacity: 0.3,
    borderRadius: 15,
    transform: [{ rotate: '-1deg' }],
  },
  stone: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  stoneOccupied: {
    backgroundColor: '#E8F5E9',
    borderWidth: 2,
    borderColor: '#A5D6A7',
    shadowColor: '#2E7D32',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  stoneEmpty: {
    backgroundColor: '#D7CCC8',
    borderWidth: 1.5,
    borderColor: '#BCAAA4',
    opacity: 0.5,
  },
  stoneEmptyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#BCAAA4',
    opacity: 0.6,
  },
  stoneGlow: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  emptyHint: {
    alignItems: 'center',
    marginHorizontal: 40,
    marginTop: -8,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingVertical: 10,
    borderRadius: 12,
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
  },
  collectionSection: {
    marginHorizontal: 16,
  },
  collectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#FFF8E7',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#F0E0C0',
  },
  collectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  collectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  collectionCard: {
    width: CARD_WIDTH,
  },
  collectionCardInner: {
    alignItems: 'center',
    backgroundColor: '#FFFDF5',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#F0E8D8',
    shadowColor: '#8D6E63',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  countBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#E91E63',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  cardFlowerImage: {
    width: 56,
    height: 56,
    marginBottom: 6,
  },
  cardFlowerName: {
    textAlign: 'center',
    marginBottom: 4,
  },
  cardRarityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  cardRarityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cardExpandedSection: {
    marginTop: 8,
    alignItems: 'center',
    width: '100%',
  },
  cardDivider: {
    width: '80%',
    height: 1,
    backgroundColor: '#F0E0C0',
    marginBottom: 6,
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
