export type Language = 'en' | 'zh_hant' | 'zh_hans';

export type FontSizeLevel = 'small' | 'medium' | 'large' | 'extraLarge';

export interface Patient {
  id: string;
  access_code: string;
  patient_name: string;
  created_at: string;
  reinforcement_audio_youtube_id?: string | null;
  reinforcement_audio_youtube_id_zh_hant?: string | null;
  reinforcement_audio_youtube_id_zh_hans?: string | null;
  reinforcement_audio_url_en?: string | null;
  reinforcement_audio_url_zh_hant?: string | null;
  reinforcement_audio_url_zh_hans?: string | null;
}

export interface ExerciseProgram {
  id: string;
  patient_id: string;
  issue_date: string;
  expiry_date: string;
  remarks: string | null;
  is_active: boolean;
  created_at: string;
  exercises?: Exercise[];
}

export interface ExerciseLibrary {
  id: string;
  vimeo_video_id?: string | null;
  youtube_video_id?: string | null;
}

export interface Exercise {
  id: string;
  program_id: string;
  title_en: string;
  title_zh_hant: string;
  title_zh_hans: string;
  youtube_video_id: string;
  vimeo_video_id?: string | null;
  exercise_library_id?: string | null;
  exercise_library?: ExerciseLibrary | null;
  duration_minutes: number;
  dosage: string;
  dosage_zh_hant: string | null;
  dosage_zh_hans: string | null;
  dosage_per_day: number | null;
  dosage_days_per_week: number | null;
  modifications: string | null;
  sort_order: number;
  category: string | null;
  narrative_audio_youtube_id?: string | null;
  narrative_audio_youtube_id_zh_hant?: string | null;
  narrative_audio_youtube_id_zh_hans?: string | null;
  audio_instruction_url_en?: string | null;
  audio_instruction_url_zh_hant?: string | null;
  audio_instruction_url_zh_hans?: string | null;
  created_at: string;
}

export interface ExerciseLog {
  id: string;
  patient_id: string;
  exercise_id: string;
  completed_at: string;
  self_rating?: number | null;
  exercises?: Pick<Exercise, 'title_en' | 'title_zh_hant' | 'title_zh_hans'>;
}

export interface AppSession {
  id: string;
  patient_id: string;
  opened_at: string;
  closed_at: string | null;
  duration_seconds: number | null;
}

export interface ExerciseCompliance {
  exercise_id: string;
  title_en: string;
  title_zh_hant: string;
  title_zh_hans: string;
  category: string | null;
  dosage_per_day: number | null;
  dosage_days_per_week: number | null;
  total_completions: number;
  days_with_completions: number;
  program_days: number;
  daily_compliance_rate: number;
  weekly_compliance_rate: number;
  average_self_rating: number | null;
}

export type KnowledgeVideoCategory = 'educational' | 'condition_knowledge' | 'caregiver_guidance' | 'other';

export interface KnowledgeVideo {
  id: string;
  title_en: string;
  title_zh: string;
  description_en: string;
  description_zh: string;
  category: KnowledgeVideoCategory;
  vimeo_video_id: string | null;
  youtube_video_id: string | null;
  tags: string[] | null;
  creator_name_en: string | null;
  creator_name_zh: string | null;
  provider_org_en: string | null;
  provider_org_zh: string | null;
  provider_logo_url: string | null;
  is_active?: boolean;
  created_at?: string;
}

export interface KnowledgeVideoAssignment {
  id: string;
  video_id: string;
  patient_id: string;
  target_type: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  viewed_at: string | null;
  knowledge_videos: KnowledgeVideo;
}

export type NotificationType = 'announcement' | 'festive' | 'poster' | 'video' | 'link';

export interface AppNotification {
  id: string;
  title_en: string;
  title_zh: string;
  body_en: string;
  body_zh: string;
  type: NotificationType;
  image_url: string | null;
  video_url: string | null;
  link_url: string | null;
  target_type: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export interface NotificationRecipient {
  id: string;
  notification_id: string;
  patient_id: string;
  dismissed_date: string | null;
  read_at: string | null;
  notifications: AppNotification;
}

export interface ExerciseReviewRequirement {
  id: string;
  program_id: string;
  exercise_title_en: string;
  patient_id: string;
  max_submissions: number;
  allowed_days: string[];
  is_active: boolean;
  notes: string | null;
  created_at?: string;
}

export type ReviewStatus = 'pending' | 'reviewed' | 'redo_requested';

export interface ExerciseVideoSubmission {
  id: string;
  requirement_id: string;
  patient_id: string;
  exercise_title_en: string;
  video_url: string;
  submission_date: string;
  review_status: ReviewStatus;
  reviewer_notes: string | null;
  rating: number | null;
  reviewed_at: string | null;
  created_at?: string;
  exercise_review_requirements?: ExerciseReviewRequirement;
}

export interface Organisation {
  id: string;
  name_en: string;
  name_zh: string;
  logo_url: string | null;
  website_url: string | null;
  type: 'partner' | 'supporter';
  sort_order: number;
  is_active: boolean;
}

export interface FeedingSkillVideo {
  id: string;
  title_en: string;
  title_zh_hant: string | null;
  title_zh_hans: string | null;
  description_en: string | null;
  description_zh_hant: string | null;
  description_zh_hans: string | null;
  category: string | null;
  vimeo_video_id: string | null;
  youtube_video_id: string | null;
  is_active: boolean;
}

export interface FeedingSkillAssignment {
  id: string;
  video_id: string;
  patient_id: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  viewed_at: string | null;
  feeding_skill_videos: FeedingSkillVideo;
}

export interface FeedingSkillReviewRequirement {
  id: string;
  feeding_skill_video_id: string;
  patient_id: string;
  max_submissions: number;
  allowed_days: string[];
  is_active: boolean;
  notes: string | null;
  created_at?: string;
}

export interface FeedingSkillVideoSubmission {
  id: string;
  requirement_id: string;
  patient_id: string;
  feeding_skill_video_id: string;
  video_title_en: string;
  video_url: string;
  submission_date: string;
  review_status: ReviewStatus;
  reviewer_notes: string | null;
  rating: number | null;
  reviewed_at: string | null;
  created_at?: string;
  feeding_skill_review_requirements?: FeedingSkillReviewRequirement;
}

export const FONT_SCALES: Record<FontSizeLevel, number> = {
  small: 0.8,
  medium: 1.0,
  large: 1.25,
  extraLarge: 1.6,
};

export const BASE_FONT_SIZE = 16;
