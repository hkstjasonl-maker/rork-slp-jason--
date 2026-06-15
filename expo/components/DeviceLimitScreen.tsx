import React from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Lock, Smartphone } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ScaledText } from '@/components/ScaledText';
import { OtherDeviceInfo } from '@/hooks/useDeviceSession';

interface Props {
  otherDevice: OtherDeviceInfo | null;
  onUseThisDevice: () => void;
  onSignOut: () => void;
  busy?: boolean;
}

function formatLastActive(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return '—';
  }
}

export default function DeviceLimitScreen({ otherDevice, onUseThisDevice, onSignOut, busy }: Props) {
  return (
    <View style={styles.root} testID="device-limit-screen">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.iconCircle}>
            <Lock size={40} color={Colors.white} />
          </View>

          <ScaledText size={24} weight="bold" color={Colors.textPrimary} style={styles.title}>
            Already Logged In
          </ScaledText>
          <ScaledText size={18} weight="600" color={Colors.textPrimary} style={styles.titleZh}>
            已在其他裝置登入
          </ScaledText>

          <ScaledText size={15} color={Colors.textSecondary} style={styles.message}>
            Your account is active on another device. You can only use one device at a time.
          </ScaledText>
          <ScaledText size={14} color={Colors.textSecondary} style={styles.messageZh}>
            您的帳戶正在另一裝置使用中。同一時間只能使用一部裝置。
          </ScaledText>

          {otherDevice && (
            <View style={styles.deviceCard}>
              <View style={styles.deviceIconWrap}>
                <Smartphone size={22} color={Colors.primary} />
              </View>
              <View style={styles.deviceInfo}>
                <ScaledText size={11} weight="600" color={Colors.textSecondary}>
                  OTHER DEVICE / 其他裝置
                </ScaledText>
                <ScaledText size={15} weight="700" color={Colors.textPrimary}>
                  {otherDevice.device_name || 'Unknown device'}
                </ScaledText>
                {!!otherDevice.device_model && (
                  <ScaledText size={13} color={Colors.textSecondary}>
                    {otherDevice.device_model}
                    {otherDevice.os_name ? ` · ${otherDevice.os_name}` : ''}
                  </ScaledText>
                )}
                <ScaledText size={12} color={Colors.textSecondary} style={styles.lastActive}>
                  Last active 上次活動：{formatLastActive(otherDevice.last_active_at)}
                </ScaledText>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
            onPress={onUseThisDevice}
            disabled={busy}
            activeOpacity={0.85}
            testID="use-this-device-button"
          >
            {busy ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <ScaledText size={16} weight="700" color={Colors.white}>
                  Use This Device Instead
                </ScaledText>
                <ScaledText size={13} weight="600" color={Colors.white}>
                  改用此裝置
                </ScaledText>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onSignOut}
            disabled={busy}
            activeOpacity={0.7}
            testID="sign-out-button"
          >
            <ScaledText size={15} weight="600" color={Colors.error}>
              Sign Out
            </ScaledText>
            <ScaledText size={13} color={Colors.error}>
              登出
            </ScaledText>
          </TouchableOpacity>
        </ScrollView>
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
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
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
    marginBottom: 20,
  },
  deviceCard: {
    width: '100%',
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 24,
  },
  deviceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceInfo: {
    flex: 1,
    gap: 2,
  },
  lastActive: {
    marginTop: 4,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: Colors.secondary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    gap: 2,
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  secondaryButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.error,
    backgroundColor: Colors.card,
    gap: 2,
  },
});
