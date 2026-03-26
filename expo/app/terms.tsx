import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import Colors from '@/constants/colors';
import { ShieldCheck } from 'lucide-react-native';

export default function TermsScreen() {
  const { t, setTermsAccepted, patientId } = useApp();
  const router = useRouter();
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
    if (isAtBottom && !scrolledToEnd) {
      setScrolledToEnd(true);
    }
  }, [scrolledToEnd]);

  const handleAgree = async () => {
    await setTermsAccepted();
    if (!patientId) {
      router.replace('/code-entry');
    } else {
      router.replace('/(tabs)/home');
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <ShieldCheck size={28} color={Colors.primary} />
          <ScaledText size={22} weight="bold" color={Colors.textPrimary} style={styles.headerTitle}>
            {t('termsTitle')}
          </ScaledText>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={100}
          showsVerticalScrollIndicator
        >
          <ScaledText size={15} color={Colors.textPrimary} style={styles.termsText}>
            {t('termsContent')}
          </ScaledText>
        </ScrollView>

        <View style={styles.footer}>
          {!scrolledToEnd && (
            <ScaledText size={13} color={Colors.textSecondary} style={styles.scrollHint}>
              {t('scrollToAgree')}
            </ScaledText>
          )}
          <TouchableOpacity
            style={[
              styles.agreeButton,
              !scrolledToEnd && styles.agreeButtonDisabled,
            ]}
            onPress={handleAgree}
            disabled={!scrolledToEnd}
            activeOpacity={0.8}
            testID="agree-button"
          >
            <ScaledText
              size={18}
              weight="600"
              color={scrolledToEnd ? Colors.white : Colors.disabled}
            >
              {t('iAgree')}
            </ScaledText>
          </TouchableOpacity>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 10,
  },
  headerTitle: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    marginHorizontal: 20,
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scrollContent: {
    padding: 20,
  },
  termsText: {
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    alignItems: 'center',
  },
  scrollHint: {
    marginBottom: 10,
  },
  agreeButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
  },
  agreeButtonDisabled: {
    backgroundColor: Colors.border,
  },
});
