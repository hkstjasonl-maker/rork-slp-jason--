import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { ExerciseReviewRequirement, ExerciseVideoSubmission } from '@/types';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function getTodayDayName(): string {
  return DAY_NAMES[new Date().getDay()];
}

export function getTodayDateString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getNextAllowedDay(allowedDays: string[]): string | null {
  if (!allowedDays || allowedDays.length === 0) return null;
  const todayIndex = new Date().getDay();
  for (let i = 1; i <= 7; i++) {
    const checkIndex = (todayIndex + i) % 7;
    const dayName = DAY_NAMES[checkIndex];
    if (allowedDays.includes(dayName)) {
      return dayName;
    }
  }
  return allowedDays[0];
}

export function isTodayAllowed(allowedDays: string[]): boolean {
  if (!allowedDays || allowedDays.length === 0) return false;
  return allowedDays.includes(getTodayDayName());
}

export async function fetchReviewRequirement(
  patientId: string,
  exerciseTitleEn: string
): Promise<ExerciseReviewRequirement | null> {
  try {
    log('[ReviewReq] Fetching for patient:', patientId, 'exercise:', exerciseTitleEn);
    const { data, error } = await supabase
      .from('exercise_review_requirements')
      .select('*')
      .eq('patient_id', patientId)
      .eq('exercise_title_en', exerciseTitleEn)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      log('[ReviewReq] Error:', error);
      return null;
    }
    log('[ReviewReq] Result:', data ? 'found' : 'none');
    return data as ExerciseReviewRequirement | null;
  } catch (e) {
    log('[ReviewReq] Exception:', e);
    return null;
  }
}

export async function countTodaySubmissions(requirementId: string): Promise<number> {
  try {
    const today = getTodayDateString();
    const { count, error } = await supabase
      .from('exercise_video_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('requirement_id', requirementId)
      .eq('submission_date', today);

    if (error) {
      log('[ReviewReq] Count error:', error);
      return 0;
    }
    return count || 0;
  } catch (e) {
    log('[ReviewReq] Count exception:', e);
    return 0;
  }
}

export async function uploadAndSubmitVideo(
  videoUri: string,
  patientId: string,
  requirementId: string,
  exerciseTitleEn: string
): Promise<boolean> {
  try {
    const today = getTodayDateString();
    const sanitizedTitle = exerciseTitleEn.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const timestamp = Date.now();
    const filePath = `${patientId}/${today}-${sanitizedTitle}-${timestamp}.mp4`;

    log('[ReviewReq] Uploading video to:', filePath);

    const response = await fetch(videoUri);
    const blob = await response.blob();

    const { error: uploadError } = await supabase.storage
      .from('review-videos')
      .upload(filePath, blob, {
        contentType: 'video/mp4',
        upsert: false,
      });

    if (uploadError) {
      log('[ReviewReq] Upload error:', uploadError);
      return false;
    }

    const { data: urlData } = supabase.storage
      .from('review-videos')
      .getPublicUrl(filePath);

    const videoUrl = urlData?.publicUrl || filePath;
    log('[ReviewReq] Video URL:', videoUrl);

    const { error: insertError } = await supabase
      .from('exercise_video_submissions')
      .insert({
        requirement_id: requirementId,
        patient_id: patientId,
        exercise_title_en: exerciseTitleEn,
        video_url: videoUrl,
        submission_date: today,
        review_status: 'pending',
      });

    if (insertError) {
      log('[ReviewReq] Insert error:', insertError);
      return false;
    }

    log('[ReviewReq] Submission successful');
    return true;
  } catch (e) {
    log('[ReviewReq] Submit exception:', e);
    return false;
  }
}

export async function fetchPatientSubmissions(
  patientId: string
): Promise<ExerciseVideoSubmission[]> {
  try {
    const { data, error } = await supabase
      .from('exercise_video_submissions')
      .select('*, exercise_review_requirements(*)')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      log('[ReviewReq] Fetch submissions error:', error);
      return [];
    }
    return (data || []) as ExerciseVideoSubmission[];
  } catch (e) {
    log('[ReviewReq] Fetch submissions exception:', e);
    return [];
  }
}

export async function fetchAllReviewRequirements(
  patientId: string
): Promise<ExerciseReviewRequirement[]> {
  try {
    const { data, error } = await supabase
      .from('exercise_review_requirements')
      .select('*')
      .eq('patient_id', patientId)
      .eq('is_active', true);

    if (error) {
      log('[ReviewReq] Fetch all requirements error:', error);
      return [];
    }
    return (data || []) as ExerciseReviewRequirement[];
  } catch (e) {
    log('[ReviewReq] Fetch all requirements exception:', e);
    return [];
  }
}

export async function fetchTodaySubmissionsForExercises(
  patientId: string
): Promise<Record<string, number>> {
  try {
    const today = getTodayDateString();
    const { data, error } = await supabase
      .from('exercise_video_submissions')
      .select('exercise_title_en')
      .eq('patient_id', patientId)
      .eq('submission_date', today);

    if (error) {
      log('[ReviewReq] Fetch today subs error:', error);
      return {};
    }

    const counts: Record<string, number> = {};
    (data || []).forEach((s: { exercise_title_en: string }) => {
      counts[s.exercise_title_en] = (counts[s.exercise_title_en] || 0) + 1;
    });
    return counts;
  } catch (e) {
    log('[ReviewReq] Fetch today subs exception:', e);
    return {};
  }
}
