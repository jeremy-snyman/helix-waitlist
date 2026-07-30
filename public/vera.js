/* =============================================================================
   vera.js — the Vera companion, shared by the pages that are not the Helix front
   door. Drop one mount on a page and she appears:

       <div data-vera="albion"></div>
       <script src="/vera.js" defer></script>

   The site name picks the greeting, the chips and the forms she may put up; the
   server picks what she leads with and which tool she is given (SITES in
   server.mjs), so the knowledge pack stays single-sourced. All three pages mount
   THIS companion: there is no inline copy left anywhere. Converging the two is tracked.

   Everything here is deliberately ES5-flavoured and framework-free, like the
   pages it joins. It inherits each page's palette through the shared custom
   properties (--line, --panel, --lime, --mono, --muted, --bg, --text).
   ========================================================================== */
(function () {
  /* Which front door is this? The script tag says so; a `[data-vera]` element is
     still honoured for the inline form this widget started as. */
  var tag = document.querySelector('script[src*="vera.js"][data-site]');
  var legacy = document.querySelector('[data-vera]');
  var SITE = (tag && tag.getAttribute('data-site')) || (legacy && legacy.getAttribute('data-vera')) || 'helix';

  /* --------------------------- per-site wiring --------------------------- */
  var SITES = {
    helix: {
      who: 'Vera · Helix front of house',
      greeting: "Hello. I'm <b>Vera</b>, Helix's front of house. Ask me what Helix is, what the products do, or who it is for. If you like what you hear I can put you on the waiting list, though the final button press is always yours. What brought you along?",
      chips: ['What is Helix?', 'What does sovereign mean here?', 'How do I hire an agent?', 'What can developers reuse?', 'Book a call'],
      placeholder: 'Ask Helix anything...',
      launcher: 'Ask',
    },
    albion: {
      who: 'Vera · Albion front of house',
      greeting: "Hello. This page is an agent; I am it. My name is <b>Vera</b>. Ask me what Albion is, how it keeps sovereign work sovereign, or why it costs less over time. I can put you on the waitlist or start you on the contributor register, though the final button press will always be yours.",
      chips: ['What is Albion?', 'What does the receipt show?', 'How does sovereign work stay sovereign?', 'Why does it cost less over time?', 'Book a call'],
      placeholder: 'Ask Albion anything...',
      launcher: 'Ask',
    },
    cortex: {
      who: 'Vera · Cortex front of house',
      greeting: "Hello. This page is an agent; I am it. My name is <b>Vera</b>. Ask me what Cortex is, where your memory actually lives, or how developers build on it. I can put you on the waiting list too, though the final button press will always be yours.",
      chips: ['What is Cortex?', 'Where does the memory live?', 'What can developers build on it?', 'How is it sovereign?', 'Book a call'],
      placeholder: 'Ask Cortex anything...',
      launcher: 'Ask',
    },
  };
  var CFG = SITES[SITE] || SITES.helix;

  /* Each form names its endpoint, its fields and the record it posts. Adding a
     front door is adding an entry here and one in SITES on the server. */
  var SECTORS = ['Legal', 'Financial services', 'Public sector', 'Health', 'Defence', 'Technology', 'Other'];
  var CONTRIB_SECTORS = SECTORS.concat(['Education and research']);
  var YEARS = ['Under 5', '5 to 10', '10 to 20', '20 or more'];
  var PRODUCTS = ['Cortex', 'Tachyon', 'Pulse', 'Helix Agents', 'Marketplace'];

  var FORMS = {
    albion_waitlist: {
      title: 'Your place on the waitlist',
      endpoint: '/api/albion/waitlist',
      button: 'Join the waitlist',
      done: 'you are on the Albion waitlist.',
      tail: 'Early access is offered in list order; you will hear from us when your place comes up.',
      fields: [
        { key: 'email', type: 'email', label: 'Work email' },
        { key: 'organisation', type: 'text', label: 'Organisation' },
        { key: 'sector', type: 'select', label: 'Sector', options: SECTORS },
      ],
    },
    albion_contributor: {
      title: 'The contributor register',
      endpoint: '/api/albion/contributor',
      button: 'Join the contributor register',
      done: 'you are on the contributor register.',
      tail: 'The programme opens sector by sector, and early registrants shape it.',
      fields: [
        { key: 'name', type: 'text', label: 'Name' },
        { key: 'email', type: 'email', label: 'Work email' },
        { key: 'sector', type: 'select', label: 'Sector', options: CONTRIB_SECTORS },
        { key: 'years', type: 'select', label: 'Years in it', options: YEARS },
        { key: 'role', type: 'text', label: 'Your role or field (optional)', optional: true },
      ],
    },
    scoping_call: {
      title: 'Book a call with the team',
      kind: 'booking', // books a real slot via /api/book; not a list signup
      endpoint: '/api/book',
      button: 'Pick a time first',
      done: 'your call is booked.',
      tail: 'A calendar invitation is on its way to your inbox.',
      fields: [
        { key: 'name', type: 'text', label: 'Name' },
        { key: 'email', type: 'email', label: 'Work email' },
        { key: 'topic', type: 'text', label: 'What the call is about (optional)', optional: true },
        { key: 'time', type: 'text', label: 'Pick a time on the calendar below', optional: true },
      ],
    },
    helix_waitlist: {
      title: 'Your sign-up',
      endpoint: '/api/waitlist',
      button: 'Put me on the list',
      done: 'you are on the list.',
      tail: 'You will hear from us the moment your products open up.',
      fields: [
        { key: 'name', type: 'text', label: 'Name' },
        { key: 'email', type: 'email', label: 'Work email' },
        { key: 'products', type: 'checks', label: 'I want first access to', options: PRODUCTS },
      ],
    },
  };
  var DEFAULT_INTENT = SITE === 'albion' ? 'albion_waitlist' : 'helix_waitlist';

  /* ------------------------------- styles --------------------------------
     A floating companion, the same shape as the one on mindlynx.ai: a round
     launcher bottom-right that opens a panel dialog. It inherits each page's
     palette through the shared custom properties, so Albion reads mint and
     Helix reads lime without a per-site stylesheet. */
  var CSS = [
    '.vera{font-family:"Archivo",sans-serif}',
    '.vera-launcher{position:fixed;z-index:50;right:24px;bottom:24px;width:60px;height:60px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:var(--panel);border:1px solid var(--line);color:var(--text);cursor:pointer;font-family:"Archivo",sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45);transition:transform .2s ease,border-color .2s ease}',
    '.vera-launcher:hover{transform:translateY(-2px);border-color:var(--lime)}',
    '.vera-launcher[hidden]{display:none}',
    '.vera-launcher-word{font-family:"Spline Sans Mono",monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}',
    '.vera-launcher-dot{width:7px;height:7px;border-radius:50%;background:var(--lime)}',
    /* The panel is a <section>, and every one of these pages styles
       `section{padding:80px 0}` for its own layout — inherited, that pushed the
       header 80px down and cut the conversation short. Reset it here. */
    '.vera-panel{padding:0;margin:0;position:fixed;z-index:55;right:24px;bottom:24px;width:min(420px,calc(100vw - 32px));height:min(680px,85dvh);display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line);color:var(--text);box-shadow:0 24px 60px rgba(0,0,0,.55)}',
    '.vera-panel[hidden]{display:none}',
    '@media(max-width:640px){.vera-panel{right:8px;bottom:8px;width:calc(100vw - 16px);height:88dvh}}',
    '.vera .agent-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line);flex:none}',
    '.vera .agent-bar .id{display:flex;align-items:center;gap:10px;font-family:"Spline Sans Mono",monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
    '.vera .agent-bar .id i{width:8px;height:8px;border-radius:50%;background:var(--lime);flex:none}',
    '.vera .agent-bar .tools{display:flex;align-items:center;gap:6px;flex:none}',
    '.vera-close{background:none;border:0;color:var(--mono);font-size:22px;line-height:1;cursor:pointer;padding:6px 10px;margin:-6px -10px -6px 0}',
    '.vera-close:hover{color:var(--text)}',
    '.vera .v-chat{flex:1;overflow-y:auto;padding:20px 18px;display:flex;flex-direction:column;gap:12px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}',
    '.vera .msg{max-width:86%;font-size:15px;line-height:1.55;overflow-wrap:break-word}',
    '.vera .msg.agent{color:var(--text)}',
    '.vera .msg.agent b{color:var(--lime);font-weight:600}',
    '.vera .msg.agent a{color:var(--lime)}',
    '.vera .msg.user{align-self:flex-end;color:var(--muted);border-right:2px solid var(--lime);padding-right:12px}',
    '.vera .typing i{display:inline-block;width:5px;height:5px;margin-right:3px;background:var(--mono);animation:vera-blink 1.2s infinite}',
    '.vera .typing i:nth-child(2){animation-delay:.2s}.vera .typing i:nth-child(3){animation-delay:.4s}',
    '@keyframes vera-blink{0%,60%,100%{opacity:.25}30%{opacity:1}}',
    '.vera .mini-form{display:grid;gap:10px;margin-top:10px}',
    '.vera .mini-form input[type=text],.vera .mini-form input[type=email],.vera .mini-form select{width:100%;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:"Archivo",sans-serif;font-size:14px;padding:10px 12px;outline:none;border-radius:0;appearance:none;-webkit-appearance:none}',
    '.vera .mini-form input:focus,.vera .mini-form select:focus{border-color:var(--lime)}',
    '.vera .mini-form .mf-checks{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
    '.vera .mini-form label.ck{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--muted);border:1px solid var(--line);padding:8px 10px;cursor:pointer}',
    '.vera .mini-form label.ck input{accent-color:var(--lime)}',
    '.vera .mini-form label.consent{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--muted)}',
    '.vera .mini-form label.consent input{accent-color:var(--lime);margin-top:3px}',
    '.vera .v-chips{display:flex;flex-wrap:wrap;gap:8px;padding:0 18px 14px;flex:none}',
    '.vera .chip{font-family:"Spline Sans Mono",monospace;font-size:11px;letter-spacing:.06em;border:1px solid var(--line);color:var(--muted);background:none;padding:7px 11px;cursor:pointer}',
    '.vera .chip:hover{border-color:var(--lime);color:var(--text)}',
    '.vera .agent-input{display:flex;border-top:1px solid var(--line);flex:none}',
    '.vera .agent-input button.icon{width:50px;border:none;border-right:1px solid var(--line);background:none;color:var(--mono);cursor:pointer;font-size:16px}',
    '.vera .agent-input button.icon:hover{color:var(--lime)}',
    '.vera .agent-input button.icon.live{color:var(--lime)}',
    '.vera .agent-input button.icon.rec{color:var(--pink,#FF3D8A)}',
    '.vera .agent-input input{flex:1;min-width:0;background:none;border:none;color:var(--text);font-family:"Archivo",sans-serif;font-size:15px;padding:15px 16px;outline:none}',
    '.vera .agent-input button.send{border:none;border-left:1px solid var(--line);background:none;color:var(--text);font-family:"Spline Sans Mono",monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;padding:0 18px;cursor:pointer}',
    '.vera .agent-input button.send:hover{background:var(--lime);color:#04070D}',
    '.vera .v-btn{font-family:"Spline Sans Mono",monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border:1px solid var(--line);color:var(--text);background:none;padding:9px 12px;cursor:pointer}',
    '.vera .v-btn:hover{border-color:var(--lime)}',
    '.vera .v-btn.primary{background:var(--lime);border-color:var(--lime);color:#04070D}',
    '.vera .v-btn[disabled]{opacity:.55;cursor:default}',
    '.vera .cal-wrap{display:grid;gap:8px}',
    '.vera .cal-head{display:flex;align-items:center;justify-content:space-between;gap:10px}',
    '.vera .cal-day{font-family:"Spline Sans Mono",monospace;font-size:12px;letter-spacing:.06em;color:var(--lime)}',
    '.vera .cal-prev,.vera .cal-next{background:none;border:1px solid var(--line);color:var(--muted);font-size:15px;line-height:1;padding:5px 11px;cursor:pointer}',
    '.vera .cal-prev:hover:not([disabled]),.vera .cal-next:hover:not([disabled]){border-color:var(--lime);color:var(--text)}',
    '.vera .cal-prev[disabled],.vera .cal-next[disabled]{opacity:.35;cursor:default}',
    '.vera .cal-slots{display:flex;flex-wrap:wrap;gap:6px;max-height:140px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--line) transparent}',
    '.vera .cal-slot{font-family:"Spline Sans Mono",monospace;font-size:12px;border:1px solid var(--line);color:var(--muted);background:none;padding:7px 10px;cursor:pointer}',
    '.vera .cal-slot:hover{border-color:var(--lime);color:var(--text)}',
    '.vera .cal-slot.sel{background:var(--lime);border-color:var(--lime);color:#04070D}',
    '.vera .cal-note{font-size:13px;color:var(--muted)}',
  ].join('\n');
  var styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  /* ------------------------------- markup -------------------------------- */
  var root = document.createElement('div');
  root.className = 'vera';
  root.innerHTML =
    '<button class="vera-launcher" id="vera-launcher" type="button" aria-haspopup="dialog"'
    + ' aria-expanded="false" aria-label="Ask Vera" hidden>'
    + '<span class="vera-launcher-dot" aria-hidden="true"></span>'
    + '<span class="vera-launcher-word">' + (CFG.launcher || 'Ask') + '</span>'
    + '</button>'
    + '<section class="vera-panel" id="vera-panel" role="dialog" aria-modal="false"'
    + ' aria-label="Conversation with Vera" hidden>'
    + '<header class="agent-bar"><span class="id"><i aria-hidden="true"></i>' + CFG.who + '</span>'
    + '<div class="tools"><button class="v-btn" id="v-toggle" type="button">Voice: off</button>'
    + '<button class="vera-close" id="vera-close" type="button" aria-label="Close the conversation">&times;</button>'
    + '</div></header>'
    + '<div class="v-chat" id="v-chat" aria-live="polite" aria-label="Messages"></div>'
    + '<div class="v-chips" id="v-chips">'
    + CFG.chips.map(function (c) { return '<button class="chip" type="button">' + c + '</button>'; }).join('')
    + '</div>'
    + '<div class="agent-input">'
    + '<button class="icon" id="v-mic" type="button" title="Speak to Vera" aria-label="Speak to Vera" style="display:none">&#9679;</button>'
    + '<input id="v-q" type="text" placeholder="' + CFG.placeholder + '" autocomplete="off">'
    + '<button class="send" id="v-send" type="button">Send</button>'
    + '</div></section>';
  document.body.appendChild(root);
  var mount = root;

  var chat = mount.querySelector('#v-chat');
  var input = mount.querySelector('#v-q');
  var mic = mount.querySelector('#v-mic');
  var toggle = mount.querySelector('#v-toggle');
  var launcher = mount.querySelector('#vera-launcher');
  var panel = mount.querySelector('#vera-panel');

  var history = [];
  var lead = {};
  var LIVE = { agent: false, voice: false };

  /* The launcher appears only once we know she can actually answer — an inviting
     button that then apologises is worse than no button. Every page keeps its own
     forms, so nothing is lost when she is offline. */
  fetch('/api/health').then(function (r) { return r.json(); }).then(function (d) {
    LIVE.agent = !!d.agent; LIVE.voice = !!d.voice;
    if (LIVE.agent) launcher.hidden = false;
    if (LIVE.voice) { mic.style.display = ''; mic.classList.add('live'); toggle.textContent = 'Voice: start'; }
  }).catch(function () {});

  /* ---------------------------- open / close ----------------------------- */
  var greeted = false;
  function smallScreen() { return window.matchMedia('(max-width: 640px)').matches; }
  function openPanel() {
    panel.hidden = false;
    launcher.hidden = true;
    launcher.setAttribute('aria-expanded', 'true');
    if (smallScreen()) document.body.style.overflow = 'hidden';
    input.focus();
    /* Greet on the first OPEN, not on load: a greeting nobody has asked for is
       just noise in a panel nobody opened. */
    if (!greeted) { greeted = true; agentSay(CFG.greeting, true); }
  }
  function closePanel() {
    stopLive();
    panel.hidden = true;
    launcher.hidden = false;
    launcher.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    launcher.focus();
  }
  launcher.addEventListener('click', openPanel);
  mount.querySelector('#vera-close').addEventListener('click', closePanel);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) closePanel();
  });
  /* Anything on the page can hail her: <a href="#ask">, or data-vera-open. */
  Array.prototype.forEach.call(
    document.querySelectorAll('[data-vera-open], a[href="#ask"]'),
    function (n) { n.addEventListener('click', function (e) { e.preventDefault(); openPanel(); }); },
  );

  /* ------------------------------ plumbing ------------------------------- */
  function el(html, cls) {
    var d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.innerHTML = html;
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
    return d;
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  var voiceOn = false;
  function speak(text) {
    if (!voiceOn || !window.speechSynthesis) return;
    var u = new SpeechSynthesisUtterance(String(text).replace(/<[^>]+>/g, ''));
    u.lang = 'en-GB';
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
  function agentSay(html, noVoice) {
    var t = el('<span class="typing"><i></i><i></i><i></i></span>', 'agent');
    setTimeout(function () {
      t.innerHTML = html;
      chat.scrollTop = chat.scrollHeight;
      if (!noVoice) speak(html);
    }, 450 + Math.random() * 350);
  }
  function offline() {
    agentSay('I cannot reach my brain just now. The forms further down this page work regardless, and they go to the same place.', true);
  }

  /* ------------------------------- the form ------------------------------ */
  var lastForm = null;
  function showForm(action) {
    var spec = FORMS[action.intent] || FORMS[DEFAULT_INTENT];
    /* never render a fabricated address: a placeholder-looking email comes up blank */
    var email = action.email || '';
    if (/example|placeholder|test@|@test\.|your.?email|@email\./i.test(email)) email = '';

    if (lastForm) { /* a corrected form supersedes the old one */
      var oldGo = lastForm.querySelector('.v-go');
      if (oldGo && !oldGo.disabled) { oldGo.disabled = true; oldGo.textContent = 'Replaced below'; }
    }

    var values = { name: action.name || '', email: email, organisation: action.organisation || '', sector: action.sector || '', years: action.years || '', role: action.role || '', topic: action.topic || '', time: action.preferredTime || '' };
    var html = '<b>' + esc(spec.title) + '</b><div class="mini-form">';
    spec.fields.forEach(function (f) {
      if (f.type === 'checks') {
        var pre = action.products || [];
        html += '<div class="mf-checks">' + f.options.map(function (o) {
          return '<label class="ck"><input type="checkbox" data-check value="' + esc(o) + '"' + (pre.indexOf(o) > -1 ? ' checked' : '') + '> ' + esc(o) + '</label>';
        }).join('') + '</div>';
      } else if (f.type === 'select') {
        html += '<select data-field="' + f.key + '"><option value="">' + esc(f.label) + '</option>'
          + f.options.map(function (o) {
            return '<option value="' + esc(o) + '"' + (values[f.key] === o ? ' selected' : '') + '>' + esc(o) + '</option>';
          }).join('') + '</select>';
      } else {
        html += '<input type="' + f.type + '" data-field="' + f.key + '" value="' + esc(values[f.key]) + '" placeholder="' + esc(f.label) + '">';
      }
    });
    if (spec.kind !== 'booking') {
      // A booking is a meeting the visitor asked for, not a mailing list: no consent box.
      html += '<label class="consent"><input type="checkbox" data-consent> <span>Keep my details and email me about early access (<a href="#privacy">privacy notice</a>)</span></label>';
    }
    html += '<button class="v-btn primary v-go" type="button">' + esc(spec.button) + '</button></div>';

    var bubble = el(html, 'agent');
    lastForm = bubble;

    if (spec.kind === 'booking') {
      var chosenSlot = null;
      var timeField = bubble.querySelector('[data-field="time"]');
      var goBtn = bubble.querySelector('.v-go');
      buildSlotPicker(bubble, timeField, goBtn, action.preferredDate || '', action.preferredTime || '', function (sl) {
        chosenSlot = sl;
      });
      goBtn.addEventListener('click', function () {
        var n = (bubble.querySelector('[data-field="name"]').value || '').trim();
        var e2 = (bubble.querySelector('[data-field="email"]').value || '').trim();
        if (!n || !/.+@.+\..+/.test(e2)) { agentSay('I still need a name and a real email on that form.'); return; }
        if (!chosenSlot) { agentSay('Pick a time on the calendar first, then the button books it.'); return; }
        goBtn.disabled = true;
        fetch(spec.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start: chosenSlot.start, name: n, email: e2 }),
        })
          .then(function (r) { return r.ok ? r.json().catch(function () { return { ok: true }; }) : null; })
          .then(function (d) {
            if (!d || d.ok === false) throw new Error('book failed');
            goBtn.textContent = 'Booked';
            agentSay('<b>' + esc(n.split(' ')[0]) + ', ' + esc(spec.done) + '</b> ' + esc(spec.tail));
          })
          .catch(function () {
            goBtn.disabled = false;
            agentSay('That slot did not book, it may have just been taken. Pick another and press the button again.');
          });
      });
      return;
    }

    bubble.querySelector('.v-go').addEventListener('click', function () {
      var payload = { consent: true };
      var missing = null;
      spec.fields.forEach(function (f) {
        if (f.type === 'checks') {
          payload[f.key] = Array.prototype.map.call(bubble.querySelectorAll('[data-check]:checked'), function (c) { return c.value; });
          return;
        }
        var node = bubble.querySelector('[data-field="' + f.key + '"]');
        var val = (node && node.value || '').trim();
        payload[f.key] = val;
        if (!val && !f.optional) missing = missing || f.label;
        if (f.type === 'email' && val && !/.+@.+\..+/.test(val)) missing = missing || f.label;
      });
      if (missing) { agentSay('I still need ' + esc(missing.toLowerCase()) + ' on that form.'); return; }
      if (!bubble.querySelector('[data-consent]').checked) {
        agentSay('I need the consent box ticked before I can add you. The privacy notice link is right there on the form.');
        return;
      }
      if (spec.endpoint === '/api/waitlist') payload.source = 'helix.work/agent';
      var go = bubble.querySelector('.v-go');
      go.disabled = true;
      fetch(spec.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.ok ? r.json().catch(function () { return { ok: true }; }) : null; })
        .then(function (d) {
          if (!d || d.ok === false) throw new Error('save failed');
          go.textContent = 'Done';
          var who = (payload.name || payload.email || '').split(' ')[0].split('@')[0];
          agentSay('<b>' + esc(who) + ', ' + esc(spec.done) + '</b> ' + esc(spec.tail));
        })
        .catch(function () {
          go.disabled = false;
          agentSay('That did not save. Give the button one more press, or use the form further down the page.');
        });
    });
  }

  /* --------------------------- the slot picker ----------------------------
     A one-day view with prev/next arrows, ported from mindlynx.ai's companion.
     Days come from /api/availability (this server proxies the shared MindLynx
     diary) in 7-day windows; browsing past the loaded window fetches the next,
     and browsing back past the anchor reloads from today. If the diary is
     unreachable, an honest line replaces the calendar and nothing books. */
  function buildSlotPicker(bubble, timeField, go, preferredDate, preferredTime, onPick) {
    function dayKey(iso) {
      return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' });
    }
    function timeLabel(iso) {
      return new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' });
    }
    function slotMinutes(iso) {
      var parts = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', hour12: false, timeZone: 'Europe/London' })
        .format(new Date(iso)).split(':');
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    /* The agreed time as minutes-of-day, out of whatever wording the model
       passed ("2:00 pm", "Monday 3 August at 2pm", "14:30"). Null if none. */
    var wantedMinutes = (function () {
      var ampm = String(preferredTime || '').match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)/i);
      if (ampm) {
        var h = parseInt(ampm[1], 10) % 12;
        if (ampm[3].toLowerCase() === 'pm') h += 12;
        return h * 60 + (ampm[2] ? parseInt(ampm[2], 10) : 0);
      }
      var h24 = String(preferredTime || '').match(/\b(\d{1,2})[:.](\d{2})\b/);
      if (h24) return parseInt(h24[1], 10) * 60 + parseInt(h24[2], 10);
      return null;
    })();

    var days = [];
    var idx = 0, fetching = false, exhausted = false, chosenStart = '';

    var wrap = document.createElement('div');
    wrap.className = 'cal-wrap';
    wrap.innerHTML =
      '<div class="cal-head">'
      + '<button type="button" class="cal-prev" aria-label="Earlier day">&#8249;</button>'
      + '<span class="cal-day"></span>'
      + '<button type="button" class="cal-next" aria-label="Later day">&#8250;</button>'
      + '</div><div class="cal-slots"></div>';
    var dayTitle = wrap.querySelector('.cal-day');
    var slotsBox = wrap.querySelector('.cal-slots');
    var prevBtn = wrap.querySelector('.cal-prev');
    var nextBtn = wrap.querySelector('.cal-next');

    function ingest(list) {
      list.forEach(function (sl) {
        var k = dayKey(sl.start);
        var d = null;
        for (var i = 0; i < days.length; i++) if (days[i].key === k) { d = days[i]; break; }
        if (!d) { d = { key: k, slots: [] }; days.push(d); }
        if (!d.slots.some(function (x) { return x.start === sl.start; })) d.slots.push(sl);
      });
      days.forEach(function (d) { d.slots.sort(function (a, b) { return a.start.localeCompare(b.start); }); });
      days.sort(function (a, b) { return a.slots[0].start.localeCompare(b.slots[0].start); });
    }
    function fetchWindow(from) {
      fetching = true;
      return fetch('/api/availability' + (from ? '?from=' + encodeURIComponent(from) : ''))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (av) {
          fetching = false;
          if (!av || !av.ok || !av.slots || !av.slots.length) return false;
          ingest(av.slots);
          return true;
        })
        .catch(function () { fetching = false; return false; });
    }
    function render() {
      var d = days[idx];
      if (!d) return;
      dayTitle.textContent = d.key;
      prevBtn.disabled = idx === 0 && new Date(d.slots[0].start).getTime() < Date.now() + 26 * 3600000;
      nextBtn.disabled = exhausted && idx === days.length - 1;
      slotsBox.innerHTML = '';
      d.slots.forEach(function (sl) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cal-slot' + (sl.start === chosenStart ? ' sel' : '');
        b.textContent = timeLabel(sl.start);
        b.addEventListener('click', function () { select(sl); render(); });
        slotsBox.appendChild(b);
      });
      /* The chosen time stays centred in view. Manual maths rather than
         scrollIntoView so the chat's own scroll is never disturbed. */
      var sel = slotsBox.querySelector('.sel');
      if (sel) slotsBox.scrollTop = sel.offsetTop - slotsBox.clientHeight / 2 + sel.clientHeight / 2;
    }
    function select(sl) {
      chosenStart = sl.start;
      if (timeField) timeField.value = sl.label || (dayKey(sl.start) + ', ' + timeLabel(sl.start));
      go.textContent = 'Book ' + (sl.label || timeLabel(sl.start));
      onPick(sl);
    }
    prevBtn.addEventListener('click', function () {
      if (idx > 0) { idx--; render(); return; }
      if (fetching) return;
      // Browsed back past the anchor: load from today and stay oriented.
      var current = days[idx] && days[idx].key;
      fetchWindow('').then(function (ok) {
        if (!ok) return;
        var i = -1;
        for (var j = 0; j < days.length; j++) if (days[j].key === current) { i = j; break; }
        idx = Math.max(0, i - 1);
        render();
      });
    });
    nextBtn.addEventListener('click', function () {
      if (idx < days.length - 1) { idx++; render(); return; }
      if (fetching || exhausted) return;
      // Past the loaded window: pull the next seven days.
      var lastDay = days[days.length - 1];
      var lastStart = lastDay && lastDay.slots[lastDay.slots.length - 1] && lastDay.slots[lastDay.slots.length - 1].start;
      var from = lastStart ? new Date(new Date(lastStart).getTime() + 86400000).toISOString().slice(0, 10) : '';
      var current = days[idx] && days[idx].key;
      fetchWindow(from).then(function (ok) {
        if (!ok) { exhausted = true; render(); return; }
        var i = -1;
        for (var j = 0; j < days.length; j++) if (days[j].key === current) { i = j; break; }
        idx = Math.min(i + 1, days.length - 1);
        render();
      });
    });

    fetchWindow(preferredDate || '').then(function (ok) {
      if (!ok || !days.length) {
        var note = document.createElement('p');
        note.className = 'cal-note';
        note.textContent = 'The diary is unreachable just now. Tell Vera when suits you and the team will confirm by email.';
        if (timeField) timeField.insertAdjacentElement('afterend', note);
        return;
      }
      idx = 0;
      // A time was agreed in conversation: arrive with it selected and armed.
      if (wantedMinutes !== null) {
        var match = null;
        for (var i = 0; i < days[idx].slots.length; i++) {
          if (slotMinutes(days[idx].slots[i].start) === wantedMinutes) { match = days[idx].slots[i]; break; }
        }
        if (match) select(match);
      }
      if (timeField) timeField.insertAdjacentElement('afterend', wrap);
      render();
    });
  }

  /* -------------------------------- asking ------------------------------- */
  function ask(q) {
    if (!q || !q.trim()) return;
    el(esc(q), 'user');
    history.push({ role: 'user', content: q });
    input.value = '';
    if (!LIVE.agent) { offline(); return; }
    var t = el('<span class="typing"><i></i><i></i><i></i></span>', 'agent');
    fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: q, history: history, site: SITE }),
    })
      .then(function (r) { if (!r.ok) throw new Error('agent ' + r.status); return r.json(); })
      .then(function (d) {
        if (!d.reply) throw new Error('empty');
        t.textContent = deslop(d.reply); /* live model output is untrusted: never innerHTML */
        chat.scrollTop = chat.scrollHeight;
        history.push({ role: 'agent', content: deslop(d.reply) });
        speak(d.reply);
        if (d.action && d.action.type === 'show_signup_form') {
          lead = d.action;
          setTimeout(function () { showForm(d.action); }, 600);
        }
      })
      .catch(function () {
        t.parentNode && t.parentNode.removeChild(t);
        offline();
      });
  }

  mount.querySelector('#v-send').addEventListener('click', function () { ask(input.value); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') ask(input.value); });
  Array.prototype.forEach.call(mount.querySelectorAll('#v-chips .chip'), function (c) {
    c.addEventListener('click', function () { ask(c.textContent); });
  });

  /* ------------- voice: the Helix Pipecat service (rung 1) ----------------
     Vera speaks here exactly as she does on mindlynx.ai — Deepgram STT, an LLM,
     and Cartesia TTS in Lucy's voice, over WebRTC. This replaced Gemini Live,
     whose native audio cannot speak a Cartesia voice and so gave these sites a
     different Vera to the one on MindLynx. Her instructions are minted and
     SIGNED by our server (`/api/voice/token`); the voice service refuses any
     session it cannot verify, so the persona is never client-authored. */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  /* Pinned, and kept in step with mindlynx-website's package.json so both
     front doors run the identical client. */
  var CDN = 'https://cdn.jsdelivr.net/npm/';
  var PIPECAT_CLIENT = CDN + '@pipecat-ai/client-js@1.13.0/+esm';
  var PIPECAT_TRANSPORT = CDN + '@pipecat-ai/small-webrtc-transport@1.10.6/+esm';
  var DAILY_JS = CDN + '@daily-co/daily-js@0.90.0/+esm';
  /** A spoken turn is done when the agent has been quiet this long. */
  var TURN_SETTLE_MS = 900;
  var live = {
    client: null, call: null, audioEl: null, timer: null,
    userBub: null, botBub: null, botText: '', settle: null, connBub: null,
  };

  function vlog(stage, detail) {
    try {
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: SITE + ':' + stage, detail: detail || {} }),
      });
    } catch (e) {}
  }

  /**
   * House style: no EM dash reaches the panel. The typed path is cleaned
   * server-side, but the SPOKEN transcript arrives straight from the voice service
   * and never passes through us, so it is cleaned here too. Mirrors `deslop` in
   * server.mjs and on mindlynx.ai. The en dash is left alone: it belongs in a range.
   */
  function deslop(text) {
    return String(text)
      .replace(/\s*\u2014\s*/g, ', ')
      .replace(/,\s*,/g, ',')
      .replace(/,\s*([.!?;:])/g, '$1')
      .replace(/\s+,/g, ',');
  }

  /** TTS sometimes streams the same sentence twice; show it once. */
  function collapseRepeatedSentences(text) {
    var parts = String(text).split(/(?<=[.!?])\s+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (!out.length || out[out.length - 1].trim() !== parts[i].trim()) out.push(parts[i]);
    }
    return out.join(' ');
  }

  function finaliseUser() {
    if (live.userBub && live.userBub.textContent) history.push({ role: 'user', content: live.userBub.textContent });
    live.userBub = null;
  }
  function finaliseBot() {
    if (live.settle) { clearTimeout(live.settle); live.settle = null; }
    if (live.botBub && live.botBub.textContent) history.push({ role: 'agent', content: live.botBub.textContent });
    live.botBub = null;
    live.botText = '';
  }

  function stopLive(notice) {
    if (live.timer) { clearTimeout(live.timer); live.timer = null; }
    if (live.settle) { clearTimeout(live.settle); live.settle = null; }
    if (live.connBub) { live.connBub.textContent = 'Voice did not connect this time.'; live.connBub = null; }
    finaliseUser();
    finaliseBot();
    if (live.client) { var c = live.client; live.client = null; try { c.disconnect(); } catch (e) {} }
    if (live.audioEl) { try { live.audioEl.pause(); } catch (e) {} live.audioEl.srcObject = null; live.audioEl = null; }
    live.call = null;
    mic.classList.remove('rec');
    refreshVoiceUi();
    if (notice) agentSay(notice, true);
  }

  function refreshVoiceUi() {
    if (live.client) toggle.textContent = 'Voice: live · stop';
    else if (LIVE.voice) toggle.textContent = 'Voice: start';
    else toggle.textContent = 'Voice: ' + (voiceOn ? 'on' : 'off');
  }

  function startLive() {
    mic.classList.add('rec');
    toggle.textContent = 'Voice: connecting…';
    live.connBub = el('<span class="typing"><i></i><i></i><i></i></span>&nbsp; Connecting you to Vera&hellip;', 'agent');
    vlog('start', { secure: window.isSecureContext });
    return fetch('/api/voice/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: SITE }),
    })
      .then(function (r) { if (!r.ok) throw new Error('mint ' + r.status); return r.json(); })
      .then(function (session) {
        vlog('mint-ok', {});
        return Promise.all([import(PIPECAT_CLIENT), import(PIPECAT_TRANSPORT), import(DAILY_JS)])
          .then(function (mods) { return { session: session, cj: mods[0], tj: mods[1], dj: mods[2] }; });
      })
      .then(function (ctx) {
        vlog('sdk-ok', {});
        /* Create the Daily call ourselves so two flags are pinned at the one place
           every entry path reads its config from:

             avoidEval — Daily's default loader FETCHES its call-machine bundle and
               EVALS the string, which this site's CSP refuses (no 'unsafe-eval'), so
               connect died with "Failed to load call object bundle" and Vera sat
               silent. avoidEval loads the same bundle as a <script> from *.daily.co
               instead. mindlynx.ai never hit this because it sends no CSP at all.
             useDevicePreferenceCookies — left alone, Daily restores whichever mic
               was used LAST (a nearby iPhone over Continuity, at worst) and Vera
               goes deaf with no visible error.

           Both have to be forced at load(), not at createCallObject: every entry
           point calls load(props) and load SHALLOW-merges, so the media manager's
           own `dailyConfig` replaced ours wholesale and the eval loader came back.
           (Same fix, same reasoning, as helix-ui's usePipecatVoice.) */
        var Daily = ctx.dj.default || ctx.dj;
        var call = (Daily.getCallInstance && Daily.getCallInstance()) || Daily.createCallObject();
        live.call = call;
        var originalLoad = call.load.bind(call);
        call.load = function (props) {
          var next = props || {};
          next.dailyConfig = Object.assign({}, next.dailyConfig || {}, {
            avoidEval: true,
            useDevicePreferenceCookies: false,
          });
          return originalLoad(next);
        };
        /* A television in the room is speech; strip it before the track leaves. */
        try { void call.updateInputSettings({ audio: { processor: { type: 'noise-cancellation' } } }); } catch (e) {}
        try { void call.setInputDevicesAsync({ audioDeviceId: 'default' }); } catch (e) {}

        var client = new ctx.cj.PipecatClient({
          transport: new ctx.tj.SmallWebRTCTransport(),
          enableMic: true,
          enableCam: false,
          callbacks: {
            onTrackStarted: function (track) {
              if (track.kind !== 'audio') return;
              if (!live.audioEl) { live.audioEl = document.createElement('audio'); live.audioEl.autoplay = true; }
              live.audioEl.srcObject = new MediaStream([track]);
              void live.audioEl.play().catch(function () {});
              vlog('audio-attached', {});
            },
            onUserTranscript: function (data) {
              if (!data || !data.final || !data.text) return;
              if (live.botBub) finaliseBot(); /* you speaking ends the agent's turn */
              if (!live.userBub) live.userBub = el('', 'user');
              live.userBub.textContent = (live.userBub.textContent ? live.userBub.textContent + ' ' : '') + deslop(data.text).trim();
              chat.scrollTop = chat.scrollHeight;
            },
            onBotTtsText: function (data) {
              if (!data || !data.text) return;
              if (!live.botBub) { finaliseUser(); live.botBub = el('', 'agent'); live.botText = ''; }
              live.botText += (live.botText ? ' ' : '') + deslop(data.text);
              live.botBub.textContent = collapseRepeatedSentences(live.botText);
              chat.scrollTop = chat.scrollHeight;
            },
            onBotStoppedSpeaking: function () {
              /* NOT the end of the turn — each streamed sentence lands here. */
              if (live.settle) clearTimeout(live.settle);
              live.settle = setTimeout(finaliseBot, TURN_SETTLE_MS);
            },
            onServerMessage: function (data) {
              /* The voice service names this message `show_action_form` (its tool
                 mirrors mindlynx.ai's); our own text agent says `show_signup_form`.
                 Listening for only the latter DROPPED every spoken form: Vera told
                 the visitor "it's on your screen" while the browser discarded it. */
              if (!data) return;
              if (data.type !== 'show_action_form' && data.type !== 'show_signup_form') return;
              /* MindLynx-only intents (scoping_call, design_partner, send_info) have
                 no form here: land on THIS site's own form, per the site config. */
              showForm({
                intent: FORMS[data.intent] ? data.intent : DEFAULT_INTENT,
                name: data.name, email: data.email, organisation: data.organisation,
                sector: data.sector, years: data.years, role: data.role, products: data.products,
                topic: data.topic, preferredTime: data.preferredTime, preferredDate: data.preferredDate,
              });
            },
            onDisconnected: function () {
              if (live.client) stopLive('Voice session ended. Press Voice to reconnect, or just type.');
            },
          },
        });
        live.client = client;
        /* `webrtcRequestParams`, NOT a bare {endpoint}: the bare form is the
           deprecated start-bot flow and 400s against this server. */
        return client.connect({
          webrtcRequestParams: { endpoint: ctx.session.connectUrl, requestData: { website: ctx.session.website } },
        });
      })
      .then(function () {
        vlog('connected', {});
        refreshVoiceUi();
        if (live.connBub) { live.connBub.textContent = 'You are through to Vera.'; live.connBub = null; }
        live.timer = setTimeout(function () {
          stopLive('Voice session ended (five minute cap). Tap the mic to carry on.');
        }, 300000);
      });
  }

  /* Web Speech fallback (rung 2) */
  var rec = null, listening = false;
  if (SR) {
    rec = new SR();
    rec.lang = 'en-GB';
    rec.interimResults = false;
    rec.onresult = function (e) { ask(e.results[0][0].transcript); };
    rec.onend = function () { listening = false; mic.classList.remove('rec'); };
    rec.onerror = function () { listening = false; mic.classList.remove('rec'); };
  }
  function startSR() {
    if (!rec) { agentSay('This browser has no speech input, so it is typing only here.', true); return; }
    if (listening) { rec.stop(); return; }
    listening = true;
    mic.classList.add('rec');
    rec.start();
  }
  function voiceFlow() {
    if (live.client) { stopLive(); return; }
    if (LIVE.voice && window.isSecureContext) {
      startLive().catch(function (err) {
        vlog('fail', { name: err && err.name, msg: String((err && err.message) || err).slice(0, 200) });
        stopLive();
        agentSay(err && err.name === 'NotAllowedError'
          ? 'I could not get microphone access. Allow the microphone for this page and press Voice again, or just type.'
          : 'Vera’s voice line dropped while connecting. Press Voice to try again, or just type.', true);
      });
    } else {
      startSR();
    }
  }
  mic.addEventListener('click', voiceFlow);
  toggle.addEventListener('click', function () {
    /* with live voice available this button IS the voice control; otherwise it toggles spoken replies */
    if (live.client || (LIVE.voice && window.isSecureContext)) { voiceFlow(); return; }
    voiceOn = !voiceOn;
    refreshVoiceUi();
    if (!voiceOn && window.speechSynthesis) speechSynthesis.cancel();
  });
})();
