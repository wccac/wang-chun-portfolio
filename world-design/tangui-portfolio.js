/* Complete original assets, with one interruptible source-to-viewer motion. */
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

  const scriptURL = document.currentScript?.src || document.baseURI;
  const catalogURL = new URL('assets/tangui/catalog.json?v=logo-r3-20261005', scriptURL);
  let catalogPromise, sequence = 0;
  const catalog = () => catalogPromise || (catalogPromise = fetch(catalogURL)
    .then(response => { if (!response.ok) throw Error('Catalogue unavailable'); return response.json(); })
    .then(data => new Map([...data.products, ...data.artworks].map(item => [item.id, item])))
    .catch(error => { catalogPromise = null; throw error; }));
  const expand = '<svg class="bm-expand-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="bm-expand-ne" d="M15 3h6v6M21 3l-6 6"/><path class="bm-expand-sw" d="M3 15v6h6M3 21l6-6"/></svg>';
  const collapse = '<svg class="bm-expand-icon bm-collapse-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="bm-collapse-ne" d="M15 3v6h6M15 9l6-6"/><path class="bm-collapse-sw" d="M3 15h6v6M9 15l-6 6"/></svg>';
  document.querySelectorAll('.tg-zoom-mark').forEach(mark => { mark.innerHTML = expand; });
  const dialog = document.createElement('dialog');
  dialog.className = 'tg-lightbox'; dialog.setAttribute('aria-labelledby', 'tg-lightbox-title');
  dialog.innerHTML = '<div class="tg-lightbox-inner"><button class="tg-lightbox-close artwork-collapse" type="button" aria-label="收起作品">'+collapse+'</button><div class="tg-lightbox-stage"><img alt=""></div><section class="tg-lightbox-info"><span class="tg-lightbox-category"></span><h2 id="tg-lightbox-title"></h2><p class="tg-lightbox-description"></p><p class="tg-viewer-status" role="status" aria-live="polite"></p></section></div>';
  document.body.appendChild(dialog);
  const image = dialog.querySelector('img'), title = dialog.querySelector('h2');
  const description = dialog.querySelector('.tg-lightbox-description');
  const category = dialog.querySelector('.tg-lightbox-category'), status = dialog.querySelector('.tg-viewer-status');
  const motion = createArtworkMotion(dialog, () => { ++sequence; dialog.setAttribute('aria-busy','false'); });
  const close = () => { ++sequence; dialog.setAttribute('aria-busy','false'); motion.close(); };
  dialog.querySelector('button').addEventListener('click', close);
  image.addEventListener('error', () => { if (dialog.open) status.textContent = '图片暂时无法显示，请收起后重新打开。'; });
  document.querySelectorAll('[data-tg-art]').forEach(button => button.addEventListener('click', async () => {
    const token = ++sequence, preview = button.querySelector('img');
    image.src = preview.currentSrc || preview.src; image.alt = preview.alt;
    title.textContent = preview.alt || '作品'; description.textContent = '';
    category.textContent = 'TÁN GUǏ / DESIGN ARCHIVE';
    status.textContent = '正在载入作品信息…'; dialog.setAttribute('aria-busy','true');
    motion.open(button, preview);
    try {
      const item = (await catalog()).get(button.dataset.tgArt);
      if (token !== sequence || !dialog.open || dialog.dataset.viewerState === 'closing') return;
      if (!item) throw Error('Artwork unavailable');
      title.textContent = item.name; description.textContent = item.designLogic || item.function || '';
      category.textContent = item.english || 'TÁN GUǏ / DESIGN ARCHIVE';
      const original = new Image(); original.src = new URL(item.src, document.baseURI).href;
      await original.decode();
      if (token !== sequence || !dialog.open || dialog.dataset.viewerState === 'closing') return;
      image.src = original.src; image.alt = item.name; status.textContent = '完整作品 · 收起后回到刚才的位置';
    } catch {
      if (token === sequence && dialog.open && dialog.dataset.viewerState !== 'closing') status.textContent = '已保留预览图，完整作品暂时未能载入。收起后可重新打开。';
    } finally {
      if (token === sequence) dialog.setAttribute('aria-busy','false');
    }
  }));

  // D01's first two detail crops use the same motion and loading lifecycle.
  const detail = document.querySelector('#detail-dialog');
  if (detail) {
    const detailImage = detail.querySelector('.viewer-image'), crop = detail.querySelector('.viewer-crop');
    const detailTitle = detail.querySelector('#detail-title'), detailStatus = detail.querySelector('.viewer-foot');
    let detailRequest = 0;
    detailStatus.setAttribute('role','status'); detailStatus.setAttribute('aria-live','polite');
    const detailMotion = createArtworkMotion(detail, () => { ++detailRequest; detail.setAttribute('aria-busy','false'); });
    detail.querySelector('.viewer-close').addEventListener('click', () => { ++detailRequest; detailMotion.close(); });
    document.querySelectorAll('[data-detail]').forEach(button => button.addEventListener('click', async () => {
      const token = ++detailRequest, source = button.querySelector('.crop'), preview = source.querySelector('img');
      const style = getComputedStyle(source);
      ['--zoom','--tx','--ty'].forEach(name => crop.style.setProperty(name, style.getPropertyValue(name)));
      detailImage.src = preview.currentSrc || preview.src;
      detailImage.alt = button.dataset.detail + '，来自晷墨原版开盒图';
      detailTitle.textContent = button.dataset.detail;
      detailStatus.textContent = '正在载入细节…'; detail.setAttribute('aria-busy','true');
      detailMotion.open(button, source);
      try {
        const original = new Image(); original.src = button.dataset.src; await original.decode();
        if (token !== detailRequest || !detail.open || detail.dataset.viewerState === 'closing') return;
        detailImage.src = original.src; detailStatus.textContent = '收起后，回到刚才的位置。';
      } catch {
        if (token === detailRequest && detail.open && detail.dataset.viewerState !== 'closing') detailStatus.textContent = '已保留当前预览；细节图暂时未能载入，收起后可重试。';
      } finally { if (token === detailRequest) detail.setAttribute('aria-busy','false'); }
    }));
  }
})();
