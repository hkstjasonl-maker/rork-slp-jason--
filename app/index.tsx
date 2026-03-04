import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Image, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { ScaledText } from '@/components/ScaledText';
import { JASON_PHOTO } from '@/constants/images';

export default function IndexScreen() {
  const { isReady, language, termsAccepted, patientId } = useApp();
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

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
    }, 1200);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, language, termsAccepted, patientId]);

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
          SLP Jason Lai
        </ScaledText>
        <ScaledText size={14} color={Colors.textSecondary} style={styles.subtitle}>
          Speech-Language Pathologist
        </ScaledText>
        <ActivityIndicator size="small" color={Colors.primary} style={styles.loader} />
      </Animated.View>
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
});
