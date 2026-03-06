import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { VimeoPlayer } from '@/components/VimeoPlayer';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { KnowledgeVideoAssignment, KnowledgeVideoCategory, Language } from '@/types';
import { log } from '@/lib/logger';
import {
  BookOpen,
  Play,
  ExternalLink,
  CheckCircle2,
  GraduationCap,
  Brain,
  Heart,
  Tag,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';

const CATEGORY_CONFIG: Record<KnowledgeVideoCategory, { color: string; bgColor: string; icon: typeof GraduationCap }> = {
  educational: { color: '#2E86AB', bgColor: '#E8F4F8', icon: GraduationCap },
  condition_knowledge: { color: '#A23B72', bgColor: '#F5E6EF', icon: Brain },
  caregiver_guidance: { color: '#F18F01', bgColor: '#FFF3E0', icon: Heart },
  other: { color: '#636E72', bgColor: '#F0F0F0', icon: Tag },
};

function getCategoryLabel(category: KnowledgeVideoCategory, t: (key: string) => string): string {
  const map: Record<KnowledgeVideoCategory, string> = {
    educational: t('educational'),
    condition_knowledge: t('conditionKnowledge'),
    caregiver_guidance: t('caregiverGuidance'),
    other: t('otherCategory'),
  };
  return map[category] || t('otherCategory');
}

function getVideoTitle(video: KnowledgeVideoAssignment['knowledge_videos'], language: Language | null): string {
  if (language === 'zh_hant' || language === 'zh_hans') {
    return video.title_zh || video.title_en;
  }
  return video.title_en || video.title_zh;
}

function getVideoDescription(video: KnowledgeVideoAssignment['knowledge_videos'], language: Language | null): string {
  if (language === 'zh_hant' || language === 'zh_hans') {
    return video.description_zh || video.description_en;
  }
  return video.description_en || video.description_zh;
}

function VideoCard({
  assignment,
  language,
  t,
  onMarkViewed,
}: {
  assignment: KnowledgeVideoAssignment;
  language: Language | null;
  t: (key: string) => string;
  onMarkViewed: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const video = assignment.knowledge_videos;
  const isNew = !assignment.viewed_at;
  const category = (video.category as KnowledgeVideoCategory) || 'other';
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
  const CategoryIcon = config.icon;
  const title = getVideoTitle(video, language);
  const description = getVideoDescription(video, language);

  const handleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
    if (!expanded && isNew) {
      onMarkViewed(assignment.id);
    }
  }, [expanded, isNew, assignment.id, onMarkViewed]);

  const handleOpenYouTube = useCallback(() => {
    if (video.youtube_video_id) {
      const url = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;
      Linking.openURL(url).catch((err) => log('[Learn] Failed to open YouTube:', err));
      if (isNew) {
        onMarkViewed(assignment.id);
      }
    }
  }, [video.youtube_video_id, isNew, assignment.id, onMarkViewed]);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={handleExpand}
        activeOpacity={0.7}
        testID={`knowledge-video-${assignment.id}`}
      >
        <View style={styles.cardTopRow}>
          <View style={[styles.categoryBadge, { backgroundColor: config.bgColor }]}>
            <CategoryIcon size={12} color={config.color} />
            <ScaledText size={11} weight="600" color={config.color} style={styles.categoryText}>
              {getCategoryLabel(category, t)}
            </ScaledText>
          </View>
          <View style={styles.cardStatusRow}>
            {isNew && (
              <View style={styles.newBadge}>
                <ScaledText size={10} weight="700" color="#fff">
                  {t('newBadge')}
                </ScaledText>
              </View>
            )}
            {!isNew && (
              <View style={styles.viewedBadge}>
                <CheckCircle2 size={14} color={Colors.success} />
                <ScaledText size={11} color={Colors.success} weight="500" style={styles.viewedText}>
                  {t('videoViewed')}
                </ScaledText>
              </View>
            )}
          </View>
        </View>

        <View style={styles.cardTitleRow}>
          <View style={styles.playIconWrap}>
            <Play size={18} color="#fff" fill="#fff" />
          </View>
          <View style={styles.cardTitleContent}>
            <ScaledText size={15} weight="600" color={Colors.textPrimary} numberOfLines={2}>
              {/* eslint-disable-next-line rork/general-no-raw-text */}
              {title}
            </ScaledText>
            {!expanded && description ? (
              <ScaledText size={13} color={Colors.textSecondary} numberOfLines={2} style={styles.descriptionPreview}>
                {/* eslint-disable-next-line rork/general-no-raw-text */}
                {description}
              </ScaledText>
            ) : null}
          </View>
          {expanded ? (
            <ChevronUp size={20} color={Colors.textSecondary} />
          ) : (
            <ChevronDown size={20} color={Colors.textSecondary} />
          )}
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.cardBody}>
          {description ? (
            <ScaledText size={13} color={Colors.textSecondary} style={styles.descriptionFull}>
              {/* eslint-disable-next-line rork/general-no-raw-text */}
              {description}
            </ScaledText>
          ) : null}

          {video.vimeo_video_id ? (
            <View style={styles.playerContainer}>
              <VimeoPlayer videoId={video.vimeo_video_id} height={200} />
            </View>
          ) : video.youtube_video_id ? (
            Platform.OS === 'web' ? (
              <View style={styles.playerContainer}>
                <YouTubePlayer videoId={video.youtube_video_id} height={200} />
              </View>
            ) : (
              <TouchableOpacity
                style={styles.youtubeButton}
                onPress={handleOpenYouTube}
                activeOpacity={0.8}
              >
                <ExternalLink size={18} color="#fff" />
                <ScaledText size={14} weight="600" color="#fff" style={styles.youtubeButtonText}>
                  {t('openInYouTube')}
                </ScaledText>
              </TouchableOpacity>
            )
          ) : null}

          {video.tags && video.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {video.tags.map((tag, i) => (
                <View key={i} style={styles.tagChip}>
                  <ScaledText size={11} color={Colors.textSecondary}>
                    {/* eslint-disable-next-line rork/general-no-raw-text */}
                    {tag}
                  </ScaledText>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const MemoizedVideoCard = React.memo(VideoCard);

export default function LearnScreen() {
  const { t, patientId, language } = useApp();
  const queryClient = useQueryClient();

  const today = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  const videosQuery = useQuery({
    queryKey: ['knowledge_videos', patientId, today],
    queryFn: async () => {
      log('[Learn] Fetching knowledge videos for patient:', patientId);
      const { data, error } = await supabase
        .from('knowledge_video_assignments')
        .select('*, knowledge_videos(*)')
        .eq('patient_id', patientId!)
        .eq('is_active', true)
        .lte('start_date', today)
        .gte('end_date', today);

      if (error) {
        log('[Learn] Error fetching knowledge videos:', error);
        throw error;
      }

      log('[Learn] Fetched', data?.length, 'knowledge video assignments');
      return (data || []) as KnowledgeVideoAssignment[];
    },
    enabled: !!patientId,
  });

  const markViewedMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      log('[Learn] Marking video as viewed:', assignmentId);
      const { error } = await supabase
        .from('knowledge_video_assignments')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', assignmentId);

      if (error) {
        log('[Learn] Error marking video as viewed:', error);
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['knowledge_videos'] });
      void queryClient.invalidateQueries({ queryKey: ['knowledge_videos_new_count'] });
    },
  });

  const handleMarkViewed = useCallback((assignmentId: string) => {
    markViewedMutation.mutate(assignmentId);
  }, [markViewedMutation]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['knowledge_videos'] });
    setRefreshing(false);
  }, [queryClient]);

  const videos = useMemo(() => videosQuery.data || [], [videosQuery.data]);
  const newCount = useMemo(() => videos.filter((v) => !v.viewed_at).length, [videos]);

  const groupedVideos = useMemo(() => {
    const groups: Record<string, KnowledgeVideoAssignment[]> = {};
    for (const v of videos) {
      const cat = v.knowledge_videos?.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(v);
    }
    const order: KnowledgeVideoCategory[] = ['educational', 'condition_knowledge', 'caregiver_guidance', 'other'];
    return order
      .filter((cat) => groups[cat] && groups[cat].length > 0)
      .map((cat) => ({ category: cat, items: groups[cat] }));
  }, [videos]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerContainer}>
        <View style={styles.headerIconWrap}>
          <BookOpen size={22} color={Colors.primary} />
        </View>
        <View>
          <ScaledText size={22} weight="700" color={Colors.textPrimary}>
            {t('learn')}
          </ScaledText>
          {newCount > 0 && (
            <ScaledText size={13} color={Colors.textSecondary}>
              {/* eslint-disable-next-line rork/general-no-raw-text */}
              {newCount} {t('newBadge').toLowerCase()}
            </ScaledText>
          )}
        </View>
      </View>

      {videosQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <ScaledText size={14} color={Colors.textSecondary} style={styles.loadingText}>
            {t('loading')}
          </ScaledText>
        </View>
      ) : videos.length === 0 ? (
        <View style={styles.center}>
          <BookOpen size={48} color={Colors.disabled} />
          <ScaledText size={15} color={Colors.textSecondary} style={styles.emptyText}>
            {t('noKnowledgeVideos')}
          </ScaledText>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
        >
          {groupedVideos.map((group) => {
            const catConfig = CATEGORY_CONFIG[group.category] || CATEGORY_CONFIG.other;
            return (
              <View key={group.category} style={styles.sectionContainer}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionDot, { backgroundColor: catConfig.color }]} />
                  <ScaledText size={14} weight="600" color={catConfig.color}>
                    {getCategoryLabel(group.category, t)}
                  </ScaledText>
                  <ScaledText size={12} color={Colors.textSecondary} style={styles.sectionCount}>
                    {group.items.length}
                  </ScaledText>
                </View>
                {group.items.map((assignment) => (
                  <MemoizedVideoCard
                    key={assignment.id}
                    assignment={assignment}
                    language={language}
                    t={t}
                    onMarkViewed={handleMarkViewed}
                  />
                ))}
              </View>
            );
          })}
          <CopyrightFooter />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  headerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    marginTop: 12,
  },
  emptyText: {
    marginTop: 16,
    textAlign: 'center',
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
    gap: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionCount: {
    marginLeft: 'auto' as const,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    padding: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  categoryText: {
    marginLeft: 2,
  },
  cardStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  newBadge: {
    backgroundColor: '#E74C3C',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  viewedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewedText: {
    marginLeft: 2,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitleContent: {
    flex: 1,
  },
  descriptionPreview: {
    marginTop: 4,
    lineHeight: 18,
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  descriptionFull: {
    marginBottom: 12,
    lineHeight: 20,
  },
  playerContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
  },
  youtubeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF0000',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 10,
    gap: 8,
  },
  youtubeButtonText: {
    marginLeft: 4,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  tagChip: {
    backgroundColor: Colors.background,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
