import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { Patient } from '@/types';
import { KeyRound } from 'lucide-react-native';
import { log } from '@/lib/logger';

export default function CodeEntryScreen() {
  const { t, setPatient, fontScale } = useApp();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const verifyCodeMutation = useMutation({
    mutationFn: async (accessCode: string): Promise<Patient> => {
      const trimmedCode = accessCode.trim();

      const authEmail = `patient-${trimmedCode}@nanohab.internal`;

      let { error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: trimmedCode,
      });

      if (signInError) {
        console.log('[CodeEntry] SignIn failed v2:', signInError.message);
        await supabase.auth.signOut();

        const { error: signUpError } = await supabase.auth.signUp({
          email: authEmail,
          password: trimmedCode,
        });

        if (signUpError) {
          console.log('[CodeEntry] SignUp failed:', signUpError.message);

          await supabase.rpc('reset_patient_auth', {
            patient_access_code: trimmedCode,
          });

          const { error: signUpRetry } = await supabase.auth.signUp({
            email: authEmail,
            password: trimmedCode,
          });

          if (signUpRetry) {
            throw new Error('Login failed. Please contact your therapist.\n登入失敗，請聯絡您的治療師。');
          }
        }

        await supabase.auth.signOut();
        const { error: finalSignIn } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: trimmedCode,
        });

        if (finalSignIn) {
          throw new Error('Login failed. Please try again.\n登入失敗，請重試。');
        }
      }

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        await supabase.rpc('link_patient_auth', {
          patient_access_code: trimmedCode,
          new_auth_user_id: currentUser.id,
        });
      }

      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('access_code', trimmedCode)
        .single();

      if (error || !data) {
        await supabase.auth.signOut();
        throw new Error('invalid');
      }

      if (data.is_frozen) {
        await supabase.auth.signOut();
        throw new Error('frozen');
      }

      if (data.is_active === false) {
        await supabase.auth.signOut();
        throw new Error('inactive');
      }

      return data as Patient;
    },
    onSuccess: async (patient) => {
      await setPatient(patient.id, patient.patient_name, code.trim());
      router.replace('/(tabs)/home');
    },
    onError: (error) => {
      log('Code verification error:', error);
      if (error.message === 'invalid') {
        setErrorMessage(t('invalidCode'));
      } else if (error.message === 'frozen') {
        setErrorMessage(t('accountFrozen'));
      } else if (error.message === 'inactive') {
        setErrorMessage(t('accountInactive'));
      } else {
        setErrorMessage(t('networkError'));
      }
    },
  });

  const { mutate: verifyCode } = verifyCodeMutation;

  const handleSubmit = useCallback(() => {
    if (!code.trim()) return;
    setErrorMessage(null);
    verifyCode(code);
  }, [code, verifyCode]);

  const inputFontSize = Math.round(18 * fontScale);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <KeyRound size={36} color={Colors.white} />
              </View>
              <ScaledText size={28} weight="bold" color={Colors.textPrimary} style={styles.title}>
                NanoHab 醫家動
              </ScaledText>
              <ScaledText size={15} color={Colors.textSecondary} style={styles.subtitle}>
                {t('appSubtitle')}
              </ScaledText>
            </View>

            <View style={styles.formCard}>
              <ScaledText size={16} weight="600" color={Colors.textPrimary} style={styles.label}>
                {t('enterCode')}
              </ScaledText>

              <TextInput
                style={[styles.input, { fontSize: inputFontSize }]}
                value={code}
                onChangeText={setCode}
                placeholder={t('codePlaceholder')}
                placeholderTextColor={Colors.disabled}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
                testID="code-input"
                accessibilityLabel={t('enterCode')}
                accessibilityRole="text"
              />

              {errorMessage && (
                <View style={styles.errorContainer}>
                  <ScaledText size={14} color={Colors.error}>
                    {errorMessage}
                  </ScaledText>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (!code.trim() || verifyCodeMutation.isPending) && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!code.trim() || verifyCodeMutation.isPending}
                activeOpacity={0.8}
                testID="submit-button"
                accessibilityLabel={t('submit')}
                accessibilityRole="button"
              >
                {verifyCodeMutation.isPending ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <ScaledText size={18} weight="600" color={Colors.white}>
                    {t('submit')}
                  </ScaledText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        <CopyrightFooter />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  label: {
    marginBottom: 12,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  errorContainer: {
    backgroundColor: Colors.errorLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  submitButton: {
    backgroundColor: Colors.secondary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
});
