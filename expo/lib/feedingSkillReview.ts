import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
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

export function isTodayAllowed(allowedDays: string[]): boolean {
  if (!allowedDays || allowedDays.length === 0) return false;
  const today = DAY_NAMES[new Date().getDay()];
  return allowedDays.map(d => d.toLowerCase()).includes(today);
}

export function getNextAllowedDay(allowedDays: string[]): string | null {
  if (!allowedDays || allowedDays.length === 0) return null;
  const todayIdx = new Date().getDay();
  const lowerDays = allowedDays.map(d => d.toLowerCase());
  for (let i = 1; i <= 7; i++) {
    const checkIdx = (todayIdx + i) % 7;
    if (lowerDays.includes(DAY_NAMES[checkIdx])) {
      return DAY_NAMES[checkIdx];
    }
  }
  return null;
}

export async function fetchFeedingReviewRequirement(
  patientId: string,
  feedingSkillVideoId: string
): Promise<FeedingSkillReviewRequirement | null> {
  try {
    log('[FeedingReview] Fetching requirement for patient:', patientId, 'video:', feedingSkillVideoId);
    const { data, error } = await supabase
      .from('feeding_skill_review_requirements')
      .select('*')
      .eq('patient_id', patientId)
      .eq('feeding_skill_video_id', feedingSkillVideoId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      log('[FeedingReview] Fetch error:', error);
      return null;
    }
    log('[FeedingReview] Requirement:', data ? 'found' : 'none');
    return data as FeedingSkillReviewRequirement | null;
  } catch (e) {
    log('[FeedingReview] Exception:', e);
    return null;
  }
}

export async function countTodayFeedingSubmissions(
  patientId: string,
  feedingSkillVideoId: string
): Promise<number> {
  try {
    const today = getTodayDateString();
    const { count, error } = await supabase
      .from('feeding_skill_video_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .eq('feeding_skill_video_id', feedingSkillVideoId)
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
  const lower = uri.toLowerCase();
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.m4v')) return 'video/x-m4v';
  return 'video/quicktime';
}

function getFileExtension(ct: string): string {
  if (ct === 'video/quicktime') return 'mov';
  if (ct === 'video/x-m4v') return 'm4v';
  return 'mp4';
}

interface UploadSubmitResult {
  success: boolean;
  errorDetail?: string;
}

export async function uploadAndSubmitFeedingVideo(
  videoUri: string,
  patientId: string,
  requirementId: string | null,
  feedingSkillVideoId: string,
  videoTitleEn: string,
  durationSeconds?: number
): Promise<UploadSubmitResult> {
  try {
    const today = getTodayDateString();
    const sanitizedTitle = videoTitleEn.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const timestamp = Date.now();
    const contentType = detectContentType(videoUri);
    const ext = getFileExtension(contentType);
    const filePath = `${patientId}/${today}-feeding-${sanitizedTitle}-${timestamp}.${ext}`;

    log('[FeedingReview] Upload start — uri:', videoUri);

    const normalizedUri = Platform.OS === 'ios' && !videoUri.startsWith('file://')
      ? `file://${videoUri}`
      : videoUri;

    const fileInfo = await FileSystem.getInfoAsync(normalizedUri);
    if (!fileInfo.exists) {
      return { success: false, errorDetail: 'Video file does not exist' };
    }
    const fileSize = (fileInfo as any).size || 0;
    log('[FeedingReview] File exists, size:', fileSize);
    if (fileSize === 0) {
      return { success: false, errorDetail: 'Video file is empty (0 bytes)' };
    }

    let stableUri = normalizedUri;
    if (Platform.OS !== 'web') {
      try {
        stableUri = `${FileSystem.cacheDirectory}upload_ready_feeding_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: normalizedUri, to: stableUri });
        const stableInfo = await FileSystem.getInfoAsync(stableUri);
        log('[FeedingReview] Copied to stable path:', stableUri, 'size:', (stableInfo as any).size);
      } catch (copyErr) {
        log('[FeedingReview] Copy to stable path failed, using original:', copyErr);
        stableUri = normalizedUri;
      }
    }

    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/review-videos/${filePath}`;
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token || SUPABASE_ANON_KEY;

    const uploadResult = await FileSystem.uploadAsync(uploadUrl, stableUri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': contentType,
        'x-upsert': 'true',
        'Cache-Control': 'max-age=3600',
      },
    });

    log('[FeedingReview] Upload result status:', uploadResult.status);

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      log('[FeedingReview] Upload failed:', uploadResult.body);
      return { success: false, errorDetail: 'Storage upload failed: ' + uploadResult.body };
    }

    const videoUrl = filePath;

    const row: Record<string, unknown> = {
      patient_id: patientId,
      feeding_skill_video_id: feedingSkillVideoId,
      video_title_en: videoTitleEn,
      video_url: videoUrl,
      submission_date: today,
      review_status: 'pending',
      video_duration_seconds: durationSeconds || null,
    };
    if (requirementId) row.requirement_id = requirementId;

    const { error: insErr } = await supabase
      .from('feeding_skill_video_submissions')
      .insert(row);

    if (insErr) {
      return { success: false, errorDetail: 'Insert: ' + insErr.message };
    }

    log('[FeedingReview] Done — path:', filePath);
    return { success: true };
  } catch (e) {
    return { success: false, errorDetail: String(e) };
  }
}

export async function fetchPatientFeedingSubmissions(patientId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('feeding_skill_video_submissions')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}
