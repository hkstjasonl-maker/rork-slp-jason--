import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  Image,
  GestureResponderEvent,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';

const CARD_WIDTH = 280;
const CARD_HEIGHT = 180;
const COLS = 8;
const ROWS = 6;
const TOTAL_CELLS = COLS * ROWS;
const REVEAL_THRESHOLD = 0.60;

interface ScratchCardProps {
  prizeImageUrl: string | null;
  prizeText: string;
  prizeCode: string | null;
  onRevealed: () => void;
  scratchColor?: string;
}

interface Sparkle {
  id: number;
  x: number;
  y: number;
  scale: Animated.Value;
  opacity: Animated.Value;
  rotation: Animated.Value;
}

const MemoCell = React.memo(function MemoCell({
  cellW,
  cellH,
  isOdd,
  baseColor,
  altColor,
  dotColor,
  showDot,
  fadeAnim,
}: {
  cellW: number;
  cellH: number;
  isOdd: boolean;
  baseColor: string;
  altColor: string;
  dotColor: string;
  showDot: boolean;
  fadeAnim: Animated.Value;
}) {
  return (
    <Animated.View
      style={{
        width: cellW,
        height: cellH,
        backgroundColor: isOdd ? baseColor : altColor,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        opacity: fadeAnim,
      }}
    >
      {showDot && (
        <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: dotColor, opacity: 0.4 }} />
      )}
    </Animated.View>
  );
});

export default function ScratchCard({
  prizeImageUrl,
  prizeText,
  prizeCode,
  onRevealed,
  scratchColor = '#C0C0C0',
}: ScratchCardProps) {
  const [revealed, setRevealed] = useState<boolean>(false);
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const cellsRef = useRef<boolean[]>(new Array(TOTAL_CELLS).fill(false));
  const scratchCountRef = useRef<number>(0);
  const revealedRef = useRef<boolean>(false);
  const [layout, setLayout] = useState({ width: CARD_WIDTH, height: CARD_HEIGHT });
  const coatingOpacity = useRef(new Animated.Value(1)).current;
  const prizeScale = useRef(new Animated.Value(0.5)).current;
  const prizeOpacity = useRef(new Animated.Value(0)).current;
  const lastHapticTime = useRef<number>(0);

  const cellFadeAnims = useRef<Animated.Value[]>(
    Array.from({ length: TOTAL_CELLS }, () => new Animated.Value(1))
  ).current;

  const spawnSparkles = useCallback(() => {
    const newSparkles: Sparkle[] = [];
    for (let i = 0; i < 12; i++) {
      const s: Sparkle = {
        id: i,
        x: Math.random() * CARD_WIDTH,
        y: Math.random() * CARD_HEIGHT,
        scale: new Animated.Value(0),
        opacity: new Animated.Value(1),
        rotation: new Animated.Value(0),
      };
      newSparkles.push(s);

      const delay = Math.random() * 400;
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.spring(s.scale, {
            toValue: 1 + Math.random() * 0.6,
            friction: 3,
            tension: 100,
            useNativeDriver: true,
          }),
          Animated.timing(s.rotation, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(s.opacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }
    setSparkles(newSparkles);
  }, []);

  const triggerReveal = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    const unrevealed: number[] = [];
    cellsRef.current.forEach((scratched, idx) => {
      if (!scratched) unrevealed.push(idx);
    });

    const batchAnims = unrevealed.map((idx) => {
      cellsRef.current[idx] = true;
      return Animated.timing(cellFadeAnims[idx], {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      });
    });
    Animated.stagger(5, batchAnims).start();

    Animated.timing(coatingOpacity, {
      toValue: 0,
      duration: 400,
      delay: unrevealed.length * 3,
      useNativeDriver: true,
    }).start(() => {
      setRevealed(true);
    });

    Animated.parallel([
      Animated.spring(prizeScale, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(prizeOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    spawnSparkles();
    onRevealed();
  }, [onRevealed, coatingOpacity, prizeScale, prizeOpacity, spawnSparkles, cellFadeAnims]);

  const handleTouch = useCallback((evt: GestureResponderEvent) => {
    if (revealedRef.current) return;

    const touchX = evt.nativeEvent.locationX;
    const touchY = evt.nativeEvent.locationY;

    const cellW = layout.width / COLS;
    const cellH = layout.height / ROWS;
    const col = Math.floor(touchX / cellW);
    const row = Math.floor(touchY / cellH);

    const cells = cellsRef.current;
    let newlyScratched = 0;

    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
          const idx = r * COLS + c;
          if (!cells[idx]) {
            cells[idx] = true;
            newlyScratched++;
            Animated.timing(cellFadeAnims[idx], {
              toValue: 0,
              duration: 150,
              useNativeDriver: true,
            }).start();
          }
        }
      }
    }

    if (newlyScratched > 0) {
      scratchCountRef.current += newlyScratched;

      const now = Date.now();
      if (Platform.OS !== 'web' && now - lastHapticTime.current > 100) {
        lastHapticTime.current = now;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      if (scratchCountRef.current / TOTAL_CELLS >= REVEAL_THRESHOLD && !revealedRef.current) {
        revealedRef.current = true;
        triggerReveal();
      }
    }
  }, [layout, cellFadeAnims, triggerReveal]);

  const handleTouchRef = useRef(handleTouch);
  handleTouchRef.current = handleTouch;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        handleTouchRef.current(evt);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        handleTouchRef.current(evt);
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const darkerScratch = adjustColor(scratchColor, -15);
  const dotColor = adjustColor(scratchColor, 20);
  const cellW = layout.width / COLS;
  const cellH = layout.height / ROWS;

  return (
    <View
      style={styles.cardOuter}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setLayout({ width, height });
      }}
    >
      <View style={styles.card}>
        <Animated.View
          style={[
            styles.prizeLayer,
            { opacity: prizeOpacity, transform: [{ scale: prizeScale }] },
          ]}
        >
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
        </Animated.View>

        {!revealed && (
          <Animated.View
            style={[styles.coatingLayer, { opacity: coatingOpacity }]}
            {...panResponder.panHandlers}
          >
            {Array.from({ length: ROWS }).map((_, row) => (
              <View key={row} style={styles.cellRow}>
                {Array.from({ length: COLS }).map((_, col) => {
                  const idx = row * COLS + col;
                  const isOdd = (row + col) % 2 === 0;
                  const showDot = (row + col) % 3 === 0;
                  return (
                    <MemoCell
                      key={col}
                      cellW={cellW}
                      cellH={cellH}
                      isOdd={isOdd}
                      baseColor={scratchColor}
                      altColor={darkerScratch}
                      dotColor={dotColor}
                      showDot={showDot}
                      fadeAnim={cellFadeAnims[idx]}
                    />
                  );
                })}
              </View>
            ))}
            <View style={styles.scratchTextContainer} pointerEvents="none">
              <Text style={styles.scratchText}>✨ Scratch here!</Text>
              <Text style={styles.scratchTextCn}>刮開看看！</Text>
            </View>
          </Animated.View>
        )}

        {sparkles.map((s) => (
          <Animated.View
            key={s.id}
            pointerEvents="none"
            style={[
              styles.sparkle,
              {
                left: s.x - 10,
                top: s.y - 10,
                opacity: s.opacity,
                transform: [
                  { scale: s.scale },
                  {
                    rotate: s.rotation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '180deg'],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.sparkleEmoji}>✦</Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

function adjustColor(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const styles = StyleSheet.create({
  cardOuter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  prizeLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#FFFDF5',
  },
  prizeImage: {
    width: 80,
    height: 60,
    marginBottom: 8,
  },
  prizeText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#2D3436',
    textAlign: 'center' as const,
    marginBottom: 6,
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
  coatingLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cellRow: {
    flexDirection: 'row' as const,
  },
  scratchTextContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  scratchText: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#666',
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  scratchTextCn: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#777',
    marginTop: 4,
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  sparkle: {
    position: 'absolute' as const,
    width: 20,
    height: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sparkleEmoji: {
    fontSize: 18,
    color: '#FFD700',
  },
});
