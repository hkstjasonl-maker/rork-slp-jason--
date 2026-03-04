import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import Colors from '@/constants/colors';
import { Language } from '@/types';
import { Globe } from 'lucide-react-native';

const languageOptions: { key: Language; label: string; sublabel: string }[] = [
  { key: 'zh_hant', label: '繁體中文', sublabel: 'Traditional Chinese' },
  { key: 'zh_hans', label: '简体中文', sublabel: 'Simplified Chinese' },
  { key: 'en', label: 'English', sublabel: 'English' },
];

export default function LanguageScreen() {
  const { setLanguage, termsAccepted, patientId } = useApp();
  const router = useRouter();

  const handleSelect = async (lang: Language) => {
    await setLanguage(lang);
    if (!termsAccepted) {
      router.replace('/terms');
    } else if (!patientId) {
      router.replace('/code-entry');
    } else {
      router.replace('/(tabs)/home');
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Globe size={36} color={Colors.white} />
            </View>
            <ScaledText size={28} weight="bold" color={Colors.textPrimary} style={styles.title}>
              SLP Jason Lai
            </ScaledText>
            <ScaledText size={14} color={Colors.textSecondary} style={styles.subtitle}>
              言語治療師 Jason · Speech Therapist
            </ScaledText>
          </View>

          <View style={styles.divider} />

          <ScaledText size={16} color={Colors.textSecondary} style={styles.selectLabel}>
            Select your language / 選擇語言
          </ScaledText>

          <View style={styles.options}>
            {languageOptions.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={styles.optionButton}
                onPress={() => handleSelect(option.key)}
                activeOpacity={0.7}
                testID={`lang-${option.key}`}
              >
                <ScaledText size={20} weight="600" color={Colors.textPrimary}>
                  {option.label}
                </ScaledText>
                <ScaledText size={13} color={Colors.textSecondary} style={styles.optionSub}>
                  {option.sublabel}
                </ScaledText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <CopyrightFooter />
      </SafeAreaView>
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
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 28,
    marginHorizontal: 40,
  },
  selectLabel: {
    textAlign: 'center',
    marginBottom: 20,
  },
  options: {
    gap: 12,
  },
  optionButton: {
    backgroundColor: Colors.card,
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  optionSub: {
    marginTop: 2,
  },
});
