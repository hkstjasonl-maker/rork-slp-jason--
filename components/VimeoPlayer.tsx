import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator, PanResponder, GestureResponderEvent } from 'react-native';
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

const pinchBlockerRef = PanResponder.create({
  onStartShouldSetPanResponderCapture: (e: GestureResponderEvent) =>
    (e.nativeEvent.touches?.length ?? 0) >= 2,
  onMoveShouldSetPanResponderCapture: (e: GestureResponderEvent) =>
    (e.nativeEvent.touches?.length ?? 0) >= 2,
  onPanResponderGrant: () => {},
  onPanResponderMove: () => {},
  onPanResponderRelease: () => {},
});

function VimeoPlayerInner({ videoId, height, onEnd, lowQuality }: VimeoPlayerProps) {
  const [loading, setLoading] = useState(true);
  const pinchBlocker = useRef(pinchBlockerRef).current;

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
  const embedUrl = `https://player.vimeo.com/video/${videoId}?autoplay=0&quality=${quality}&dnt=1&fullscreen=0`;

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
          allow="autoplay; picture-in-picture; encrypted-media"
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
iframe{width:100%;height:100%;border:none;}
</style>
</head><body>
<iframe src="${embedUrl}" sandbox="allow-scripts allow-same-origin allow-popups" allow="autoplay; encrypted-media"></iframe>
<script>
(function(){
var bmt=function(e){if(e.touches&&e.touches.length>1){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();}};
document.addEventListener('touchstart',bmt,{passive:false,capture:true});
document.addEventListener('touchmove',bmt,{passive:false,capture:true});
document.addEventListener('gesturestart',function(e){e.preventDefault();e.stopPropagation();},{passive:false,capture:true});
document.addEventListener('gesturechange',function(e){e.preventDefault();e.stopPropagation();},{passive:false,capture:true});
document.addEventListener('gestureend',function(e){e.preventDefault();e.stopPropagation();},{passive:false,capture:true});
})();
</script>
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
    <View style={[styles.container, { height }]} {...pinchBlocker.panHandlers}>
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
