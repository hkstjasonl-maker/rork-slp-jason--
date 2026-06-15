import React from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ScaledText } from '@/components/ScaledText';

interface Props {
  onSignInAgain: () => void;
  busy?: boolean;
}

export default function SessionExpiredScreen({ onSignInAgain, busy }: Props) {
  return (
    <View style={styles.root} testID="session-expired-screen">
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <AlertTriangle size={40} color={Colors.white} />
          </View>

          <ScaledText size={24} weight="bold" color={Colors.textPrimary} style={styles.title}>
            Session Ended
          </ScaledText>
          <ScaledText size={18} weight="600" color={Colors.textPrimary} style={styles.titleZh}>
            登入時段已結束
          </ScaledText>

          <ScaledText size={15} color={Colors.textSecondary} style={styles.message}>
            Another device connected to your account.
          </ScaledText>
          <ScaledText size={14} color={Colors.textSecondary} style={styles.messageZh}>
            另一裝置已連接到您的帳戶。
          </ScaledText>

          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
            onPress={onSignInAgain}
            disabled={busy}
            activeOpacity={0.85}
            testID="sign-in-again-button"
          >
            {busy ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <ScaledText size={16} weight="700" color={Colors.white}>
                  Sign In Again
                </ScaledText>
                <ScaledText size={13} weight="600" color={Colors.white}>
                  再次登入
                </ScaledText>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#E0A500',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  title: {
    textAlign: 'center',
    marginBottom: 2,
  },
  titleZh: {
    textAlign: 'center',
    marginBottom: 14,
  },
  message: {
    textAlign: 'center',
    marginBottom: 4,
  },
  messageZh: {
    textAlign: 'center',
    marginBottom: 28,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: Colors.secondary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    gap: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
