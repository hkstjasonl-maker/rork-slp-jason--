import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator, PanResponder, GestureResponderEvent } from 'react-native';
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
  const touchBlocker = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt: GestureResponderEvent) => {
        return (evt.nativeEvent.touches?.length ?? 0) > 1;
      },
      onStartShouldSetPanResponderCapture: (evt: GestureResponderEvent) => {
        return (evt.nativeEvent.touches?.length ?? 0) > 1;
      },
      onMoveShouldSetPanResponder: (evt: GestureResponderEvent) => {
        return (evt.nativeEvent.touches?.length ?? 0) > 1;
      },
      onMoveShouldSetPanResponderCapture: (evt: GestureResponderEvent) => {
        return (evt.nativeEvent.touches?.length ?? 0) > 1;
      },
      onPanResponderGrant: () => {},
      onPanResponderMove: () => {},
      onPanResponderRelease: () => {},
      onPanResponderTerminate: () => {},
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

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
html,body{width:100%;height:100%;background:#000;overflow:hidden;touch-action:none;}
#w{position:relative;width:100%;height:100%;}
iframe{width:100%;height:100%;border:none;pointer-events:none !important;}
#sh{position:absolute;top:0;left:0;right:0;bottom:0;z-index:9999;
display:flex;align-items:center;justify-content:center;
touch-action:none;-webkit-tap-highlight-color:transparent;}
#pb{width:52px;height:52px;border-radius:50%;background:rgba(0,0,0,0.5);
display:flex;align-items:center;justify-content:center;
transition:opacity 0.4s ease;opacity:0.9;}
#pb.h{opacity:0;pointer-events:none;}
#pb svg{width:22px;height:22px;}
${FULLSCREEN_PREVENTION_CSS}
</style>
</head><body>
<div id="w">
<iframe id="vf" src="${embedUrl}" allow="autoplay; encrypted-media" sandbox="allow-scripts allow-same-origin allow-popups" allowfullscreen="false" webkitallowfullscreen="false"></iframe>
<div id="sh">
<div id="pb"><svg viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21" fill="#fff"/></svg></div>
</div>
</div>
<script>
(function(){
var vf=document.getElementById('vf');
var sh=document.getElementById('sh');
var pb=document.getElementById('pb');
var pl=false,rdy=false,ft;
var playI='<svg viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21" fill="#fff"/></svg>';
var pauseI='<svg viewBox="0 0 24 24"><rect x="5" y="3" width="4" height="18" rx="1" fill="#fff"/><rect x="15" y="3" width="4" height="18" rx="1" fill="#fff"/></svg>';

function ic(p){pb.innerHTML=p?pauseI:playI;}
function show(){pb.classList.remove('h');clearTimeout(ft);if(pl)ft=setTimeout(function(){pb.classList.add('h');},1800);}
function cmd(m){try{vf.contentWindow.postMessage(JSON.stringify(m),'*');}catch(e){}}

['touchstart','touchmove','touchend','touchcancel'].forEach(function(n){
  sh.addEventListener(n,function(e){
    if(e.touches&&e.touches.length>1){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    }
  },{passive:false,capture:true});
});
['gesturestart','gesturechange','gestureend'].forEach(function(n){
  document.addEventListener(n,function(e){
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  },{passive:false,capture:true});
});

sh.addEventListener('click',function(){
  if(!rdy)return;
  if(pl){cmd({method:'pause'});}
  else{cmd({method:'play'});}
});

window.addEventListener('message',function(e){
  try{
    var d=typeof e.data==='string'?JSON.parse(e.data):e.data;
    if(d.event==='ready'){
      rdy=true;
      cmd({method:'addEventListener',value:'play'});
      cmd({method:'addEventListener',value:'pause'});
      cmd({method:'addEventListener',value:'ended'});
    }
    if(d.event==='play'){pl=true;ic(true);show();}
    if(d.event==='pause'){pl=false;ic(false);show();}
    if(d.event==='ended'){
      pl=false;ic(false);show();
      window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'videoEnded'}));
    }
  }catch(x){}
});
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
      <View style={styles.nativeTouchBlocker} {...touchBlocker.panHandlers} />
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
  nativeTouchBlocker: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    backgroundColor: 'transparent',
  },
});
