import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';
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
#sh{position:absolute;top:0;left:0;width:100%;height:100%;z-index:9999;
display:flex;align-items:center;justify-content:center;
-webkit-tap-highlight-color:rgba(0,0,0,0);}
#pb{width:52px;height:52px;border-radius:50%;background:rgba(0,0,0,0.5);
display:flex;align-items:center;justify-content:center;
transition:opacity 0.4s ease;opacity:0.9;}
#pb.h{opacity:0;}
#pb svg{width:22px;height:22px;}
${FULLSCREEN_PREVENTION_CSS}
</style>
</head><body>
<div id="w">
<iframe id="vf" src="${embedUrl}" allow="autoplay; encrypted-media" sandbox="allow-scripts allow-same-origin allow-popups" allowfullscreen="false" webkitallowfullscreen="false"></iframe>
<div id="sh"></div>
<div id="pb" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10000;"><svg viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21" fill="#fff"/></svg></div>
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
function showBtn(){pb.classList.remove('h');clearTimeout(ft);if(pl)ft=setTimeout(function(){pb.classList.add('h');},1800);}
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

function toggle(){
  if(!rdy)return;
  if(pl){cmd({method:'pause'});}
  else{cmd({method:'play'});}
}

var tX=0,tY=0,tT=0;
function onTapStart(e){
  if(e.touches&&e.touches.length===1){
    tX=e.touches[0].clientX;
    tY=e.touches[0].clientY;
    tT=Date.now();
  }
}
function onTapEnd(e){
  if(Date.now()-tT>500)return;
  var cx,cy;
  if(e.changedTouches&&e.changedTouches.length>0){
    cx=e.changedTouches[0].clientX;
    cy=e.changedTouches[0].clientY;
  } else return;
  if(Math.abs(cx-tX)>15||Math.abs(cy-tY)>15)return;
  e.preventDefault();
  toggle();
  showBtn();
}

sh.addEventListener('touchstart',onTapStart,{passive:true});
sh.addEventListener('touchend',onTapEnd,{passive:false});
pb.addEventListener('touchstart',onTapStart,{passive:true});
pb.addEventListener('touchend',onTapEnd,{passive:false});

sh.onclick=function(){toggle();showBtn();};
pb.onclick=function(){toggle();showBtn();};

window.addEventListener('message',function(e){
  try{
    var d=typeof e.data==='string'?JSON.parse(e.data):e.data;
    if(d.event==='ready'){
      rdy=true;
      cmd({method:'addEventListener',value:'play'});
      cmd({method:'addEventListener',value:'pause'});
      cmd({method:'addEventListener',value:'ended'});
    }
    if(d.event==='play'){pl=true;ic(true);showBtn();}
    if(d.event==='pause'){pl=false;ic(false);showBtn();}
    if(d.event==='ended'){
      pl=false;ic(false);showBtn();
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
