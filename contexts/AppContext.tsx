import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import translations from '@/constants/i18n';
import { Language, FontSizeLevel, SubtitleSizeLevel, FONT_SCALES, Acknowledgement } from '@/types';
import { setupSessionTracking } from '@/lib/analytics';
import { checkAndQueueCampaigns, QueuedCampaign } from '@/lib/marketingDraw';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

const STORAGE_KEYS = {
  LANGUAGE: 'app_language',
  TERMS_ACCEPTED: 'app_terms_accepted',
  PATIENT_ID: 'app_patient_id',
  PATIENT_NAME: 'app_patient_name',
  ACCESS_CODE: 'app_access_code',
  FONT_SIZE_LEVEL: 'app_font_size_level',
  TUTORIAL_COMPLETED: 'app_tutorial_completed',
  SUBTITLE_SIZE_LEVEL: 'app_subtitle_size_level',
  CONSENT_ACCEPTED: 'nanohab_consent_accepted',
  GROUP_SESSION_ID: 'group_session_id',
  GROUP_PARTICIPANT_ID: 'group_participant_id',
  GROUP_PARTICIPANT_TOKEN: 'group_participant_token',
};

async function checkActiveGroupSession(): Promise<{ sessionId: string; participantId: string } | null> {
  try {
    const [sid, pid] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.GROUP_SESSION_ID),
      AsyncStorage.getItem(STORAGE_KEYS.GROUP_PARTICIPANT_ID),
    ]);
    if (!sid || !pid) return null;
    const { data: session } = await supabase
      .from('group_sessions')
      .select('id, status')
      .eq('id', sid)
      .maybeSingle();
    if (!session || session.status === 'ended') {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.GROUP_SESSION_ID,
        STORAGE_KEYS.GROUP_PARTICIPANT_ID,
        STORAGE_KEYS.GROUP_PARTICIPANT_TOKEN,
      ]);
      return null;
    }
    const { data: participant } = await supabase
      .from('group_participants')
      .select('id, status, reconnection_count')
      .eq('id', pid)
      .maybeSingle();
    if (!participant || (participant.status !== 'accepted' && participant.status !== 'active')) {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.GROUP_SESSION_ID,
        STORAGE_KEYS.GROUP_PARTICIPANT_ID,
        STORAGE_KEYS.GROUP_PARTICIPANT_TOKEN,
      ]);
      return null;
    }
    try {
      await supabase
        .from('group_participants')
        .update({
          reconnection_count: (participant.reconnection_count || 0) + 1,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', pid);
    } catch {}
    return { sessionId: sid, participantId: pid };
  } catch (e) {
    log('[AppContext] checkActiveGroupSession error:', e);
    return null;
  }
}

export { checkActiveGroupSession };

export const [AppProvider, useApp] = createContextHook(() => {
  const [language, setLanguageState] = useState<Language | null>(null);
  const [consentAccepted, setConsentAcceptedState] = useState<boolean>(false);
  const [termsAccepted, setTermsAcceptedState] = useState<boolean>(false);
  const [patientId, setPatientIdState] = useState<string | null>(null);
  const [patientName, setPatientNameState] = useState<string | null>(null);
  const [accessCode, setAccessCodeState] = useState<string | null>(null);
  const [fontSizeLevel, setFontSizeLevelState] = useState<FontSizeLevel>('medium');
  const [isReady, setIsReady] = useState<boolean>(false);
  const [reinforcementAudioId, setReinforcementAudioId] = useState<string | null>(null);
  const [reinforcementAudioUrl, setReinforcementAudioUrl] = useState<string | null>(null);
  const [tutorialCompleted, setTutorialCompletedState] = useState<boolean>(false);
  const [therapistPhotoUrl, setTherapistPhotoUrl] = useState<string | null>(null);
  const [therapistCartoonUrl, setTherapistCartoonUrl] = useState<string | null>(null);
  const [therapistNameEn, setTherapistNameEn] = useState<string | null>(null);
  const [therapistNameZh, setTherapistNameZh] = useState<string | null>(null);
  const [managingOrgNameEn, setManagingOrgNameEn] = useState<string | null>(null);
  const [managingOrgNameZh, setManagingOrgNameZh] = useState<string | null>(null);
  const [managingOrgLogoUrl, setManagingOrgLogoUrl] = useState<string | null>(null);
  const [acknowledgements, setAcknowledgements] = useState<Acknowledgement[]>([]);
  const [liveSubtitlesEnabled, setLiveSubtitlesEnabledState] = useState<boolean>(false);
  const [mahjongGameEnabled, setMahjongGameEnabledState] = useState<boolean>(true);
  const [mahjongGameLevel, setMahjongGameLevelState] = useState<string>('basic');
  const [subtitleSizeLevel, setSubtitleSizeLevelState] = useState<SubtitleSizeLevel>('medium');

  const [flowersJustStolen, setFlowersJustStolen] = useState<number>(0);
  const [drawQueue, setDrawQueue] = useState<QueuedCampaign[]>([]);
  const [drawModalVisible, setDrawModalVisible] = useState<boolean>(false);
  const appOpenMarketingChecked = useRef<boolean>(false);

  useEffect(() => {
    void loadPersistedState();
  }, []);

  const loadPersistedState = async () => {
    try {
      const [lang, consent, terms, pid, pname, code, fsize, tutorialVal, subSize] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.LANGUAGE),
        AsyncStorage.getItem(STORAGE_KEYS.CONSENT_ACCEPTED),
        AsyncStorage.getItem(STORAGE_KEYS.TERMS_ACCEPTED),
        AsyncStorage.getItem(STORAGE_KEYS.PATIENT_ID),
        AsyncStorage.getItem(STORAGE_KEYS.PATIENT_NAME),
        AsyncStorage.getItem(STORAGE_KEYS.ACCESS_CODE),
        AsyncStorage.getItem(STORAGE_KEYS.FONT_SIZE_LEVEL),
        AsyncStorage.getItem(STORAGE_KEYS.TUTORIAL_COMPLETED),
        AsyncStorage.getItem(STORAGE_KEYS.SUBTITLE_SIZE_LEVEL),
      ]);
      if (lang) setLanguageState(lang as Language);
      if (consent) setConsentAcceptedState(true);
      if (terms === 'true') setTermsAcceptedState(true);
      if (pid) setPatientIdState(pid);
      if (pname) setPatientNameState(pname);
      if (code) setAccessCodeState(code);
      if (fsize) setFontSizeLevelState(fsize as FontSizeLevel);
      if (tutorialVal === 'true') setTutorialCompletedState(true);
      if (subSize) setSubtitleSizeLevelState(subSize as SubtitleSizeLevel);

      if (pid) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session && code) {
          const authEmail = `patient-${code}@nanohab.internal`;
          try {
            const { error: reAuthError } = await supabase.auth.signInWithPassword({
              email: authEmail,
              password: code,
            });
            if (reAuthError) {
              await Promise.all([
                AsyncStorage.removeItem(STORAGE_KEYS.PATIENT_ID),
                AsyncStorage.removeItem(STORAGE_KEYS.PATIENT_NAME),
                AsyncStorage.removeItem(STORAGE_KEYS.ACCESS_CODE),
              ]);
              setPatientIdState(null);
              setPatientNameState(null);
              setAccessCodeState(null);
            }
          } catch (reAuthErr) {
          }
        }
      }
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

  const setConsentAccepted = useCallback(async () => {
    setConsentAcceptedState(true);
    await AsyncStorage.setItem(STORAGE_KEYS.CONSENT_ACCEPTED, new Date().toISOString());
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
    try {
      await supabase.auth.signOut();
    } catch (e) {
    }
    setPatientIdState(null);
    setPatientNameState(null);
    setAccessCodeState(null);
    setTherapistPhotoUrl(null);
    setTherapistCartoonUrl(null);
    setTherapistNameEn(null);
    setTherapistNameZh(null);
    setManagingOrgNameEn(null);
    setManagingOrgNameZh(null);
    setManagingOrgLogoUrl(null);
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

  const setTutorialCompleted = useCallback(async () => {
    setTutorialCompletedState(true);
    await AsyncStorage.setItem(STORAGE_KEYS.TUTORIAL_COMPLETED, 'true');
  }, []);

  const resetTutorial = useCallback(async () => {
    setTutorialCompletedState(false);
    await AsyncStorage.removeItem(STORAGE_KEYS.TUTORIAL_COMPLETED);
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
    if (!patientId || !isReady) return;

    const checkFlowerTheft = async () => {
      try {
        log('[AppContext] Checking flower theft for patient:', patientId);

        const { data: patientData, error: pErr } = await supabase
          .from('patients')
          .select('last_exercise_date, consecutive_inactive_days')
          .eq('id', patientId)
          .single();

        if (pErr || !patientData) {
          log('[AppContext] Failed to fetch patient for theft check:', pErr);
          return;
        }

        const today = new Date().toISOString().split('T')[0];
        const lastExDate = patientData.last_exercise_date;

        let inactiveDays = 0;
        if (lastExDate) {
          const last = new Date(lastExDate);
          const now = new Date(today);
          inactiveDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
        }

        if (inactiveDays !== patientData.consecutive_inactive_days) {
          log('[AppContext] Updating consecutive_inactive_days from', patientData.consecutive_inactive_days, 'to', inactiveDays);
          await supabase.from('patients').update({
            consecutive_inactive_days: inactiveDays,
          }).eq('id', patientId);
        }

        if (inactiveDays >= 3) {
          const { data: flowers } = await supabase
            .from('patient_flowers')
            .select('id, flower_type_id')
            .eq('patient_id', patientId)
            .eq('is_stolen', false);

          if (flowers && flowers.length > 1) {
            const toSteal = Math.min(
              Math.floor(inactiveDays / 3),
              3,
              flowers.length - 1
            );

            if (toSteal > 0) {
              const shuffled = [...flowers].sort(() => Math.random() - 0.5);
              const stolen = shuffled.slice(0, toSteal);

              for (const f of stolen) {
                await supabase.from('patient_flowers').update({
                  is_stolen: true,
                  stolen_at: new Date().toISOString(),
                }).eq('id', f.id);

                await supabase.from('flower_theft_log').insert({
                  patient_id: patientId,
                  flower_id: f.id,
                  flower_type_id: f.flower_type_id,
                  days_inactive: inactiveDays,
                });
              }

              log('[AppContext] Stole', toSteal, 'flowers due to', inactiveDays, 'days inactive');
              setFlowersJustStolen(toSteal);
            }
          }
        }
      } catch (e) {
        log('[AppContext] Flower theft check error:', e);
      }
    };

    void checkFlowerTheft();
  }, [patientId, isReady]);

  useEffect(() => {
    const fetchAcknowledgements = async () => {
      try {
        log('[AppContext] Fetching acknowledgements');
        const { data, error } = await supabase
          .from('acknowledgements')
          .select('*')
          .eq('is_active', true)
          .order('sort_order');
        if (error) {
          log('[AppContext] Error fetching acknowledgements:', error);
        } else {
          setAcknowledgements(data || []);
        }
      } catch (e) {
        log('[AppContext] Failed to fetch acknowledgements:', e);
      }
    };
    void fetchAcknowledgements();
  }, []);

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
          .select('reinforcement_audio_youtube_id, reinforcement_audio_youtube_id_zh_hant, reinforcement_audio_youtube_id_zh_hans, reinforcement_audio_url_en, reinforcement_audio_url_zh_hant, reinforcement_audio_url_zh_hans, therapist_photo_url, therapist_cartoon_url, therapist_name_en, therapist_name_zh, managing_org_name_en, managing_org_name_zh, managing_org_logo_url, live_subtitles_enabled, mahjong_game_enabled, mahjong_game_level')
          .eq('id', patientId)
          .single();

        if (patientError) {
          log('[AppContext] Error fetching patient reinforcement audio:', patientError);
        }

        let audioUrl: string | null = null;
        let audioId: string | null = null;

        if (patientData) {
          setTherapistPhotoUrl(patientData.therapist_photo_url || null);
          setTherapistCartoonUrl(patientData.therapist_cartoon_url || null);
          setTherapistNameEn(patientData.therapist_name_en || null);
          setTherapistNameZh(patientData.therapist_name_zh || null);
          setManagingOrgNameEn(patientData.managing_org_name_en || null);
          setManagingOrgNameZh(patientData.managing_org_name_zh || null);
          setManagingOrgLogoUrl(patientData.managing_org_logo_url || null);
          setLiveSubtitlesEnabledState(patientData.live_subtitles_enabled === true);
          setMahjongGameEnabledState(patientData.mahjong_game_enabled !== false);
          setMahjongGameLevelState(patientData.mahjong_game_level || 'basic');

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
    void fetchReinforcementAudio();
  }, [patientId, language]);

  const setLiveSubtitlesEnabled = useCallback(async (value: boolean) => {
    setLiveSubtitlesEnabledState(value);
    if (patientId) {
      try {
        log('[AppContext] Updating live_subtitles_enabled to', value, 'for patient:', patientId);
        await supabase.from('patients').update({ live_subtitles_enabled: value }).eq('id', patientId);
      } catch (e) {
        log('[AppContext] Failed to update live_subtitles_enabled:', e);
      }
    }
  }, [patientId]);


  const setMahjongGameEnabled = useCallback(async (value: boolean) => {
    setMahjongGameEnabledState(value);
    if (patientId) {
      try {
        log('[AppContext] Updating mahjong_game_enabled to', value, 'for patient:', patientId);
        await supabase.from('patients').update({ mahjong_game_enabled: value }).eq('id', patientId);
      } catch (e) {
        log('[AppContext] Failed to update mahjong_game_enabled:', e);
      }
    }
  }, [patientId]);

  const setMahjongGameLevel = useCallback(async (level: string) => {
    setMahjongGameLevelState(level);
    if (patientId) {
      try {
        log('[AppContext] Updating mahjong_game_level to', level, 'for patient:', patientId);
        await supabase.from('patients').update({ mahjong_game_level: level }).eq('id', patientId);
      } catch (e) {
        log('[AppContext] Failed to update mahjong_game_level:', e);
      }
    }
  }, [patientId]);

  const setSubtitleSizeLevel = useCallback(async (level: SubtitleSizeLevel) => {
    log('[AppContext] Setting subtitle size level to', level);
    setSubtitleSizeLevelState(level);
    await AsyncStorage.setItem(STORAGE_KEYS.SUBTITLE_SIZE_LEVEL, level);
  }, []);

  const clearFlowersStolen = useCallback(() => setFlowersJustStolen(0), []);

  const patientIdRef = useRef(patientId);
  useEffect(() => { patientIdRef.current = patientId; }, [patientId]);

  const refreshPatient = useCallback(async () => {
    if (!patientId) return;
    try {
      log('[AppContext] Refreshing patient data for:', patientId);
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', patientId)
        .single();
      if (error) {
        log('[AppContext] refreshPatient error:', error);
        return;
      }
      if (data) {
        setTherapistPhotoUrl(data.therapist_photo_url || null);
        setTherapistCartoonUrl(data.therapist_cartoon_url || null);
        setTherapistNameEn(data.therapist_name_en || null);
        setTherapistNameZh(data.therapist_name_zh || null);
        setManagingOrgNameEn(data.managing_org_name_en || null);
        setManagingOrgNameZh(data.managing_org_name_zh || null);
        setManagingOrgLogoUrl(data.managing_org_logo_url || null);
        setLiveSubtitlesEnabledState(data.live_subtitles_enabled === true);
        setMahjongGameEnabledState(data.mahjong_game_enabled !== false);
        setMahjongGameLevelState(data.mahjong_game_level || 'basic');
        log('[AppContext] Patient data refreshed successfully');
      }
    } catch (e) {
      log('[AppContext] refreshPatient exception:', e);
    }
  }, [patientId]);

  const addToDrawQueue = useCallback((campaigns: QueuedCampaign[]) => {
    if (campaigns.length === 0) return;
    log('[AppContext] Adding', campaigns.length, 'campaigns to draw queue');
    setDrawQueue(prev => {
      const updated = [...prev, ...campaigns];
      return updated;
    });
    setDrawModalVisible(true);
  }, []);

  const consumeDrawFromQueue = useCallback(() => {
    log('[AppContext] Consuming first draw from queue');
    setDrawQueue(prev => prev.slice(1));
  }, []);

  const dismissDrawModal = useCallback(() => {
    log('[AppContext] Dismissing draw modal, clearing queue');
    setDrawModalVisible(false);
    setDrawQueue([]);
  }, []);

  const closeDrawModalKeepQueue = useCallback(() => {
    log('[AppContext] Closing draw modal, keeping remaining queue');
    setDrawModalVisible(false);
  }, []);

  useEffect(() => {
    if (!patientId || !isReady) return;
    const expirePrizes = async () => {
      try {
        log('[AppContext] Expiring old prizes for patient:', patientId);
        await supabase.rpc('expire_patient_prizes', { p_patient_id: patientId });
      } catch (e) {
        log('[AppContext] expire_patient_prizes error:', e);
      }
    };
    void expirePrizes();
  }, [patientId, isReady]);

  useEffect(() => {
    if (!patientId || !isReady || appOpenMarketingChecked.current) return;
    appOpenMarketingChecked.current = true;
    const checkAppOpenCampaigns = async () => {
      try {
        log('[AppContext] Checking app-open marketing campaigns');
        const queued = await checkAndQueueCampaigns(patientId, 'app_open');
        if (queued.length > 0) {
          addToDrawQueue(queued);
        }
      } catch (e) {
        log('[AppContext] App-open campaign check error:', e);
      }
    };
    const timer = setTimeout(checkAppOpenCampaigns, 2000);
    return () => clearTimeout(timer);
  }, [patientId, isReady, addToDrawQueue]);

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && patientIdRef.current) {
        log('[AppContext] App returned to foreground, refreshing patient');
        void refreshPatient();
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [refreshPatient]);

  const fontScale = FONT_SCALES[fontSizeLevel];

  return useMemo(() => ({
    language,
    consentAccepted,
    termsAccepted,
    patientId,
    patientName,
    accessCode,
    fontSizeLevel,
    fontScale,
    isReady,
    reinforcementAudioId,
    reinforcementAudioUrl,
    tutorialCompleted,
    therapistPhotoUrl,
    therapistCartoonUrl,
    therapistNameEn,
    therapistNameZh,
    managingOrgNameEn,
    managingOrgNameZh,
    managingOrgLogoUrl,
    liveSubtitlesEnabled,
    subtitleSizeLevel,
    mahjongGameEnabled,
    mahjongGameLevel,
    acknowledgements,
    flowersJustStolen,
    clearFlowersStolen,
    refreshPatient,
    drawQueue,
    drawModalVisible,
    addToDrawQueue,
    consumeDrawFromQueue,
    dismissDrawModal,
    closeDrawModalKeepQueue,
    setLanguage,
    setConsentAccepted,
    setTermsAccepted,
    setPatient,
    clearPatient,
    setFontSizeLevel,
    setLiveSubtitlesEnabled,
    setSubtitleSizeLevel,
    setMahjongGameEnabled,
    setMahjongGameLevel,
    setTutorialCompleted,
    resetTutorial,
    t,
  }), [
    language, consentAccepted, termsAccepted, patientId, patientName, accessCode,
    fontSizeLevel, fontScale, isReady, reinforcementAudioId,
    reinforcementAudioUrl, tutorialCompleted,
    therapistPhotoUrl, therapistCartoonUrl, therapistNameEn, therapistNameZh,
    managingOrgNameEn, managingOrgNameZh, managingOrgLogoUrl,
    liveSubtitlesEnabled, subtitleSizeLevel,
    mahjongGameEnabled, mahjongGameLevel,
    acknowledgements,
    flowersJustStolen,
    clearFlowersStolen,
    refreshPatient,
    drawQueue, drawModalVisible, addToDrawQueue, consumeDrawFromQueue, dismissDrawModal, closeDrawModalKeepQueue,
    setLanguage, setConsentAccepted, setTermsAccepted, setPatient, clearPatient, setFontSizeLevel,
    setLiveSubtitlesEnabled, setSubtitleSizeLevel, setMahjongGameEnabled, setMahjongGameLevel,
    setTutorialCompleted, resetTutorial, t,
  ]);
});
