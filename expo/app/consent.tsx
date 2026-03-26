import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import Colors from '@/constants/colors';
import { ShieldCheck, Check, FileText } from 'lucide-react-native';

interface Clause {
  number: number;
  titleEn: string;
  titleZh: string;
  en: string;
  zh: string;
}

const CLAUSES: Clause[] = [
  {
    number: 1,
    titleEn: 'Nature of App',
    titleZh: '應用程式性質',
    en: 'NanoHab is a home exercise management tool. It does NOT provide medical diagnosis, clinical assessment, or treatment. All exercises are prescribed by your clinician/organisation.',
    zh: '醫家動是一款居家運動管理工具，不提供醫療診斷、臨床評估或治療功能。所有運動均由您的治療師/機構處方。',
  },
  {
    number: 2,
    titleEn: 'Clinical Responsibility',
    titleZh: '臨床責任',
    en: 'All clinical responsibility for exercise prescription, monitoring, and outcomes rests with the prescribing clinician and/or their affiliated organisation. Neither the app developer, NanoHab, nor Dr. Avive Group Limited bears any clinical responsibility or liability.',
    zh: '所有運動處方、監察及成效的臨床責任均由處方治療師及/或其所屬機構承擔。應用程式開發者、醫家動及 Dr. Avive Group Limited 不承擔任何臨床責任或法律責任。',
  },
  {
    number: 3,
    titleEn: 'No Liability',
    titleZh: '免責聲明',
    en: 'To the fullest extent permitted by the laws of the Hong Kong Special Administrative Region (HKSAR), Dr. Avive Group Limited, its directors, employees, and agents shall not be liable for any direct, indirect, incidental, consequential, or special damages arising from the use of this app.',
    zh: '在香港特別行政區法律允許的最大範圍內，Dr. Avive Group Limited 及其董事、僱員和代理人不對因使用本應用程式而產生的任何直接、間接、附帶、相應或特殊損害承擔責任。',
  },
  {
    number: 4,
    titleEn: 'Video Recordings',
    titleZh: '影片錄製',
    en: 'Exercise videos you record and submit through this app are collected solely for clinical review by your prescribing clinician. These recordings are for internal clinical use only and will NOT be used for promotion, marketing, sharing with third parties, artificial intelligence training, or any purpose beyond clinical review, unless a separate written agreement is signed with you.',
    zh: '您透過本應用程式錄製並提交的運動影片僅供處方治療師進行臨床審查。該等錄影僅作內部臨床用途，不會用於推廣、行銷、與第三方分享、人工智能訓練或臨床審查以外的任何用途，除非另行與您簽署書面協議。',
  },
  {
    number: 5,
    titleEn: 'Personal Data',
    titleZh: '個人資料',
    en: 'Your personal data is handled in compliance with the Personal Data (Privacy) Ordinance (Cap. 486) of HKSAR. Data collected includes your name, exercise records, and submitted videos. This data is accessible only to your assigned clinician and authorised administrators.',
    zh: '您的個人資料按照香港特別行政區《個人資料（私隱）條例》（第486章）處理。收集的資料包括您的姓名、運動記錄及提交的影片。該等資料僅供您指定的治療師及授權管理員存取。',
  },
  {
    number: 6,
    titleEn: 'Data Retention',
    titleZh: '資料保留',
    en: 'Your data will be retained for the duration of your active clinical programme and may be retained thereafter in accordance with applicable record-keeping requirements. You may request data deletion by contacting your clinician.',
    zh: '您的資料將在您的臨床療程期間保留，並可能在其後根據適用的記錄保存規定繼續保留。您可聯絡您的治療師要求刪除資料。',
  },
  {
    number: 7,
    titleEn: 'Intellectual Property',
    titleZh: '知識產權',
    en: 'All content, design, and functionality of NanoHab are the intellectual property of Dr. Avive Group Limited. Exercise content is the intellectual property of the respective clinician or content creator.',
    zh: '醫家動的所有內容、設計及功能均為 Dr. Avive Group Limited 的知識產權。運動內容為相關治療師或內容創作者的知識產權。',
  },
  {
    number: 8,
    titleEn: 'Governing Law',
    titleZh: '適用法律',
    en: 'These terms are governed by the laws of the Hong Kong Special Administrative Region. Any disputes shall be subject to the exclusive jurisdiction of the courts of HKSAR.',
    zh: '本條款受香港特別行政區法律管轄。任何爭議須受香港特別行政區法院的專屬管轄權管轄。',
  },
  {
    number: 9,
    titleEn: 'Amendments',
    titleZh: '條款修訂',
    en: 'Dr. Avive Group Limited reserves the right to amend these terms at any time. Continued use of the app after amendments constitutes acceptance of the revised terms.',
    zh: 'Dr. Avive Group Limited 保留隨時修訂本條款的權利。在修訂後繼續使用本應用程式即表示接受修訂後的條款。',
  },
];

const ClauseCard = React.memo(({ clause }: { clause: Clause }) => {
  return (
    <View style={styles.clauseCard}>
      <View style={styles.clauseHeader}>
        <View style={styles.numberBadge}>
          <ScaledText size={13} weight="bold" color="#FFFFFF">
            {String(clause.number)}
          </ScaledText>
        </View>
        <View style={styles.clauseTitleContainer}>
          <ScaledText size={15} weight="600" color={Colors.textPrimary}>
            {clause.titleEn}
          </ScaledText>
          <ScaledText size={14} weight="600" color={Colors.textSecondary}>
            {clause.titleZh}
          </ScaledText>
        </View>
      </View>
      <View style={styles.clauseBody}>
        <ScaledText size={14} color={Colors.textPrimary} style={styles.clauseTextEn}>
          {clause.en}
        </ScaledText>
        <ScaledText size={13} color={Colors.textSecondary} style={styles.clauseTextZh}>
          {clause.zh}
        </ScaledText>
      </View>
    </View>
  );
});

export default function ConsentScreen() {
  const { setConsentAccepted, language, patientId, termsAccepted } = useApp();
  const router = useRouter();
  const [agreed, setAgreed] = useState<boolean>(false);
  const checkboxScale = useRef(new Animated.Value(1)).current;

  const toggleCheckbox = useCallback(() => {
    Animated.sequence([
      Animated.timing(checkboxScale, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(checkboxScale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    setAgreed(prev => !prev);
  }, [checkboxScale]);

  const handleAccept = useCallback(async () => {
    await setConsentAccepted();
    if (!language) {
      router.replace('/language');
    } else if (!termsAccepted) {
      router.replace('/terms');
    } else if (!patientId) {
      router.replace('/code-entry');
    } else {
      router.replace('/(tabs)/home');
    }
  }, [setConsentAccepted, language, termsAccepted, patientId, router]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerSection}>
          <View style={styles.iconRow}>
            <View style={styles.iconCircle}>
              <FileText size={24} color="#FFFFFF" />
            </View>
          </View>
          <ScaledText size={20} weight="bold" color={Colors.textPrimary} style={styles.title}>
            {'Terms of Use & Consent'}
          </ScaledText>
          <ScaledText size={17} weight="600" color={Colors.textSecondary} style={styles.titleZh}>
            {'使用條款及同意聲明'}
          </ScaledText>
          <View style={styles.subtitleRow}>
            <ShieldCheck size={14} color={Colors.primary} />
            <ScaledText size={13} color={Colors.textSecondary} style={styles.subtitleText}>
              {'NanoHab 醫家動 — Dr. Avive Group Limited'}
            </ScaledText>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
          testID="consent-scroll"
        >
          {CLAUSES.map(clause => (
            <ClauseCard key={clause.number} clause={clause} />
          ))}

          <View style={styles.checkboxSection}>
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={toggleCheckbox}
              activeOpacity={0.7}
              testID="consent-checkbox"
            >
              <Animated.View style={{ transform: [{ scale: checkboxScale }] }}>
                <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                  {agreed && <Check size={16} color="#FFFFFF" strokeWidth={3} />}
                </View>
              </Animated.View>
              <View style={styles.checkboxTextContainer}>
                <ScaledText size={13} weight="500" color={Colors.textPrimary} style={styles.checkboxText}>
                  {'I have read, understood, and agree to the above Terms of Use & Consent.'}
                </ScaledText>
                <ScaledText size={12} weight="500" color={Colors.textSecondary} style={styles.checkboxTextZh}>
                  {'本人已閱讀、理解並同意上述使用條款及同意聲明。'}
                </ScaledText>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.acceptButton, !agreed && styles.acceptButtonDisabled]}
            onPress={handleAccept}
            disabled={!agreed}
            activeOpacity={0.8}
            testID="consent-accept-button"
          >
            <ScaledText size={17} weight="600" color={agreed ? '#FFFFFF' : Colors.disabled}>
              {'Accept & Continue 接受並繼續'}
            </ScaledText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F5F4F0',
  },
  safeArea: {
    flex: 1,
  },
  headerSection: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 14,
    alignItems: 'center',
  },
  iconRow: {
    marginBottom: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
  },
  titleZh: {
    textAlign: 'center',
    marginTop: 2,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: Colors.primaryLight,
    borderRadius: 20,
  },
  subtitleText: {
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  clauseCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EEEEE8',
    overflow: 'hidden',
  },
  clauseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 10,
  },
  numberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clauseTitleContainer: {
    flex: 1,
    gap: 1,
  },
  clauseBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  clauseTextEn: {
    lineHeight: 21,
  },
  clauseTextZh: {
    lineHeight: 20,
    marginTop: 8,
  },
  checkboxSection: {
    marginTop: 6,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEEEE8',
    padding: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.disabled,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxText: {
    lineHeight: 19,
  },
  checkboxTextZh: {
    lineHeight: 18,
    marginTop: 4,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  acceptButton: {
    backgroundColor: '#E8880A',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#E8880A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptButtonDisabled: {
    backgroundColor: '#E0DFDA',
    shadowOpacity: 0,
    elevation: 0,
  },
});
