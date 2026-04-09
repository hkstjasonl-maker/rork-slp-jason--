import React, { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import { Headphones, Pause } from 'lucide-react-native';
import { ScaledText } from '@/components/ScaledText';
import Colors from '@/constants/colors';
import { log } from '@/lib/logger';

interface AudioInstructionPlayerProps {
  audioUrl: string;
  label: string;
  stopLabel: string;
  transcript?: string | null;
}

function AudioInstructionPlayerInner({ audioUrl, label, stopLabel, transcript }: AudioInstructionPlayerProps) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [didFinish, setDidFinish] = useState(false);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Reload if audioUrl changes
    if (soundRef.current) {
      soundRef.current.unloadAsync();
      soundRef.current = null;
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setDidFinish(false);
    }
  }, [audioUrl]);

  const loadSound = useCallback(async () => {
    if (!soundRef.current) {
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: false },
        (status) => {
          if (status.isLoaded) {
            setCurrentTime(status.positionMillis / 1000);
            setDuration((status.durationMillis || 0) / 1000);
            setIsPlaying(status.isPlaying);
            if (status.didJustFinish) {
              setIsPlaying(false);
              setDidFinish(true);
            }
          }
        }
      );
      soundRef.current = sound;
    }
    return soundRef.current;
  }, [audioUrl]);

  const handleToggle = useCallback(async () => {
    try {
      const sound = await loadSound();
      if (isPlaying) {
        log('[AudioInstruction] Pausing audio');
        await sound.pauseAsync();
      } else {
        if (didFinish) {
          log('[AudioInstruction] Replaying audio from start');
          await sound.setPositionAsync(0);
          setDidFinish(false);
        }
        log('[AudioInstruction] Playing audio');
        await sound.playAsync();
      }
    } catch (e) {
      log('[AudioInstruction] Error toggling audio:', e);
    }
  }, [isPlaying, didFinish, loadSound]);

  const progress = duration > 0 ? currentTime / duration : 0;

  const timeText = useMemo(() => {
    const formatTime = (s: number) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, '0')}`;
    };
    if (duration > 0) {
      return `${formatTime(currentTime)} / ${formatTime(duration)}`;
    }
    return '';
  }, [currentTime, duration]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, isPlaying && styles.buttonActive]}
        onPress={handleToggle}
        activeOpacity={0.7}
        testID="audio-instruction-toggle"
      >
        <View style={styles.buttonContent}>
          {isPlaying ? (
            <Pause size={18} color={Colors.white} />
          ) : (
            <Headphones size={18} color={Colors.white} />
          )}
          <ScaledText size={14} weight="600" color={Colors.white}>
            {isPlaying ? stopLabel : label}
          </ScaledText>
        </View>
        {timeText ? (
          <ScaledText size={11} color="rgba(255,255,255,0.7)" style={styles.timeText}>
            {timeText}
          </ScaledText>
        ) : null}
      </TouchableOpacity>
      {duration > 0 && (
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${Math.min(100, progress * 100)}%` }]} />
        </View>
      )}
      {transcript ? (
        <View style={styles.transcriptContainer}>
          <ScaledText size={13} color={Colors.textSecondary} style={styles.transcriptText}>
            {transcript}
          </ScaledText>
        </View>
      ) : null}
    </View>
  );
}

export const AudioInstructionPlayer = React.memo(AudioInstructionPlayerInner);

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  buttonActive: {
    backgroundColor: '#E74C3C',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeText: {
    marginTop: 4,
  },
  progressBarBg: {
    height: 3,
    backgroundColor: Colors.border,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    overflow: 'hidden',
    marginTop: -2,
  },
  progressBarFill: {
    height: 3,
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  transcriptContainer: {
    marginTop: 10,
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  transcriptText: {
    lineHeight: 20,
  },
});
