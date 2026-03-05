import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { VideoOff } from 'lucide-react-native';
import { ScaledText } from '@/components/ScaledText';
import Colors from '@/constants/colors';
import { log } from '@/lib/logger';

interface VimeoPlayerProps {
  videoId: string;
  height: number;
  onEnd?: () => void;
  lowQuality?: boolean;
}

async function getVimeoHlsUrl(vimeoId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://player.vimeo.com/video/${vimeoId}/config`);
    const config = await response.json();

    const progressive = config?.request?.files?.progressive || [];
    if (progressive.length > 0) {
      const sorted = progressive
        .filter((f: { type?: string }) => !f.type || f.type === 'video/mp4')
        .sort((a: { height: number }, b: { height: number }) => b.height - a.height);
      const preferred = sorted.find((f: { height: number }) => f.height <= 720) || sorted[0];
      if (preferred?.url) {
        log('[VimeoPlayer] Using progressive URL, height:', preferred.height);
        return preferred.url;
      }
    }

    const hlsCdns = config?.request?.files?.hls?.cdns || {};
    const cdnKeys = Object.keys(hlsCdns);
    if (cdnKeys.length > 0) {
      const firstCdn = hlsCdns[cdnKeys[0]];
      const hlsUrl = firstCdn?.url || firstCdn?.avc_url;
      if (hlsUrl) {
        log('[VimeoPlayer] Using HLS URL');
        return hlsUrl;
      }
    }

    log('[VimeoPlayer] No playback URL found in config');
    return null;
  } catch (error) {
    log('[VimeoPlayer] Config fetch error:', error);
    return null;
  }
}

function VimeoPlayerInner({ videoId, height, onEnd, lowQuality }: VimeoPlayerProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!videoId || videoId.trim() === '') {
      setLoading(false);
      setError(true);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    setVideoUrl(null);

    getVimeoHlsUrl(videoId).then((url) => {
      if (cancelled) return;
      if (url) {
        setVideoUrl(url);
      } else {
        setError(true);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [videoId]);

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

  if (loading) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.unavailable}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    const quality = lowQuality ? '360p' : '720p';
    const embedUrl = `https://player.vimeo.com/video/${videoId}?autoplay=0&quality=${quality}`;
    return (
      <View style={[styles.container, { height }]}>
        {/* @ts-ignore - iframe is valid on web */}
        <iframe
          src={embedUrl}
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

  if (videoUrl) {
    return (
      <View style={[styles.container, { height }]}>
        <Video
          source={{ uri: videoUrl }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls={true}
          shouldPlay={false}
          isMuted={false}
          onPlaybackStatusUpdate={(status) => {
            if ('didJustFinish' in status && status.didJustFinish && onEnd) {
              onEnd();
            }
          }}
        />
      </View>
    );
  }

  if (error) {
    const quality = lowQuality ? '360p' : '720p';
    const embedUrl = `https://player.vimeo.com/video/${videoId}?autoplay=0&quality=${quality}`;
    const WebView = require('react-native-webview').WebView;
    return (
      <View style={[styles.container, { height }]}>
        <WebView
          source={{ uri: embedUrl }}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          style={styles.video}
          javaScriptEnabled={true}
          scrollEnabled={false}
          bounces={false}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.unavailable}>
        <VideoOff size={32} color="#666" />
        <ScaledText size={14} color="#999" style={styles.unavailableLabel}>Video unavailable</ScaledText>
      </View>
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
