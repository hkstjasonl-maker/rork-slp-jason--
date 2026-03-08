import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { VideoOff } from 'lucide-react-native';
import { ScaledText } from '@/components/ScaledText';
import Colors from '@/constants/colors';
import { log } from '@/lib/logger';
import { FULLSCREEN_PREVENTION_CSS, FULLSCREEN_PREVENTION_JS, INJECTED_JS_BEFORE_LOAD } from '@/lib/fullscreenPrevention';

interface VimeoPlayerProps {
  videoId: string;
  height: number;
  onEnd?: () => void;
  lowQuality?: boolean;
}

function VimeoPlayerInner({ videoId, height, onEnd, lowQuality }: VimeoPlayerProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!videoId || videoId.trim() === '') {
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  }, [videoId]);

  if (!videoId || videoId.trim() === '') {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.unavailable}>
          <VideoOff size={32} color="#666" />
          <ScaledText size={14} color="#999" style={styles.unavailableLabel}>{String('Video unavailable')}</ScaledText>
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

  const quality = lowQuality ? '360p' : '720p';
  const embedUrl = `https://player.vimeo.com/video/${videoId}?autoplay=0&quality=${quality}&dnt=1&fullscreen=0&playsinline=1`;

  if (Platform.OS === 'web') {
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
          allow="autoplay; encrypted-media"
          allowFullScreen={false}
        />
      </View>
    );
  }

  const WebView = require('react-native-webview').WebView;

  const html = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-touch-callout:none;}
html,body{width:100%;height:100%;background:#000;overflow:hidden;touch-action:manipulation;-webkit-user-select:none;}
iframe{width:100%;height:100%;border:none;pointer-events:auto;}
${FULLSCREEN_PREVENTION_CSS}
</style>
</head><body>
<iframe src="${embedUrl}" sandbox="allow-scripts allow-same-origin" allow="autoplay; encrypted-media"></iframe>
<script>${FULLSCREEN_PREVENTION_JS}</script>
</body></html>`;

  const handleMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'videoEnded' && onEnd) {
        onEnd();
      }
    } catch (e) {
      log('[VimeoPlayer] Message parse error:', e);
    }
  };

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        source={{ html }}
        style={styles.video}
        allowsInlineMediaPlayback={true}
        allowsFullscreenVideo={false}
        allowsAirPlayForMediaPlayback={false}
        allowsLinkPreview={false}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        scrollEnabled={false}
        bounces={false}
        onMessage={handleMessage}
        scalesPageToFit={false}
        injectedJavaScriptBeforeContentLoaded={INJECTED_JS_BEFORE_LOAD}
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
    backgroundColor: '#000',
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
