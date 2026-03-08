import React, { useState, useCallback, useMemo, useRef } from 'react';
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
  TextInput,

  Animated,
  useWindowDimensions,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/contexts/AppContext';
import { ScaledText } from '@/components/ScaledText';
import { VimeoPlayer } from '@/components/VimeoPlayer';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { CopyrightFooter } from '@/components/CopyrightFooter';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { KnowledgeVideo, KnowledgeVideoAssignment, KnowledgeVideoCategory, Language } from '@/types';
import { log } from '@/lib/logger';
import {
  BookOpen,
  Play,
  CheckCircle2,
  GraduationCap,
  Brain,
  Heart,
  Tag,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  Sparkles,
  Compass,
  Inbox,
  User,
  Building2,
  LayoutList,
  LayoutGrid,
  ArrowDownUp,
  Calendar,
} from 'lucide-react-native';
import { Image } from 'react-native';

type TabType = 'foryou' | 'explore';
type ViewMode = 'list' | 'grid';
type SortMode = 'category' | 'newest' | 'oldest';

const CATEGORY_CONFIG: Record<KnowledgeVideoCategory, { color: string; bgColor: string; icon: typeof GraduationCap }> = {
  educational: { color: '#2E86AB', bgColor: '#E8F4F8', icon: GraduationCap },
  condition_knowledge: { color: '#A23B72', bgColor: '#F5E6EF', icon: Brain },
  caregiver_guidance: { color: '#F18F01', bgColor: '#FFF3E0', icon: Heart },
  other: { color: '#636E72', bgColor: '#F0F0F0', icon: Tag },
};

const CATEGORY_FILTERS: { key: string; en: string; zh: string }[] = [
  { key: 'all', en: 'All', zh: '全部' },
  { key: 'educational', en: 'Educational', zh: '教育' },
  { key: 'condition_knowledge', en: 'Condition', zh: '病症知識' },
  { key: 'caregiver_guidance', en: 'Caregiver', zh: '照顧者' },
];

function getCategoryLabel(category: KnowledgeVideoCategory, t: (key: string) => string): string {
  const map: Record<KnowledgeVideoCategory, string> = {
    educational: t('educational'),
    condition_knowledge: t('conditionKnowledge'),
    caregiver_guidance: t('caregiverGuidance'),
    other: t('otherCategory'),
  };
  return map[category] || t('otherCategory');
}

function getVideoTitle(video: KnowledgeVideo, language: Language | null): string {
  if (language === 'zh_hant' || language === 'zh_hans') {
    return video.title_zh || video.title_en;
  }
  return video.title_en || video.title_zh;
}

function getVideoDescription(video: KnowledgeVideo, language: Language | null): string {
  if (language === 'zh_hant' || language === 'zh_hans') {
    return video.description_zh || video.description_en;
  }
  return video.description_en || video.description_zh;
}

function getCreatorName(video: KnowledgeVideo, language: Language | null): string | null {
  const isZh = language === 'zh_hant' || language === 'zh_hans';
  if (isZh) return video.creator_name_zh || video.creator_name_en || null;
  return video.creator_name_en || video.creator_name_zh || null;
}

function getProviderOrg(video: KnowledgeVideo, language: Language | null): string | null {
  const isZh = language === 'zh_hant' || language === 'zh_hans';
  if (isZh) return video.provider_org_zh || video.provider_org_en || null;
  return video.provider_org_en || video.provider_org_zh || null;
}

function getVideoThumbnailUrl(video: KnowledgeVideo): string | null {
  if (video.youtube_video_id) {
    return `https://img.youtube.com/vi/${video.youtube_video_id}/mqdefault.jpg`;
  }
  if (video.vimeo_video_id) {
    return `https://vumbnail.com/${video.vimeo_video_id}.jpg`;
  }
  return null;
}

function CreatorProviderLine({ video, language }: { video: KnowledgeVideo; language: Language | null }) {
  const creator = getCreatorName(video, language);
  const provider = getProviderOrg(video, language);
  if (!creator && !provider) return null;

  return (
    <View style={styles.creatorRow}>
      {video.provider_logo_url ? (
        <Image source={{ uri: video.provider_logo_url }} style={styles.providerLogoSmall} />
      ) : creator ? (
        <User size={12} color={Colors.textSecondary} />
      ) : (
        <Building2 size={12} color={Colors.textSecondary} />
      )}
      <ScaledText size={12} color={Colors.textSecondary} numberOfLines={1} style={styles.creatorText}>
        {creator && provider ? `${creator}  ·  ${provider}` : creator || provider}
      </ScaledText>
    </View>
  );
}

function CreatorProviderDetail({ video, language }: { video: KnowledgeVideo; language: Language | null }) {
  const isZh = language === 'zh_hant' || language === 'zh_hans';
  const creator = getCreatorName(video, language);
  const creatorAlt = isZh
    ? (video.creator_name_en || null)
    : (video.creator_name_zh || null);
  const provider = getProviderOrg(video, language);
  const providerAlt = isZh
    ? (video.provider_org_en || null)
    : (video.provider_org_zh || null);

  if (!creator && !provider) return null;

  return (
    <View style={styles.creatorDetailContainer}>
      {creator ? (
        <View style={styles.creatorDetailRow}>
          <User size={14} color={Colors.textSecondary} />
          <View style={styles.creatorDetailText}>
            <ScaledText size={13} weight="600" color={Colors.textPrimary}>
              {creator}
            </ScaledText>
            {creatorAlt ? (
              <ScaledText size={11} color={Colors.textSecondary}>
                {creatorAlt}
              </ScaledText>
            ) : null}
          </View>
        </View>
      ) : null}
      {provider ? (
        <View style={styles.creatorDetailRow}>
          {video.provider_logo_url ? (
            <Image source={{ uri: video.provider_logo_url }} style={styles.providerLogoLarge} />
          ) : (
            <Building2 size={14} color={Colors.textSecondary} />
          )}
          <View style={styles.creatorDetailText}>
            <ScaledText size={13} weight="600" color={Colors.textPrimary}>
              {provider}
            </ScaledText>
            {providerAlt ? (
              <ScaledText size={11} color={Colors.textSecondary}>
                {providerAlt}
              </ScaledText>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ViewModeToggle({
  viewMode,
  onToggle,
  sortMode,
  onSortChange,
  t,
}: {
  viewMode: ViewMode;
  onToggle: (mode: ViewMode) => void;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  t: (key: string) => string;
}) {
  const [showSortMenu, setShowSortMenu] = useState(false);

  const handleSortPress = useCallback(() => {
    setShowSortMenu((prev) => !prev);
  }, []);

  const handleSelectSort = useCallback((mode: SortMode) => {
    onSortChange(mode);
    setShowSortMenu(false);
  }, [onSortChange]);

  return (
    <View style={styles.viewModeContainer}>
      <View style={styles.viewModeToggle}>
        <TouchableOpacity
          style={[styles.viewModeBtn, viewMode === 'list' && styles.viewModeBtnActive]}
          onPress={() => onToggle('list')}
          activeOpacity={0.7}
          testID="view-mode-list"
        >
          <LayoutList size={16} color={viewMode === 'list' ? Colors.primary : Colors.textSecondary} />
          <ScaledText
            size={12}
            weight={viewMode === 'list' ? '600' : '500'}
            color={viewMode === 'list' ? Colors.primary : Colors.textSecondary}
          >
            {t('listView')}
          </ScaledText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewModeBtn, viewMode === 'grid' && styles.viewModeBtnActive]}
          onPress={() => onToggle('grid')}
          activeOpacity={0.7}
          testID="view-mode-grid"
        >
          <LayoutGrid size={16} color={viewMode === 'grid' ? Colors.primary : Colors.textSecondary} />
          <ScaledText
            size={12}
            weight={viewMode === 'grid' ? '600' : '500'}
            color={viewMode === 'grid' ? Colors.primary : Colors.textSecondary}
          >
            {t('gridView')}
          </ScaledText>
        </TouchableOpacity>
      </View>

      <View style={styles.sortContainer}>
        <TouchableOpacity
          style={styles.sortButton}
          onPress={handleSortPress}
          activeOpacity={0.7}
          testID="sort-button"
        >
          <ArrowDownUp size={14} color={Colors.textSecondary} />
          <ScaledText size={12} weight="500" color={Colors.textSecondary}>
            {sortMode === 'category' ? t('sortByCategory') : sortMode === 'newest' ? t('newestFirst') : t('oldestFirst')}
          </ScaledText>
        </TouchableOpacity>

        {showSortMenu && (
          <View style={styles.sortMenu}>
            <TouchableOpacity
              style={[styles.sortMenuItem, sortMode === 'category' && styles.sortMenuItemActive]}
              onPress={() => handleSelectSort('category')}
              activeOpacity={0.7}
            >
              <Tag size={14} color={sortMode === 'category' ? Colors.primary : Colors.textSecondary} />
              <ScaledText
                size={13}
                weight={sortMode === 'category' ? '600' : '500'}
                color={sortMode === 'category' ? Colors.primary : Colors.textPrimary}
              >
                {t('sortByCategory')}
              </ScaledText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortMenuItem, sortMode === 'newest' && styles.sortMenuItemActive]}
              onPress={() => handleSelectSort('newest')}
              activeOpacity={0.7}
            >
              <Calendar size={14} color={sortMode === 'newest' ? Colors.primary : Colors.textSecondary} />
              <ScaledText
                size={13}
                weight={sortMode === 'newest' ? '600' : '500'}
                color={sortMode === 'newest' ? Colors.primary : Colors.textPrimary}
              >
                {t('newestFirst')}
              </ScaledText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortMenuItem, sortMode === 'oldest' && styles.sortMenuItemActive]}
              onPress={() => handleSelectSort('oldest')}
              activeOpacity={0.7}
            >
              <Calendar size={14} color={sortMode === 'oldest' ? Colors.primary : Colors.textSecondary} />
              <ScaledText
                size={13}
                weight={sortMode === 'oldest' ? '600' : '500'}
                color={sortMode === 'oldest' ? Colors.primary : Colors.textPrimary}
              >
                {t('oldestFirst')}
              </ScaledText>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

function AssignedVideoCard({
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
              {title}
            </ScaledText>
            {!expanded && <CreatorProviderLine video={video} language={language} />}
            {!expanded && description ? (
              <ScaledText size={13} color={Colors.textSecondary} numberOfLines={2} style={styles.descriptionPreview}>
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
          <CreatorProviderDetail video={video} language={language} />
          {description ? (
            <ScaledText size={13} color={Colors.textSecondary} style={styles.descriptionFull}>
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
              <View style={styles.playerContainer}>
                <TouchableOpacity onPress={handleOpenYouTube} activeOpacity={0.9}>
                  <View style={styles.thumbnailWrapper}>
                    <Image
                      source={{ uri: `https://img.youtube.com/vi/${video.youtube_video_id}/hqdefault.jpg` }}
                      style={styles.youtubeThumbnail}
                      resizeMode="cover"
                    />
                    <View style={styles.thumbnailOverlay}>
                      <View style={styles.thumbnailPlayButton}>
                        <Play size={28} color="#fff" fill="#fff" />
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            )
          ) : null}

          {video.tags && video.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {video.tags.map((tag, i) => (
                <View key={i} style={styles.tagChip}>
                  <ScaledText size={11} color={Colors.textSecondary}>
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

function AssignedGridCard({
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
  const title = getVideoTitle(video, language);
  const thumbnailUrl = getVideoThumbnailUrl(video);

  const handlePress = useCallback(() => {
    setExpanded((prev) => !prev);
    if (!expanded && isNew) {
      onMarkViewed(assignment.id);
    }
  }, [expanded, isNew, assignment.id, onMarkViewed]);

  const handleOpenYouTube = useCallback(() => {
    if (video.youtube_video_id) {
      const url = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;
      Linking.openURL(url).catch((err) => log('[Learn] Failed to open YouTube:', err));
      if (isNew) onMarkViewed(assignment.id);
    }
  }, [video.youtube_video_id, isNew, assignment.id, onMarkViewed]);

  return (
    <View style={styles.gridCard}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8} testID={`grid-video-${assignment.id}`}>
        <View style={styles.gridThumbnailWrap}>
          {thumbnailUrl ? (
            <Image source={{ uri: thumbnailUrl }} style={styles.gridThumbnail} resizeMode="cover" />
          ) : (
            <View style={styles.gridThumbnailPlaceholder}>
              <Play size={24} color="#999" />
            </View>
          )}
          <View style={styles.gridPlayOverlay}>
            <View style={styles.gridPlayBtn}>
              <Play size={20} color="#fff" fill="#fff" />
            </View>
          </View>
          {isNew && (
            <View style={styles.gridNewBadge}>
              <ScaledText size={9} weight="700" color="#fff">{t('newBadge')}</ScaledText>
            </View>
          )}
          <View style={[styles.gridCategoryStrip, { backgroundColor: config.color }]} />
        </View>
        <View style={styles.gridCardInfo}>
          <ScaledText size={13} weight="600" color={Colors.textPrimary} numberOfLines={2}>
            {title}
          </ScaledText>
          <CreatorProviderLine video={video} language={language} />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.gridCardExpanded}>
          {video.vimeo_video_id ? (
            <View style={styles.playerContainer}>
              <VimeoPlayer videoId={video.vimeo_video_id} height={180} />
            </View>
          ) : video.youtube_video_id ? (
            Platform.OS === 'web' ? (
              <View style={styles.playerContainer}>
                <YouTubePlayer videoId={video.youtube_video_id} height={180} />
              </View>
            ) : (
              <TouchableOpacity onPress={handleOpenYouTube} activeOpacity={0.9}>
                <View style={styles.gridExpandedThumbnail}>
                  <Image
                    source={{ uri: `https://img.youtube.com/vi/${video.youtube_video_id}/hqdefault.jpg` }}
                    style={styles.gridExpandedThumbImg}
                    resizeMode="cover"
                  />
                  <View style={styles.thumbnailOverlay}>
                    <View style={styles.thumbnailPlayButton}>
                      <Play size={24} color="#fff" fill="#fff" />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            )
          ) : null}
        </View>
      )}
    </View>
  );
}

function ExploreVideoCard({
  video,
  language,
  t,
}: {
  video: KnowledgeVideo;
  language: Language | null;
  t: (key: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const category = (video.category as KnowledgeVideoCategory) || 'other';
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
  const CategoryIcon = config.icon;
  const title = getVideoTitle(video, language);
  const description = getVideoDescription(video, language);

  const handleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleOpenYouTube = useCallback(() => {
    if (video.youtube_video_id) {
      const url = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;
      Linking.openURL(url).catch((err) => log('[Learn] Failed to open YouTube:', err));
    }
  }, [video.youtube_video_id]);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={handleExpand}
        activeOpacity={0.7}
        testID={`explore-video-${video.id}`}
      >
        <View style={styles.cardTopRow}>
          <View style={[styles.categoryBadge, { backgroundColor: config.bgColor }]}>
            <CategoryIcon size={12} color={config.color} />
            <ScaledText size={11} weight="600" color={config.color} style={styles.categoryText}>
              {getCategoryLabel(category, t)}
            </ScaledText>
          </View>
        </View>

        <View style={styles.cardTitleRow}>
          <View style={[styles.playIconWrap, styles.playIconWrapExplore]}>
            <Play size={18} color="#fff" fill="#fff" />
          </View>
          <View style={styles.cardTitleContent}>
            <ScaledText size={15} weight="600" color={Colors.textPrimary} numberOfLines={2}>
              {title}
            </ScaledText>
            {!expanded && <CreatorProviderLine video={video} language={language} />}
            {!expanded && description ? (
              <ScaledText size={13} color={Colors.textSecondary} numberOfLines={2} style={styles.descriptionPreview}>
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
          <CreatorProviderDetail video={video} language={language} />
          {description ? (
            <ScaledText size={13} color={Colors.textSecondary} style={styles.descriptionFull}>
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
              <View style={styles.playerContainer}>
                <TouchableOpacity onPress={handleOpenYouTube} activeOpacity={0.9}>
                  <View style={styles.thumbnailWrapper}>
                    <Image
                      source={{ uri: `https://img.youtube.com/vi/${video.youtube_video_id}/hqdefault.jpg` }}
                      style={styles.youtubeThumbnail}
                      resizeMode="cover"
                    />
                    <View style={styles.thumbnailOverlay}>
                      <View style={styles.thumbnailPlayButton}>
                        <Play size={28} color="#fff" fill="#fff" />
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            )
          ) : null}

          {video.tags && video.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {video.tags.map((tag, i) => (
                <View key={i} style={styles.tagChip}>
                  <ScaledText size={11} color={Colors.textSecondary}>
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

function ExploreGridCard({
  video,
  language,
  t: _t,
}: {
  video: KnowledgeVideo;
  language: Language | null;
  t: (key: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const category = (video.category as KnowledgeVideoCategory) || 'other';
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
  const title = getVideoTitle(video, language);
  const thumbnailUrl = getVideoThumbnailUrl(video);

  const handlePress = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleOpenYouTube = useCallback(() => {
    if (video.youtube_video_id) {
      const url = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;
      Linking.openURL(url).catch((err) => log('[Learn] Failed to open YouTube:', err));
    }
  }, [video.youtube_video_id]);

  return (
    <View style={styles.gridCard}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8} testID={`grid-explore-${video.id}`}>
        <View style={styles.gridThumbnailWrap}>
          {thumbnailUrl ? (
            <Image source={{ uri: thumbnailUrl }} style={styles.gridThumbnail} resizeMode="cover" />
          ) : (
            <View style={styles.gridThumbnailPlaceholder}>
              <Play size={24} color="#999" />
            </View>
          )}
          <View style={styles.gridPlayOverlay}>
            <View style={styles.gridPlayBtn}>
              <Play size={20} color="#fff" fill="#fff" />
            </View>
          </View>
          <View style={[styles.gridCategoryStrip, { backgroundColor: config.color }]} />
        </View>
        <View style={styles.gridCardInfo}>
          <ScaledText size={13} weight="600" color={Colors.textPrimary} numberOfLines={2}>
            {title}
          </ScaledText>
          <CreatorProviderLine video={video} language={language} />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.gridCardExpanded}>
          {video.vimeo_video_id ? (
            <View style={styles.playerContainer}>
              <VimeoPlayer videoId={video.vimeo_video_id} height={180} />
            </View>
          ) : video.youtube_video_id ? (
            Platform.OS === 'web' ? (
              <View style={styles.playerContainer}>
                <YouTubePlayer videoId={video.youtube_video_id} height={180} />
              </View>
            ) : (
              <TouchableOpacity onPress={handleOpenYouTube} activeOpacity={0.9}>
                <View style={styles.gridExpandedThumbnail}>
                  <Image
                    source={{ uri: `https://img.youtube.com/vi/${video.youtube_video_id}/hqdefault.jpg` }}
                    style={styles.gridExpandedThumbImg}
                    resizeMode="cover"
                  />
                  <View style={styles.thumbnailOverlay}>
                    <View style={styles.thumbnailPlayButton}>
                      <Play size={24} color="#fff" fill="#fff" />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            )
          ) : null}
        </View>
      )}
    </View>
  );
}

const MemoizedAssignedVideoCard = React.memo(AssignedVideoCard);
const MemoizedAssignedGridCard = React.memo(AssignedGridCard);
const MemoizedExploreVideoCard = React.memo(ExploreVideoCard);
const MemoizedExploreGridCard = React.memo(ExploreGridCard);

function ForYouTab({
  patientId,
  language,
  t,
  today,
}: {
  patientId: string;
  language: Language | null;
  t: (key: string) => string;
  today: string;
}) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortMode, setSortMode] = useState<SortMode>('category');
  const { width: screenWidth } = useWindowDimensions();
  const numColumns = screenWidth >= 768 ? 3 : 2;

  const videosQuery = useQuery({
    queryKey: ['knowledge_videos', patientId, today],
    queryFn: async () => {
      log('[Learn] Fetching assigned knowledge videos for patient:', patientId);
      const { data, error } = await supabase
        .from('knowledge_video_assignments')
        .select('*, knowledge_videos(*)')
        .eq('patient_id', patientId)
        .eq('is_active', true)
        .lte('start_date', today)
        .gte('end_date', today);

      if (error) {
        log('[Learn] Error fetching assigned knowledge videos:', error);
        throw error;
      }

      log('[Learn] Fetched', data?.length, 'assigned knowledge video assignments');
      return (data || []) as KnowledgeVideoAssignment[];
    },
    enabled: !!patientId,
    staleTime: 2 * 60 * 1000,
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['knowledge_videos'] });
    setRefreshing(false);
  }, [queryClient]);

  const videos = useMemo(() => videosQuery.data || [], [videosQuery.data]);

  const sortedVideos = useMemo(() => {
    if (sortMode === 'newest') {
      return [...videos].sort((a, b) => {
        const dateA = a.knowledge_videos?.created_at || '';
        const dateB = b.knowledge_videos?.created_at || '';
        return dateB.localeCompare(dateA);
      });
    }
    if (sortMode === 'oldest') {
      return [...videos].sort((a, b) => {
        const dateA = a.knowledge_videos?.created_at || '';
        const dateB = b.knowledge_videos?.created_at || '';
        return dateA.localeCompare(dateB);
      });
    }
    return videos;
  }, [videos, sortMode]);

  const groupedVideos = useMemo(() => {
    const groups: Record<string, KnowledgeVideoAssignment[]> = {};
    for (const v of sortedVideos) {
      const cat = v.knowledge_videos?.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(v);
    }
    const order: KnowledgeVideoCategory[] = ['educational', 'condition_knowledge', 'caregiver_guidance', 'other'];
    return order
      .filter((cat) => groups[cat] && groups[cat].length > 0)
      .map((cat) => ({ category: cat, items: groups[cat] }));
  }, [sortedVideos]);

  if (videosQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <ScaledText size={14} color={Colors.textSecondary} style={styles.loadingText}>
          {t('loading')}
        </ScaledText>
      </View>
    );
  }

  if (videos.length === 0) {
    return (
      <View style={styles.center}>
        <View style={styles.emptyIconCircle}>
          <Inbox size={32} color={Colors.disabled} />
        </View>
        <ScaledText size={15} weight="600" color={Colors.textSecondary} style={styles.emptyText}>
          {t('noAssignedVideos')}
        </ScaledText>
        <ScaledText size={13} color={Colors.disabled} style={styles.emptySubtext}>
          {t('forYouDescription')}
        </ScaledText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ViewModeToggle
        viewMode={viewMode}
        onToggle={setViewMode}
        sortMode={sortMode}
        onSortChange={setSortMode}
        t={t}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {sortMode === 'category' ? (
          groupedVideos.map((group) => {
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
                {viewMode === 'list' ? (
                  group.items.map((assignment) => (
                    <MemoizedAssignedVideoCard
                      key={assignment.id}
                      assignment={assignment}
                      language={language}
                      t={t}
                      onMarkViewed={handleMarkViewed}
                    />
                  ))
                ) : (
                  <View style={styles.gridRow}>
                    {group.items.map((assignment) => (
                      <View key={assignment.id} style={[styles.gridItemWrap, { width: `${100 / numColumns}%` as unknown as number }]}>
                        <MemoizedAssignedGridCard
                          assignment={assignment}
                          language={language}
                          t={t}
                          onMarkViewed={handleMarkViewed}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        ) : (
          viewMode === 'list' ? (
            sortedVideos.map((assignment) => (
              <MemoizedAssignedVideoCard
                key={assignment.id}
                assignment={assignment}
                language={language}
                t={t}
                onMarkViewed={handleMarkViewed}
              />
            ))
          ) : (
            <View style={styles.gridRow}>
              {sortedVideos.map((assignment) => (
                <View key={assignment.id} style={[styles.gridItemWrap, { width: `${100 / numColumns}%` as unknown as number }]}>
                  <MemoizedAssignedGridCard
                    assignment={assignment}
                    language={language}
                    t={t}
                    onMarkViewed={handleMarkViewed}
                  />
                </View>
              ))}
            </View>
          )
        )}
        <CopyrightFooter />
      </ScrollView>
    </View>
  );
}

function ExploreTab({
  language,
  t,
}: {
  language: Language | null;
  t: (key: string) => string;
}) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortMode, setSortMode] = useState<SortMode>('category');
  const { width: screenWidth } = useWindowDimensions();
  const numColumns = screenWidth >= 768 ? 3 : 2;

  const allVideosQuery = useQuery({
    queryKey: ['knowledge_videos_all'],
    queryFn: async () => {
      log('[Learn] Fetching all knowledge videos for explore');
      const { data, error } = await supabase
        .from('knowledge_videos')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        log('[Learn] Error fetching all knowledge videos:', error);
        throw error;
      }

      log('[Learn] Fetched', data?.length, 'total knowledge videos');
      return (data || []) as KnowledgeVideo[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['knowledge_videos_all'] });
    setRefreshing(false);
  }, [queryClient]);

  const allVideos = useMemo(() => allVideosQuery.data || [], [allVideosQuery.data]);

  const filteredVideos = useMemo(() => {
    let result = allVideos.filter((v) => {
      const matchCat = categoryFilter === 'all' || v.category === categoryFilter;
      if (!searchQuery.trim()) return matchCat;
      const q = searchQuery.toLowerCase();
      const matchText =
        (v.title_en || '').toLowerCase().includes(q) ||
        (v.title_zh || '').toLowerCase().includes(q) ||
        (v.description_en || '').toLowerCase().includes(q) ||
        (v.description_zh || '').toLowerCase().includes(q) ||
        (v.tags || []).some((tag) => tag.toLowerCase().includes(q));
      return matchCat && matchText;
    });

    if (sortMode === 'newest') {
      result = [...result].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    } else if (sortMode === 'oldest') {
      result = [...result].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    }

    return result;
  }, [allVideos, searchQuery, categoryFilter, sortMode]);

  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  if (allVideosQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <ScaledText size={14} color={Colors.textSecondary} style={styles.loadingText}>
          {t('loading')}
        </ScaledText>
      </View>
    );
  }

  return (
    <View style={styles.exploreContainer}>
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrap}>
          <Search size={18} color={Colors.disabled} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('searchVideos')}
            placeholderTextColor={Colors.disabled}
            value={searchQuery}
            onChangeText={setSearchQuery}
            testID="explore-search-input"
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.chipBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipBarContent}
        >
          {CATEGORY_FILTERS.map((cat) => {
            const isActive = categoryFilter === cat.key;
            const catConfig = cat.key !== 'all' ? CATEGORY_CONFIG[cat.key as KnowledgeVideoCategory] : null;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[
                  styles.chip,
                  isActive && styles.chipActive,
                  isActive && catConfig && { backgroundColor: catConfig.bgColor, borderColor: catConfig.color },
                ]}
                onPress={() => setCategoryFilter(cat.key)}
                activeOpacity={0.7}
              >
                <ScaledText
                  size={13}
                  weight={isActive ? '600' : '500'}
                  color={isActive ? (catConfig ? catConfig.color : Colors.primary) : Colors.textSecondary}
                >
                  {isZh ? cat.zh : cat.en}
                </ScaledText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ViewModeToggle
        viewMode={viewMode}
        onToggle={setViewMode}
        sortMode={sortMode}
        onSortChange={setSortMode}
        t={t}
      />

      {filteredVideos.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIconCircle}>
            <Search size={28} color={Colors.disabled} />
          </View>
          <ScaledText size={15} weight="600" color={Colors.textSecondary} style={styles.emptyText}>
            {t('noVideosFound')}
          </ScaledText>
          <ScaledText size={13} color={Colors.disabled} style={styles.emptySubtext}>
            {t('exploreDescription')}
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
          {viewMode === 'list' ? (
            filteredVideos.map((video) => (
              <MemoizedExploreVideoCard key={video.id} video={video} language={language} t={t} />
            ))
          ) : (
            <View style={styles.gridRow}>
              {filteredVideos.map((video) => (
                <View key={video.id} style={[styles.gridItemWrap, { width: `${100 / numColumns}%` as unknown as number }]}>
                  <MemoizedExploreGridCard video={video} language={language} t={t} />
                </View>
              ))}
            </View>
          )}
          <CopyrightFooter />
        </ScrollView>
      )}
    </View>
  );
}

export default function LearnScreen() {
  const { t, patientId, language } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('foryou');
  const slideAnim = useRef(new Animated.Value(0)).current;

  const today = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  const newCountQuery = useQuery({
    queryKey: ['knowledge_videos_new_count', patientId],
    queryFn: async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const { count, error } = await supabase
        .from('knowledge_video_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', patientId!)
        .eq('is_active', true)
        .lte('start_date', todayStr)
        .gte('end_date', todayStr)
        .is('viewed_at', null);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!patientId,
    staleTime: 2 * 60 * 1000,
  });

  const newCount = newCountQuery.data || 0;

  const switchTab = useCallback((tab: TabType) => {
    setActiveTab(tab);
    Animated.spring(slideAnim, {
      toValue: tab === 'foryou' ? 0 : 1,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [slideAnim]);


  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerContainer}>
        <View style={styles.headerIconWrap}>
          <BookOpen size={22} color={Colors.primary} />
        </View>
        <View style={styles.headerTextWrap}>
          <ScaledText size={22} weight="700" color={Colors.textPrimary}>
            {t('learn')}
          </ScaledText>
        </View>
      </View>

      <View style={styles.segmentedControl}>
        <TouchableOpacity
          style={[styles.segmentTab, activeTab === 'foryou' && styles.segmentTabActive]}
          onPress={() => switchTab('foryou')}
          activeOpacity={0.7}
          testID="tab-foryou"
        >
          <Sparkles size={16} color={activeTab === 'foryou' ? Colors.primary : Colors.textSecondary} />
          <ScaledText
            size={14}
            weight={activeTab === 'foryou' ? '700' : '500'}
            color={activeTab === 'foryou' ? Colors.primary : Colors.textSecondary}
          >
            {t('forYouTab')}
          </ScaledText>
          {newCount > 0 && (
            <View style={styles.tabCountBadge}>
              <ScaledText size={10} weight="700" color="#fff">
                {newCount > 99 ? '99+' : String(newCount)}
              </ScaledText>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentTab, activeTab === 'explore' && styles.segmentTabActive]}
          onPress={() => switchTab('explore')}
          activeOpacity={0.7}
          testID="tab-explore"
        >
          <Compass size={16} color={activeTab === 'explore' ? Colors.primary : Colors.textSecondary} />
          <ScaledText
            size={14}
            weight={activeTab === 'explore' ? '700' : '500'}
            color={activeTab === 'explore' ? Colors.primary : Colors.textSecondary}
          >
            {t('exploreTab')}
          </ScaledText>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContent}>
        {activeTab === 'foryou' && patientId ? (
          <ForYouTab patientId={patientId} language={language} t={t} today={today} />
        ) : activeTab === 'explore' ? (
          <ExploreTab language={language} t={t} />
        ) : (
          <View style={styles.center}>
            <ScaledText size={14} color={Colors.textSecondary}>
              {t('loading')}
            </ScaledText>
          </View>
        )}
      </View>
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
    paddingBottom: 8,
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
  headerTextWrap: {
    flex: 1,
  },
  segmentedControl: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  segmentTabActive: {
    backgroundColor: Colors.primaryLight,
  },
  tabCountBadge: {
    backgroundColor: '#E74C3C',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  tabContent: {
    flex: 1,
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
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    textAlign: 'center' as const,
  },
  emptySubtext: {
    marginTop: 6,
    textAlign: 'center' as const,
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
  playIconWrapExplore: {
    backgroundColor: '#636E72',
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
  thumbnailWrapper: {
    position: 'relative' as const,
  },
  youtubeThumbnail: {
    width: '100%' as unknown as number,
    height: 200,
    borderRadius: 10,
    backgroundColor: '#000',
  },
  thumbnailOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  thumbnailPlayButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,0,0,0.85)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
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
  creatorRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    marginTop: 3,
  },
  creatorText: {
    flex: 1,
  },
  providerLogoSmall: {
    width: 16,
    height: 16,
    borderRadius: 3,
    resizeMode: 'contain' as const,
  },
  providerLogoLarge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    resizeMode: 'contain' as const,
  },
  creatorDetailContainer: {
    marginBottom: 10,
    gap: 8,
  },
  creatorDetailRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  creatorDetailText: {
    flex: 1,
  },
  exploreContainer: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  chipBarContainer: {
    paddingBottom: 8,
  },
  chipBarContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  flatListContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  viewModeContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  viewModeToggle: {
    flexDirection: 'row' as const,
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  viewModeBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewModeBtnActive: {
    backgroundColor: Colors.primaryLight,
  },
  sortContainer: {
    position: 'relative' as const,
    zIndex: 10,
  },
  sortButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sortMenu: {
    position: 'absolute' as const,
    top: 36,
    right: 0,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 4,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 100,
  },
  sortMenuItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  sortMenuItemActive: {
    backgroundColor: Colors.primaryLight,
  },
  gridRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    marginHorizontal: -4,
  },
  gridItemWrap: {
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  gridCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  gridThumbnailWrap: {
    position: 'relative' as const,
    aspectRatio: 16 / 9,
    backgroundColor: '#1a1a2e',
  },
  gridThumbnail: {
    width: '100%' as unknown as number,
    height: '100%' as unknown as number,
  },
  gridThumbnailPlaceholder: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: '#1a1a2e',
  },
  gridPlayOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  gridPlayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  gridNewBadge: {
    position: 'absolute' as const,
    top: 6,
    right: 6,
    backgroundColor: '#E74C3C',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gridCategoryStrip: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  gridCardInfo: {
    padding: 10,
    gap: 2,
  },
  gridCardExpanded: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  gridExpandedThumbnail: {
    position: 'relative' as const,
    borderRadius: 8,
    overflow: 'hidden',
  },
  gridExpandedThumbImg: {
    width: '100%' as unknown as number,
    height: 140,
    backgroundColor: '#000',
  },
});
