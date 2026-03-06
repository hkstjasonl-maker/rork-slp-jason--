import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { ScaledText } from '@/components/ScaledText';
import Colors from '@/constants/colors';
import { Organisation, Language } from '@/types';
import { log } from '@/lib/logger';
import { ChevronLeft, Globe, Building2 } from 'lucide-react-native';

function getOrgName(org: Organisation, language: Language | null): string {
  const lang = language || 'en';
  if (lang === 'zh_hant' || lang === 'zh_hans') return org.name_zh || org.name_en;
  return org.name_en || org.name_zh;
}

export default function PartnersScreen() {
  const { t, language } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const orgsQuery = useQuery({
    queryKey: ['organisations'],
    queryFn: async () => {
      log('[Partners] Fetching organisations');
      const { data, error } = await supabase
        .from('organisations')
        .select('*')
        .eq('is_active', true)
        .order('type', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('name_en', { ascending: true });

      if (error) {
        log('[Partners] Fetch error:', error);
        throw error;
      }
      log('[Partners] Fetched organisations:', data?.length);
      return (data || []) as Organisation[];
    },
  });

  const handleOpenWebsite = useCallback((url: string) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      void Linking.openURL(url);
    }
  }, []);

  const partners = (orgsQuery.data || []).filter(o => o.type === 'partner');
  const supporters = (orgsQuery.data || []).filter(o => o.type === 'supporter');

  const renderOrgCard = useCallback((org: Organisation) => {
    const name = getOrgName(org, language);
    const initial = (name || '?')[0].toUpperCase();

    return (
      <TouchableOpacity
        key={org.id}
        style={styles.orgCard}
        onPress={() => org.website_url && handleOpenWebsite(org.website_url)}
        activeOpacity={org.website_url ? 0.7 : 1}
        disabled={!org.website_url}
      >
        <View style={styles.orgLogoContainer}>
          {org.logo_url ? (
            <Image
              source={{ uri: org.logo_url }}
              style={styles.orgLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.orgLogoPlaceholder}>
              <Text style={styles.orgInitial}>
                {initial}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.orgInfo}>
          <Text style={styles.orgName} numberOfLines={2}>
            {name}
          </Text>
          {org.website_url && (
            <View style={styles.websiteRow}>
              <Globe size={13} color={Colors.primary} />
              <ScaledText size={12} color={Colors.primary}>
                {t('visitWebsite')}
              </ScaledText>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [language, handleOpenWebsite, t]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <ScaledText size={20} weight="bold" color={Colors.textPrimary}>
          {t('partnersTitle')}
        </ScaledText>
        <View style={styles.headerSpacer} />
      </View>

      {orgsQuery.isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (orgsQuery.data || []).length === 0 ? (
        <View style={styles.emptyContainer}>
          <Building2 size={48} color={Colors.disabled} />
          <ScaledText size={15} color={Colors.textSecondary} style={styles.emptyText}>
            {t('noOrganisations')}
          </ScaledText>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {partners.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionDot} />
                <ScaledText size={16} weight="bold" color={Colors.textPrimary}>
                  {t('partneringOrganisations')}
                </ScaledText>
              </View>
              <View style={styles.orgList}>
                {partners.map(renderOrgCard)}
              </View>
            </View>
          )}

          {supporters.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, styles.sectionDotSecondary]} />
                <ScaledText size={16} weight="bold" color={Colors.textPrimary}>
                  {t('supportingOrganisations')}
                </ScaledText>
              </View>
              <View style={styles.orgList}>
                {supporters.map(renderOrgCard)}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerSpacer: {
    width: 36,
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
    gap: 16,
  },
  emptyText: {
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 20,
  },
  section: {
    marginBottom: 28,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  sectionDotSecondary: {
    backgroundColor: Colors.secondary,
  },
  orgList: {
    gap: 12,
  },
  orgCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 14,
  },
  orgLogoContainer: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  orgLogo: {
    width: 64,
    height: 64,
  },
  orgLogoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orgInfo: {
    flex: 1,
    gap: 6,
  },
  orgInitial: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: Colors.primary,
  },
  orgName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  websiteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
});
