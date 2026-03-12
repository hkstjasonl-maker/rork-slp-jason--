import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Eye } from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import {
  generateHand,
  checkResult,
  getTileImageUrl,
  getBackImageUrl,
  getSuit,
  getNumber,
  isNumberTile,
  ALL_TILES,
  GameLevel,
  TileId,
  GameResult,
  GeneratedHand,
} from '@/utils/mahjongGame';

interface MiniMahjongGameProps {
  visible: boolean;
  level: GameLevel;
  onClose: (starsEarned: number) => void;
  patientId: string;
  practiceMode?: boolean;
}

type Phase = 'rules' | 'loading' | 'game' | 'reveal';

interface ScatteredTile {
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const HAND_TILE_W = 42;
const HAND_TILE_H = 58;
const CHOICE_TILE_W = 65;
const CHOICE_TILE_H = 90;
const SCATTER_TILE_W = 32;
const SCATTER_TILE_H = 44;

const RULES_TEXT: Record<GameLevel, { en: string; zh_hant: string; zh_hans: string }> = {
  basic: {
    en: "You'll see 13 mahjong tiles. Pick 1 of 3 face-down tiles. You win if it matches a pair in your hand — that's called Pong (碰) or Kong (槓)!",
    zh_hant: '你會看到13張麻雀牌。從3張蓋著的牌中選1張。如果選到的牌能跟手牌配對，就是「碰」或「槓」，你就贏了！',
    zh_hans: '你会看到13张麻雀牌。从3张盖着的牌中选1张。如果选到的牌能跟手牌配对，就是「碰」或「杠」，你就赢了！',
  },
  moderate: {
    en: "Pick 1 of 3 face-down tiles. You win if it completes a sequence of 3 consecutive tiles — that's called Chi (上)!",
    zh_hant: '從3張蓋著的牌中選1張。如果選到的牌能跟手牌組成3張連續的順子，就是「上」，你就贏了！',
    zh_hans: '从3张盖着的牌中选1张。如果选到的牌能跟手牌组成3张连续的顺子，就是「上」，你就赢了！',
  },
  difficult: {
    en: "Pick 1 of 3 face-down tiles. You win if it completes your winning hand — that's called Hu (食糊)! You need 4 groups of 3 + 1 pair.",
    zh_hant: '從3張蓋著的牌中選1張。如果選到的牌能讓你食糊就贏了！你需要4組面子加1對眼。',
    zh_hans: '从3张盖着的牌中选1张。如果选到的牌能让你食胡就赢了！你需要4组面子加1对眼。',
  },
};

const LEVEL_LABELS: Record<GameLevel, { en: string; zh_hant: string; zh_hans: string }> = {
  basic: { en: 'Basic', zh_hant: '基本', zh_hans: '基本' },
  moderate: { en: 'Moderate', zh_hant: '中等', zh_hans: '中等' },
  difficult: { en: 'Difficult', zh_hant: '困難', zh_hans: '困难' },
};

function generateScatteredTiles(count: number, areaW: number, areaH: number): ScatteredTile[] {
  const tiles: ScatteredTile[] = [];
  for (let i = 0; i < count; i++) {
    tiles.push({
      x: Math.random() * areaW,
      y: Math.random() * areaH,
      rotation: (Math.random() - 0.5) * 40,
      scale: 0.5 + Math.random() * 0.4,
    });
  }
  return tiles;
}

const BACK_IMAGE_URI = getBackImageUrl();
const backImageSource = { uri: BACK_IMAGE_URI };

const ScatteredTilesLayer = React.memo(function ScatteredTilesLayer({ tiles }: { tiles: ScatteredTile[] }) {
  return (
    <View style={styles.bgScatterLayer} pointerEvents="none">
      {tiles.map((st, i) => (
        <Image
          key={`bg-${i}`}
          source={backImageSource}
          style={[
            styles.bgScatteredTile,
            {
              left: st.x,
              top: st.y,
              transform: [
                { rotate: `${st.rotation}deg` },
                { scale: st.scale },
              ],
            },
          ]}
          resizeMode="contain"
        />
      ))}
    </View>
  );
});

export default function MiniMahjongGame({ visible, level, onClose, patientId, practiceMode = false }: MiniMahjongGameProps) {
  const { language } = useApp();
  const lang = language || 'en';

  const [phase, setPhase] = useState<Phase>('rules');
  const [gameData, setGameData] = useState<GeneratedHand | null>(null);
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set());
  const [showResult, setShowResult] = useState<boolean>(false);
  const [tapsDisabled, setTapsDisabled] = useState<boolean>(false);
  const [tipsUsed, setTipsUsed] = useState<boolean>(false);

  const bgScatteredTiles = useMemo(() => generateScatteredTiles(25, SCREEN_WIDTH, SCREEN_HEIGHT), []);

  const flipAnimsRef = useRef<Animated.Value[]>([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]);
  const flipAnims = flipAnimsRef.current;

  const choicePulseAnimRef = useRef(new Animated.Value(0));
  const choicePulseAnim = choicePulseAnimRef.current;
  const resultBounceAnimRef = useRef(new Animated.Value(0));
  const resultBounceAnim = resultBounceAnimRef.current;
  const starsFloatAnimRef = useRef(new Animated.Value(0));
  const starsFloatAnim = starsFloatAnimRef.current;
  const starsOpacityAnimRef = useRef(new Animated.Value(0));
  const starsOpacityAnim = starsOpacityAnimRef.current;

  useEffect(() => {
    if (visible) {
      setPhase('rules');
      setGameData(null);
      setPickedIndex(null);
      setResult(null);
      setRevealedIndices(new Set());
      setShowResult(false);
      setTapsDisabled(false);
      setTipsUsed(false);
      flipAnimsRef.current.forEach(a => a.setValue(0));
      resultBounceAnimRef.current.setValue(0);
      starsFloatAnimRef.current.setValue(0);
      starsOpacityAnimRef.current.setValue(0);

      const backUrl = getBackImageUrl();
      if (Platform.OS !== 'web') {
        Image.prefetch(backUrl).catch(() => {});
        ALL_TILES.slice(0, 15).forEach(t => {
          Image.prefetch(getTileImageUrl(t)).catch(() => {});
        });
      }
    }
  }, [visible]);

  useEffect(() => {
    if (phase === 'game' && !tipsUsed) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(choicePulseAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
          Animated.timing(choicePulseAnim, { toValue: 0, duration: 1000, useNativeDriver: false }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [phase, choicePulseAnim, tipsUsed]);

  const handleStart = useCallback(() => {
    const data = generateHand(level);
    setGameData(data);
    setPhase('loading');
    log('[MiniMahjongGame] Game loading, level:', level);

    if (Platform.OS !== 'web') {
      data.hand.forEach(t => Image.prefetch(getTileImageUrl(t)).catch(() => {}));
      data.choices.forEach(t => Image.prefetch(getTileImageUrl(t)).catch(() => {}));
    }

    setTimeout(() => {
      setPhase('game');
      log('[MiniMahjongGame] Game started');
    }, 1500);
  }, [level]);

  const flipTile = useCallback((index: number): Promise<void> => {
    return new Promise((resolve) => {
      Animated.timing(flipAnims[index], {
        toValue: 0.5,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setRevealedIndices(prev => new Set([...prev, index]));
        Animated.timing(flipAnims[index], {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start(() => resolve());
      });
    });
  }, [flipAnims]);

  const handleTips = useCallback(() => {
    if (tapsDisabled || !gameData || tipsUsed) return;
    setTipsUsed(true);
    log('[MiniMahjongGame] Tips used - revealing all choices');

    const flipAll = async () => {
      await flipTile(0);
      await new Promise<void>(resolve => setTimeout(resolve, 100));
      await flipTile(1);
      await new Promise<void>(resolve => setTimeout(resolve, 100));
      await flipTile(2);
    };
    void flipAll();
  }, [tapsDisabled, gameData, tipsUsed, flipTile]);

  const handlePickTile = useCallback(async (index: number) => {
    if (tapsDisabled || !gameData) return;
    setTapsDisabled(true);
    setPickedIndex(index);
    setPhase('reveal');

    log('[MiniMahjongGame] Picked tile index:', index, 'tile:', gameData.choices[index]);

    if (!tipsUsed) {
      await flipTile(index);

      const otherIndices = [0, 1, 2].filter(i => i !== index);
      await new Promise<void>(resolve => setTimeout(resolve, 200));
      await flipTile(otherIndices[0]);
      await new Promise<void>(resolve => setTimeout(resolve, 200));
      await flipTile(otherIndices[1]);
    }

    const gameResult = checkResult(gameData.hand, gameData.choices[index], level);
    setResult(gameResult);

    await new Promise<void>(resolve => setTimeout(resolve, 400));
    setShowResult(true);

    if (gameResult.won) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.spring(resultBounceAnim, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }).start();
      Animated.parallel([
        Animated.timing(starsFloatAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(starsOpacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.delay(800),
          Animated.timing(starsOpacityAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
      ]).start();
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [tapsDisabled, gameData, level, flipTile, resultBounceAnim, starsFloatAnim, starsOpacityAnim, tipsUsed]);

  const handleClose = useCallback(async () => {
    const starsEarned = practiceMode ? 0 : (result?.won ? 3 : 0);

    try {
      await supabase.from('mahjong_game_log').insert({
        patient_id: patientId,
        level,
        won: result?.won ?? false,
        hand_tiles: gameData?.hand ?? [],
        picked_tile: gameData?.choices[pickedIndex ?? 0] ?? '',
        winning_pattern: result?.pattern ?? null,
        stars_earned: starsEarned,
      });
      log('[MiniMahjongGame] Game log saved');

      if (result?.won && !practiceMode) {
        await supabase.rpc('increment_stars', {
          p_patient_id: patientId,
          p_amount: 3,
        }).then(({ error }) => {
          if (error) {
            log('[MiniMahjongGame] RPC increment_stars failed, trying manual update');
            return supabase
              .from('patients')
              .select('stars_total, stars_available')
              .eq('id', patientId)
              .single()
              .then(({ data }) => {
                if (data) {
                  return supabase.from('patients').update({
                    stars_total: (data.stars_total || 0) + 3,
                    stars_available: (data.stars_available || 0) + 3,
                  }).eq('id', patientId);
                }
              });
          }
        });
        log('[MiniMahjongGame] Stars awarded: 3');
      }
    } catch (e) {
      log('[MiniMahjongGame] Error saving game result:', e);
    }

    onClose(starsEarned);
  }, [result, gameData, pickedIndex, patientId, level, onClose, practiceMode]);

  const getLocalizedText = useCallback((texts: { en: string; zh_hant: string; zh_hans: string }) => {
    if (lang === 'zh_hant') return texts.zh_hant;
    if (lang === 'zh_hans') return texts.zh_hans;
    return texts.en;
  }, [lang]);

  const getBilingualText = useCallback((en: string, zh_hant: string, zh_hans: string) => {
    if (lang === 'en') return en;
    if (lang === 'zh_hant') return zh_hant;
    return zh_hans;
  }, [lang]);

  const isMatchingTile = useCallback((handTile: TileId): boolean => {
    if (!gameData || pickedIndex === null || !result?.won) return false;
    const picked = gameData.choices[pickedIndex];

    if (level === 'basic') {
      return handTile === picked;
    }

    if (level === 'moderate') {
      if (!isNumberTile(picked) || !isNumberTile(handTile)) return false;
      if (getSuit(picked) !== getSuit(handTile)) return false;
      const pNum = getNumber(picked);
      const hNum = getNumber(handTile);
      if (pNum === null || hNum === null) return false;
      const suit = getSuit(picked);
      const suitTiles = gameData.hand.filter(t => getSuit(t) === suit).map(t => getNumber(t)!);
      for (let start = Math.min(pNum, hNum) - 2; start <= Math.max(pNum, hNum); start++) {
        const seq = [start, start + 1, start + 2];
        if (seq.includes(pNum) && seq.includes(hNum)) {
          const others = seq.filter(n => n !== pNum);
          if (others.every(n => suitTiles.includes(n))) return true;
        }
      }
      return false;
    }

    return false;
  }, [gameData, pickedIndex, result, level]);

  const showTipsButton = (level === 'basic' || level === 'moderate') && phase === 'game' && !tipsUsed && !tapsDisabled;

  const renderLoadingPhase = () => (
    <View style={styles.loadingContainer}>
      <ScatteredTilesLayer tiles={bgScatteredTiles} />
      <View style={styles.loadingContent}>
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={styles.loadingText}>
          {getBilingualText('Shuffling tiles...', '洗牌中...', '洗牌中...')}
        </Text>
      </View>
    </View>
  );

  const renderRulesPhase = () => (
    <View style={styles.rulesContainer}>
      <Text style={styles.mahjongEmoji}>🀄</Text>
      <View style={styles.levelBadgeLarge}>
        <Text style={styles.levelBadgeText}>
          {getLocalizedText(LEVEL_LABELS[level])}
        </Text>
      </View>
      <Text style={styles.rulesTitle}>
        {getBilingualText('Mini Mahjong', '麻雀小遊戲', '麻雀小游戏')}
      </Text>
      <View style={styles.rulesCard}>
        <Text style={styles.rulesText}>
          {getLocalizedText(RULES_TEXT[level])}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.startButton}
        onPress={handleStart}
        activeOpacity={0.8}
        testID="mahjong-start-button"
      >
        <Text style={styles.startButtonText}>
          {getBilingualText('Start', '開始', '开始')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderChoiceTile = (index: number) => {
    if (!gameData) return null;

    const flipValue = flipAnims[index];
    const isRevealed = revealedIndices.has(index);
    const tileId = gameData.choices[index];
    const isWinner = index === gameData.winningIndex;
    const isPicked = index === pickedIndex;

    const rotateY = flipValue.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: ['0deg', '90deg', '0deg'],
    });

    const glowOpacity = choicePulseAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 0.8],
    });

    const showGoldenGlow = showResult && result?.won && isWinner;
    const showGreenGlow = showResult && !result?.won && isWinner;
    const showRedTint = showResult && !result?.won && isPicked;
    const isRevealPhase = phase === 'reveal';

    return (
      <View key={index} style={styles.choiceTileWrapper}>
        <Animated.View
          style={[
            isRevealed ? styles.choiceTileRevealed : styles.choiceTile,
            { transform: [{ rotateY }] },
            showGoldenGlow && styles.goldenGlow,
            showGreenGlow && styles.greenGlow,
            showRedTint && styles.redTint,
          ]}
        >
          {!tapsDisabled && !isRevealed && !tipsUsed && (
            <Animated.View style={[styles.choicePulse, { opacity: glowOpacity }]} />
          )}
          <TouchableOpacity
            onPress={() => handlePickTile(index)}
            disabled={tapsDisabled}
            activeOpacity={0.7}
            testID={`mahjong-choice-${index}`}
          >
            <Image
              source={isRevealed ? { uri: getTileImageUrl(tileId) } : backImageSource}
              style={isRevealed ? styles.choiceTileImageRevealed : styles.choiceTileImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </Animated.View>
        {!isRevealPhase && (
          <Text style={styles.choiceLabel}>
            {['①', '②', '③'][index]}
          </Text>
        )}
        {isRevealed && !isRevealPhase && (
          <Text style={styles.choiceLabel}>
            {['①', '②', '③'][index]}
          </Text>
        )}
        {isRevealPhase && (
          <Text style={styles.choiceLabel}>
            {['①', '②', '③'][index]}
          </Text>
        )}
        {showGreenGlow && (
          <Text style={styles.winnerArrow}>
            {getBilingualText('This one!', '這張才是！', '这张才是！')} ↑
          </Text>
        )}
      </View>
    );
  };

  const renderGamePhase = () => {
    if (!gameData) return null;

    return (
      <View style={styles.gameContainer}>
        <View style={styles.levelBadgeSmall}>
          <Text style={styles.levelBadgeTextSmall}>
            {getLocalizedText(LEVEL_LABELS[level])}
          </Text>
        </View>
        {practiceMode && (
          <View style={styles.practiceBadge}>
            <Text style={styles.practiceBadgeText}>
              {getBilingualText('Practice', '練習', '练习')}
            </Text>
          </View>
        )}

        <ScatteredTilesLayer tiles={bgScatteredTiles} />

        <View style={styles.centerArea}>
          <Text style={styles.pickText}>
            {getBilingualText('Pick one!', '選一張！', '选一张！')}
          </Text>

          <View style={styles.choicesRow}>
            {[0, 1, 2].map(i => renderChoiceTile(i))}
          </View>

          {showTipsButton && (
            <TouchableOpacity
              style={styles.tipsButton}
              onPress={handleTips}
              activeOpacity={0.7}
              testID="mahjong-tips-button"
            >
              <Eye size={18} color="#FFD700" />
              <Text style={styles.tipsButtonText}>
                {getBilingualText('Tips', '提示', '提示')}
              </Text>
            </TouchableOpacity>
          )}

          {showResult && renderResultOverlay()}
        </View>

        <View style={styles.handArea}>
          <Text style={styles.handLabel}>
            {getBilingualText('Your Hand', '你的手牌', '你的手牌')}
          </Text>
          <View style={styles.handGrid}>
            <View style={styles.handRow}>
              {gameData.hand.slice(0, 7).map((tileId, i) => {
                const highlighted = isMatchingTile(tileId);
                return (
                  <View
                    key={`${tileId}-${i}`}
                    style={[
                      styles.handTileWrapper,
                      highlighted && styles.handTileHighlight,
                    ]}
                  >
                    <Image
                      source={{ uri: getTileImageUrl(tileId) }}
                      style={styles.handTileImage}
                      resizeMode="contain"
                    />
                  </View>
                );
              })}
            </View>
            <View style={styles.handRow}>
              {gameData.hand.slice(7).map((tileId, i) => {
                const highlighted = isMatchingTile(tileId);
                return (
                  <View
                    key={`${tileId}-${i + 7}`}
                    style={[
                      styles.handTileWrapper,
                      highlighted && styles.handTileHighlight,
                    ]}
                  >
                    <Image
                      source={{ uri: getTileImageUrl(tileId) }}
                      style={styles.handTileImage}
                      resizeMode="contain"
                    />
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderResultOverlay = () => {
    if (!result) return null;

    const bounceScale = resultBounceAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 1],
    });

    const floatY = starsFloatAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -60],
    });

    const closeButtonLabel = practiceMode
      ? getBilingualText('Back to Settings', '返回設定', '返回设置')
      : getBilingualText('Back to Exercise', '返回練習', '返回练习');

    if (result.won) {
      return (
        <View style={styles.resultOverlay}>
          <Animated.Text
            style={[
              styles.winText,
              { transform: [{ scale: bounceScale }] },
            ]}
          >
            {result.patternDisplay ? getLocalizedText(result.patternDisplay) : 'Win!'}
          </Animated.Text>
          {practiceMode ? (
            <Text style={styles.starsText}>
              {getBilingualText('Great job!', '做得好！', '做得好！')}
            </Text>
          ) : (
            <Animated.Text
              style={[
                styles.starsText,
                {
                  opacity: starsOpacityAnim,
                  transform: [{ translateY: floatY }],
                },
              ]}
            >
              +3 ⭐
            </Animated.Text>
          )}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            activeOpacity={0.8}
            testID="mahjong-close-button"
          >
            <Text style={styles.closeButtonText}>
              {closeButtonLabel}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.resultOverlay}>
        <Text style={styles.loseText}>
          {getBilingualText(
            'Not this time! Keep practicing! 💪',
            '這次沒中！繼續加油！💪',
            '这次没中！继续加油！💪'
          )}
        </Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          activeOpacity={0.8}
          testID="mahjong-close-button"
        >
          <Text style={styles.closeButtonText}>
            {closeButtonLabel}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <View style={styles.container}>
        {phase === 'rules' && renderRulesPhase()}
        {phase === 'loading' && renderLoadingPhase()}
        {(phase === 'game' || phase === 'reveal') && renderGamePhase()}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1B4D25',
  },
  rulesContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  mahjongEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  levelBadgeLarge: {
    backgroundColor: 'rgba(255,215,0,0.2)',
    borderWidth: 1,
    borderColor: '#FFD700',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 6,
    marginBottom: 16,
  },
  levelBadgeText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  rulesTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800' as const,
    marginBottom: 20,
    textAlign: 'center',
  },
  rulesCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  rulesText: {
    color: '#E8F5E9',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  startButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 28,
    paddingHorizontal: 48,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700' as const,
  },
  gameContainer: {
    flex: 1,
    paddingTop: 50,
    zIndex: 1,
  },
  levelBadgeSmall: {
    position: 'absolute',
    top: 52,
    left: 16,
    backgroundColor: 'rgba(255,215,0,0.2)',
    borderWidth: 1,
    borderColor: '#FFD700',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    zIndex: 10,
  },
  levelBadgeTextSmall: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '700' as const,
  },
  bgScatterLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'hidden',
  },
  bgScatteredTile: {
    position: 'absolute',
    width: SCATTER_TILE_W,
    height: SCATTER_TILE_H,
    opacity: 0.15,
  },
  centerArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  pickText: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: '700' as const,
    textAlign: 'center',
    marginBottom: 16,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  choicesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 24,
  },
  choiceTileWrapper: {
    alignItems: 'center',
  },
  choiceTile: {
    width: CHOICE_TILE_W,
    height: CHOICE_TILE_H,
    borderRadius: 6,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 5,
  },
  choiceTileRevealed: {
    width: CHOICE_TILE_W,
    height: CHOICE_TILE_H,
    borderRadius: 6,
    overflow: 'visible',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 5,
  },
  choicePulse: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  choiceTileImage: {
    width: CHOICE_TILE_W,
    height: CHOICE_TILE_H,
    borderRadius: 4,
  },
  choiceTileImageRevealed: {
    width: CHOICE_TILE_W,
    height: CHOICE_TILE_H,
    borderRadius: 4,
  },
  choiceLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    marginTop: 6,
  },
  goldenGlow: {
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 10,
  },
  greenGlow: {
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 10,
  },
  redTint: {
    opacity: 0.7,
  },
  winnerArrow: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '700' as const,
    marginTop: 4,
    textAlign: 'center',
  },
  tipsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  tipsButtonText: {
    color: '#FFD700',
    fontSize: 15,
    fontWeight: '700' as const,
  },
  handArea: {
    paddingBottom: 32,
    paddingTop: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 5,
  },
  handLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600' as const,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  handGrid: {
    paddingHorizontal: 8,
    gap: 4,
  },
  handRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 3,
  },
  handTileWrapper: {
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
    backgroundColor: '#FFFFFF',
  },
  handTileHighlight: {
    borderColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  handTileImage: {
    width: HAND_TILE_W,
    height: HAND_TILE_H,
    borderRadius: 3,
  },
  resultOverlay: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 12,
  },
  winText: {
    color: '#FFD700',
    fontSize: 32,
    fontWeight: '900' as const,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    marginBottom: 8,
  },
  starsText: {
    color: '#FFD700',
    fontSize: 24,
    fontWeight: '800' as const,
    marginBottom: 16,
  },
  loseText: {
    color: '#E8F5E9',
    fontSize: 18,
    fontWeight: '600' as const,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 24,
  },
  closeButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
    zIndex: 2,
  },
  loadingText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: '700' as const,
    marginTop: 16,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  practiceBadge: {
    position: 'absolute' as const,
    top: 52,
    right: 16,
    backgroundColor: 'rgba(158,158,158,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(200,200,200,0.5)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    zIndex: 10,
  },
  practiceBadgeText: {
    color: '#E0E0E0',
    fontSize: 12,
    fontWeight: '700' as const,
  },
});
