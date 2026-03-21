import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, Platform } from 'react-native';
import { WifiOff, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';

export function NetworkErrorBanner() {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const translateY = useRef(new Animated.Value(-80)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkConnection = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      await fetch('https://www.google.com/generate_204', {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      setIsOffline(false);
      setDismissed(false);
    } catch {
      setIsOffline(true);
    }
  };

  useEffect(() => {
    checkConnection();
    intervalRef.current = setInterval(checkConnection, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const visible = isOffline && !dismissed;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : -80,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (!isOffline && !visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { paddingTop: insets.top + 6, transform: [{ translateY }] },
      ]}
    >
      <WifiOff size={16} color="#fff" style={styles.icon} />
      <Text style={styles.text}>{t('noInternetConnection')}</Text>
      <TouchableOpacity
        onPress={() => setDismissed(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.closeBtn}
      >
        <X size={16} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#D32F2F',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  closeBtn: {
    position: 'absolute' as const,
    right: 16,
    bottom: 8,
  },
});
