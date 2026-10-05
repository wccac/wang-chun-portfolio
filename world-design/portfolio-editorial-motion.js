/*
 * GSAP exhibition entrances for the existing Tangui and Bitter Melon pages.
 * This module observes scroll only. It never owns wheel input, scrolling,
 * pinning, section sizes, hero cinematics, image transforms or glass surfaces.
 */
(() => {
  'use strict';
  if (window.PortfolioEditorialMotion) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 800px)');
  const gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
  const roots = [...document.querySelectorAll('.tg-continuation, .bm-story, .bm-reader-section')];
  const records = [], wrappers = [], removers = [];
  const stats = {
    status: 'waiting', version: gsap?.version || null, works: 0,
    revealed: 0, active: 0, suspended: false, reducedMotion: reduced.matches,
    refreshes: 0, wrapperCount: 0, text: null
  };
  let initialized = false, disposed = false, suspended = false;
  let bridgeReady = !window.frameElement, fontsReady = false;
  let refreshFrame = 0, text = null, dialogOpen = false;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const on = (node, type, handler, options) => {
    node.addEventListener(type, handler, options);
    removers.push(() => node.removeEventListener(type, handler, options));
  };
  const topOf = element => {
    let top = 0;
    for (let node = element; node; node = node.offsetParent) top += node.offsetTop || 0;
    return top;
  };
  const blocked = () => suspended || disposed || document.hidden || dialogOpen || reduced.matches;
  const owns = node => roots.some(root => root === node || root.contains(node));
  const forbidden = node => node.closest('dialog,[role="dialog"],.project-ending,.sheet,.world,.poster-type');

  function updateStats() {
    stats.works = records.length;
    stats.revealed = records.filter(record => record.done).length;
    stats.active = records.filter(record => record.timeline?.isActive()).length;
    stats.suspended = suspended;
    stats.reducedMotion = reduced.matches;
    stats.wrapperCount = wrappers.length;
    stats.text = text?.stats || null;
  }

  function restoreStyle(record) {
    for (const [property, value, priority] of record.styles) {
      if (value) record.node.style.setProperty(property, value, priority);
      else record.node.style.removeProperty(property);
    }
    if (record.node._gsap) record.node._gsap.uncache = 1;
  }

  function finish(record) {
    record.timeline?.pause();
    record.done = true;
    record.node.dataset.editorialArtState = 'revealed';
    restoreStyle(record);
    record.trigger?.disable(false, false);
    updateStats();
  }

  function play(record) {
    if (record.done || blocked() || record.started) return;
    record.started = true;
    record.node.dataset.editorialArtState = 'arriving';
    record.timeline.play(0);
    updateStats();
  }

  function carrierFor(button) {
    // Only zero-margin block buttons are wrapped. Their complete box remains
    // the grid item; none of the image/button descendant selectors change.
    const wrapper = document.createElement('div');
    wrapper.className = 'portfolio-motion-carrier';
    button.before(wrapper);
    wrapper.append(button);
    wrappers.push(wrapper);
    return wrapper;
  }

  function collect() {
    const candidates = new Map();
    function add(node, kind, index = 0) {
      if (!node || !owns(node) || forbidden(node) || candidates.has(node)) return;
      candidates.set(node, { node, kind, index });
    }
    document.querySelectorAll('.tg-time-grid,.tg-object-grid,.tg-open-grid,.tg-paired-grid,.tg-detail-pair').forEach(group => {
      [...group.children].filter(node => node.tagName === 'ARTICLE').forEach((node, index) => add(node, 'series', index));
    });
    document.querySelectorAll('.tg-archive-picture').forEach(node => add(node, 'archive'));
    document.querySelectorAll('.tg-family-art,.tg-poster-grid > .tg-art-trigger,.tg-detail-archive > .tg-art-trigger').forEach(button => {
      if (!owns(button) || forbidden(button)) return;
      const poster = button.parentElement.matches('.tg-poster-grid');
      const index = poster ? [...button.parentElement.children].indexOf(button) : 0;
      add(carrierFor(button), poster ? 'campaign' : 'artwork', index);
    });
    document.querySelectorAll('.bm-story .bm-figure,.bm-story .bm-reader-stage,.bm-reader-section .bm-reader-stage').forEach(node => add(node, 'book'));
    return [...candidates.values()].sort((a, b) => topOf(a.node) - topOf(b.node));
  }

  function createRecord(candidate, index) {
    const { node, kind } = candidate;
    const record = {
      ...candidate, done: false, started: false, trigger: null, timeline: null,
      styles: ['transform','transform-origin','opacity','will-change'].map(property =>
        [property, node.style.getPropertyValue(property), node.style.getPropertyPriority(property)])
    };
    records.push(record);
    node.dataset.editorialArt = kind;
    node.dataset.editorialArtState = 'waiting';
    const compact = small.matches;
    const campaign = kind === 'campaign';
    const delay = compact ? 0 : Math.min(candidate.index, 2) * (campaign ? .14 : .09);
    record.timeline = gsap.timeline({
      paused: true,
      defaults: { duration: compact ? .8 : campaign ? 1.12 : .94, ease: 'power3.out', overwrite: 'auto' },
      onComplete: () => finish(record)
    }).to(node, { y: 0, rotationX: 0, rotationY: 0, scale: 1, opacity: 1 }, delay);

    // Restored reading positions and initially visible art must never disappear.
    // All states above the fold remain ordinary rendered content.
    if (reduced.matches || topOf(node) < scrollY + innerHeight * .98) {
      finish(record);
      return;
    }
    gsap.set(node, {
      y: compact ? 36 : campaign ? 64 : 52,
      rotationX: compact ? 4 : campaign ? 8 : 6,
      rotationY: campaign && !compact ? (candidate.index % 2 ? -6 : 6) : 0,
      scale: campaign ? .94 : .965,
      opacity: .08,
      transformPerspective: 1200,
      transformOrigin: '50% 80%'
    });
    record.trigger = ScrollTrigger.create({
      id: `portfolio-editorial-art-${index}`,
      trigger: node,
      // Stable layout offsets, not transformed screen rectangles, define entry.
      start: () => Math.max(0, topOf(node) - innerHeight * .94),
      end: () => topOf(node) + node.offsetHeight,
      onEnter: () => play(record),
      onEnterBack: () => play(record),
      onLeave: () => finish(record)
    });
  }

  function revealAll() {
    records.forEach(finish);
    text?.revealAll();
    updateStats();
  }

  function refresh() {
    if (!initialized || disposed || refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      if (disposed || suspended) return;
      records.forEach(record => { if (!record.done) record.trigger?.refresh(); });
      text?.refresh();
      stats.refreshes++;
      updateStats();
    });
  }

  function suspend() {
    suspended = true;
    cancelAnimationFrame(refreshFrame); refreshFrame = 0;
    records.forEach(record => {
      record.timeline?.pause();
      record.trigger?.disable(false, false);
    });
    text?.suspend();
    if (initialized) stats.status = 'suspended';
    updateStats();
  }

  function resume() {
    if (disposed || document.hidden || dialogOpen || !bridgeReady) return;
    suspended = false;
    if (!initialized) { initialize(); return; }
    if (reduced.matches) { revealAll(); stats.status = 'reduced'; updateStats(); return; }
    records.forEach(record => {
      if (record.done) return;
      record.trigger?.enable(false, true);
      if (topOf(record.node) + record.node.offsetHeight < scrollY) finish(record);
      else if (record.started) record.timeline.resume();
      else if (topOf(record.node) < scrollY + innerHeight * .94) play(record);
    });
    text?.resume();
    stats.status = 'active';
    refresh(); updateStats();
  }

  function destroy() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(refreshFrame);
    records.forEach(record => {
      record.trigger?.kill(); record.timeline?.kill(); restoreStyle(record);
      delete record.node.dataset.editorialArt; delete record.node.dataset.editorialArtState;
    });
    text?.destroy();
    removers.splice(0).forEach(remove => remove());
    dialogObserver?.disconnect();
    resizeObserver?.disconnect();
    wrappers.forEach(wrapper => wrapper.replaceWith(...wrapper.childNodes));
    stats.status = 'destroyed'; stats.active = 0;
    resolveReady(stats);
  }

  function initialize() {
    if (initialized || disposed || suspended || !fontsReady || !bridgeReady) return;
    initialized = true;
    if (!gsap || !ScrollTrigger || !roots.length) {
      stats.status = 'static'; resolveReady(stats); return;
    }
    gsap.registerPlugin(ScrollTrigger);
    try {
      if (reduced.matches) {
        stats.status = 'reduced'; resolveReady(stats); return;
      }
      collect().forEach(createRecord);
      if (window.PortfolioEditorialText?.create) {
        text = window.PortfolioEditorialText.create({ gsap, ScrollTrigger });
      }
      stats.status = 'active';
      roots.forEach(root => resizeObserver?.observe(root));
      refresh(); updateStats(); resolveReady(stats);
    } catch (error) {
      revealAll();
      records.forEach(record => record.trigger?.kill());
      stats.status = 'static'; stats.error = String(error.message || error);
      resolveReady(stats);
    }
  }

  const dialogObserver = typeof MutationObserver === 'function' ? new MutationObserver(() => {
    const next = Boolean(document.querySelector('dialog[open]'));
    if (next === dialogOpen) return;
    dialogOpen = next;
    if (next) suspend(); else resume();
  }) : null;
  dialogObserver?.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(refresh) : null;

  on(window, 'portfolio:world-ready', () => { bridgeReady = true; resume(); });
  on(window, 'portfolio:world-suspend', () => { bridgeReady = false; suspend(); });
  on(window, 'pagehide', suspend);
  on(window, 'pageshow', resume);
  on(document, 'visibilitychange', () => document.hidden ? suspend() : resume());
  on(window, 'resize', refresh, { passive: true });
  on(document, 'load', event => { if (event.target instanceof HTMLImageElement && owns(event.target)) refresh(); }, true);
  on(document, 'focusin', event => {
    records.filter(record => record.node.contains(event.target)).forEach(finish);
  });
  on(document, 'pointerdown', event => {
    records.filter(record => record.node.contains(event.target)).forEach(finish);
  }, { passive: true });
  on(reduced, 'change', () => {
    if (reduced.matches) { revealAll(); stats.status = 'reduced'; }
    else resume();
    updateStats();
  });

  window.PortfolioEditorialMotion = {
    ready, stats, revealAll, refresh, suspend, resume, destroy,
    getState() { updateStats(); return { ...stats, text: text?.stats ? { ...text.stats } : null }; }
  };

  // Dynamic loading after the bridge's ready event is supported for audits.
  if (window.frameElement?.dataset.worldStatus === 'ready') bridgeReady = true;
  const fontPromise = document.fonts?.ready || Promise.resolve();
  Promise.race([fontPromise, new Promise(resolve => setTimeout(resolve, 1500))]).then(() => {
    fontsReady = true;
    requestAnimationFrame(() => requestAnimationFrame(initialize));
  });
})();
