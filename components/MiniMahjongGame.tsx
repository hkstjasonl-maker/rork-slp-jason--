import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import {
  generateHand,
  checkResult,
  getTileImageUrl,
  getBackImageUrl,
  GameLevel,
  TileId,
  GameResult,
  getSuit,
  getNumber,
} from '@/utils/mahjongGame';

interface MiniMahjongGameProps {
  visible: boolean;
  level: GameLevel;
  onClose: (starsEarned: number) => void;
  patientId: string;
}

type Phase = 'rules' | 'game' | 'reveal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const HAND_TILE_W = 50;
const HAND_TILE_H = 70;
const CHOICE_TILE_W = 60;
const CHOICE_TILE_H = 84;

const TABLE_GREEN = '#1a5c2a';
const TABLE_GREEN_LIGHT = '#2a7a3a';
const FELT_DARK = '#0f3d1a';
const GOLD = '#FFD700';


function sortHandTiles(tiles: TileId[]): TileId[] {
  const suitOrder: Record<string, number> = { dot: 0, bam: 1, wan: 2, wind: 3, dragon: 4 };
  return [...tiles].sort((a, b) => {
    const sa = suitOrder[getSuit(a)] ?? 5;
    const sb = suitOrder[getSuit(b)] ?? 5;
    if (sa !== sb) return sa - sb;
    const na = getNumber(a) ?? 0;
    const nb = getNumber(b) ?? 0;
    return na - nb;
  });
}

interface ScatteredTile {
  x: number;
  y: number;
  rotation: number;
}

function generateScatteredTiles(count: number): ScatteredTile[] {
  const tiles: ScatteredTile[] = [];
  for (let i = 0; i < count; i++) {
    tiles.push({
      x: Math.random() * (SCREEN_WIDTH - 40),
      y: Math.random() * 120,
      rotation: (Math.random() - 0.5) * 60,
    });
  }
  return tiles;
}

const MiniMahjongGame: React.FC<MiniMahjongGameProps> = ({
  visible,
  level,
  onClose,
  patientId,
}) => {
  const { t, language } = useApp();
  const [phase, setPhase] = useState<Phase>('rules');
  const [hand, setHand] = useState<TileId[]>([]);
  const [choices, setChoices] = useState<TileId[]>([]);
  const [winningIndex, setWinningIndex] = useState<number>(0);
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set());
  const [showResult, setShowResult] = useState<boolean>(false);
  const [starsAwarded, setStarsAwarded] = useState<number>(0);

  const scatteredTiles = useMemo(() => generateScatteredTiles(18), []);

  const choiceFlipAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  const pulseAnims = useRef([
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
  ]).current;

  const resultBounce = useRef(new Animated.Value(0)).current;
  const starsFloat = useRef(new Animated.Value(0)).current;
  const starsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setPhase('rules');
      setPickedIndex(null);
      setResult(null);
      setRevealedIndices(new Set());
      setShowResult(false);
      setStarsAwarded(0);
      choiceFlipAnims.forEach((a: Animated.Value) => a.setValue(0));
      pulseAnims.forEach((a: Animated.Value) => a.setValue(1));
      resultBounce.setValue(0);
      starsFloat.setValue(0);
      starsOpacity.setValue(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (phase !== 'game') return;
    const animations = pulseAnims.map((anim) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1.08,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const startGame = useCallback(() => {
    log('[MiniMahjongGame] Starting game, level:', level);
    const generated = generateHand(level);
    setHand(sortHandTiles(generated.hand));
    setChoices(generated.choices);
    setWinningIndex(generated.winningIndex);
    setPhase('game');
  }, [level]);

  const flipTile = useCallback(
    (index: number, delay: number = 0): Promise<void> => {
      return new Promise((resolve) => {
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(choiceFlipAnims[index], {
            toValue: 0.5,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(choiceFlipAnims[index], {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => resolve());
      });
    },
    [choiceFlipAnims]
  );

  const handlePickTile = useCallback(
    async (index: number) => {
      if (pickedIndex !== null) return;
      log('[MiniMahjongGame] Picked tile index:', index);

      setPickedIndex(index);
      setPhase('reveal');

      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      pulseAnims.forEach((a: Animated.Value) => a.stopAnimation());

      setRevealedIndices(new Set([index]));
      await flipTile(index);

      const otherIndices = [0, 1, 2].filter((i) => i !== index);
      for (const oi of otherIndices) {
        setRevealedIndices((prev) => new Set([...prev, oi]));
        await flipTile(oi, 200);
      }

      await new Promise<void>((r) => setTimeout(r, 600));

      const gameResult = checkResult(hand, choices[index], level);
      setResult(gameResult);
      log('[MiniMahjongGame] Result:', gameResult);

      const stars = gameResult.won ? 3 : 0;
      setStarsAwarded(stars);
      setShowResult(true);

      if (gameResult.won) {
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        Animated.spring(resultBounce, {
          toValue: 1,
          friction: 4,
          tension: 60,
          useNativeDriver: true,
        }).start();

        Animated.parallel([
          Animated.timing(starsOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(starsFloat, {
            toValue: -60,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]).start();
      } else {
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        Animated.timing(resultBounce, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      }

      void (async () => {
        try {
          await supabase.from('mahjong_game_log').insert({
            patient_id: patientId,
            level,
            won: gameResult.won,
            pattern: gameResult.pattern,
            stars_earned: stars,
            played_at: new Date().toISOString(),
          });
          log('[MiniMahjongGame] Game log saved');

          if (gameResult.won) {
            const { data: patientData } = await supabase
              .from('patients')
              .select('stars_total, stars_available')
              .eq('id', patientId)
              .single();

            if (patientData) {
              await supabase
                .from('patients')
                .update({
                  stars_total: (patientData.stars_total || 0) + 3,
                  stars_available: (patientData.stars_available || 0) + 3,
                })
                .eq('id', patientId);
              log('[MiniMahjongGame] Stars updated +3');
            }
          }
        } catch (e) {
          log('[MiniMahjongGame] Error logging game:', e);
        }
      })();
    },
    [pickedIndex, hand, choices, level, patientId, flipTile, pulseAnims, resultBounce, starsFloat, starsOpacity]
  );

  const handleClose = useCallback(() => {
    onClose(starsAwarded);
  }, [onClose, starsAwarded]);

  const getLevelLabel = useCallback((): string => {
    switch (level) {
      case 'basic':
        return language === 'en' ? 'Basic 基本' : t('mahjongBasic');
      case 'moderate':
        return language === 'en' ? 'Moderate 中等' : t('mahjongModerate');
      case 'difficult':
        return language === 'en' ? 'Difficult 困難' : t('mahjongDifficult');
      default:
        return '';
    }
  }, [level, language, t]);

  const getRulesText = useCallback((): string => {
    const lang = language || 'en';
    switch (level) {
      case 'basic':
        if (lang === 'zh_hant') return '你有13張牌。從3張暗牌中選1張。如果能跟手牌配對就贏！（碰/槓）';
        if (lang === 'zh_hans') return '你有13张牌。从3张暗牌中选1张。如果能跟手牌配对就赢！（碰/杠）';
        return 'You have 13 tiles. Pick 1 of 3 face-down tiles. Win if it matches a pair in your hand! (碰/槓)';
      case 'moderate':
        if (lang === 'zh_hant') return '你有13張牌。從3張暗牌中選1張。如果能組成順子就贏！（上）';
        if (lang === 'zh_hans') return '你有13张牌。从3张暗牌中选1张。如果能组成顺子就赢！（上）';
        return 'You have 13 tiles. Pick 1 of 3 face-down tiles. Win if it completes a sequence! (上)';
      case 'difficult':
        if (lang === 'zh_hant') return '你有13張牌。從3張暗牌中選1張。如果能食糊就贏！（食糊）';
        if (lang === 'zh_hans') return '你有13张牌。从3张暗牌中选1张。如果能胡就赢！（胡）';
        return 'You have 13 tiles. Pick 1 of 3 face-down tiles. Win if it completes your winning hand! (食糊)';
      default:
        return '';
    }
  }, [level, language]);

  const getEncouragementText = useCallback((): string => {
    const lang = language || 'en';
    if (lang === 'zh_hant') return '這次沒中！繼續加油！💪';
    if (lang === 'zh_hans') return '这次没中！继续加油！💪';
    return 'Not this time! Keep practicing! 💪';
  }, [language]);

  const getWouldHaveWonText = useCallback((): string => {
    const lang = language || 'en';
    if (lang === 'zh_hant') return '這張才是！';
    if (lang === 'zh_hans') return '这张才是！';
    return 'This one would have won!';
  }, [language]);

  const getBackText = useCallback((): string => {
    const lang = language || 'en';
    if (lang === 'zh_hant') return '返回練習';
    if (lang === 'zh_hans') return '返回练习';
    return 'Back to Exercise';
  }, [language]);

  const getPickText = useCallback((): string => {
    const lang = language || 'en';
    if (lang === 'zh_hant') return '選一張！';
    if (lang === 'zh_hans') return '选一张！';
    return 'Pick one!';
  }, [language]);

  const getStartText = useCallback((): string => {
    const lang = language || 'en';
    if (lang === 'zh_hant') return '開始';
    if (lang === 'zh_hans') return '开始';
    return 'Start';
  }, [language]);

  const isMatchingTile = useCallback(
    (tileId: TileId): boolean => {
      if (!result?.won || pickedIndex === null) return false;
      const picked = choices[pickedIndex];
      if (level === 'basic') {
        return tileId === picked;
      }
      if (level === 'moderate') {
        const pickedSuit = getSuit(picked);
        const pickedNum = getNumber(picked);
        const tileSuit = getSuit(tileId);
        const tileNum = getNumber(tileId);
        if (!pickedNum || !tileNum || tileSuit !== pickedSuit) return false;
        const diff = Math.abs(pickedNum - tileNum);
        return diff === 1 || diff === 2;
      }
      return false;
    },
    [result, pickedIndex, choices, level]
  );

  const renderRulesPhase = () => (
    <View style={styles.phaseContainer}>
      <View style={styles.levelBadge}>
        <Text style={styles.levelBadgeText}>{getLevelLabel()}</Text>
      </View>

      <View style={styles.rulesCard}>
        <Text style={styles.rulesEmoji}>🀄</Text>
        <Text style={styles.rulesTitle}>
          {language === 'en' ? 'Mini Mahjong' : t('miniMahjong')}
        </Text>
        <Text style={styles.rulesText}>{getRulesText()}</Text>
      </View>

      <TouchableOpacity
        style={styles.startButton}
        onPress={startGame}
        activeOpacity={0.8}
        testID="mahjong-start-button"
      >
        <Text style={styles.startButtonText}>{getStartText()}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderChoiceTile = (index: number) => {
    const _isRevealed = revealedIndices.has(index);
    const isWinner = index === winningIndex;
    const isPicked = index === pickedIndex;
    const showGoldenGlow = showResult && result?.won && isPicked;
    const showGreenGlow = showResult && !result?.won && isWinner;
    const showRedTint = showResult && !result?.won && isPicked;

    const flipInterpolate = choiceFlipAnims[index].interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [1, 0, 1],
    });

    const showFront = choiceFlipAnims[index].interpolate({
      inputRange: [0, 0.49, 0.5, 1],
      outputRange: [0, 0, 1, 1],
    });

    const showBack = choiceFlipAnims[index].interpolate({
      inputRange: [0, 0.49, 0.5, 1],
      outputRange: [1, 1, 0, 0],
    });

    return (
      <TouchableOpacity
        key={index}
        onPress={() => handlePickTile(index)}
        disabled={pickedIndex !== null}
        activeOpacity={0.7}
        testID={`mahjong-choice-${index}`}
      >
        <Animated.View
          style={[
            styles.choiceTileContainer,
            { transform: [{ scaleX: flipInterpolate }, { scale: pulseAnims[index] }] },
            showGoldenGlow && styles.goldenGlow,
            showGreenGlow && styles.greenGlow,
            showRedTint && styles.redTint,
          ]}
        >
          <Animated.View style={[styles.tileImageWrapper, { opacity: showBack }]}>
            <Image
              source={{ uri: getBackImageUrl() }}
              style={styles.choiceTileImage}
              resizeMode="contain"
            />
          </Animated.View>
          <Animated.View
            style={[styles.tileImageWrapper, styles.tileImageFront, { opacity: showFront }]}
          >
            <Image
              source={{ uri: getTileImageUrl(choices[index]) }}
              style={styles.choiceTileImage}
              resizeMode="contain"
            />
          </Animated.View>
        </Animated.View>
        {showGreenGlow && (
          <Text style={styles.wouldHaveWonLabel}>{getWouldHaveWonText()}</Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderGamePhase = () => (
    <View style={styles.phaseContainer}>
      <View style={styles.levelBadge}>
        <Text style={styles.levelBadgeText}>{getLevelLabel()}</Text>
      </View>

      <View style={styles.scatteredArea}>
        {scatteredTiles.map((tile, i) => (
          <Image
            key={i}
            source={{ uri: getBackImageUrl() }}
            style={[
              styles.scatteredTile,
              {
                left: tile.x,
                top: tile.y,
                transform: [{ rotate: `${tile.rotation}deg` }],
              },
            ]}
            resizeMode="contain"
          />
        ))}
      </View>

      <Text style={styles.pickText}>{getPickText()}</Text>

      <View style={styles.choicesRow}>
        {[0, 1, 2].map(renderChoiceTile)}
      </View>

      {showResult && (
        <Animated.View
          style={[
            styles.resultContainer,
            {
              opacity: resultBounce,
              transform: [
                {
                  scale: resultBounce.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 1],
                  }),
                },
              ],
            },
          ]}
        >
          {result?.won ? (
            <>
              <Text style={styles.winText}>{result.patternDisplay}</Text>
              <Animated.View
                style={{
                  transform: [{ translateY: starsFloat }],
                  opacity: starsOpacity,
                }}
              >
                <Text style={styles.starsText}>+3 ⭐</Text>
              </Animated.View>
            </>
          ) : (
            <Text style={styles.loseText}>{getEncouragementText()}</Text>
          )}
        </Animated.View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.handScrollContent}
        style={styles.handScroll}
      >
        {hand.map((tileId, i) => {
          const highlighted = showResult && result?.won && isMatchingTile(tileId);
          return (
            <View
              key={`${tileId}-${i}`}
              style={[styles.handTileContainer, highlighted && styles.handTileHighlighted]}
            >
              <Image
                source={{ uri: getTileImageUrl(tileId) }}
                style={styles.handTileImage}
                resizeMode="contain"
              />
            </View>
          );
        })}
      </ScrollView>

      {showResult && (
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          activeOpacity={0.8}
          testID="mahjong-close-button"
        >
          <Text style={styles.closeButtonText}>{getBackText()}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <View style={styles.container}>
        <View style={styles.feltBackground}>
          <View style={styles.feltOverlay} />
          <View style={styles.feltPatternRow}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={i} style={styles.feltDot} />
            ))}
          </View>
        </View>

        <View style={styles.content}>
          {phase === 'rules' ? renderRulesPhase() : renderGamePhase()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TABLE_GREEN,
  },
  feltBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: TABLE_GREEN,
  },
  feltOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  feltPatternRow: {
    position: 'absolute' as const,
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    opacity: 0.15,
  },
  feltDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TABLE_GREEN_LIGHT,
  },
  content: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
  },
  phaseContainer: {
    flex: 1,
    alignItems: 'center' as const,
    paddingHorizontal: 20,
  },
  levelBadge: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start' as const,
    marginBottom: 16,
    marginLeft: 4,
  },
  levelBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
  rulesCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center' as const,
    marginTop: SCREEN_HEIGHT * 0.08,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  rulesEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  rulesTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700' as const,
    marginBottom: 16,
    textAlign: 'center' as const,
  },
  rulesText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center' as const,
  },
  startButton: {
    backgroundColor: GOLD,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 30,
    marginTop: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  startButtonText: {
    color: FELT_DARK,
    fontSize: 20,
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  scatteredArea: {
    height: 140,
    width: '100%',
    position: 'relative' as const,
    overflow: 'hidden' as const,
    opacity: 0.35,
  },
  scatteredTile: {
    position: 'absolute' as const,
    width: 28,
    height: 38,
  },
  pickText: {
    color: GOLD,
    fontSize: 20,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  choicesRow: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: 20,
    marginBottom: 16,
  },
  choiceTileContainer: {
    width: CHOICE_TILE_W,
    height: CHOICE_TILE_H,
    borderRadius: 6,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden' as const,
  },
  tileImageWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  tileImageFront: {
    position: 'absolute' as const,
  },
  choiceTileImage: {
    width: CHOICE_TILE_W,
    height: CHOICE_TILE_H,
  },
  goldenGlow: {
    borderWidth: 3,
    borderColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  greenGlow: {
    borderWidth: 3,
    borderColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  redTint: {
    borderWidth: 2,
    borderColor: '#e74c3c',
    opacity: 0.85,
  },
  wouldHaveWonLabel: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
    marginTop: 4,
  },
  resultContainer: {
    alignItems: 'center' as const,
    marginVertical: 8,
    minHeight: 60,
  },
  winText: {
    color: GOLD,
    fontSize: 32,
    fontWeight: '800' as const,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    textAlign: 'center' as const,
  },
  starsText: {
    color: GOLD,
    fontSize: 24,
    fontWeight: '700' as const,
    marginTop: 4,
    textAlign: 'center' as const,
  },
  loseText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 20,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  handScroll: {
    maxHeight: HAND_TILE_H + 24,
    marginTop: 'auto' as const,
    marginBottom: Platform.OS === 'ios' ? 100 : 80,
  },
  handScrollContent: {
    paddingHorizontal: 12,
    alignItems: 'flex-end' as const,
    gap: 3,
  },
  handTileContainer: {
    width: HAND_TILE_W,
    height: HAND_TILE_H,
    borderRadius: 4,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden' as const,
  },
  handTileHighlighted: {
    borderWidth: 2,
    borderColor: GOLD,
    shadowColor: GOLD,
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
  handTileImage: {
    width: HAND_TILE_W,
    height: HAND_TILE_H,
  },
  closeButton: {
    position: 'absolute' as const,
    bottom: Platform.OS === 'ios' ? 44 : 28,
    alignSelf: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});

export default React.memo(MiniMahjongGame);
