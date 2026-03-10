import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Image, Animated, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { Organisation } from '@/types';
import Colors from '@/constants/colors';
import { ScaledText } from '@/components/ScaledText';
import { JASON_PHOTO } from '@/constants/images';
import { log } from '@/lib/logger';

export default function IndexScreen() {
  const { isReady, language, termsAccepted, patientId, t } = useApp();
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const orgsFadeAnim = useRef(new Animated.Value(0)).current;
  const [partners, setPartners] = useState<Organisation[]>([]);
  const [supporters, setSupporters] = useState<Organisation[]>([]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        log('[Splash] Fetching organisations');
        const { data, error } = await supabase
          .from('organisations')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (error) {
          log('[Splash] Fetch orgs error:', error);
          return;
        }
        const orgs = (data || []) as Organisation[];
        setPartners(orgs.filter(o => o.type === 'partner'));
        setSupporters(orgs.filter(o => o.type === 'supporter'));
        log('[Splash] Loaded organisations:', orgs.length);

        Animated.timing(orgsFadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }).start();
      } catch (e) {
        log('[Splash] Failed to fetch organisations:', e);
      }
    };
    void fetchOrgs();
  }, [orgsFadeAnim]);

  useEffect(() => {
    if (!isReady) return;

    const checkSplashAd = async () => {
      let nextRoute = '/';
      if (!language) {
        nextRoute = '/language';
      } else if (!termsAccepted) {
        nextRoute = '/terms';
      } else if (!patientId) {
        nextRoute = '/code-entry';
      } else {
        nextRoute = '/(tabs)/home';
      }

      // Check for active splash ads (only if user has a patientId)
      if (patientId) {
        try {
          const today = new Date().toISOString().split('T')[0];
          const { data: ads } = await supabase
            .from('splash_ads')
            .select('*, splash_ad_targets(patient_id)')
            .eq('is_active', true)
            .lte('start_date', today)
            .gte('end_date', today)
            .order('sort_order', { ascending: true })
            .limit(1);

          if (ads && ads.length > 0) {
            const ad = ads[0];
            const isTargetedAll = ad.target_type === 'all';
            const isTargetedToMe = ad.splash_ad_targets?.some(
              (t: { patient_id: string }) => t.patient_id === patientId
            );

            if (isTargetedAll || isTargetedToMe) {
              setTimeout(() => {
                router.replace({
                  pathname: '/splash-ad',
                  params: {
                    imageUrl: ad.image_url,
                    linkUrl: ad.link_url || '',
                    duration: String(ad.display_duration_seconds || 5),
                    nextRoute: nextRoute,
                  },
                });
              }, 2500);
              return;
            }
          }
        } catch (e) {
          log('[Splash] Error checking splash ads:', e);
        }
      }

      // No splash ad — navigate normally
      setTimeout(() => {
        router.replace(nextRoute as any);
      }, 2500);
    };

    void checkSplashAd();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, language, termsAccepted, patientId]);

  const isZh = language === 'zh_hant' || language === 'zh_hans';

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View style={styles.photoContainer}>
          <Image source={JASON_PHOTO} style={styles.photo} />
        </View>
        <ScaledText size={24} weight="bold" color={Colors.textPrimary} style={styles.title}>
          <Text>{'SLP Jason Lai'}</Text>
        </ScaledText>
        <ScaledText size={14} color={Colors.textSecondary} style={styles.subtitle}>
          <Text>{'Speech-Language Pathologist'}</Text>
        </ScaledText>
        <ActivityIndicator size="small" color={Colors.primary} style={styles.loader} />
      </Animated.View>

      {(partners.length > 0 || supporters.length > 0) && (
        <Animated.View style={[styles.orgsContainer, { opacity: orgsFadeAnim }]}>
          {partners.length > 0 && (
            <View style={styles.orgSection}>
              <Text style={styles.orgLabel}>
                {isZh ? t('inPartnershipWith') : 'In Partnership With'}
              </Text>
              <View style={styles.orgLogosRow}>
                {partners.map(org => (
                  <View key={org.id} style={styles.orgItemWithName}>
                    <View style={styles.orgLogoWrapper}>
                      {org.logo_url ? (
                        <Image
                          source={{ uri: org.logo_url }}
                          style={styles.orgLogo}
                          resizeMode="contain"
                        />
                      ) : (
                        <View style={styles.orgLogoPlaceholder}>
                          <Text style={styles.orgInitial}>
                            {(isZh ? (org.name_zh || org.name_en) : org.name_en)[0]}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.orgNameSplash} numberOfLines={2}>
                      {isZh ? (org.name_zh || org.name_en) : org.name_en}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {supporters.length > 0 && (
            <View style={[styles.orgSection, partners.length > 0 && styles.orgSectionSpacing]}>
              <Text style={styles.orgLabel}>
                {isZh ? t('supportedBy') : 'Supported By'}
              </Text>
              <View style={styles.orgLogosRow}>
                {supporters.map(org => (
                  <View key={org.id} style={styles.orgItemWithNameSmall}>
                    <View style={styles.orgLogoWrapperSmall}>
                      {org.logo_url ? (
                        <Image
                          source={{ uri: org.logo_url }}
                          style={styles.orgLogoSmall}
                          resizeMode="contain"
                        />
                      ) : (
                        <View style={styles.orgLogoPlaceholderSmall}>
                          <Text style={styles.orgInitialSmall}>
                            {(isZh ? (org.name_zh || org.name_en) : org.name_en)[0]}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.orgNameSplash} numberOfLines={2}>
                      {isZh ? (org.name_zh || org.name_en) : org.name_en}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  photoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 3,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 24,
  },
  loader: {
    marginTop: 8,
  },
  orgsContainer: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  orgSection: {
    alignItems: 'center',
  },
  orgSectionSpacing: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  orgLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#888',
    letterSpacing: 0.8,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  orgLogosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 12,
  },
  orgItemWithName: {
    alignItems: 'center',
    width: 100,
  },
  orgItemWithNameSmall: {
    alignItems: 'center',
    width: 100,
  },
  orgLogoWrapper: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  orgLogo: {
    width: 52,
    height: 52,
  },
  orgLogoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orgInitial: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: Colors.primary,
  },
  orgLogoWrapperSmall: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  orgLogoSmall: {
    width: 44,
    height: 44,
  },
  orgLogoPlaceholderSmall: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orgInitialSmall: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: Colors.primary,
  },
  orgNameSplash: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: '#555',
    marginTop: 5,
    textAlign: 'center',
    lineHeight: 13,
  },
});
