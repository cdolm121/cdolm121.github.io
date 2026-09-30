'use strict';
(function () {
  const link = document.getElementById('control-link');
  const hint = document.getElementById('hint');
  const REPO = 'cdolm121/cdolm121.github.io';
  // Pages and raw.githubusercontent are CDN-cached for minutes; the contents API is
  // current within seconds of a push but allows only 60 requests/hour per IP.
  const CACHED_SOURCES = ['./config.js', 'https://raw.githubusercontent.com/' + REPO + '/main/config.js'];
  const API_SOURCE = 'https://api.github.com/repos/' + REPO + '/contents/config.js?ref=main';
  const API_MIN_GAP = 20000;
  const STORE = 'publicSite.latest';
  const params = new URLSearchParams(location.search);
  const goMode = params.get('go') === '1';
  const deadHost = (params.get('from') || '').toLowerCase();
  let best = null, lastFresh = 0, redirecting = false;

  function validControl(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('Invalid control URL');
    }
    return url.href.replace(/\/$/, '');
  }

  function parseConfig(text) {
    const offline = /"offline"\s*:\s*true/.test(text);
    const urlMatch = text.match(/"controlUrl"\s*:\s*"([^"]*)"/);
    if (!urlMatch) throw new Error('missing controlUrl');
    const updatedMatch = text.match(/"updatedAt"\s*:\s*(\d+)/);
    const updatedAt = updatedMatch ? Number(updatedMatch[1]) : 0;
    if (!urlMatch[1]) {
      if (offline) return { href: '', offline: true, updatedAt: updatedAt };
      throw new Error('missing controlUrl');
    }
    return { href: validControl(urlMatch[1]), offline: false, updatedAt: updatedAt };
  }

  function remember(candidate) {
    if (!candidate || (best && candidate.updatedAt < best.updatedAt)) return;
    best = candidate;
    try { localStorage.setItem(STORE, JSON.stringify(best)); } catch (_) {}
    if (best.offline) {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.textContent = '暂时离线';
      hint.textContent = '控制台暂时离线，Mac 正在自动恢复连接，稍后刷新即可。';
      return;
    }
    link.href = best.href;
    link.setAttribute('aria-disabled', 'false');
    link.textContent = '打开控制台 ↗';
    link.rel = 'noopener noreferrer';
    if (!goMode) hint.textContent = '进入后使用远程访问口令登录。';
  }

  function withBust(url) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
  }

  async function fetchText(url, headers) {
    const response = await fetch(withBust(url), {
      cache: 'no-store', credentials: 'omit', headers: headers || {}, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('http ' + response.status);
    return response.text();
  }

  function apiAllowed() {
    let last = 0;
    try { last = Number(localStorage.getItem(STORE + '.api') || 0); } catch (_) {}
    if (Date.now() - last < API_MIN_GAP) return false;
    try { localStorage.setItem(STORE + '.api', String(Date.now())); } catch (_) {}
    return true;
  }

  async function loadLatest(useApi) {
    const jobs = CACHED_SOURCES.map(function (url) { return fetchText(url).then(parseConfig); });
    if (useApi && apiAllowed()) {
      jobs.push(fetchText(API_SOURCE, { Accept: 'application/vnd.github.raw' }).then(parseConfig));
    }
    const results = await Promise.allSettled(jobs);
    let found = false;
    results.forEach(function (result) {
      if (result.status === 'fulfilled') { remember(result.value); found = true; }
    });
    if (!found) throw new Error('unavailable');
    lastFresh = Date.now();
  }

  function isDead(href) {
    try { return Boolean(deadHost) && new URL(href).host.toLowerCase() === deadHost; } catch (_) { return true; }
  }

  function maybeRedirect() {
    if (!goMode || redirecting || !best) return;
    if (best.offline) {
      hint.textContent = '控制台暂时离线，恢复后自动进入…';
      return;
    }
    if (isDead(best.href)) {
      hint.textContent = '控制地址正在更换，稍后自动进入…';
      return;
    }
    redirecting = true;
    hint.textContent = '正在进入最新控制地址…';
    location.replace(best.href + '/');
  }

  async function refresh(useApi) {
    try { await loadLatest(useApi); } catch (_) {
      if (!best) hint.textContent = '控制地址获取中，正在自动重试…';
    }
    maybeRedirect();
  }

  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && saved.href) remember({ href: validControl(saved.href), updatedAt: Number(saved.updatedAt || 0) });
  } catch (_) {}
  if (goMode) hint.textContent = '正在查找最新控制地址…';

  // A click always goes to the address confirmed within the last half minute.
  link.addEventListener('click', function (event) {
    if (best && best.offline) {
      event.preventDefault();
      hint.textContent = '控制台暂时离线，正在确认恢复状态…';
      refresh(true);
      return;
    }
    if (Date.now() - lastFresh < 30000 && best) return;
    event.preventDefault();
    hint.textContent = '正在确认最新地址…';
    refresh(true).then(function () { if (best && !best.offline) location.href = best.href + '/'; });
  });

  refresh(true);
  setInterval(function () { refresh(goMode); }, goMode ? 5000 : 15000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(true); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) refresh(true); });
})();
