(function (global) {
  'use strict';

  var script = document.currentScript;
  var worldBase = new URL('../world-design/', script && script.src || document.baseURI);
  var files = {
    tangui: { world: 'W01-tangui-world.html', detail: 'D01-tangui-detail.html' },
    bitter: { world: 'W02-bitter-melon-world.html', detail: 'D02-bitter-melon-detail.html' },
    panda: { world: 'W03-panda-world.html', detail: 'D03-panda-detail.html' }
  };
  var titles = { tangui: '檀晷', bitter: 'Bitter Melon', panda: '牡丹熊猫花园' };

  function create(options) {
    options = options || {};
    var iframe = options.iframe;
    if (!iframe || iframe.tagName !== 'IFRAME') {
      throw new TypeError('PortfolioWorldBridge.create requires an iframe element.');
    }

    var positions = {
      tangui: { world: 0, detail: 0 },
      bitter: { world: 0, detail: 0 },
      panda: { world: 0, detail: 0 }
    };
    var readerStates = { tangui: {}, bitter: {}, panda: {} };
    var current = null;
    var documentCleanup = null;
    var pending = null;
    var sequence = 0;
    var destroyed = false;
    var suspended = false;
    var hasNavigated = false;
    var restoring = false;

    function notify(name, detail) {
      if (typeof options[name] === 'function') options[name](detail);
    }

    function savePosition() {
      if (!current || !current.ready || restoring || suspended) return;
      try {
        positions[current.project][current.page] = current.completed ? 0 : Math.max(0, iframe.contentWindow.scrollY);
        var reader = iframe.contentWindow.PortfolioBookReader;
        if (reader && typeof reader.getState === 'function') {
          readerStates[current.project][current.page] = reader.getState();
        }
      } catch (_) { /* A failed or external navigation must not erase the last position. */ }
    }

    function cleanupDocument() {
      if (documentCleanup) documentCleanup();
      documentCleanup = null;
    }

    function finish(error, token) {
      if (destroyed || suspended || !current || current.token !== token || !pending) return;
      clearTimeout(pending.timer);
      var task = pending;
      pending = null;
      current.ready = !error;
      // A timed-out decode/font task may still resolve later. Invalidate its
      // continuation so it cannot repaint or publish world-ready after failure.
      if (error) current.token = ++sequence;
      iframe.setAttribute('aria-busy', 'false');
      iframe.dataset.worldStatus = error ? 'error' : 'ready';
      var detail = { project: current.project, page: current.page, error: Boolean(error) };
      task.resolve(detail);
      notify('onReady', detail);
    }

    function restorePosition(doc, view) {
      if (!current) return;
      var top = positions[current.project][current.page];
      if (current.anchor) {
        var chapter = doc.getElementById(current.anchor);
        if (chapter) {
          top = 0;
          while (chapter) { top += chapter.offsetTop || 0; chapter = chapter.offsetParent; }
          positions[current.project][current.page] = top;
        }
      }
      var root = doc.documentElement;
      var behavior = root.style.getPropertyValue('scroll-behavior');
      var priority = root.style.getPropertyPriority('scroll-behavior');
      restoring = true;
      root.style.setProperty('scroll-behavior', 'auto', 'important');
      view.scrollTo(0, top);
      if (behavior) root.style.setProperty('scroll-behavior', behavior, priority);
      else root.style.removeProperty('scroll-behavior');
      restoring = false;
    }

    function findDestination(url) {
      if (url.origin !== worldBase.origin) return null;
      for (var project in files) {
        for (var page in files[project]) {
          if (url.pathname === new URL(files[project][page], worldBase).pathname) {
            var anchor = '';
            try { anchor = decodeURIComponent(url.hash.slice(1)); } catch (_) { /* Ignore invalid fragments. */ }
            return { project: project, page: page, anchor: anchor };
          }
        }
      }
      return null;
    }

    function connectDocument(doc, view) {
      var soundCleanup = typeof options.onDocument === 'function' ? options.onDocument(doc) : null;
      // The bridge owns each project's remembered position; browser history must not
      // restore this nested browsing context after the parent has already restored it.
      if ('scrollRestoration' in view.history) view.history.scrollRestoration = 'manual';

      // Embedded projects share the cottage's persistent corner controls. Keep the
      // original header's layout space so its artwork does not jump when embedded.
      doc.documentElement.classList.add('portfolio-embedded');
      var embeddedStyle = doc.getElementById('portfolio-embedded-controls');
      if (!embeddedStyle) {
        embeddedStyle = doc.createElement('style');
        embeddedStyle.id = 'portfolio-embedded-controls';
        embeddedStyle.textContent = '.portfolio-embedded a.return,.portfolio-embedded .folio-label,.portfolio-embedded .top-meta,.portfolio-embedded .signature{visibility:hidden!important;pointer-events:none!important}';
        doc.head.appendChild(embeddedStyle);
      }
      doc.querySelectorAll('a.return,.folio-label,.top-meta,.signature').forEach(function (element) {
        element.setAttribute('aria-hidden', 'true');
        if (element.matches('a')) element.tabIndex = -1;
      });

      var project = current.project;
      var page = current.page;
      var returning = false;
      var focusFrame = 0;
      function cancelChapterFocus() {
        view.cancelAnimationFrame(focusFrame);
        focusFrame = 0;
      }
      function focusChapter(chapter, top) {
        cancelChapterFocus();
        var began = view.performance.now();
        var last = view.scrollY;
        var stable = 0;
        var destination = chapter.matches('h1,h2,h3') ? chapter : chapter.querySelector('h1,h2,h3') || chapter;
        function settle() {
          stable = Math.abs(view.scrollY - last) < .5 ? stable + 1 : 0;
          last = view.scrollY;
          if (Math.abs(view.scrollY - Math.min(top, doc.documentElement.scrollHeight - view.innerHeight)) < 3 ||
              (stable > 5 && view.performance.now() - began > 220)) {
            if (!destination.hasAttribute('tabindex')) destination.setAttribute('tabindex', '-1');
            destination.focus({ preventScroll: true });
            focusFrame = 0;
          } else if (view.performance.now() - began < 2000) focusFrame = view.requestAnimationFrame(settle);
        }
        focusFrame = view.requestAnimationFrame(settle);
      }
      function rememberReader(event) {
        // Initial reader renders can finish while fonts/layout are loading.
        // Their defaults must not overwrite the state awaiting restoration.
        if (event.detail && !restoring && current && current.ready && current.project === project && current.page === page) {
          readerStates[project][page] = event.detail;
        }
      }
      var dialogOpen = null;
      function reportDialog() {
        var open = Boolean(doc.querySelector('dialog[open]'));
        if (open === dialogOpen) return;
        dialogOpen = open;
        notify('onDialogChange', { open: open, project: project, page: page });
      }
      var dialogObserver = new view.MutationObserver(reportDialog);
      dialogObserver.observe(doc.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });
      reportDialog();

      function click(event) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
            event.ctrlKey || event.shiftKey || event.altKey) return;
        var anchor = event.target && event.target.closest && event.target.closest('a[href]');
        if (!anchor || anchor.hasAttribute('download') ||
            (anchor.target && anchor.target !== '_self')) return;
        if (anchor.hasAttribute('data-project-return')) {
          event.preventDefault();
          if (returning || suspended) return;
          returning = true;
          if (project === 'panda' && anchor.hasAttribute('data-project-complete')) current.completed = true;
          savePosition();
          if (page === 'detail') {
            var previousPage = { project: project, page: 'world' };
            if (typeof options.onNavigate === 'function') notify('onNavigate', previousPage);
            else show(project, 'world');
          } else {
            notify('onExit', { project: project, page: page });
          }
          return;
        }
        var url;
        try { url = new URL(anchor.href, doc.baseURI); } catch (_) { return; }
        // Chapters belong to the already-open artwork. Navigating them through
        // the project router reloads the iframe and flashes the opening image.
        if (url.origin === view.location.origin && url.pathname === view.location.pathname &&
            url.search === view.location.search && url.hash) {
          var chapter;
          try { chapter = doc.getElementById(decodeURIComponent(url.hash.slice(1))); } catch (_) { return; }
          if (chapter) {
            event.preventDefault();
            // Layout offsets stay stable even while a reveal transform runs.
            var top = 0, node = chapter;
            while (node) { top += node.offsetTop || 0; node = node.offsetParent; }
            var reduced = view.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (view.__pandaScrollTo) view.__pandaScrollTo(top);
            else view.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
            focusChapter(chapter, top);
          }
          return;
        }
        var destination = findDestination(url);
        if (destination) {
          event.preventDefault();
          savePosition();
          if (typeof options.onNavigate === 'function') notify('onNavigate', destination);
          else show(destination.project, destination.page, destination.anchor);
          return;
        }
        if (current.page === 'world' && anchor.matches('.return') &&
            /\/S0[56]-pixel-cottage-[^/]+\.png$/.test(url.pathname)) {
          event.preventDefault();
          savePosition();
          notify('onExit', { project: current.project, page: current.page });
        }
      }

      function keydown(event) {
        if (event.key !== 'Escape' || event.defaultPrevented || event.repeat || event.isComposing) return;
        // Capture checks the dialog before its own Escape handler can close it.
        // The same keystroke must never close a detail viewer and also leave its page.
        if (doc.querySelector('dialog[open]')) return;
        event.preventDefault();
        savePosition();
        if (current.page === 'detail') {
          var destination = { project: current.project, page: 'world' };
          if (typeof options.onNavigate === 'function') notify('onNavigate', destination);
          else show(destination.project, destination.page);
        } else {
          notify('onExit', { project: current.project, page: current.page });
        }
      }

      // Native dialogs retain their own focus trap, zoom, close, and focus restoration.
      doc.addEventListener('click', click);
      doc.addEventListener('keydown', keydown, true);
      view.addEventListener('scroll', savePosition, { passive: true });
      view.addEventListener('portfolio:reader-state', rememberReader);
      view.addEventListener('wheel', cancelChapterFocus, { passive: true });
      view.addEventListener('touchstart', cancelChapterFocus, { passive: true });
      doc.addEventListener('keydown', cancelChapterFocus);
      var returned = doc.querySelector('a.return');
      if (current.page === 'world' && returned) {
        returned.setAttribute('aria-label', current.project === 'bitter' ? 'Back to the cottage' : '返回小屋');
      }
      documentCleanup = function () {
        view.dispatchEvent(new view.Event('portfolio:world-suspend'));
        if (typeof soundCleanup === 'function') soundCleanup();
        doc.removeEventListener('click', click);
        doc.removeEventListener('keydown', keydown, true);
        view.removeEventListener('scroll', savePosition);
        view.removeEventListener('portfolio:reader-state', rememberReader);
        view.removeEventListener('wheel', cancelChapterFocus);
        view.removeEventListener('touchstart', cancelChapterFocus);
        doc.removeEventListener('keydown', cancelChapterFocus);
        cancelChapterFocus();
        dialogObserver.disconnect();
        if (dialogOpen) notify('onDialogChange', { open: false, project: project, page: page });
      };
    }

    async function loaded() {
      if (destroyed || suspended || !current || !pending) return;
      var token = current.token;
      var doc;
      var view;
      try {
        view = iframe.contentWindow;
        doc = iframe.contentDocument;
        if (!doc || !view) throw new Error('Document unavailable');
        // An initial about:blank load, or a superseded load, is not this request.
        if (view.location.href === 'about:blank') return;
        if (new URL(view.location.href).pathname !== new URL(current.url).pathname) return;
        if (!doc.querySelector('main')) throw new Error('Project page did not load');
      } catch (_) {
        finish(true, token);
        return;
      }
      cleanupDocument();
      connectDocument(doc, view);
      if (doc.fonts && doc.fonts.ready) {
        await Promise.race([doc.fonts.ready.catch(function () {}), new Promise(function (resolve) {
          setTimeout(resolve, 1200);
        })]);
      }
      if (destroyed || suspended || !current || token !== current.token) return;
      var reader = view.PortfolioBookReader;
      var state = readerStates[current.project][current.page];
      if (state && reader && typeof reader.restoreState === 'function') {
        try { await reader.restoreState(state); } catch (_) { /* Keep the current readable preview on asset failure. */ }
      }
      if (destroyed || suspended || !current || token !== current.token) return;
      restorePosition(doc, view);
      // Wait for the restored page to paint before its parent reveals the new world.
      await new Promise(function (resolve) {
        global.requestAnimationFrame(function () { global.requestAnimationFrame(resolve); });
      });
      if (destroyed || suspended || !current || token !== current.token) return;
      restorePosition(doc, view);
      view.dispatchEvent(new view.Event('portfolio:world-ready'));
      finish(false, token);
    }

    function failed() {
      if (current) finish(true, current.token);
    }

    function show(project, page, anchor) {
      page = page || 'world';
      if (destroyed) return Promise.resolve({ project: project, page: page, error: true, cancelled: true });
      if (!Object.prototype.hasOwnProperty.call(files, project) ||
          !Object.prototype.hasOwnProperty.call(files[project], page)) {
        throw new RangeError('Unknown portfolio project or page.');
      }
      savePosition();
      suspended = false;
      cleanupDocument();
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve({ project: current.project, page: current.page, error: false, cancelled: true });
        pending = null;
      }
      var token = ++sequence;
      var url = new URL(files[project][page], worldBase).href;
      current = { project: project, page: page, anchor: anchor || '', url: url, token: token, ready: false };
      iframe.title = titles[project] + (page === 'world' ? ' · 作品世界' : ' · 作品细节');
      iframe.setAttribute('aria-busy', 'true');
      iframe.dataset.worldStatus = 'loading';
      iframe.dataset.worldSrc = url;

      return new Promise(function (resolve) {
        pending = { resolve: resolve, timer: setTimeout(function () { finish(true, token); }, 16000) };
        try {
          // Replacing the iframe location keeps browser Back owned by the parent route.
          if (hasNavigated && iframe.contentWindow) iframe.contentWindow.location.replace(url);
          else iframe.src = url;
          hasNavigated = true;
        } catch (_) {
          iframe.src = url;
          hasNavigated = true;
        }
      });
    }

    function getScrollState() {
      return {
        tangui: { world: positions.tangui.world, detail: positions.tangui.detail },
        bitter: { world: positions.bitter.world, detail: positions.bitter.detail },
        panda: { world: positions.panda.world, detail: positions.panda.detail }
      };
    }

    function suspend() {
      if (destroyed || suspended) return;
      savePosition();
      suspended = true;
      cleanupDocument();
      // Invalidate load/font/paint continuations before the parent hides the iframe.
      if (current) current.token = ++sequence;
      iframe.setAttribute('aria-busy', 'false');
      iframe.dataset.worldStatus = 'suspended';
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve({ project: current.project, page: current.page, error: false, cancelled: true });
        pending = null;
      }
    }

    function destroy() {
      if (destroyed) return;
      savePosition();
      destroyed = true;
      cleanupDocument();
      iframe.removeEventListener('load', loaded);
      iframe.removeEventListener('error', failed);
      iframe.setAttribute('aria-busy', 'false');
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve({ project: current.project, page: current.page, error: false, cancelled: true });
        pending = null;
      }
    }

    iframe.addEventListener('load', loaded);
    iframe.addEventListener('error', failed);
    return { show: show, suspend: suspend, destroy: destroy, getScrollState: getScrollState };
  }

  global.PortfolioWorldBridge = { create: create };
})(window);
