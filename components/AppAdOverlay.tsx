import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  Animated,
  Dimensions,
} from 'react-native';
import * as Linking from 'expo-linking';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { ScaledText } from '@/components/ScaledText';
import Colors from '@/constants/colors';
import { log } from '@/lib/logger';

interface AppAdOverlayProps {
  patientId: string;
  placement: string;
  onClose: () => void;
  language?: string;
}

interface AppAd {
  id: string;
  image_url: string;
  image_url_zh?: string | null;
  link_url?: string | null;
  advertiser_name?: string | null;
  advertiser_logo_url?: string | null;
  duration_seconds?: number | null;
  skip_delay_seconds?: number | null;
  display_format?: string | null;
  target_type?: string | null;
}

async function checkAdFree(patientId: string): Promise<boolean> {
  try {
    const { data: adFreeData } = await supabase
      .from('patients')
      .select('is_ad_free, clinicians(is_ad_free_for_patients, clinician_tiers(is_ad_free))')
      .eq('id', patientId)
      .maybeSingle();

    if (!adFreeData) return false;

    const patientFree = adFreeData.is_ad_free === true;

    let clinicianData = (adFreeData as any).clinicians;
    if (Array.isArray(clinicianData)) {
      clinicianData = clinicianData[0] || null;
    }

    const clinicianFree = clinicianData?.is_ad_free_for_patients === true;

    let tierData = clinicianData?.clinician_tiers;
    if (Array.isArray(tierData)) {
      tierData = tierData[0] || null;
    }

    const tierFree = tierData?.is_ad_free === true;

    return patientFree || clinicianFree || tierFree;
  } catch (e) {
    console.error('[AppAdOverlay] Ad-free check error:', e);
    log('[AppAdOverlay] Ad-free check error:', e);
  }
  return false;
}

async function fetchAd(patientId: string, placement: string): Promise<AppAd | null> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: ad } = await supabase
      .from('app_ads')
      .select('*')
      .eq('is_active', true)
      .eq('placement', placement)
      .lte('start_date', today)
      .gte('end_date', today)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!ad) return null;

    if (ad.target_type === 'specific') {
      const { data: targets } = await supabase
        .from('app_ad_targets')
        .select('id')
        .eq('ad_id', ad.id)
        .eq('patient_id', patientId)
        .limit(1);

      if (!targets || targets.length === 0) {
        return null;
      }
    }

    return ad as AppAd;
  } catch (e) {
    console.error('[AppAdOverlay] Fetch ad error:', e);
    log('[AppAdOverlay] Fetch ad error:', e);
  }
  return null;
}

async function trackImpression(adId: string, patientId: string, placement: string): Promise<void> {
  try {
    await supabase.from('app_ad_impressions').insert({
      ad_id: adId,
      patient_id: patientId,
      placement,
    });
    log('[AppAdOverlay] Impression tracked:', adId);
  } catch (e) {
    log('[AppAdOverlay] Impression track error:', e);
  }
}

async function trackClick(adId: string, patientId: string, placement: string): Promise<void> {
  try {
    await supabase.from('app_ad_clicks').insert({
      ad_id: adId,
      patient_id: patientId,
      placement,
    });
    log('[AppAdOverlay] Click tracked:', adId);
  } catch (e) {
    log('[AppAdOverlay] Click track error:', e);
  }
}

export default function AppAdOverlay({ patientId, placement, onClose, language }: AppAdOverlayProps) {
  const [ad, setAd] = useState<AppAd | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<number>(0);
  const [canSkip, setCanSkip] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const insets = useSafeAreaInsets();

  const onCloseRef = useRef(onClose);
  const patientIdRef = useRef(patientId);
  const placementRef = useRef(placement);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { patientIdRef.current = patientId; }, [patientId]);
  useEffect(() => { placementRef.current = placement; }, [placement]);

  const bannerSlide = useRef(new Animated.Value(80)).current;
  const autoDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const impressionTracked = useRef(false);

  const isZh = language?.startsWith('zh') ?? false;

  const getImageUrl = useCallback((adData: AppAd) => {
    if (isZh && adData.image_url_zh) return adData.image_url_zh;
    return adData.image_url;
  }, [isZh]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const adFree = await checkAdFree(patientIdRef.current);
        if (adFree || cancelled) {
          if (!cancelled) onCloseRef.current();
          return;
        }

        const foundAd = await fetchAd(patientIdRef.current, placementRef.current);
        if (!foundAd || cancelled) {
          if (!cancelled) {
            onCloseRef.current();
          }
          return;
        }

        const today = new Date().toISOString().split('T')[0];
        const { count: todayImpressionCount } = await supabase
          .from('app_ad_impressions')
          .select('id', { count: 'exact', head: true })
          .eq('ad_id', foundAd.id)
          .eq('patient_id', patientIdRef.current)
          .gte('viewed_at', today + 'T00:00:00');

        if ((todayImpressionCount ?? 0) >= 3) {
          if (!cancelled) onCloseRef.current();
          return;
        }

        setAd(foundAd);
        setLoading(false);

        const skipDelay = foundAd.skip_delay_seconds ?? 2;
        const duration = foundAd.duration_seconds ?? 5;
        setCountdown(skipDelay);

        if (foundAd.display_format === 'banner') {
          Animated.timing(bannerSlide, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start();
        }

        let remaining = skipDelay;
        countdownTimer.current = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            setCanSkip(true);
            setCountdown(0);
            if (countdownTimer.current) {
              clearInterval(countdownTimer.current);
              countdownTimer.current = null;
            }
          } else {
            setCountdown(remaining);
          }
        }, 1000);

        autoDismissTimer.current = setTimeout(() => {
          if (!cancelled) {
            handleDismiss();
          }
        }, duration * 1000);
      } catch (e) {
        console.error('[AppAdOverlay] INIT ERROR:', e);
        log('[AppAdOverlay] Init error:', e);
        if (!cancelled) onCloseRef.current();
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    if (dismissed) return;
    setDismissed(true);

    if (autoDismissTimer.current) {
      clearTimeout(autoDismissTimer.current);
      autoDismissTimer.current = null;
    }
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }

    if (ad?.display_format === 'banner') {
      Animated.timing(bannerSlide, {
        toValue: 80,
        duration: 250,
        useNativeDriver: true,
      }).start(() => onCloseRef.current());
    } else {
      onCloseRef.current();
    }
  }, [dismissed, ad, bannerSlide]);

  const handleAdPress = useCallback(async () => {
    if (!ad) return;
    if (ad.link_url) {
      void trackClick(ad.id, patientIdRef.current, placementRef.current);
      try {
        await Linking.openURL(ad.link_url);
      } catch (e) {
        log('[AppAdOverlay] Open URL error:', e);
      }
    }
  }, [ad]);

  if (loading || !ad) return null;

  if (ad.display_format === 'banner') {
    return (
      <Animated.View
        style={[
          bannerStyles.container,
          { transform: [{ translateY: bannerSlide }] },
        ]}
      >
        <View style={bannerStyles.sponsoredRow}>
          <ScaledText size={10} weight="600" color={Colors.textSecondary}>
            {isZh ? '贊助' : 'Sponsored'}
          </ScaledText>
        </View>
        <TouchableOpacity
          style={bannerStyles.content}
          onPress={handleAdPress}
          activeOpacity={0.9}
          testID="ad-banner-tap"
        >
          {ad.advertiser_logo_url && (
            <Image
              source={{ uri: ad.advertiser_logo_url }}
              style={bannerStyles.logo}
            />
          )}
          <Image
            source={{ uri: getImageUrl(ad) }}
            style={bannerStyles.image}
            resizeMode="cover"
            onLoad={() => {
              if (!impressionTracked.current && ad) {
                impressionTracked.current = true;
                void trackImpression(ad.id, patientIdRef.current, placementRef.current);
              }
            }}
          />
          {ad.advertiser_name && (
            <ScaledText size={11} weight="600" color={Colors.textPrimary} numberOfLines={1} style={bannerStyles.name}>
              {ad.advertiser_name}
            </ScaledText>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={bannerStyles.closeBtn}
          onPress={handleDismiss}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          testID="ad-banner-close"
        >
          <X size={16} color={Colors.textSecondary} />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={canSkip ? handleDismiss : undefined}
    >
      <View style={interstitialStyles.overlay}>
        <View style={interstitialStyles.topBar}>
          {ad.advertiser_name && (
            <ScaledText size={12} weight="600" color="rgba(255,255,255,0.8)">
              {ad.advertiser_name}
            </ScaledText>
          )}
          <ScaledText size={11} weight="500" color="rgba(255,255,255,0.6)">
            {isZh ? '贊助' : 'Sponsored'}
          </ScaledText>
        </View>

        <TouchableOpacity
          style={interstitialStyles.imageContainer}
          onPress={handleAdPress}
          activeOpacity={0.95}
          testID="ad-interstitial-tap"
        >
          <Image
            source={{ uri: getImageUrl(ad) }}
            style={interstitialStyles.image}
            resizeMode="contain"
            onLoad={() => {
              if (!impressionTracked.current && ad) {
                impressionTracked.current = true;
                void trackImpression(ad.id, patientIdRef.current, placementRef.current);
              }
            }}
          />
        </TouchableOpacity>

        <View style={[interstitialStyles.bottomBar, { top: Math.max(54, insets.top + 10) }]}>
          {canSkip ? (
            <TouchableOpacity
              style={interstitialStyles.skipBtn}
              onPress={handleDismiss}
              activeOpacity={0.7}
              testID="ad-skip-button"
            >
              <X size={18} color="#fff" />
              <ScaledText size={13} weight="600" color="#fff">
                {isZh ? '跳過' : 'Skip'}
              </ScaledText>
            </TouchableOpacity>
          ) : (
            <View style={interstitialStyles.countdownContainer}>
              <ScaledText size={13} weight="500" color="rgba(255,255,255,0.7)">
                {isZh ? `${countdown}秒後可跳過` : `Skip in ${countdown}s`}
              </ScaledText>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const interstitialStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    position: 'absolute' as const,
    top: 60,
    alignItems: 'center' as const,
    gap: 2,
  },
  imageContainer: {
    width: SCREEN_WIDTH * 0.9,
    maxHeight: '70%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: undefined,
    aspectRatio: 16 / 9,
    borderRadius: 16,
  },
  bottomBar: {
    position: 'absolute' as const,
    top: 54,
    right: 20,
    alignItems: 'flex-end' as const,
  },
  skipBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  countdownContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
});

const bannerStyles = StyleSheet.create({
  container: {
    position: 'absolute' as const,
    bottom: 60,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  sponsoredRow: {
    position: 'absolute' as const,
    top: 4,
    left: 12,
    zIndex: 2,
  },
  content: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingTop: 16,
    gap: 10,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  image: {
    flex: 1,
    height: 56,
    borderRadius: 8,
  },
  name: {
    maxWidth: 80,
  },
  closeBtn: {
    position: 'absolute' as const,
    top: 4,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.background,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
});
