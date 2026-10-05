/* Desktop artwork browsing. The hero film, route illustration and gold cursor remain independent. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rail = $('#silk-rail');
  const modal = $('#modal'), modalImage = $('#modal-img'), modalTitle = $('#modal-title');
  const modalInner = modal?.querySelector('.modal-inner');
  const modalClose = modal?.querySelector('.close');
  const modalReady = !!(modal && modalImage && modalTitle && modalInner);
  const cursor = $('.cursor');
  const artTriggers = [...document.querySelectorAll('[data-title]')].filter(element =>
    !element.closest('#modal,[aria-hidden="true"]') && element.querySelector('img'));
  const works = artTriggers.map(element => ({
    element, image: element.querySelector('img'), title: element.dataset.title || '',
    type: element.dataset.type || '', description: element.dataset.desc || ''
  }));
  const workIndex = new WeakMap();
  const modalIsOpen = () => modalReady && modal.classList.contains('open');
  let activeWork = -1, returnFocus = null, bodySnapshot = null, inertSnapshot = [];
  let ignoreRailClickUntil = 0;

  const prepareTrigger = (element, index, copy = false) => {
    workIndex.set(element, index);
    if (!element.matches('button,a[href],input,select,textarea')) {
      element.setAttribute('role', 'button');
      element.tabIndex = copy ? -1 : 0;
    } else if (copy) element.tabIndex = -1;
    element.setAttribute('aria-haspopup', 'dialog');
    if (!element.hasAttribute('aria-label')) element.setAttribute('aria-label', `查看${works[index].title}大图和作品说明`);
    element.querySelectorAll('img').forEach(image => { image.draggable = false; });
  };
  works.forEach((work, index) => prepareTrigger(work.element, index));
  const resolveWork = trigger => {
    const known = workIndex.get(trigger);
    if (known !== undefined) return known;
    const image = trigger?.querySelector('img');
    return works.findIndex(work => work.title === trigger?.dataset.title && (!image || work.image.src === image.src));
  };

  // Three identical runs keep drag movement continuous in either direction.
  const originalCards = rail ? [...rail.children].filter(card => card.classList.contains('work')) : [];
  const lensToggle = $('#lens-toggle');
  let lensEnabled = false, activeLens = null, lensFrame = 0, lensPoint = null;
  let hoveredCard = null;
  originalCards.forEach(card => {
    card.classList.add('magnify');
    const lens = document.createElement('i');
    lens.className = 'lens'; lens.setAttribute('aria-hidden', 'true');
    card.appendChild(lens);
  });
  let leadingCards = [], trailingCards = [];
  const copyCard = original => {
    const copy = original.cloneNode(true);
    copy.dataset.galleryCopy = 'true';
    copy.setAttribute('aria-hidden', 'true');
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    copy.querySelectorAll('a,button,[tabindex]').forEach(element => { element.tabIndex = -1; });
    const index = resolveWork(original);
    if (index >= 0) prepareTrigger(copy, index, true);
    // aria-hidden copies remain pointer targets; keyboard users visit only the originals.
    copy.addEventListener('pointerenter', () => cursor?.classList.add('on'));
    copy.addEventListener('pointerleave', () => cursor?.classList.remove('on'));
    return copy;
  };
  if (rail && originalCards.length > 1) {
    leadingCards = originalCards.map(copyCard);
    trailingCards = originalCards.map(copyCard);
    rail.prepend(...leadingCards); rail.append(...trailingCards);
  }
  let railPosition = 0, railBase = 0, railLoop = 0, railOffsets = [];
  let railVisible = false, railPaused = reduced.matches, railFrame = 0, railLastTime = 0;
  let railResumeAt = 0, railDrag = null, railTween = null, railVelocity = 0, lastWrittenLeft = 0;
  let railFocused = false;
  let railIndex = 0, railLayoutReady = false;
  const railSpeed = 76;
  const mod = (value, divisor) => divisor ? ((value % divisor) + divisor) % divisor : 0;
  const normalizePosition = value => railLoop ? railBase + mod(value - railBase, railLoop) : value;
  const portfolioActive = () => document.documentElement.dataset.portfolioActive !== 'false';
  const railCanRun = () => !!(rail && railLoop && railVisible && portfolioActive() && !document.hidden && !modalIsOpen() && !railDrag && !activeLens && (railTween || Math.abs(railVelocity) > .012 || (!hoveredCard && !railFocused && !railPaused)));
  const updateRailControls = () => {
    const pause = $('#gallery-pause');
    if (pause) {
      const label = railPaused ? '播放轮播' : '暂停轮播';
      const pressed = String(!railPaused);
      if (pause.textContent !== label) pause.textContent = label;
      if (pause.getAttribute('aria-pressed') !== pressed) pause.setAttribute('aria-pressed', pressed);
      if (pause.getAttribute('aria-label') !== label) pause.setAttribute('aria-label', label);
    }
    const count = $('#gallery-count');
    const countLabel = `${String(railIndex + 1).padStart(2, '0')} / ${String(originalCards.length).padStart(2, '0')}`;
    if (count && count.textContent !== countLabel) count.textContent = countLabel;
    ['#gallery-prev', '#gallery-next'].forEach(selector => {
      const button = $(selector);
      const disabled = originalCards.length < 2;
      if (button && button.disabled !== disabled) button.disabled = disabled;
    });
  };
  const updateRailIndex = () => {
    const relative = mod(railPosition - railBase, railLoop);
    let distance = Infinity;
    railOffsets.forEach((offset, index) => {
      const delta = Math.abs(relative - offset);
      if (delta < distance) { railIndex = index; distance = delta; }
    });
    updateRailControls();
  };
  const writeRail = position => {
    if (!rail) return;
    railPosition = normalizePosition(position);
    rail.scrollLeft = railPosition;
    lastWrittenLeft = rail.scrollLeft;
    updateRailIndex();
  };
  const measureRail = () => {
    if (!rail || !originalCards.length || !rail.clientWidth) return;
    clearGalleryHover();
    const oldFraction = railLayoutReady && railLoop ? mod(railPosition - railBase, railLoop) / railLoop : 0;
    const first = rail.firstElementChild;
    railBase = originalCards[0].offsetLeft - first.offsetLeft;
    railLoop = leadingCards.length ? originalCards[0].offsetLeft - leadingCards[0].offsetLeft : 0;
    railOffsets = originalCards.map(card => card.offsetLeft - originalCards[0].offsetLeft);
    railLayoutReady = true;
    railTween = null; railVelocity = 0;
    writeRail(railBase + oldFraction * railLoop);
    syncRail();
  };
  const holdRail = (milliseconds = 2600) => { railResumeAt = performance.now() + milliseconds; };
  const paintRail = now => {
    railFrame = 0;
    if (!railCanRun()) { railLastTime = 0; return; }
    const dt = railLastTime ? Math.min(48, Math.max(0, now - railLastTime)) : 0;
    railLastTime = now;
    if (railTween) {
      if (railTween.start === null) railTween.start = now;
      const progress = Math.min(1, Math.max(0, (now - railTween.start) / railTween.duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      writeRail(railTween.from + (railTween.to - railTween.from) * eased);
      if (progress === 1) { railTween = null; holdRail(); }
    } else if (Math.abs(railVelocity) > .012) {
      const decay = Math.exp(-dt / 165);
      writeRail(railPosition + railVelocity * 165 * (1 - decay));
      railVelocity *= decay;
      if (Math.abs(railVelocity) <= .012) { railVelocity = 0; holdRail(); }
    } else if (now >= railResumeAt) writeRail(railPosition + railSpeed * dt / 1000);
    if (railCanRun()) railFrame = requestAnimationFrame(paintRail);
  };
  function syncRail() {
    updateRailControls();
    if (!railCanRun()) {
      cancelAnimationFrame(railFrame); railFrame = 0; railLastTime = 0;
    } else if (!railFrame) railFrame = requestAnimationFrame(paintRail);
  }
  function hideLens() {
    cancelAnimationFrame(lensFrame); lensFrame = 0; lensPoint = null;
    if (!activeLens) return;
    activeLens.classList.remove('is-visible'); activeLens = null;
    document.body.classList.remove('lens-mode');
    holdRail(350); syncRail();
  }
  function setHoveredCard(card) {
    if (hoveredCard === card) return;
    hoveredCard?.classList.remove('is-hovered');
    hoveredCard = card;
    hoveredCard?.classList.add('is-hovered');
    if (hoveredCard) railTween = null;
    holdRail(350); syncRail();
  }
  const clearGalleryHover = () => { hideLens(); setHoveredCard(null); };
  const trackGalleryHover = event => {
    const card = event.target.closest('.work');
    setHoveredCard(event.pointerType !== 'touch' && !railDrag && !modalIsOpen() && rail?.contains(card) ? card : null);
  };
  const moveLens = event => {
    const card = event.target.closest('.work');
    if (!lensEnabled || event.pointerType === 'touch' || railDrag || modalIsOpen() || !card || !rail?.contains(card)) {
      hideLens(); return;
    }
    const image = card.querySelector('img'), lens = card.querySelector('.lens');
    if (!image?.naturalWidth || !lens) { hideLens(); return; }
    const box = image.getBoundingClientRect(), cardBox = card.getBoundingClientRect();
    const x = event.clientX - box.left, y = event.clientY - box.top;
    if (!box.width || !box.height || x < 0 || y < 0 || x > box.width || y > box.height) { hideLens(); return; }
    if (activeLens !== lens) {
      hideLens(); activeLens = lens; railTween = null;
      lens.classList.add('is-visible'); document.body.classList.add('lens-mode'); syncRail();
    }
    // Match the visible cover crop before magnifying, including portrait artwork.
    const zoom = 2.7, radius = lens.offsetWidth / 2;
    const scale = Math.max(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    const centerX = Math.max(radius + 3, Math.min(cardBox.width - radius - 3, event.clientX - cardBox.left));
    const centerY = Math.max(radius + 3, Math.min(cardBox.height - radius - 3, event.clientY - cardBox.top));
    Object.assign(lens.style, {
      left: `${centerX - radius}px`,
      top: `${centerY - radius}px`,
      backgroundImage: `url(${JSON.stringify(image.currentSrc || image.src)})`,
      backgroundSize: `${width * zoom}px ${height * zoom}px`,
      backgroundPosition: `${radius - (x + (width - box.width) / 2) * zoom}px ${radius - (y + (height - box.height) / 2) * zoom}px`
    });
    // Resample during the image's hover zoom, even when the pointer stays still.
    lensPoint = { target: card, pointerType: event.pointerType, clientX: event.clientX, clientY: event.clientY };
    if (!lensFrame) lensFrame = requestAnimationFrame(() => { lensFrame = 0; if (lensPoint) moveLens(lensPoint); });
  };
  lensToggle?.addEventListener('click', () => {
    lensEnabled = !lensEnabled;
    rail?.closest('.gallery')?.classList.toggle('lens-enabled', lensEnabled);
    lensToggle.classList.toggle('is-on', lensEnabled);
    lensToggle.setAttribute('aria-pressed', String(lensEnabled));
    lensToggle.querySelector('span').textContent = lensEnabled ? '关闭刺绣放大镜' : '开启刺绣放大镜';
    const hint = $('#gallery-hint');
    if (hint) hint.textContent = lensEnabled ? '移入绣面，细看针脚。点击作品，查看完整画面。' : '绣卷缓行，花木相逢。拖动浏览，或轻触一幅作品。';
    if (!lensEnabled) hideLens();
  });
  const stepRail = direction => {
    if (!rail || !railLoop || originalCards.length < 2) return;
    hideLens();
    railTween = null; railVelocity = 0;
    const relative = mod(railPosition - railBase, railLoop);
    let target;
    if (direction > 0) target = railOffsets.find(offset => offset > relative + 3) ?? railLoop;
    else target = [...railOffsets].reverse().find(offset => offset < relative - 3) ?? railOffsets[railOffsets.length - 1] - railLoop;
    holdRail();
    const destination = railPosition + target - relative;
    if (reduced.matches) writeRail(destination);
    else railTween = { from: railPosition, to: destination, start: null, duration: 520 };
    syncRail();
  };
  if (rail) {
    rail.style.scrollBehavior = 'auto';
    rail.style.touchAction = 'pan-y pinch-zoom';
    rail.addEventListener('dragstart', event => event.preventDefault());
    rail.addEventListener('pointerdown', event => {
      if (railDrag || event.button !== 0 || originalCards.length < 2) return;
      clearGalleryHover();
      railTween = null; railVelocity = 0; holdRail();
      railDrag = { id: event.pointerId, startX: event.clientX, startPosition: railPosition, lastX: event.clientX, moved: false, samples: [{ x: event.clientX, t: performance.now() }] };
      const capture = event.target.closest('.work') || rail;
      capture.setPointerCapture(event.pointerId);
      railDrag.capture = capture;
      rail.classList.add('dragging'); syncRail();
    });
    rail.addEventListener('pointermove', event => {
      if (!railDrag || event.pointerId !== railDrag.id) return;
      if (Math.abs(event.clientX - railDrag.startX) > 6) railDrag.moved = true;
      if (railDrag.moved) {
        writeRail(railDrag.startPosition - (event.clientX - railDrag.startX));
        event.preventDefault();
      }
      const now = performance.now();
      railDrag.samples.push({ x: event.clientX, t: now });
      while (railDrag.samples.length > 2 && now - railDrag.samples[0].t > 85) railDrag.samples.shift();
      railDrag.lastX = event.clientX;
    });
    rail.addEventListener('pointerover', trackGalleryHover);
    rail.addEventListener('pointermove', event => { trackGalleryHover(event); moveLens(event); });
    rail.addEventListener('pointerleave', clearGalleryHover);
    window.addEventListener('scroll', clearGalleryHover, { passive: true });
    window.addEventListener('blur', clearGalleryHover);
    const endDrag = event => {
      if (!railDrag || event.pointerId !== railDrag.id) return;
      const previous = railDrag;
      railDrag = null;
      if (event.type === 'pointerup' && previous.moved && !reduced.matches) {
        const samples = previous.samples, first = samples[0], last = samples[samples.length - 1];
        if (performance.now() - last.t < 90 && last.t > first.t) railVelocity = Math.max(-2.2, Math.min(2.2, -(last.x - first.x) / (last.t - first.t)));
      }
      if (previous.moved || event.type === 'pointercancel') ignoreRailClickUntil = performance.now() + 300;
      if (previous.capture.hasPointerCapture?.(previous.id)) previous.capture.releasePointerCapture(previous.id);
      rail.classList.remove('dragging'); holdRail(); syncRail();
      if (event.type === 'pointerup' && event.pointerType !== 'touch') {
        const card = document.elementFromPoint(event.clientX, event.clientY)?.closest('.work');
        if (card && rail.contains(card)) setHoveredCard(card);
      }
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => rail.addEventListener(name, endDrag));
    window.addEventListener('pointerup', endDrag);
    rail.addEventListener('click', event => {
      if (performance.now() < ignoreRailClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    rail.addEventListener('wheel', event => {
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
      if (!horizontal || !railLoop) return;
      hideLens();
      event.preventDefault(); railTween = null; railVelocity = 0; holdRail();
      writeRail(railPosition + (event.deltaX || event.deltaY)); syncRail();
    }, { passive: false });
    rail.addEventListener('scroll', () => {
      if (!railLayoutReady || Math.abs(rail.scrollLeft - lastWrittenLeft) < 1) return;
      railTween = null; railVelocity = 0; holdRail(); writeRail(rail.scrollLeft); syncRail();
    }, { passive: true });
    $('#gallery-prev')?.addEventListener('click', () => stepRail(-1));
    $('#gallery-next')?.addEventListener('click', () => stepRail(1));
    $('#gallery-pause')?.addEventListener('click', () => {
      railPaused = !railPaused; railResumeAt = 0; railVelocity = 0; railTween = null; syncRail();
    });
    rail.addEventListener('focusin', () => { railFocused = true; railVelocity = 0; syncRail(); });
    rail.addEventListener('focusout', () => queueMicrotask(() => {
      railFocused = rail.contains(document.activeElement);
      if (!railFocused) holdRail();
      syncRail();
    }));
    rail.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); stepRail(event.key === 'ArrowLeft' ? -1 : 1);
    });
    new ResizeObserver(measureRail).observe(rail);
    new IntersectionObserver(entries => { railVisible = entries[0].isIntersecting; syncRail(); }, { threshold: .12 }).observe(rail);
    measureRail();
  }

  // Repeated panels overlap softly; all copies open the same complete work.
  const scrollScene = $('#lingjing-scroll');
  const scrollTrack = scrollScene?.querySelector('.scroll-track');
  const scrollPanels = scrollScene ? [...scrollScene.querySelectorAll('.scroll-panel')] : [];
  let scrollVisible = false, scrollPaused = reduced.matches;
  const sourcePanel = scrollPanels.find(panel => panel.hasAttribute('data-title'));
  if (sourcePanel) {
    const sourceIndex = resolveWork(sourcePanel);
    scrollPanels.forEach(panel => {
      if (sourceIndex < 0) return;
      panel.dataset.title = works[sourceIndex].title;
      panel.dataset.type = works[sourceIndex].type;
      panel.dataset.desc = works[sourceIndex].description;
      prepareTrigger(panel, sourceIndex, panel !== sourcePanel);
    });
  }
  function syncScroll() {
    if (!scrollScene) return;
    const inactive = !scrollVisible || !portfolioActive() || document.hidden || modalIsOpen() || scrollScene.contains(document.activeElement);
    scrollScene.dataset.offscreen = String(inactive);
    scrollScene.classList.toggle('is-paused', scrollPaused);
    if (scrollTrack) scrollTrack.style.animationPlayState = scrollPaused || inactive ? 'paused' : 'running';
    const button = $('#scroll-pause');
    if (button) {
      const label = scrollPaused ? '播放长卷' : '暂停长卷';
      const pressed = String(!scrollPaused);
      if (button.textContent !== label) button.textContent = label;
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    }
  }
  if (scrollScene) {
    scrollScene.addEventListener('focusin', syncScroll);
    scrollScene.addEventListener('focusout', () => queueMicrotask(syncScroll));
    $('#scroll-pause')?.addEventListener('click', () => { scrollPaused = !scrollPaused; syncScroll(); });
    new IntersectionObserver(entries => { scrollVisible = entries[0].isIntersecting; syncScroll(); }, { threshold: .08 }).observe(scrollScene);
    if (scrollTrack && scrollPanels[0]) {
      const setDuration = () => {
        const width = scrollPanels[0].getBoundingClientRect().width;
        if (width) scrollTrack.style.setProperty('--scroll-duration', `${Math.max(28, (width - window.innerWidth * .03) / 38).toFixed(2)}s`);
      };
      new ResizeObserver(setDuration).observe(scrollPanels[0]); setDuration();
    }
  }

  const setBackgroundInert = () => {
    inertSnapshot = [...document.querySelectorAll('body > main,body > nav,body > header,body > footer,body > .music-control')].filter(element => !element.contains(modal)).map(element => ({ element, attribute: element.getAttribute('inert') }));
    inertSnapshot.forEach(({ element }) => element.setAttribute('inert', ''));
  };
  const restoreBackgroundInert = () => {
    inertSnapshot.forEach(({ element, attribute }) => {
      if (attribute === null) element.removeAttribute('inert'); else element.setAttribute('inert', attribute);
    });
    inertSnapshot = [];
  };
  const lockBody = () => {
    if (bodySnapshot) return;
    bodySnapshot = { style: document.body.getAttribute('style'), y: window.scrollY };
    const width = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    Object.assign(document.body.style, { position: 'fixed', top: `-${bodySnapshot.y}px`, left: '0', width: '100%', overflow: 'hidden' });
    if (width) document.body.style.paddingRight = `${width}px`;
  };
  const unlockBody = () => {
    if (!bodySnapshot) return;
    const previous = bodySnapshot; bodySnapshot = null;
    if (previous.style === null) document.body.removeAttribute('style'); else document.body.setAttribute('style', previous.style);
    window.scrollTo({ top: previous.y, behavior: 'instant' });
  };
  let modalMotion = null, modalGhost = null, modalMotionId = 0, modalClosing = false, sourceImage = null;
  const artworkBox = (image, reference = image) => {
    if (!image?.isConnected) return null;
    const box = image.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const result = { left: box.left, top: box.top, width: box.width, height: box.height };
    if (getComputedStyle(image).objectFit === 'contain' && reference.naturalWidth && reference.naturalHeight) {
      const ratio = Math.min(box.width / reference.naturalWidth, box.height / reference.naturalHeight);
      result.width = reference.naturalWidth * ratio; result.height = reference.naturalHeight * ratio;
      result.left += (box.width - result.width) / 2; result.top += (box.height - result.height) / 2;
    }
    return result;
  };
  const cancelModalMotion = () => {
    const current = modalGhost ? artworkBox(modalGhost) : null;
    modalMotionId++;
    modalMotion?.cancel(); modalMotion = null;
    modalGhost?.remove(); modalGhost = null;
    modalImage.style.removeProperty('visibility');
    return current;
  };
  const visibleSource = () => {
    const candidates = [sourceImage, works[activeWork]?.image, ...document.querySelectorAll('#silk-rail .work img')];
    return candidates.find(image => {
      if (!image?.isConnected || (image.currentSrc || image.src) !== modalImage.src) return false;
      const box = image.getBoundingClientRect();
      return box.bottom > 16 && box.top < innerHeight - 16 && box.right > 16 && box.left < innerWidth - 16;
    });
  };
  const moveArtwork = (from, to, finish) => {
    if (reduced.matches || !from || !to || !Element.prototype.animate) { finish(); return; }
    const id = ++modalMotionId;
    const ghost = new Image();
    ghost.src = modalImage.src; ghost.alt = ''; ghost.setAttribute('aria-hidden', 'true');
    ghost.className = 'panda-shared-art';
    Object.assign(ghost.style, { position: 'fixed', left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, margin: '0', maxWidth: 'none', maxHeight: 'none', objectFit: 'cover', borderRadius: '1px', transformOrigin: '0 0', willChange: 'transform', pointerEvents: 'none', zIndex: '5' });
    modal.append(ghost); modalGhost = ghost; modalImage.style.visibility = 'hidden';
    // The endpoint owns layout once; only the composited transform changes per frame.
    // getBoundingClientRect in cancelModalMotion still captures its live visual box.
    const transform = `translate3d(${from.left - to.left}px, ${from.top - to.top}px, 0) scale(${from.width / to.width}, ${from.height / to.height})`;
    modalMotion = ghost.animate([{ transform }, { transform: 'translate3d(0, 0, 0) scale(1, 1)' }], { duration: modalClosing ? 270 : 340, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
    modalMotion.finished.then(() => {
      if (id !== modalMotionId) return;
      modalGhost?.remove(); modalGhost = null; modalMotion = null;
      modalImage.style.removeProperty('visibility'); finish();
    }).catch(() => {});
  };
  const renderWork = index => {
    const work = works[index];
    if (!work || !modalReady) return;
    activeWork = index;
    modalImage.src = work.image.currentSrc || work.image.src;
    modalImage.alt = work.title;
    modalTitle.textContent = work.title;
    if ($('#modal-type')) $('#modal-type').textContent = work.type;
    if ($('#modal-description')) $('#modal-description').textContent = work.description;
    if ($('#modal-count')) $('#modal-count').textContent = `${String(index + 1).padStart(2, '0')} / ${String(works.length).padStart(2, '0')}`;
    if ($('#modal-prev')) $('#modal-prev').disabled = index === 0;
    if ($('#modal-next')) $('#modal-next').disabled = index === works.length - 1;
    modal.querySelector('.modal-stage')?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };
  const openModal = (index, trigger) => {
    if (!modalReady || !works[index]) return;
    const previousBox = cancelModalMotion(); modalClosing = false;
    sourceImage = trigger?.querySelector('img') || works[index].image;
    const from = previousBox || artworkBox(sourceImage);
    clearGalleryHover();
    if (!modalIsOpen()) {
      const candidate = trigger || document.activeElement;
      returnFocus = candidate?.closest('[aria-hidden="true"]') ? works[index].element : candidate;
      window.dispatchEvent(new CustomEvent('panda:modal-open'));
      lockBody(); setBackgroundInert();
      modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
      modal.dataset.sharedMotion = 'true';
      if (typeof modal.showModal === 'function' && !modal.open) modal.showModal();
      if (!modalInner.hasAttribute('tabindex')) modalInner.tabIndex = -1;
      (modalClose || modalInner).focus({ preventScroll: true });
    }
    railTween = null; railVelocity = 0; holdRail();
    renderWork(index); syncRail(); syncScroll();
    moveArtwork(from, artworkBox(modalImage, works[index].image), () => {});
  };
  const finishCloseModal = () => {
    modalClosing = false; cancelModalMotion();
    modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true');
    if (typeof modal.close === 'function' && modal.open) modal.close();
    restoreBackgroundInert(); unlockBody();
    window.dispatchEvent(new CustomEvent('panda:modal-close', { detail: { scrollY: window.scrollY } }));
    if (returnFocus?.isConnected && !returnFocus.closest('[inert]')) returnFocus.focus({ preventScroll: true });
    returnFocus = null; activeWork = -1; holdRail(); syncRail(); syncScroll();
  };
  const closeModal = (immediate = false) => {
    if (!modalIsOpen() || modalClosing) return;
    const from = cancelModalMotion() || artworkBox(modalImage, works[activeWork]?.image);
    modalClosing = true;
    const target = visibleSource();
    if (immediate || reduced.matches || !target) { finishCloseModal(); return; }
    moveArtwork(from, artworkBox(target), finishCloseModal);
  };
  const nextWork = direction => {
    const index = activeWork + direction;
    if (modalIsOpen() && works[index]) {
      cancelModalMotion(); modalClosing = false;
      renderWork(index); sourceImage = works[index].image;
      if (!reduced.matches) modalImage.animate([{ opacity: .5 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
    }
  };
  if (modalReady) {
    modal.addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
    document.addEventListener('click', event => {
      if (event.target.closest('#modal') || event.target.closest('#gallery-prev,#gallery-next,#gallery-pause,#scroll-pause,#lens-toggle')) return;
      const trigger = event.target.closest('[data-title]');
      if (!trigger || (rail?.contains(trigger) && performance.now() < ignoreRailClickUntil)) return;
      const index = resolveWork(trigger);
      if (index >= 0) openModal(index, trigger);
    });
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('.close')) closeModal();
    });
    $('#modal-prev')?.addEventListener('click', () => nextWork(-1));
    $('#modal-next')?.addEventListener('click', () => nextWork(1));
    document.addEventListener('keydown', event => {
      if (!modalIsOpen()) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const trigger = event.target.closest('[data-title]');
        if (!trigger || trigger.matches('button,a[href],input,select,textarea') || trigger.closest('[aria-hidden="true"]')) return;
        const index = resolveWork(trigger);
        if (index >= 0) { event.preventDefault(); openModal(index, trigger); }
        return;
      }
      if (event.key === 'Escape') { event.preventDefault(); closeModal(); return; }
      if (event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); nextWork(event.key === 'ArrowLeft' ? -1 : 1); }
      if (event.key === 'Tab') {
        const focusable = [...modal.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(element => !element.closest('[hidden],[inert]') && element.getClientRects().length);
        const first = focusable[0] || modalInner, last = focusable[focusable.length - 1] || modalInner;
        if (!focusable.length || !modal.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true });
        } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus({ preventScroll: true }); }
      }
    });
    document.addEventListener('focusin', event => {
      if (modalIsOpen() && !modal.contains(event.target)) (modalClose || modalInner).focus({ preventScroll: true });
    });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearGalleryHover(); syncRail(); syncScroll(); });
  window.addEventListener('portfolio:world-suspend', () => { railVelocity = 0; railTween = null; cancelModalMotion(); if (modalIsOpen()) finishCloseModal(); });
  new MutationObserver(() => {
    if (!portfolioActive()) { railVelocity = 0; railTween = null; clearGalleryHover(); }
    syncRail(); syncScroll();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-portfolio-active'] });
  reduced.addEventListener('change', () => {
    if (reduced.matches) { railPaused = true; scrollPaused = true; railTween = null; railVelocity = 0; }
    syncRail(); syncScroll();
  });
  // A single marker follows the chapter nearest the upper third of the viewport.
  const chapterNav = $('.chapter-nav');
  const chapterLinks = chapterNav ? [...chapterNav.querySelectorAll('a[href^="#"]')] : [];
  const chapters = chapterLinks.map(link => ({ link, section: $(link.getAttribute('href')) })).filter(item => item.section);
  let chapterFrame = 0;
  const updateChapterNav = () => {
    chapterFrame = 0;
    if (!chapters.length || modalIsOpen()) return;
    let current = chapters[0];
    for (const chapter of chapters) {
      if (chapter.section.getBoundingClientRect().top <= window.innerHeight * .36) current = chapter;
    }
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8) current = chapters[chapters.length - 1];
    chapters.forEach(({ link }) => {
      if (link === current.link) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    chapterNav.style.setProperty('--chapter-indicator-y', `${current.link.offsetTop + current.link.offsetHeight / 2 - 1}px`);
  };
  const queueChapterNav = () => { if (!chapterFrame) chapterFrame = requestAnimationFrame(updateChapterNav); };
  if (chapterNav) {
    window.addEventListener('scroll', queueChapterNav, { passive: true });
    window.addEventListener('resize', queueChapterNav);
    window.addEventListener('hashchange', queueChapterNav);
    new ResizeObserver(queueChapterNav).observe(document.querySelector('main'));
    updateChapterNav();
  }
  updateRailControls(); syncScroll();
})();
