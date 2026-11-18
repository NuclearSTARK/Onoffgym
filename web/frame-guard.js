// GitHub Pages cannot set frame-ancestors headers. Hide framed pages as a
// browser-side fallback; Cloudflare also enforces X-Frame-Options/CSP headers.
if(window.self!==window.top){
 document.documentElement.style.setProperty('display','none','important');
 document.documentElement.setAttribute('data-frame-blocked','');
 window.stop();
}
