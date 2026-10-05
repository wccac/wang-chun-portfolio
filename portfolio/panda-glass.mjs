/* No third-party runtime: spring only the optical layer so clicks remain stable. */
const instances = new WeakMap();
const CONTROL = 'button, a.text-link, .panda-film-controls a, .panda-finale-return, .nav .links a, .panda-art-open';
const COLLAPSE = '<svg class="panda-glass-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m20 4-7 7m0-5v5h5M4 20l7-7m-5 0h5v5"/></svg>';
const EXPAND = '<svg class="panda-glass-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m14 10 6-6m-6 0h6v6M10 14l-6 6m0-6v6h6"/></svg>';
const MAGNIFY = '<svg class="panda-glass-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/></svg>';

export function initPandaGlass({ doc = document, view = doc.defaultView } = {}) {
  instances.get(doc)?.();
  const abort = new view.AbortController();
  const { signal } = abort;
  const reduced = view.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = view.matchMedia('(hover: hover) and (pointer: fine)');
  const controls = new Map();
  const artworkMarkers = new Map();
  const filters = new Map();
  let disposed = false, sleeping = doc.hidden, scheduled = false, frame = 0, previousTime = 0;
  const active = new Set();
  const namespace = 'http://www.w3.org/2000/svg';
  const idPrefix = `panda-glass-${Math.random().toString(36).slice(2, 9)}`;
  const refractive = /Chrome|Chromium|Edg\//.test(view.navigator.userAgent) && view.CSS?.supports('backdrop-filter', 'url("#panda-lens")');
  const element = (tag, attributes = {}) => {
    const node = doc.createElementNS(namespace, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  };
  const svg = element('svg', { width: 0, height: 0, 'aria-hidden': true, focusable: false });
  svg.style.cssText = 'position:absolute;overflow:hidden;pointer-events:none';
  const defs = element('defs');
  svg.append(defs);
  if (refractive) doc.body.append(svg);

  function opticalFilter(width, height) {
    const w = Math.round(width), h = Math.round(height);
    if (w < 2 || h < 2 || w > 700 || h > 160) return null;
    const density = Math.min(view.devicePixelRatio || 1, 2), key = `${w}/${h}/${density}`;
    if (filters.has(key)) return filters.get(key);
    const canvas = doc.createElement('canvas');
    canvas.width = Math.ceil(w * density); canvas.height = Math.ceil(h * density);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const pixels = ctx.createImageData(canvas.width, canvas.height), radius = h / 2;
    const rim = Math.min(9, h * .13), depthScale = rim / 2;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const px = (x + .5) / density, py = (y + .5) / density;
      const dx = px - Math.max(radius, Math.min(w - radius, px)), dy = py - radius;
      const distance = Math.hypot(dx, dy), depth = radius - distance;
      const bend = depth > 0 && depth < rim ? -depthScale * (1 - depth / rim) ** 2 : 0;
      const i = (y * canvas.width + x) * 4;
      pixels.data[i] = Math.round(127.5 + (distance ? dx / distance : 0) * bend / 16 * 255);
      pixels.data[i + 1] = Math.round(127.5 + (distance ? dy / distance : 0) * bend / 16 * 255);
      pixels.data[i + 2] = 128; pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const id = `${idPrefix}-${filters.size}`;
    const filter = element('filter', { id, filterUnits: 'userSpaceOnUse', x: 0, y: 0, width: w, height: h, 'color-interpolation-filters': 'sRGB' });
    filter.append(element('feImage', { href: canvas.toDataURL(), result: 'rim-map', preserveAspectRatio: 'none', x: 0, y: 0, width: w, height: h }));
    filter.append(element('feDisplacementMap', { in: 'SourceGraphic', in2: 'rim-map', scale: 16, xChannelSelector: 'R', yChannelSelector: 'G' }));
    defs.append(filter); filters.set(key, id);
    return id;
  }

  function tick(now) {
    const dt = previousTime ? Math.min(.025, (now - previousTime) / 1000) : 1 / 60;
    previousTime = now;
    for (const controller of active) {
      const { state, velocity, target, surface, large, restrained } = controller;
      let moving = false;
      for (const key of ['hover', 'x', 'y', 'press']) {
        const stiffness = key === 'press' ? 400 : 285;
        const damping = 2 * Math.sqrt(stiffness) * (large ? .85 : 1);
        velocity[key] += (stiffness * (target[key] - state[key]) - damping * velocity[key]) * dt;
        state[key] += velocity[key] * dt;
        if (Math.abs(target[key] - state[key]) > .001 || Math.abs(velocity[key]) > .008) moving = true;
        else { state[key] = target[key]; velocity[key] = 0; }
      }
      const h = state.hover, p = state.press, stretch = Math.abs(state.x) * h;
      const sx = 1 + (large ? .024 : restrained ? .016 : .028) * h + (restrained ? .006 : .008) * stretch - (large ? .055 : .025) * p;
      const sy = 1 + (large ? .092 : restrained ? .025 : .028) * h - (restrained ? .006 : .008) * stretch - (large ? .05 : .025) * p;
      surface.style.transform = `translate3d(${state.x * (large ? 2.4 : restrained ? .8 : 1.2)}px,${state.y * (large ? 1.8 : restrained ? .5 : .9) - h * (large ? 1.4 : .35)}px,0) scale(${sx},${sy})`;
      surface.style.setProperty('--panda-light-x', `${30 + state.x * 35}%`);
      surface.style.setProperty('--panda-light-y', `${24 + state.y * 35}%`);
      if (!moving) active.delete(controller);
    }
    frame = active.size ? view.requestAnimationFrame(tick) : 0;
    if (!frame) previousTime = 0;
  }
  function run(controller) {
    if (disposed || reduced.matches || sleeping) return;
    active.add(controller);
    if (!frame) frame = view.requestAnimationFrame(tick);
  }
  function clear(controller) {
    active.delete(controller);
    controller.inside = false;
    for (const key of ['hover', 'x', 'y', 'press']) controller.state[key] = controller.velocity[key] = controller.target[key] = 0;
    controller.control.classList.remove('is-glass-hovered', 'is-glass-pressed');
    controller.surface.style.removeProperty('transform');
    controller.surface.style.removeProperty('--panda-light-x');
    controller.surface.style.removeProperty('--panda-light-y');
  }
  const resize = new view.ResizeObserver(entries => {
    for (const entry of entries) {
      if (artworkMarkers.has(entry.target)) {
        positionMarker(entry.target, artworkMarkers.get(entry.target));
        continue;
      }
      const controller = [...controls.values()].find(item => item.visual === entry.target);
      if (controller) setOptics(controller);
    }
  });
  function setOptics(controller) {
    if (!refractive || disposed) return;
    const { visual, lens } = controller;
    const filter = opticalFilter(visual.clientWidth, visual.clientHeight);
    if (filter) {
      lens.style.setProperty('--panda-lens-filter', `url("#${filter}")`);
      lens.classList.add('is-refractive');
    }
  }
  function attach(control) {
    const marker = control.matches('.panda-art-open[aria-hidden="true"]');
    if ((marker ? control.parentElement.closest('[aria-hidden="true"]:not([data-gallery-copy])') : control.closest('[aria-hidden="true"]')) || control.matches('[data-panda-no-glass]')) return;
    const known = controls.get(control);
    if (known) {
      // Existing carousel code replaces button.textContent after every pause.
      if (!known.surface.isConnected) { known.visual.append(known.surface); setOptics(known); }
      return;
    }
    if (control.matches('.modal .close')) {
      control.dataset.pandaOriginalMarkup = control.innerHTML;
      control.innerHTML = COLLAPSE;
      control.setAttribute('aria-label', '收起作品，返回花园');
    } else if (control.matches('.panda-art-open') && !control.querySelector('svg')) {
      control.innerHTML = EXPAND;
    }
    const legacyIcon = control.matches('.lens-toggle') ? control.querySelector(':scope > i:not(.panda-glass-surface)') : null;
    const originalIconMarkup = legacyIcon?.innerHTML;
    if (legacyIcon) legacyIcon.innerHTML = MAGNIFY;
    const visual = control.matches('.journey-stop') ? control.querySelector('.map-enter') || control : control;
    const host = marker ? control.closest('[data-title]') || control : control;
    control.classList.add('panda-glass-control');
    visual.classList.add('panda-glass-surface-host');
    // Use i rather than span: the legacy magnifier updates its first span label.
    const surface = doc.createElement('i'), lens = doc.createElement('i');
    surface.className = 'panda-glass-surface'; surface.setAttribute('aria-hidden', 'true');
    lens.className = 'panda-glass-lens'; surface.append(lens); visual.append(surface);
    const controller = {
      control, visual, surface, lens, legacyIcon, originalIconMarkup, inside: false,
      large: control.matches('.panda-finale-return'), restrained: control.matches('.lens-toggle, #gallery-pause, #scroll-pause'),
      state: { hover: 0, x: 0, y: 0, press: 0 }, velocity: { hover: 0, x: 0, y: 0, press: 0 }, target: { hover: 0, x: 0, y: 0, press: 0 },
    };
    controls.set(control, controller);
    const point = event => {
      const box = visual.getBoundingClientRect();
      controller.target.x = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width - .5) * 2));
      controller.target.y = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height - .5) * 2));
    };
    host.addEventListener('pointerenter', event => {
      if (control.disabled || !fine.matches || event.pointerType === 'touch' || reduced.matches || sleeping) return;
      controller.inside = true; point(event); controller.target.hover = 1;
      control.classList.add('is-glass-hovered'); run(controller);
    }, { signal });
    host.addEventListener('pointermove', event => {
      if (!controller.inside || control.disabled || reduced.matches) return;
      point(event); run(controller);
    }, { signal });
    host.addEventListener('pointerleave', () => {
      controller.inside = false;
      Object.keys(controller.target).forEach(key => { controller.target[key] = 0; });
      control.classList.remove('is-glass-hovered', 'is-glass-pressed'); run(controller);
    }, { signal });
    host.addEventListener('pointerdown', event => {
      if (control.disabled || event.button !== 0 || reduced.matches || sleeping) return;
      point(event); controller.target.press = 1;
      control.classList.add('is-glass-pressed'); run(controller);
    }, { signal });
    resize.observe(visual); setOptics(controller);
  }
  function positionMarker(artwork, marker) {
    if (!artwork.isConnected || !marker.isConnected) return;
    marker.style.top = `${Math.max(12, artwork.offsetTop + artwork.offsetHeight - 62)}px`;
    marker.style.bottom = 'auto';
  }
  function addArtworkMarkers() {
    doc.querySelectorAll('.work[data-title], .atelier-work[data-title], .myth-card[data-title], .scroll-panel[data-title]').forEach(card => {
      if (card.closest('[aria-hidden="true"]:not([data-gallery-copy])') || card.querySelector('.panda-art-open')) return;
      const artwork = card.querySelector('img');
      if (!artwork) return;
      const marker = doc.createElement('span');
      marker.className = 'panda-art-open'; marker.setAttribute('aria-hidden', 'true'); marker.innerHTML = EXPAND;
      card.append(marker); artworkMarkers.set(artwork, marker); resize.observe(artwork);
      artwork.addEventListener('load', () => positionMarker(artwork, marker), { signal });
      positionMarker(artwork, marker);
    });
  }
  function scan() {
    scheduled = false;
    if (disposed) return;
    addArtworkMarkers();
    doc.querySelectorAll(CONTROL).forEach(attach);
    for (const [control, controller] of controls) {
      if (!control.isConnected) { clear(controller); resize.unobserve(controller.visual); controls.delete(control); }
      else if (control.disabled) clear(controller);
    }
  }
  function scheduleScan() {
    if (scheduled || disposed) return;
    scheduled = true; view.queueMicrotask(scan);
  }
  const mutations = new view.MutationObserver(records => {
    if (records.some(record => record.type === 'childList' && ([...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && !node.closest?.('svg[data-panda-glass-defs]'))))) scheduleScan();
    if (records.some(record => record.type === 'attributes')) {
      const modalOpen = !!doc.querySelector('dialog[open]');
      controls.forEach(controller => {
        if (controller.control.disabled || (modalOpen && !controller.control.closest('dialog'))) clear(controller);
      });
    }
  });
  svg.setAttribute('data-panda-glass-defs', '');
  mutations.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'open'] });
  const release = () => controls.forEach(controller => {
    if (!controller.target.press) return;
    controller.target.press = 0;
    if (!controller.inside) controller.target.x = controller.target.y = controller.target.hover = 0;
    controller.control.classList.remove('is-glass-pressed'); run(controller);
  });
  view.addEventListener('pointerup', release, { signal });
  view.addEventListener('pointercancel', release, { signal });
  const reset = () => {
    controls.forEach(clear); active.clear(); view.cancelAnimationFrame(frame); frame = 0; previousTime = 0;
  };
  const suspend = () => { sleeping = true; reset(); };
  const resume = () => { sleeping = doc.hidden; reset(); controls.forEach(setOptics); };
  doc.addEventListener('visibilitychange', () => doc.hidden ? suspend() : resume(), { signal });
  view.addEventListener('portfolio:world-suspend', suspend, { signal });
  view.addEventListener('portfolio:world-ready', resume, { signal });
  view.addEventListener('pagehide', suspend, { signal });
  view.addEventListener('pageshow', resume, { signal });
  reduced.addEventListener('change', reset, { signal });
  fine.addEventListener('change', reset, { signal });
  scan();
  function dispose() {
    if (disposed) return;
    disposed = true; abort.abort(); mutations.disconnect(); resize.disconnect(); reset();
    controls.forEach(({ control, visual, surface, legacyIcon, originalIconMarkup }) => {
      surface.remove(); control.classList.remove('panda-glass-control'); visual.classList.remove('panda-glass-surface-host');
      if (legacyIcon?.isConnected) legacyIcon.innerHTML = originalIconMarkup;
      if ('pandaOriginalMarkup' in control.dataset) {
        control.innerHTML = control.dataset.pandaOriginalMarkup; delete control.dataset.pandaOriginalMarkup;
        control.setAttribute('aria-label', '关闭作品预览');
      }
    });
    controls.clear(); filters.clear(); svg.remove();
    artworkMarkers.forEach(marker => marker.remove()); artworkMarkers.clear();
    if (instances.get(doc) === dispose) instances.delete(doc);
  }
  instances.set(doc, dispose);
  return { dispose };
}
