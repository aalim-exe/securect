// CT Paste - replaces selected text in editor with clipboard code
(function () {
  'use strict';

  var savedRange = null;

  function injectMainWorldScript() {
    var s = document.createElement('script');
    s.textContent = '(' + function() {
      var origPD = Event.prototype.preventDefault;
      Event.prototype.preventDefault = function() {
        if (this.type === 'paste') return;
        return origPD.call(this);
      };
    } + ')();';
    document.documentElement.appendChild(s);
    s.remove();
  }

  function saveSelection() {
    savedRange = null;
    var iframe = document.getElementById('course-iframe');
    if (!iframe) return;
    var doc = iframe.contentDocument;
    if (!doc) return;
    var sel = doc.defaultView.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  function getEditor() {
    var iframe = document.getElementById('course-iframe');
    if (!iframe) return null;
    var doc = iframe.contentDocument;
    if (!doc) return null;
    return doc.querySelector('[contenteditable]') || null;
  }

  function replaceSelectedText(editor, code) {
    var doc = editor.ownerDocument;

    if (!savedRange) {
      showToast('No text selected - drag to highlight first', true);
      return;
    }

    editor.focus();

    var sel = doc.defaultView.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);

    var range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(doc.createTextNode(code));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

    editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setupPasteShortcut() {
    injectMainWorldScript();

    var iframe = document.getElementById('course-iframe');
    if (!iframe) return;
    var doc = iframe.contentDocument;
    if (!doc) return;

    doc.querySelectorAll('*').forEach(function(el) {
      el.removeAttribute('onpaste');
      el.removeAttribute('onkeydown');
    });

    var props = ['onpaste', 'onkeydown'];
    props.forEach(function(p) { doc[p] = null; if (doc.defaultView) doc.defaultView[p] = null; });

    ['paste', 'keydown'].forEach(function(ev) {
      try { doc.addEventListener(ev, function(e) { e.stopPropagation(); }, true); } catch(ex) {}
      if (doc.defaultView) try { doc.defaultView.addEventListener(ev, function(e) { e.stopPropagation(); }, true); } catch(ex) {}
    });
  }

  function pasteFromClipboard() {
    setupPasteShortcut();

    var editor = getEditor();
    if (!editor) {
      showToast('Editor not found', true);
      return;
    }

    // Try clipboard API
    try {
      navigator.clipboard.readText().then(function(code) {
        if (code) {
          replaceSelectedText(editor, code);
          showToast('Pasted ' + code.length + ' chars \u2713 Ctrl+V now enabled too');
        } else {
          showToast('Clipboard is empty', true);
        }
      }).catch(function() {
        showManualPasteOverlay(editor);
      });
    } catch(e) {
      showManualPasteOverlay(editor);
    }
  }

  function showManualPasteOverlay(editor) {
    if (document.getElementById('__ct_paste_overlay')) return;

    var overlay = document.createElement('div');
    overlay.id = '__ct_paste_overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999999;display:flex;align-items:center;justify-content:center';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;padding:24px;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,0.3);max-width:600px;width:90%';

    var label = document.createElement('div');
    label.textContent = 'Press Ctrl+V to paste your code below:';
    label.style.cssText = 'font:600 14px/1.4 system-ui,sans-serif;color:#333;margin-bottom:12px';

    var textarea = document.createElement('textarea');
    textarea.style.cssText = 'width:100%;height:200px;padding:12px;border:2px solid #ddd;border-radius:8px;font:13px/1.5 monospace;resize:vertical;outline:none';
    textarea.placeholder = 'Ctrl+V here...';

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:12px;justify-content:flex-end';

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:8px 20px;border:1px solid #ccc;border-radius:6px;background:#f5f5f5;cursor:pointer;font:14px system-ui,sans-serif';
    cancelBtn.onclick = function() { overlay.remove(); };

    var injectBtn = document.createElement('button');
    injectBtn.textContent = 'Replace Selection';
    injectBtn.style.cssText = 'padding:8px 20px;border:none;border-radius:6px;background:#1a6b3c;color:#fff;cursor:pointer;font:14px system-ui,sans-serif;font-weight:600';
    injectBtn.onclick = function() {
      var code = textarea.value;
      if (code) {
        replaceSelectedText(editor, code);
        overlay.remove();
        showToast('Pasted ' + code.length + ' chars ✓');
      } else {
        showToast('Nothing to paste', true);
      }
    };

    textarea.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        injectBtn.click();
      }
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(injectBtn);
    box.appendChild(label);
    box.appendChild(textarea);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    textarea.focus();
  }

  function makeDraggable(btn, clickHandler) {
    var drag = false, wasDrag = false, sx, sy, ox, oy, ifr;
    btn.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      var r = btn.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY;
      ox = r.left; oy = r.top;
      drag = false; wasDrag = false;
    });
    window.addEventListener('mousemove', function(e) {
      if (sx === undefined) return;
      if (!drag && (Math.abs(e.clientX - sx) > 5 || Math.abs(e.clientY - sy) > 5)) {
        drag = true;
        ifr = document.getElementById('course-iframe');
        if (ifr) ifr.style.pointerEvents = 'none';
        btn.style.left = ox + 'px';
        btn.style.top = oy + 'px';
        btn.style.bottom = 'auto';
        btn.style.right = 'auto';
        btn.style.cursor = 'grabbing';
      }
      if (drag) {
        btn.style.left = (ox + e.clientX - sx) + 'px';
        btn.style.top = (oy + e.clientY - sy) + 'px';
      }
    });
    window.addEventListener('mouseup', function() {
      if (drag) wasDrag = true;
      if (ifr) { ifr.style.pointerEvents = ''; ifr = null; }
      sx = undefined;
    });
    btn.addEventListener('click', function(e) {
      if (wasDrag) {
        e.stopPropagation();
        drag = false; wasDrag = false;
        btn.style.cursor = 'grab';
        return;
      }
      if (clickHandler) clickHandler(e);
    });
  }

  function showToast(msg, err) {
    var existing = document.getElementById('__ct_paste_toast');
    if (existing) existing.remove();
    var d = document.createElement('div');
    d.id = '__ct_paste_toast';
    d.textContent = msg;
    d.style.cssText = 'position:fixed;bottom:30px;right:30px;padding:14px 28px;background:'+(err?'#e74c3c':'#2d2d2d')+';color:#fff;border-radius:8px;z-index:9999999;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:450px';
    document.body.appendChild(d);
    setTimeout(function(){ d.style.opacity='0'; setTimeout(function(){ d.remove(); }, 400); }, 4000);
  }

  function applyBtnSize(btn, size) {
    var pad = Math.round(size * 0.7);
    btn.style.fontSize = size + 'px';
    btn.style.padding = pad + 'px ' + (pad * 2) + 'px';
  }

  function addFloatingButton() {
    if (!window.location.href.includes('codetantra.com') || document.getElementById('__ct_paste_btn')) return;
    var btn = document.createElement('div');
    btn.id = '__ct_paste_btn';
    btn.textContent = 'PASTE';
    btn.title = 'Replace selected text with clipboard content';
    btn.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:9999998;background:#4cbe00;color:#fff;border-radius:8px;font-weight:600;font-family:system-ui,sans-serif;cursor:grab;box-shadow:0 4px 16px rgba(0,0,0,0.25);border:1px solid #6ee82e;user-select:none;transform:translateZ(0)';
    btn.onmouseover = function(){ btn.style.background = '#6ee82e'; };
    btn.onmouseout = function(){ btn.style.background = '#4cbe00'; };
    btn.onmousedown = function(e) { e.preventDefault(); e.stopPropagation(); saveSelection(); };
    makeDraggable(btn, function() { pasteFromClipboard(); });
    document.body.appendChild(btn);
    try { chrome.storage.sync.get('buttonSize', function(d) { applyBtnSize(btn, d.buttonSize || 14); }); } catch(e) { applyBtnSize(btn, 14); }
  }

  addFloatingButton();
  setInterval(addFloatingButton, 2000);

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg.action === 'unblock_paste') pasteFromClipboard();
  });
})();
