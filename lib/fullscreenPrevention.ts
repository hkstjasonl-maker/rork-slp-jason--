export const FULLSCREEN_PREVENTION_CSS = `
*:-webkit-full-screen { width: 0 !important; height: 0 !important; display: none !important; }
*:fullscreen { width: 0 !important; height: 0 !important; display: none !important; }
*:-ms-fullscreen { width: 0 !important; height: 0 !important; display: none !important; }
*:-moz-full-screen { width: 0 !important; height: 0 !important; display: none !important; }
iframe:-webkit-full-screen { width: 0 !important; height: 0 !important; display: none !important; }
`;

export const FULLSCREEN_PREVENTION_JS = `
(function(){
  // Block multi-touch (pinch)
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

  // Block iOS gesture events
  ['gesturestart','gesturechange','gestureend'].forEach(function(evt) {
    document.addEventListener(evt, function(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }, {passive:false, capture:true});
  });

  // Override Fullscreen API on all prototypes
  var noopReject = function() { return Promise.reject(new Error('disabled')); };
  var noopVoid = function() {};
  try { Element.prototype.requestFullscreen = noopReject; } catch(e){}
  try { Element.prototype.webkitRequestFullscreen = noopVoid; } catch(e){}
  try { Element.prototype.webkitRequestFullScreen = noopVoid; } catch(e){}
  try { Element.prototype.msRequestFullscreen = noopVoid; } catch(e){}
  try { Element.prototype.mozRequestFullScreen = noopVoid; } catch(e){}
  try { HTMLElement.prototype.requestFullscreen = noopReject; } catch(e){}
  try { HTMLElement.prototype.webkitRequestFullscreen = noopVoid; } catch(e){}
  try { HTMLElement.prototype.webkitRequestFullScreen = noopVoid; } catch(e){}

  // Override document fullscreen properties
  try {
    Object.defineProperty(document, 'fullscreenEnabled', { get: function() { return false; }, configurable: true });
  } catch(e){}
  try {
    Object.defineProperty(document, 'webkitFullscreenEnabled', { get: function() { return false; }, configurable: true });
  } catch(e){}

  // Monitor and immediately exit any fullscreen
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

  // Periodic safety check
  setInterval(function() {
    if (document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
      exitFS();
    }
  }, 150);

  // Also intercept on the iframe elements directly
  var observer = new MutationObserver(function(mutations) {
    var iframes = document.querySelectorAll('iframe');
    iframes.forEach(function(iframe) {
      try { iframe.requestFullscreen = noopReject; } catch(e){}
      try { iframe.webkitRequestFullscreen = noopVoid; } catch(e){}
      try { iframe.webkitRequestFullScreen = noopVoid; } catch(e){}
    });
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
`;

export const INJECTED_JS_BEFORE_LOAD = `
(function(){
  var noopReject = function() { return Promise.reject(new Error('disabled')); };
  var noopVoid = function() {};
  try { Element.prototype.requestFullscreen = noopReject; } catch(e){}
  try { Element.prototype.webkitRequestFullscreen = noopVoid; } catch(e){}
  try { Element.prototype.webkitRequestFullScreen = noopVoid; } catch(e){}
  try { HTMLElement.prototype.requestFullscreen = noopReject; } catch(e){}
  try { HTMLElement.prototype.webkitRequestFullscreen = noopVoid; } catch(e){}
  try { HTMLElement.prototype.webkitRequestFullScreen = noopVoid; } catch(e){}
  try {
    Object.defineProperty(document, 'fullscreenEnabled', { get: function() { return false; }, configurable: true });
  } catch(e){}
  try {
    Object.defineProperty(document, 'webkitFullscreenEnabled', { get: function() { return false; }, configurable: true });
  } catch(e){}
})();
true;
`;
