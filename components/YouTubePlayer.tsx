import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, PanResponder, GestureResponderEvent } from 'react-native';
import { WebView } from 'react-native-webview';
import { log } from '@/lib/logger';

interface YouTubePlayerProps {
  videoId: string;
  height: number;
  onEnd?: () => void;
}

function getYouTubeHTML(videoId: string): string {
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
    src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1&fs=0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  ></iframe>
  <script>
    window.addEventListener('message', function(event) {
      try {
        var data = JSON.parse(event.data);
        if (data.event === 'onStateChange' && data.info === 0) {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'videoEnded' }));
        }
      } catch(e) {}
    });
  </script>
</body>
</html>`;
}

const pinchBlockerRef = PanResponder.create({
  onStartShouldSetPanResponderCapture: (e: GestureResponderEvent) => e.nativeEvent.touches.length >= 2,
  onMoveShouldSetPanResponderCapture: (e: GestureResponderEvent) => e.nativeEvent.touches.length >= 2,
  onPanResponderGrant: () => {},
  onPanResponderMove: () => {},
  onPanResponderRelease: () => {},
});

function YouTubePlayerInner({ videoId, height, onEnd }: YouTubePlayerProps) {
  const webViewRef = useRef(null);
  const pinchBlocker = useRef(pinchBlockerRef).current;

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
          src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: 12,
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]} {...pinchBlocker.panHandlers}>
      <WebView
        ref={webViewRef}
        source={{ html: getYouTubeHTML(videoId) }}
        style={styles.webview}
        allowsInlineMediaPlayback
        allowsFullscreenVideo={false}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        onMessage={handleMessage}
        scrollEnabled={false}
        bounces={false}
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
