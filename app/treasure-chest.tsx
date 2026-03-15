import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Animated,
  Modal,
  Dimensions,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Gift, Copy, Eye, Clock, X, Tag, Ticket, Award, MessageCircle, AlertTriangle } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { log } from '@/lib/logger';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MarketingPrize {
  id: string;
  prize_name_en: string;
  prize_name_zh: string;
  prize_type: string;
  discount_code: string | null;
  voucher_image_url: string | null;
  prize_description_en: string | null;
  prize_description_zh: string | null;
  redeem_code_prefix: string | null;
  redeem_instructions_en: string | null;
  redeem_instructions_zh: string | null;
  redeem_image_url: string | null;
  gift_details_en: string | null;
  gift_details_zh: string | null;
  gift_collection_instructions: string | null;
  congratulations_message_en: string | null;
  congratulations_message_zh: string | null;
  expiry_date: string | null;
}

interface MarketingCampaign {
  title_en: string;
  title_zh: string;
}

interface PatientPrize {
  id: string;
  patient_id: string;
  marketing_prize_id: string;
  discount_code: string | null;
  redeem_code: string | null;
  expiry_date: string | null;
  is_expired: boolean;
  is_viewed: boolean;
  is_redeemed: boolean;
  won_at: string;
  marketing_prizes?: MarketingPrize;
  marketing_campaigns?: MarketingCampaign;
}

const PRIZE_TYPE_CONFIG: Record<string, { labelEn: string; labelZh: string; color: string; icon: 'tag' | 'ticket' | 'award' | 'gift' | 'message' }> = {
  discount_code: { labelEn: 'Discount Code', labelZh: '折扣碼', color: '#E67E22', icon: 'tag' },
  voucher: { labelEn: 'Voucher', labelZh: '優惠券', color: '#2196F3', icon: 'ticket' },
  redeem_voucher: { labelEn: 'Redeem', labelZh: '兌換券', color: '#9C27B0', icon: 'award' },
  gift: { labelEn: 'Gift', labelZh: '禮品', color: '#E91E63', icon: 'gift' },
  message: { labelEn: 'Message', labelZh: '訊息', color: '#4CAF50', icon: 'message' },
};

function getPrizeTypeIcon(iconName: string, size: number, color: string) {
  switch (iconName) {
    case 'tag': return <Tag size={size} color={color} />;
    case 'ticket': return <Ticket size={size} color={color} />;
    case 'award': return <Award size={size} color={color} />;
    case 'gift': return <Gift size={size} color={color} />;
    case 'message': return <MessageCircle size={size} color={color} />;
    default: return <Gift size={size} color={color} />;
  }
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const expiry = new Date(dateStr);
  const diff = expiry.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatDate(dateStr: string, isZh: boolean): string {
  const d = new Date(dateStr);
  if (isZh) {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function PrizeDetailModal({
  prize,
  visible,
  isZh,
  onClose,
  onCopyCode,
}: {
  prize: PatientPrize | null;
  visible: boolean;
  isZh: boolean;
  onClose: () => void;
  onCopyCode: (code: string) => void;
}) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, scaleAnim, opacityAnim]);

  if (!visible || !prize) return null;

  const mp = prize.marketing_prizes;
  const mc = prize.marketing_campaigns;
  const prizeName = mp ? (isZh ? (mp.prize_name_zh || mp.prize_name_en) : (mp.prize_name_en || mp.prize_name_zh)) : '';
  const campaignName = mc ? (isZh ? (mc.title_zh || mc.title_en) : (mc.title_en || mc.title_zh)) : null;
  const prizeDesc = mp ? (isZh ? (mp.prize_description_zh || mp.prize_description_en) : (mp.prize_description_en || mp.prize_description_zh)) : null;
  const prizeType = mp?.prize_type || 'gift';
  const effectiveExpiry = prize.expiry_date || mp?.expiry_date || null;
  const typeConfig = PRIZE_TYPE_CONFIG[prizeType] || PRIZE_TYPE_CONFIG.gift;
  const isExpired = prize.is_expired || (effectiveExpiry && new Date(effectiveExpiry) < new Date());
  const remaining = effectiveExpiry ? daysUntil(effectiveExpiry) : null;
  const isExpiringSoon = remaining !== null && remaining <= 7 && !isExpired;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[detailStyles.overlay, { opacity: opacityAnim }]}>
        <Animated.View style={[detailStyles.card, { transform: [{ scale: scaleAnim }] }]}>
          <TouchableOpacity
            style={detailStyles.closeBtn}
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            testID="prize-detail-close"
          >
            <X size={20} color="#999" />
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={detailStyles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {mp?.voucher_image_url ? (
              <View style={detailStyles.imageContainer}>
                <Image
                  source={{ uri: mp.voucher_image_url }}
                  style={detailStyles.prizeImage}
                  resizeMode="contain"
                />
              </View>
            ) : (
              <View style={detailStyles.iconContainer}>
                <View style={[detailStyles.iconCircle, { backgroundColor: typeConfig.color + '18' }]}>
                  {getPrizeTypeIcon(typeConfig.icon, 40, typeConfig.color)}
                </View>
              </View>
            )}

            <ScaledText size={20} weight="bold" color={Colors.textPrimary} style={detailStyles.prizeName}>
              {prizeName}
            </ScaledText>

            {campaignName && (
              <ScaledText size={12} color={Colors.textSecondary} style={detailStyles.campaignName}>
                {campaignName}
              </ScaledText>
            )}

            <View style={[detailStyles.typeBadge, { backgroundColor: typeConfig.color + '18' }]}>
              {getPrizeTypeIcon(typeConfig.icon, 14, typeConfig.color)}
              <ScaledText size={12} weight="700" color={typeConfig.color}>
                {isZh ? typeConfig.labelZh : typeConfig.labelEn}
              </ScaledText>
            </View>

            {isExpired && (
              <View style={detailStyles.expiredBanner}>
                <AlertTriangle size={14} color="#FFF" />
                <ScaledText size={13} weight="600" color="#FFF">
                  {isZh ? '此獎品已過期' : 'This prize has expired'}
                </ScaledText>
              </View>
            )}

            {isExpiringSoon && (
              <View style={detailStyles.expiringSoonBanner}>
                <Clock size={14} color="#E65100" />
                <ScaledText size={13} weight="600" color="#E65100">
                  {remaining === 0
                    ? (isZh ? '今天過期！' : 'Expires today!')
                    : isZh
                      ? `${remaining}天後過期！`
                      : `Expires in ${remaining} day${remaining > 1 ? 's' : ''}!`}
                </ScaledText>
              </View>
            )}

            {prizeType === 'discount_code' && (prize.discount_code || mp?.discount_code) && (
              <View style={detailStyles.discountCodeBox}>
                <ScaledText size={12} color="#7a7a7a" style={{ marginBottom: 8 }}>
                  {isZh ? '你的折扣碼' : 'Your Discount Code'} {isZh ? '折扣碼' : ''}
                </ScaledText>
                <ScaledText size={28} weight="bold" color="#5b8a72" style={{ letterSpacing: 3, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'center' }}>
                  {prize.discount_code || mp?.discount_code || ''}
                </ScaledText>
                {!isExpired && (
                  <TouchableOpacity
                    style={detailStyles.discountCopyBtn}
                    onPress={() => onCopyCode(prize.discount_code || mp?.discount_code || '')}
                    activeOpacity={0.75}
                    testID="prize-detail-copy"
                  >
                    <Copy size={16} color="#FFF" />
                    <ScaledText size={14} weight="600" color="#FFF">
                      {isZh ? '複製代碼' : 'Copy Code'}
                    </ScaledText>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {prizeType === 'voucher' && (
              <View style={detailStyles.voucherSection}>
                {mp?.voucher_image_url && (
                  <Image
                    source={{ uri: mp.voucher_image_url }}
                    style={detailStyles.voucherFullImage}
                    resizeMode="contain"
                  />
                )}
                <ScaledText size={12} color="#7a7a7a" style={{ textAlign: 'center', marginTop: 8, fontStyle: 'italic' }}>
                  {isZh ? '截圖保存此優惠券' : 'Screenshot this voucher to use'}
                </ScaledText>
              </View>
            )}

            {prizeType === 'redeem_voucher' && (
              <View style={detailStyles.redeemSection}>
                {(prize.discount_code || prize.redeem_code) && (
                  <View style={detailStyles.redeemCodeBox}>
                    <ScaledText size={12} color="#7a7a7a" style={{ marginBottom: 8 }}>
                      {isZh ? '你的兌換碼' : 'Your Redeem Code'}
                    </ScaledText>
                    <ScaledText size={24} weight="bold" color="#e07a3a" style={{ letterSpacing: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'center' }}>
                      {prize.redeem_code || prize.discount_code || 'N/A'}
                    </ScaledText>
                    {!isExpired && (
                      <TouchableOpacity
                        style={[detailStyles.discountCopyBtn, { backgroundColor: '#e07a3a', marginTop: 12 }]}
                        onPress={() => onCopyCode(prize.redeem_code || prize.discount_code || '')}
                        activeOpacity={0.75}
                      >
                        <Copy size={16} color="#FFF" />
                        <ScaledText size={14} weight="600" color="#FFF">
                          {isZh ? '複製兌換碼' : 'Copy Redeem Code'}
                        </ScaledText>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {(mp?.redeem_instructions_en || mp?.redeem_instructions_zh) && (
                  <View style={detailStyles.redeemInstructionsBox}>
                    <ScaledText size={13} weight="600" color="#2c2c2c" style={{ marginBottom: 4 }}>
                      {isZh ? '如何兌換' : 'How to Redeem'}
                    </ScaledText>
                    <ScaledText size={13} color="#7a7a7a" style={{ lineHeight: 20 }}>
                      {isZh ? (mp?.redeem_instructions_zh || mp?.redeem_instructions_en || '') : (mp?.redeem_instructions_en || mp?.redeem_instructions_zh || '')}
                    </ScaledText>
                  </View>
                )}
                {mp?.redeem_image_url && (
                  <Image
                    source={{ uri: mp.redeem_image_url }}
                    style={detailStyles.redeemVoucherImage}
                    resizeMode="contain"
                  />
                )}
                {mp?.voucher_image_url && (
                  <Image
                    source={{ uri: mp.voucher_image_url }}
                    style={detailStyles.redeemVoucherImage}
                    resizeMode="contain"
                  />
                )}
              </View>
            )}

            {prizeType === 'gift' && (
              <View style={detailStyles.giftBox}>
                <ScaledText size={15} weight="700" color="#e07a3a" style={{ marginBottom: 8 }}>
                  🎁 {isZh ? (mp?.gift_details_zh || mp?.gift_details_en || '') : (mp?.gift_details_en || mp?.gift_details_zh || '')}
                </ScaledText>
                {mp?.gift_collection_instructions && (
                  <ScaledText size={13} color="#7a7a7a" style={{ lineHeight: 20 }}>
                    {mp.gift_collection_instructions}
                  </ScaledText>
                )}
              </View>
            )}

            {prizeType === 'message' && (
              <View style={detailStyles.messageContainer}>
                <ScaledText size={32} style={{ marginBottom: 12, textAlign: 'center' }}>🎉</ScaledText>
                <ScaledText size={16} weight="600" color="#2c2c2c" style={{ textAlign: 'center', lineHeight: 24 }}>
                  {isZh ? (mp?.congratulations_message_zh || mp?.congratulations_message_en || '') : (mp?.congratulations_message_en || mp?.congratulations_message_zh || '')}
                </ScaledText>
              </View>
            )}

            {prizeDesc && (
              <View style={detailStyles.descriptionSection}>
                <ScaledText size={12} weight="600" color={Colors.textSecondary} style={detailStyles.descLabel}>
                  {isZh ? '說明' : 'Description'}
                </ScaledText>
                <ScaledText size={13} color={Colors.textPrimary} style={detailStyles.descText}>
                  {prizeDesc}
                </ScaledText>
              </View>
            )}

            <View style={detailStyles.metaSection}>
              <View style={detailStyles.metaRow}>
                <ScaledText size={11} color={Colors.textSecondary}>
                  {isZh ? '獲得日期' : 'Won on'}
                </ScaledText>
                <ScaledText size={11} weight="600" color={Colors.textPrimary}>
                  {formatDate(prize.won_at, isZh)}
                </ScaledText>
              </View>
              {effectiveExpiry && (
                <View style={detailStyles.metaRow}>
                  <ScaledText size={11} color={Colors.textSecondary}>
                    {isZh ? '到期日期' : 'Expires on'}
                  </ScaledText>
                  <ScaledText size={11} weight="600" color={isExpired ? Colors.error : isExpiringSoon ? '#E65100' : Colors.textPrimary}>
                    {formatDate(effectiveExpiry, isZh)}
                    {isExpired ? (isZh ? ' ⚠️ 已過期' : ' ⚠️ Expired') : isExpiringSoon ? (isZh ? ' ⏰ 即將過期' : ' ⏰ Expiring soon') : ''}
                  </ScaledText>
                </View>
              )}
            </View>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
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
  const effectiveExpiry = prize.expiry_date || mp?.expiry_date || null;
  const isExpired = prize.is_expired || (effectiveExpiry && new Date(effectiveExpiry) < new Date());
  const prizeName = mp ? (isZh ? (mp.prize_name_zh || mp.prize_name_en) : (mp.prize_name_en || mp.prize_name_zh)) : '';
  const prizeType = mp?.prize_type || 'gift';
  const typeConfig = PRIZE_TYPE_CONFIG[prizeType] || PRIZE_TYPE_CONFIG.gift;
  const remaining = effectiveExpiry ? daysUntil(effectiveExpiry) : null;
  const typeEmoji = prizeType === 'discount_code' ? '💳' : prizeType === 'voucher' ? '🖼️' : prizeType === 'redeem_voucher' ? '🎫' : prizeType === 'gift' ? '🎁' : '💬';

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
            <View style={[styles.prizeIconFallback, { backgroundColor: typeConfig.color + '12' }]}>
              <ScaledText size={28}>{typeEmoji}</ScaledText>
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

          {(prize.discount_code || mp?.discount_code) && (
            <View style={styles.codeRow}>
              <View style={[styles.codeBadge, isExpired && styles.codeBadgeExpired]}>
                <ScaledText size={12} weight="700" color={isExpired ? Colors.disabled : '#D4A017'}>
                  {prize.discount_code || mp?.discount_code}
                </ScaledText>
              </View>
              {!isExpired && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    onCopyCode(prize.discount_code || mp?.discount_code || '');
                  }}
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

          {effectiveExpiry && !isExpired && remaining !== null && (
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

          <View style={styles.cardBottomRow}>
            <ScaledText size={10} color={Colors.textSecondary}>
              {formatDate(prize.won_at, isZh)}
            </ScaledText>
            {!prize.is_viewed && !isExpired && (
              <View style={styles.viewHint}>
                <Eye size={11} color={Colors.primary} />
                <ScaledText size={10} color={Colors.primary}>
                  {isZh ? '點擊查看' : 'Tap to view'}
                </ScaledText>
              </View>
            )}
          </View>
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
  const [selectedPrize, setSelectedPrize] = useState<PatientPrize | null>(null);

  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const prizesQuery = useQuery({
    queryKey: ['patientPrizes', patientId],
    queryFn: async () => {
      log('[TreasureChest] Fetching prizes for patient:', patientId);
      const { data, error } = await supabase
        .from('patient_prizes')
        .select('*, marketing_prizes(prize_name_en, prize_name_zh, prize_type, discount_code, voucher_image_url, prize_description_en, prize_description_zh, redeem_code_prefix, redeem_instructions_en, redeem_instructions_zh, redeem_image_url, gift_details_en, gift_details_zh, gift_collection_instructions, congratulations_message_en, congratulations_message_zh, expiry_date), marketing_campaigns(title_en, title_zh)')
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
    log('[TreasureChest] Prize tapped:', prize.id);
    if (!prize.is_viewed) {
      markViewedMutation.mutate(prize.id);
    }
    setSelectedPrize(prize);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [markViewedMutation]);

  const handleCloseDetail = useCallback(() => {
    setSelectedPrize(null);
  }, []);

  const handleCopyCode = useCallback(async (code: string) => {
    try {
      await Clipboard.setStringAsync(code);
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
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

      <PrizeDetailModal
        prize={selectedPrize}
        visible={!!selectedPrize}
        isZh={isZh}
        onClose={handleCloseDetail}
        onCopyCode={handleCopyCode}
      />
    </View>
  );
}

const detailStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    width: SCREEN_WIDTH - 40,
    maxWidth: 400,
    maxHeight: '88%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 28,
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFF8E7',
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prizeImage: {
    width: '100%',
    height: 140,
  },
  iconContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prizeName: {
    textAlign: 'center',
    marginBottom: 10,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 14,
  },
  expiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F44336',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    width: '100%',
    marginBottom: 12,
  },
  expiringSoonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    width: '100%',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFB74D',
  },
  campaignName: {
    textAlign: 'center',
    marginBottom: 8,
  },
  discountCodeBox: {
    backgroundColor: '#f0f8f0',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginVertical: 16,
    borderWidth: 2,
    borderColor: '#5b8a72',
    borderStyle: 'dashed',
    width: '100%',
  },
  discountCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#5b8a72',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  voucherSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  voucherFullImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  voucherHint: {
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  redeemSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  redeemCodeBox: {
    backgroundColor: '#f5f0e8',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginVertical: 16,
    borderWidth: 2,
    borderColor: '#e07a3a',
    width: '100%',
  },
  redeemInstructionsBox: {
    backgroundColor: '#faf8f5',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f3f0ec',
    width: '100%',
  },
  redeemVoucherImage: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginTop: 12,
  },
  giftBox: {
    width: '100%',
    backgroundColor: '#fff8f0',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#f5dcc8',
  },
  messageContainer: {
    width: '100%',
    backgroundColor: '#f0f4ff',
    borderRadius: 16,
    padding: 20,
    marginVertical: 16,
    alignItems: 'center',
  },
  descriptionSection: {
    width: '100%',
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  descLabel: {
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  descText: {
    lineHeight: 20,
  },
  metaSection: {
    width: '100%',
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

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
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
});
