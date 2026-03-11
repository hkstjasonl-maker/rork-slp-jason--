import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { X, Gift, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import ScratchCard from '@/components/ScratchCard';
import { ScaledText } from '@/components/ScaledText';
import { useApp } from '@/contexts/AppContext';
import {
  QueuedCampaign,
  recordDrawAndAwardPrize,
} from '@/lib/marketingDraw';
import { log } from '@/lib/logger';
import Colors from '@/constants/colors';
import { Language } from '@/types';

interface MarketingDrawModalProps {
  visible: boolean;
  queue: QueuedCampaign[];
  patientId: string;
  onClose: () => void;
}

function getCampaignTitle(campaign: QueuedCampaign['campaign'], language: Language | null): string {
  const lang = language || 'en';
  if (lang === 'zh_hant' || lang === 'zh_hans') {
    return campaign.title_zh || campaign.title_en;
  }
  return campaign.title_en;
}

function getPrizeName(prize: QueuedCampaign['prize'], language: Language | null): string {
  const lang = language || 'en';
  if (lang === 'zh_hant' || lang === 'zh_hans') {
    return prize.name_zh || prize.name_en;
  }
  return prize.name_en;
}

export default function MarketingDrawModal({
  visible,
  queue,
  patientId,
  onClose,
}: MarketingDrawModalProps) {
  const { language, t } = useApp();
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [phase, setPhase] = useState<'scratch' | 'revealed' | 'done'>('scratch');
  const [saving, setSaving] = useState<boolean>(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (visible) {
      setCurrentIndex(0);
      setPhase('scratch');
      fadeAnim.setValue(0);
      slideAnim.setValue(50);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, slideAnim]);

  const currentItem = queue[currentIndex] ?? null;

  const handleRevealed = useCallback(async () => {
    if (!currentItem || saving) return;
    setSaving(true);

    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    try {
      const success = await recordDrawAndAwardPrize(
        patientId,
        currentItem.campaign.id,
        currentItem.prize
      );
      if (success) {
        log('[MarketingDrawModal] Prize recorded for campaign:', currentItem.campaign.id);
      } else {
        log('[MarketingDrawModal] Failed to record prize');
      }
    } catch (e) {
      log('[MarketingDrawModal] Error recording prize:', e);
    } finally {
      setSaving(false);
      setPhase('revealed');
    }
  }, [currentItem, patientId, saving]);

  const handleNext = useCallback(() => {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setPhase('scratch');
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } else {
      setPhase('done');
    }
  }, [currentIndex, queue.length]);

  const handleViewTreasure = useCallback(() => {
    onClose();
    router.push('/treasure-chest');
  }, [onClose, router]);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!visible || queue.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View
          style={[
            styles.container,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleDismiss}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={22} color="#999" />
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {phase === 'done' ? (
              <View style={styles.doneContainer}>
                <View style={styles.doneIconCircle}>
                  <Gift size={36} color="#FF6B6B" />
                </View>
                <ScaledText size={20} weight="bold" color={Colors.textPrimary} style={styles.doneTitle}>
                  {t('marketingDrawComplete')}
                </ScaledText>
                <ScaledText size={15} color={Colors.textSecondary} style={styles.doneSubtitle}>
                  {t('prizeSavedToChest')}
                </ScaledText>

                <TouchableOpacity
                  style={styles.treasureBtn}
                  onPress={handleViewTreasure}
                  activeOpacity={0.8}
                >
                  <Gift size={18} color="#fff" />
                  <ScaledText size={15} weight="600" color="#fff" style={styles.treasureBtnText}>
                    {t('viewTreasureChest')}
                  </ScaledText>
                  <ChevronRight size={16} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dismissBtn}
                  onPress={handleDismiss}
                  activeOpacity={0.7}
                >
                  <ScaledText size={14} color={Colors.textSecondary}>
                    {t('maybeLater')}
                  </ScaledText>
                </TouchableOpacity>
              </View>
            ) : currentItem ? (
              <View style={styles.drawContainer}>
                <View style={styles.campaignHeader}>
                  <View style={styles.giftBadge}>
                    <ScaledText size={22}>🎁</ScaledText>
                  </View>
                  <ScaledText
                    size={18}
                    weight="bold"
                    color={Colors.textPrimary}
                    style={styles.campaignTitle}
                  >
                    {getCampaignTitle(currentItem.campaign, language)}
                  </ScaledText>
                  <ScaledText
                    size={14}
                    color={Colors.textSecondary}
                    style={styles.campaignSubtitle}
                  >
                    {t('chanceToWin')}
                  </ScaledText>
                </View>

                {queue.length > 1 && (
                  <View style={styles.queueIndicator}>
                    {queue.map((_, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.queueDot,
                          idx === currentIndex && styles.queueDotActive,
                          idx < currentIndex && styles.queueDotDone,
                        ]}
                      />
                    ))}
                  </View>
                )}

                <View style={styles.scratchContainer}>
                  <ScratchCard
                    prizeImageUrl={currentItem.prize.voucher_image_url}
                    prizeText={getPrizeName(currentItem.prize, language)}
                    prizeCode={currentItem.prize.discount_code}
                    onRevealed={handleRevealed}
                    scratchColor="#B8C4D0"
                  />
                </View>

                {phase === 'revealed' && (
                  <Animated.View style={styles.revealedSection}>
                    <ScaledText
                      size={16}
                      weight="bold"
                      color="#E67E22"
                      style={styles.congratsText}
                    >
                      🎉 {t('congratsPrize')}
                    </ScaledText>
                    <ScaledText
                      size={14}
                      color={Colors.textSecondary}
                      style={styles.savedText}
                    >
                      {t('prizeSavedToChest')}
                    </ScaledText>

                    {queue.length > 1 && currentIndex < queue.length - 1 ? (
                      <TouchableOpacity
                        style={styles.nextBtn}
                        onPress={handleNext}
                        activeOpacity={0.8}
                      >
                        <ScaledText size={15} weight="600" color="#fff">
                          {t('nextDraw')}
                        </ScaledText>
                        <ChevronRight size={16} color="#fff" />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.treasureBtn}
                        onPress={handleViewTreasure}
                        activeOpacity={0.8}
                      >
                        <Gift size={18} color="#fff" />
                        <ScaledText size={15} weight="600" color="#fff" style={styles.treasureBtnText}>
                          {t('viewTreasureChest')}
                        </ScaledText>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.dismissBtn}
                      onPress={currentIndex < queue.length - 1 ? handleNext : handleDismiss}
                      activeOpacity={0.7}
                    >
                      <ScaledText size={14} color={Colors.textSecondary}>
                        {currentIndex < queue.length - 1 ? '' : t('maybeLater')}
                      </ScaledText>
                    </TouchableOpacity>
                  </Animated.View>
                )}

                {phase === 'scratch' && (
                  <ScaledText
                    size={13}
                    color={Colors.textSecondary}
                    style={styles.hintText}
                  >
                    {t('scratchToReveal')}
                  </ScaledText>
                )}
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '100%',
    maxWidth: 360,
    maxHeight: '85%',
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
    paddingTop: 32,
    alignItems: 'center',
  },
  drawContainer: {
    alignItems: 'center',
    width: '100%',
  },
  campaignHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  giftBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF0F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  campaignTitle: {
    textAlign: 'center',
    marginBottom: 4,
  },
  campaignSubtitle: {
    textAlign: 'center',
  },
  queueIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  queueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0E0E0',
  },
  queueDotActive: {
    backgroundColor: '#FF6B6B',
    width: 20,
    borderRadius: 4,
  },
  queueDotDone: {
    backgroundColor: '#4CAF50',
  },
  scratchContainer: {
    marginVertical: 12,
  },
  revealedSection: {
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
  },
  congratsText: {
    textAlign: 'center',
    marginBottom: 4,
  },
  savedText: {
    textAlign: 'center',
    marginBottom: 16,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 6,
    width: '100%',
  },
  treasureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E67E22',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 6,
    width: '100%',
  },
  treasureBtnText: {
    marginLeft: 2,
  },
  dismissBtn: {
    marginTop: 12,
    paddingVertical: 8,
  },
  hintText: {
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  doneContainer: {
    alignItems: 'center',
    width: '100%',
    paddingVertical: 12,
  },
  doneIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF0F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  doneTitle: {
    textAlign: 'center',
    marginBottom: 6,
  },
  doneSubtitle: {
    textAlign: 'center',
    marginBottom: 20,
  },
});
