import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { FeedingSkillReviewRequirement } from '@/types';
import { File as ExpoFile } from 'expo-file-system';

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

export async function uploadAndSubmitFeedingVideo(
  videoUri: string,
  patientId: string,
  requirementId: string,
  feedingSkillVideoId: string,
  videoTitleEn: string
): Promise<boolean> {
  try {
    const today = getTodayDateString();
    const sanitizedTitle = videoTitleEn.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const timestamp = Date.now();

    log('[FeedingReview] Starting upload for video URI:', videoUri);

    const file = new ExpoFile(videoUri);
    if (!file.exists) {
      log('[FeedingReview] Video file does not exist at URI:', videoUri);
      return false;
    }
    log('[FeedingReview] File exists, size:', file.size);

    if (file.size === 0) {
      log('[FeedingReview] Video file is empty (0 bytes), aborting upload');
      return false;
    }

    const bytes = await file.bytes();

    if (!bytes || bytes.length === 0) {
      log('[FeedingReview] Failed to read video file bytes');
      return false;
    }

    log('[FeedingReview] Read bytes length:', bytes.length);

    const contentType = detectContentType(videoUri);
    const extension = getFileExtension(contentType);
    const filePath = `feeding/${patientId}/${today}-${sanitizedTitle}-${timestamp}.${extension}`;

    log('[FeedingReview] Uploading to:', filePath, 'contentType:', contentType, 'size:', bytes.length);

    const { error: uploadError } = await supabase.storage
      .from('review-videos')
      .upload(filePath, bytes.buffer, {
        contentType,
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      log('[FeedingReview] Upload error:', JSON.stringify(uploadError));
      return false;
    }

    log('[FeedingReview] Upload successful');

    const { data: urlData } = supabase.storage
      .from('review-videos')
      .getPublicUrl(filePath);

    const videoUrl = urlData?.publicUrl || filePath;
    log('[FeedingReview] Video URL:', videoUrl);

    const { error: insertError } = await supabase
      .from('feeding_skill_video_submissions')
      .insert({
        requirement_id: requirementId,
        patient_id: patientId,
        feeding_skill_video_id: feedingSkillVideoId,
        video_title_en: videoTitleEn,
        video_url: videoUrl,
        submission_date: today,
        review_status: 'pending',
      });

    if (insertError) {
      log('[FeedingReview] Insert error:', JSON.stringify(insertError));
      return false;
    }

    log('[FeedingReview] Submission successful');
    return true;
  } catch (e) {
    log('[FeedingReview] Submit exception:', e);
    return false;
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
