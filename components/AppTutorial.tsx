import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScaledText } from '@/components/ScaledText';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TutorialScreen {
  icon: string;
  title_en: string;
  title_zh: string;
  desc_en: string;
  desc_zh: string;
}

const TUTORIAL_SCREENS: TutorialScreen[] = [
  {
    icon: '👋',
    title_en: 'Welcome to SLP Jason',
    title_zh: '歡迎使用 SLP Jason',
    desc_en: 'Your speech therapist has prescribed exercises for you. This app helps you practise at home with video guidance.',
    desc_zh: '你的言語治療師為你安排了練習計劃。此應用程式幫助你在家中跟隨影片指導進行練習。',
  },
  {
    icon: '🏠',
    title_en: 'Your Daily Exercises',
    title_zh: '每日練習',
    desc_en: "The Home screen shows your exercises for today. Tap any exercise to start, or tap 'Do All Exercises' to go through them in order.",
    desc_zh: '主頁顯示你今天的練習。點擊任何練習開始，或點擊「開始所有練習」按順序完成。',
  },
  {
    icon: '▶️',
    title_en: 'Watch the Demo Video',
    title_zh: '觀看示範影片',
    desc_en: 'Each exercise has a demonstration video. Watch it first to learn the correct technique before practising.',
    desc_zh: '每項練習都有示範影片。先觀看影片學習正確技巧，然後再開始練習。',
  },
  {
    icon: '🪞',
    title_en: 'Mirror Mode',
    title_zh: '鏡子模式',
    desc_en: "Tap 'Open Mirror' to see yourself while practising. The screen splits — demo video on top, your camera on the bottom. It's like practising in front of a mirror!",
    desc_zh: '點擊「開啟鏡子」，練習時可以看到自己。螢幕分為上下兩部分 — 上方是示範影片，下方是你的鏡頭。就像在鏡子前練習一樣！',
  },
  {
    icon: '🎬',
    title_en: 'Record & Submit Videos',
    title_zh: '錄影並提交',
    desc_en: 'Your therapist may ask you to record yourself practising. Tap the red record button, then submit the video for your therapist to review and give feedback.',
    desc_zh: '你的治療師可能要求你錄製練習影片。點擊紅色錄影按鈕，然後提交影片供治療師審閱和回饋。',
  },
  {
    icon: '⭐',
    title_en: 'Earn Stars & Streaks',
    title_zh: '獲得星星和連續獎勵',
    desc_en: 'Complete exercises to earn stars! Practise every day to build streaks. Check the Progress tab to see how well you\'re doing.',
    desc_zh: '完成練習即可獲得星星！每天練習以累積連續天數。在「進度」分頁查看你的表現。',
  },
  {
    icon: '📚',
    title_en: 'Learn & Assessments',
    title_zh: '學習與評估',
    desc_en: 'The Learn tab has educational videos from your therapist. The Assessments tab has questionnaires — complete them when assigned.',
    desc_zh: '「學習」分頁有治療師提供的教育影片。「評估」分頁有問卷 — 收到指派時請完成。',
  },
  {
    icon: '🎉',
    title_en: "You're Ready!",
    title_zh: '準備好了！',
    desc_en: "That's it! Check 'My Submissions' on the home page for therapist feedback. You can replay this tutorial anytime in Settings.",
    desc_zh: '就是這樣！在主頁查看「我的提交」以獲取治療師回饋。你可以隨時在「設定」中重新觀看此教學。',
  },
];

interface AppTutorialProps {
  visible: boolean;
  onComplete: () => void;
}

export function AppTutorial({ visible, onComplete }: AppTutorialProps) {
  const { language } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const insets = useSafeAreaInsets();

  const isChinese = language === 'zh_hant' || language === 'zh_hans';
  const isLastPage = currentPage === TUTORIAL_SCREENS.length - 1;

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentPage(page);
  }, []);

  const goToPage = useCallback((page: number) => {
    scrollRef.current?.scrollTo({ x: page * SCREEN_WIDTH, animated: true });
    setCurrentPage(page);
  }, []);

  const handleNext = useCallback(() => {
    if (isLastPage) {
      setCurrentPage(0);
      onComplete();
    } else {
      goToPage(currentPage + 1);
    }
  }, [isLastPage, currentPage, goToPage, onComplete]);

  const handleSkip = useCallback(() => {
    setCurrentPage(0);
    onComplete();
  }, [onComplete]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={handleSkip}
    >
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.skipRow}>
          <TouchableOpacity
            onPress={handleSkip}
            style={styles.skipButton}
            activeOpacity={0.6}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ScaledText size={15} weight="600" color={Colors.textSecondary}>
              {isChinese ? '跳過 Skip' : 'Skip 跳過'}
            </ScaledText>
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          scrollEventThrottle={16}
          bounces={false}
          style={styles.scrollView}
        >
          {TUTORIAL_SCREENS.map((screen, index) => (
            <View key={index} style={[styles.page, { width: SCREEN_WIDTH }]}>
              <View style={styles.pageContent}>
                <ScaledText size={64} style={styles.icon}>
                  {screen.icon}
                </ScaledText>

                <View style={styles.titleBlock}>
                  <ScaledText
                    size={isChinese ? 24 : 24}
                    weight="bold"
                    color={Colors.textPrimary}
                    style={styles.titlePrimary}
                  >
                    {isChinese ? screen.title_zh : screen.title_en}
                  </ScaledText>
                  <ScaledText
                    size={15}
                    color={Colors.textSecondary}
                    style={styles.titleSecondary}
                  >
                    {isChinese ? screen.title_en : screen.title_zh}
                  </ScaledText>
                </View>

                <View style={styles.descBlock}>
                  <ScaledText
                    size={16}
                    color={Colors.textPrimary}
                    style={styles.descPrimary}
                  >
                    {isChinese ? screen.desc_zh : screen.desc_en}
                  </ScaledText>
                  <ScaledText
                    size={13}
                    color={Colors.textSecondary}
                    style={styles.descSecondary}
                  >
                    {isChinese ? screen.desc_en : screen.desc_zh}
                  </ScaledText>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {TUTORIAL_SCREENS.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index === currentPage ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={styles.nextButton}
            onPress={handleNext}
            activeOpacity={0.8}
          >
            <ScaledText size={17} weight="bold" color={Colors.white}>
              {isLastPage
                ? isChinese
                  ? '開始使用 Get Started'
                  : 'Get Started 開始使用'
                : isChinese
                  ? '下一步 Next'
                  : 'Next 下一步'}
            </ScaledText>
          </TouchableOpacity>

          <ScaledText size={12} color={Colors.disabled} style={styles.pageCounter}>
            {String((currentPage + 1) + ' / ' + TUTORIAL_SCREENS.length)}
          </ScaledText>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  scrollView: {
    flex: 1,
  },
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  pageContent: {
    alignItems: 'center',
    maxWidth: 320,
  },
  icon: {
    lineHeight: 80,
    marginBottom: 28,
    textAlign: 'center',
  },
  titleBlock: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 6,
  },
  titlePrimary: {
    textAlign: 'center',
  },
  titleSecondary: {
    textAlign: 'center',
  },
  descBlock: {
    alignItems: 'center',
    gap: 16,
  },
  descPrimary: {
    textAlign: 'center',
    lineHeight: 26,
  },
  descSecondary: {
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 16,
    alignItems: 'center',
    gap: 14,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 24,
    borderRadius: 4,
  },
  dotInactive: {
    backgroundColor: Colors.border,
  },
  nextButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  pageCounter: {
    textAlign: 'center',
  },
});
