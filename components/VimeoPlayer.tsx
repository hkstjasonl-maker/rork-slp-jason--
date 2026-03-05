import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { VideoOff } from 'lucide-react-native';
import { ScaledText } from '@/components/ScaledText';
import { log } from '@/lib/logger';
import Colors from '@/constants/colors';

interface VimeoPlayerProps {
  videoId: string;
  height: number;
  onEnd?: () => void;
  lowQuality?: boolean;
}

interface VimeoFile {
  type: string;
  link: string;
  height: number;
  width: number;
  quality: string;
}

const VIMEO_TOKEN = process.env.EXPO_PUBLIC_VIMEO_ACCESS_TOKEN || '';

async function getVimeoDirectUrl(vimeoId: string, lowQuality?: boolean): Promise<string | null> {
  try {
    log('[VimeoPlayer] Fetching direct URL for video:', vimeoId);
    const response = await fetch(`https://api.vimeo.com/videos/${vimeoId}`, {
      headers: {
        'Authorization': `Bearer ${VIMEO_TOKEN}`,
        'Accept': 'application/vnd.vimeo.*+json;version=3.4',
      },
    });

    if (!response.ok) {
      log('[VimeoPlayer] Vimeo API error:', response.status);
      return null;
    }

    const data = await response.json();
    const files: VimeoFile[] = (data.files || []).filter((f: VimeoFile) => f.type === 'video/mp4');

    if (files.length === 0) {
      log('[VimeoPlayer] No MP4 files found, trying download links');
      const download = data.download;
      if (download && Array.isArray(download)) {
        const mp4Downloads = download.filter((d: VimeoFile) => d.type === 'video/mp4');
        if (mp4Downloads.length > 0) {
          const sorted = mp4Downloads.sort((a: VimeoFile, b: VimeoFile) => b.height - a.height);
          const maxHeight = lowQuality ? 360 : 720;
          const preferred = sorted.find((f: VimeoFile) => f.height <= maxHeight) || sorted[sorted.length - 1];
          log('[VimeoPlayer] Using download link, quality:', preferred.height + 'p');
          return preferred.link;
        }
      }
      log('[VimeoPlayer] No playable files found');
      return null;
    }

    const sorted = files.sort((a, b) => b.height - a.height);
    const maxHeight = lowQuality ? 360 : 720;
    const preferred = sorted.find(f => f.height <= maxHeight) || sorted[sorted.length - 1];
    log('[VimeoPlayer] Direct URL resolved, quality:', preferred.height + 'p');
    return preferred.link;
  } catch (error) {
    log('[VimeoPlayer] Error fetching Vimeo URL:', error);
    return null;
  }
}

function getVimeoEmbedUrl(videoId: string, lowQuality?: boolean): string {
  const params = new URLSearchParams({
    h: '',
    badge: '0',
    autopause: '0',
    player_id: '0',
    title: '0',
    byline: '0',
    portrait: '0',
    playsinline: '1',
    dnt: '1',
  });
  if (lowQuality) {
    params.set('quality', '360p');
  }
  return `https://player.vimeo.com/video/${videoId}?${params.toString()}`;
}

function VimeoPlayerInner({ videoId, height, onEnd, lowQuality }: VimeoPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [directUrl, setDirectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!videoId || videoId.trim() === '') return;

    let cancelled = false;
    setLoading(true);
    setError(false);
    setDirectUrl(null);

    getVimeoDirectUrl(videoId, lowQuality).then(url => {
      if (cancelled) return;
      if (url) {
        setDirectUrl(url);
      } else {
        setError(true);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [videoId, lowQuality]);

  const handlePlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded && status.didJustFinish) {
      log('[VimeoPlayer] Video ended');
      onEnd?.();
    }
  }, [onEnd]);

  if (!videoId || videoId.trim() === '') {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.unavailable}>
          <VideoOff size={32} color="#666" />
          <ScaledText size={14} color="#999" style={styles.unavailableLabel}>Video unavailable</ScaledText>
        </View>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { height }]}>
        {/* @ts-ignore - iframe is valid on web */}
        <iframe
          src={getVimeoEmbedUrl(videoId, lowQuality)}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: 12,
          }}
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <ScaledText size={13} color="#999" style={styles.loadingLabel}>Loading video...</ScaledText>
        </View>
      </View>
    );
  }

  if (error || !directUrl) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.unavailable}>
          <VideoOff size={32} color="#666" />
          <ScaledText size={14} color="#999" style={styles.unavailableLabel}>Video unavailable</ScaledText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <Video
        ref={videoRef}
        source={{ uri: directUrl }}
        style={styles.video}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={false}
        isMuted={false}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        onError={(err) => {
          log('[VimeoPlayer] Playback error:', err);
          setError(true);
        }}
      />
    </View>
  );
}

export const VimeoPlayer = React.memo(VimeoPlayerInner);

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    gap: 10,
  },
  loadingLabel: {
    marginTop: 4,
  },
  unavailable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  unavailableLabel: {
    marginTop: 8,
  },
});
