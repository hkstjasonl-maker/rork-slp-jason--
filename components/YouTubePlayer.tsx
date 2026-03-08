import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Platform, PanResponder, GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { log } from '@/lib/logger';
import { FULLSCREEN_PREVENTION_CSS, INJECTED_JS_BEFORE_LOAD } from '@/lib/fullscreenPrevention';

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
*{margin:0;padding:0;box-sizing:border-box;-webkit-touch-callout:none;-webkit-user-select:none;}
html,body{width:100%;height:100%;background:#000;overflow:hidden;touch-action:none;}
#w{position:relative;width:100%;height:100%;}
#ytplayer{width:100%;height:100%;}
iframe{pointer-events:none !important;}
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
<div id="ytplayer"></div>
<div id="sh">
<div id="pb"><svg viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21" fill="#fff"/></svg></div>
</div>
</div>
<script>
var tag=document.createElement('script');
tag.src='https://www.youtube.com/iframe_api';
document.body.appendChild(tag);

var player;
var pb=document.getElementById('pb');
var sh=document.getElementById('sh');
var ft;
var playI='<svg viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21" fill="#fff"/></svg>';
var pauseI='<svg viewBox="0 0 24 24"><rect x="5" y="3" width="4" height="18" rx="1" fill="#fff"/><rect x="15" y="3" width="4" height="18" rx="1" fill="#fff"/></svg>';

function ic(p){pb.innerHTML=p?pauseI:playI;}
function show(playing){pb.classList.remove('h');clearTimeout(ft);if(playing)ft=setTimeout(function(){pb.classList.add('h');},1800);}

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
  if(!player||typeof player.getPlayerState!=='function')return;
  var st=player.getPlayerState();
  if(st===1){player.pauseVideo();ic(false);show(false);}
  else{player.playVideo();ic(true);show(true);}
});

function onYouTubeIframeAPIReady(){
  player=new YT.Player('ytplayer',{
    videoId:'${videoId}',
    playerVars:{playsinline:1,fs:0,rel:0,modestbranding:1,disablekb:1},
    events:{
      onStateChange:function(e){
        if(e.data===1){ic(true);show(true);}
        if(e.data===2){ic(false);show(false);}
        if(e.data===0){
          ic(false);show(false);
          window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'videoEnded'}));
        }
      }
    }
  });
}
</script>
</body></html>`;
}

function YouTubePlayerInner({ videoId, height, onEnd }: YouTubePlayerProps) {
  const webViewRef = useRef<any>(null);
  const tapStartTime = useRef<number>(0);
  const tapStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleTap = useCallback(() => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        (function(){
          var sh = document.getElementById('sh');
          if (sh) sh.click();
        })();
        true;
      `);
    }
  }, []);

  const touchBlocker = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        tapStartTime.current = Date.now();
        tapStartPos.current = {
          x: evt.nativeEvent.pageX,
          y: evt.nativeEvent.pageY,
        };
      },
      onPanResponderMove: () => {},
      onPanResponderRelease: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const elapsed = Date.now() - tapStartTime.current;
        const dist = Math.sqrt(gestureState.dx * gestureState.dx + gestureState.dy * gestureState.dy);
        if (elapsed < 300 && dist < 15 && evt.nativeEvent.touches.length <= 1) {
          handleTap();
        }
      },
      onPanResponderTerminate: () => {},
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

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
        ref={webViewRef}
        source={{ html: getYouTubeHTML(videoId) }}
        style={styles.webview}
        allowsInlineMediaPlayback={true}
        allowsFullscreenVideo={false}
        allowsAirPlayForMediaPlayback={false}
        allowsLinkPreview={false}
        allowsPictureInPictureMediaPlayback={false}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        onMessage={handleMessage}
        scrollEnabled={false}
        bounces={false}
        scalesPageToFit={false}
        injectedJavaScriptBeforeContentLoaded={INJECTED_JS_BEFORE_LOAD}
        setSupportMultipleWindows={false}
      />
      <View style={styles.nativeTouchBlocker} {...touchBlocker.panHandlers} />
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
