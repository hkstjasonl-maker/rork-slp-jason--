import { supabase } from '@/lib/supabase';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { log } from '@/lib/logger';

interface SessionLogData {
  patient_id: string;
  program_id?: string;
  exercise_id?: string;
  exercise_title_en?: string;
  exercise_title_zh?: string;
  prescribed_sets?: number;
  prescribed_reps?: number;
  completed_sets?: number;
  completed_reps?: number;
  duration_seconds?: number;
  used_mirror_mode?: boolean;
  used_split_screen?: boolean;
  audio_language?: string;
  subtitles_on?: boolean;
  playback_speed?: number;
  self_rating?: number;
  video_recorded?: boolean;
  video_submitted_for_review?: boolean;
  video_resolution?: string;
  flowers_earned?: number;
  stars_earned?: number;
  streak_day?: number;
  gacha_draws_used?: number;
  scratch_cards_opened?: number;
}

export async function logResearchSession(data: SessionLogData): Promise<void> {
  try {
    log('[ResearchLogger] Logging session:', JSON.stringify(data));

    const deviceInfo = {
      device_model: `${Platform.OS} ${Platform.Version}`,
      os_version: String(Platform.Version),
      app_version: Constants.expoConfig?.version || 'unknown',
    };

    const { error } = await supabase.from('research_session_logs').insert({
      ...data,
      ...deviceInfo,
      session_start: new Date().toISOString(),
    });

    if (error) {
      log('[ResearchLogger] Supabase insert error:', error.message);
    } else {
      log('[ResearchLogger] Session logged successfully');
    }
  } catch (error) {
    log('[ResearchLogger] Research logging error (non-blocking):', error);
  }
}
