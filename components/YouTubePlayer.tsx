import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { log } from '@/lib/logger';
import { FULLSCREEN_PREVENTION_CSS, FULLSCREEN_PREVENTION_JS, INJECTED_JS_BEFORE_LOAD } from '@/lib/fullscreenPrevention';

interface YouTubePlayerProps {
  videoId: string;
  height: number;
  onEnd?: () => void;
}

function getYouTubeHTML(videoId: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;-webkit-touch-callout:none;}
html,body{width:100%;height:100%;background:#000;overflow:hidden;touch-action:manipulation;-webkit-user-select:none;}
iframe{width:100%;height:100%;border:none;}
${FULLSCREEN_PREVENTION_CSS}
</style>
</head><body>
<iframe
  id="player"
  src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1&fs=0"
  sandbox="allow-scripts allow-same-origin"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
></iframe>
<script>
${FULLSCREEN_PREVENTION_JS}
window.addEventListener('message', function(event) {
  try {
    var data = JSON.parse(event.data);
    if (data.event === 'onStateChange' && data.info === 0) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'videoEnded' }));
    }
  } catch(e) {}
});
</script>
</body></html>`;
}

function YouTubePlayerInner({ videoId, height, onEnd }: YouTubePlayerProps) {
  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'videoEnded') {
        onEnd?.();
      }
    } catch (e) {
      log('YouTubePlayer message parse error:', e);
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
          src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&fs=0&playsinline=1`}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: 12,
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
          allowFullScreen={false}
        />
      </View>
    );
  }

  const WebView = require('react-native-webview').WebView;

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        source={{ html: getYouTubeHTML(videoId) }}
        style={styles.webview}
        allowsInlineMediaPlayback={true}
        allowsFullscreenVideo={false}
        allowsAirPlayForMediaPlayback={false}
        allowsLinkPreview={false}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        onMessage={handleMessage}
        scrollEnabled={false}
        bounces={false}
        scalesPageToFit={false}
        injectedJavaScriptBeforeContentLoaded={INJECTED_JS_BEFORE_LOAD}
      />
    </View>
  );
}

export const YouTubePlayer = React.memo(YouTubePlayerInner);

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
