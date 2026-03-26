import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScaledText } from '@/components/ScaledText';
import { log } from '@/lib/logger';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function SplashAdScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    imageUrl: string;
    linkUrl?: string;
    duration?: string;
    nextRoute: string;
  }>();

  const [countdown, setCountdown] = useState<number>(
    parseInt(params.duration || '5', 10)
  );
  const [_imageLoaded, setImageLoaded] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const navigateNext = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const route = params.nextRoute || '/(tabs)/home';
    router.replace(route as any);
  }, [router, params.nextRoute]);

  const shouldNavigateRef = useRef(false);

  useEffect(() => {
    if (!params.imageUrl) {
      log('[SplashAd] No image URL, skipping');
      const t = setTimeout(() => navigateNext(), 0);
      return () => clearTimeout(t);
    }

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          shouldNavigateRef.current = true;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [params.imageUrl, fadeAnim, navigateNext]);

  useEffect(() => {
    if (countdown === 0 && shouldNavigateRef.current) {
      shouldNavigateRef.current = false;
      navigateNext();
    }
  }, [countdown, navigateNext]);

  const handleImagePress = useCallback(() => {
    if (params.linkUrl) {
      if (Platform.OS === 'web') {
        window.open(params.linkUrl, '_blank');
      } else {
        void Linking.openURL(params.linkUrl);
      }
    }
  }, [params.linkUrl]);

  const handleSkip = useCallback(() => {
    navigateNext();
  }, [navigateNext]);

  if (!params.imageUrl) return null;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.imageContainer, { opacity: fadeAnim }]}>
        <TouchableOpacity
          activeOpacity={params.linkUrl ? 0.8 : 1}
          onPress={handleImagePress}
          style={styles.imageTouchable}
        >
          <Image
            source={{ uri: params.imageUrl }}
            style={styles.image}
            resizeMode="contain"
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              log('[SplashAd] Image load error:', e.nativeEvent.error);
              navigateNext();
            }}
          />
        </TouchableOpacity>
      </Animated.View>

      <View style={styles.skipContainer}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          activeOpacity={0.7}
          testID="splash-ad-skip"
        >
          <ScaledText size={14} weight="600" color="rgba(255,255,255,0.9)">
            {countdown > 0 ? `Skip ${countdown}s 跳過` : 'Skip 跳過'}
          </ScaledText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageTouchable: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.85,
  },
  skipContainer: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
  },
  skipButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
});
