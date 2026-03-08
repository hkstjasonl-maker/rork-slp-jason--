export const FULLSCREEN_PREVENTION_CSS = `
*:-webkit-full-screen { width: 0 !important; height: 0 !important; display: none !important; }
*:fullscreen { width: 0 !important; height: 0 !important; display: none !important; }
*:-ms-fullscreen { width: 0 !important; height: 0 !important; display: none !important; }
*:-moz-full-screen { width: 0 !important; height: 0 !important; display: none !important; }
iframe:-webkit-full-screen { width: 0 !important; height: 0 !important; display: none !important; }
* { touch-action: manipulation !important; -ms-touch-action: manipulation !important; }
html, body, iframe, video, div { touch-action: manipulation !important; }
video::-webkit-media-controls-fullscreen-button { display: none !important; }
`;

export const FULLSCREEN_PREVENTION_JS = `
(function(){
  var touchCount = 0;

  var blockMulti = function(e) {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }
  };
  document.addEventListener('touchstart', blockMulti, {passive:false, capture:true});
  document.addEventListener('touchmove', blockMulti, {passive:false, capture:true});
  document.addEventListener('touchend', blockMulti, {passive:false, capture:true});

  ['gesturestart','gesturechange','gestureend'].forEach(function(evt) {
    document.addEventListener(evt, function(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }, {passive:false, capture:true});
  });

  var noopReject = function() { return Promise.reject(new Error('disabled')); };
  var noopVoid = function() {};

  function blockFullscreenOnElement(el) {
    try { el.requestFullscreen = noopReject; } catch(e){}
    try { el.webkitRequestFullscreen = noopVoid; } catch(e){}
    try { el.webkitRequestFullScreen = noopVoid; } catch(e){}
    try { el.msRequestFullscreen = noopVoid; } catch(e){}
    try { el.mozRequestFullScreen = noopVoid; } catch(e){}
    try { el.webkitEnterFullscreen = noopVoid; } catch(e){}
    try { el.webkitEnterFullScreen = noopVoid; } catch(e){}
  }

  try { blockFullscreenOnElement(Element.prototype); } catch(e){}
  try { blockFullscreenOnElement(HTMLElement.prototype); } catch(e){}
  try {
    if (typeof HTMLVideoElement !== 'undefined') {
      blockFullscreenOnElement(HTMLVideoElement.prototype);
      var origPlay = HTMLVideoElement.prototype.play;
      HTMLVideoElement.prototype.webkitEnterFullscreen = noopVoid;
      HTMLVideoElement.prototype.webkitEnterFullScreen = noopVoid;
      HTMLVideoElement.prototype.requestFullscreen = noopReject;
      HTMLVideoElement.prototype.webkitRequestFullscreen = noopVoid;
      HTMLVideoElement.prototype.webkitRequestFullScreen = noopVoid;
    }
  } catch(e){}
  try {
    if (typeof HTMLIFrameElement !== 'undefined') {
      blockFullscreenOnElement(HTMLIFrameElement.prototype);
    }
  } catch(e){}

  try {
    Object.defineProperty(document, 'fullscreenEnabled', { get: function() { return false; }, configurable: true });
  } catch(e){}
  try {
    Object.defineProperty(document, 'webkitFullscreenEnabled', { get: function() { return false; }, configurable: true });
  } catch(e){}

  var exitFS = function() {
    try { if (document.exitFullscreen) document.exitFullscreen(); } catch(e) {}
    try { if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch(e) {}
    try { if (document.webkitCancelFullScreen) document.webkitCancelFullScreen(); } catch(e) {}
    try { if (document.msExitFullscreen) document.msExitFullscreen(); } catch(e) {}
  };
  document.addEventListener('fullscreenchange', exitFS, true);
  document.addEventListener('webkitfullscreenchange', exitFS, true);
  document.addEventListener('mozfullscreenchange', exitFS, true);
  document.addEventListener('MSFullscreenChange', exitFS, true);

  setInterval(function() {
    if (document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
      exitFS();
    }
    var videos = document.querySelectorAll('video');
    videos.forEach(function(v) {
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.setAttribute('x-webkit-airplay', 'deny');
      v.webkitEnterFullscreen = noopVoid;
      v.webkitEnterFullScreen = noopVoid;
      v.requestFullscreen = noopReject;
      v.webkitRequestFullscreen = noopVoid;
    });
  }, 200);

  var observer = new MutationObserver(function(mutations) {
    var iframes = document.querySelectorAll('iframe');
    iframes.forEach(function(iframe) {
      blockFullscreenOnElement(iframe);
      iframe.setAttribute('sandbox', iframe.getAttribute('sandbox') || 'allow-scripts allow-same-origin');
      try {
        var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc) {
          var vids = iframeDoc.querySelectorAll('video');
          vids.forEach(function(v) {
            v.setAttribute('playsinline', '');
            v.setAttribute('webkit-playsinline', '');
            v.webkitEnterFullscreen = noopVoid;
            v.webkitEnterFullScreen = noopVoid;
            v.requestFullscreen = noopReject;
          });
        }
      } catch(e) {}
    });
    var videos = document.querySelectorAll('video');
    videos.forEach(function(v) {
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.webkitEnterFullscreen = noopVoid;
      v.webkitEnterFullScreen = noopVoid;
      v.requestFullscreen = noopReject;
    });
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
`;

export const INJECTED_JS_BEFORE_LOAD = `
(function(){
  var noopReject = function() { return Promise.reject(new Error('disabled')); };
  var noopVoid = function() {};

  function blockFS(proto) {
    try { proto.requestFullscreen = noopReject; } catch(e){}
    try { proto.webkitRequestFullscreen = noopVoid; } catch(e){}
    try { proto.webkitRequestFullScreen = noopVoid; } catch(e){}
    try { proto.msRequestFullscreen = noopVoid; } catch(e){}
    try { proto.mozRequestFullScreen = noopVoid; } catch(e){}
    try { proto.webkitEnterFullscreen = noopVoid; } catch(e){}
    try { proto.webkitEnterFullScreen = noopVoid; } catch(e){}
  }
  try { blockFS(Element.prototype); } catch(e){}
  try { blockFS(HTMLElement.prototype); } catch(e){}
  try { if (typeof HTMLVideoElement !== 'undefined') blockFS(HTMLVideoElement.prototype); } catch(e){}
  try { if (typeof HTMLIFrameElement !== 'undefined') blockFS(HTMLIFrameElement.prototype); } catch(e){}

  try {
    Object.defineProperty(document, 'fullscreenEnabled', { get: function() { return false; }, configurable: true });
  } catch(e){}
  try {
    Object.defineProperty(document, 'webkitFullscreenEnabled', { get: function() { return false; }, configurable: true });
  } catch(e){}

  var blockMulti = function(e) {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }
  };
  document.addEventListener('touchstart', blockMulti, {passive:false, capture:true});
  document.addEventListener('touchmove', blockMulti, {passive:false, capture:true});

  ['gesturestart','gesturechange','gestureend'].forEach(function(evt) {
    document.addEventListener(evt, function(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }, {passive:false, capture:true});
  });
})();
true;
`;
