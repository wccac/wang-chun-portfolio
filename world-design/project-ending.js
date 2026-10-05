/* A local end-of-story attraction, without changing the document's scroll model. */
(() => {
  'use strict';
  const ending = document.querySelector('.project-ending');
  if (!ending) return;
  const sectionScrollOwnsInput = ending.dataset.project === 'bitter' && Boolean(document.querySelector('#bitter-artworks'));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, scrollFrame = 0, snap = null, armed = true, suspended = false;
  let intentAt = -Infinity, direction = 0, touchY = null, touching = false;
  let returnPending = false;
  let lastScrollY = scrollY, lastScrollTime = performance.now(), scrollVelocity = 0;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const hasDialog = () => Boolean(document.querySelector('dialog[open]'));
  const topOf = element => {
    let top = 0;
    while (element) { top += element.offsetTop || 0; element = element.offsetParent; }
    return top;
  };
  const targetTop = () => Math.min(topOf(ending), document.documentElement.scrollHeight - innerHeight);

  function stopSnap() {
    cancelAnimationFrame(frame);
    frame = 0; snap = null;
    ending.classList.remove('is-snapping');
    ending.dataset.snapState = 'idle';
  }
  function resetIntent() { direction = 0; intentAt = -Infinity; }
  function updateVisual() {
    const rect = ending.getBoundingClientRect();
    const near = rect.top < innerHeight * .84 && rect.bottom > 0;
    const settled = rect.top <= innerHeight * .18 && rect.bottom > innerHeight * .4;
    ending.classList.toggle('is-near', near);
    ending.classList.toggle('is-settled', settled);
    if (rect.top < innerHeight * .6) ending.classList.add('is-revealed');
    ending.style.setProperty('--ending-progress', clamp((innerHeight - rect.top) / innerHeight, 0, 1).toFixed(3));
    // Re-arm only after actually leaving the magnetic boundary. Trackpad
    // inertia therefore cannot repeatedly pull the reader back into the ending.
    if (rect.top > innerHeight * .78) armed = true;
  }
  function maySnap() {
    const top = ending.getBoundingClientRect().top;
    return !sectionScrollOwnsInput && document.body.dataset.bitterSectionScroll !== 'active' && !snap && !suspended && !touching && armed && !reduced.matches &&
      !hasDialog() && direction > 0 && performance.now() - intentAt < 550 &&
      top > 5 && top < innerHeight * .52;
  }
  function startSnap() {
    if (!maySnap()) return false;
    armed = false;
    snap = { position: scrollY, to: targetTop(), velocity: clamp(scrollVelocity, -1800, 1800), last: performance.now(), written: scrollY };
    ending.classList.add('is-snapping');
    ending.dataset.snapState = 'attracting';
    const move = time => {
      if (!snap || suspended || reduced.matches || hasDialog()) { stopSnap(); return; }
      if (Math.abs(scrollY - snap.written) > 3) { stopSnap(); return; }
      let remaining = Math.min(.04, (time - snap.last) / 1000);
      snap.last = time;
      while (remaining > 0) {
        const dt = Math.min(remaining, .008);
        snap.velocity += (324 * (snap.to - snap.position) - 36 * snap.velocity) * dt;
        snap.position = clamp(snap.position + snap.velocity * dt, 0, document.documentElement.scrollHeight - innerHeight);
        remaining -= dt;
      }
      const done = Math.abs(snap.to - snap.position) < .4 && Math.abs(snap.velocity) < 4;
      window.scrollTo({ top: done ? snap.to : snap.position, behavior: 'instant' });
      snap.written = scrollY;
      updateVisual();
      if (!done) frame = requestAnimationFrame(move);
      else { stopSnap(); resetIntent(); ending.dataset.snapState = 'settled'; }
    };
    frame = requestAnimationFrame(move);
    return true;
  }
  function onScroll() {
    const now = performance.now(), elapsed = now - lastScrollTime;
    if (!snap && elapsed > 0 && elapsed < 120) scrollVelocity = (scrollY - lastScrollY) * 1000 / elapsed;
    else if (!snap) scrollVelocity = 0;
    lastScrollY = scrollY; lastScrollTime = now;
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      updateVisual();
      if (!snap) startSnap();
    });
  }
  function recordIntent(delta) {
    if (suspended || hasDialog() || !delta) return;
    direction = Math.sign(delta); intentAt = performance.now();
    if (direction < 0) { armed = false; resetIntent(); }
  }
  function wheel(event) {
    if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey ||
        Math.abs(event.deltaY) <= Math.abs(event.deltaX) || hasDialog() || suspended || reduced.matches) return;
    if (event.target.closest('input,textarea,select,[contenteditable="true"],[data-native-scroll]')) return;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    recordIntent(delta);
    if (snap) {
      // Every new packet remains meaningful. Reversal changes the destination
      // immediately while the spring carries the current visible velocity.
      snap.to = clamp(delta < 0 ? scrollY + delta : snap.to + delta, 0, document.documentElement.scrollHeight - innerHeight);
      event.preventDefault();
    }
  }
  function keydown(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || hasDialog()) return;
    if (event.target.closest('input,textarea,select,[contenteditable="true"],button,a')) return;
    // Keyboard movement remains native and never competes with a wheel spring.
    if (['ArrowUp', 'PageUp', 'Home', 'ArrowDown', 'PageDown', 'End', ' '].includes(event.key)) { stopSnap(); resetIntent(); }
  }
  function touchStart(event) {
    if (event.touches.length !== 1) { touching = false; touchY = null; resetIntent(); stopSnap(); return; }
    stopSnap(); touching = true; touchY = event.touches[0].clientY;
  }
  function touchMove(event) {
    if (touchY === null || event.touches.length !== 1) return;
    const next = event.touches[0].clientY;
    recordIntent(touchY - next); touchY = next;
  }
  function touchEnd() { touching = false; touchY = null; resetIntent(); }
  function motionChange() {
    stopSnap(); resetIntent();
    ending.classList.toggle('has-ending-motion', !reduced.matches);
    updateVisual();
  }
  function suspend() {
    suspended = true; stopSnap(); resetIntent();
    cancelAnimationFrame(scrollFrame); scrollFrame = 0;
  }
  function resume() { suspended = false; returnPending = false; resetIntent(); updateVisual(); }

  const dialogs = new MutationObserver(() => {
    stopSnap(); resetIntent(); touching = false; touchY = null;
  });
  dialogs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  addEventListener('scroll', onScroll, { passive: true });
  if (!sectionScrollOwnsInput) {
    addEventListener('wheel', wheel, { passive: false });
    addEventListener('keydown', keydown);
    addEventListener('touchstart', touchStart, { passive: true });
    addEventListener('touchmove', touchMove, { passive: true });
    addEventListener('touchend', touchEnd, { passive: true });
    addEventListener('touchcancel', () => { touching = false; touchY = null; resetIntent(); stopSnap(); }, { passive: true });
  }
  addEventListener('resize', () => { stopSnap(); resetIntent(); updateVisual(); });
  addEventListener('pagehide', suspend);
  addEventListener('pageshow', resume);
  addEventListener('portfolio:world-suspend', suspend);
  addEventListener('portfolio:world-ready', resume);
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else resume(); });
  document.addEventListener('focusin', () => { stopSnap(); resetIntent(); updateVisual(); });
  reduced.addEventListener('change', motionChange);
  ending.querySelector('[data-ending-reread]')?.addEventListener('click', event => {
    const button = event.currentTarget;
    const target = document.querySelector(button.dataset.rereadTarget);
    if (!target) return;
    event.preventDefault(); stopSnap(); resetIntent(); armed = false;
    scrollTo({ top: Math.max(0, topOf(target) - 80), behavior: reduced.matches ? 'instant' : 'smooth' });
  });
  ending.querySelector('[data-project-return]')?.addEventListener('click', event => {
    // The parent bridge owns embedded navigation. Standalone pages use their
    // real href, so a deep link never depends on unrelated browser history.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (returnPending) { event.preventDefault(); return; }
    returnPending = true; stopSnap(); resetIntent();
  });
  // The first visible colour is the paper the reader is leaving. The artwork
  // and frost are revealed within that same colour plane as the ending enters.
  let surface = ending.previousElementSibling;
  while (surface) {
    const color = getComputedStyle(surface).backgroundColor;
    if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') { ending.style.setProperty('--ending-join-color', color); break; }
    surface = surface.parentElement;
  }
  motionChange();
})();
