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
  Linking,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import Colors from '@/constants/colors';
import { JASON_PHOTO } from '@/constants/images';
import { FontSizeLevel, SubtitleSizeLevel, Language } from '@/types';
import { ENABLED_LANGUAGES } from '@/constants/i18n';
import {
  Type,
  Globe,
  LogOut,
  Info,
  ChevronRight,
  Check,
  Building2,
  BookOpen,
  Heart,
  Accessibility,
  Shield,
  Trash2,
  Dices,
  Captions,
} from 'lucide-react-native';
import { AppTutorial } from '@/components/AppTutorial';
import MiniMahjongGame from '@/components/MiniMahjongGame';
import { GameLevel } from '@/utils/mahjongGame';
import { initAudio } from '@/utils/soundEffects';

const FONT_SIZE_OPTIONS: { key: FontSizeLevel; labelKey: string }[] = [
  { key: 'small', labelKey: 'fontSmall' },
  { key: 'medium', labelKey: 'fontMedium' },
  { key: 'large', labelKey: 'fontLarge' },
  { key: 'extraLarge', labelKey: 'fontExtraLarge' },
];

const LANGUAGE_OPTIONS: { key: Language; label: string }[] = ENABLED_LANGUAGES.map(l => ({
  key: l.code as Language,
  label: l.nativeLabel,
}));

const SUBTITLE_SIZE_OPTIONS: { key: SubtitleSizeLevel; labelKey: string }[] = [
  { key: 'small', labelKey: 'subtitleSmall' },
  { key: 'medium', labelKey: 'subtitleMedium' },
  { key: 'large', labelKey: 'subtitleLarge' },
  { key: 'extraLarge', labelKey: 'subtitleExtraLarge' },
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
    liveSubtitlesEnabled,
    setLiveSubtitlesEnabled,
    subtitleSizeLevel,
    setSubtitleSizeLevel,
    mahjongGameEnabled,
    mahjongGameLevel,
    setMahjongGameEnabled,
    setMahjongGameLevel,
    acknowledgements,
    patientId,
  } = useApp();

  const [showTutorial, setShowTutorial] = useState(false);
  const [showMahjongGame, setShowMahjongGame] = useState(false);
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
              onPress={() => {
                const subject = encodeURIComponent('Data Deletion Request / 資料刪除要求');
                const body = encodeURIComponent('I would like to request deletion of my personal data from the SLP Jason app.\n\n我希望要求刪除我在SLP Jason應用程式中的個人資料。');
                void Linking.openURL(`mailto:YOUR_EMAIL@example.com?subject=${subject}&body=${body}`);
              }}
              activeOpacity={0.7}
            >
              <Trash2 size={20} color={Colors.error} />
              <View style={styles.actionContent}>
                <ScaledText size={15} weight="600" color={Colors.error}>
                  {language === 'zh_hant' || language === 'zh_hans'
                    ? '要求刪除資料'
                    : 'Request Data Deletion'}
                </ScaledText>
                <ScaledText size={13} color={Colors.textSecondary}>
                  {language === 'zh_hant' || language === 'zh_hans'
                    ? '要求刪除您的個人資料'
                    : 'Request deletion of your personal data'}
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
            <View style={styles.sectionHeader}>
              <Dices size={18} color={Colors.primary} />
              <ScaledText size={16} weight="600" color={Colors.textPrimary}>
                {t('miniMahjong')}
              </ScaledText>
            </View>
            <View style={styles.card}>
              <View style={[styles.optionRow, mahjongGameEnabled ? styles.optionBorder : undefined]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <ScaledText size={15} color={Colors.textPrimary}>
                    {t('enableMahjong')}
                  </ScaledText>
                </View>
                <Switch
                  value={mahjongGameEnabled}
                  onValueChange={(val) => void setMahjongGameEnabled(val)}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor="#fff"
                />
              </View>
              {mahjongGameEnabled && (
                <View style={styles.mahjongLevelSection}>
                  <ScaledText size={13} weight="600" color={Colors.textSecondary} style={{ marginBottom: 10 }}>
                    {t('mahjongLevel')}
                  </ScaledText>
                  <View style={styles.segmentedRow}>
                    {(['basic', 'moderate', 'difficult'] as const).map((lvl) => (
                      <TouchableOpacity
                        key={lvl}
                        style={[
                          styles.segmentButton,
                          mahjongGameLevel === lvl && styles.segmentButtonActive,
                        ]}
                        onPress={() => void setMahjongGameLevel(lvl)}
                        activeOpacity={0.7}
                      >
                        <ScaledText
                          size={13}
                          weight={mahjongGameLevel === lvl ? 'bold' : 'normal'}
                          color={mahjongGameLevel === lvl ? '#fff' : Colors.textPrimary}
                        >
                          {t(lvl === 'basic' ? 'mahjongBasic' : lvl === 'moderate' ? 'mahjongModerate' : 'mahjongDifficult')}
                        </ScaledText>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <ScaledText size={12} color={Colors.textSecondary} style={{ marginTop: 8 }}>
                    {t(mahjongGameLevel === 'basic' ? 'mahjongBasicDesc' : mahjongGameLevel === 'moderate' ? 'mahjongModerateDesc' : 'mahjongDifficultDesc')}
                  </ScaledText>
                  <TouchableOpacity
                    style={styles.playNowButton}
                    onPress={() => {
                      void initAudio().then(() => setShowMahjongGame(true));
                    }}
                    activeOpacity={0.8}
                    testID="mahjong-play-now"
                  >
                    <ScaledText size={16} weight="700" color="#FFFFFF">
                      {'🀄 ' + t('playNow')}
                    </ScaledText>
                  </TouchableOpacity>
                  <ScaledText size={11} color={Colors.textSecondary} style={{ marginTop: 6, textAlign: 'center' as const }}>
                    {t('practiceModeDesc')}
                  </ScaledText>
                </View>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Accessibility size={18} color={Colors.primary} />
              <ScaledText size={16} weight="600" color={Colors.textPrimary}>
                {language === 'zh_hant' || language === 'zh_hans'
                  ? '無障礙'
                  : 'Accessibility'}
              </ScaledText>
            </View>
            <View style={styles.card}>
              <View style={[styles.optionRow, styles.optionBorder]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <ScaledText size={15} color={Colors.textPrimary}>
                    {language === 'zh_hant'
                      ? '即時字幕（聽障輔助）'
                      : language === 'zh_hans'
                        ? '即时字幕（听障辅助）'
                        : 'Live Subtitles (Hearing Accessibility)'}
                  </ScaledText>
                  <ScaledText size={12} color={Colors.textSecondary}>
                    {language === 'zh_hant'
                      ? '播放音頻指導時自動顯示字幕'
                      : language === 'zh_hans'
                        ? '播放音频指导时自动显示字幕'
                        : 'Auto-shows subtitles when audio plays'}
                  </ScaledText>
                </View>
                <Switch
                  value={liveSubtitlesEnabled}
                  onValueChange={(val) => void setLiveSubtitlesEnabled(val)}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor="#fff"
                />
              </View>
              {liveSubtitlesEnabled && (
                <View style={styles.subtitleSizeSection}>
                  <View style={styles.subtitleSizeHeader}>
                    <Captions size={16} color={Colors.primary} />
                    <ScaledText size={13} weight="600" color={Colors.textSecondary}>
                      {t('subtitleSize')}
                    </ScaledText>
                  </View>
                  <View style={styles.segmentedRow}>
                    {SUBTITLE_SIZE_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.key}
                        style={[
                          styles.segmentButton,
                          subtitleSizeLevel === option.key && styles.segmentButtonActive,
                        ]}
                        onPress={() => void setSubtitleSizeLevel(option.key)}
                        activeOpacity={0.7}
                      >
                        <ScaledText
                          size={12}
                          weight={subtitleSizeLevel === option.key ? 'bold' : 'normal'}
                          color={subtitleSizeLevel === option.key ? '#fff' : Colors.textPrimary}
                        >
                          {t(option.labelKey)}
                        </ScaledText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              {Platform.OS !== 'web' && (
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => {
                    if (Platform.OS === 'ios') {
                      void Linking.openURL('App-prefs:ACCESSIBILITY');
                    } else {
                      void Linking.openSettings();
                    }
                  }}
                  activeOpacity={0.6}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <ScaledText size={15} color={Colors.textPrimary}>
                      {language === 'zh_hant' || language === 'zh_hans'
                        ? '裝置無障礙設定'
                        : 'Device Accessibility Settings'}
                    </ScaledText>
                    <ScaledText size={12} color={Colors.textSecondary}>
                      {language === 'zh_hant' || language === 'zh_hans'
                        ? '開啟裝置的無障礙設定（如即時字幕）'
                        : 'Open device settings (e.g. Live Captions)'}
                    </ScaledText>
                  </View>
                  <ChevronRight size={18} color={Colors.disabled} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => {
                void Linking.openURL('https://slpmedroom.com/privacy-policy');
              }}
              activeOpacity={0.7}
            >
              <Shield size={20} color={Colors.primary} />
              <View style={styles.actionContent}>
                <ScaledText size={15} weight="600" color={Colors.textPrimary}>
                  {language === 'zh_hant' || language === 'zh_hans'
                    ? '私隱政策'
                    : 'Privacy Policy'}
                </ScaledText>
                <ScaledText size={13} color={Colors.textSecondary}>
                  {language === 'zh_hant' || language === 'zh_hans'
                    ? '了解我們如何保護您的個人資料'
                    : 'Learn how we protect your personal data'}
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

          {acknowledgements.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Heart size={18} color={Colors.primary} />
                <ScaledText size={16} weight="600" color={Colors.textPrimary}>
                  {language === 'zh_hant' || language === 'zh_hans' ? '鳴謝' : 'Acknowledgements'}
                </ScaledText>
              </View>
              <View style={styles.card}>
                {acknowledgements.map((ack, idx) => {
                  const name = language === 'zh_hant' || language === 'zh_hans'
                    ? (ack.name_zh || ack.name_en)
                    : (ack.name_en || ack.name_zh);
                  const role = language === 'zh_hant' || language === 'zh_hans'
                    ? (ack.role_zh || ack.role_en)
                    : (ack.role_en || ack.role_zh);
                  return (
                    <View
                      key={ack.id}
                      style={[
                        styles.ackRow,
                        idx < acknowledgements.length - 1 && styles.optionBorder,
                      ]}
                    >
                      <ScaledText size={14} weight="600" color={Colors.textPrimary}>
                        {name}
                      </ScaledText>
                      {role ? (
                        <ScaledText size={12} color={Colors.textSecondary}>
                          {role}
                        </ScaledText>
                      ) : null}
                    </View>
                  );
                })}
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
      <MiniMahjongGame
        visible={showMahjongGame}
        level={(mahjongGameLevel || 'basic') as GameLevel}
        onClose={() => setShowMahjongGame(false)}
        patientId={patientId || ''}
        practiceMode
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
  ackRow: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    gap: 2,
  },
  mahjongLevelSection: {
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  segmentedRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.background,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segmentButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  playNowButton: {
    marginTop: 14,
    backgroundColor: '#2B6B35',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  subtitleSizeSection: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  subtitleSizeHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: 12,
    marginBottom: 10,
  },
});
