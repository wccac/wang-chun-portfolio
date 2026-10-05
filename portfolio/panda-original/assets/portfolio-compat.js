/* The cottage owns sound. The original silent film only runs while on screen. */
(() => {
  'use strict';
  let chapterNavigation = 0, navigationFrame = 0;
  const cancelChapterNavigation = () => { chapterNavigation++; cancelAnimationFrame(navigationFrame); navigationFrame = 0; };
  window.__pandaNavigateChapter = (target, { keyboard = false } = {}) => {
    if (!target) return;
    cancelChapterNavigation();
    const navigation = chapterNavigation;
    const focusTarget = target.querySelector('h1,h2') || target;
    const complete = () => {
      if (!keyboard || navigation !== chapterNavigation || !focusTarget.isConnected) return;
      if (!focusTarget.hasAttribute('tabindex')) focusTarget.tabIndex = -1;
      focusTarget.focus({ preventScroll: true });
    };
    let top = 0;
    for (let node = target; node; node = node.offsetParent) top += node.offsetTop;
    if (window.__pandaScrollTo) window.__pandaScrollTo(top, { onComplete: complete });
    else {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top, behavior: reduced ? 'instant' : 'smooth' });
      if (reduced) complete();
      else {
        const started = performance.now();
        const check = () => {
          if (navigation !== chapterNavigation) return;
          const limit = Math.max(0, document.documentElement.scrollHeight - innerHeight);
          if (Math.abs(scrollY - Math.min(top, limit)) < 2) { navigationFrame = 0; complete(); }
          else if (performance.now() - started < 1800) navigationFrame = requestAnimationFrame(check);
          else navigationFrame = 0;
        };
        navigationFrame = requestAnimationFrame(check);
      }
    }
  };
  document.addEventListener('wheel', cancelChapterNavigation, { passive: true });
  document.addEventListener('pointerdown', cancelChapterNavigation, { passive: true });
  document.addEventListener('keydown', event => { if (['Tab','ArrowUp','ArrowDown','PageUp','PageDown','Home','End','Escape'].includes(event.key)) cancelChapterNavigation(); });
  window.addEventListener('portfolio:world-suspend', cancelChapterNavigation);
  // Same-document chapter links stay inside the artwork. The parent bridge
  // otherwise treats this document's URL plus a fragment as a world navigation.
  document.addEventListener('click',event=>{
    if((!document.documentElement.classList.contains('portfolio-embedded')&&!document.body.classList.contains('panda-film-page'))||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=event.target.closest('a[href^="#"]');
    if(!link)return;
    let id;
    try { id=decodeURIComponent(link.getAttribute('href').slice(1)); } catch (_) { return; }
    const target=document.getElementById(id);
    if(!target)return;
    event.preventDefault();event.stopPropagation();
    window.__pandaNavigateChapter(target, { keyboard: event.detail === 0 });
  },true);
  const video=document.querySelector('#garden-video');
  if(!video)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let visible=false;
  video.muted=true;video.defaultMuted=true;
  video.removeAttribute('autoplay');
  const sync=()=>{
    const active=document.documentElement.dataset.portfolioActive!=='false';
    if(visible&&active&&!document.hidden&&!reduced.matches){
      if(video.preload==='none')video.preload='metadata';
      video.play().catch(()=>{});
    }else video.pause();
  };
  const observer=new IntersectionObserver(entries=>{visible=entries[0].intersectionRatio>.12;sync();},{threshold:[0,.12,.5]});
  observer.observe(video);
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['data-portfolio-active']});
  document.addEventListener('visibilitychange',sync);
  reduced.addEventListener('change',sync);
  video.addEventListener('volumechange',()=>{if(!video.muted)video.muted=true;});
  window.addEventListener('pagehide',()=>video.pause());
})();
