import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { FeedingSkillReviewRequirement } from '@/types';

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

export async function fetchFeedingSkillReviewRequirement(
  patientId: string,
  feedingSkillVideoId: string
): Promise<FeedingSkillReviewRequirement | null> {
  try {
    log('[FeedingReview] Fetching for patient:', patientId, 'video:', feedingSkillVideoId);
    const { data, error } = await supabase
      .from('feeding_skill_review_requirements')
      .select('*')
      .eq('patient_id', patientId)
      .eq('feeding_skill_video_id', feedingSkillVideoId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      log('[FeedingReview] Error:', error);
      return null;
    }
    log('[FeedingReview] Result:', data ? 'found' : 'none');
    return data as FeedingSkillReviewRequirement | null;
  } catch (e) {
    log('[FeedingReview] Exception:', e);
    return null;
  }
}

export async function countTodayFeedingSubmissions(requirementId: string): Promise<number> {
  try {
    const today = getTodayDateString();
    const { count, error } = await supabase
      .from('feeding_skill_video_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('requirement_id', requirementId)
      .eq('submission_date', today);

    if (error) {
      log('[FeedingReview] Count error:', error);
      return 0;
    }
    return count || 0;
  } catch (e) {
    log('[FeedingReview] Count exception:', e);
    return 0;
  }
}

function detectContentType(uri: string): string {
  const lowerUri = uri.toLowerCase();
  if (lowerUri.endsWith('.mov')) return 'video/quicktime';
  if (lowerUri.endsWith('.mp4')) return 'video/mp4';
  if (lowerUri.endsWith('.m4v')) return 'video/x-m4v';
  return 'video/quicktime';
}

function getFileExtension(contentType: string): string {
  if (contentType === 'video/quicktime') return 'mov';
  if (contentType === 'video/x-m4v') return 'm4v';
  return 'mp4';
}

export interface UploadSubmitResult {
  success: boolean;
  errorDetail?: string;
}

export async function uploadAndSubmitFeedingVideo(
  videoUri: string,
  patientId: string,
  requirementId: string | null,
  feedingSkillVideoId: string,
  videoTitleEn: string
): Promise<UploadSubmitResult> {
  try {
    const today = getTodayDateString();
    const sanitizedTitle = videoTitleEn.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const timestamp = Date.now();

    log('[FeedingReview] Starting upload — URI:', videoUri);

    const FileSystem = require('expo-file-system');

    const normalizedUri = Platform.OS === 'ios' && !videoUri.startsWith('file://')
      ? `file://${videoUri}`
      : videoUri;
    log('[FeedingReview] Normalized URI:', normalizedUri);

    const fileInfo = await FileSystem.getInfoAsync(normalizedUri);
    if (!fileInfo.exists) {
      log('[FeedingReview] Video file does not exist');
      return { success: false, errorDetail: 'Video file does not exist' };
    }
    const fileSize = (fileInfo as any).size || 0;
    log('[FeedingReview] File exists, size:', fileSize);
    if (fileSize === 0) {
      return { success: false, errorDetail: 'Video file is empty' };
    }

    let stableUri = normalizedUri;
    if (Platform.OS !== 'web') {
      try {
        const ext = normalizedUri.toLowerCase().endsWith('.mp4') ? 'mp4' : 'mov';
        stableUri = `${FileSystem.cacheDirectory}feeding_upload_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: normalizedUri, to: stableUri });
        const stableInfo = await FileSystem.getInfoAsync(stableUri);
        log('[FeedingReview] Copied to stable path, size:', (stableInfo as any).size);
      } catch (copyErr) {
        log('[FeedingReview] Copy failed, using original:', copyErr);
        stableUri = normalizedUri;
      }
    }

    const response = await fetch(stableUri);
    if (!response.ok) {
      return { success: false, errorDetail: `Fetch failed (${response.status})` };
    }
    const blob = await response.blob();
    log('[FeedingReview] Blob size:', blob.size);

    if (!blob || blob.size === 0) {
      return { success: false, errorDetail: 'Blob is empty' };
    }

    const contentType = detectContentType(videoUri);
    const extension = getFileExtension(contentType);
    const filePath = `${patientId}/${today}-feeding-${sanitizedTitle}-${timestamp}.${extension}`;

    log('[FeedingReview] Uploading to:', filePath, 'size:', blob.size);

    const { error: uploadError } = await supabase.storage
      .from('review-videos')
      .upload(filePath, blob, {
        contentType,
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      log('[FeedingReview] Upload error:', JSON.stringify(uploadError));
      return { success: false, errorDetail: `Upload failed: ${uploadError.message}` };
    }

    log('[FeedingReview] Upload successful');

    const { data: urlData } = supabase.storage
      .from('review-videos')
      .getPublicUrl(filePath);
    const videoUrl = urlData?.publicUrl || filePath;

    const insertPayload: Record<string, unknown> = {
      patient_id: patientId,
      feeding_skill_video_id: feedingSkillVideoId,
      video_title_en: videoTitleEn,
      video_url: videoUrl,
      submission_date: today,
      review_status: 'pending',
    };
    if (requirementId) {
      insertPayload.requirement_id = requirementId;
    }

    const { error: insertError } = await supabase
      .from('feeding_skill_video_submissions')
      .insert(insertPayload);

    if (insertError) {
      log('[FeedingReview] Insert error:', JSON.stringify(insertError));
      return { success: false, errorDetail: `DB insert failed: ${insertError.message}` };
    }

    log('[FeedingReview] Submission successful');
    return { success: true };
  } catch (e) {
    log('[FeedingReview] Exception:', e);
    return { success: false, errorDetail: `Exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function fetchAllFeedingReviewRequirements(
  patientId: string
): Promise<FeedingSkillReviewRequirement[]> {
  try {
    const { data, error } = await supabase
      .from('feeding_skill_review_requirements')
      .select('*')
      .eq('patient_id', patientId)
      .eq('is_active', true);

    if (error) {
      log('[FeedingReview] Fetch all requirements error:', error);
      return [];
    }
    return (data || []) as FeedingSkillReviewRequirement[];
  } catch (e) {
    log('[FeedingReview] Fetch all requirements exception:', e);
    return [];
  }
}

export async function fetchPatientFeedingSubmissions(
  patientId: string
): Promise<import('@/types').FeedingSkillVideoSubmission[]> {
  try {
    const { data, error } = await supabase
      .from('feeding_skill_video_submissions')
      .select('*, feeding_skill_review_requirements(*)')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      log('[FeedingReview] Fetch submissions error:', error);
      return [];
    }
    return (data || []) as import('@/types').FeedingSkillVideoSubmission[];
  } catch (e) {
    log('[FeedingReview] Fetch submissions exception:', e);
    return [];
  }
}

export async function fetchTodayFeedingSubmissions(
  patientId: string
): Promise<Record<string, number>> {
  try {
    const today = getTodayDateString();
    const { data, error } = await supabase
      .from('feeding_skill_video_submissions')
      .select('feeding_skill_video_id')
      .eq('patient_id', patientId)
      .eq('submission_date', today);

    if (error) {
      log('[FeedingReview] Fetch today subs error:', error);
      return {};
    }

    const counts: Record<string, number> = {};
    (data || []).forEach((s: { feeding_skill_video_id: string }) => {
      counts[s.feeding_skill_video_id] = (counts[s.feeding_skill_video_id] || 0) + 1;
    });
    return counts;
  } catch (e) {
    log('[FeedingReview] Fetch today subs exception:', e);
    return {};
  }
}
