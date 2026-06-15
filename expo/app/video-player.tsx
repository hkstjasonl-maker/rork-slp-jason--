import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ChevronDown, Check, Captions, Building2 } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { ScaledText } from '@/components/ScaledText';
import { VimeoPlayer } from '@/components/VimeoPlayer';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import LiveSubtitleOverlay from '@/components/LiveSubtitleOverlay';
import { log } from '@/lib/logger';

type SubtitleMap = Record<string, string>;

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
  subtitle_urls: SubtitleMap | null;
  is_active: boolean;
};

const { width: WIN_W } = Dimensions.get('window');

export default function VideoPlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ videoId?: string }>();
  const videoId = params.videoId || '';
  const { language } = useApp();
  const isZh = language === 'zh_hant' || language === 'zh_hans';

  const [video, setVideo] = useState<OnDemandVideo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSubLang, setSelectedSubLang] = useState<string | null>(null);
  const [showLangPicker, setShowLangPicker] = useState<boolean>(false);
  const [showSubtitles, setShowSubtitles] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [elapsed, setElapsed] = useState<number>(0);

  const viewRowIdRef = useRef<string | null>(null);
  const viewInsertedRef = useRef<boolean>(false);

  // Fetch video
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data, error: e } = await supabase
          .from('on_demand_videos')
          .select('id, title, title_zh, description, description_zh, thumbnail_url, duration_seconds, category, partner_name, vimeo_video_id, youtube_video_id, subtitle_urls, is_active')
          .eq('id', videoId)
          .maybeSingle();
        if (cancelled) return;
        if (e) throw e;
        if (!data) {
          setError(isZh ? '影片不存在' : 'Video not found');
          return;
        }
        const v = data as OnDemandVideo;
        setVideo(v);

        // Init subtitle language
        if (v.subtitle_urls && typeof v.subtitle_urls === 'object') {
          const keys = Object.keys(v.subtitle_urls);
          if (keys.length > 0) {
            const preferred = isZh
              ? (keys.find((k) => k.startsWith('zh')) || keys[0])
              : (keys.find((k) => k.startsWith('en')) || keys[0]);
            setSelectedSubLang(preferred);
          }
        }
      } catch (err) {
        log('[VideoPlayer] load error:', err);
        if (!cancelled) setError(isZh ? '載入失敗' : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [videoId, isZh]);

  // Insert view row when video is loaded
  useEffect(() => {
    if (!video || viewInsertedRef.current) return;
    viewInsertedRef.current = true;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const authUserId = userRes?.user?.id || null;
        const { data, error: insErr } = await supabase
          .from('on_demand_views')
          .insert({
            video_id: video.id,
            auth_user_id: authUserId,
            app_type: 'patient',
            watched_duration_seconds: 0,
            completed: false,
          })
          .select('id')
          .maybeSingle();
        if (insErr) {
          log('[VideoPlayer] view insert error:', insErr);
          return;
        }
        if (data?.id) viewRowIdRef.current = data.id;
      } catch (e) {
        log('[VideoPlayer] view insert exception:', e);
      }
    })();
  }, [video]);

  // Watch duration tracker (10s tick)
  useEffect(() => {
    if (!video) return;
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setElapsed((s) => s + 10);
    }, 10000);
    return () => clearInterval(interval);
  }, [video, isPlaying]);

  // Persist watched duration periodically
  useEffect(() => {
    if (!viewRowIdRef.current) return;
    if (elapsed === 0) return;
    const rowId = viewRowIdRef.current;
    void supabase
      .from('on_demand_views')
      .update({ watched_duration_seconds: elapsed })
      .eq('id', rowId)
      .then((res) => {
        if (res.error) log('[VideoPlayer] update watched error:', res.error);
      });
  }, [elapsed]);

  const handleVideoEnd = useCallback(async () => {
    setIsPlaying(false);
    try {
      const rowId = viewRowIdRef.current;
      if (!rowId) return;
      const final = elapsed > 0 ? elapsed : (video?.duration_seconds || 0);
      await supabase
        .from('on_demand_views')
        .update({
          completed: true,
          watched_duration_seconds: final,
        })
        .eq('id', rowId);
    } catch (e) {
      log('[VideoPlayer] end update error:', e);
    }
  }, [elapsed, video]);

  const subtitleUrl = useMemo<string | null>(() => {
    if (!video?.subtitle_urls || !selectedSubLang || !showSubtitles) return null;
    const u = (video.subtitle_urls as SubtitleMap)[selectedSubLang];
    return typeof u === 'string' && u ? u : null;
  }, [video, selectedSubLang, showSubtitles]);

  const subtitleLanguages = useMemo<{ code: string; label: string }[]>(() => {
    const map = video?.subtitle_urls as SubtitleMap | null | undefined;
    if (!map || typeof map !== 'object') return [];
    return Object.keys(map).map((k) => ({ code: k, label: k.toUpperCase() }));
  }, [video?.subtitle_urls]);

  const videoHeight = Math.min(WIN_W * 9 / 16, 320);

  if (loading) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>{isZh ? '載入中...' : 'Loading...'}</Text>
        </SafeAreaView>
      </View>
    );
  }

  if (error || !video) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.center}>
          <Text style={styles.errorText}>{error || (isZh ? '影片不存在' : 'Video not found')}</Text>
          <TouchableOpacity style={styles.backBtnAction} onPress={() => router.back()}>
            <Text style={styles.backBtnActionText}>{isZh ? '返回' : 'Back'}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  const isVimeo = !!video.vimeo_video_id;
  const isYouTube = !!video.youtube_video_id;
  const title = isZh ? (video.title_zh || video.title) : video.title;
  const description = isZh ? (video.description_zh || video.description) : video.description;

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            activeOpacity={0.7}
            testID="video-player-back"
          >
            <ChevronLeft size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.videoArea, { height: videoHeight }]}>
            {isVimeo ? (
              <VimeoPlayer
                videoId={video.vimeo_video_id || ''}
                height={videoHeight}
                onEnd={() => void handleVideoEnd()}
              />
            ) : isYouTube ? (
              <YouTubePlayer
                videoId={video.youtube_video_id || ''}
                height={videoHeight}
                onEnd={() => void handleVideoEnd()}
              />
            ) : (
              <View style={[styles.unavailable, { height: videoHeight }]}>
                <Text style={styles.unavailableText}>
                  {isZh ? '影片無法播放' : 'Video unavailable'}
                </Text>
              </View>
            )}
            {subtitleUrl ? (
              <LiveSubtitleOverlay
                subtitleUrl={subtitleUrl}
                isPlaying={isPlaying}
                audioCurrentTime={elapsed}
                visible
                forceOverlay={false}
              />
            ) : null}
          </View>

          {subtitleLanguages.length > 0 ? (
            <View style={styles.subtitleRow}>
              <TouchableOpacity
                style={[styles.subtitleToggle, !showSubtitles && styles.subtitleToggleOff]}
                onPress={() => setShowSubtitles((s) => !s)}
                activeOpacity={0.7}
              >
                <Captions size={14} color={showSubtitles ? '#fff' : Colors.textSecondary} />
                <Text style={[styles.subtitleToggleText, !showSubtitles && { color: Colors.textSecondary }]}>
                  {showSubtitles ? (isZh ? '字幕開' : 'CC On') : (isZh ? '字幕關' : 'CC Off')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.langPicker}
                onPress={() => setShowLangPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.langPickerText}>
                  {selectedSubLang ? selectedSubLang.toUpperCase() : (isZh ? '無' : 'None')}
                </Text>
                <ChevronDown size={14} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.infoSection}>
            <ScaledText size={20} weight="bold" color={Colors.textPrimary}>
              {title}
            </ScaledText>
            {isZh ? null : (video.title_zh ? (
              <ScaledText size={13} color={Colors.textSecondary} style={{ marginTop: 4 }}>
                {video.title_zh}
              </ScaledText>
            ) : null)}

            <View style={styles.metaRow}>
              {video.category ? (
                <View style={styles.catPill}>
                  <Text style={styles.catPillText}>{video.category}</Text>
                </View>
              ) : null}
              {video.partner_name ? (
                <View style={styles.partnerRow}>
                  <Building2 size={12} color={Colors.textSecondary} />
                  <Text style={styles.partnerText}>{video.partner_name}</Text>
                </View>
              ) : null}
            </View>

            {description ? (
              <View style={styles.descBox}>
                <ScaledText size={14} color={Colors.textPrimary} style={styles.descText}>
                  {description}
                </ScaledText>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={showLangPicker} transparent animationType="fade" onRequestClose={() => setShowLangPicker(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowLangPicker(false)}>
          <View style={styles.langSheet}>
            <Text style={styles.langSheetTitle}>{isZh ? '選擇字幕語言' : 'Subtitle Language'}</Text>
            {subtitleLanguages.map((l) => (
              <TouchableOpacity
                key={l.code}
                style={styles.langRow}
                onPress={() => { setSelectedSubLang(l.code); setShowSubtitles(true); setShowLangPicker(false); }}
                activeOpacity={0.7}
              >
                <Text style={styles.langRowText}>{l.label}</Text>
                {selectedSubLang === l.code && <Check size={18} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '500' as const },
  errorText: { color: Colors.error, fontSize: 15, fontWeight: '600' as const, marginBottom: 12 },
  backBtnAction: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10,
  },
  backBtnActionText: { color: '#fff', fontWeight: '700' as const },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#0B1220',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { color: '#fff', fontSize: 15, fontWeight: '700' as const, flex: 1 },
  scrollContent: { paddingBottom: 40 },
  videoArea: { backgroundColor: '#000', position: 'relative' as const },
  unavailable: { alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: '#000' },
  unavailableText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' as const },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  subtitleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  subtitleToggleOff: {
    backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  subtitleToggleText: { color: '#fff', fontSize: 12, fontWeight: '700' as const },
  langPicker: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999,
  },
  langPickerText: { color: Colors.textPrimary, fontSize: 12, fontWeight: '700' as const },
  infoSection: {
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    flexWrap: 'wrap' as const,
  },
  catPill: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
  },
  catPillText: { color: Colors.primaryDark, fontSize: 12, fontWeight: '700' as const },
  partnerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  partnerText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' as const },
  descBox: {
    marginTop: 14,
    padding: 14,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  descText: { lineHeight: 22 },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  langSheet: {
    width: '100%', maxWidth: 360,
    backgroundColor: '#fff', borderRadius: 16,
    padding: 8,
  },
  langSheetTitle: { fontSize: 14, fontWeight: '700' as const, color: Colors.textPrimary, padding: 12 },
  langRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 14,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  langRowText: { fontSize: 15, color: Colors.textPrimary, fontWeight: '500' as const },
});

