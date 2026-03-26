import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ScaledText } from '@/components/ScaledText';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';

function CopyrightFooterInner() {
  const { t } = useApp();

  return (
    <View style={styles.container}>
      <ScaledText size={10} color={Colors.textSecondary} style={styles.text}>
        {`© ${new Date().getFullYear()} ${t('copyright')}`}
      </ScaledText>
    </View>
  );
}

export const CopyrightFooter = React.memo(CopyrightFooterInner);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  text: {
    textAlign: 'center',
    lineHeight: 16,
  },
});
