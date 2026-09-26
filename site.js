'use strict';
(function () {
  const link = document.getElementById('control-link');
  const hint = document.getElementById('hint');
  const RAW = 'https://raw.githubusercontent.com/cdolm121/cdolm121.github.io/main/config.js';

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
    const match = text.match(/"controlUrl"\s*:\s*"([^"]+)"/);
    if (!match) throw new Error('missing controlUrl');
    return validControl(match[1]);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const previous = window.PUBLIC_SITE;
      window.PUBLIC_SITE = undefined;
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = function () {
        try {
          if (!window.PUBLIC_SITE || !window.PUBLIC_SITE.controlUrl) throw new Error('empty');
          resolve(validControl(window.PUBLIC_SITE.controlUrl));
        } catch (error) {
          reject(error);
        } finally {
          script.remove();
          if (previous) window.PUBLIC_SITE = previous;
        }
      };
      script.onerror = function () {
        script.remove();
        if (previous) window.PUBLIC_SITE = previous;
        reject(new Error('load failed'));
      };
      document.head.appendChild(script);
    });
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error('http ' + response.status);
    return response.text();
  }

  async function loadLatest() {
    const bust = Date.now();
    const errors = [];
    // Prefer raw GitHub (usually fresher than Pages CDN), then local Pages file.
    const attempts = [
      function () { return fetchText(RAW + '?t=' + bust).then(parseConfig); },
      function () { return loadScript('./config.js?t=' + bust); },
      function () {
        if (window.PUBLIC_SITE && window.PUBLIC_SITE.controlUrl) {
          return Promise.resolve(validControl(window.PUBLIC_SITE.controlUrl));
        }
        return Promise.reject(new Error('no embedded config'));
      },
    ];
    for (let i = 0; i < attempts.length; i++) {
      try {
        const href = await attempts[i]();
        apply(href);
        return href;
      } catch (error) {
        errors.push(error);
      }
    }
    throw errors[errors.length - 1] || new Error('unavailable');
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
      }, 4000);
    }
  });
  // Keep beating CDN lag after Pinggy rotates.
  setInterval(function () { refresh(false); }, 20000);
})();
