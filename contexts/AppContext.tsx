import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useEffect, useRef, useState } from 'react';
import translations from '@/constants/i18n';
import { Language, FontSizeLevel, FONT_SCALES } from '@/types';
import { setupSessionTracking } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

const STORAGE_KEYS = {
  LANGUAGE: 'app_language',
  TERMS_ACCEPTED: 'app_terms_accepted',
  PATIENT_ID: 'app_patient_id',
  PATIENT_NAME: 'app_patient_name',
  ACCESS_CODE: 'app_access_code',
  FONT_SIZE_LEVEL: 'app_font_size_level',
};

export const [AppProvider, useApp] = createContextHook(() => {
  const [language, setLanguageState] = useState<Language | null>(null);
  const [termsAccepted, setTermsAcceptedState] = useState<boolean>(false);
  const [patientId, setPatientIdState] = useState<string | null>(null);
  const [patientName, setPatientNameState] = useState<string | null>(null);
  const [accessCode, setAccessCodeState] = useState<string | null>(null);
  const [fontSizeLevel, setFontSizeLevelState] = useState<FontSizeLevel>('medium');
  const [isReady, setIsReady] = useState<boolean>(false);
  const [reinforcementAudioId, setReinforcementAudioId] = useState<string | null>(null);
  const [reinforcementAudioUrl, setReinforcementAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    loadPersistedState();
  }, []);

  const loadPersistedState = async () => {
    try {
      const [lang, terms, pid, pname, code, fsize] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.LANGUAGE),
        AsyncStorage.getItem(STORAGE_KEYS.TERMS_ACCEPTED),
        AsyncStorage.getItem(STORAGE_KEYS.PATIENT_ID),
        AsyncStorage.getItem(STORAGE_KEYS.PATIENT_NAME),
        AsyncStorage.getItem(STORAGE_KEYS.ACCESS_CODE),
        AsyncStorage.getItem(STORAGE_KEYS.FONT_SIZE_LEVEL),
      ]);
      if (lang) setLanguageState(lang as Language);
      if (terms === 'true') setTermsAcceptedState(true);
      if (pid) setPatientIdState(pid);
      if (pname) setPatientNameState(pname);
      if (code) setAccessCodeState(code);
      if (fsize) setFontSizeLevelState(fsize as FontSizeLevel);
    } catch (e) {
      log('Failed to load persisted state:', e);
    } finally {
      setIsReady(true);
    }
  };

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    await AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
  }, []);

  const setTermsAccepted = useCallback(async () => {
    setTermsAcceptedState(true);
    await AsyncStorage.setItem(STORAGE_KEYS.TERMS_ACCEPTED, 'true');
  }, []);

  const setPatient = useCallback(async (id: string, name: string, code: string) => {
    setPatientIdState(id);
    setPatientNameState(name);
    setAccessCodeState(code);
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.PATIENT_ID, id),
      AsyncStorage.setItem(STORAGE_KEYS.PATIENT_NAME, name),
      AsyncStorage.setItem(STORAGE_KEYS.ACCESS_CODE, code),
    ]);
  }, []);

  const clearPatient = useCallback(async () => {
    setPatientIdState(null);
    setPatientNameState(null);
    setAccessCodeState(null);
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.PATIENT_ID),
      AsyncStorage.removeItem(STORAGE_KEYS.PATIENT_NAME),
      AsyncStorage.removeItem(STORAGE_KEYS.ACCESS_CODE),
    ]);
  }, []);

  const setFontSizeLevel = useCallback(async (level: FontSizeLevel) => {
    setFontSizeLevelState(level);
    await AsyncStorage.setItem(STORAGE_KEYS.FONT_SIZE_LEVEL, level);
  }, []);

  const t = useCallback((key: string): string => {
    const lang = language || 'en';
    return translations[lang]?.[key] ?? translations.en[key] ?? key;
  }, [language]);

  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (patientId) {
      log('[AppContext] Setting up session tracking for:', patientId);
      cleanupRef.current = setupSessionTracking(patientId);
    }
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [patientId]);

  useEffect(() => {
    if (!patientId) {
      setReinforcementAudioId(null);
      setReinforcementAudioUrl(null);
      return;
    }
    const fetchReinforcementAudio = async () => {
      try {
        log('[AppContext] Fetching reinforcement audio for patient:', patientId);
        const lang = language || 'en';

        const { data: patientData, error: patientError } = await supabase
          .from('patients')
          .select('reinforcement_audio_youtube_id, reinforcement_audio_youtube_id_zh_hant, reinforcement_audio_youtube_id_zh_hans, reinforcement_audio_url_en, reinforcement_audio_url_zh_hant, reinforcement_audio_url_zh_hans')
          .eq('id', patientId)
          .single();

        if (patientError) {
          log('[AppContext] Error fetching patient reinforcement audio:', patientError);
        }

        let audioUrl: string | null = null;
        let audioId: string | null = null;

        if (patientData) {
          if (lang === 'zh_hant') {
            audioUrl = patientData.reinforcement_audio_url_zh_hant || patientData.reinforcement_audio_url_en || null;
            audioId = patientData.reinforcement_audio_youtube_id_zh_hant || patientData.reinforcement_audio_youtube_id || null;
          } else if (lang === 'zh_hans') {
            audioUrl = patientData.reinforcement_audio_url_zh_hans || patientData.reinforcement_audio_url_en || null;
            audioId = patientData.reinforcement_audio_youtube_id_zh_hans || patientData.reinforcement_audio_youtube_id || null;
          } else {
            audioUrl = patientData.reinforcement_audio_url_en || null;
            audioId = patientData.reinforcement_audio_youtube_id || null;
          }
        }

        if (!audioUrl && !audioId) {
          try {
            const { data: libData, error: libError } = await supabase
              .from('reinforcement_audio_library')
              .select('audio_url_en, audio_url_zh_hant, audio_url_zh_hans')
              .eq('is_default', true)
              .limit(1)
              .single();

            if (!libError && libData) {
              if (lang === 'zh_hant') {
                audioUrl = libData.audio_url_zh_hant || libData.audio_url_en || null;
              } else if (lang === 'zh_hans') {
                audioUrl = libData.audio_url_zh_hans || libData.audio_url_en || null;
              } else {
                audioUrl = libData.audio_url_en || null;
              }
              log('[AppContext] Using default library reinforcement audio URL:', audioUrl);
            }
          } catch (libErr) {
            log('[AppContext] Error fetching default reinforcement audio library:', libErr);
          }
        }

        log('[AppContext] Reinforcement audio URL:', audioUrl, 'YouTube ID:', audioId);
        setReinforcementAudioUrl(audioUrl);
        setReinforcementAudioId(audioId);
      } catch (e) {
        log('[AppContext] Failed to fetch reinforcement audio:', e);
      }
    };
    fetchReinforcementAudio();
  }, [patientId, language]);

  const fontScale = FONT_SCALES[fontSizeLevel];

  return {
    language,
    termsAccepted,
    patientId,
    patientName,
    accessCode,
    fontSizeLevel,
    fontScale,
    isReady,
    reinforcementAudioId,
    reinforcementAudioUrl,
    setLanguage,
    setTermsAccepted,
    setPatient,
    clearPatient,
    setFontSizeLevel,
    t,
  };
});
