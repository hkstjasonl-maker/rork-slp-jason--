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
  Image,
  Dimensions,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Gift, X, ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react-native';

import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { log } from '@/lib/logger';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GARDEN_HEIGHT = 420;
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
  { type: 'dome' as const, left: -20, w: 180, h: 55, color: 'rgba(130,155,170,0.07)' },
  { type: 'peak' as const, left: 40, bL: 45, bR: 45, bB: 95, color: 'rgba(110,140,155,0.08)' },
  { type: 'dome' as const, left: 100, w: 150, h: 70, color: 'rgba(120,145,160,0.06)' },
  { type: 'peak' as const, left: 180, bL: 55, bR: 55, bB: 85, color: 'rgba(125,150,165,0.09)' },
  { type: 'dome' as const, left: 230, w: 130, h: 65, color: 'rgba(115,140,155,0.07)' },
  { type: 'peak' as const, left: 300, bL: 40, bR: 40, bB: 100, color: 'rgba(130,155,170,0.08)' },
  { type: 'dome' as const, left: 340, w: 160, h: 50, color: 'rgba(120,145,160,0.06)' },
  { type: 'peak' as const, left: 380, bL: 30, bR: 30, bB: 75, color: 'rgba(110,135,150,0.09)' },
];

const CLOUD_DATA = [
  { y: 12, w: 72, h: 22, duration: 42000, startFrac: 0.15 },
  { y: 38, w: 56, h: 18, duration: 52000, startFrac: 0.55 },
  { y: 6, w: 88, h: 26, duration: 48000, startFrac: 0.35 },
  { y: 52, w: 62, h: 20, duration: 58000, startFrac: 0.75 },
  { y: 24, w: 66, h: 19, duration: 46000, startFrac: 0.05 },
];

const BIRD_DATA = [
  { y: 20, size: 12, speed: 26000, startFrac: 0.1, dir: 1, flapSpeed: 800, count: 2 },
  { y: 40, size: 18, speed: 34000, startFrac: 0.7, dir: -1, flapSpeed: 0, count: 1 },
  { y: 14, size: 8, speed: 22000, startFrac: 0.4, dir: 1, flapSpeed: 600, count: 3 },
];

const TREE_DATA = [
  { emoji: '🌳', left: 18, top: 125, size: 34, opacity: 0.22 },
  { emoji: '🌲', left: SCREEN_WIDTH - 55, top: 135, size: 30, opacity: 0.18 },
  { emoji: '🌳', left: 80, top: 150, size: 22, opacity: 0.15 },
  { emoji: '🌴', left: SCREEN_WIDTH - 110, top: 145, size: 24, opacity: 0.15 },
];

const GRASS_SPRITES: { emoji: string; left: number; top: number; size: number }[] = [];
const grassEmojis = ['🌱', '🌿', '☘️', '🍀'];
for (let i = 0; i < 14; i++) {
  const isLeft = i < 7;
  GRASS_SPRITES.push({
    emoji: grassEmojis[i % 4],
    left: isLeft ? seededRand(i * 7 + 1) * 30 + 4 : SCREEN_WIDTH - 36 + seededRand(i * 7 + 2) * 26,
    top: 155 + seededRand(i * 7 + 3) * 220,
    size: 7 + Math.floor(seededRand(i * 7 + 4) * 5),
  });
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

function Mountains() {
  const mountainTop = GARDEN_HEIGHT * 0.42;
  return (
    <>
      {MOUNTAIN_DATA.map((m, i) => {
        if (m.type === 'dome') {
          return (
            <View
              key={`m-${i}`}
              style={{
                position: 'absolute' as const,
                bottom: GARDEN_HEIGHT - mountainTop,
                left: m.left,
                width: m.w,
                height: m.h,
                borderTopLeftRadius: (m.w ?? 100) / 2,
                borderTopRightRadius: (m.w ?? 100) / 2,
                backgroundColor: m.color,
                zIndex: 3,
              }}
            />
          );
        }
        return (
          <View
            key={`m-${i}`}
            style={{
              position: 'absolute' as const,
              bottom: GARDEN_HEIGHT - mountainTop,
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
              zIndex: 3,
            }}
          />
        );
      })}
    </>
  );
}

function RollingHills() {
  return (
    <>
      <View style={{
        position: 'absolute' as const, bottom: GARDEN_HEIGHT * 0.48, left: -30, right: -30,
        height: 60, borderTopLeftRadius: 300, borderTopRightRadius: 200,
        backgroundColor: 'rgba(165,214,167,0.35)', zIndex: 3,
      }} />
      <View style={{
        position: 'absolute' as const, bottom: GARDEN_HEIGHT * 0.44, left: SCREEN_WIDTH * 0.2, right: -40,
        height: 50, borderTopLeftRadius: 250, borderTopRightRadius: 350,
        backgroundColor: 'rgba(129,199,132,0.3)', zIndex: 3,
      }} />
      <View style={{
        position: 'absolute' as const, bottom: GARDEN_HEIGHT * 0.40, left: -50, right: SCREEN_WIDTH * 0.15,
        height: 45, borderTopLeftRadius: 350, borderTopRightRadius: 180,
        backgroundColor: 'rgba(102,187,106,0.25)', zIndex: 3,
      }} />
      <View style={{
        position: 'absolute' as const, bottom: GARDEN_HEIGHT * 0.36, left: -20, right: -20,
        height: 40, borderTopLeftRadius: 200, borderTopRightRadius: 280,
        backgroundColor: 'rgba(85,139,47,0.2)', zIndex: 3,
      }} />
    </>
  );
}

function AtmosphericHaze() {
  return (
    <>
      <View style={{
        position: 'absolute' as const, top: GARDEN_HEIGHT * 0.10, left: 0, right: 0,
        height: GARDEN_HEIGHT * 0.18, backgroundColor: 'rgba(190,225,195,0.35)', zIndex: 2,
      }} />
      <View style={{
        position: 'absolute' as const, top: GARDEN_HEIGHT * 0.16, left: 0, right: 0,
        height: GARDEN_HEIGHT * 0.14, backgroundColor: 'rgba(200,230,200,0.28)', zIndex: 2,
      }} />
      <View style={{
        position: 'absolute' as const, top: GARDEN_HEIGHT * 0.22, left: 0, right: 0,
        height: GARDEN_HEIGHT * 0.10, backgroundColor: 'rgba(215,235,205,0.22)', zIndex: 2,
      }} />
      <View style={{
        position: 'absolute' as const, bottom: 0, left: 0, right: 0,
        height: 30, backgroundColor: 'rgba(30,60,20,0.08)', zIndex: 7,
      }} />
    </>
  );
}

function SunWithFace() {
  const glowScale = useRef(new Animated.Value(1)).current;
  const rayRotation = useRef(new Animated.Value(0)).current;
  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowScale, { toValue: 1.08, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glowScale, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    glowLoop.start();

    const rayLoop = Animated.loop(
      Animated.timing(rayRotation, { toValue: 1, duration: 12000, easing: Easing.linear, useNativeDriver: true })
    );
    rayLoop.start();

    const blink = () => {
      Animated.sequence([
        Animated.delay(4000 + seededRand(Date.now()) * 2000),
        Animated.timing(blinkAnim, { toValue: 0.1, duration: 80, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      ]).start(() => blink());
    };
    blink();

    return () => { glowLoop.stop(); rayLoop.stop(); };
  }, [glowScale, rayRotation, blinkAnim]);

  const rayRotate = rayRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rays = [0, 30, 60, 90, 120, 150];

  return (
    <View style={{ position: 'absolute' as const, top: 8, right: 28, width: 52, height: 52, zIndex: 4 }}>
      <Animated.View style={{
        position: 'absolute' as const, top: -74, left: -74, width: 200, height: 200,
        alignItems: 'center' as const, justifyContent: 'center' as const,
        transform: [{ rotate: rayRotate }],
      }}>
        {rays.map((angle) => (
          <View key={angle} style={{
            position: 'absolute' as const, width: 3, height: 160, borderRadius: 1.5,
            backgroundColor: 'rgba(255,240,180,0.18)', transform: [{ rotate: `${angle}deg` }],
          }} />
        ))}
      </Animated.View>
      <Animated.View style={{
        position: 'absolute' as const, top: -34, left: -34, width: 120, height: 120, borderRadius: 60,
        backgroundColor: 'rgba(255,248,200,0.25)', transform: [{ scale: glowScale }],
      }} />
      <Animated.View style={{
        position: 'absolute' as const, top: -14, left: -14, width: 80, height: 80, borderRadius: 40,
        backgroundColor: 'rgba(255,245,180,0.15)', transform: [{ scale: glowScale }],
      }} />
      <View style={{
        width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFEE58',
        position: 'absolute' as const, top: 4, left: 4,
        alignItems: 'center' as const, justifyContent: 'center' as const,
        shadowColor: '#FFD54F', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 14,
        borderWidth: 2, borderColor: '#FFF176',
      }}>
        <View style={{ flexDirection: 'row' as const, gap: 9, marginTop: -3 }}>
          <Animated.View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#795548', transform: [{ scaleY: blinkAnim }] }} />
          <Animated.View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#795548', transform: [{ scaleY: blinkAnim }] }} />
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
}

function SingleCloud({ data }: { data: typeof CLOUD_DATA[0] }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const padXOffset = useRef(new Animated.Value(-data.w * 0.3)).current;
  const combinedX = useRef(Animated.add(translateX, padXOffset)).current;

  useEffect(() => {
    const startX = -data.w + (SCREEN_WIDTH + data.w) * data.startFrac;
    const remainFrac = 1 - data.startFrac;
    translateX.setValue(startX);
    Animated.timing(translateX, {
      toValue: SCREEN_WIDTH + 20,
      duration: data.duration * remainFrac,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(() => {
      translateX.setValue(-data.w - 20);
      Animated.loop(
        Animated.timing(translateX, { toValue: SCREEN_WIDTH + 20, duration: data.duration, easing: Easing.linear, useNativeDriver: true })
      ).start();
    });
  }, [translateX, data]);

  const bumpH = data.h * 1.3;
  const padX = data.w * 0.3;
  const padY = data.h * 0.5;
  return (
    <Animated.View style={{
      position: 'absolute' as const, top: data.y - padY, width: data.w + padX * 2, height: data.h + bumpH * 0.5 + padY * 2,
      transform: [{ translateX: combinedX }], zIndex: 4,
    }}>
      <View style={{
        position: 'absolute' as const, bottom: padY, left: padX * 0.3, right: padX * 0.3, height: data.h * 1.4,
        borderRadius: data.h, backgroundColor: 'rgba(255,255,255,0.18)',
      }} />
      <View style={{
        position: 'absolute' as const, bottom: padY, left: padX, right: padX, height: data.h,
        borderRadius: data.h / 2, backgroundColor: 'rgba(255,255,255,0.25)',
      }} />
      <View style={{
        position: 'absolute' as const, bottom: padY + data.h * 0.25, left: padX + data.w * 0.1,
        width: bumpH * 1.2, height: bumpH * 1.2, borderRadius: bumpH * 0.6, backgroundColor: 'rgba(255,255,255,0.22)',
      }} />
      <View style={{
        position: 'absolute' as const, bottom: padY + data.h * 0.2, left: padX + data.w * 0.42,
        width: bumpH * 1.4, height: bumpH * 1.4, borderRadius: bumpH * 0.7, backgroundColor: 'rgba(255,255,255,0.2)',
      }} />
      <View style={{
        position: 'absolute' as const, bottom: padY - data.h * 0.15, left: padX * 0.5, right: padX * 0.5, height: data.h * 0.8,
        borderRadius: data.h, backgroundColor: 'rgba(255,255,255,0.12)',
      }} />
    </Animated.View>
  );
}

function CloudsLayer() {
  return <>{CLOUD_DATA.map((c, i) => <SingleCloud key={i} data={c} />)}</>;
}

function BirdShape({ size, color }: { size: number; color: string }) {
  return (
    <View style={{ width: size, height: size / 2 }}>
      <View style={{
        position: 'absolute' as const, left: 0, top: size / 4 - 1,
        width: size / 2, height: 2, backgroundColor: color,
        transform: [{ rotate: '-25deg' }],
      }} />
      <View style={{
        position: 'absolute' as const, right: 0, top: size / 4 - 1,
        width: size / 2, height: 2, backgroundColor: color,
        transform: [{ rotate: '25deg' }],
      }} />
    </View>
  );
}

function BirdGroup({ data }: { data: typeof BIRD_DATA[0] }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const flapAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const fromX = data.dir > 0 ? -40 : SCREEN_WIDTH + 40;
    const toX = data.dir > 0 ? SCREEN_WIDTH + 40 : -40;
    const startX = fromX + (toX - fromX) * data.startFrac;
    const remainFrac = 1 - data.startFrac;
    translateX.setValue(startX);
    Animated.timing(translateX, {
      toValue: toX, duration: data.speed * remainFrac, easing: Easing.linear, useNativeDriver: true,
    }).start(() => {
      translateX.setValue(fromX);
      Animated.loop(
        Animated.timing(translateX, { toValue: toX, duration: data.speed, easing: Easing.linear, useNativeDriver: true })
      ).start();
    });

    if (data.flapSpeed > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(flapAnim, { toValue: 0.5, duration: data.flapSpeed / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(flapAnim, { toValue: 1, duration: data.flapSpeed / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    }
  }, [translateX, flapAnim, data]);

  const birds = Array.from({ length: data.count }, (_, i) => i);
  const color = 'rgba(60,60,80,0.25)';

  return (
    <Animated.View style={{
      position: 'absolute' as const, top: data.y, flexDirection: 'row' as const, gap: 8,
      transform: [{ translateX }], zIndex: 5,
    }}>
      {birds.map((_, i) => (
        <Animated.View key={i} style={{ transform: [{ scaleY: data.flapSpeed > 0 ? flapAnim : 1 }], marginLeft: i * 6, marginTop: i * 4 }}>
          <BirdShape size={data.size} color={color} />
        </Animated.View>
      ))}
    </Animated.View>
  );
}

function BirdsLayer() {
  return <>{BIRD_DATA.map((b, i) => <BirdGroup key={i} data={b} />)}</>;
}

function TreesAndGrassDecor() {
  return (
    <>
      {TREE_DATA.map((t, i) => (
        <View key={`tree-${i}`} style={{ position: 'absolute' as const, left: t.left, top: t.top, opacity: t.opacity, zIndex: 6 }}>
          <ScaledText size={t.size}>{t.emoji}</ScaledText>
        </View>
      ))}
      {GRASS_SPRITES.map((g, i) => (
        <View key={`grass-${i}`} style={{ position: 'absolute' as const, left: g.left, top: g.top, zIndex: 6 }}>
          <ScaledText size={g.size}>{g.emoji}</ScaledText>
        </View>
      ))}
    </>
  );
}

function PlantedFlower({ flower, flowerType, row }: {
  flower: PatientFlower;
  flowerType: FlowerType;
  row: number;
}) {
  const swayAnim = useRef(new Animated.Value(0)).current;
  const popAnim = useRef(new Animated.Value(0)).current;
  const bobAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(popAnim, { toValue: 1, friction: 5, tension: 50, useNativeDriver: true }).start();

    const swayDuration = 1800 + seededRand(flower.grid_position * 17) * 1200;
    const bobDuration = 2400 + seededRand(flower.grid_position * 19) * 1000;
    const delay = seededRand(flower.grid_position * 23) * 800;

    const timer = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(swayAnim, { toValue: 1, duration: swayDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(swayAnim, { toValue: -1, duration: swayDuration * 1.1, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(swayAnim, { toValue: 0, duration: swayDuration * 0.9, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(bobAnim, { toValue: 1, duration: bobDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(bobAnim, { toValue: 0, duration: bobDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [swayAnim, popAnim, bobAnim, flower.grid_position]);

  const swayAmplitude = 2.5 + (row / (GRID_ROWS - 1)) * 1.5;
  const rotate = swayAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: [`-${swayAmplitude}deg`, '0deg', `${swayAmplitude}deg`] });
  const translateY = bobAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const translateX = swayAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: [-1.5, 0, 1.5] });

  const rowFrac = row / (GRID_ROWS - 1);
  const imgSize = 52 + rowFrac * 18;
  const stemHeight = 42 + rowFrac * 30;
  const stemWidth = 2.5 + rowFrac * 0.8;
  const shadowWidth = imgSize * 0.7;
  const shadowOpacity = 0.15 + rowFrac * 0.12;
  const rarity = flowerType.rarity || 'common';
  const rarityInfo = RARITY_COLORS[rarity] || RARITY_COLORS.common;
  const glowSize = imgSize * 1.3;

  const totalHeight = imgSize + stemHeight + 24;

  return (
    <View style={{ alignItems: 'center' as const, width: imgSize + 14, height: totalHeight }}>
      <View style={{
        position: 'absolute' as const,
        bottom: stemHeight + 6,
        width: glowSize,
        height: glowSize * 0.6,
        borderRadius: glowSize / 2,
        backgroundColor: rarityInfo.glow + '18',
        alignSelf: 'center' as const,
      }} />
      <Animated.View style={{
        position: 'absolute' as const,
        bottom: stemHeight,
        alignItems: 'center' as const,
        transform: [{ rotate }, { translateY }, { translateX }, { scale: popAnim }],
        zIndex: 10,
      }}>
        <Image
          source={{ uri: flowerType.image_url }}
          style={{
            width: imgSize,
            height: imgSize,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 5,
          }}
          resizeMode="contain"
        />
      </Animated.View>
      <View style={{
        position: 'absolute' as const,
        bottom: 2,
        width: stemWidth,
        height: stemHeight,
        backgroundColor: '#5D8A3C',
        borderRadius: stemWidth / 2,
        zIndex: 9,
        shadowColor: '#2E5A1E',
        shadowOffset: { width: 0.5, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 1,
      }} />
      <View style={{
        position: 'absolute' as const,
        bottom: 2 + stemHeight * 0.45,
        left: (imgSize + 14) / 2 + stemWidth / 2 - 1,
        width: 6 + rowFrac * 2,
        height: 3.5 + rowFrac,
        borderRadius: 3,
        backgroundColor: '#6B9E4A',
        transform: [{ rotate: '30deg' }, { scaleY: 0.7 }],
        zIndex: 9,
      }} />
      <View style={{
        position: 'absolute' as const,
        bottom: 0,
        left: (imgSize + 14) / 2 - stemWidth,
        width: 6 + rowFrac * 1.5,
        height: 3 + rowFrac * 0.8,
        borderRadius: 3,
        backgroundColor: '#5A9240',
        transform: [{ rotate: '-35deg' }, { scaleY: 0.7 }],
        zIndex: 9,
      }} />
      <View style={{
        position: 'absolute' as const,
        bottom: -1,
        width: shadowWidth,
        height: 5,
        borderRadius: shadowWidth / 2,
        backgroundColor: `rgba(40,25,10,${shadowOpacity})`,
        transform: [{ scaleX: 1.4 }, { scaleY: 0.5 }],
        zIndex: 8,
      }} />
    </View>
  );
}

const MemoPlantedFlower = React.memo(PlantedFlower);

function SoilGrid({ flowers, flowerTypeMap, onFlowerPress }: {
  flowers: PatientFlower[];
  flowerTypeMap: Record<string, FlowerType>;
  onFlowerPress: (f: PatientFlower) => void;
}) {
  const flowerBySlot = useMemo(() => {
    const map: Record<number, PatientFlower> = {};
    flowers.forEach((f) => { map[f.grid_position] = f; });
    return map;
  }, [flowers]);

  const gridLeft = (SCREEN_WIDTH - GRID_W) / 2;

  return (
    <View style={{
      position: 'absolute' as const,
      bottom: 28,
      left: gridLeft,
      width: GRID_W,
      height: GRID_H,
      transform: [{ perspective: 500 }, { rotateX: '45deg' }],
      zIndex: 8,
    }}>
      {Array.from({ length: TOTAL_SLOTS }, (_, idx) => {
        const col = idx % GRID_COLS;
        const row = Math.floor(idx / GRID_COLS);
        const flower = flowerBySlot[idx];
        const ft = flower ? (flower.flower_types || flowerTypeMap[flower.flower_type_id]) : undefined;
        const hasFlower = !!flower && !!ft;
        const isEvenRow = row % 2 === 0;
        const offsetX = isEvenRow ? -7 : 0;
        const cellGrass = CELL_GRASS[idx];

        return (
          <TouchableOpacity
            key={idx}
            activeOpacity={hasFlower ? 0.7 : 1}
            onPress={hasFlower ? () => onFlowerPress(flower) : undefined}
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
                <MemoPlantedFlower flower={flower} flowerType={ft} row={row} />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function CreaturesLayer() {
  const b1Flight = useRef(new Animated.Value(0)).current;
  const b2Flight = useRef(new Animated.Value(0)).current;
  const bee1Flight = useRef(new Animated.Value(0)).current;
  const bee2Flight = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.timing(b1Flight, { toValue: 1, duration: 7500, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.timing(b2Flight, { toValue: 1, duration: 8200, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.timing(bee1Flight, { toValue: 1, duration: 3800, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.timing(bee2Flight, { toValue: 1, duration: 4200, easing: Easing.linear, useNativeDriver: true })).start();
  }, [b1Flight, b2Flight, bee1Flight, bee2Flight]);

  const gardenCenterX = SCREEN_WIDTH / 2;
  const gardenBottom = GARDEN_HEIGHT * 0.55;

  const b1x = b1Flight.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [gardenCenterX - 80, gardenCenterX + 40, gardenCenterX - 20, gardenCenterX + 70, gardenCenterX - 80] });
  const b1y = b1Flight.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [gardenBottom - 40, gardenBottom - 70, gardenBottom - 30, gardenBottom - 60, gardenBottom - 40] });
  const b1sx = b1Flight.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, -1, -1, 1, 1] });

  const b2x = b2Flight.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [gardenCenterX + 60, gardenCenterX - 30, gardenCenterX + 50, gardenCenterX - 60, gardenCenterX + 60] });
  const b2y = b2Flight.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [gardenBottom - 60, gardenBottom - 30, gardenBottom - 80, gardenBottom - 50, gardenBottom - 60] });

  const bee1x = bee1Flight.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [gardenCenterX - 50, gardenCenterX - 35, gardenCenterX - 55, gardenCenterX - 30, gardenCenterX - 50] });
  const bee1y = bee1Flight.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [gardenBottom - 20, gardenBottom - 35, gardenBottom - 15, gardenBottom - 28, gardenBottom - 20] });

  const bee2x = bee2Flight.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [gardenCenterX + 30, gardenCenterX + 45, gardenCenterX + 25, gardenCenterX + 50, gardenCenterX + 30] });
  const bee2y = bee2Flight.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [gardenBottom - 50, gardenBottom - 35, gardenBottom - 55, gardenBottom - 40, gardenBottom - 50] });

  return (
    <>
      <Animated.View style={{ position: 'absolute' as const, zIndex: 22, transform: [{ translateX: b1x }, { translateY: b1y }, { scaleX: b1sx }] }}>
        <ScaledText size={15}>🦋</ScaledText>
      </Animated.View>
      <Animated.View style={{ position: 'absolute' as const, zIndex: 22, transform: [{ translateX: b2x }, { translateY: b2y }] }}>
        <ScaledText size={17}>🦋</ScaledText>
      </Animated.View>
      <Animated.View style={{ position: 'absolute' as const, zIndex: 22, transform: [{ translateX: bee1x }, { translateY: bee1y }] }}>
        <ScaledText size={11}>🐝</ScaledText>
      </Animated.View>
      <Animated.View style={{ position: 'absolute' as const, zIndex: 22, transform: [{ translateX: bee2x }, { translateY: bee2y }] }}>
        <ScaledText size={12}>🐝</ScaledText>
      </Animated.View>
    </>
  );
}

function GoldenSparkles() {
  const sparkles = useRef(
    Array.from({ length: 6 }, (_, i) => ({
      anim: new Animated.Value(0),
      x: SCREEN_WIDTH * 0.2 + seededRand(i * 31) * SCREEN_WIDTH * 0.6,
      y: GARDEN_HEIGHT * 0.35 + seededRand(i * 37) * GARDEN_HEIGHT * 0.45,
      char: i % 2 === 0 ? '✦' : '✧',
    }))
  ).current;

  useEffect(() => {
    sparkles.forEach((s, i) => {
      const duration = 1800 + seededRand(i * 41) * 1000;
      const delay = seededRand(i * 43) * 2000;
      const run = () => {
        s.anim.setValue(0);
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(s.anim, { toValue: 1, duration: duration / 2, useNativeDriver: true }),
          Animated.timing(s.anim, { toValue: 0, duration: duration / 2, useNativeDriver: true }),
        ]).start(() => run());
      };
      run();
    });
  }, [sparkles]);

  return (
    <>
      {sparkles.map((s, i) => {
        const opacity = s.anim;
        const scale = s.anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1.2, 0.3] });
        const rotate = s.anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
        return (
          <Animated.View key={i} style={{
            position: 'absolute' as const, left: s.x, top: s.y, zIndex: 18,
            opacity, transform: [{ scale }, { rotate }],
          }}>
            <ScaledText size={13} color="#FFD700">{s.char}</ScaledText>
          </Animated.View>
        );
      })}
    </>
  );
}

function FenceRow() {
  const postCount = 18;
  const spacing = SCREEN_WIDTH / (postCount + 1);
  return (
    <View style={{ position: 'absolute' as const, bottom: 0, left: 0, right: 0, height: 28, zIndex: 12 }}>
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
}

function GardenScene({ flowers, flowerTypeMap, onFlowerPress }: {
  flowers: PatientFlower[];
  flowerTypeMap: Record<string, FlowerType>;
  onFlowerPress: (f: PatientFlower) => void;
}) {
  return (
    <View style={gardenStyles.container}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#3E6B2E' }]} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '72%', backgroundColor: '#4A7A38' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '64%', backgroundColor: '#5A8B48' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '56%', backgroundColor: '#6B9C58' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '49%', backgroundColor: '#7DAD6A' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '43%', backgroundColor: '#8BBD78' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '38%', backgroundColor: '#9AC888' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '34%', backgroundColor: '#A6D096' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '30%', backgroundColor: '#B0D6A2' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '27%', backgroundColor: '#BADCAE' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '24%', backgroundColor: '#C2DEB6' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '21.5%', backgroundColor: '#CADEBE' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '19%', backgroundColor: '#CFDEC4' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '17%', backgroundColor: '#D2DCCA' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '15%', backgroundColor: '#D2DCD0' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '13%', backgroundColor: '#CFDCD4' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '11%', backgroundColor: '#CBDADB' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '9.5%', backgroundColor: '#C4D6DE' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '8%', backgroundColor: '#BCD2E2' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '6.5%', backgroundColor: '#B4CCE4' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '5%', backgroundColor: '#ACC6E4' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '3.5%', backgroundColor: '#A4C0E4' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '2%', backgroundColor: '#9CBBE4' }} />
      <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '1%', backgroundColor: '#94B6E4' }} />

      <View style={gardenStyles.grassTexture1} />
      <View style={gardenStyles.grassTexture2} />
      <View style={gardenStyles.grassTexture3} />

      <Mountains />
      <RollingHills />
      <AtmosphericHaze />
      <SunWithFace />
      <CloudsLayer />
      <BirdsLayer />
      <TreesAndGrassDecor />
      <SoilGrid flowers={flowers} flowerTypeMap={flowerTypeMap} onFlowerPress={onFlowerPress} />
      <CreaturesLayer />
      <GoldenSparkles />
      <FenceRow />
    </View>
  );
}

function CollectionCard({ group, index, isZh, expanded, onToggleExpand }: {
  group: GroupedFlower;
  index: number;
  isZh: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const popAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(popAnim, {
      toValue: 1, friction: 6, tension: 50, delay: index * 60, useNativeDriver: true,
    }).start();
  }, [popAnim, index]);

  const scale = popAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const { flowerType, count, flowers: flowerInstances } = group;
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
            <Image source={{ uri: flowerType.image_url }} style={styles.cardFlowerImage} resizeMode="contain" />
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
        {expanded && (
          <View style={styles.cardExpandedSection}>
            <View style={styles.cardDivider} />
            <ScaledText size={10} weight="600" color="#8D6E63" style={{ marginBottom: 4 }}>
              {isZh ? '獲得日期' : 'Acquired'}
            </ScaledText>
            {flowerInstances.slice(0, 5).map((fi) => (
              <ScaledText key={fi.id} size={9} color={Colors.textSecondary} style={{ marginTop: 2 }}>
                {new Date(fi.obtained_at).toLocaleDateString(isZh ? 'zh-TW' : 'en-US', { month: 'short', day: 'numeric' })}
              </ScaledText>
            ))}
            {flowerInstances.length > 5 && (
              <ScaledText size={9} color={Colors.textSecondary} style={{ marginTop: 2 }}>
                +{flowerInstances.length - 5} more
              </ScaledText>
            )}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const MemoCollectionCard = React.memo(CollectionCard);

function CollectionProgress({ count, total, isZh }: { count: number; total: number; isZh: boolean }) {
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
}

export default function FlowerYieldScreen() {
  const { patientId, patientName, language, flowersJustStolen, clearFlowersStolen } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedFlower, setSelectedFlower] = useState<PatientFlower | null>(null);
  const [theftModalVisible, setTheftModalVisible] = useState<boolean>(false);
  const [collectionExpanded, setCollectionExpanded] = useState<boolean>(true);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  const isZh = language === 'zh_hant' || language === 'zh_hans';

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
    staleTime: 5 * 1000,
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
    staleTime: 5 * 1000,
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
  const flowers = flowersQuery.data || [];
  const isLoading = patientDataQuery.isLoading || flowersQuery.isLoading || flowerTypesQuery.isLoading;

  const groupedFlowers = useMemo(() => {
    const groups: Record<string, GroupedFlower> = {};
    (flowersQuery.data || []).forEach((f) => {
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
  }, [flowersQuery.data, flowerTypeMap]);

  const selectedFlowerType = selectedFlower
    ? (selectedFlower.flower_types || flowerTypeMap[selectedFlower.flower_type_id])
    : undefined;

  const selectedFlowerCount = selectedFlowerType
    ? groupedFlowers.find((g) => g.flowerType.id === selectedFlowerType.id)?.count ?? 1
    : 1;

  const handleFlowerPress = useCallback((flower: PatientFlower) => {
    setSelectedFlower(flower);
  }, []);

  const toggleCollection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollectionExpanded((prev) => !prev);
  }, []);

  const toggleCardExpand = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCardId((prev) => (prev === id ? null : id));
  }, []);

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
          <View style={styles.headerChips}>
            <View style={styles.resourceChip}>
              <ScaledText size={11} weight="600" color="#B8860B">⭐ {patientData?.stars_available ?? 0}</ScaledText>
            </View>
            <View style={styles.resourceChip}>
              <ScaledText size={11} weight="600" color="#E65100">🔥 {patientData?.fires_available ?? 0}</ScaledText>
            </View>
          </View>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <>
              <GardenScene flowers={flowers} flowerTypeMap={flowerTypeMap} onFlowerPress={handleFlowerPress} />

              {flowers.length === 0 && (
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

              <CollectionProgress count={flowers.length} total={TOTAL_SLOTS} isZh={isZh} />

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
                          expanded={expandedCardId === group.flowerType.id}
                          onToggleExpand={() => toggleCardExpand(group.flowerType.id)}
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

      <Modal visible={!!selectedFlower} transparent animationType="fade" onRequestClose={() => setSelectedFlower(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedFlower(null)}>
          <View style={styles.tooltipModal}>
            <TouchableOpacity style={styles.tooltipClose} onPress={() => setSelectedFlower(null)} testID="tooltip-close">
              <X size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
            {selectedFlowerType && (
              <>
                <Image source={{ uri: selectedFlowerType.image_url }} style={styles.tooltipFlowerImage} resizeMode="contain" />
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
                {selectedFlower?.obtained_at && (
                  <ScaledText size={12} color={Colors.textSecondary} style={{ marginTop: 10 }}>
                    {isZh ? '獲得日期：' : 'Acquired: '}
                    {new Date(selectedFlower.obtained_at).toLocaleDateString(isZh ? 'zh-TW' : 'en-US', {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </ScaledText>
                )}
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const CARD_WIDTH = (SCREEN_WIDTH - 32 - 10) / 2;

const gardenStyles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: GARDEN_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
  },
  grassTexture1: {
    position: 'absolute',
    top: '36%',
    left: -20,
    right: -20,
    height: 40,
    backgroundColor: 'rgba(120,180,60,0.06)',
    borderRadius: 22,
    transform: [{ rotate: '-1.5deg' }],
  },
  grassTexture2: {
    position: 'absolute',
    top: '48%',
    left: -15,
    right: -15,
    height: 32,
    backgroundColor: 'rgba(90,150,45,0.05)',
    borderRadius: 16,
    transform: [{ rotate: '1deg' }],
  },
  grassTexture3: {
    position: 'absolute',
    top: '65%',
    left: -10,
    right: -10,
    height: 22,
    backgroundColor: 'rgba(85,139,47,0.05)',
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
    width: CARD_WIDTH,
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
});
