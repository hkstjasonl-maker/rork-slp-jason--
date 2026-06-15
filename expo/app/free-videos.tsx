import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Image,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Play, Eye, Search, Lock, Film } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { ScaledText } from '@/components/ScaledText';
import { log } from '@/lib/logger';

type OnDemandVideo = {
  id: string;
  title: string;
  title_zh: string | null;
  description: string | null;
  description_zh: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  category: string | null;
  partner_name: string | null;
  vimeo_video_id: string | null;
  youtube_video_id: string | null;
  is_public: boolean;
  is_active: boolean;
  access_code: string | null;
  sort_order: number | null;
  created_at: string | null;
};

type CategoryKey = 'all' | 'education' | 'intro' | 'free_resource';

const CATEGORY_FILTERS: { key: CategoryKey; en: string; zh: string }[] = [
  { key: 'all', en: 'All', zh: '全部' },
  { key: 'education', en: 'Education', zh: '教育' },
  { key: 'intro', en: 'Intro', zh: '介紹' },
  { key: 'free_resource', en: 'Free Resource', zh: '免費資源' },
];

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function FreeVideosScreen() {
  const router = useRouter();
  const { language } = useApp();
  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [videos, setVideos] = useState<OnDemandVideo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [category, setCategory] = useState<CategoryKey>('all');
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});

  const [code, setCode] = useState<string>('');
  const [codeLoading, setCodeLoading] = useState<boolean>(false);
  const [codedVideo, setCodedVideo] = useState<OnDemandVideo | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const loadVideos = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('on_demand_videos')
        .select('*')
        .eq('is_public', true)
        .eq('is_active', true)
        .is('access_code', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data || []) as OnDemandVideo[];
      setVideos(list);

      // Fetch view counts in parallel
      const counts: Record<string, number> = {};
      await Promise.all(
        list.map(async (v) => {
          try {
            const { count } = await supabase
              .from('on_demand_views')
              .select('*', { count: 'exact', head: true })
              .eq('video_id', v.id);
            counts[v.id] = count || 0;
          } catch {
            counts[v.id] = 0;
          }
        })
      );
      setViewCounts(counts);
    } catch (e) {
      log('[FreeVideos] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVideos();
  }, [loadVideos]);

  const filtered = useMemo<OnDemandVideo[]>(() => {
    if (category === 'all') return videos;
    return videos.filter((v) => (v.category || '').toLowerCase() === category);
  }, [videos, category]);

  const openVideo = useCallback((videoId: string) => {
    router.push({ pathname: '/video-player', params: { videoId } } as never);
  }, [router]);

  const lookupCode = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      setCodeLoading(true);
      setCodeError(null);
      setCodedVideo(null);
      const { data, error } = await supabase
        .from('on_demand_videos')
        .select('*')
        .eq('access_code', trimmed)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setCodeError(isZh ? '代碼無效或影片不存在' : 'Invalid code or video not found');
        return;
      }
      setCodedVideo(data as OnDemandVideo);
    } catch (e) {
      log('[FreeVideos] code lookup error:', e);
      setCodeError(isZh ? '查詢失敗，請稍後再試' : 'Lookup failed, try again');
    } finally {
      setCodeLoading(false);
    }
  }, [code, isZh]);

  const renderItem = useCallback(({ item }: { item: OnDemandVideo }) => {
    const title = isZh ? (item.title_zh || item.title) : item.title;
    const sub = isZh ? null : item.title_zh;
    const views = viewCounts[item.id] ?? 0;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openVideo(item.id)}
        activeOpacity={0.85}
        testID={`free-video-card-${item.id}`}
      >
        <View style={styles.thumbWrap}>
          {item.thumbnail_url ? (
            <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              style={styles.thumb}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.playCircle}>
                <Play size={22} color="#FFFFFF" fill="#FFFFFF" />
              </View>
            </LinearGradient>
          )}
          {item.thumbnail_url ? (
            <View style={styles.thumbOverlay}>
              <View style={styles.playCircleSmall}>
                <Play size={16} color="#FFFFFF" fill="#FFFFFF" />
              </View>
            </View>
          ) : null}
          <View style={styles.durationPill}>
            <Text style={styles.durationText}>{formatDuration(item.duration_seconds)}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <ScaledText size={15} weight="700" color={Colors.textPrimary}>
            {title}
          </ScaledText>
          {sub ? (
            <ScaledText size={12} color={Colors.textSecondary} style={{ marginTop: 2 }}>
              {sub}
            </ScaledText>
          ) : null}
          <View style={styles.metaRow}>
            {item.category ? (
              <View style={styles.catPill}>
                <Text style={styles.catPillText}>{prettyCategory(item.category, isZh)}</Text>
              </View>
            ) : null}
            {item.partner_name ? (
              <ScaledText size={11} color={Colors.textSecondary} style={{ flex: 1 }}>
                {item.partner_name}
              </ScaledText>
            ) : <View style={{ flex: 1 }} />}
            <View style={styles.viewsRow}>
              <Eye size={12} color={Colors.textSecondary} />
              <Text style={styles.viewsText}>{views}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [isZh, openVideo, viewCounts]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            activeOpacity={0.7}
            testID="free-videos-back"
          >
            <ChevronLeft size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ScaledText size={20} weight="bold" color={Colors.textPrimary}>
              {isZh ? '免費影片' : 'Free Videos'}
            </ScaledText>
            <ScaledText size={12} color={Colors.textSecondary}>
              {isZh ? '免費影片 / Free Videos' : 'Watch educational content / 觀看教育內容'}
            </ScaledText>
          </View>
          <Film size={22} color={Colors.primary} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={{ gap: 16 }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}
                >
                  {CATEGORY_FILTERS.map((f) => {
                    const active = category === f.key;
                    return (
                      <TouchableOpacity
                        key={f.key}
                        onPress={() => setCategory(f.key)}
                        style={[styles.filterPill, active && styles.filterPillActive]}
                        activeOpacity={0.7}
                        testID={`filter-${f.key}`}
                      >
                        <Text style={[styles.filterText, active && styles.filterTextActive]}>
                          {isZh ? f.zh : f.en}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.codeCard}>
                  <View style={styles.codeHeaderRow}>
                    <Lock size={16} color={Colors.primary} />
                    <ScaledText size={14} weight="700" color={Colors.textPrimary}>
                      {isZh ? '輸入代碼觀看' : 'Watch with Code'}
                    </ScaledText>
                  </View>
                  <ScaledText size={12} color={Colors.textSecondary} style={{ marginTop: 2 }}>
                    {isZh ? '輸入代碼以解鎖專屬影片' : 'Enter an access code to unlock a video'}
                  </ScaledText>
                  <View style={styles.codeInputRow}>
                    <View style={styles.codeInputWrap}>
                      <Search size={16} color={Colors.textSecondary} />
                      <TextInput
                        value={code}
                        onChangeText={(v) => { setCode(v); setCodeError(null); }}
                        placeholder={isZh ? '輸入代碼' : 'Enter code'}
                        placeholderTextColor={Colors.disabled}
                        style={styles.codeInput}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        returnKeyType="search"
                        onSubmitEditing={() => void lookupCode()}
                        testID="free-videos-code-input"
                      />
                    </View>
                    <TouchableOpacity
                      onPress={() => void lookupCode()}
                      style={[styles.codeBtn, (!code.trim() || codeLoading) && styles.codeBtnDisabled]}
                      disabled={!code.trim() || codeLoading}
                      activeOpacity={0.85}
                      testID="free-videos-code-submit"
                    >
                      {codeLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.codeBtnText}>{isZh ? '查詢' : 'Find'}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {codeError ? (
                    <Text style={styles.codeErrorText}>{codeError}</Text>
                  ) : null}
                  {codedVideo ? (
                    <View style={styles.codedResult}>
                      <TouchableOpacity
                        style={styles.codedRow}
                        onPress={() => openVideo(codedVideo.id)}
                        activeOpacity={0.85}
                      >
                        {codedVideo.thumbnail_url ? (
                          <Image source={{ uri: codedVideo.thumbnail_url }} style={styles.codedThumb} />
                        ) : (
                          <View style={[styles.codedThumb, { backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' }]}>
                            <Play size={18} color={Colors.primary} fill={Colors.primary} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <ScaledText size={14} weight="700" color={Colors.textPrimary}>
                            {isZh ? (codedVideo.title_zh || codedVideo.title) : codedVideo.title}
                          </ScaledText>
                          <ScaledText size={11} color={Colors.textSecondary}>
                            {formatDuration(codedVideo.duration_seconds)}
                          </ScaledText>
                        </View>
                        <View style={styles.codedPlay}>
                          <Play size={14} color="#fff" fill="#fff" />
                        </View>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>

                <View style={styles.sectionLabelRow}>
                  <ScaledText size={13} weight="700" color={Colors.textSecondary}>
                    {isZh ? `${filtered.length} 個免費影片` : `${filtered.length} Free Video${filtered.length === 1 ? '' : 's'}`}
                  </ScaledText>
                </View>
              </View>
            }
            ListEmptyComponent={
              loading ? (
                <View style={styles.emptyWrap}>
                  <ActivityIndicator color={Colors.primary} size="large" />
                </View>
              ) : (
                <View style={styles.emptyWrap}>
                  <Film size={36} color={Colors.disabled} />
                  <ScaledText size={14} color={Colors.textSecondary} style={{ marginTop: 10 }}>
                    {isZh ? '目前沒有可用影片' : 'No videos available right now'}
                  </ScaledText>
                </View>
              )
            }
            showsVerticalScrollIndicator={false}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function prettyCategory(c: string, isZh: boolean): string {
  const key = (c || '').toLowerCase();
  const map: Record<string, { en: string; zh: string }> = {
    education: { en: 'Education', zh: '教育' },
    intro: { en: 'Intro', zh: '介紹' },
    free_resource: { en: 'Free Resource', zh: '免費資源' },
    marketing: { en: 'Marketing', zh: '推廣' },
    sponsor: { en: 'Sponsor', zh: '贊助' },
  };
  if (map[key]) return isZh ? map[key].zh : map[key].en;
  return c;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 32,
    gap: 12,
  },
  filterRow: {
    gap: 8,
    paddingRight: 8,
  },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterText: { fontSize: 13, fontWeight: '600' as const, color: Colors.textPrimary },
  filterTextActive: { color: '#fff' },
  codeCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
    gap: 6,
  },
  codeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  codeInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  codeInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  codeBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 18, height: 44,
    borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    minWidth: 72,
  },
  codeBtnDisabled: { opacity: 0.5 },
  codeBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' as const },
  codeErrorText: { color: Colors.error, fontSize: 12, marginTop: 4, fontWeight: '600' as const },
  codedResult: { marginTop: 10 },
  codedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
  },
  codedThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: Colors.border },
  codedPlay: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  thumbWrap: {
    position: 'relative' as const,
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  thumb: {
    width: '100%', height: '100%',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  playCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  playCircleSmall: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  durationPill: {
    position: 'absolute' as const,
    right: 8, bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6,
  },
  durationText: { color: '#fff', fontSize: 11, fontWeight: '700' as const },
  cardBody: { padding: 12, gap: 4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  catPill: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6,
  },
  catPillText: {
    color: Colors.primaryDark,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  viewsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewsText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' as const },
  emptyWrap: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

