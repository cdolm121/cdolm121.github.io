'use strict';
const link=document.getElementById('control-link');
try{const url=new URL(window.PUBLIC_SITE.controlUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Invalid control URL');link.href=url.href;link.setAttribute('aria-disabled','false');link.textContent='打开控制台 ↗';link.rel='noopener noreferrer';document.getElementById('hint').textContent='进入后使用远程访问口令登录。';}catch(_){link.removeAttribute('href');}
