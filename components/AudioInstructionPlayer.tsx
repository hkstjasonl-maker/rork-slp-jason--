import React, { useCallback, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Headphones, Pause } from 'lucide-react-native';
import { ScaledText } from '@/components/ScaledText';
import Colors from '@/constants/colors';
import { log } from '@/lib/logger';

interface AudioInstructionPlayerProps {
  audioUrl: string;
  label: string;
  stopLabel: string;
}

function AudioInstructionPlayerInner({ audioUrl, label, stopLabel }: AudioInstructionPlayerProps) {
  const player = useAudioPlayer({ uri: audioUrl });
  const status = useAudioPlayerStatus(player);

  const isPlaying = status.playing;
  const duration = status.duration || 0;
  const currentTime = status.currentTime || 0;
  const progress = duration > 0 ? currentTime / duration : 0;

  const handleToggle = useCallback(() => {
    if (isPlaying) {
      log('[AudioInstruction] Pausing audio');
      player.pause();
    } else {
      if (status.didJustFinish || (duration > 0 && currentTime >= duration - 0.1)) {
        log('[AudioInstruction] Replaying audio from start');
        player.seekTo(0);
        player.play();
      } else {
        log('[AudioInstruction] Playing audio');
        player.play();
      }
    }
  }, [isPlaying, player, status.didJustFinish, duration, currentTime]);

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
});
