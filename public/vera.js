/* =============================================================================
   vera.js — the Vera companion, shared by the pages that are not the Helix front
   door. Drop one mount on a page and she appears:

       <div data-vera="albion"></div>
       <script src="/vera.js" defer></script>

   The site name picks the greeting, the chips and the forms she may put up; the
   server picks what she leads with and which tool she is given (SITES in
   server.mjs), so the knowledge pack stays single-sourced. index.html keeps its
   own inline copy for now — it carries a bespoke scripted brain for the
   no-API-key case, which nothing else needs. Converging the two is tracked.

   Everything here is deliberately ES5-flavoured and framework-free, like the
   pages it joins. It inherits each page's palette through the shared custom
   properties (--line, --panel, --lime, --mono, --muted, --bg, --text).
   ========================================================================== */
(function () {
  var mount = document.querySelector('[data-vera]');
  if (!mount) return;

  var SITE = mount.getAttribute('data-vera') || 'helix';

  /* --------------------------- per-site wiring --------------------------- */
  var SITES = {
    albion: {
      who: 'Vera · Albion front of house',
      greeting: "Hello. This page is an agent; I am it. My name is <b>Vera</b>. Ask me what Albion is, how it keeps sovereign work sovereign, or why it costs less over time. I can put you on the waitlist or start you on the contributor register, though the final button press will always be yours.",
      chips: ['What is Albion?', 'What does the receipt show?', 'How does sovereign work stay sovereign?', 'Why does it cost less over time?', 'Get paid for my expertise'],
      placeholder: 'Ask Albion anything...',
    },
    cortex: {
      who: 'Vera · Cortex front of house',
      greeting: "Hello. This page is an agent; I am it. My name is <b>Vera</b>. Ask me what Cortex is, where your memory actually lives, or how developers build on it. I can put you on the waiting list too, though the final button press will always be yours.",
      chips: ['What is Cortex?', 'Where does the memory live?', 'What can developers build on it?', 'How is it sovereign?', 'Put me on the list'],
      placeholder: 'Ask Cortex anything...',
    },
  };
  var CFG = SITES[SITE] || SITES.albion;

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

  /* ------------------------------- styles -------------------------------- */
  var CSS = [
    '[data-vera] .agent-shell{border:1px solid var(--line);background:var(--panel)}',
    '[data-vera] .agent-bar{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line)}',
    '[data-vera] .agent-bar .id{display:flex;align-items:center;gap:10px;font-family:"Spline Sans Mono",monospace;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--mono)}',
    '[data-vera] .agent-bar .id i{width:10px;height:10px;background:var(--lime);display:inline-block}',
    '[data-vera] .v-chat{height:440px;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:14px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}',
    '[data-vera] .msg{max-width:88%;font-size:15px;line-height:1.55}',
    '[data-vera] .msg.agent{color:var(--text)}',
    '[data-vera] .msg.user{align-self:flex-end;color:var(--muted);border-right:2px solid var(--lime);padding-right:12px}',
    '[data-vera] .msg a{color:var(--lime)}',
    '[data-vera] .typing i{display:inline-block;width:5px;height:5px;margin-right:3px;background:var(--mono);animation:vera-blink 1.2s infinite}',
    '[data-vera] .typing i:nth-child(2){animation-delay:.2s}[data-vera] .typing i:nth-child(3){animation-delay:.4s}',
    '@keyframes vera-blink{0%,60%,100%{opacity:.25}30%{opacity:1}}',
    '[data-vera] .mini-form{display:grid;gap:10px;margin-top:10px;min-width:280px}',
    '[data-vera] .mini-form input[type=text],[data-vera] .mini-form input[type=email],[data-vera] .mini-form select{width:100%;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:"Archivo",sans-serif;font-size:14px;padding:10px 12px;outline:none}',
    '[data-vera] .mini-form input:focus,[data-vera] .mini-form select:focus{border-color:var(--lime)}',
    '[data-vera] .mini-form .mf-checks{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
    '[data-vera] .mini-form label.ck{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--muted);border:1px solid var(--line);padding:8px 10px;cursor:pointer}',
    '[data-vera] .mini-form label.ck input{accent-color:var(--lime)}',
    '[data-vera] .mini-form label.consent{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--muted)}',
    '[data-vera] .mini-form label.consent input{accent-color:var(--lime);margin-top:3px}',
    '[data-vera] .v-chips{display:flex;flex-wrap:wrap;gap:8px;padding:0 20px 16px}',
    '[data-vera] .chip{font-family:"Spline Sans Mono",monospace;font-size:12px;letter-spacing:.06em;border:1px solid var(--line);color:var(--muted);background:none;padding:8px 12px;cursor:pointer}',
    '[data-vera] .chip:hover{border-color:var(--lime);color:var(--text)}',
    '[data-vera] .agent-input{display:flex;border-top:1px solid var(--line)}',
    '[data-vera] .agent-input button.icon{width:54px;border:none;border-right:1px solid var(--line);background:none;color:var(--mono);cursor:pointer;font-size:18px}',
    '[data-vera] .agent-input button.icon:hover{color:var(--lime)}',
    '[data-vera] .agent-input button.icon.live{color:var(--lime)}',
    '[data-vera] .agent-input button.icon.rec{color:var(--pink,#FF3D8A)}',
    '[data-vera] .agent-input input{flex:1;background:none;border:none;color:var(--text);font-family:"Archivo",sans-serif;font-size:15px;padding:16px 18px;outline:none}',
    '[data-vera] .agent-input button.send{border:none;border-left:1px solid var(--line);background:none;color:var(--text);font-family:"Spline Sans Mono",monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;padding:0 22px;cursor:pointer}',
    '[data-vera] .agent-input button.send:hover{background:var(--lime);color:#04070D}',
    '[data-vera] .v-note{margin-top:12px;font-size:13px;color:var(--mono)}',
    '[data-vera] .v-btn{font-family:"Spline Sans Mono",monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;border:1px solid var(--line);color:var(--text);background:none;padding:10px 14px;cursor:pointer}',
    '[data-vera] .v-btn:hover{border-color:var(--lime)}',
    '[data-vera] .v-btn.primary{background:var(--lime);border-color:var(--lime);color:#04070D}',
    '[data-vera] .v-btn[disabled]{opacity:.55;cursor:default}',
  ].join('\n');
  var styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  /* ------------------------------- markup -------------------------------- */
  mount.innerHTML =
    '<div class="agent-shell">'
    + '<div class="agent-bar"><span class="id"><i></i>' + CFG.who + '</span>'
    + '<div class="tools"><button class="v-btn" id="v-toggle" type="button">Voice: off</button></div></div>'
    + '<div class="v-chat" id="v-chat" aria-live="polite" aria-label="Conversation with Vera"></div>'
    + '<div class="v-chips" id="v-chips">'
    + CFG.chips.map(function (c) { return '<button class="chip" type="button">' + c + '</button>'; }).join('')
    + '</div>'
    + '<div class="agent-input">'
    + '<button class="icon" id="v-mic" type="button" title="Speak to Vera" aria-label="Speak to Vera" style="display:none">&#9679;</button>'
    + '<input id="v-q" type="text" placeholder="' + CFG.placeholder + '" autocomplete="off">'
    + '<button class="send" id="v-send" type="button">Send</button>'
    + '</div></div>'
    + '<p class="v-note" id="v-note">Live agent. If it ever goes quiet, you can always use the forms on this page.</p>';

  var chat = mount.querySelector('#v-chat');
  var input = mount.querySelector('#v-q');
  var mic = mount.querySelector('#v-mic');
  var toggle = mount.querySelector('#v-toggle');
  var note = mount.querySelector('#v-note');

  var history = [];
  var lead = {};
  var LIVE = { agent: false, voice: false };

  fetch('/api/health').then(function (r) { return r.json(); }).then(function (d) {
    LIVE.agent = !!d.agent; LIVE.voice = !!d.voice;
    if (LIVE.voice) { mic.style.display = ''; mic.classList.add('live'); toggle.textContent = 'Voice: start'; }
    if (!LIVE.agent) note.textContent = 'Vera is offline just now; the forms on this page still work.';
  }).catch(function () {});

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

    var values = { name: action.name || '', email: email, organisation: action.organisation || '', sector: action.sector || '', years: action.years || '', role: action.role || '' };
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
    html += '<label class="consent"><input type="checkbox" data-consent> <span>Keep my details and email me about early access (<a href="#privacy">privacy notice</a>)</span></label>'
      + '<button class="v-btn primary v-go" type="button">' + esc(spec.button) + '</button></div>';

    var bubble = el(html, 'agent');
    lastForm = bubble;
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
        t.textContent = d.reply; /* live model output is untrusted: never innerHTML */
        chat.scrollTop = chat.scrollHeight;
        history.push({ role: 'agent', content: d.reply });
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
        /* Create the Daily call ourselves so `useDevicePreferenceCookies:false` is
           pinned at the one place every entry path reads config from. Left to its
           own devices Daily restores whichever mic was used LAST — a nearby iPhone
           over Continuity, in the worst case — and Vera goes deaf with no error. */
        var Daily = ctx.dj.default || ctx.dj;
        var call = (Daily.getCallInstance && Daily.getCallInstance()) || Daily.createCallObject();
        live.call = call;
        var originalLoad = call.load.bind(call);
        call.load = function (props) {
          var next = props || {};
          next.dailyConfig = Object.assign({}, next.dailyConfig || {}, { useDevicePreferenceCookies: false });
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
              live.userBub.textContent = (live.userBub.textContent ? live.userBub.textContent + ' ' : '') + String(data.text).trim();
              chat.scrollTop = chat.scrollHeight;
            },
            onBotTtsText: function (data) {
              if (!data || !data.text) return;
              if (!live.botBub) { finaliseUser(); live.botBub = el('', 'agent'); live.botText = ''; }
              live.botText += (live.botText ? ' ' : '') + data.text;
              live.botBub.textContent = collapseRepeatedSentences(live.botText);
              chat.scrollTop = chat.scrollHeight;
            },
            onBotStoppedSpeaking: function () {
              /* NOT the end of the turn — each streamed sentence lands here. */
              if (live.settle) clearTimeout(live.settle);
              live.settle = setTimeout(finaliseBot, TURN_SETTLE_MS);
            },
            onServerMessage: function (data) {
              if (!data || data.type !== 'show_signup_form') return;
              showForm({
                intent: FORMS[data.intent] ? data.intent : DEFAULT_INTENT,
                name: data.name, email: data.email, organisation: data.organisation,
                sector: data.sector, years: data.years, role: data.role, products: data.products,
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

  agentSay(CFG.greeting, true);
})();
