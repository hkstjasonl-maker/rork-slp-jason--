import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Animated,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Gift, Copy, Eye, Clock } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { log } from '@/lib/logger';

interface MarketingPrize {
  id: string;
  name_en: string;
  name_zh: string;
  description_en: string | null;
  description_zh: string | null;
  voucher_image_url: string | null;
  prize_type: string;
}

interface PatientPrize {
  id: string;
  patient_id: string;
  marketing_prize_id: string;
  discount_code: string | null;
  expiry_date: string | null;
  is_expired: boolean;
  is_viewed: boolean;
  is_redeemed: boolean;
  won_at: string;
  marketing_prizes?: MarketingPrize;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const expiry = new Date(dateStr);
  const diff = expiry.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function PrizeCard({
  prize,
  isZh,
  onPress,
  onCopyCode,
}: {
  prize: PatientPrize;
  isZh: boolean;
  onPress: () => void;
  onCopyCode: (code: string) => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const mp = prize.marketing_prizes;
  const isExpired = prize.is_expired || (prize.expiry_date && new Date(prize.expiry_date) < new Date());
  const prizeName = mp ? (isZh ? (mp.name_zh || mp.name_en) : mp.name_en) : '';
  const remaining = prize.expiry_date ? daysUntil(prize.expiry_date) : null;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  return (
    <Animated.View style={[styles.prizeCard, { opacity: fadeAnim }, isExpired && styles.prizeCardExpired]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={styles.prizeCardInner}
        testID={`prize-card-${prize.id}`}
      >
        <View style={styles.prizeImageArea}>
          {mp?.voucher_image_url ? (
            <Image
              source={{ uri: mp.voucher_image_url }}
              style={styles.prizeImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.prizeIconFallback}>
              <Gift size={32} color={isExpired ? Colors.disabled : '#D4A017'} />
            </View>
          )}
          {!prize.is_viewed && !isExpired && (
            <View style={styles.newBadge}>
              <ScaledText size={9} weight="bold" color="#FFF">NEW</ScaledText>
            </View>
          )}
          {isExpired && (
            <View style={styles.expiredOverlay}>
              <ScaledText size={11} weight="bold" color="#FFF">
                {isZh ? '已過期' : 'Expired'}
              </ScaledText>
            </View>
          )}
        </View>

        <View style={styles.prizeContent}>
          <ScaledText
            size={15}
            weight="700"
            color={isExpired ? Colors.disabled : Colors.textPrimary}
            numberOfLines={2}
          >
            {prizeName}
          </ScaledText>

          {prize.discount_code && (
            <View style={styles.codeRow}>
              <View style={[styles.codeBadge, isExpired && styles.codeBadgeExpired]}>
                <ScaledText size={12} weight="700" color={isExpired ? Colors.disabled : '#D4A017'}>
                  {prize.discount_code}
                </ScaledText>
              </View>
              {!isExpired && (
                <TouchableOpacity
                  onPress={() => onCopyCode(prize.discount_code!)}
                  style={styles.copyBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  testID={`copy-code-${prize.id}`}
                >
                  <Copy size={14} color={Colors.primary} />
                  <ScaledText size={11} weight="600" color={Colors.primary}>
                    {isZh ? '複製' : 'Copy'}
                  </ScaledText>
                </TouchableOpacity>
              )}
            </View>
          )}

          {prize.expiry_date && !isExpired && remaining !== null && (
            <View style={styles.expiryRow}>
              <Clock size={12} color={remaining <= 3 ? Colors.error : Colors.textSecondary} />
              <ScaledText
                size={11}
                color={remaining <= 3 ? Colors.error : Colors.textSecondary}
              >
                {remaining === 0
                  ? (isZh ? '今天過期' : 'Expires today')
                  : isZh
                    ? `${remaining}天後過期`
                    : `Expires in ${remaining} day${remaining > 1 ? 's' : ''}`}
              </ScaledText>
            </View>
          )}

          {!prize.is_viewed && !isExpired && (
            <View style={styles.viewHint}>
              <Eye size={11} color={Colors.primary} />
              <ScaledText size={10} color={Colors.primary}>
                {isZh ? '點擊查看' : 'Tap to view'}
              </ScaledText>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const MemoPrizeCard = React.memo(PrizeCard);

export default function TreasureChestScreen() {
  const { patientId, language } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const prizesQuery = useQuery({
    queryKey: ['patientPrizes', patientId],
    queryFn: async () => {
      log('[TreasureChest] Fetching prizes for patient:', patientId);
      const { data, error } = await supabase
        .from('patient_prizes')
        .select('*, marketing_prizes(*)')
        .eq('patient_id', patientId!)
        .order('won_at', { ascending: false });
      if (error) {
        log('[TreasureChest] Prizes fetch error:', error);
        throw error;
      }
      return (data || []) as PatientPrize[];
    },
    enabled: !!patientId,
    staleTime: 30 * 1000,
  });

  const markExpiredMutation = useMutation({
    mutationFn: async (expiredIds: string[]) => {
      log('[TreasureChest] Marking expired prizes:', expiredIds);
      const { error } = await supabase
        .from('patient_prizes')
        .update({ is_expired: true })
        .in('id', expiredIds);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patientPrizes', patientId] });
    },
  });

  const markViewedMutation = useMutation({
    mutationFn: async (prizeId: string) => {
      log('[TreasureChest] Marking prize as viewed:', prizeId);
      const { error } = await supabase
        .from('patient_prizes')
        .update({ is_viewed: true })
        .eq('id', prizeId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patientPrizes', patientId] });
    },
  });

  useEffect(() => {
    if (!prizesQuery.data) return;
    const now = new Date();
    const toExpire = prizesQuery.data.filter(
      (p) => !p.is_expired && p.expiry_date && new Date(p.expiry_date) < now
    );
    if (toExpire.length > 0) {
      markExpiredMutation.mutate(toExpire.map((p) => p.id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prizesQuery.data]);

  const handlePrizePress = useCallback((prize: PatientPrize) => {
    if (!prize.is_viewed) {
      markViewedMutation.mutate(prize.id);
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [markViewedMutation]);

  const handleCopyCode = useCallback(async (code: string) => {
    try {
      await Clipboard.setStringAsync(code);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      log('[TreasureChest] Code copied:', code);
    } catch (e) {
      log('[TreasureChest] Failed to copy code:', e);
    }
  }, []);

  const { activePrizes, expiredPrizes } = useMemo(() => {
    const all = prizesQuery.data || [];
    const now = new Date();
    const active: PatientPrize[] = [];
    const expired: PatientPrize[] = [];
    all.forEach((p) => {
      const isExp = p.is_expired || (p.expiry_date && new Date(p.expiry_date) < now);
      if (isExp) {
        expired.push(p);
      } else {
        active.push(p);
      }
    });
    return { activePrizes: active, expiredPrizes: expired };
  }, [prizesQuery.data]);

  const isEmpty = activePrizes.length === 0 && expiredPrizes.length === 0;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            testID="treasure-chest-back"
          >
            <ChevronLeft size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleArea}>
            <ScaledText size={20} weight="bold" color={Colors.textPrimary} numberOfLines={1}>
              🎁 {isZh ? '我的寶箱' : 'My Treasure Chest'}
            </ScaledText>
            <ScaledText size={12} color={Colors.textSecondary} style={styles.subtitle}>
              {isZh ? '你贏得的獎品和優惠券' : 'Your redeemed prizes and vouchers'}
            </ScaledText>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        {prizesQuery.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : isEmpty ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Gift size={56} color={Colors.disabled} />
            </View>
            <ScaledText size={17} weight="600" color={Colors.textSecondary} style={styles.emptyTitle}>
              {isZh ? '寶箱是空的' : 'Your treasure chest is empty'}
            </ScaledText>
            <ScaledText size={13} color={Colors.disabled} style={styles.emptyDesc}>
              {isZh
                ? '繼續使用應用程式贏取獎品吧！'
                : 'Keep using the app to win prizes!'}
            </ScaledText>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {activePrizes.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionDot} />
                  <ScaledText size={14} weight="700" color={Colors.textPrimary}>
                    {isZh ? '可用獎品' : 'Active Prizes'} ({activePrizes.length})
                  </ScaledText>
                </View>
                {activePrizes.map((prize) => (
                  <MemoPrizeCard
                    key={prize.id}
                    prize={prize}
                    isZh={isZh}
                    onPress={() => handlePrizePress(prize)}
                    onCopyCode={handleCopyCode}
                  />
                ))}
              </View>
            )}

            {expiredPrizes.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionDot, styles.sectionDotExpired]} />
                  <ScaledText size={14} weight="700" color={Colors.textSecondary}>
                    {isZh ? '已過期' : 'Expired'} ({expiredPrizes.length})
                  </ScaledText>
                </View>
                {expiredPrizes.map((prize) => (
                  <MemoPrizeCard
                    key={prize.id}
                    prize={prize}
                    isZh={isZh}
                    onPress={() => handlePrizePress(prize)}
                    onCopyCode={handleCopyCode}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFF9F0',
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
  subtitle: {
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F5F0E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyDesc: {
    textAlign: 'center',
    lineHeight: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  section: {
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D4A017',
  },
  sectionDotExpired: {
    backgroundColor: Colors.disabled,
  },
  prizeCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  prizeCardExpired: {
    opacity: 0.65,
  },
  prizeCardInner: {
    flexDirection: 'row',
    padding: 12,
  },
  prizeImageArea: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFF8E7',
    marginRight: 12,
  },
  prizeImage: {
    width: 80,
    height: 80,
  },
  prizeIconFallback: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#E91E63',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  expiredOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: 3,
    alignItems: 'center',
  },
  prizeContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codeBadge: {
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFE082',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderStyle: 'dashed',
  },
  codeBadgeExpired: {
    backgroundColor: '#F5F5F5',
    borderColor: Colors.border,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
});
