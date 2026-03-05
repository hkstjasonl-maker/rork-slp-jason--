import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { VideoOff } from 'lucide-react-native';
import { ScaledText } from '@/components/ScaledText';
import Colors from '@/constants/colors';

interface VimeoPlayerProps {
  videoId: string;
  height: number;
  onEnd?: () => void;
  lowQuality?: boolean;
}

function VimeoPlayerInner({ videoId, height, lowQuality }: VimeoPlayerProps) {
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

  const quality = lowQuality ? '360p' : '720p';
  const embedUrl = `https://player.vimeo.com/video/${videoId}?autoplay=0&quality=${quality}`;

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
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
        />
      </View>
    );
  }

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
