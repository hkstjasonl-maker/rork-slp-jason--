import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface RecordingWatermarkProps {
  exerciseName: string;
  patientName?: string;
  visible: boolean;
}

function RecordingWatermarkInner({ exerciseName, patientName, visible }: RecordingWatermarkProps) {
  const dateTimeText = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }, []);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Text style={styles.exerciseText} numberOfLines={1}>{exerciseName}</Text>
      <Text style={styles.detailText}>{dateTimeText}</Text>
      {patientName ? (
        <Text style={styles.detailText}>{patientName}</Text>
      ) : null}
      <Text style={styles.brandingText}>Recorded with SLP Jason 使用SLP Jason錄製</Text>
    </View>
  );
}

export const RecordingWatermark = React.memo(RecordingWatermarkInner);

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    zIndex: 20,
  },
  exerciseText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  detailText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.9,
    marginTop: 2,
  },
  brandingText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '500',
    opacity: 0.85,
    marginTop: 3,
  },
});
