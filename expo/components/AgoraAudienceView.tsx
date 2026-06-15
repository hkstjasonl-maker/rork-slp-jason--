import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { log } from '@/lib/logger';

export interface AgoraAudienceViewProps {
  appId: string;
  channel: string;
  height: number;
  onStreamStarted?: () => void;
  onStreamEnded?: () => void;
  onError?: (message: string) => void;
}

function buildHtml(appId: string, channel: string): string {
  const safeAppId = String(appId).replace(/[^a-zA-Z0-9_-]/g, '');
  const safeChannel = String(channel).replace(/[^a-zA-Z0-9_-]/g, '');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; width: 100%; background: #000; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
  #remote { position: absolute; inset: 0; background: #000; }
  #remote video { width: 100% !important; height: 100% !important; object-fit: contain !important; background: #000; }
  #status {
    position: absolute; top: 10px; right: 10px;
    display: flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 999px;
    background: rgba(0,0,0,0.55); color: #fff; font-size: 11px; font-weight: 700;
    letter-spacing: 0.3px; z-index: 20;
  }
  #dot { width: 8px; height: 8px; border-radius: 50%; background: #EF4444; box-shadow: 0 0 6px rgba(239,68,68,0.7); }
  #dot.live { background: #22C55E; box-shadow: 0 0 8px rgba(34,197,94,0.8); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
  #waiting {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    color: #94A3B8; font-size: 14px; font-weight: 600; letter-spacing: 0.3px;
    text-align: center; padding: 16px; z-index: 10; pointer-events: none;
  }
  #waiting .spinner {
    width: 28px; height: 28px; border-radius: 50%;
    border: 2.5px solid rgba(148,163,184,0.25); border-top-color: #60A5FA;
    animation: spin 0.9s linear infinite; margin-bottom: 10px;
  }
  #waiting .col { display: flex; flex-direction: column; align-items: center; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <div id="remote"></div>
  <div id="waiting"><div class="col"><div class="spinner"></div><div id="waiting-text">Waiting for stream...</div></div></div>
  <div id="status"><div id="dot"></div><span id="status-text">Connecting</span></div>
  <script src="https://download.agora.io/sdk/release/AgoraRTC_N-4.22.0.js"></script>
  <script>
    (function() {
      var APP_ID = "${safeAppId}";
      var CHANNEL = "${safeChannel}";
      var client = null;
      var remoteVideoTrack = null;
      var remoteAudioTrack = null;
      var hasVideo = false;

      function post(obj) {
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify(obj));
          }
        } catch (e) {}
      }

      function setStatus(state) {
        var dot = document.getElementById('dot');
        var txt = document.getElementById('status-text');
        if (!dot || !txt) return;
        if (state === 'live') { dot.className = 'live'; txt.textContent = 'Live'; }
        else if (state === 'paused') { dot.className = ''; txt.textContent = 'Paused'; }
        else if (state === 'ended') { dot.className = ''; txt.textContent = 'Ended'; }
        else { dot.className = ''; txt.textContent = 'Connecting'; }
      }

      function setWaiting(visible, text) {
        var w = document.getElementById('waiting');
        var t = document.getElementById('waiting-text');
        if (!w) return;
        if (text && t) t.textContent = text;
        w.style.display = visible ? 'flex' : 'none';
      }

      async function start() {
        try {
          if (!window.AgoraRTC) { post({ type: 'error', message: 'Agora SDK failed to load' }); return; }
          AgoraRTC.setLogLevel(3);
          client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8', role: 'audience' });

          client.on('user-published', async function(user, mediaType) {
            try {
              await client.subscribe(user, mediaType);
              if (mediaType === 'video') {
                remoteVideoTrack = user.videoTrack;
                hasVideo = true;
                var container = document.getElementById('remote');
                container.innerHTML = '';
                remoteVideoTrack.play(container, { fit: 'contain' });
                setStatus('live');
                setWaiting(false);
                post({ type: 'stream-started' });
              } else if (mediaType === 'audio') {
                remoteAudioTrack = user.audioTrack;
                try { remoteAudioTrack.play(); } catch (e) {}
              }
            } catch (e) {
              post({ type: 'error', message: 'subscribe: ' + (e && e.message ? e.message : String(e)) });
            }
          });

          client.on('user-unpublished', function(user, mediaType) {
            if (mediaType === 'video') {
              hasVideo = false;
              remoteVideoTrack = null;
              var container = document.getElementById('remote');
              if (container) container.innerHTML = '';
              setStatus('paused');
              setWaiting(true, 'Stream paused...');
              post({ type: 'stream-paused' });
            }
          });

          client.on('user-left', function() {
            hasVideo = false;
            remoteVideoTrack = null;
            remoteAudioTrack = null;
            setStatus('ended');
            setWaiting(true, 'Stream ended');
            post({ type: 'stream-ended' });
          });

          client.on('connection-state-change', function(curState, prevState) {
            if (curState === 'DISCONNECTED' || curState === 'RECONNECTING') {
              post({ type: 'disconnected' });
              setStatus('connecting');
              if (!hasVideo) setWaiting(true, 'Waiting for stream...');
            } else if (curState === 'CONNECTED' && prevState === 'RECONNECTING') {
              post({ type: 'reconnected' });
            }
          });

          await client.setClientRole('audience');
          await client.join(APP_ID, CHANNEL, null, null);
          post({ type: 'joined', channel: CHANNEL });
          setWaiting(true, 'Waiting for stream...');
        } catch (e) {
          post({ type: 'error', message: 'join: ' + (e && e.message ? e.message : String(e)) });
        }
      }

      async function leave() {
        try {
          if (client) {
            try { await client.leave(); } catch (e) {}
            client = null;
          }
        } catch (e) {}
      }

      document.addEventListener('message', handleCmd);
      window.addEventListener('message', handleCmd);
      function handleCmd(ev) {
        try {
          var data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
          if (data && data.command === 'leave') { leave(); }
        } catch (e) {}
      }

      start();
    })();
  </script>
</body>
</html>`;
}

function AgoraAudienceViewInner({ appId, channel, height, onStreamStarted, onStreamEnded, onError }: AgoraAudienceViewProps) {
  const webRef = useRef<WebView | null>(null);
  const [html] = useState<string>(() => buildHtml(appId, channel));

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data) as { type: string; message?: string };
      switch (data.type) {
        case 'stream-started':
          onStreamStarted?.();
          break;
        case 'stream-ended':
          onStreamEnded?.();
          break;
        case 'error':
          if (data.message) onError?.(data.message);
          break;
        default:
          break;
      }
    } catch (err) {
      log('[AgoraAudienceView] message parse error:', err);
    }
  }, [onStreamStarted, onStreamEnded, onError]);

  useEffect(() => {
    return () => {
      try {
        webRef.current?.postMessage(JSON.stringify({ command: 'leave' }));
      } catch {}
    };
  }, []);

  const containerStyle = useMemo(() => [styles.container, { height }], [height]);

  if (Platform.OS === 'web') {
    return (
      <View style={containerStyle}>
        {/* @ts-ignore - iframe is web-only */}
        <iframe
          srcDoc={html}
          style={{ width: '100%', height: '100%', border: 0, background: '#000' }}
          allow="autoplay; encrypted-media"
        />
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <WebView
        ref={webRef}
        source={{ html }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={false}
        scrollEnabled={false}
        bounces={false}
        onMessage={onMessage}
        style={styles.web}
        androidLayerType="hardware"
        mixedContentMode="always"
      />
    </View>
  );
}

export const AgoraAudienceView = React.memo(AgoraAudienceViewInner);
export default AgoraAudienceView;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  web: {
    flex: 1,
    backgroundColor: '#000',
  },
});
