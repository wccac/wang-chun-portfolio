/* One continuous wheel trajectory. Magnetic landing is a spatial mapping, not
   a second animation started after the user stops. Long chapters stay readable. */
(() => {
  'use strict';
  if (!document.querySelector('#bitter-artworks')) return;
  const sections = [...document.querySelectorAll(
    'body > main.world, main > .inside, .bm-story > .bm-section, .bm-reader-section, .project-ending[data-project="bitter"]'
  )];
  if (sections.length < 2) return;
  const body = document.body;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let ranges = [], maximum = 0, dirty = true;
  let frame = 0, lastTime = 0, raw = null, position = scrollY, velocity = 0;
  let target = scrollY, direction = 0, written = null, suspended = false;
  body.dataset.bitterSectionScroll = 'active';
  body.dataset.sectionSnapMode = 'continuous-proximity';
  body.dataset.sectionSnapState = 'idle';

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const topOf = element => {
    let top = 0;
    while (element) { top += element.offsetTop || 0; element = element.offsetParent; }
    return top;
  };
  const blocked = () => suspended || reduced.matches || Boolean(document.querySelector('dialog[open]'));

  function measure() {
    maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    const candidates = [[0, 0], [maximum, maximum]];
    for (const element of sections) {
      const top = topOf(element), height = element.offsetHeight;
      // Every position inside an oversized panel is a valid reading position.
      // Short panels instead have one centre-aligned resting point.
      candidates.push(height > innerHeight
        ? [clamp(top, 0, maximum), clamp(top + height - innerHeight, 0, maximum)]
        : [clamp(top + (height - innerHeight) / 2, 0, maximum), clamp(top + (height - innerHeight) / 2, 0, maximum)]);
    }
    ranges = [];
    candidates.sort((a, b) => a[0] - b[0]).forEach(range => {
      const last = ranges[ranges.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else ranges.push(range);
    });
    dirty = false;
  }

  function magnetic(value) {
    const y = clamp(value, 0, maximum);
    for (let i = 0; i < ranges.length; i++) {
      const [start, end] = ranges[i];
      if (y >= start && y <= end) return y;
      const next = ranges[i + 1];
      if (next && y > end && y < next[0]) {
        const gap = next[0] - end;
        const band = Math.min(48, gap * .12);
        const t = clamp((y - end - band) / (gap - 2 * band), 0, 1);
        return end + gap * t * t * (3 - 2 * t);
      }
    }
    return y;
  }

  function unmap(value) {
    // Rebase external reading positions without jumping on the next wheel.
    // Selecting the middle of a flat landing band lets either direction leave it.
    let lo = 0, hi = maximum;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (magnetic(mid) < value - .05) lo = mid;
      else hi = mid;
    }
    const first = (lo + hi) / 2;
    lo = 0; hi = maximum;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (magnetic(mid) > value + .05) hi = mid;
      else lo = mid;
    }
    return (first + (lo + hi) / 2) / 2;
  }

  function reset() {
    cancelAnimationFrame(frame); frame = 0; lastTime = 0;
    raw = null; velocity = 0; direction = 0; written = null;
    position = target = scrollY;
    body.dataset.sectionSnapState = 'idle';
  }

  function tick(now) {
    frame = 0;
    if (blocked() || (written !== null && Math.abs(scrollY - written) > 2)) { reset(); return; }
    let remaining = Math.min(.04, (now - (lastTime || now - 16.67)) / 1000);
    lastTime = now;
    // Bounded substeps keep the same damping at different refresh rates.
    while (remaining > 0) {
      const dt = Math.min(remaining, .008);
      const error = target - position;
      // A fast fling must not queue several seconds behind a fixed speed cap.
      // Small adjustments keep gentle limits; large input gets catch-up room.
      const lead = Math.max(0, Math.abs(error) - 360);
      const accelerationLimit = 12000 + lead * 180;
      const speedLimit = 1800 + lead * 12;
      const acceleration = clamp(400 * error - 40 * velocity, -accelerationLimit, accelerationLimit);
      velocity = clamp(velocity + acceleration * dt, -speedLimit, speedLimit);
      const step = velocity * dt;
      if (step * error > 0 && Math.abs(step) >= Math.abs(error)) {
        position = target; velocity = 0;
      } else position = clamp(position + step, 0, maximum);
      remaining -= dt;
    }
    if (Math.abs(target - position) < .3 && Math.abs(velocity) < 3) {
      position = target; velocity = 0;
      body.dataset.sectionSnapState = 'settled';
    } else {
      body.dataset.sectionSnapState = 'moving';
      frame = requestAnimationFrame(tick);
    }
    scrollTo({top: position, behavior: 'instant'});
    written = scrollY;
    // Keep raw even when settled. Otherwise slow notches repeatedly lose their
    // accumulated distance in the landing band and cannot leave the section.
  }

  function nativeControl(node, delta) {
    if (!(node instanceof Element)) return false;
    if (node.closest('dialog,input,textarea,select,[contenteditable="true"],[data-native-scroll]')) return true;
    for (let element = node; element && element !== body; element = element.parentElement) {
      if (element.scrollHeight <= element.clientHeight + 1) continue;
      if (!/(auto|scroll)/.test(getComputedStyle(element).overflowY)) continue;
      if (delta < 0 ? element.scrollTop > 0 : element.scrollTop + element.clientHeight < element.scrollHeight - 1) return true;
    }
    return false;
  }

  function wheel(event) {
    if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey ||
        Math.abs(event.deltaY) <= Math.abs(event.deltaX) || blocked() || nativeControl(event.target, event.deltaY)) {
      reset(); return;
    }
    if (dirty) { measure(); raw = null; }
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    const nextDirection = Math.sign(delta);
    if (!nextDirection) return;
    if (raw === null || nextDirection !== direction) {
      raw = unmap(scrollY); position = scrollY;
      // Re-target from the visible position while retaining momentum. The
      // critically damped integrator brakes and reverses without a velocity cut.
    }
    direction = nextDirection;
    raw = clamp(raw + delta, 0, maximum);
    target = magnetic(raw);
    event.preventDefault();
    if (!frame) { lastTime = 0; frame = requestAnimationFrame(tick); }
  }

  addEventListener('wheel', wheel, {passive: false});
  addEventListener('scroll', () => {
    if (written === null || Math.abs(scrollY - written) > 2) reset();
  }, {passive: true});
  // Touch inertia, keyboard, scrollbars, zoom, anchors and restored positions
  // remain browser-controlled; there is no delayed snap after these actions.
  ['touchstart', 'keydown', 'pointerdown', 'hashchange'].forEach(type => addEventListener(type, reset, {passive: true}));
  document.addEventListener('click', reset, true);
  document.addEventListener('focusin', reset);
  addEventListener('resize', () => { dirty = true; reset(); });
  const resizeObserver = new ResizeObserver(() => { dirty = true; });
  [body, ...sections].forEach(element => resizeObserver.observe(element));
  new MutationObserver(() => { if (document.querySelector('dialog[open]')) reset(); })
    .observe(body, {subtree: true, attributes: true, attributeFilter: ['open']});
  addEventListener('portfolio:world-suspend', () => { suspended = true; reset(); });
  addEventListener('portfolio:world-ready', () => { suspended = false; dirty = true; reset(); });
  addEventListener('pagehide', () => { suspended = true; reset(); });
  addEventListener('pageshow', () => { suspended = false; dirty = true; reset(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  reduced.addEventListener('change', reset);
})();
