const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'src', 'index.dev.js');
const outPath = path.join(__dirname, '..', 'index.js');

const rawCode = fs.readFileSync(srcPath, 'utf8');

// Anti-inspection deterrence shield
const antiInspectShield = `
(function () {
  'use strict';
  // Disable right-click context menu
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    return false;
  }, { capture: true });

  // Disable DevTools shortcuts
  document.addEventListener('keydown', function (e) {
    // F12
    if (e.keyCode === 123 || e.key === 'F12') {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Ctrl+Shift+I / J / C
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67 || e.key === 'I' || e.key === 'J' || e.key === 'C')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Ctrl+U (View source) or Ctrl+S (Save page)
    if ((e.ctrlKey || e.metaKey) && (e.keyCode === 85 || e.keyCode === 83 || e.key === 'u' || e.key === 's')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, { capture: true });

  // Silence console introspection
  try {
    const _c = window.console;
    if (_c) {
      const _empty = function () {};
      ['log', 'warn', 'info', 'error', 'debug', 'dir', 'table', 'trace', 'time', 'timeEnd'].forEach(function (m) {
        try { _c[m] = _empty; } catch (_) {}
      });
    }
  } catch (_) {}

  // Anti-debugging trap: triggers if DevTools is opened
  (function antiDebug() {
    try {
      (function () { return false; })['constructor']('debugger')();
    } catch (_) {}
    setTimeout(antiDebug, 1000);
  })();
})();
`;

// Combine shield and application code
const combinedSource = antiInspectShield + '\n' + rawCode;

// Robust Multi-Stage JavaScript Obfuscation & Packing Engine
function obfuscateAndPack(source) {
  const utf8Bytes = Buffer.from(source, 'utf8');
  
  // Custom XOR cipher mapping
  const xorKey = 0x5A;
  const scrambled = [];
  for (let i = 0; i < utf8Bytes.length; i++) {
    scrambled.push((utf8Bytes[i] ^ xorKey).toString(16).padStart(2, '0'));
  }
  const hexBlob = scrambled.join('');

  // Break hex blob into chunks
  const chunkSize = 240;
  const chunks = [];
  for (let i = 0; i < hexBlob.length; i += chunkSize) {
    chunks.push(hexBlob.slice(i, i + chunkSize));
  }

  // Obfuscated runtime unpacker
  const obfuscatedCode = `/**
 * GymPulse Engine v2.4 - Confidential & Proprietary
 * All Rights Reserved (c) 2026. Unauthorized inspection or reverse engineering prohibited.
 */
(function(_0x1a8f, _0x4e2b) {
  var _0x9c3d = [${chunks.map(c => JSON.stringify(c)).join(',')}];
  var _0x51ef = function() {
    try {
      var _0x3b1a = _0x9c3d.join('');
      var _0xlen = _0x3b1a.length / 2;
      var _0xbytes = new Uint8Array(_0xlen);
      for (var _0xi = 0; _0xi < _0xlen; _0xi++) {
        _0xbytes[_0xi] = parseInt(_0x3b1a.substr(_0xi * 2, 2), 16) ^ 0x5A;
      }
      var _0xdec = typeof TextDecoder !== 'undefined'
        ? new TextDecoder('utf-8').decode(_0xbytes)
        : decodeURIComponent(escape(String.fromCharCode.apply(null, _0xbytes)));
      (new Function(_0xdec))();
    } catch (_0xerr) {}
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _0x51ef);
  } else {
    _0x51ef();
  }
})(window, document);
`;

  return obfuscatedCode;
}

const protectedCode = obfuscateAndPack(combinedSource);
fs.writeFileSync(outPath, protectedCode, 'utf8');
console.log(`Protected index.js successfully generated (${protectedCode.length} bytes).`);
