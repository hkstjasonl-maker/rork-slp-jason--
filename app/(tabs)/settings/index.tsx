import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import Colors from '@/constants/colors';
import { JASON_PHOTO } from '@/constants/images';
import { FontSizeLevel, Language } from '@/types';
import {
  Type,
  Globe,
  LogOut,
  Info,
  ChevronRight,
  Check,
  Building2,
  BookOpen,
} from 'lucide-react-native';
import { AppTutorial } from '@/components/AppTutorial';

const FONT_SIZE_OPTIONS: { key: FontSizeLevel; labelKey: string }[] = [
  { key: 'small', labelKey: 'fontSmall' },
  { key: 'medium', labelKey: 'fontMedium' },
  { key: 'large', labelKey: 'fontLarge' },
  { key: 'extraLarge', labelKey: 'fontExtraLarge' },
];

const LANGUAGE_OPTIONS: { key: Language; label: string }[] = [
  { key: 'zh_hant', label: '繁體中文' },
  { key: 'zh_hans', label: '简体中文' },
  { key: 'en', label: 'English' },
];

export default function SettingsScreen() {
  const {
    t,
    language,
    fontSizeLevel,
    setFontSizeLevel,
    setLanguage,
    clearPatient,
    managingOrgNameEn,
    managingOrgNameZh,
    managingOrgLogoUrl,
  } = useApp();
  const [showTutorial, setShowTutorial] = useState(false);
  const router = useRouter();

  const handleSwitchProfile = useCallback(() => {
    const doSwitch = async () => {
      await clearPatient();
      router.replace('/code-entry');
    };

    if (Platform.OS === 'web') {
      if (window.confirm(t('confirmSwitch'))) {
        void doSwitch();
      }
    } else {
      Alert.alert(
        t('reEnterCode'),
        t('confirmSwitch'),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('confirm'), style: 'destructive', onPress: doSwitch },
        ]
      );
    }
  }, [clearPatient, router, t]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.headerSection}>
          <ScaledText size={26} weight="bold" color={Colors.textPrimary}>
            {t('settingsTitle')}
          </ScaledText>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Type size={18} color={Colors.primary} />
              <ScaledText size={16} weight="600" color={Colors.textPrimary}>
                {t('fontSize')}
              </ScaledText>
            </View>
            <View style={styles.card}>
              {FONT_SIZE_OPTIONS.map((option, idx) => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.optionRow,
                    idx < FONT_SIZE_OPTIONS.length - 1 && styles.optionBorder,
                  ]}
                  onPress={() => setFontSizeLevel(option.key)}
                  activeOpacity={0.6}
                >
                  <ScaledText size={15} color={Colors.textPrimary}>
                    {t(option.labelKey)}
                  </ScaledText>
                  {fontSizeLevel === option.key && (
                    <Check size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Globe size={18} color={Colors.primary} />
              <ScaledText size={16} weight="600" color={Colors.textPrimary}>
                {t('language')}
              </ScaledText>
            </View>
            <View style={styles.card}>
              {LANGUAGE_OPTIONS.map((option, idx) => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.optionRow,
                    idx < LANGUAGE_OPTIONS.length - 1 && styles.optionBorder,
                  ]}
                  onPress={() => setLanguage(option.key)}
                  activeOpacity={0.6}
                >
                  <ScaledText size={15} color={Colors.textPrimary}>
                    {option.label}
                  </ScaledText>
                  {language === option.key && (
                    <Check size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={handleSwitchProfile}
              activeOpacity={0.7}
            >
              <LogOut size={20} color={Colors.error} />
              <View style={styles.actionContent}>
                <ScaledText size={15} weight="600" color={Colors.error}>
                  {t('reEnterCode')}
                </ScaledText>
                <ScaledText size={13} color={Colors.textSecondary}>
                  {t('reEnterCodeDesc')}
                </ScaledText>
              </View>
              <ChevronRight size={18} color={Colors.disabled} />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => setShowTutorial(true)}
              activeOpacity={0.7}
            >
              <BookOpen size={20} color={Colors.primary} />
              <View style={styles.actionContent}>
                <ScaledText size={15} weight="600" color={Colors.textPrimary}>
                  {language === 'zh_hant' || language === 'zh_hans' ? '重播應用教學' : 'Replay App Tutorial'}
                </ScaledText>
                <ScaledText size={13} color={Colors.textSecondary}>
                  {language === 'zh_hant' || language === 'zh_hans' ? '重新了解如何使用此應用程式' : 'Learn how to use this app again'}
                </ScaledText>
              </View>
              <ChevronRight size={18} color={Colors.disabled} />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/partners')}
              activeOpacity={0.7}
            >
              <Building2 size={20} color={Colors.primary} />
              <View style={styles.actionContent}>
                <ScaledText size={15} weight="600" color={Colors.textPrimary}>
                  {t('partnersTitle')}
                </ScaledText>
              </View>
              <ChevronRight size={18} color={Colors.disabled} />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <View style={styles.therapistCard}>
              <Image source={JASON_PHOTO} style={styles.therapistPhoto} />
              <View style={styles.therapistInfo}>
                <ScaledText size={16} weight="bold" color={Colors.textPrimary}>
                  {t('slpName')}
                </ScaledText>
                <ScaledText size={13} color={Colors.primary} weight="600">
                  {t('slpTitle')}
                </ScaledText>
                <ScaledText size={12} color={Colors.secondary} weight="600" style={{ marginTop: 1 }}>
                  {language === 'zh_hant' || language === 'zh_hans' ? '研發創辦人' : 'Founder & Developer'}
                </ScaledText>
                <ScaledText size={12} color={Colors.textSecondary} style={styles.therapistHint}>
                  {t('aboutTherapistDesc')}
                </ScaledText>
              </View>
            </View>
          </View>

          {(managingOrgNameEn || managingOrgNameZh) && (
            <View style={styles.section}>
              <View style={styles.managingOrgCard}>
                {managingOrgLogoUrl ? (
                  <Image
                    source={{ uri: managingOrgLogoUrl }}
                    style={styles.managingOrgLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.managingOrgIconCircle}>
                    <Building2 size={24} color={Colors.primary} />
                  </View>
                )}
                <View style={styles.managingOrgInfo}>
                  <ScaledText size={11} color={Colors.textSecondary} weight="600">
                    {language === 'zh_hant' || language === 'zh_hans' ? '管理機構' : 'Managing Organisation'}
                  </ScaledText>
                  <ScaledText size={15} weight="700" color={Colors.textPrimary}>
                    {language === 'zh_hant' || language === 'zh_hans'
                      ? (managingOrgNameZh || managingOrgNameEn)
                      : (managingOrgNameEn || managingOrgNameZh)}
                  </ScaledText>
                </View>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.infoCard}>
              <Info size={18} color={Colors.textSecondary} />
              <Text style={styles.versionText}>
                {t('appVersion') + ': 1.0.0'}
              </Text>
            </View>
          </View>

          <CopyrightFooter />
        </ScrollView>
      </SafeAreaView>
      <AppTutorial
        visible={showTutorial}
        onComplete={() => setShowTutorial(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  headerSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  optionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  actionCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 14,
  },
  actionContent: {
    flex: 1,
    gap: 2,
  },
  therapistCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  therapistPhoto: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  therapistInfo: {
    flex: 1,
    gap: 2,
  },
  therapistHint: {
    marginTop: 4,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  versionText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  managingOrgCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  managingOrgLogo: {
    width: 50,
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  managingOrgIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  managingOrgInfo: {
    flex: 1,
    gap: 3,
  },
});
