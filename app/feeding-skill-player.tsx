import React, { useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Eye } from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { ScaledText } from '@/components/ScaledText';
import { VimeoPlayer } from '@/components/VimeoPlayer';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import Colors from '@/constants/colors';
import { FeedingSkillAssignment } from '@/types';
import { log } from '@/lib/logger';

export default function FeedingSkillPlayerScreen() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const { t, language, patientId } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const assignmentQuery = useQuery({
    queryKey: ['feedingSkillAssignment', assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feeding_skill_assignments')
        .select('*, feeding_skill_videos(*)')
        .eq('id', assignmentId!)
        .single();
      if (error) {
        log('Feeding skill assignment fetch error:', error);
        throw error;
      }
      return data as FeedingSkillAssignment;
    },
    enabled: !!assignmentId,
  });

  const markViewedMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('feeding_skill_assignments')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', assignmentId!);
      if (error) {
        log('Mark feeding skill viewed error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feedingSkillAssignments', patientId] });
      void queryClient.invalidateQueries({ queryKey: ['feedingSkillAssignment', assignmentId] });
    },
  });

  useEffect(() => {
    if (assignmentQuery.data && !assignmentQuery.data.viewed_at) {
      markViewedMutation.mutate();
    }
  }, [assignmentQuery.data, markViewedMutation]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const assignment = assignmentQuery.data;
  const video = assignment?.feeding_skill_videos;

  const lang = language || 'en';
  const title = video
    ? lang === 'zh_hant'
      ? (video.title_zh_hant || video.title_en)
      : lang === 'zh_hans'
        ? (video.title_zh_hans || video.title_en)
        : video.title_en
    : '';

  const description = video
    ? lang === 'zh_hant'
      ? (video.description_zh_hant || video.description_en)
      : lang === 'zh_hans'
        ? (video.description_zh_hans || video.description_en)
        : video.description_en
    : null;

  if (assignmentQuery.isLoading) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <ScaledText size={16} color={Colors.textSecondary} style={styles.loadingText}>
            {t('loading')}
          </ScaledText>
        </SafeAreaView>
      </View>
    );
  }

  if (!video) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.centered}>
          <ScaledText size={16} color={Colors.textSecondary}>
            {t('noFeedingSkills')}
          </ScaledText>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <ScaledText size={16} weight="600" color={Colors.primary}>
              {t('backToHome')}
            </ScaledText>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.headerBackBtn} activeOpacity={0.7}>
            <ChevronLeft size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <ScaledText size={17} weight="bold" color={Colors.textPrimary} numberOfLines={1}>
              {title}
            </ScaledText>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.videoContainer}>
            {video.vimeo_video_id ? (
              <VimeoPlayer videoId={video.vimeo_video_id} height={220} />
            ) : video.youtube_video_id ? (
              <YouTubePlayer videoId={video.youtube_video_id} height={220} />
            ) : (
              <View style={styles.noVideo}>
                <ScaledText size={14} color="#999">Video unavailable</ScaledText>
              </View>
            )}
          </View>

          <View style={styles.infoSection}>
            <ScaledText size={20} weight="bold" color={Colors.textPrimary}>
              {title}
            </ScaledText>

            <View style={styles.metaRow}>
              {video.category && (
                <View style={styles.categoryBadge}>
                  <ScaledText size={12} weight="600" color="#E67E22">
                    {video.category}
                  </ScaledText>
                </View>
              )}
              {assignment?.viewed_at && (
                <View style={styles.viewedBadge}>
                  <Eye size={12} color={Colors.success} />
                  <ScaledText size={12} weight="600" color={Colors.success}>
                    {t('feedingSkillViewed')}
                  </ScaledText>
                </View>
              )}
            </View>

            {description && (
              <View style={styles.descriptionCard}>
                <ScaledText size={15} color={Colors.textSecondary} style={styles.descriptionText}>
                  {description}
                </ScaledText>
              </View>
            )}
          </View>

          <CopyrightFooter />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
  },
  backBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  videoContainer: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  noVideo: {
    height: 220,
    borderRadius: 12,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    backgroundColor: '#FEF3E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  viewedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.successLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  descriptionCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
  },
  descriptionText: {
    lineHeight: 24,
  },
});
