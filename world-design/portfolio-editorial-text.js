/*
 * Editorial typography motion, adapted for this native-DOM portfolio from
 * React Bits SplitText / BlurText by David Haz (copyright 2026).
 * Source and MIT + Commons Clause notice are retained in
 * work/portfolio/skill-reference/react-bits/{README.md,LICENSE.react-bits.md}.
 * https://github.com/DavidHDev/react-bits/tree/main/src/content/TextAnimations
 *
 * The adaptation keeps authored type, line breaks and semantic children. It
 * uses the caller's GSAP instance; no React runtime or extra scroll driver.
 */
(() => {
  'use strict';

  const SELECTOR = '.tg-continuation h2, .bm-story h2, .bm-reader-section h2';
  const EXCLUDE = 'dialog, [role="dialog"], .project-ending, main.world, main.sheet, .poster-type, .world-sheet';
  const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
  const MEASURE_TOLERANCE = 0.75;

  function create({ gsap, ScrollTrigger } = {}) {
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const headings = Array.from(document.querySelectorAll(SELECTOR)).filter(el =>
      !el.closest(EXCLUDE) && el.textContent.trim() && !el.querySelector('a, button, input, [contenteditable]')
    );
    const stats = {
      headings: headings.length, segments: 0, revealed: 0, active: 0,
      suspended: false, reducedMotion: reducedQuery.matches, geometryFallbacks: 0
    };
    const noop = () => {};
    const emptyAPI = { revealAll: noop, refresh: noop, suspend: noop, resume: noop, destroy: noop, stats };
    if (!gsap?.fromTo || !ScrollTrigger?.create || reducedQuery.matches) {
      stats.revealed = headings.length;
      return emptyAPI;
    }

    const records = [];
    let destroyed = false;
    let suspended = false;

    function splitWords(heading) {
      // Replace text nodes only: <br>, emphasis, styled spans and their identity
      // remain where the author put them. Whitespace stays as native text.
      const before = heading.getBoundingClientRect();
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue.trim() && !node.parentElement.closest('[aria-hidden="true"], script, style')) nodes.push(node);
      }
      const replacements = [];
      const targets = [];
      nodes.forEach(original => {
        const start = document.createComment('editorial words');
        const end = document.createComment('/editorial words');
        const fragment = document.createDocumentFragment();
        fragment.append(start);
        original.nodeValue.split(/(\s+)/).filter(Boolean).forEach(part => {
          if (/^\s+$/.test(part)) {
            fragment.append(document.createTextNode(part));
            return;
          }
          const span = document.createElement('span');
          span.className = 'portfolio-editorial-word';
          span.style.display = 'inline-block';
          span.textContent = part;
          fragment.append(span);
          targets.push(span);
        });
        fragment.append(end);
        original.replaceWith(fragment);
        replacements.push({ original, start, end });
      });
      const restore = () => {
        replacements.forEach(({ original, start, end }) => {
          if (!start.parentNode || start.parentNode !== end.parentNode) return;
          let next = start.nextSibling;
          while (next && next !== end) {
            const following = next.nextSibling;
            next.remove();
            next = following;
          }
          start.replaceWith(original);
          end.remove();
        });
      };
      const after = heading.getBoundingClientRect();
      if (!targets.length || Math.abs(after.height - before.height) > MEASURE_TOLERANCE ||
          Math.abs(after.width - before.width) > MEASURE_TOLERANCE) {
        restore();
        stats.geometryFallbacks++;
        return { targets: [heading], restore: noop, split: false };
      }
      return { targets, restore, split: true };
    }

    function restoreStyles(record) {
      record.targets.forEach((target, index) => {
        const style = record.styles[index];
        if (style === null) target.removeAttribute('style');
        else target.setAttribute('style', style);
      });
    }

    function finish(record) {
      if (record.done) return;
      record.tween?.kill();
      record.trigger?.kill();
      if (record.running) stats.active = Math.max(0, stats.active - 1);
      record.running = false;
      record.done = true;
      restoreStyles(record);
      stats.revealed++;
    }

    function reveal(record, immediately = false) {
      if (destroyed || record.done) return;
      if (immediately || reducedQuery.matches) {
        finish(record);
        return;
      }
      if (suspended || record.running) return;
      const rect = record.heading.getBoundingClientRect();
      // A direct jump or a fast fling must never leave text waiting to catch up.
      if (rect.bottom <= 0 || Math.abs(record.trigger?.getVelocity?.() || 0) > 2400) {
        finish(record);
        return;
      }
      record.running = true;
      stats.active++;
      record.targets.forEach(target => { target.style.willChange = 'transform, opacity'; });
      record.tween.play();
    }

    headings.forEach(heading => {
      let record;
      try {
        const isCJK = CJK.test(heading.textContent);
        const splitting = isCJK ? { targets: [heading], restore: noop, split: false } : splitWords(heading);
        record = {
          heading, targets: splitting.targets, restore: splitting.restore,
          styles: splitting.targets.map(target => target.getAttribute('style')),
          tween: null, trigger: null, done: false, running: false
        };
        records.push(record);
        stats.segments += record.targets.length;
        const rect = heading.getBoundingClientRect();
        // Content already visible (including restored history/hash positions)
        // stays readable immediately; future sections receive the entrance.
        if (rect.top < window.innerHeight * 0.9) {
          finish(record);
          return;
        }
        const fontSize = parseFloat(getComputedStyle(heading).fontSize) || 56;
        record.tween = gsap.fromTo(record.targets, {
          opacity: 0,
          y: Math.min(isCJK ? 25 : 38, fontSize * (isCJK ? 0.32 : 0.48)),
          rotationX: isCJK ? 3 : 8,
          transformPerspective: 800,
          transformOrigin: '50% 85%'
        }, {
          opacity: 1, y: 0, rotationX: 0,
          duration: isCJK ? 0.86 : 0.78,
          stagger: splitting.split ? 0.055 : 0,
          ease: 'power3.out', paused: true,
          onComplete: () => finish(record)
        });
        record.trigger = ScrollTrigger.create({
          trigger: heading, start: 'top 88%', end: 'bottom top',
          onEnter: () => reveal(record),
          onEnterBack: () => reveal(record),
          onLeave: () => finish(record),
          onLeaveBack: () => { if (record.running) finish(record); }
        });
      } catch (_) {
        // Enhancement failure restores the original text instead of leaving an
        // invisible title. Other headings and the page remain independent.
        if (record) finish(record);
      }
    });

    function revealAll() {
      records.forEach(finish);
      // Killing a later ScrollTrigger can touch earlier trigger measurements;
      // restore once more after every owned trigger has finished its cleanup.
      records.forEach(restoreStyles);
    }

    function revealNear(target) {
      if (!(target instanceof Element)) return;
      const section = target.closest('.tg-section, .bm-section, .bm-reader-section, .bm-story') || target;
      records.forEach(record => {
        if (section.contains(record.heading) || record.heading.contains(target)) finish(record);
      });
    }

    function onFocus(event) { revealNear(event.target); }

    function hashTarget(hash) {
      try { return hash?.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null; }
      catch (_) { return null; }
    }

    function onHash() { revealNear(hashTarget(location.hash)); }

    function onClick(event) {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link) return;
      try {
        const url = new URL(link.href, location.href);
        if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) {
          revealNear(hashTarget(url.hash));
        }
      } catch (_) { /* An unrelated malformed link does not affect the page. */ }
    }

    function onReducedMotion() {
      stats.reducedMotion = reducedQuery.matches;
      if (reducedQuery.matches) revealAll();
    }

    function refresh() {
      if (destroyed) return;
      records.forEach(record => { if (!record.done) record.trigger?.refresh(); });
      onHash();
    }

    function suspend() {
      if (destroyed || suspended) return;
      suspended = true;
      stats.suspended = true;
      records.forEach(record => {
        if (record.done) return;
        record.tween?.pause();
        record.trigger?.disable(false);
      });
    }

    function resume() {
      if (destroyed || !suspended) return;
      suspended = false;
      stats.suspended = false;
      records.forEach(record => {
        if (record.done) return;
        record.trigger?.enable(false, false);
        if (record.running) record.tween?.resume();
        else {
          const rect = record.heading.getBoundingClientRect();
          if (rect.top < window.innerHeight * 0.88 && rect.bottom > 0) reveal(record);
        }
      });
      if (reducedQuery.matches) revealAll();
    }

    function destroy() {
      if (destroyed) return;
      revealAll();
      destroyed = true;
      records.forEach(record => {
        record.restore();
        restoreStyles(record);
      });
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('click', onClick);
      window.removeEventListener('hashchange', onHash);
      reducedQuery.removeEventListener?.('change', onReducedMotion);
      stats.suspended = false;
    }

    document.addEventListener('focusin', onFocus);
    document.addEventListener('click', onClick);
    window.addEventListener('hashchange', onHash);
    reducedQuery.addEventListener?.('change', onReducedMotion);
    onHash();
    return { revealAll, refresh, suspend, resume, destroy, stats };
  }

  window.PortfolioEditorialText = { create };
})();
