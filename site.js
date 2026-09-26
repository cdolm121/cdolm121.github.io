'use strict';
(function () {
  const link = document.getElementById('control-link');
  const hint = document.getElementById('hint');
  const SOURCES = [
    './config.js',
    'https://cdn.jsdelivr.net/gh/cdolm121/cdolm121.github.io@main/config.js',
    'https://raw.githubusercontent.com/cdolm121/cdolm121.github.io/main/config.js',
  ];

  function validControl(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('Invalid control URL');
    }
    return url.href.replace(/\/$/, '');
  }

  function apply(href) {
    link.href = href;
    link.setAttribute('aria-disabled', 'false');
    link.textContent = '打开控制台 ↗';
    link.rel = 'noopener noreferrer';
    hint.textContent = '进入后使用远程访问口令登录。';
  }

  function parseConfig(text) {
    const urlMatch = text.match(/"controlUrl"\s*:\s*"([^"]+)"/);
    if (!urlMatch) throw new Error('missing controlUrl');
    const updatedMatch = text.match(/"updatedAt"\s*:\s*(\d+)/);
    return {
      href: validControl(urlMatch[1]),
      updatedAt: updatedMatch ? Number(updatedMatch[1]) : 0,
    };
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const marker = '__publicSiteProbe_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = function () {
        try {
          if (!window.PUBLIC_SITE || !window.PUBLIC_SITE.controlUrl) throw new Error('empty');
          resolve({
            href: validControl(window.PUBLIC_SITE.controlUrl),
            updatedAt: Number(window.PUBLIC_SITE.updatedAt || 0),
          });
        } catch (error) {
          reject(error);
        } finally {
          script.remove();
        }
      };
      script.onerror = function () {
        script.remove();
        reject(new Error('load failed'));
      };
      document.head.appendChild(script);
    });
  }

  async function fetchConfig(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error('http ' + response.status);
    return parseConfig(await response.text());
  }

  async function loadLatest() {
    const bust = Date.now();
    const jobs = SOURCES.map(function (base) {
      const url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 't=' + bust;
      if (base.indexOf('://') === -1) {
        // Same-origin: script tag is enough and avoids MIME quirks.
        return loadScript(url);
      }
      return fetchConfig(url).catch(function () { return loadScript(url); });
    });
    if (window.PUBLIC_SITE && window.PUBLIC_SITE.controlUrl) {
      jobs.push(Promise.resolve({
        href: validControl(window.PUBLIC_SITE.controlUrl),
        updatedAt: Number(window.PUBLIC_SITE.updatedAt || 0),
      }));
    }
    const results = await Promise.allSettled(jobs);
    let best = null;
    results.forEach(function (result) {
      if (result.status !== 'fulfilled') return;
      if (!best || result.value.updatedAt >= best.updatedAt) best = result.value;
    });
    if (!best) throw new Error('unavailable');
    apply(best.href);
    return best.href;
  }

  async function refresh(showWait) {
    if (showWait) hint.textContent = '正在获取最新控制地址…';
    try {
      await loadLatest();
      return true;
    } catch (_) {
      if (showWait) hint.textContent = '控制地址更新中，正在自动重试…';
      return false;
    }
  }

  refresh(true).then(function (ok) {
    if (!ok) {
      let tries = 0;
      const timer = setInterval(function () {
        tries += 1;
        refresh(tries < 3).then(function (done) {
          if (done || tries >= 24) clearInterval(timer);
        });
      }, 3000);
    }
  });
  setInterval(function () { refresh(false); }, 15000);
})();
