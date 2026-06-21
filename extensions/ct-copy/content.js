(function () {
  'use strict';

  function injectMainWorldScript() {
    var s = document.createElement('script');
    s.textContent = '(' + function() {
      var origPD = Event.prototype.preventDefault;
      Event.prototype.preventDefault = function() {
        if (this.type === 'copy' || this.type === 'cut') return;
        return origPD.call(this);
      };
      try {
        Object.defineProperty(ClipboardEvent.prototype, 'clipboardData', {
          get: function() {
            var old;
            try { old = DataTransfer.prototype; } catch(e) { old = null; }
            var self = this;
            return {
              setData: function(f, d) { if (old && old.setData) old.setData.call(self, f, d); },
              getData: function(f) { return old && old.getData ? old.getData.call(self, f) : ''; },
              clearData: function() {},
              get items() { return old && old.items || []; },
              get types() { return old && old.types || []; },
              get files() { return old && old.files || []; }
            };
          },
          configurable: true
        });
      } catch(e) {}
    } + ')();';
    document.documentElement.appendChild(s);
    s.remove();
  }

  function unblockIframe() {
    var iframe = document.getElementById('course-iframe');
    if (!iframe) return false;
    var doc = iframe.contentDocument;
    if (!doc) return false;

    var killAttrs = ['oncopy', 'oncut', 'onselectstart', 'oncontextmenu'];
    doc.querySelectorAll('*').forEach(function(el) {
      killAttrs.forEach(function(a) { el.removeAttribute(a); });
      el.removeAttribute('unselectable');
      try { el.style.setProperty('user-select', 'text', 'important'); } catch(ex) {}
      try { el.style.setProperty('-webkit-user-select', 'text', 'important'); } catch(ex) {}
    });

    var props = ['oncopy','oncut','onselectstart','oncontextmenu'];
    props.forEach(function(p) { doc[p] = null; if (doc.defaultView) doc.defaultView[p] = null; });

    if (doc.body) {
      doc.body.style.setProperty('user-select', 'text', 'important');
      doc.body.style.setProperty('-webkit-user-select', 'text', 'important');
    }
    if (doc.documentElement) {
      doc.documentElement.style.setProperty('user-select', 'text', 'important');
      doc.documentElement.style.setProperty('-webkit-user-select', 'text', 'important');
    }

    var win = doc.defaultView;
    ['copy','cut','selectstart','contextmenu'].forEach(function(ev) {
      try { win.addEventListener(ev, function(e) { e.stopPropagation(); }, true); } catch(ex) {}
      try { doc.addEventListener(ev, function(e) { e.stopPropagation(); }, true); } catch(ex) {}
    });

    return true;
  }

  function copyEditorText() {
    var iframe = document.getElementById('course-iframe');
    if (!iframe) { showToast('No iframe found', true); return; }
    var doc = iframe.contentDocument;
    if (!doc) { showToast('No iframe document', true); setTimeout(function(){ location.reload(); }, 2000); return; }
    var el = doc.querySelector('[contenteditable]');
    if (!el) { showToast('No editor found', true); return; }

    el.style.setProperty('user-select', 'text', 'important');
    el.style.setProperty('-webkit-user-select', 'text', 'important');
    el.removeAttribute('unselectable');
    el.setAttribute('contenteditable', 'true');

    var text = (el.innerText || el.textContent || '').trim();
    if (!text) { showToast('Code is empty', true); return; }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
    showToast('Copied!');
  }

  function fallbackCopy(t) {
    var ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); ta.remove();
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
    var existing = document.getElementById('__ct_toast');
    if (existing) existing.remove();
    var d = document.createElement('div');
    d.id = '__ct_toast';
    d.textContent = msg;
    d.style.cssText = 'position:fixed;bottom:30px;right:30px;padding:14px 28px;background:'+(err?'#e74c3c':'#2d2d2d')+';color:#fff;border-radius:8px;z-index:9999999;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:450px';
    document.body.appendChild(d);
    setTimeout(function(){ d.style.opacity='0'; setTimeout(function(){ d.remove(); }, 400); }, 4000);
  }

  function addFloatingButton() {
    if (!window.location.href.includes('codetantra.com') || document.getElementById('__ct_btn')) return;
    var btn = document.createElement('div');
    btn.id = '__ct_btn';
    btn.textContent = 'COPY';
    btn.title = 'Copy code from editor';
    btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999998;background:#d200ff;color:#fff;border-radius:8px;font-weight:600;font-family:system-ui,sans-serif;cursor:grab;box-shadow:0 4px 16px rgba(0,0,0,0.25);border:1px solid #e066ff;user-select:none;padding:10px 20px;font-size:14px';
    btn.onmouseover = function(){ btn.style.background = '#e066ff'; };
    btn.onmouseout = function(){ btn.style.background = '#d200ff'; };
    makeDraggable(btn, function() {
      injectMainWorldScript();
      unblockIframe();
      copyEditorText();
    });
    document.body.appendChild(btn);
  }

  addFloatingButton();
  setInterval(addFloatingButton, 2000);
})();
