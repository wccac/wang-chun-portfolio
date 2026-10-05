/* Persistent, locally hosted background music and independent interaction sounds. */
(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  const TRACK = Object.freeze({
    key: 'happy-lullaby', title: 'Happy Lullaby', artist: 'The Cynic Project',
    page: 'https://opengameart.org/content/happy-lullaby-song17',
    license: 'https://creativecommons.org/publicdomain/zero/1.0/', licenseLabel: 'CC0',
    src: new URL('assets/audio/cottage-bright-bells.ogg', base).href,
    fallback: new URL('assets/audio/cottage-bright-bells.mp3', base).href
  });
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17V5l10-2v12M10 9l10-2"/><ellipse cx="6.5" cy="17.5" rx="3.5" ry="2.5"/><ellipse cx="16.5" cy="15.5" rx="3.5" ry="2.5"/></svg>';
  const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg>';
  const pauseIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';

  function create({ button, onEffectsChange = () => {}, effectsEnabled = true } = {}) {
    if (!button) throw new TypeError('CottageMusic requires a button.');
    let visible = false, destroyed = false, enabled = true, volume = .28, state = 'waiting', revision = 0, storage;
    const bindings = new Set();
    try {
      storage = window.sessionStorage;
      enabled = storage.getItem('cottage-music-enabled') !== 'off';
      const saved = storage.getItem('cottage-music-volume');
      if (saved !== null && Number.isFinite(Number(saved))) volume = Math.max(0, Math.min(1, Number(saved)));
    } catch (_) {}
    const save = (key, value) => { try { storage?.setItem(key, value); } catch (_) {} };
    const originalMarkup = button.innerHTML;
    const originalAttributes = ['aria-label', 'aria-haspopup', 'aria-expanded', 'aria-controls', 'aria-pressed'].map(name => [name, button.getAttribute(name)]);
    const panel = document.createElement('section');
    panel.id = 'cottage-music'; panel.className = 'cottage-music'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '小屋声音');
    panel.innerHTML = `
      <header class="music-panel-head"><span>小屋里的声音</span><button type="button" class="music-close" aria-label="收起音乐面板"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12m0-12L6 18"/></svg></button></header>
      <div class="music-track"><button class="music-play" type="button" aria-label="播放背景音乐">${playIcon}</button><div><a class="music-title" href="${TRACK.page}" target="_blank" rel="noopener noreferrer"><strong>${TRACK.title}</strong></a><p>${TRACK.artist}</p><span class="music-state" role="status" aria-live="polite"></span></div></div>
      <label class="music-volume"><span>音乐音量</span><input type="range" min="0" max="100" step="1" aria-label="背景音乐音量"><output></output></label>
      <footer class="music-panel-foot"><label class="music-effects"><input type="checkbox"><span>交互音效</span></label><button type="button" class="music-stop">停止并关闭</button></footer>
      <div class="music-credit"><a class="music-source" href="${new URL('assets/audio/SOURCE.md',base).href}" target="_blank" rel="noopener noreferrer">${TRACK.artist} · 音源说明</a><a href="${TRACK.license}" target="_blank" rel="noopener noreferrer">${TRACK.licenseLabel}</a></div>`;
    document.body.append(panel);
    const effects = panel.querySelector('.music-effects input'), playButton = panel.querySelector('.music-play');
    const volumeInput = panel.querySelector('.music-volume input'), volumeOutput = panel.querySelector('.music-volume output');
    const stateText = panel.querySelector('.music-state');
    const audio = document.createElement('audio');
    audio.id = 'cottage-background-music'; audio.src = audio.canPlayType('audio/ogg; codecs="vorbis"') ? TRACK.src : TRACK.fallback;
    audio.preload = 'auto'; audio.loop = true; audio.volume = volume;
    audio.setAttribute('playsinline', ''); audio.setAttribute('aria-hidden', 'true'); panel.append(audio);
    effects.checked = Boolean(effectsEnabled);
    volumeInput.value = String(Math.round(volume * 100)); volumeOutput.value = volumeInput.value + '%';
    button.innerHTML = icon; button.removeAttribute('aria-pressed');
    button.setAttribute('aria-label', '打开音乐面板'); button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', panel.id); button.classList.add('music-toggle');

    function setState(next) {
      if (destroyed) return;
      state = next; button.dataset.musicState = state;
      const playing = state === 'playing';
      playButton.innerHTML = playing ? pauseIcon : playIcon;
      playButton.setAttribute('aria-label', playing ? '暂停背景音乐' : '播放背景音乐');
      playButton.setAttribute('aria-pressed', String(playing));
      stateText.textContent = ({ waiting: '随探索开始', loading: '正在载入', playing: '循环播放', paused: '已暂停', error: '点播放重试' })[state];
    }
    function start() {
      if (destroyed || !enabled) return;
      const token = ++revision;
      if (audio.error) audio.load();
      setState('loading');
      // Call play synchronously inside the first ordinary user interaction.
      // A rejected initial autoplay leaves the same audio ready for that click.
      try {
        const playing = audio.play();
        Promise.resolve(playing).then(() => {
          if (destroyed || token !== revision) return;
          if (!enabled) audio.pause(); else setState(audio.paused ? 'waiting' : 'playing');
        }).catch(error => {
          if (destroyed || token !== revision) return;
          setState(!enabled ? 'paused' : error.name === 'NotAllowedError' ? 'waiting' : error.name === 'AbortError' ? 'waiting' : 'error');
        });
      } catch (_) { setState('error'); }
    }
    function setEnabled(value) {
      enabled = Boolean(value); save('cottage-music-enabled', enabled ? 'on' : 'off');
      if (enabled) start(); else { ++revision; audio.pause(); setState('paused'); }
    }
    function bindDocument(doc) {
      const activate = event => {
        if (event.type === 'keydown' && (event.repeat || !['Enter', ' '].includes(event.key))) return;
        if (event.target?.closest?.('#cottage-music')) return;
        if (enabled && audio.paused) start();
      };
      doc.addEventListener('click', activate, true); doc.addEventListener('keydown', activate, true);
      const cleanup = () => { doc.removeEventListener('click', activate, true); doc.removeEventListener('keydown', activate, true); bindings.delete(cleanup); };
      bindings.add(cleanup); return cleanup;
    }
    function open({ focus = true } = {}) {
      if (destroyed) return;
      visible = true; panel.hidden = false; button.setAttribute('aria-expanded', 'true'); button.setAttribute('aria-label', '收起音乐面板');
      if (focus) panel.querySelector('.music-close').focus({ preventScroll: true });
    }
    function close({ focus = false } = {}) {
      if (destroyed) return;
      visible = false; panel.hidden = true; button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-label', '打开音乐面板');
      if (focus) button.focus({ preventScroll: true });
    }
    function stop({ focus = true } = {}) { setEnabled(false); audio.currentTime = 0; close({ focus }); }
    function setEffects(value) { effects.checked = Boolean(value); onEffectsChange(effects.checked); }
    function toggle() { visible ? close({ focus: true }) : open(); }
    function outside(event) { if (visible && !panel.contains(event.target) && !button.contains(event.target)) close(); }
    function keydown(event) {
      if (visible && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close({ focus: true }); }
    }
    function updatePlayback() {
      if (!enabled) { if (!audio.paused) audio.pause(); setState('paused'); }
      else if (audio.error) setState('error');
      else setState(audio.paused ? 'waiting' : 'playing');
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true; ++revision; audio.pause(); audio.removeAttribute('src'); audio.load();
      for (const cleanup of [...bindings]) cleanup();
      button.removeEventListener('click', toggle); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', keydown, true);
      panel.remove(); button.innerHTML = originalMarkup; button.classList.remove('music-toggle'); delete button.dataset.musicState;
      for (const [name, value] of originalAttributes) value === null ? button.removeAttribute(name) : button.setAttribute(name, value);
    }
    button.addEventListener('click', toggle);
    panel.querySelector('.music-close').addEventListener('click', () => close({ focus: true }));
    panel.querySelector('.music-stop').addEventListener('click', () => stop());
    playButton.addEventListener('click', () => setEnabled(!enabled || audio.paused));
    effects.addEventListener('change', () => setEffects(effects.checked));
    volumeInput.addEventListener('input', () => {
      volume = Number(volumeInput.value) / 100; audio.volume = volume; volumeOutput.value = volumeInput.value + '%'; save('cottage-music-volume', String(volume));
    });
    audio.addEventListener('playing', updatePlayback); audio.addEventListener('pause', updatePlayback); audio.addEventListener('error', updatePlayback);
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', keydown, true); bindDocument(document);
    setState(enabled ? 'waiting' : 'paused'); if (enabled) start();
    return { open, close, stop, destroy, setEffects, setEnabled, bindDocument, track: TRACK,
      get isOpen() { return visible; }, get isLoaded() { return audio.readyState >= 2; },
      get state() { return { enabled, playing: !audio.paused && !audio.error, status: state, volume, currentTime: audio.currentTime }; }
    };
  }
  window.CottageMusic = Object.freeze({ create, track: TRACK });
})();
