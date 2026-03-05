import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { log } from '@/lib/logger';

interface VimeoPlayerProps {
  videoId: string;
  height: number;
  onEnd?: () => void;
}

function getVimeoEmbedUrl(videoId: string): string {
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
  return `https://player.vimeo.com/video/${videoId}?${params.toString()}`;
}

function getVimeoHTML(videoId: string): string {
  const embedUrl = getVimeoEmbedUrl(videoId);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>
    * { margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe
    id="player"
    src="${embedUrl}"
    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
    allowfullscreen
  ></iframe>
  <script src="https://player.vimeo.com/api/player.js"></script>
  <script>
    var iframe = document.getElementById('player');
    var vimeoPlayer = new Vimeo.Player(iframe);
    vimeoPlayer.on('ended', function() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'videoEnded' }));
      }
    });
  </script>
</body>
</html>`;
}

function VimeoPlayerInner({ videoId, height, onEnd }: VimeoPlayerProps) {
  const webViewRef = useRef(null);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'videoEnded') {
        log('[VimeoPlayer] Video ended');
        onEnd?.();
      }
    } catch (e) {
      log('[VimeoPlayer] Message parse error:', e);
    }
  }, [onEnd]);

  if (!videoId || videoId.trim() === '') {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.unavailable}>
          <Text style={styles.unavailableText}>Video unavailable</Text>
        </View>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { height }]}>
        {/* @ts-ignore - iframe is valid on web */}
        <iframe
          src={getVimeoEmbedUrl(videoId)}
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

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webViewRef}
        source={{ html: getVimeoHTML(videoId) }}
        style={styles.webview}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        onMessage={handleMessage}
        scrollEnabled={false}
        bounces={false}
        allowsFullscreenVideo
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
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  unavailable: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: '#000',
  },
  unavailableText: {
    color: '#fff',
    fontSize: 14,
  },
});
