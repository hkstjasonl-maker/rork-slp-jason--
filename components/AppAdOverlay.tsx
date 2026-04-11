import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  Image,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import * as Linking from 'expo-linking';
import { X } from 'lucide-react-native';
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
  display_format?: string | null;
  duration_seconds?: number | null;
  skip_delay_seconds?: number | null;
  sort_order?: number | null;
}

async function checkAdFreeStatus(patientId: string): Promise<boolean> {
  try {
    const { data: patient } = await supabase
      .from('patients')
      .select('is_ad_free, clinician_id')
      .eq('id', patientId)
      .single();

    if (!patient) return false;
    if (patient.is_ad_free) return true;

    if (patient.clinician_id) {
      const { data: clinician } = await supabase
        .from('clinicians')
        .select('is_ad_free_for_patients, tier_id')
        .eq('id', patient.clinician_id)
        .single();

      if (clinician?.is_ad_free_for_patients) return true;

      if (clinician?.tier_id) {
        const { data: tier } = await supabase
          .from('clinician_tiers')
          .select('is_ad_free')
          .eq('id', clinician.tier_id)
          .single();

        if (tier?.is_ad_free) return true;
      }
    }

    return false;
  } catch (e) {
    log('[AppAdOverlay] Ad-free check error:', e);
    return false;
  }
}

async function fetchAdForPlacement(patientId: string, placement: string): Promise<AppAd | null> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: allAds, error } = await supabase
      .from('app_ads')
      .select('*')
      .eq('placement', placement)
      .eq('is_active', true)
      .lte('start_date', today)
      .gte('end_date', today)
      .order('sort_order', { ascending: true });

    if (error) {
      log('[AppAdOverlay] Fetch ads error:', error);
      return null;
    }
    if (!allAds || allAds.length === 0) return null;

    for (const ad of allAds) {
      if (ad.target_type === 'all') {
        return ad as AppAd;
      }
      const { data: target } = await supabase
        .from('app_ad_targets')
        .select('id')
        .eq('ad_id', ad.id)
        .eq('patient_id', patientId)
        .maybeSingle();

      if (target) return ad as AppAd;
    }

    return null;
  } catch (e) {
    log('[AppAdOverlay] Fetch ad error:', e);
    return null;
  }
}

async function trackImpression(adId: string, patientId: string, placement: string): Promise<void> {
  try {
    await supabase.from('app_ad_impressions').insert({
      ad_id: adId,
      patient_id: patientId,
      placement,
      viewed_at: new Date().toISOString(),
    });
    log('[AppAdOverlay] Impression tracked for ad:', adId);
  } catch (e) {
    log('[AppAdOverlay] Track impression error:', e);
  }
}

async function trackClick(adId: string, patientId: string, placement: string): Promise<void> {
  try {
    await supabase.from('app_ad_clicks').insert({
      ad_id: adId,
      patient_id: patientId,
      placement,
      clicked_at: new Date().toISOString(),
    });
    log('[AppAdOverlay] Click tracked for ad:', adId);
  } catch (e) {
    log('[AppAdOverlay] Track click error:', e);
  }
}

export default function AppAdOverlay({ patientId, placement, onClose, language }: AppAdOverlayProps) {
  const [ad, setAd] = useState<AppAd | null>(null);
  const [loading, setLoading] = useState(true);
  const [skipCountdown, setSkipCountdown] = useState<number | null>(null);
  const [canSkip, setCanSkip] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const bannerSlide = useRef(new Animated.Value(80)).current;
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impressionTracked = useRef(false);
  const closedRef = useRef(false);

  const safeClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    setDismissed(true);
    onClose();
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    const loadAd = async () => {
      const isAdFree = await checkAdFreeStatus(patientId);
      if (cancelled) return;
      if (isAdFree) {
        log('[AppAdOverlay] Patient is ad-free, skipping');
        safeClose();
        return;
      }

      const fetchedAd = await fetchAdForPlacement(patientId, placement);
      if (cancelled) return;
      if (!fetchedAd) {
        log('[AppAdOverlay] No ad found for placement:', placement);
        safeClose();
        return;
      }

      setAd(fetchedAd);
      setLoading(false);
    };

    void loadAd();

    return () => {
      cancelled = true;
    };
  }, [patientId, placement, safeClose]);

  useEffect(() => {
    if (!ad || loading || dismissed) return;

    if (!impressionTracked.current) {
      impressionTracked.current = true;
      void trackImpression(ad.id, patientId, placement);
    }

    const format = ad.display_format || 'interstitial';
    const skipDelay = ad.skip_delay_seconds ?? 2;
    const duration = ad.duration_seconds ?? 5;

    if (format === 'banner') {
      Animated.timing(bannerSlide, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();

      autoDismissRef.current = setTimeout(() => {
        Animated.timing(bannerSlide, {
          toValue: 80,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          safeClose();
        });
      }, duration * 1000);
    } else {
      setSkipCountdown(skipDelay);

      countdownRef.current = setInterval(() => {
        setSkipCountdown((prev) => {
          if (prev === null || prev <= 1) {
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
              countdownRef.current = null;
            }
            setCanSkip(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      autoDismissRef.current = setTimeout(() => {
        safeClose();
      }, duration * 1000);
    }

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      if (autoDismissRef.current) {
        clearTimeout(autoDismissRef.current);
        autoDismissRef.current = null;
      }
    };
  }, [ad, loading, dismissed, patientId, placement, bannerSlide, safeClose]);

  const handleAdTap = useCallback(() => {
    if (!ad?.link_url) return;
    void trackClick(ad.id, patientId, placement);
    void Linking.openURL(ad.link_url);
  }, [ad, patientId, placement]);

  const handleSkip = useCallback(() => {
    safeClose();
  }, [safeClose]);

  const isZh = language?.startsWith('zh') ?? false;

  const getImageUrl = useCallback((adData: AppAd): string => {
    if (isZh && adData.image_url_zh) return adData.image_url_zh;
    return adData.image_url;
  }, [isZh]);

  if (loading || !ad || dismissed) return null;

  const format = ad.display_format || 'interstitial';

  if (format === 'banner') {
    return (
      <Animated.View
        style={[
          styles.bannerContainer,
          { transform: [{ translateY: bannerSlide }] },
        ]}
      >
        <TouchableOpacity
          style={styles.bannerContent}
          onPress={handleAdTap}
          activeOpacity={0.9}
          testID="ad-banner-tap"
        >
          {ad.advertiser_logo_url && (
            <Image
              source={{ uri: ad.advertiser_logo_url }}
              style={styles.bannerLogo}
            />
          )}
          <View style={styles.bannerImageWrapper}>
            <Image
              source={{ uri: getImageUrl(ad) }}
              style={styles.bannerImage}
              resizeMode="cover"
            />
          </View>
          <ScaledText size={9} color={Colors.textSecondary} style={styles.bannerSponsoredLabel}>
            {isZh ? '贊助' : 'Sponsored'}
          </ScaledText>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bannerCloseButton}
          onPress={handleSkip}
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
      onRequestClose={canSkip ? handleSkip : undefined}
    >
      <View style={styles.interstitialOverlay}>
        <View style={styles.interstitialCard}>
          <ScaledText size={11} color="rgba(255,255,255,0.7)" style={styles.sponsoredLabel}>
            {isZh ? '贊助' : 'Sponsored'}
          </ScaledText>

          {ad.advertiser_name && (
            <ScaledText size={12} weight="600" color="rgba(255,255,255,0.9)" style={styles.advertiserName}>
              {ad.advertiser_name}
            </ScaledText>
          )}

          <TouchableOpacity
            style={styles.interstitialImageWrapper}
            onPress={handleAdTap}
            activeOpacity={0.95}
            testID="ad-interstitial-tap"
          >
            <Image
              source={{ uri: getImageUrl(ad) }}
              style={styles.interstitialImage}
              resizeMode="contain"
            />
          </TouchableOpacity>

          {canSkip ? (
            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkip}
              activeOpacity={0.7}
              testID="ad-skip-button"
            >
              <X size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={styles.countdownContainer}>
              <ScaledText size={13} color="rgba(255,255,255,0.7)">
                {isZh ? `${skipCountdown ?? 0}秒後可跳過` : `Skip in ${skipCountdown ?? 0}s`}
              </ScaledText>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  interstitialOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  interstitialCard: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  sponsoredLabel: {
    marginBottom: 8,
    textAlign: 'center' as const,
  },
  advertiserName: {
    marginBottom: 16,
    textAlign: 'center' as const,
  },
  interstitialImageWrapper: {
    width: '90%',
    maxHeight: '70%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  interstitialImage: {
    width: '100%',
    height: 300,
    borderRadius: 16,
  },
  skipButton: {
    position: 'absolute' as const,
    top: -40,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  bannerContainer: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
      default: {},
    }),
  },
  bannerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bannerLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  bannerImageWrapper: {
    flex: 1,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerSponsoredLabel: {
    position: 'absolute' as const,
    top: 2,
    left: 2,
  },
  bannerCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});
