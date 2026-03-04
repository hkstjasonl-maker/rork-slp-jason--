import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  AppState,
  AppStateStatus,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { ScaledText } from '@/components/ScaledText';
import { log } from '@/lib/logger';

interface ScreenProtectionProps {
  children: React.ReactNode;
}

export function ScreenProtection({ children }: ScreenProtectionProps) {
  const { t } = useApp();
  const [isBackground, setIsBackground] = useState<boolean>(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let screenshotSub: { remove: () => void } | undefined;

    const setup = async () => {
      try {
        const ScreenCapture = await import('expo-screen-capture');
        await ScreenCapture.preventScreenCaptureAsync();

        screenshotSub = ScreenCapture.addScreenshotListener(() => {
          Alert.alert(
            t('screenshotDetectedTitle'),
            t('screenshotDetectedMessage'),
            [{ text: t('understood'), style: 'destructive' }],
          );
        });
      } catch (e) {
        log('[Security] Setup error:', e);
      }
    };

    setup();

    return () => {
      screenshotSub?.remove();
      const cleanup = async () => {
        try {
          const ScreenCapture = await import('expo-screen-capture');
          await ScreenCapture.allowScreenCaptureAsync();
        } catch (e) {
          log('[Security] Cleanup error:', e);
        }
      };
      cleanup();
    };
  }, [t]);

  const showCover = useCallback(() => {
    setIsBackground(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 50,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const hideCover = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setIsBackground(false);
    });
  }, [fadeAnim]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        hideCover();
      } else if (nextAppState === 'inactive' || nextAppState === 'background') {
        showCover();
      }
      appStateRef.current = nextAppState;
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [showCover, hideCover]);

  return (
    <View style={styles.container}>
      {children}
      {isBackground && Platform.OS !== 'web' && (
        <Animated.View
          style={[styles.privacyCover, { opacity: fadeAnim }]}
          pointerEvents="none"
        >
          <View style={styles.privacyCoverInner}>
            <ScaledText size={18} weight="bold" color={Colors.white} style={styles.privacyText}>
              {t('contentProtected')}
            </ScaledText>
            <ScaledText size={13} color="rgba(255,255,255,0.7)" style={styles.privacySubtext}>
              © Speech-Language Pathologist Jason Lai
            </ScaledText>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  privacyCover: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: '#3A7A89',
  },
  privacyCoverInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  privacyText: {
    textAlign: 'center',
    marginBottom: 8,
  },
  privacySubtext: {
    textAlign: 'center',
  },
});
