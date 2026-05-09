import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { ExerciseReviewRequirement, ExerciseVideoSubmission } from '@/types';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

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
  const lowerDays = allowedDays.map(d => d.toLowerCase());
  const todayIndex = new Date().getDay();
  for (let i = 1; i <= 7; i++) {
    const checkIndex = (todayIndex + i) % 7;
    const dayName = DAY_NAMES[checkIndex];
    if (lowerDays.includes(dayName)) {
      return dayName;
    }
  }
  return allowedDays[0];
}

export function isTodayAllowed(allowedDays: string[]): boolean {
  if (!allowedDays || allowedDays.length === 0) return false;
  const today = getTodayDayName().toLowerCase();
  return allowedDays.some(d => d.toLowerCase() === today);
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

function detectContentType(uri: string, blobType?: string): string {
  const lowerUri = uri.toLowerCase();
  if (lowerUri.endsWith('.mov')) return 'video/quicktime';
  if (lowerUri.endsWith('.mp4')) return 'video/mp4';
  if (lowerUri.endsWith('.m4v')) return 'video/x-m4v';
  if (blobType && blobType !== 'application/octet-stream' && blobType.startsWith('video/')) {
    return blobType;
  }
  return 'video/quicktime';
}

function getFileExtension(contentType: string): string {
  if (contentType === 'video/quicktime') return 'mov';
  if (contentType === 'video/x-m4v') return 'm4v';
  return 'mp4';
}

export async function uploadAndSubmitVideo(
  videoUri: string,
  patientId: string,
  requirementId: string,
  exerciseTitleEn: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const today = getTodayDateString();
    const sanitizedTitle = exerciseTitleEn.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const timestamp = Date.now();

    log('[ReviewReq] Starting upload for video URI:', videoUri);

    const normalizedUri = Platform.OS === 'ios' && !videoUri.startsWith('file://')
      ? `file://${videoUri}`
      : videoUri;
    log('[ReviewReq] Normalized URI:', normalizedUri);

    const fileInfo = await FileSystem.getInfoAsync(normalizedUri);
    if (!fileInfo.exists) {
      log('[ReviewReq] Video file does not exist at URI:', normalizedUri);
      return { success: false, error: 'Video file does not exist' };
    }
    const fileSize = (fileInfo as any).size || 0;
    log('[ReviewReq] File exists, size:', fileSize);

    if (fileSize === 0) {
      log('[ReviewReq] Video file is empty (0 bytes), aborting upload');
      return { success: false, error: 'Video file is empty (0 bytes)' };
    }

    let stableUri = normalizedUri;
    if (Platform.OS !== 'web') {
      try {
        const ext = normalizedUri.toLowerCase().endsWith('.mp4') ? 'mp4' : 'mov';
        stableUri = `${FileSystem.cacheDirectory}upload_ready_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: normalizedUri, to: stableUri });
        const stableInfo = await FileSystem.getInfoAsync(stableUri);
        log('[ReviewReq] Copied to stable path:', stableUri, 'size:', (stableInfo as any).size);
      } catch (copyErr) {
        log('[ReviewReq] Copy to stable path failed, using original:', copyErr);
        stableUri = normalizedUri;
      }
    }

    const contentType = detectContentType(videoUri);
    const extension = getFileExtension(contentType);
    const filePath = `${patientId}/${today}-${sanitizedTitle}-${timestamp}.${extension}`;

    log('[ReviewReq] Uploading to:', filePath, 'contentType:', contentType);

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

    log('[ReviewReq] Upload result status:', uploadResult.status);

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      log('[ReviewReq] Upload failed:', uploadResult.body);
      return { success: false, error: 'Storage upload failed: ' + uploadResult.body };
    }

    log('[ReviewReq] Upload successful');

    const videoUrl = filePath;
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
      log('[ReviewReq] Insert error:', JSON.stringify(insertError));
      return { success: false, error: 'DB insert failed: ' + JSON.stringify(insertError) };
    }

    log('[ReviewReq] Submission successful, file:', filePath, 'contentType:', contentType);
    return { success: true };
  } catch (e) {
    log('[ReviewReq] Submit exception:', e);
    return { success: false, error: 'Exception: ' + (e instanceof Error ? e.message : String(e)) };
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
