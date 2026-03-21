import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  Easing,
  Modal,
  Pressable,
  useWindowDimensions,
  LayoutAnimation,
  Platform,
  UIManager,
  PanResponder,
  Alert,
  GestureResponderEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Sparkles, Gift, X, ChevronLeft, ChevronDown, ChevronUp, SlidersHorizontal, Eye, EyeOff, Plus, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react-native';

import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { log } from '@/lib/logger';
import { initAudio, playZenAmbient, stopZenAmbient, playZenChime } from '@/utils/soundEffects';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const GARDEN_HEIGHT = 520;
const TOTAL_SLOTS = 20;
const GRID_COLS = 4;
const GRID_ROWS = 5;
const CELL_W = 72;
const CELL_H = 46;
const GRID_W = GRID_COLS * CELL_W;
const GRID_H = GRID_ROWS * CELL_H;

const RARITY_COLORS: Record<string, { bg: string; dot: string; label: string; glow: string }> = {
  common: { bg: '#E8F5E9', dot: '#4CAF50', label: '★', glow: '#A5D6A7' },
  uncommon: { bg: '#E3F2FD', dot: '#2196F3', label: '★★', glow: '#90CAF9' },
  rare: { bg: '#F3E5F5', dot: '#9C27B0', label: '★★★', glow: '#CE93D8' },
  epic: { bg: '#FFF3E0', dot: '#FF9800', label: '★★★★', glow: '#FFCC80' },
  legendary: { bg: '#FFF8E1', dot: '#FFD700', label: '★★★★★', glow: '#FFE082' },
};

const RARITY_ORDER: Record<string, number> = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };

interface FlowerType {
  id: string;
  name_en: string;
  name_zh: string;
  image_url: string;
  rarity: string;
}

interface PatientFlower {
  id: string;
  patient_id: string;
  flower_type_id: string;
  grid_position: number;
  is_stolen: boolean;
  is_displayed?: boolean;
  position_x?: number | null;
  position_y?: number | null;
  stolen_at: string | null;
  obtained_at: string;
  flower_types?: FlowerType;
}

interface GroupedFlower {
  flowerType: FlowerType;
  count: number;
  flowers: PatientFlower[];
}

function seededRand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const MOUNTAIN_DATA = [
  { type: 'dome' as const, left: -20, w: 180, h: 55, color: 'rgba(100,130,150,0.5)' },
  { type: 'peak' as const, left: 40, bL: 45, bR: 45, bB: 95, color: 'rgba(80,115,135,0.55)' },
  { type: 'dome' as const, left: 100, w: 150, h: 70, color: 'rgba(90,125,145,0.45)' },
  { type: 'peak' as const, left: 180, bL: 55, bR: 55, bB: 85, color: 'rgba(95,130,150,0.6)' },
  { type: 'dome' as const, left: 230, w: 130, h: 65, color: 'rgba(85,120,140,0.5)' },
  { type: 'peak' as const, left: 300, bL: 40, bR: 40, bB: 100, color: 'rgba(100,135,155,0.55)' },
  { type: 'dome' as const, left: 340, w: 160, h: 50, color: 'rgba(90,125,145,0.45)' },
  { type: 'peak' as const, left: 380, bL: 30, bR: 30, bB: 75, color: 'rgba(80,110,130,0.6)' },
];

const CLOUD_DATA = [
  { y: 12, w: 72, h: 22, duration: 42000, startFrac: 0.15 },
  { y: 38, w: 56, h: 18, duration: 52000, startFrac: 0.55 },
];

function getTreeData(sw: number, ratio: number = 1) {
  return [
    { emoji: '🌳', left: 18, top: 125 * ratio, size: 34, opacity: 0.22 },
    { emoji: '🌲', left: sw - 55, top: 135 * ratio, size: 30, opacity: 0.18 },
    { emoji: '🌳', left: 80, top: 150 * ratio, size: 22, opacity: 0.15 },
    { emoji: '🌴', left: sw - 110, top: 145 * ratio, size: 24, opacity: 0.15 },
  ];
}

const grassEmojis = ['🌱', '🌿', '☘️', '🍀'];

function getGrassSprites(sw: number, ratio: number = 1) {
  const sprites: { emoji: string; left: number; top: number; size: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const isLeft = i < 7;
    sprites.push({
      emoji: grassEmojis[i % 4],
      left: isLeft ? seededRand(i * 7 + 1) * 30 + 4 : sw - 36 + seededRand(i * 7 + 2) * 26,
      top: (155 + seededRand(i * 7 + 3) * 220) * ratio,
      size: 7 + Math.floor(seededRand(i * 7 + 4) * 5),
    });
  }
  return sprites;
}

const CELL_GRASS: { emoji: string; dx: number; dy: number; size: number }[][] = [];
for (let i = 0; i < TOTAL_SLOTS; i++) {
  const grasses: { emoji: string; dx: number; dy: number; size: number }[] = [];
  const count = 2 + (i % 2);
  for (let g = 0; g < count; g++) {
    grasses.push({
      emoji: grassEmojis[Math.floor(seededRand(i * 13 + g * 7) * 4)],
      dx: seededRand(i * 13 + g * 7 + 1) * (CELL_W - 14) + 4,
      dy: seededRand(i * 13 + g * 7 + 2) * (CELL_H - 12) + 2,
      size: 7 + Math.floor(seededRand(i * 13 + g * 7 + 3) * 4),
    });
  }
  CELL_GRASS.push(grasses);
}

const Mountains = React.memo(function Mountains({ gardenHeight }: { gardenHeight: number }) {
  const mountainTop = gardenHeight * 0.35;
  return (
    <>
      {MOUNTAIN_DATA.map((m, i) => {
        if (m.type === 'dome') {
          return (
            <View
              key={`m-${i}`}
              style={{
                position: 'absolute' as const,
                bottom: gardenHeight - mountainTop,
                left: m.left,
                width: m.w,
                height: m.h,
                borderTopLeftRadius: (m.w ?? 100) / 2,
                borderTopRightRadius: (m.w ?? 100) / 2,
                backgroundColor: m.color,
              }}
            />
          );
        }
        return (
          <View
            key={`m-${i}`}
            style={{
              position: 'absolute' as const,
              bottom: gardenHeight - mountainTop,
              left: m.left,
              width: 0,
              height: 0,
              backgroundColor: 'transparent',
              borderStyle: 'solid' as const,
              borderLeftWidth: m.bL ?? 40,
              borderRightWidth: m.bR ?? 40,
              borderBottomWidth: m.bB ?? 80,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: m.color,
            }}
          />
        );
      })}
    </>
  );
});

const RollingHills = React.memo(function RollingHills({ gardenHeight }: { gardenHeight: number }) {
  return (
    <>
      <View style={{
        position: 'absolute' as const, bottom: gardenHeight * 0.52, left: -30, right: -30,
        height: 60, borderTopLeftRadius: 300, borderTopRightRadius: 200,
        backgroundColor: 'rgba(165,214,167,0.7)',
      }} />
      <View style={{
        position: 'absolute' as const, bottom: gardenHeight * 0.48, left: '20%', right: -40,
        height: 50, borderTopLeftRadius: 250, borderTopRightRadius: 350,
        backgroundColor: 'rgba(129,199,132,0.65)',
      }} />
      <View style={{
        position: 'absolute' as const, bottom: gardenHeight * 0.44, left: -50, right: '15%',
        height: 45, borderTopLeftRadius: 350, borderTopRightRadius: 180,
        backgroundColor: 'rgba(102,187,106,0.6)',
      }} />
      <View style={{
        position: 'absolute' as const, bottom: gardenHeight * 0.40, left: -20, right: -20,
        height: 40, borderTopLeftRadius: 200, borderTopRightRadius: 280,
        backgroundColor: 'rgba(85,139,47,0.55)',
      }} />
    </>
  );
});

const _AtmosphericHaze = React.memo(function AtmosphericHaze({ gardenHeight }: { gardenHeight: number }) {
  return (
    <>
      <View style={{
        position: 'absolute' as const, top: gardenHeight * 0.10, left: 0, right: 0,
        height: gardenHeight * 0.18, backgroundColor: 'rgba(190,225,195,0.35)',
      }} />
      <View style={{
        position: 'absolute' as const, top: gardenHeight * 0.16, left: 0, right: 0,
        height: gardenHeight * 0.14, backgroundColor: 'rgba(200,230,200,0.28)',
      }} />
      <View style={{
        position: 'absolute' as const, top: gardenHeight * 0.22, left: 0, right: 0,
        height: gardenHeight * 0.10, backgroundColor: 'rgba(215,235,205,0.22)',
      }} />
      <View style={{
        position: 'absolute' as const, bottom: 0, left: 0, right: 0,
        height: 30, backgroundColor: 'rgba(30,60,20,0.08)',
      }} />
    </>
  );
});

const StaticSun = React.memo(function StaticSun() {
  const rays = [0, 30, 60, 90, 120, 150];
  return (
    <View style={{ position: 'absolute' as const, top: 8, right: 28, width: 52, height: 52 }}>
      <View style={{
        position: 'absolute' as const, top: -74, left: -74, width: 200, height: 200,
        alignItems: 'center' as const, justifyContent: 'center' as const,
      }}>
        {rays.map((angle) => (
          <View key={angle} style={{
            position: 'absolute' as const, width: 3, height: 160, borderRadius: 1.5,
            backgroundColor: 'rgba(255,240,180,0.5)', transform: [{ rotate: `${angle}deg` }],
          }} />
        ))}
      </View>
      <View style={{
        position: 'absolute' as const, top: -34, left: -34, width: 120, height: 120, borderRadius: 60,
        backgroundColor: 'rgba(255,248,200,0.25)',
      }} />
      <View style={{
        position: 'absolute' as const, top: -14, left: -14, width: 80, height: 80, borderRadius: 40,
        backgroundColor: 'rgba(255,245,180,0.15)',
      }} />
      <View style={{
        width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFEE58',
        position: 'absolute' as const, top: 4, left: 4,
        alignItems: 'center' as const, justifyContent: 'center' as const,
        shadowColor: '#FFD54F', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 14,
        borderWidth: 2, borderColor: '#FFF176',
      }}>
        <View style={{ flexDirection: 'row' as const, gap: 9, marginTop: -3 }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#795548' }} />
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#795548' }} />
        </View>
        <View style={{ flexDirection: 'row' as const, gap: 14, marginTop: 2 }}>
          <View style={{ width: 7, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,138,101,0.4)' }} />
          <View style={{ width: 7, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,138,101,0.4)' }} />
        </View>
        <View style={{
          width: 12, height: 6, borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
          borderWidth: 1.5, borderTopWidth: 0, borderColor: '#795548', backgroundColor: 'transparent', marginTop: 1,
        }} />
      </View>
    </View>
  );
});

const SingleCloud = React.memo(function SingleCloud({ data, screenWidth }: { data: typeof CLOUD_DATA[0]; screenWidth: number }) {
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startX = -data.w + (screenWidth + data.w) * data.startFrac;
    const remainFrac = 1 - data.startFrac;
    translateX.setValue(startX);
    Animated.timing(translateX, {
      toValue: screenWidth + 20,
      duration: data.duration * remainFrac,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(() => {
      translateX.setValue(-data.w - 20);
      Animated.loop(
        Animated.timing(translateX, { toValue: screenWidth + 20, duration: data.duration, easing: Easing.linear, useNativeDriver: true })
      ).start();
    });
  }, [translateX, data, screenWidth]);

  const bumpH = data.h * 1.3;
  const padX = data.w * 0.3;
  const padY = data.h * 0.5;
  return (
    <Animated.View style={{
      position: 'absolute' as const, top: data.y - padY, width: data.w + padX * 2, height: data.h + bumpH * 0.5 + padY * 2,
      transform: [{ translateX }],
    }}>
      <View style={{
        position: 'absolute' as const, bottom: padY, left: padX * 0.3, right: padX * 0.3, height: data.h * 1.4,
        borderRadius: data.h, backgroundColor: 'rgba(255,255,255,0.7)',
      }} />
      <View style={{
        position: 'absolute' as const, bottom: padY, left: padX, right: padX, height: data.h,
        borderRadius: data.h / 2, backgroundColor: 'rgba(255,255,255,0.85)',
      }} />
      <View style={{
        position: 'absolute' as const, bottom: padY + data.h * 0.25, left: padX + data.w * 0.1,
        width: bumpH * 1.2, height: bumpH * 1.2, borderRadius: bumpH * 0.6, backgroundColor: 'rgba(255,255,255,0.75)',
      }} />
      <View style={{
        position: 'absolute' as const, bottom: padY + data.h * 0.2, left: padX + data.w * 0.42,
        width: bumpH * 1.4, height: bumpH * 1.4, borderRadius: bumpH * 0.7, backgroundColor: 'rgba(255,255,255,0.7)',
      }} />
      <View style={{
        position: 'absolute' as const, bottom: padY - data.h * 0.15, left: padX * 0.5, right: padX * 0.5, height: data.h * 0.8,
        borderRadius: data.h, backgroundColor: 'rgba(255,255,255,0.5)',
      }} />
    </Animated.View>
  );
});

const CloudsLayer = React.memo(function CloudsLayer({ screenWidth }: { screenWidth: number }) {
  return <>{CLOUD_DATA.map((c, i) => <SingleCloud key={i} data={c} screenWidth={screenWidth} />)}</>;
});

const BirdShape = React.memo(function BirdShape({ size, color }: { size: number; color: string }) {
  const wingW = size * 0.48;
  const wingH = size * 0.22;
  return (
    <View style={{ width: size, height: size * 0.5, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' }}>
      <View style={{
        width: wingW, height: wingH,
        borderTopLeftRadius: wingW,
        borderTopRightRadius: wingW * 0.2,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        backgroundColor: 'transparent',
        borderTopWidth: 2.5,
        borderLeftWidth: 1.5,
        borderColor: color,
        transform: [{ rotate: '-15deg' }],
        marginRight: -2,
      }} />
      <View style={{
        width: wingW, height: wingH,
        borderTopLeftRadius: wingW * 0.2,
        borderTopRightRadius: wingW,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        backgroundColor: 'transparent',
        borderTopWidth: 2.5,
        borderRightWidth: 1.5,
        borderColor: color,
        transform: [{ rotate: '15deg' }],
        marginLeft: -2,
      }} />
    </View>
  );
});

const FlyingBirds = React.memo(function FlyingBirds({ screenWidth }: { screenWidth: number }) {
  const bird1X = useRef(new Animated.Value(-30)).current;
  const bird2X = useRef(new Animated.Value(-30)).current;
  const bird3X = useRef(new Animated.Value(-30)).current;

  useEffect(() => {
    const animateBird = (val: Animated.Value, fromRight: boolean, duration: number, delay: number, pause: number) => {
      const go = () => {
        val.setValue(fromRight ? screenWidth + 40 : -50);
        Animated.timing(val, {
          toValue: fromRight ? -50 : screenWidth + 40,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start(() => {
          setTimeout(go, pause + Math.random() * 5000);
        });
      };
      setTimeout(go, delay);
    };

    animateBird(bird1X, true, 11000, 1000, 9000);
    animateBird(bird2X, false, 14000, 5000, 12000);
    animateBird(bird3X, true, 9000, 10000, 15000);
  }, [bird1X, bird2X, bird3X, screenWidth]);

  return (
    <>
      <Animated.View style={{ position: 'absolute' as const, top: 22, transform: [{ translateX: bird1X }] }} pointerEvents="none">
        <BirdShape size={22} color="rgba(60,60,80,0.7)" />
      </Animated.View>
      <Animated.View style={{ position: 'absolute' as const, top: 48, transform: [{ translateX: bird2X }] }} pointerEvents="none">
        <BirdShape size={16} color="rgba(70,70,90,0.5)" />
      </Animated.View>
      <Animated.View style={{ position: 'absolute' as const, top: 35, transform: [{ translateX: bird3X }] }} pointerEvents="none">
        <BirdShape size={13} color="rgba(80,80,100,0.4)" />
      </Animated.View>
    </>
  );
});

const ButterflyShape = React.memo(function ButterflyShape({ size, color1, color2 }: { size: number; color1: string; color2: string }) {
  const wingW = size * 0.4;
  const wingH = size * 0.5;
  const smallWingH = size * 0.32;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ alignItems: 'flex-end', marginRight: -1 }}>
          <View style={{ width: wingW, height: wingH, borderRadius: wingW * 0.8, backgroundColor: color1, marginBottom: -3, transform: [{ rotate: '-10deg' }] }} />
          <View style={{ width: wingW * 0.75, height: smallWingH, borderRadius: wingW * 0.6, backgroundColor: color2, transform: [{ rotate: '-5deg' }] }} />
        </View>
        <View style={{ width: 2, height: size * 0.55, borderRadius: 1, backgroundColor: 'rgba(80,60,40,0.8)' }} />
        <View style={{ alignItems: 'flex-start', marginLeft: -1 }}>
          <View style={{ width: wingW, height: wingH, borderRadius: wingW * 0.8, backgroundColor: color1, marginBottom: -3, transform: [{ rotate: '10deg' }] }} />
          <View style={{ width: wingW * 0.75, height: smallWingH, borderRadius: wingW * 0.6, backgroundColor: color2, transform: [{ rotate: '5deg' }] }} />
        </View>
      </View>
    </View>
  );
});

const LadybugShape = React.memo(function LadybugShape({ size }: { size: number }) {
  const dotSize = size * 0.14;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.7, height: size * 0.6, borderRadius: size * 0.35, backgroundColor: '#E53935', overflow: 'hidden' }}>
        <View style={{ position: 'absolute' as const, top: 0, left: '50%', marginLeft: -0.8, width: 1.6, height: '100%', backgroundColor: 'rgba(30,30,30,0.7)' }} />
        <View style={{ position: 'absolute' as const, top: size * 0.1, left: size * 0.1, width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: 'rgba(20,20,20,0.8)' }} />
        <View style={{ position: 'absolute' as const, top: size * 0.1, right: size * 0.1, width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: 'rgba(20,20,20,0.8)' }} />
        <View style={{ position: 'absolute' as const, top: size * 0.3, left: size * 0.06, width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: 'rgba(20,20,20,0.8)' }} />
        <View style={{ position: 'absolute' as const, top: size * 0.3, right: size * 0.06, width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: 'rgba(20,20,20,0.8)' }} />
      </View>
      <View style={{ position: 'absolute' as const, top: size * 0.12, width: size * 0.25, height: size * 0.22, borderRadius: size * 0.12, backgroundColor: 'rgba(30,30,30,0.9)' }} />
    </View>
  );
});

const BeeShape = React.memo(function BeeShape({ size }: { size: number }) {
  const bodyW = size * 0.5;
  const bodyH = size * 0.35;
  const wingW = size * 0.3;
  const wingH = size * 0.25;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute' as const, top: size * 0.12, left: size * 0.18, width: wingW, height: wingH, borderRadius: wingH, backgroundColor: 'rgba(220,240,255,0.6)', transform: [{ rotate: '-20deg' }] }} />
      <View style={{ position: 'absolute' as const, top: size * 0.12, right: size * 0.18, width: wingW, height: wingH, borderRadius: wingH, backgroundColor: 'rgba(220,240,255,0.6)', transform: [{ rotate: '20deg' }] }} />
      <View style={{ width: bodyW, height: bodyH, borderRadius: bodyH / 2, backgroundColor: '#FDD835', overflow: 'hidden', flexDirection: 'row' }}>
        <View style={{ width: '33%', height: '100%', backgroundColor: '#FDD835' }} />
        <View style={{ width: '20%', height: '100%', backgroundColor: 'rgba(30,30,30,0.85)' }} />
        <View style={{ width: '27%', height: '100%', backgroundColor: '#FDD835' }} />
        <View style={{ width: '20%', height: '100%', backgroundColor: 'rgba(30,30,30,0.85)' }} />
      </View>
    </View>
  );
});

const FloatingInsects = React.memo(function FloatingInsects({ screenWidth, gardenHeight }: { screenWidth: number; gardenHeight: number }) {
  const bug1X = useRef(new Animated.Value(0)).current;
  const bug1Y = useRef(new Animated.Value(0)).current;
  const bug2X = useRef(new Animated.Value(0)).current;
  const bug2Y = useRef(new Animated.Value(0)).current;
  const bug3X = useRef(new Animated.Value(0)).current;
  const bug3Y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(bug1X, { toValue: 35, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bug1X, { toValue: -25, duration: 3800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bug1X, { toValue: 12, duration: 2800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(bug1Y, { toValue: -18, duration: 2700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bug1Y, { toValue: 12, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(bug2X, { toValue: 22, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bug2X, { toValue: -18, duration: 4800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(bug2Y, { toValue: -12, duration: 3800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bug2Y, { toValue: 10, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(bug3X, { toValue: 20, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bug3X, { toValue: -24, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bug3X, { toValue: 8, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(bug3Y, { toValue: -14, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bug3Y, { toValue: 10, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bug3Y, { toValue: -6, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, [bug1X, bug1Y, bug2X, bug2Y, bug3X, bug3Y]);

  const mid = gardenHeight * 0.55;
  return (
    <>
      <Animated.View style={{ position: 'absolute' as const, top: mid - 25, left: screenWidth * 0.22, transform: [{ translateX: bug1X }, { translateY: bug1Y }] }} pointerEvents="none">
        <ButterflyShape size={24} color1="rgba(180,130,220,0.7)" color2="rgba(150,100,200,0.5)" />
      </Animated.View>
      <Animated.View style={{ position: 'absolute' as const, top: mid + 25, left: screenWidth * 0.68, transform: [{ translateX: bug2X }, { translateY: bug2Y }] }} pointerEvents="none">
        <LadybugShape size={16} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute' as const, top: mid - 5, left: screenWidth * 0.48, transform: [{ translateX: bug3X }, { translateY: bug3Y }] }} pointerEvents="none">
        <BeeShape size={20} />
      </Animated.View>
    </>
  );
});

const StaticSparkles = React.memo(function StaticSparkles({ screenWidth, gardenHeight }: { screenWidth: number; gardenHeight: number }) {
  const sparkleData = useMemo(() =>
    Array.from({ length: 4 }, (_, i) => ({
      x: screenWidth * 0.2 + seededRand(i * 31) * screenWidth * 0.6,
      y: gardenHeight * 0.35 + seededRand(i * 37) * gardenHeight * 0.45,
      char: i % 2 === 0 ? '✦' : '✧',
      opacity: 0.3 + seededRand(i * 41) * 0.4,
    }))
  , [screenWidth, gardenHeight]);

  return (
    <>
      {sparkleData.map((s, i) => (
        <View key={i} style={{
          position: 'absolute' as const, left: s.x, top: s.y, opacity: s.opacity,
        }}>
          <ScaledText size={13} color="#FFD700">{s.char}</ScaledText>
        </View>
      ))}
    </>
  );
});

const TreesAndGrassDecor = React.memo(function TreesAndGrassDecor({ screenWidth, gardenHeight }: { screenWidth: number; gardenHeight: number }) {
  const ratio = gardenHeight / GARDEN_HEIGHT;
  const treeData = useMemo(() => getTreeData(screenWidth, ratio), [screenWidth, ratio]);
  const grassSprites = useMemo(() => getGrassSprites(screenWidth, ratio), [screenWidth, ratio]);

  return (
    <>
      {treeData.map((t, i) => (
        <View key={`tree-${i}`} style={{ position: 'absolute' as const, left: t.left, top: t.top, opacity: t.opacity }}>
          <ScaledText size={t.size}>{t.emoji}</ScaledText>
        </View>
      ))}
      {grassSprites.map((g, i) => (
        <View key={`grass-${i}`} style={{ position: 'absolute' as const, left: g.left, top: g.top }}>
          <ScaledText size={g.size}>{g.emoji}</ScaledText>
        </View>
      ))}
    </>
  );
});

function PlantedFlower({ flower, flowerType, row, slot }: {
  flower: PatientFlower;
  flowerType: FlowerType;
  row: number;
  slot: number;
}) {
  const swayAnim = useRef(new Animated.Value(0)).current;
  const popAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(popAnim, { toValue: 1, friction: 5, tension: 50, useNativeDriver: true }).start();

    const swayDuration = 1800 + seededRand(flower.grid_position * 17) * 1200;
    const delay = seededRand(flower.grid_position * 23) * 800;

    const timer = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(swayAnim, { toValue: 1, duration: swayDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(swayAnim, { toValue: -1, duration: swayDuration * 1.1, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(swayAnim, { toValue: 0, duration: swayDuration * 0.9, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [swayAnim, popAnim, flower.grid_position]);

  const swayAmplitude = 2.5 + (row / (GRID_ROWS - 1)) * 1.5;
  const rotate = swayAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: [`-${swayAmplitude}deg`, '0deg', `${swayAmplitude}deg`] });
  const translateX = swayAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: [-1.5, 0, 1.5] });

  const sizeVariation = ((slot % 7) * 0.12);
  const flowerSize = 58 + (slot % 3 === 0 ? 16 : slot % 3 === 1 ? 10 : 0) + sizeVariation;
  const shadowWidth = flowerSize * 0.65;
  const rowFrac = row / (GRID_ROWS - 1);
  const shadowOpacity = 0.15 + rowFrac * 0.12;
  const rarity = flowerType.rarity || 'common';
  const rarityInfo = RARITY_COLORS[rarity] || RARITY_COLORS.common;
  const glowSize = flowerSize * 1.3;

  const totalHeight = flowerSize + 16;
  const liftOffset = -(flowerSize * 0.3);

  return (
    <View style={{
      alignItems: 'center' as const,
      width: flowerSize + 14,
      height: totalHeight,
      transform: [
        { translateY: liftOffset },
      ],
    }}>
      <View style={{
        position: 'absolute' as const,
        top: 0,
        width: glowSize,
        height: glowSize * 0.6,
        borderRadius: glowSize / 2,
        backgroundColor: rarityInfo.glow + '18',
        alignSelf: 'center' as const,
      }} />
      <Animated.View style={{
        position: 'absolute' as const,
        top: 2,
        alignItems: 'center' as const,
        transform: [
          { rotate },
          { translateX },
          { scale: popAnim },
        ],
      }}>
        <Image
          source={{ uri: flowerType.image_url }}
          style={{
            width: flowerSize,
            height: flowerSize,
          }}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </Animated.View>
      <View style={{
        position: 'absolute' as const,
        bottom: 0,
        width: shadowWidth,
        height: 5,
        borderRadius: shadowWidth / 2,
        backgroundColor: `rgba(40,25,10,${shadowOpacity})`,
        transform: [{ scaleX: 1.4 }, { scaleY: 0.5 }],
      }} />
    </View>
  );
}

const MemoPlantedFlower = React.memo(PlantedFlower);

const SoilGrid = React.memo(function SoilGrid({ flowers, flowerTypeMap, onFlowerPress, onFlowerLongPress, draggingFlowerId, screenWidth }: {
  flowers: PatientFlower[];
  flowerTypeMap: Record<string, FlowerType>;
  onFlowerPress: (f: PatientFlower) => void;
  onFlowerLongPress: (f: PatientFlower, e: GestureResponderEvent) => void;
  draggingFlowerId: string | null;
  screenWidth: number;
}) {
  const flowerBySlot = useMemo(() => {
    const map: Record<number, PatientFlower> = {};
    flowers.forEach((f) => {
      if (f.position_x == null && f.position_y == null) {
        map[f.grid_position] = f;
      }
    });
    return map;
  }, [flowers]);

  const slots = useMemo(() => Array.from({ length: TOTAL_SLOTS }, (_, idx) => idx), []);

  return (
    <View
      style={{
        position: 'absolute' as const,
        bottom: 28,
        left: (screenWidth - GRID_W) / 2,
        width: GRID_W,
        height: GRID_H,
        transform: [],
      }}
      removeClippedSubviews={false}
    >
      {slots.map((idx) => {
        const col = idx % GRID_COLS;
        const row = Math.floor(idx / GRID_COLS);
        const flower = flowerBySlot[idx];
        const isBeingDragged = flower?.id === draggingFlowerId;
        const ft = flower && !isBeingDragged ? (flower.flower_types || flowerTypeMap[flower.flower_type_id]) : undefined;
        const hasFlower = !!flower && !!ft && !isBeingDragged;
        const isEvenRow = row % 2 === 0;
        const offsetX = isEvenRow ? -7 : 0;
        const cellGrass = CELL_GRASS[idx];

        return (
          <TouchableOpacity
            key={idx}
            activeOpacity={hasFlower ? 0.7 : 1}
            onPress={hasFlower ? () => onFlowerPress(flower) : undefined}
            onLongPress={hasFlower ? (e) => onFlowerLongPress(flower, e) : undefined}
            delayLongPress={400}
            style={{
              position: 'absolute' as const,
              left: col * CELL_W + offsetX,
              top: row * CELL_H,
              width: CELL_W,
              height: CELL_H,
              alignItems: 'center' as const,
              justifyContent: 'center' as const,
            }}
          >
            <View style={[
              gardenStyles.soilCell,
              hasFlower ? gardenStyles.soilCellOccupied : gardenStyles.soilCellEmpty,
            ]}>
              <View style={gardenStyles.soilHighlight} />
              {cellGrass.map((g, gi) => (
                <View key={gi} style={{ position: 'absolute' as const, left: g.dx, top: g.dy }}>
                  <ScaledText size={g.size}>{g.emoji}</ScaledText>
                </View>
              ))}
            </View>
            {hasFlower && (
              <View style={{
                position: 'absolute' as const, zIndex: 9,
                width: 38 + seededRand(idx * 11) * 24,
                height: 38 + seededRand(idx * 11) * 24,
                borderRadius: 30,
                backgroundColor: 'rgba(255,255,240,0.25)',
              }} />
            )}
            {hasFlower && ft && (
              <View style={{ position: 'absolute' as const, zIndex: 10 }}>
                <MemoPlantedFlower flower={flower} flowerType={ft} row={row} slot={idx} />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

const PositionedFlowersLayer = React.memo(function PositionedFlowersLayer({
  flowers, flowerTypeMap, onFlowerPress, onFlowerLongPress, draggingFlowerId, screenWidth, gardenHeight,
}: {
  flowers: PatientFlower[];
  flowerTypeMap: Record<string, FlowerType>;
  onFlowerPress: (f: PatientFlower) => void;
  onFlowerLongPress: (f: PatientFlower, e: GestureResponderEvent) => void;
  draggingFlowerId: string | null;
  screenWidth: number;
  gardenHeight: number;
}) {
  const positioned = useMemo(
    () => flowers.filter(f => f.position_x != null && f.position_y != null && f.id !== draggingFlowerId),
    [flowers, draggingFlowerId]
  );

  if (positioned.length === 0) return null;

  return (
    <>
      {positioned.map((flower) => {
        const ft = flower.flower_types || flowerTypeMap[flower.flower_type_id];
        if (!ft) return null;
        const left = (flower.position_x ?? 0) * screenWidth;
        const top = (flower.position_y ?? 0) * gardenHeight;
        const row = Math.floor(flower.grid_position / GRID_COLS);
        const slot = flower.grid_position;
        return (
          <TouchableOpacity
            key={flower.id}
            activeOpacity={0.7}
            onPress={() => onFlowerPress(flower)}
            onLongPress={(e) => onFlowerLongPress(flower, e)}
            delayLongPress={400}
            style={{
              position: 'absolute' as const,
              left: left - 35,
              top: top - 40,
              zIndex: 15,
            }}
          >
            <MemoPlantedFlower flower={flower} flowerType={ft} row={row} slot={slot} />
          </TouchableOpacity>
        );
      })}
    </>
  );
});

const FenceRow = React.memo(function FenceRow({ screenWidth }: { screenWidth: number }) {
  const postCount = 18;
  const spacing = screenWidth / (postCount + 1);
  return (
    <View style={{ position: 'absolute' as const, bottom: 0, left: 0, right: 0, height: 28 }}>
      <View style={{
        position: 'absolute' as const, bottom: 10, left: 0, right: 0, height: 2.5,
        backgroundColor: '#C69C4E', opacity: 0.3,
      }} />
      {Array.from({ length: postCount }, (_, i) => {
        const tall = i % 2 === 0 ? 20 : 15;
        return (
          <View key={i} style={{
            position: 'absolute' as const, bottom: 6, left: spacing * (i + 1) - 4.5,
            width: 9, height: tall, borderRadius: 2,
            backgroundColor: '#D7A54A', opacity: 0.5,
          }}>
            <View style={{
              position: 'absolute' as const, top: 0, left: 0, right: 0, height: tall * 0.4,
              backgroundColor: '#BF8C30', borderTopLeftRadius: 2, borderTopRightRadius: 2,
            }} />
          </View>
        );
      })}
    </View>
  );
});

const GentleRain = React.memo(function GentleRain({ screenWidth, gardenHeight }: { screenWidth: number; gardenHeight: number }) {
  const [isRaining, setIsRaining] = useState<boolean>(false);
  const rainOpacity = useRef(new Animated.Value(0)).current;
  const dropAnims = useRef(
    Array.from({ length: 18 }, () => new Animated.Value(-20))
  ).current;
  const dropPositions = useRef(
    Array.from({ length: 18 }, (_, i) => ((i * 67 + 23) % 100) / 100)
  ).current;
  const isRainingRef = useRef(false);

  useEffect(() => {
    const cycle = () => {
      const shouldRain = Math.random() < 0.4;
      if (shouldRain) {
        isRainingRef.current = true;
        setIsRaining(true);
        Animated.timing(rainOpacity, { toValue: 1, duration: 2000, useNativeDriver: true }).start();
        setTimeout(() => {
          Animated.timing(rainOpacity, { toValue: 0, duration: 2000, useNativeDriver: true }).start(() => {
            isRainingRef.current = false;
            setIsRaining(false);
          });
        }, 8000 + Math.random() * 7000);
      }
      setTimeout(cycle, 30000 + Math.random() * 30000);
    };
    setTimeout(cycle, 10000 + Math.random() * 10000);
  }, [rainOpacity]);

  useEffect(() => {
    if (!isRaining) return;
    dropAnims.forEach((anim, i) => {
      const startDrop = () => {
        anim.setValue(-20);
        Animated.timing(anim, {
          toValue: gardenHeight + 20,
          duration: 800 + (i % 5) * 150,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start(() => {
          if (isRainingRef.current) setTimeout(startDrop, Math.random() * 400);
        });
      };
      setTimeout(startDrop, i * 120 + Math.random() * 300);
    });
  }, [isRaining, dropAnims, gardenHeight]);

  if (!isRaining) return null;

  return (
    <Animated.View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, opacity: rainOpacity }} pointerEvents="none">
      {dropAnims.map((anim, i) => (
        <Animated.View
          key={`rain-${i}`}
          style={{
            position: 'absolute' as const,
            left: dropPositions[i] * screenWidth,
            width: 1.5,
            height: 12 + (i % 4) * 3,
            borderRadius: 1,
            backgroundColor: 'rgba(180,200,220,0.35)',
            transform: [{ translateY: anim }, { rotate: '8deg' }],
          }}
        />
      ))}
    </Animated.View>
  );
});

const MemoGardenScene = React.memo(function GardenScene({ flowers, flowerTypeMap, onFlowerPress, onFlowerLongPress, draggingFlowerId, screenWidth, gardenHeight }: {
  flowers: PatientFlower[];
  flowerTypeMap: Record<string, FlowerType>;
  onFlowerPress: (f: PatientFlower) => void;
  onFlowerLongPress: (f: PatientFlower, e: GestureResponderEvent) => void;
  draggingFlowerId: string | null;
  screenWidth: number;
  gardenHeight: number;
}) {
  return (
    <View style={{ width: screenWidth, height: gardenHeight, backgroundColor: '#87CEEB', overflow: 'hidden' }}>
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '100%', backgroundColor: '#87CEEB' }} />
      <View style={{ position: 'absolute' as const, top: '30%', left: 0, right: 0, bottom: 0, backgroundColor: '#A8D8EA' }} />
      <View style={{ position: 'absolute' as const, top: '50%', left: 0, right: 0, bottom: 0, backgroundColor: '#C5E8D5' }} />
      <View style={{ position: 'absolute' as const, top: '60%', left: 0, right: 0, bottom: 0, backgroundColor: '#7CB342' }} />
      <View style={{ position: 'absolute' as const, top: '70%', left: 0, right: 0, bottom: 0, backgroundColor: '#558B2F' }} />
      <View style={{ position: 'absolute' as const, top: '85%', left: 0, right: 0, bottom: 0, backgroundColor: '#33691E' }} />

      <StaticSun />
      <CloudsLayer screenWidth={screenWidth} />
      <FlyingBirds screenWidth={screenWidth} />
      <Mountains gardenHeight={gardenHeight} />
      <RollingHills gardenHeight={gardenHeight} />
      <TreesAndGrassDecor screenWidth={screenWidth} gardenHeight={gardenHeight} />
      <FloatingInsects screenWidth={screenWidth} gardenHeight={gardenHeight} />

      <SoilGrid flowers={flowers} flowerTypeMap={flowerTypeMap} onFlowerPress={onFlowerPress} onFlowerLongPress={onFlowerLongPress} draggingFlowerId={draggingFlowerId} screenWidth={screenWidth} />
      <PositionedFlowersLayer flowers={flowers} flowerTypeMap={flowerTypeMap} onFlowerPress={onFlowerPress} onFlowerLongPress={onFlowerLongPress} draggingFlowerId={draggingFlowerId} screenWidth={screenWidth} gardenHeight={gardenHeight} />
      <StaticSparkles screenWidth={screenWidth} gardenHeight={gardenHeight} />
      <FenceRow screenWidth={screenWidth} />
      <GentleRain screenWidth={screenWidth} gardenHeight={gardenHeight} />
    </View>
  );
});

function CollectionCard({ group, index, isZh, onToggleExpand }: {
  group: GroupedFlower;
  index: number;
  isZh: boolean;
  onToggleExpand: () => void;
}) {
  const popAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(popAnim, {
      toValue: 1, friction: 6, tension: 50, delay: index * 60, useNativeDriver: true,
    }).start();
  }, [popAnim, index]);

  const scale = popAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const { flowerType, count } = group;
  const rarity = flowerType.rarity || 'common';
  const rarityInfo = RARITY_COLORS[rarity] || RARITY_COLORS.common;

  return (
    <Animated.View style={[styles.collectionCard, { transform: [{ scale }], opacity: popAnim }]}>
      <TouchableOpacity onPress={onToggleExpand} activeOpacity={0.8} style={styles.collectionCardInner}>
        <View style={[styles.cardGlow, { backgroundColor: rarityInfo.glow + '18' }]} />
        {count > 1 && (
          <View style={styles.countBadge}>
            <ScaledText size={10} weight="bold" color="#FFF">×{count}</ScaledText>
          </View>
        )}
        <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, width: '100%' }}>
          <View style={[styles.cardImageBg, { backgroundColor: rarityInfo.bg }]}>
            <Image source={{ uri: flowerType.image_url }} style={styles.cardFlowerImage} contentFit="contain" cachePolicy="memory-disk" />
          </View>
          <View style={{ flex: 1 }}>
            <ScaledText size={12} weight="600" color={Colors.textPrimary} numberOfLines={1}>
              {isZh ? (flowerType.name_zh || flowerType.name_en) : flowerType.name_en}
            </ScaledText>
            <View style={[styles.cardRarityBadge, { backgroundColor: rarityInfo.bg }]}>
              <View style={[styles.cardRarityDot, { backgroundColor: rarityInfo.dot }]} />
              <ScaledText size={9} weight="700" color={rarityInfo.dot}>
                {rarity.charAt(0).toUpperCase() + rarity.slice(1)}
              </ScaledText>
            </View>
          </View>
        </View>

      </TouchableOpacity>
    </Animated.View>
  );
}

const MemoCollectionCard = React.memo(CollectionCard);

const CollectionProgress = React.memo(function CollectionProgress({ count, total, isZh }: { count: number; total: number; isZh: boolean }) {
  const progress = total > 0 ? count / total : 0;
  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressHeader}>
        <ScaledText size={13} weight="700" color="#5D4037">
          🌸 {count}/{total}
        </ScaledText>
        <ScaledText size={11} weight="600" color="#8D6E63">
          {isZh ? '花田收藏' : 'Collection'}
        </ScaledText>
      </View>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${Math.min(100, progress * 100)}%` }]} />
      </View>
    </View>
  );
});

export default function FlowerYieldScreen() {
  const { patientId, patientName, language, flowersJustStolen, clearFlowersStolen } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const gardenHeight = Math.min(GARDEN_HEIGHT, Math.max(350, screenHeight * 0.6));

  const [selectedFlower, setSelectedFlower] = useState<PatientFlower | null>(null);
  const [theftModalVisible, setTheftModalVisible] = useState<boolean>(false);
  const [collectionExpanded, setCollectionExpanded] = useState<boolean>(true);

  const [manageModalVisible, setManageModalVisible] = useState<boolean>(false);
  const manageScaleAnim = useRef(new Animated.Value(0)).current;

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [draggingFlowerId, setDraggingFlowerId] = useState<string | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const draggingFlowerRef = useRef<PatientFlower | null>(null);
  const dragPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragScale = useRef(new Animated.Value(1)).current;
  const gardenContainerRef = useRef<View>(null);
  const gardenLayoutRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const [showDragHint, setShowDragHint] = useState<boolean>(false);
  const dragHintOpacity = useRef(new Animated.Value(0)).current;
  const dragHintTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  const patientIdRef = useRef(patientId);
  patientIdRef.current = patientId;

  const gardenPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => isDraggingRef.current,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: () => isDraggingRef.current,
      onPanResponderTerminationRequest: () => !isDraggingRef.current,
      onPanResponderGrant: () => {},
      onPanResponderMove: (evt) => {
        if (!isDraggingRef.current) return;
        const gl = gardenLayoutRef.current;
        dragPosition.setValue({
          x: evt.nativeEvent.pageX - gl.x - 30,
          y: evt.nativeEvent.pageY - gl.y - 40,
        });
      },
      onPanResponderRelease: (evt) => {
        if (!isDraggingRef.current || !draggingFlowerRef.current) return;
        const gl = gardenLayoutRef.current;
        const relX = evt.nativeEvent.pageX - gl.x;
        const relY = evt.nativeEvent.pageY - gl.y;
        const posX = Math.max(0.02, Math.min(0.98, relX / (gl.width || 1)));
        const posY = Math.max(0.02, Math.min(0.98, relY / (gl.height || 1)));
        const flowerId = draggingFlowerRef.current.id;
        log('[FlowerYield] Dropping flower at:', posX.toFixed(3), posY.toFixed(3));

        queryClientRef.current?.setQueryData<PatientFlower[]>(
          ['patientFlowers', patientIdRef.current],
          (old) => (old || []).map(f => f.id === flowerId ? { ...f, position_x: posX, position_y: posY } : f)
        );

        void supabase
          .from('patient_flowers')
          .update({ position_x: posX, position_y: posY })
          .eq('id', flowerId)
          .then(({ error }) => {
            if (error) {
              log('[FlowerYield] Error saving flower position:', error);
              void queryClientRef.current?.invalidateQueries({ queryKey: ['patientFlowers', patientIdRef.current] });
            }
          });

        Animated.spring(dragScale, { toValue: 1, friction: 8, useNativeDriver: false }).start();
        isDraggingRef.current = false;
        draggingFlowerRef.current = null;
        setIsDragging(false);
        setDraggingFlowerId(null);
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragScale, { toValue: 1, friction: 8, useNativeDriver: false }).start();
        isDraggingRef.current = false;
        draggingFlowerRef.current = null;
        setIsDragging(false);
        setDraggingFlowerId(null);
      },
    })
  ).current;

  const isZh = language === 'zh_hant' || language === 'zh_hans';

  useEffect(() => {
    void initAudio().then(() => {
      void playZenAmbient();
      void playZenChime();
    });
    return () => {
      void stopZenAmbient();
    };
  }, []);

  const patientDataQuery = useQuery({
    queryKey: ['gardenPatientData', patientId],
    queryFn: async () => {
      log('[FlowerYield] Fetching patient garden data for:', patientId);
      const { data, error } = await supabase
        .from('patients')
        .select('consecutive_inactive_days, stars_available, fires_available')
        .eq('id', patientId!)
        .single();
      if (error) { log('[FlowerYield] Patient data fetch error:', error); throw error; }
      return data || { consecutive_inactive_days: 0, stars_available: 0, fires_available: 0 };
    },
    enabled: !!patientId,
    staleTime: 30 * 1000,
  });

  const flowersQuery = useQuery({
    queryKey: ['patientFlowers', patientId],
    queryFn: async () => {
      log('[FlowerYield] Fetching patient flowers for:', patientId);
      const { data, error } = await supabase
        .from('patient_flowers')
        .select('*, flower_types(*)')
        .eq('patient_id', patientId!)
        .eq('is_stolen', false)
        .order('grid_position');
      if (error) { log('[FlowerYield] Flowers fetch error:', error); throw error; }
      return (data || []) as PatientFlower[];
    },
    enabled: !!patientId,
    staleTime: 30 * 1000,
  });

  const flowerTypesQuery = useQuery({
    queryKey: ['flowerTypes'],
    queryFn: async () => {
      log('[FlowerYield] Fetching flower types');
      const { data, error } = await supabase.from('flower_types').select('*');
      if (error) { log('[FlowerYield] Flower types fetch error:', error); throw error; }
      return (data || []) as FlowerType[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const flowerTypeMap = useMemo(() => {
    const map: Record<string, FlowerType> = {};
    (flowerTypesQuery.data || []).forEach((ft) => { map[ft.id] = ft; });
    return map;
  }, [flowerTypesQuery.data]);

  useEffect(() => {
    if (flowersJustStolen > 0) {
      setTheftModalVisible(true);
      void queryClient.invalidateQueries({ queryKey: ['patientFlowers', patientId] });
      void queryClient.invalidateQueries({ queryKey: ['gardenPatientData', patientId] });
    }
  }, [flowersJustStolen, queryClient, patientId]);

  const patientData = patientDataQuery.data;
  const allFlowers = useMemo(() => flowersQuery.data || [], [flowersQuery.data]);
  const displayedFlowers = useMemo(() => allFlowers.filter(f => f.is_displayed !== false), [allFlowers]);
  const isLoading = patientDataQuery.isLoading || flowersQuery.isLoading || flowerTypesQuery.isLoading;

  const groupedFlowers = useMemo(() => {
    const groups: Record<string, GroupedFlower> = {};
    allFlowers.forEach((f) => {
      const ft = f.flower_types || flowerTypeMap[f.flower_type_id];
      if (!ft) return;
      if (!groups[ft.id]) { groups[ft.id] = { flowerType: ft, count: 0, flowers: [] }; }
      groups[ft.id].count += 1;
      groups[ft.id].flowers.push(f);
    });
    return Object.values(groups).sort((a, b) => {
      const ra = RARITY_ORDER[a.flowerType.rarity] ?? 5;
      const rb = RARITY_ORDER[b.flowerType.rarity] ?? 5;
      if (ra !== rb) return ra - rb;
      return b.count - a.count;
    });
  }, [allFlowers, flowerTypeMap]);

  const gardenFlowers = useMemo(() => allFlowers.filter(f => f.is_displayed !== false), [allFlowers]);
  const storageFlowers = useMemo(() => allFlowers.filter(f => f.is_displayed === false), [allFlowers]);

  const displayedCount = useMemo(() => allFlowers.filter(f => f.is_displayed !== false).length, [allFlowers]);
  const totalCount = allFlowers.length;

  const selectedFlowerType = selectedFlower
    ? (selectedFlower.flower_types || flowerTypeMap[selectedFlower.flower_type_id])
    : undefined;

  const selectedFlowerCount = selectedFlowerType
    ? groupedFlowers.find((g) => g.flowerType.id === selectedFlowerType.id)?.count ?? 1
    : 1;

  const handleFlowerPress = useCallback((flower: PatientFlower) => {
    if (isDraggingRef.current) return;
    setSelectedFlower(flower);
  }, []);

  const handleGardenLayout = useCallback(() => {
    if (gardenContainerRef.current) {
      gardenContainerRef.current.measureInWindow((x, y, width, height) => {
        gardenLayoutRef.current = { x: x || 0, y: y || 0, width: width || screenWidth, height: height || gardenHeight };
        log('[FlowerYield] Garden layout measured:', { x, y, width, height });
      });
    }
  }, [screenWidth, gardenHeight]);

  const handleGardenFlowerLongPress = useCallback((flower: PatientFlower, evt: GestureResponderEvent) => {
    if (gardenContainerRef.current) {
      gardenContainerRef.current.measureInWindow((x, y, width, height) => {
        gardenLayoutRef.current = { x: x || 0, y: y || 0, width: width || screenWidth, height: height || gardenHeight };
      });
    }
    isDraggingRef.current = true;
    draggingFlowerRef.current = flower;
    setDraggingFlowerId(flower.id);
    setIsDragging(true);
    const gl = gardenLayoutRef.current;
    dragPosition.setValue({ x: evt.nativeEvent.pageX - gl.x - 30, y: evt.nativeEvent.pageY - gl.y - 40 });
    Animated.spring(dragScale, { toValue: 1.2, friction: 5, tension: 80, useNativeDriver: false }).start();
    try { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
  }, [screenWidth, gardenHeight, dragPosition, dragScale]);

  const handleResetPositions = useCallback(() => {
    Alert.alert(
      isZh ? '重設位置' : 'Reset Positions',
      isZh ? '重設所有花朵位置？' : 'Reset all flower positions to default?',
      [
        { text: isZh ? '取消' : 'Cancel', style: 'cancel' as const },
        {
          text: isZh ? '確認' : 'Reset',
          style: 'destructive' as const,
          onPress: () => {
            queryClient.setQueryData<PatientFlower[]>(
              ['patientFlowers', patientId],
              (old) => (old || []).map(f => ({ ...f, position_x: null, position_y: null }))
            );
            void supabase
              .from('patient_flowers')
              .update({ position_x: null, position_y: null })
              .eq('patient_id', patientId!)
              .eq('is_stolen', false)
              .then(({ error }) => {
                if (error) {
                  log('[FlowerYield] Reset positions error:', error);
                  void queryClient.invalidateQueries({ queryKey: ['patientFlowers', patientId] });
                }
              });
          },
        },
      ]
    );
  }, [isZh, patientId, queryClient]);

  const draggingFlowerData = useMemo(() => {
    if (!draggingFlowerId) return null;
    const flower = displayedFlowers.find(f => f.id === draggingFlowerId);
    if (!flower) return null;
    const ft = flower.flower_types || flowerTypeMap[flower.flower_type_id];
    if (!ft) return null;
    return { flower, flowerType: ft };
  }, [draggingFlowerId, displayedFlowers, flowerTypeMap]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (displayedFlowers.length > 0) {
      AsyncStorage.getItem('flower_drag_hint_shown').then((val) => {
        if (!val) {
          setShowDragHint(true);
          Animated.timing(dragHintOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
          timer = setTimeout(() => {
            Animated.timing(dragHintOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
              setShowDragHint(false);
            });
            AsyncStorage.setItem('flower_drag_hint_shown', 'true').catch(() => {});
          }, 3500);
          dragHintTimerRef.current = timer;
        }
      }).catch(() => {});
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [displayedFlowers.length, dragHintOpacity]);

  const toggleCollection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollectionExpanded((prev) => !prev);
  }, []);



  const openManageModal = useCallback(() => {
    setManageModalVisible(true);
    manageScaleAnim.setValue(0);
    Animated.spring(manageScaleAnim, { toValue: 1, friction: 7, tension: 65, useNativeDriver: true }).start();
  }, [manageScaleAnim]);

  const closeManageModal = useCallback(() => {
    Animated.timing(manageScaleAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setManageModalVisible(false);
    });
  }, [manageScaleAnim]);

  const toggleFlowerDisplayMutation = useMutation({
    mutationFn: async ({ flowerId, newValue }: { flowerId: string; newValue: boolean }) => {
      log('[FlowerYield] Toggling flower display:', flowerId, '->', newValue);
      const { error } = await supabase
        .from('patient_flowers')
        .update({ is_displayed: newValue })
        .eq('id', flowerId);
      if (error) throw error;
      return { flowerId, newValue };
    },
    onMutate: async ({ flowerId, newValue }) => {
      await queryClient.cancelQueries({ queryKey: ['patientFlowers', patientId] });
      const prev = queryClient.getQueryData<PatientFlower[]>(['patientFlowers', patientId]);
      queryClient.setQueryData<PatientFlower[]>(['patientFlowers', patientId], (old) =>
        (old || []).map(f => f.id === flowerId ? { ...f, is_displayed: newValue } : f)
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['patientFlowers', patientId], context.prev);
      }
    },
  });

  const handleToggleIndividual = useCallback((flower: PatientFlower, newValue: boolean) => {
    toggleFlowerDisplayMutation.mutate({ flowerId: flower.id, newValue });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [toggleFlowerDisplayMutation]);

  const [pickedUpId, setPickedUpId] = useState<string | null>(null);
  const pickedUpScaleAnims = useRef<Record<string, Animated.Value>>({}).current;

  const getPickedUpScale = useCallback((id: string) => {
    if (!pickedUpScaleAnims[id]) {
      pickedUpScaleAnims[id] = new Animated.Value(1);
    }
    return pickedUpScaleAnims[id];
  }, [pickedUpScaleAnims]);

  const handleLongPress = useCallback((flower: PatientFlower) => {
    setPickedUpId(flower.id);
    const anim = getPickedUpScale(flower.id);
    Animated.spring(anim, { toValue: 1.15, friction: 5, tension: 100, useNativeDriver: true }).start();
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  }, [getPickedUpScale]);

  const handleLongPressRelease = useCallback((flower: PatientFlower) => {
    if (pickedUpId !== flower.id) return;
    const anim = getPickedUpScale(flower.id);
    Animated.spring(anim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
    setPickedUpId(null);
    const newValue = flower.is_displayed === false;
    handleToggleIndividual(flower, newValue);
  }, [pickedUpId, getPickedUpScale, handleToggleIndividual]);

  const bulkToggleAllMutation = useMutation({
    mutationFn: async (newValue: boolean) => {
      log('[FlowerYield] Bulk toggling all flowers to:', newValue);
      const { error } = await supabase
        .from('patient_flowers')
        .update({ is_displayed: newValue })
        .eq('patient_id', patientId!)
        .eq('is_stolen', false);
      if (error) throw error;
      return newValue;
    },
    onMutate: async (newValue) => {
      await queryClient.cancelQueries({ queryKey: ['patientFlowers', patientId] });
      const prev = queryClient.getQueryData<PatientFlower[]>(['patientFlowers', patientId]);
      queryClient.setQueryData<PatientFlower[]>(['patientFlowers', patientId], (old) =>
        (old || []).map(f => ({ ...f, is_displayed: newValue }))
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['patientFlowers', patientId], context.prev);
      }
    },
  });

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="flower-yield-back">
            <ChevronLeft size={22} color="#5D4037" />
          </TouchableOpacity>
          <View style={styles.woodenSign}>
            <ScaledText size={17} weight="bold" color="#4E342E" numberOfLines={1}>
              {patientName ? (isZh ? `${patientName}的花田` : `${patientName}'s Garden`) : (isZh ? '我的花田' : 'My Garden')}
            </ScaledText>
          </View>
          <TouchableOpacity
            style={styles.manageBtn}
            onPress={handleResetPositions}
            activeOpacity={0.7}
            testID="reset-positions-btn"
          >
            <RotateCcw size={14} color="#5D4037" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.manageBtn}
            onPress={openManageModal}
            activeOpacity={0.7}
            testID="manage-flowers-btn"
          >
            <SlidersHorizontal size={16} color="#5D4037" />
          </TouchableOpacity>
          <View style={styles.headerChips}>
            <View style={styles.resourceChip}>
              <ScaledText size={11} weight="600" color="#B8860B">⭐ {patientData?.stars_available ?? 0}</ScaledText>
            </View>
            <View style={styles.resourceChip}>
              <ScaledText size={11} weight="600" color="#E65100">🔥 {patientData?.fires_available ?? 0}</ScaledText>
            </View>
          </View>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never" scrollEnabled={!isDragging}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <>
              <View
                ref={gardenContainerRef}
                onLayout={handleGardenLayout}
                style={{ height: gardenHeight }}
                {...gardenPanResponder.panHandlers}
              >
                <MemoGardenScene
                  flowers={displayedFlowers}
                  flowerTypeMap={flowerTypeMap}
                  onFlowerPress={handleFlowerPress}
                  onFlowerLongPress={handleGardenFlowerLongPress}
                  draggingFlowerId={draggingFlowerId}
                  screenWidth={screenWidth}
                  gardenHeight={gardenHeight}
                />
                {isDragging && draggingFlowerData && (
                  <Animated.View
                    style={{
                      position: 'absolute' as const,
                      left: dragPosition.x,
                      top: dragPosition.y,
                      zIndex: 999,
                      transform: [{ scale: dragScale }],
                    }}
                    pointerEvents="none"
                  >
                    <View style={styles.dragShadow} />
                    <Image
                      source={{ uri: draggingFlowerData.flowerType.image_url }}
                      style={{ width: 60, height: 60 }}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                  </Animated.View>
                )}
                {showDragHint && (
                  <Animated.View style={[styles.dragHint, { opacity: dragHintOpacity }]} pointerEvents="none">
                    <ScaledText size={12} weight="600" color="#FFF">
                      {isZh ? '✋ 長按花朵可移動！' : '✋ Long-press to move flowers!'}
                    </ScaledText>
                  </Animated.View>
                )}
              </View>

              {displayedFlowers.length === 0 && (
                <View style={styles.emptyHint}>
                  <ScaledText size={14} weight="600" color="#5D4037">
                    {isZh ? '快去抽花裝飾你的花田吧！🌱' : 'Draw flowers to decorate your garden! 🌱'}
                  </ScaledText>
                </View>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.drawBtn} onPress={() => router.push('/gacha-draw')} activeOpacity={0.75} testID="lucky-draw-btn">
                  <Sparkles size={15} color="#FFF" />
                  <ScaledText size={12} weight="700" color="#FFF">
                    {language === 'zh_hant' ? '抽出幸運花朵' : language === 'zh_hans' ? '抽出幸运花朵' : 'Lucky Flower Draw'}
                  </ScaledText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.chestBtn} onPress={() => router.push('/treasure-chest')} activeOpacity={0.75} testID="treasure-chest-btn">
                  <Gift size={14} color="#8B4513" />
                  <ScaledText size={11} weight="700" color="#8B4513">
                    {language === 'zh_hant' ? '我的寶箱' : language === 'zh_hans' ? '我的宝箱' : 'Treasure'}
                  </ScaledText>
                </TouchableOpacity>
              </View>

              <CollectionProgress count={totalCount} total={TOTAL_SLOTS} isZh={isZh} />

              {groupedFlowers.length > 0 && (
                <View style={styles.collectionSection}>
                  <TouchableOpacity onPress={toggleCollection} activeOpacity={0.7} style={styles.collectionHeader}>
                    <ScaledText size={15} weight="bold" color="#5D4037">
                      🌸 {isZh ? '我的花朵收藏' : 'My Collection'}
                    </ScaledText>
                    <View style={styles.collectionToggle}>
                      <ScaledText size={12} color="#8D6E63">
                        {groupedFlowers.length} {isZh ? '種' : 'types'}
                      </ScaledText>
                      {collectionExpanded ? <ChevronUp size={16} color="#8D6E63" /> : <ChevronDown size={16} color="#8D6E63" />}
                    </View>
                  </TouchableOpacity>

                  {collectionExpanded && (
                    <View style={styles.collectionGrid}>
                      {groupedFlowers.map((group, index) => (
                        <MemoCollectionCard
                          key={group.flowerType.id}
                          group={group}
                          index={index}
                          isZh={isZh}
                          onToggleExpand={() => {}}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>

      <Modal visible={theftModalVisible} transparent animationType="fade" onRequestClose={() => setTheftModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.theftModal}>
            <ScaledText size={40}>😢</ScaledText>
            <ScaledText size={18} weight="bold" color="#5D4037" style={{ textAlign: 'center' as const, marginVertical: 12 }}>
              {isZh ? '你的花田被偷了！' : 'Your garden was raided!'}
            </ScaledText>
            <ScaledText size={15} color="#795548" style={{ textAlign: 'center' as const, lineHeight: 22, marginBottom: 20 }}>
              {isZh
                ? `${flowersJustStolen} 朵花因為你沒有練習而被偷走了！\n記得每天做練習保護花田！`
                : `${flowersJustStolen} flower${flowersJustStolen > 1 ? 's were' : ' was'} stolen!\nPractice daily to protect your flowers!`}
            </ScaledText>
            <TouchableOpacity
              style={styles.theftCloseBtn}
              onPress={() => { setTheftModalVisible(false); clearFlowersStolen(); }}
              testID="theft-modal-close"
            >
              <ScaledText size={15} weight="700" color="#FFF">{isZh ? '我知道了' : 'I understand'}</ScaledText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={manageModalVisible} transparent animationType="fade" onRequestClose={closeManageModal}>
        <View style={manageStyles.fullOverlay}>
          <SafeAreaView style={manageStyles.fullContainer}>
            <View style={manageStyles.mHeader}>
              <ScaledText size={18} weight="bold" color="#4E342E">
                {isZh ? '管理花朵' : 'Manage Flowers'}
              </ScaledText>
              <TouchableOpacity onPress={closeManageModal} style={manageStyles.mCloseBtn} testID="manage-close">
                <X size={20} color="#5D4037" />
              </TouchableOpacity>
            </View>

            <View style={manageStyles.mCounterRow}>
              <View style={manageStyles.mCounterChip}>
                <ScaledText size={12} weight="700" color="#558B2F">
                  {isZh ? '花田中' : 'In Garden'}: {displayedCount}
                </ScaledText>
              </View>
              <View style={manageStyles.mCounterDivider} />
              <View style={manageStyles.mCounterChip}>
                <ScaledText size={12} weight="700" color="#8D6E63">
                  {isZh ? '倉庫中' : 'In Storage'}: {totalCount - displayedCount}
                </ScaledText>
              </View>
            </View>

            <View style={manageStyles.mBulkRow}>
              <TouchableOpacity
                style={manageStyles.mBulkBtn}
                onPress={() => bulkToggleAllMutation.mutate(true)}
                activeOpacity={0.7}
              >
                <Eye size={14} color="#558B2F" />
                <ScaledText size={11} weight="600" color="#558B2F">{isZh ? '全部顯示' : 'Show All'}</ScaledText>
              </TouchableOpacity>
              <TouchableOpacity
                style={manageStyles.mBulkBtn}
                onPress={() => bulkToggleAllMutation.mutate(false)}
                activeOpacity={0.7}
              >
                <EyeOff size={14} color="#8D6E63" />
                <ScaledText size={11} weight="600" color="#8D6E63">{isZh ? '全部隱藏' : 'Hide All'}</ScaledText>
              </TouchableOpacity>
            </View>

            <ScrollView style={manageStyles.mScrollBody} showsVerticalScrollIndicator={false}>
              <View style={manageStyles.mSectionHeader}>
                <View style={manageStyles.mSectionDot} />
                <ScaledText size={14} weight="700" color="#558B2F">
                  {isZh ? '🌻 花田中' : '🌻 In Garden'}
                </ScaledText>
                <ScaledText size={11} color="#8D6E63" style={{ marginLeft: 6 }}>
                  ({gardenFlowers.length})
                </ScaledText>
              </View>
              {gardenFlowers.length === 0 ? (
                <View style={manageStyles.mEmptySection}>
                  <ScaledText size={13} color="#A1887F">{isZh ? '花田裡沒有花朵' : 'No flowers in garden'}</ScaledText>
                </View>
              ) : (
                <View style={manageStyles.mGrid}>
                  {gardenFlowers.map((flower) => {
                    const ft = flower.flower_types || flowerTypeMap[flower.flower_type_id];
                    if (!ft) return null;
                    const rarity = ft.rarity || 'common';
                    const rarityInfo = RARITY_COLORS[rarity] || RARITY_COLORS.common;
                    const isPicked = pickedUpId === flower.id;
                    const scaleAnim = getPickedUpScale(flower.id);
                    return (
                      <Animated.View
                        key={flower.id}
                        style={[
                          manageStyles.mFlowerCard,
                          {
                            transform: [{ scale: scaleAnim }],
                            ...(isPicked ? {
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: 0.25,
                              shadowRadius: 8,
                              elevation: 8,
                            } : {}),
                          },
                        ]}
                      >
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onLongPress={() => handleLongPress(flower)}
                          onPressOut={() => { if (pickedUpId === flower.id) handleLongPressRelease(flower); }}
                          delayLongPress={500}
                          style={manageStyles.mFlowerCardInner}
                        >
                          <View style={[manageStyles.mFlowerImgWrap, { backgroundColor: rarityInfo.bg }]}>
                            <Image source={{ uri: ft.image_url }} style={manageStyles.mFlowerImg} contentFit="contain" cachePolicy="memory-disk" />
                          </View>
                          <View style={[manageStyles.mRarityDot, { backgroundColor: rarityInfo.dot }]} />
                          <ScaledText size={9} weight="600" color="#4E342E" numberOfLines={1} style={manageStyles.mFlowerName}>
                            {isZh ? (ft.name_zh || ft.name_en) : ft.name_en}
                          </ScaledText>
                          <TouchableOpacity
                            style={manageStyles.mRemoveBtn}
                            onPress={() => handleToggleIndividual(flower, false)}
                            activeOpacity={0.6}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <X size={10} color="#FFF" />
                          </TouchableOpacity>
                        </TouchableOpacity>
                        {isPicked && (
                          <View style={manageStyles.mPickedHint}>
                            <ArrowDown size={10} color="#8D6E63" />
                          </View>
                        )}
                      </Animated.View>
                    );
                  })}
                </View>
              )}

              <View style={manageStyles.mSectionDivider} />

              <View style={manageStyles.mSectionHeader}>
                <View style={[manageStyles.mSectionDot, { backgroundColor: '#BCAAA4' }]} />
                <ScaledText size={14} weight="700" color="#8D6E63">
                  {isZh ? '📦 倉庫中' : '📦 In Storage'}
                </ScaledText>
                <ScaledText size={11} color="#A1887F" style={{ marginLeft: 6 }}>
                  ({storageFlowers.length})
                </ScaledText>
              </View>
              {storageFlowers.length === 0 ? (
                <View style={manageStyles.mEmptySection}>
                  <ScaledText size={13} color="#A1887F">{isZh ? '倉庫是空的' : 'Storage is empty'}</ScaledText>
                </View>
              ) : (
                <View style={manageStyles.mGrid}>
                  {storageFlowers.map((flower) => {
                    const ft = flower.flower_types || flowerTypeMap[flower.flower_type_id];
                    if (!ft) return null;
                    const rarity = ft.rarity || 'common';
                    const rarityInfo = RARITY_COLORS[rarity] || RARITY_COLORS.common;
                    const isPicked = pickedUpId === flower.id;
                    const scaleAnim = getPickedUpScale(flower.id);
                    return (
                      <Animated.View
                        key={flower.id}
                        style={[
                          manageStyles.mFlowerCard,
                          manageStyles.mFlowerCardDimmed,
                          {
                            transform: [{ scale: scaleAnim }],
                            ...(isPicked ? {
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: 0.25,
                              shadowRadius: 8,
                              elevation: 8,
                            } : {}),
                          },
                        ]}
                      >
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onLongPress={() => handleLongPress(flower)}
                          onPressOut={() => { if (pickedUpId === flower.id) handleLongPressRelease(flower); }}
                          delayLongPress={500}
                          style={manageStyles.mFlowerCardInner}
                        >
                          <View style={[manageStyles.mFlowerImgWrap, { backgroundColor: rarityInfo.bg, opacity: 0.6 }]}>
                            <Image source={{ uri: ft.image_url }} style={[manageStyles.mFlowerImg, { opacity: 0.5 }]} contentFit="contain" cachePolicy="memory-disk" />
                          </View>
                          <View style={[manageStyles.mRarityDot, { backgroundColor: rarityInfo.dot, opacity: 0.5 }]} />
                          <ScaledText size={9} weight="600" color="#A1887F" numberOfLines={1} style={manageStyles.mFlowerName}>
                            {isZh ? (ft.name_zh || ft.name_en) : ft.name_en}
                          </ScaledText>
                          <TouchableOpacity
                            style={manageStyles.mAddBtn}
                            onPress={() => handleToggleIndividual(flower, true)}
                            activeOpacity={0.6}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Plus size={10} color="#FFF" />
                          </TouchableOpacity>
                        </TouchableOpacity>
                        {isPicked && (
                          <View style={manageStyles.mPickedHint}>
                            <ArrowUp size={10} color="#558B2F" />
                          </View>
                        )}
                      </Animated.View>
                    );
                  })}
                </View>
              )}
              <View style={{ height: 30 }} />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal visible={!!selectedFlower} transparent animationType="fade" onRequestClose={() => setSelectedFlower(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedFlower(null)}>
          <View style={styles.tooltipModal}>
            <TouchableOpacity style={styles.tooltipClose} onPress={() => setSelectedFlower(null)} testID="tooltip-close">
              <X size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
            {selectedFlowerType && (
              <>
                <Image source={{ uri: selectedFlowerType.image_url }} style={styles.tooltipFlowerImage} contentFit="contain" cachePolicy="memory-disk" />
                <ScaledText size={18} weight="bold" color={Colors.textPrimary} style={{ textAlign: 'center' as const, marginBottom: 4 }}>
                  {isZh ? (selectedFlowerType.name_zh || selectedFlowerType.name_en) : selectedFlowerType.name_en}
                </ScaledText>
                {selectedFlowerCount > 1 && (
                  <ScaledText size={13} weight="600" color="#8D6E63" style={{ marginBottom: 8 }}>
                    ×{selectedFlowerCount} {isZh ? '朵' : 'owned'}
                  </ScaledText>
                )}
                {selectedFlowerType.rarity && (
                  <View style={[styles.rarityBadge, { backgroundColor: (RARITY_COLORS[selectedFlowerType.rarity]?.bg) || '#F5F5F5' }]}>
                    <View style={[styles.rarityDotLarge, { backgroundColor: (RARITY_COLORS[selectedFlowerType.rarity]?.dot) || '#999' }]} />
                    <ScaledText size={12} weight="700" color={(RARITY_COLORS[selectedFlowerType.rarity]?.dot) || '#999'}>
                      {selectedFlowerType.rarity.charAt(0).toUpperCase() + selectedFlowerType.rarity.slice(1)}
                    </ScaledText>
                  </View>
                )}

              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const gardenStyles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: '#3E6B2E',
  },
  grassTexture1: {
    position: 'absolute',
    top: '36%',
    left: -20,
    right: -20,
    height: 40,
    backgroundColor: 'rgba(120,180,60,0.25)',
    borderRadius: 22,
    transform: [{ rotate: '-1.5deg' }],
  },
  grassTexture2: {
    position: 'absolute',
    top: '48%',
    left: -15,
    right: -15,
    height: 32,
    backgroundColor: 'rgba(90,150,45,0.2)',
    borderRadius: 16,
    transform: [{ rotate: '1deg' }],
  },
  grassTexture3: {
    position: 'absolute',
    top: '65%',
    left: -10,
    right: -10,
    height: 22,
    backgroundColor: 'rgba(85,139,47,0.2)',
    borderRadius: 11,
    transform: [{ rotate: '-1deg' }],
  },
  soilCell: {
    width: CELL_W,
    height: CELL_H,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(93,64,55,0.2)',
  },
  soilCellOccupied: {
    backgroundColor: '#6D4C41',
  },
  soilCellEmpty: {
    backgroundColor: '#6D4C41',
    opacity: 0.8,
  },
  soilHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F7F3E9',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFF8E7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#D7CCC8',
  },
  woodenSign: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#FFECB3',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D7A54A',
    shadowColor: '#8D6E63',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  headerChips: {
    flexDirection: 'row',
    gap: 4,
  },
  resourceChip: {
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    padding: 80,
    alignItems: 'center',
  },
  emptyHint: {
    alignItems: 'center',
    marginHorizontal: 40,
    marginTop: 10,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingVertical: 10,
    borderRadius: 12,
  },
  actionRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    gap: 8,
  },
  drawBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#E91E63',
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: '#E91E63',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  manageBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFF8E7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#D7CCC8',
  },
  chestBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FFE0B2',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FFCC80',
  },
  progressContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#FFF8E7',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F0E0C0',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressBarBg: {
    height: 14,
    backgroundColor: '#E8E0D0',
    borderRadius: 7,
    overflow: 'hidden',
  },
  progressBarFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: '#8BC34A',
    borderRadius: 7,
  },
  collectionSection: {
    marginHorizontal: 16,
  },
  collectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#FFF8E7',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#F0E0C0',
  },
  collectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  collectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  collectionCard: {
    width: '48%' as unknown as number,
  },
  collectionCardInner: {
    backgroundColor: '#FFFDF5',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#F0E8D8',
    shadowColor: '#8D6E63',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
  },
  countBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#E91E63',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  cardImageBg: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFlowerImage: {
    width: 36,
    height: 36,
  },
  cardRarityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  cardRarityDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  cardExpandedSection: {
    marginTop: 8,
    alignItems: 'center',
    width: '100%',
  },
  cardDivider: {
    width: '80%',
    height: 1,
    backgroundColor: '#F0E0C0',
    marginBottom: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  theftModal: {
    backgroundColor: '#FFF8E1',
    borderRadius: 24,
    padding: 28,
    marginHorizontal: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFE082',
  },
  theftCloseBtn: {
    backgroundColor: '#8D6E63',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 14,
  },
  tooltipModal: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 48,
    alignItems: 'center',
  },
  tooltipClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipFlowerImage: {
    width: 80,
    height: 80,
    marginBottom: 12,
  },
  rarityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  rarityDotLarge: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dragShadow: {
    position: 'absolute',
    bottom: -4,
    left: 10,
    width: 40,
    height: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  dragHint: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 100,
  },
});

const manageStyles = StyleSheet.create({
  fullOverlay: {
    flex: 1,
    backgroundColor: '#F7F3E9',
  },
  fullContainer: {
    flex: 1,
  },
  mHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0E0C0',
    backgroundColor: '#FFFDF5',
  },
  mCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F0E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: '#FFFDF5',
    gap: 8,
  },
  mCounterChip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#F5F0E8',
  },
  mCounterDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#E0D8C8',
  },
  mBulkRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    gap: 10,
    paddingBottom: 12,
    backgroundColor: '#FFFDF5',
  },
  mBulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F5F0E8',
    borderWidth: 1,
    borderColor: '#E8E0D0',
  },
  mScrollBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  mSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  mSectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8BC34A',
    marginRight: 8,
  },
  mSectionDivider: {
    height: 1,
    backgroundColor: '#E8E0D0',
    marginVertical: 8,
    marginHorizontal: 4,
  },
  mEmptySection: {
    paddingVertical: 24,
    alignItems: 'center',
    backgroundColor: '#FFFDF5',
    borderRadius: 12,
    marginBottom: 4,
  },
  mGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 4,
  },
  mFlowerCard: {
    width: 72,
    height: 88,
    position: 'relative',
  },
  mFlowerCardDimmed: {
    opacity: 0.7,
  },
  mFlowerCardInner: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#FFFDF5',
    borderRadius: 12,
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#F0E8D8',
    shadowColor: '#8D6E63',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  mFlowerImgWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mFlowerImg: {
    width: 32,
    height: 32,
  },
  mRarityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 3,
  },
  mFlowerName: {
    marginTop: 2,
    textAlign: 'center',
    width: 60,
  },
  mRemoveBtn: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF5350',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#D32F2F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  mAddBtn: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#66BB6A',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#388E3C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  mPickedHint: {
    position: 'absolute',
    bottom: -14,
    alignSelf: 'center',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF8E7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8E0D0',
    zIndex: 20,
  },
});
