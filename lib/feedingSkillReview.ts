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

    log('[FeedingReview] Starting upload — URI:', videoUri, 'patient:', patientId, 'videoId:', feedingSkillVideoId, 'requirementId:', requirementId);

    const contentType = detectContentType(videoUri);
    const extension = getFileExtension(contentType);
    const filePath = `feeding/${patientId}/${today}-${sanitizedTitle}-${timestamp}.${extension}`;

    const normalizedUri = Platform.OS === 'ios' && !videoUri.startsWith('file://')
      ? `file://${videoUri}`
      : videoUri;
    log('[FeedingReview] Normalized URI:', normalizedUri);

    const response = await fetch(normalizedUri);
    if (!response.ok) {
      log('[FeedingReview] Fetch failed with status:', response.status);
      return { success: false, errorDetail: `File read failed (status ${response.status})` };
    }
    const blob = await response.blob();
    log('[FeedingReview] Blob size:', blob.size, 'type:', blob.type);
    const { Alert } = require('react-native');
    Alert.alert('DEBUG Upload', 
      `URI: ${normalizedUri.substring(0, 80)}...\nBlob size: ${blob.size}\nBlob type: ${blob.type}\nContent type: ${contentType}\nFile path: ${filePath}`
    );

    if (!blob || blob.size === 0) {
      log('[FeedingReview] Video blob is empty (0 bytes), aborting upload');
      return { success: false, errorDetail: 'Video file is empty (0 bytes)' };
    }

    log('[FeedingReview] Uploading to storage path:', filePath, 'contentType:', contentType, 'size:', blob.size);

    const { error: uploadError } = await supabase.storage
      .from('review-videos')
      .upload(filePath, blob, {
        contentType,
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      log('[FeedingReview] Storage upload FAILED:', JSON.stringify(uploadError));
      log('[FeedingReview] Upload error message:', uploadError.message);
      return { success: false, errorDetail: `Upload failed: ${uploadError.message}` };
    }

    log('[FeedingReview] Storage upload successful');

    const { data: urlData } = supabase.storage
      .from('review-videos')
      .getPublicUrl(filePath);

    const videoUrl = urlData?.publicUrl || filePath;
    log('[FeedingReview] Video public URL:', videoUrl);

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

    log('[FeedingReview] Inserting submission row:', JSON.stringify(insertPayload));

    const { error: insertError } = await supabase
      .from('feeding_skill_video_submissions')
      .insert(insertPayload);

    if (insertError) {
      log('[FeedingReview] DB insert FAILED:', JSON.stringify(insertError));
      log('[FeedingReview] Insert error code:', insertError.code, 'details:', insertError.details, 'hint:', insertError.hint);
      return { success: false, errorDetail: `DB insert failed: ${insertError.message} (code: ${insertError.code})` };
    }

    log('[FeedingReview] Submission inserted successfully');
    return { success: true };
  } catch (e) {
    log('[FeedingReview] Submit exception:', e);
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
