(() => {
  'use strict';
  // The two artwork readers share this contract: show immediately at the source,
  // and retarget one spring on close, retaining its live position and velocity.
  function createArtworkMotion(dialog, onClosed) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let origin, source, frame = 0, time = 0, value = 0, speed = 0, target = 1;
    let geometry = {x: 0, y: 0, scale: .94}, previousOverflow = '', suspended = false;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    function paint() {
      const p = clamp(value, 0, 1), inverse = 1 - p;
      dialog.style.transform = `translate3d(${geometry.x * inverse}px,${geometry.y * inverse}px,0) scale(${geometry.scale + (1 - geometry.scale) * p})`;
      dialog.style.opacity = String(.2 + .8 * p);
      dialog.style.setProperty('--viewer-progress', String(p));
    }
    function finishClose() {
      cancelAnimationFrame(frame); frame = 0; time = 0;
      if (dialog.open) dialog.close();
    }
    function tick(now) {
      frame = 0;
      let remaining = Math.min(.04, (now - (time || now - 16.67)) / 1000); time = now;
      while (remaining > 0) {
        const dt = Math.min(.008, remaining);
        speed += (360 * (target - value) - 38 * speed) * dt;
        value += speed * dt; remaining -= dt;
      }
      paint();
      if (Math.abs(target - value) < .001 && Math.abs(speed) < .01) {
        value = target; speed = 0; paint(); time = 0;
        if (!target) finishClose();
        else { dialog.dataset.viewerState = 'open'; dialog.style.removeProperty('will-change'); }
      } else frame = requestAnimationFrame(tick);
    }
    function run() {
      dialog.style.willChange = 'transform, opacity';
      if (!frame) { time = 0; frame = requestAnimationFrame(tick); }
    }
    function close(instant = false) {
      if (!dialog.open) return;
      target = 0; dialog.dataset.viewerState = 'closing';
      if (instant || reduced.matches || suspended) { value = 0; speed = 0; finishClose(); }
      else run();
    }
    function open(trigger, artwork) {
      origin = trigger; source = artwork || trigger;
      target = 1;
      if (dialog.open) { dialog.dataset.viewerState = 'opening'; run(); return; }
      previousOverflow = document.body.style.overflow;
      dialog.style.removeProperty('transform'); dialog.style.opacity = '1';
      dialog.showModal(); document.body.style.overflow = 'hidden';
      const a = source?.getBoundingClientRect(), b = dialog.getBoundingClientRect();
      geometry = a && a.width && a.height ? {
        x: a.left + a.width / 2 - b.left - b.width / 2,
        y: a.top + a.height / 2 - b.top - b.height / 2,
        scale: clamp(Math.min(a.width / b.width, a.height / b.height), .08, 1)
      } : {x: 0, y: 12, scale: .94};
      value = reduced.matches ? 1 : 0; speed = 0;
      dialog.dataset.viewerState = reduced.matches ? 'open' : 'opening'; paint();
      if (!reduced.matches) run();
    }
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
    });
    dialog.addEventListener('close', () => {
      cancelAnimationFrame(frame); frame = 0; time = 0; value = speed = 0;
      document.body.style.overflow = previousOverflow;
      ['transform','opacity','will-change','--viewer-progress'].forEach(name => dialog.style.removeProperty(name));
      dialog.dataset.viewerState = 'closed'; onClosed?.();
      if (!suspended && origin?.isConnected) origin.focus({preventScroll: true});
    });
    reduced.addEventListener('change', () => {
      if (!reduced.matches || !dialog.open) return;
      cancelAnimationFrame(frame); frame = 0; time = 0; value = target; speed = 0;
      if (!target) finishClose(); else { paint(); dialog.dataset.viewerState = 'open'; dialog.style.removeProperty('will-change'); }
    });
    addEventListener('portfolio:world-suspend', () => { suspended = true; close(true); });
    addEventListener('portfolio:world-ready', () => { suspended = false; });
    addEventListener('pagehide', () => { suspended = true; close(true); });
    addEventListener('pageshow', () => { suspended = false; });
    return {open, close};
  }

  const dataElement = document.querySelector('#bitter-artworks');
  if (!dataElement) return;
  const artworks = JSON.parse(dataElement.textContent);
  const byId = new Map(artworks.map(item => [item.id, item]));
  const dialog = document.querySelector('#bitter-artwork-dialog');
  const viewerImage = dialog.querySelector('.bm-viewer-image');
  const viewerTitle = dialog.querySelector('#bitter-artwork-title');
  const viewerCanvas = dialog.querySelector('.bm-viewer-canvas');
  const viewerStatus = dialog.querySelector('.bm-viewer-status');
  const zoom = dialog.querySelector('[data-viewer-zoom]');
  let viewerRequest = 0;
  const viewerMotion = createArtworkMotion(dialog, () => { ++viewerRequest; dialog.setAttribute('aria-busy', 'false'); });

  function resetZoom() {
    viewerCanvas.classList.remove('is-zoomed');
    zoom.textContent = 'ZOOM IN';
    zoom.setAttribute('aria-pressed', 'false');
    viewerCanvas.scrollTo(0, 0);
  }

  async function showArtwork(item, trigger) {
    if (!item) return;
    const request = ++viewerRequest;
    resetZoom();
    viewerTitle.textContent = item.title;
    viewerImage.src = item.preview;
    viewerImage.alt = item.title + ' — complete artwork';
    viewerStatus.textContent = 'COMPLETE ARTWORK / LOADING THE ORIGINAL';
    dialog.setAttribute('aria-busy', 'true');
    const source = trigger.querySelector('img') || trigger.closest('.bm-figure, .bm-reader-stage')?.querySelector('img') || document.querySelector('.spread-stage img');
    viewerMotion.open(trigger, source);
    const original = new Image();
    original.src = item.src;
    try {
      await original.decode();
      if (request !== viewerRequest || !dialog.open || dialog.dataset.viewerState === 'closing') return;
      viewerImage.src = item.src;
      viewerStatus.textContent = 'ORIGINAL IMAGE / ' + item.width + ' × ' + item.height + ' / ESC TO CLOSE';
    } catch {
      if (request === viewerRequest && dialog.open && dialog.dataset.viewerState !== 'closing') viewerStatus.textContent = 'PREVIEW KEPT / ORIGINAL UNAVAILABLE / CLOSE AND REOPEN TO RETRY';
    } finally {
      if (request === viewerRequest) dialog.setAttribute('aria-busy', 'false');
    }
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-bitter-art]');
    if (trigger) showArtwork(byId.get(trigger.dataset.bitterArt), trigger);
  });
  dialog.querySelector('[data-viewer-close]').addEventListener('click', () => { ++viewerRequest; dialog.setAttribute('aria-busy', 'false'); viewerMotion.close(); });
  viewerImage.addEventListener('error', () => { if (dialog.open) viewerStatus.textContent = 'IMAGE UNAVAILABLE / CLOSE AND REOPEN TO RETRY'; });
  zoom.addEventListener('click', () => {
    const isZoomed = viewerCanvas.classList.toggle('is-zoomed');
    zoom.setAttribute('aria-pressed', String(isZoomed));
    zoom.textContent = isZoomed ? 'FIT IMAGE' : 'ZOOM IN';
    viewerCanvas.scrollTo(0, 0);
  });

  const readers = new Map();
  const getState = () => ({readers: Object.fromEntries([...readers].map(([key, reader]) => [key, reader.getArtwork()]))});
  const publish = () => dispatchEvent(new CustomEvent('portfolio:reader-state', {detail: getState()}));
  document.querySelectorAll('[data-bitter-reader]').forEach(reader => {
    const ids = reader.dataset.bitterReader.split(',');
    const items = ids.map(id => byId.get(id));
    const image = reader.querySelector('.bm-reader-image');
    const title = reader.querySelector('[data-reader-title]');
    const note = reader.querySelector('[data-reader-note]');
    const counter = reader.querySelector('[data-reader-counter]');
    const opener = reader.querySelector('[data-bitter-art]');
    const previous = reader.querySelector('[data-reader-previous]');
    const next = reader.querySelector('[data-reader-next]');
    const menu = [...reader.querySelectorAll('[data-reader-index]')];
    let index = 0, requestedIndex = 0, request = 0;
    async function show(indexToShow) {
      const target = Math.max(0, Math.min(items.length - 1, indexToShow));
      if (target === index && !reader.hasAttribute('aria-busy')) return true;
      requestedIndex = target;
      const currentRequest = ++request;
      reader.setAttribute('aria-busy', 'true');
      note.textContent = 'Loading the selected spread…';
      const item = items[target];
      const replacement = new Image();
      replacement.src = item.preview;
      try {
        await replacement.decode();
        if (currentRequest !== request) return false;
        index = target;
        image.src = item.preview;
        image.alt = item.title + ' — complete ' + (item.kind === 'mockup' ? 'mockup' : 'layout');
        title.textContent = item.title;
        note.textContent = item.caption;
        counter.textContent = String(index + 1).padStart(2,'0') + ' / ' + String(items.length).padStart(2,'0');
        opener.dataset.bitterArt = item.id;
        opener.setAttribute('aria-label', 'Open ' + item.title + ' at full resolution');
        previous.disabled = index === 0;
        next.disabled = index === items.length - 1;
        menu.forEach((button, i) => button.setAttribute('aria-current', String(i === index)));
        publish();
        return true;
      } catch {
        if (currentRequest === request) { requestedIndex = index; note.textContent = 'This image could not be loaded. Choose another spread to continue.'; }
        return false;
      } finally {
        if (currentRequest === request) reader.removeAttribute('aria-busy');
      }
    }
    readers.set(reader.dataset.bitterReader, {getArtwork: () => items[index].id, restore: id => { const nextIndex = ids.indexOf(id); return nextIndex < 0 ? Promise.resolve(false) : show(nextIndex); }});
    previous.addEventListener('click', () => show(requestedIndex - 1));
    next.addEventListener('click', () => show(requestedIndex + 1));
    menu.forEach(button => button.addEventListener('click', () => show(Number(button.dataset.readerIndex))));
    reader.addEventListener('keydown', event => {
      if (dialog.open || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        show(requestedIndex + (event.key === 'ArrowRight' ? 1 : -1));
      }
    });
  });
  async function restoreState(state) {
    if (!state || typeof state.readers !== 'object' || !state.readers) return getState();
    await Promise.all([...readers].map(([key, reader]) => typeof state.readers[key] === 'string' ? reader.restore(state.readers[key]) : Promise.resolve()));
    publish(); return getState();
  }
  window.PortfolioBookReader = {getState, restoreState};
  addEventListener('portfolio:reader-restore', event => { restoreState(event.detail); });
  publish();
})();
