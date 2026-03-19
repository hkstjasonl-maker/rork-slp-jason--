import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Image,
  Text,
  Platform,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { playBalloonPop } from '@/utils/soundEffects';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCENE_WIDTH = Math.min(SCREEN_WIDTH - 48, 310);
const SCENE_HEIGHT = 320;

const BALLOON_COLORS = [
  '#FF4D6D',
  '#4CC9F0',
  '#7209B7',
  '#F72585',
  '#4361EE',
  '#3A0CA3',
  '#FFD166',
];

interface BalloonData {
  id: number;
  x: number;
  y: number;
  color: string;
  bobSpeed: number;
  bobAmount: number;
  swayAmount: number;
  swaySpeed: number;
  phase: number;
}

interface ConfettiDot {
  id: number;
  color: string;
  angle: number;
  distance: Animated.Value;
  opacity: Animated.Value;
  size: number;
}

interface BalloonPopDrawProps {
  prizeImageUrl: string | null;
  prizeText: string;
  prizeCode: string | null;
  onRevealed: () => void;
}

function generateBalloons(count: number): BalloonData[] {
  const balloons: BalloonData[] = [];
  const padding = 50;
  const usableWidth = SCENE_WIDTH - padding * 2;
  const cols = Math.min(count, 4);
  const rows = Math.ceil(count / cols);

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const xSpacing = usableWidth / (cols + 1);
    const ySpacing = (SCENE_HEIGHT - 140) / (rows + 1);

    balloons.push({
      id: i,
      x: padding + xSpacing * (col + 1) + (Math.random() - 0.5) * 20,
      y: 40 + ySpacing * (row + 1) + (Math.random() - 0.5) * 15,
      color: BALLOON_COLORS[i % BALLOON_COLORS.length],
      bobSpeed: 1200 + Math.random() * 800,
      bobAmount: 6 + Math.random() * 6,
      swayAmount: 3 + Math.random() * 4,
      swaySpeed: 1800 + Math.random() * 1200,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return balloons;
}

const Balloon = React.memo(function Balloon({
  balloon,
  onPop,
  disabled,
}: {
  balloon: BalloonData;
  onPop: (id: number) => void;
  disabled: boolean;
}) {
  const bobAnim = useRef(new Animated.Value(0)).current;
  const swayAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 6,
      tension: 40,
      delay: balloon.id * 80,
      useNativeDriver: true,
    }).start();

    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bobAnim, {
          toValue: 1,
          duration: balloon.bobSpeed,
          useNativeDriver: true,
        }),
        Animated.timing(bobAnim, {
          toValue: 0,
          duration: balloon.bobSpeed,
          useNativeDriver: true,
        }),
      ])
    );
    bobLoop.start();

    const swayLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(swayAnim, {
          toValue: 1,
          duration: balloon.swaySpeed,
          useNativeDriver: true,
        }),
        Animated.timing(swayAnim, {
          toValue: 0,
          duration: balloon.swaySpeed,
          useNativeDriver: true,
        }),
      ])
    );
    swayLoop.start();

    return () => {
      bobLoop.stop();
      swayLoop.stop();
    };
  }, [bobAnim, swayAnim, scaleAnim, balloon]);

  const translateY = bobAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -balloon.bobAmount],
  });

  const translateX = swayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-balloon.swayAmount, balloon.swayAmount],
  });

  return (
    <Animated.View
      style={[
        styles.balloonWrapper,
        {
          left: balloon.x - 35,
          top: balloon.y - 45,
          transform: [
            { translateY },
            { translateX },
            { scale: scaleAnim },
          ],
        },
      ]}
    >
      <TouchableOpacity
        onPress={() => onPop(balloon.id)}
        disabled={disabled}
        activeOpacity={0.8}
        style={styles.balloonTouch}
      >
        <View style={[styles.balloonBody, { backgroundColor: balloon.color }]}>
          <View style={[styles.balloonShine, { backgroundColor: balloon.color }]} />
          <View style={styles.balloonHighlight} />
        </View>
        <View style={[styles.balloonKnot, { borderTopColor: balloon.color }]} />
        <View style={[styles.balloonString, { backgroundColor: balloon.color + '60' }]} />
      </TouchableOpacity>
    </Animated.View>
  );
});

export default function BalloonPopDraw({
  prizeImageUrl,
  prizeText,
  prizeCode,
  onRevealed,
}: BalloonPopDrawProps) {
  const balloonCount = useMemo(() => 5 + Math.floor(Math.random() * 3), []);
  const balloons = useMemo(() => generateBalloons(balloonCount), [balloonCount]);
  const [poppedId, setPoppedId] = useState<number | null>(null);
  const [showPrize, setShowPrize] = useState<boolean>(false);
  const revealedRef = useRef<boolean>(false);

  const popScaleAnim = useRef(new Animated.Value(1)).current;
  const popOpacityAnim = useRef(new Animated.Value(1)).current;
  const othersOpacityAnim = useRef(new Animated.Value(1)).current;
  const othersTranslateAnim = useRef(new Animated.Value(0)).current;
  const prizeScaleAnim = useRef(new Animated.Value(0.3)).current;
  const prizeOpacityAnim = useRef(new Animated.Value(0)).current;

  const [confettiDots, setConfettiDots] = useState<ConfettiDot[]>([]);

  const spawnConfetti = useCallback((color: string) => {
    const dots: ConfettiDot[] = [];
    const count = 10;
    for (let i = 0; i < count; i++) {
      dots.push({
        id: i,
        color: i % 2 === 0 ? color : BALLOON_COLORS[(i * 3) % BALLOON_COLORS.length],
        angle: (i / count) * Math.PI * 2,
        distance: new Animated.Value(0),
        opacity: new Animated.Value(1),
        size: 6 + Math.random() * 6,
      });
    }
    setConfettiDots(dots);

    dots.forEach((dot) => {
      Animated.parallel([
        Animated.timing(dot.distance, {
          toValue: 60 + Math.random() * 40,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(dot.opacity, {
          toValue: 0,
          duration: 350,
          delay: 100,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, []);

  const handlePop = useCallback((id: number) => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setPoppedId(id);

    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    void playBalloonPop();

    const poppedBalloon = balloons.find(b => b.id === id);
    if (poppedBalloon) {
      spawnConfetti(poppedBalloon.color);
    }

    Animated.sequence([
      Animated.timing(popScaleAnim, {
        toValue: 1.3,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(popScaleAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(popOpacityAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    Animated.parallel([
      Animated.timing(othersTranslateAnim, {
        toValue: -60,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(othersOpacityAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      setShowPrize(true);
      Animated.parallel([
        Animated.spring(prizeScaleAnim, {
          toValue: 1,
          friction: 5,
          tension: 50,
          useNativeDriver: true,
        }),
        Animated.timing(prizeOpacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      onRevealed();
    }, 500);
  }, [
    balloons,
    spawnConfetti,
    popScaleAnim,
    popOpacityAnim,
    othersOpacityAnim,
    othersTranslateAnim,
    prizeScaleAnim,
    prizeOpacityAnim,
    onRevealed,
  ]);

  const poppedBalloon = poppedId !== null ? balloons.find(b => b.id === poppedId) : null;

  return (
    <View style={styles.scene}>
      <View style={styles.bgGradientTop} />
      <View style={styles.bgGradientBottom} />

      {balloons.map((b) => {
        if (b.id === poppedId) {
          return (
            <Animated.View
              key={b.id}
              style={[
                styles.balloonWrapper,
                {
                  left: b.x - 35,
                  top: b.y - 45,
                  transform: [{ scale: popScaleAnim }],
                  opacity: popOpacityAnim,
                },
              ]}
              pointerEvents="none"
            >
              <View style={[styles.balloonBody, { backgroundColor: b.color }]}>
                <View style={styles.balloonHighlight} />
              </View>
            </Animated.View>
          );
        }

        return (
          <Animated.View
            key={b.id}
            style={{
              opacity: poppedId !== null ? othersOpacityAnim : 1,
              transform: poppedId !== null
                ? [{ translateY: othersTranslateAnim }]
                : [],
            }}
          >
            <Balloon
              balloon={b}
              onPop={handlePop}
              disabled={poppedId !== null}
            />
          </Animated.View>
        );
      })}

      {poppedBalloon && confettiDots.length > 0 && (
        <View
          style={[
            styles.confettiContainer,
            { left: poppedBalloon.x, top: poppedBalloon.y },
          ]}
          pointerEvents="none"
        >
          {confettiDots.map((dot) => {
            const tx = dot.distance.interpolate({
              inputRange: [0, 100],
              outputRange: [0, Math.cos(dot.angle) * 100],
            });
            const ty = dot.distance.interpolate({
              inputRange: [0, 100],
              outputRange: [0, Math.sin(dot.angle) * 100],
            });
            return (
              <Animated.View
                key={dot.id}
                style={[
                  styles.confettiDot,
                  {
                    width: dot.size,
                    height: dot.size,
                    borderRadius: dot.size / 2,
                    backgroundColor: dot.color,
                    opacity: dot.opacity,
                    transform: [
                      { translateX: tx },
                      { translateY: ty },
                    ],
                  },
                ]}
              />
            );
          })}
        </View>
      )}

      {showPrize && (
        <Animated.View
          style={[
            styles.prizeOverlay,
            {
              opacity: prizeOpacityAnim,
              transform: [{ scale: prizeScaleAnim }],
            },
          ]}
        >
          <View style={styles.prizeCard}>
            {prizeImageUrl ? (
              <Image
                source={{ uri: prizeImageUrl }}
                style={styles.prizeImage}
                resizeMode="contain"
              />
            ) : null}
            <Text style={styles.prizeText}>{prizeText}</Text>
            {prizeCode ? (
              <View style={styles.codeContainer}>
                <Text style={styles.codeLabel}>Code</Text>
                <Text style={styles.codeText}>{prizeCode}</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scene: {
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative' as const,
  },
  bgGradientTop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: SCENE_HEIGHT * 0.5,
    backgroundColor: '#E8F4FD',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  bgGradientBottom: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: SCENE_HEIGHT * 0.55,
    backgroundColor: '#F0E6FF',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  balloonWrapper: {
    position: 'absolute' as const,
    width: 70,
    height: 140,
    alignItems: 'center' as const,
  },
  balloonTouch: {
    alignItems: 'center' as const,
  },
  balloonBody: {
    width: 70,
    height: 90,
    borderRadius: 35,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },
  balloonShine: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  balloonHighlight: {
    position: 'absolute' as const,
    top: 12,
    left: 14,
    width: 18,
    height: 24,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.35)',
    transform: [{ rotate: '-20deg' }],
  },
  balloonKnot: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  balloonString: {
    width: 1,
    height: 40,
    marginTop: 0,
  },
  confettiContainer: {
    position: 'absolute' as const,
    width: 0,
    height: 0,
  },
  confettiDot: {
    position: 'absolute' as const,
  },
  prizeOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
  },
  prizeCard: {
    alignItems: 'center' as const,
    padding: 20,
  },
  prizeImage: {
    width: 90,
    height: 70,
    marginBottom: 10,
  },
  prizeText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#2D3436',
    textAlign: 'center' as const,
    marginBottom: 8,
  },
  codeContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F5A623',
    borderStyle: 'dashed' as const,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#F5A623',
    marginRight: 6,
    textTransform: 'uppercase' as const,
  },
  codeText: {
    fontSize: 15,
    fontWeight: '800' as const,
    color: '#E67E22',
    letterSpacing: 1.5,
  },
});
