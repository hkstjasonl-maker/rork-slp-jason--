import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';

interface RecordingWatermarkProps {
  exerciseName: string;
  visible: boolean;
}

function RecordingWatermarkInner({ exerciseName, visible }: RecordingWatermarkProps) {
  const watermarkText = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    return `SLP Jason ${exerciseName} ${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }, [exerciseName]);

  const tiles = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    const screenHeight = Dimensions.get('window').height;
    const spacingX = 125;
    const spacingY = 120;
    const cols = Math.ceil(screenWidth / spacingX) + 3;
    const rows = Math.ceil(screenHeight / spacingY) + 3;
    const items: { key: string; top: number; left: number }[] = [];

    for (let row = -2; row < rows; row++) {
      const offsetX = row % 2 === 0 ? 0 : spacingX / 2;
      for (let col = -2; col < cols; col++) {
        items.push({
          key: `${row}-${col}`,
          top: row * spacingY,
          left: col * spacingX + offsetX,
        });
      }
    }
    return items;
  }, []);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
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

export const RecordingWatermark = React.memo(RecordingWatermarkInner);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 20,
  },
  tileWrapper: {
    position: 'absolute',
    transform: [{ rotate: '-30deg' }],
  },
  watermarkText: {
    color: 'rgba(255, 255, 255, 0.19)',
    fontSize: 26,
    fontWeight: 'bold' as const,
    letterSpacing: 0.5,
  },
});
