(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var player = $('player'), v = $('v'), spin = $('spin'), toastEl = $('toast');
  var seek = $('seek'), cur = $('cur'), dur = $('dur'), vol = $('vol');
  var movieId = location.pathname.split('/').filter(Boolean).pop() || '';
  var hls = null, native = false, idleTimer = null, dragging = false, saveT = 0;

  var ICON = {
    play: 'M8 5v14l11-7z',
    pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
    replay: 'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z',
    vol: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
    mute: 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
    fs: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
    nofs: 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z',
    audio: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
    gear: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z'
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICON[name] + '"/></svg>'; }

  $('back10').innerHTML = svg('replay') + '<i>10</i>';
  $('fwd10').innerHTML = svg('replay') + '<i>10</i>';
  $('fs').innerHTML = svg('fs');
  function setPlayIcon() { $('play').innerHTML = svg(v.paused ? 'play' : 'pause'); $('play').setAttribute('aria-label', v.paused ? 'Play' : 'Pause'); }
  function setMuteIcon() { var m = v.muted || v.volume === 0; $('mute').innerHTML = svg(m ? 'mute' : 'vol'); vol.value = m ? 0 : v.volume; paint(vol, vol.value, 1); }
  setPlayIcon(); setMuteIcon();

  // ---------- helpers ----------
  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }
  function paint(el, val, max) { el.style.setProperty('--p', (max ? val / max * 100 : 0) + '%'); }
  function toast(t) { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.classList.remove('on'); }, 900); }
  function showError(html) {
    var d = document.createElement('div'); d.className = 'msg'; d.innerHTML = '<div>' + html + '</div>'; player.appendChild(d);
    spin.style.display = 'none';
  }
  function langName(code) {
    if (!code) return '';
    try { var n = new Intl.DisplayNames(['en'], { type: 'language' }).of(code); if (n && n.toLowerCase() !== code.toLowerCase()) return n; } catch (e) {}
    return code.toUpperCase();
  }
  function chLabel(c) { c = parseInt(c, 10); return c === 6 ? '5.1' : c === 8 ? '7.1' : c === 1 ? 'Mono' : c === 2 ? '' : c ? c + 'ch' : ''; }

  // ---------- controls visibility ----------
  function ctlVisible() { return !player.classList.contains('idle'); }
  function wake() {
    player.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (!v.paused && !anyMenuOpen()) player.classList.add('idle');
    }, 3500);
  }
  ['mousemove', 'touchstart', 'pointerdown'].forEach(function (e) { player.addEventListener(e, wake, { passive: true }); });

  // ---------- menus ----------
  var menus = [
    { btn: $('audioBtn'), menu: $('audioMenu') },
    { btn: $('qualBtn'), menu: $('qualMenu') }
  ];
  function anyMenuOpen() { return menus.some(function (m) { return !m.menu.hidden; }); }
  function closeMenus() { menus.forEach(function (m) { m.menu.hidden = true; m.btn.setAttribute('aria-expanded', 'false'); }); }
  function toggleMenu(m) {
    var open = m.menu.hidden;
    closeMenus();
    if (open) {
      m.menu.hidden = false; m.btn.setAttribute('aria-expanded', 'true');
      var sel = m.menu.querySelector('[aria-checked=true]') || m.menu.querySelector('button');
      if (sel) sel.focus();
    }
    wake();
  }
  menus.forEach(function (m) {
    m.btn.addEventListener('click', function (e) { e.stopPropagation(); toggleMenu(m); });
    m.menu.addEventListener('click', function (e) { e.stopPropagation(); });
    m.menu.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(m.menu.querySelectorAll('button')), i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); (items[i + 1] || items[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); (items[i - 1] || items[items.length - 1]).focus(); }
      else if (e.key === 'Escape' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); closeMenus(); m.btn.focus(); }
    });
  });
  document.addEventListener('click', closeMenus);

  function fillMenu(menu, title, items) {
    menu.textContent = '';
    var h = document.createElement('h4'); h.textContent = title; menu.appendChild(h);
    items.forEach(function (it) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', it.on ? 'true' : 'false');
      var s = document.createElement('span'); s.textContent = it.label;
      if (it.sub) { var sm = document.createElement('small'); sm.textContent = ' ' + it.sub; s.appendChild(sm); }
      b.appendChild(s);
      b.addEventListener('click', function () { it.pick(); closeMenus(); menus[title === 'Audio' ? 0 : 1].btn.focus(); });
      menu.appendChild(b);
    });
  }

  // ---------- quality ----------
  var autoLevel = true, manualLevel = -1;
  function levelLabel(l) { var s = Math.min(l.width || 99999, l.height || 99999); return (s && s < 99999 ? s : (l.height || '?')) + 'p'; }
  function buildQuality() {
    if (!hls) return;
    var levels = hls.levels.map(function (l, i) { return { i: i, l: l, s: Math.min(l.width || 1e5, l.height || 1e5), br: l.bitrate }; })
      .sort(function (a, b) { return b.s - a.s || b.br - a.br; });
    var items = [{
      label: 'Auto', sub: autoLevel && hls.currentLevel >= 0 ? '(' + levelLabel(hls.levels[hls.currentLevel]) + ')' : '', on: autoLevel,
      pick: function () { autoLevel = true; hls.currentLevel = -1; buildQuality(); toast('Quality: Auto'); }
    }];
    levels.forEach(function (o) {
      items.push({
        label: levelLabel(o.l), sub: Math.round(o.br / 1000) + ' kbps', on: !autoLevel && manualLevel === o.i,
        pick: function () { autoLevel = false; manualLevel = o.i; hls.currentLevel = o.i; buildQuality(); toast('Quality: ' + levelLabel(o.l)); }
      });
    });
    fillMenu($('qualMenu'), 'Quality', items);
    var shown = autoLevel ? 'Auto' + (hls.currentLevel >= 0 ? ' · ' + levelLabel(hls.levels[hls.currentLevel]) : '') : levelLabel(hls.levels[manualLevel] || hls.levels[0]);
    $('qualBtn').innerHTML = svg('gear') + '<span class="lbl">' + shown + '</span>';
    $('qualWrap').style.display = hls.levels.length > 1 ? '' : 'none';
    if (hls.levels.length <= 1) $('qualWrap').style.display = 'none';
  }

  // ---------- audio ----------
  function audioLabel(t) {
    var base = /^[A-Za-z]{2,3}( \d+)?$/.test(t.name || '') || !t.name ? langName(t.lang || (t.name || '').split(' ')[0]) : t.name;
    return { label: base || 'Track', sub: chLabel(t.channels || (t.attrs && t.attrs.CHANNELS)) };
  }
  function buildAudio() {
    if (!hls) return;
    var tracks = hls.audioTracks || [];
    $('audioWrap').style.display = tracks.length > 1 ? '' : 'none';
    if (tracks.length < 1) return;
    var items = tracks.map(function (t, i) {
      var l = audioLabel(t);
      return { label: l.label, sub: l.sub, on: hls.audioTrack === i, pick: function () { hls.audioTrack = i; setTimeout(buildAudio, 50); toast('Audio: ' + l.label); } };
    });
    fillMenu($('audioMenu'), 'Audio', items);
    var c = tracks[hls.audioTrack] || tracks[0];
    $('audioBtn').innerHTML = svg('audio') + '<span class="lbl">' + audioLabel(c).label + '</span>';
  }

  // ---------- playback buttons ----------
  function toggle() { if (v.paused) v.play().catch(function () {}); else v.pause(); }
  function skip(d) { if (isFinite(v.duration)) { v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + d)); toast((d > 0 ? '+' : '') + d + 's'); } }
  function setVol(x) { v.muted = false; v.volume = Math.max(0, Math.min(1, x)); try { localStorage.setItem('vol', v.volume); } catch (e) {} }
  $('play').addEventListener('click', toggle);
  $('back10').addEventListener('click', function () { skip(-10); });
  $('fwd10').addEventListener('click', function () { skip(10); });
  $('mute').addEventListener('click', function () { v.muted = !v.muted; });
  vol.addEventListener('input', function () { setVol(parseFloat(vol.value)); });
  try { var sv = parseFloat(localStorage.getItem('vol')); if (isFinite(sv)) v.volume = sv; } catch (e) {}

  function isFs() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function toggleFs() {
    if (isFs()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    var f = player.requestFullscreen || player.webkitRequestFullscreen;
    if (f) f.call(player); else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
  }
  $('fs').addEventListener('click', toggleFs);
  function fsIcon() { $('fs').innerHTML = svg(isFs() ? 'nofs' : 'fs'); }
  document.addEventListener('fullscreenchange', fsIcon); document.addEventListener('webkitfullscreenchange', fsIcon);

  // click on the picture: tap #1 shows controls (touch), then toggles play
  var wasIdle = false;
  v.addEventListener('pointerdown', function () { wasIdle = !ctlVisible(); });
  v.addEventListener('click', function (e) {
    closeMenus();
    if (wasIdle && e.pointerType === 'touch') { wake(); return; }
    toggle();
  });
  v.addEventListener('dblclick', function (e) {
    var r = v.getBoundingClientRect(), x = e.clientX - r.left;
    if (x < r.width * 0.33) skip(-10); else if (x > r.width * 0.66) skip(10); else toggleFs();
  });

  // ---------- seek bar ----------
  function updateTime() {
    if (dragging) return;
    var d = v.duration;
    cur.textContent = fmt(v.currentTime); dur.textContent = fmt(d);
    if (isFinite(d) && d > 0) { seek.value = v.currentTime / d * 1000; paint(seek, v.currentTime, d); }
  }
  seek.addEventListener('input', function () {
    dragging = true; var d = v.duration; if (!isFinite(d)) return;
    var t = seek.value / 1000 * d; cur.textContent = fmt(t); paint(seek, t, d);
  });
  seek.addEventListener('change', function () {
    var d = v.duration; if (isFinite(d)) v.currentTime = seek.value / 1000 * d; dragging = false;
  });
  seek.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); skip(-10); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); skip(10); }
    else if (e.key === 'Enter') { e.preventDefault(); toggle(); }
  });

  // ---------- video events ----------
  v.addEventListener('play', function () { setPlayIcon(); wake(); });
  v.addEventListener('pause', function () { setPlayIcon(); wake(); });
  v.addEventListener('volumechange', setMuteIcon);
  v.addEventListener('timeupdate', function () {
    updateTime();
    var n = Date.now(); if (n - saveT > 5000 && v.currentTime > 5) { saveT = n; try { localStorage.setItem('pos:' + movieId, Math.floor(v.currentTime)); } catch (e) {} }
  });
  v.addEventListener('durationchange', updateTime);
  v.addEventListener('waiting', function () { spin.style.display = ''; });
  ['playing', 'canplay', 'seeked'].forEach(function (e) { v.addEventListener(e, function () { spin.style.display = 'none'; }); });
  v.addEventListener('ended', function () { try { localStorage.removeItem('pos:' + movieId); } catch (e) {} player.classList.remove('idle'); });
  v.addEventListener('loadedmetadata', function () {
    try {
      var p = parseInt(localStorage.getItem('pos:' + movieId), 10);
      if (p > 10 && p < v.duration - 30) { v.currentTime = p; toast('Resumed at ' + fmt(p)); }
    } catch (e) {}
  });

  // ---------- keyboard / TV remote ----------
  function inControls() { var a = document.activeElement; return a && a.closest && a.closest('#bar'); }
  document.addEventListener('keydown', function (e) {
    var k = e.key, c = e.keyCode, wasHidden = !ctlVisible();
    if (anyMenuOpen() && k === 'Escape') { closeMenus(); return; }
    if (c === 10009 || c === 461 || k === 'GoBack' || k === 'BrowserBack') { location.href = '/'; return; }  // Samsung / LG remote "back"
    if (k === 'MediaPlayPause' || c === 415 || c === 19 || c === 179) { e.preventDefault(); toggle(); wake(); return; }
    if (k === 'MediaTrackNext' || c === 417) { skip(30); return; }
    if (k === 'MediaTrackPrevious' || c === 412) { skip(-30); return; }
    if (anyMenuOpen()) return;
    var onBtn = document.activeElement && document.activeElement.tagName === 'BUTTON' && inControls();
    switch (k) {
      case ' ': case 'k': case 'K':
        if (onBtn) return; e.preventDefault(); toggle(); wake(); return;
      case 'Enter':
        if (onBtn || (document.activeElement && document.activeElement.tagName === 'A')) return;
        e.preventDefault(); toggle(); wake(); return;
      case 'ArrowLeft': case 'j': case 'J':
        if (inControls() && k === 'ArrowLeft') return; e.preventDefault(); skip(-10); wake(); return;
      case 'ArrowRight': case 'l': case 'L':
        if (inControls() && k === 'ArrowRight') return; e.preventDefault(); skip(10); wake(); return;
      case 'ArrowUp':
        if (inControls()) return; e.preventDefault(); setVol(v.volume + 0.1); toast('Volume ' + Math.round(v.volume * 100) + '%'); wake(); return;
      case 'ArrowDown':
        if (inControls()) return; e.preventDefault(); setVol(v.volume - 0.1); toast('Volume ' + Math.round(v.volume * 100) + '%'); wake(); return;
      case 'f': case 'F': toggleFs(); return;
      case 'm': case 'M': v.muted = !v.muted; return;
    }
    // first key press while controls were hidden: show them with focus ready for the D-pad
    if (wasHidden) { wake(); if (!inControls()) seek.focus({ preventScroll: true }); }
  });

  // ---------- start ----------
  function startHls(src) {
    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 40, enableWorker: true, startLevel: -1, capLevelToPlayerSize: false });
      var netRetry = 0, mediaRetry = 0;
      hls.on(Hls.Events.MANIFEST_PARSED, function () { buildQuality(); buildAudio(); var p = v.play(); if (p && p.catch) p.catch(function () { spin.style.display = 'none'; setPlayIcon(); }); });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, buildAudio);
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, buildAudio);
      hls.on(Hls.Events.LEVEL_SWITCHED, function () { if (autoLevel) buildQuality(); });
      hls.on(Hls.Events.ERROR, function (_, d) {
        if (!d.fatal) return;
        var code = d.response && d.response.code;
        if (code === 401 || code === 403) { showError('Your session expired. <a href="">Reload</a> to continue.'); return; }
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR && netRetry++ < 4) { setTimeout(function () { hls.startLoad(); }, 1200); return; }
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetry++ < 3) { hls.recoverMediaError(); return; }
        hls.destroy(); showError('This video could not be played. <a href="">Try again</a>');
      });
      hls.loadSource(src); hls.attachMedia(v);
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      // iPhone / old Safari: system player (it has its own audio menu; quality is automatic)
      native = true; v.controls = true; v.src = src;
      $('bar').style.display = 'none';
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    } else {
      showError('This browser cannot play this video. Try Chrome, Edge, Firefox or Safari.');
    }
  }

  fetch('/api/play?id=' + encodeURIComponent(movieId), { credentials: 'same-origin' })
    .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Error'); return j; }); })
    .then(function (m) {
      $('title').textContent = m.name; document.title = m.name;
      startHls(m.src); wake();
      $('play').focus({ preventScroll: true });
    })
    .catch(function (e) {
      $('title').textContent = 'Not available';
      showError(String(e.message || 'Movie not found') + '<br><br><a href="/">Back to movies</a>');
    });
})();
