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

    const timer = setTimeout(() => {
      if (!language) {
        router.replace('/language');
      } else if (!termsAccepted) {
        router.replace('/terms');
      } else if (!patientId) {
        router.replace('/code-entry');
      } else {
        router.replace('/(tabs)/home');
      }
    }, 2500);

    return () => clearTimeout(timer);
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
                  <View key={org.id} style={styles.orgLogoWrapper}>
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
                  <View key={org.id} style={styles.orgLogoWrapperSmall}>
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
    marginTop: 14,
  },
  orgLabel: {
    fontSize: 11,
    color: Colors.disabled,
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
  },
  orgLogosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  orgLogoWrapper: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  orgLogo: {
    width: 52,
    height: 52,
  },
  orgLogoPlaceholder: {
    width: 60,
    height: 60,
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
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  orgLogoSmall: {
    width: 42,
    height: 42,
  },
  orgLogoPlaceholderSmall: {
    width: 50,
    height: 50,
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
});
