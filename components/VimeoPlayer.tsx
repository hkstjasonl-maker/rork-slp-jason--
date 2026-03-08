import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator, TouchableWithoutFeedback } from 'react-native';
import { VideoOff } from 'lucide-react-native';
import { ScaledText } from '@/components/ScaledText';
import Colors from '@/constants/colors';
import { log } from '@/lib/logger';
import { FULLSCREEN_PREVENTION_CSS, INJECTED_JS_BEFORE_LOAD } from '@/lib/fullscreenPrevention';

interface VimeoPlayerProps {
  videoId: string;
  height: number;
  onEnd?: () => void;
  lowQuality?: boolean;
}

function VimeoPlayerInner({ videoId, height, onEnd, lowQuality }: VimeoPlayerProps) {
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef<any>(null);
  const isPlayingRef = useRef(false);
  const isReadyRef = useRef(false);

  const handleNativeTap = useCallback(() => {
    if (!isReadyRef.current || !webViewRef.current) return;
    const action = isPlayingRef.current ? 'pause' : 'play';
    webViewRef.current.injectJavaScript(`
      (function(){
        try {
          var vf = document.getElementById('vf');
          if(vf && vf.contentWindow) {
            vf.contentWindow.postMessage(JSON.stringify({method:'${action}'}), '*');
          }
        } catch(e){}
        var pb = document.getElementById('pb');
        if(pb) { pb.classList.remove('h'); clearTimeout(window._ft); if('${action}'==='play') window._ft=setTimeout(function(){pb.classList.add('h');},1800); }
      })();
      true;
    `);
  }, []);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready') {
        isReadyRef.current = true;
      } else if (data.type === 'play') {
        isPlayingRef.current = true;
      } else if (data.type === 'pause') {
        isPlayingRef.current = false;
      } else if (data.type === 'videoEnded') {
        isPlayingRef.current = false;
        if (onEnd) onEnd();
      }
    } catch (e) {
      log('[VimeoPlayer] Message parse error:', e);
    }
  }, [onEnd]);

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
  const embedUrl = `https://player.vimeo.com/video/${videoId}?autoplay=0&quality=${quality}&dnt=1&fullscreen=0&playsinline=1&api=1&transparent=0`;

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
*{margin:0;padding:0;box-sizing:border-box;-webkit-touch-callout:none;-webkit-user-select:none;}
html,body{width:100%;height:100%;background:#000;overflow:hidden;}
#w{position:relative;width:100%;height:100%;}
iframe{width:100%;height:100%;border:none;pointer-events:none !important;}
#pb{width:52px;height:52px;border-radius:50%;background:rgba(0,0,0,0.5);
position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10000;
display:flex;align-items:center;justify-content:center;
transition:opacity 0.4s ease;opacity:0.9;pointer-events:none !important;}
#pb.h{opacity:0;}
#pb svg{width:22px;height:22px;}
${FULLSCREEN_PREVENTION_CSS}
</style>
</head><body>
<div id="w">
<iframe id="vf" src="${embedUrl}" allow="autoplay; encrypted-media" sandbox="allow-scripts allow-same-origin allow-popups" allowfullscreen="false" webkitallowfullscreen="false"></iframe>
<div id="pb"><svg viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21" fill="#fff"/></svg></div>
</div>
<script>
(function(){
var vf=document.getElementById('vf');
var pb=document.getElementById('pb');
var pl=false,rdy=false;
window._ft=null;
var playI='<svg viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21" fill="#fff"/></svg>';
var pauseI='<svg viewBox="0 0 24 24"><rect x="5" y="3" width="4" height="18" rx="1" fill="#fff"/><rect x="15" y="3" width="4" height="18" rx="1" fill="#fff"/></svg>';

function ic(p){pb.innerHTML=p?pauseI:playI;}
function showBtn(){pb.classList.remove('h');clearTimeout(window._ft);if(pl)window._ft=setTimeout(function(){pb.classList.add('h');},1800);}
function cmd(m){try{vf.contentWindow.postMessage(JSON.stringify(m),'*');}catch(e){}}

function blockMulti(e){
  if(e.touches&&e.touches.length>1){
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  }
}
document.addEventListener('touchstart',blockMulti,{passive:false,capture:true});
document.addEventListener('touchmove',blockMulti,{passive:false,capture:true});
document.addEventListener('touchend',blockMulti,{passive:false,capture:true});
['gesturestart','gesturechange','gestureend'].forEach(function(n){
  document.addEventListener(n,function(e){
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  },{passive:false,capture:true});
});

window.addEventListener('message',function(e){
  try{
    var d=typeof e.data==='string'?JSON.parse(e.data):e.data;
    if(d.event==='ready'){
      rdy=true;
      cmd({method:'addEventListener',value:'play'});
      cmd({method:'addEventListener',value:'pause'});
      cmd({method:'addEventListener',value:'ended'});
      window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
    }
    if(d.event==='play'){pl=true;ic(true);showBtn();
      window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'play'}));
    }
    if(d.event==='pause'){pl=false;ic(false);showBtn();
      window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'pause'}));
    }
    if(d.event==='ended'){
      pl=false;ic(false);showBtn();
      window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'videoEnded'}));
    }
  }catch(x){}
});
})();
</script>
</body></html>`;

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.video}
        allowsInlineMediaPlayback={true}
        allowsFullscreenVideo={false}
        allowsAirPlayForMediaPlayback={false}
        allowsLinkPreview={false}
        allowsPictureInPictureMediaPlayback={false}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        scrollEnabled={false}
        bounces={false}
        onMessage={handleMessage}
        scalesPageToFit={false}
        injectedJavaScriptBeforeContentLoaded={INJECTED_JS_BEFORE_LOAD}
        setSupportMultipleWindows={false}
      />
      <TouchableWithoutFeedback onPress={handleNativeTap}>
        <View style={styles.tapOverlay} />
      </TouchableWithoutFeedback>
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
  tapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: 'transparent',
  },
});
