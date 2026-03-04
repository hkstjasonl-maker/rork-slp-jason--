import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';

interface VideoWatermarkProps {
  patientName: string;
  height: number;
}

function VideoWatermarkInner({ patientName, height }: VideoWatermarkProps) {
  const watermarkText = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${patientName} ${yyyy}-${mm}-${dd}`;
  }, [patientName]);

  const tiles = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    const spacingX = 180;
    const spacingY = 160;
    const cols = Math.ceil(screenWidth / spacingX) + 2;
    const rows = Math.ceil(height / spacingY) + 2;
    const items: { key: string; top: number; left: number }[] = [];

    for (let row = -1; row < rows; row++) {
      const offsetX = row % 2 === 0 ? 0 : spacingX / 2;
      for (let col = -1; col < cols; col++) {
        items.push({
          key: `${row}-${col}`,
          top: row * spacingY,
          left: col * spacingX + offsetX,
        });
      }
    }
    return items;
  }, [height]);

  return (
    <View style={[styles.overlay, { height }]} pointerEvents="none">
      {tiles.map((tile) => (
        <View
          key={tile.key}
          style={[
            styles.tileWrapper,
            {
              top: tile.top,
              left: tile.left,
            },
          ]}
        >
          <Text style={styles.watermarkText}>{watermarkText}</Text>
        </View>
      ))}
    </View>
  );
}

export const VideoWatermark = React.memo(VideoWatermarkInner);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 12,
    zIndex: 10,
  },
  tileWrapper: {
    position: 'absolute',
    transform: [{ rotate: '-30deg' }],
  },
  watermarkText: {
    color: 'rgba(255, 255, 255, 0.13)',
    fontSize: 14,
    fontWeight: 'bold' as const,
    letterSpacing: 0.5,
  },
});
