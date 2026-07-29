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

  /* --------------- voice ladder: Gemini Live -> Web Speech ---------------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var GENAI_CDN = 'https://cdn.jsdelivr.net/npm/@google/genai@2.11.0/+esm'; /* pinned; keep in step with package.json */
  var WORKLET_SRC = "class P extends AudioWorkletProcessor{process(inputs){var ch=inputs[0][0];if(ch)this.port.postMessage(ch.slice(0));return true;}}registerProcessor('pcm-forwarder',P);";
  var live = { session: null, ctxIn: null, ctxOut: null, stream: null, sources: [], cursor: 0, timer: null, userBub: null, agentBub: null };

  function vlog(stage, detail) {
    try {
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: SITE + ':' + stage, detail: detail || {} }),
      });
    } catch (e) {}
  }
  function b64FromBuf(buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function playPcm(b64) {
    if (!live.ctxOut) return;
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var i16 = new Int16Array(bytes.buffer), f32 = new Float32Array(i16.length);
    for (var j = 0; j < i16.length; j++) f32[j] = i16[j] / 32768;
    var ab = live.ctxOut.createBuffer(1, f32.length, 24000);
    ab.getChannelData(0).set(f32);
    var s = live.ctxOut.createBufferSource();
    s.buffer = ab;
    s.connect(live.dest || live.ctxOut.destination);
    live.cursor = Math.max(live.ctxOut.currentTime, live.cursor);
    s.start(live.cursor);
    live.cursor += ab.duration;
    live.sources.push(s);
    s.onended = function () { var k = live.sources.indexOf(s); if (k > -1) live.sources.splice(k, 1); };
  }
  function stopPlayback() { live.sources.forEach(function (s) { try { s.stop(); } catch (e) {} }); live.sources = []; live.cursor = 0; }
  function transcript(role, text) {
    var key = role === 'user' ? 'userBub' : 'agentBub';
    if (!live[key]) live[key] = el('', role);
    live[key].textContent += text;
    chat.scrollTop = chat.scrollHeight;
  }
  function finaliseTranscripts() {
    if (live.userBub && live.userBub.textContent) history.push({ role: 'user', content: live.userBub.textContent });
    if (live.agentBub && live.agentBub.textContent) history.push({ role: 'agent', content: live.agentBub.textContent });
    live.userBub = live.agentBub = null;
  }
  function onLiveMessage(msg) {
    if (msg.data) playPcm(msg.data);
    var sc = msg.serverContent;
    if (sc) {
      if (sc.interrupted) stopPlayback();
      if (sc.inputTranscription && sc.inputTranscription.text) transcript('user', sc.inputTranscription.text);
      if (sc.outputTranscription && sc.outputTranscription.text) transcript('agent', sc.outputTranscription.text);
      if (sc.turnComplete) finaliseTranscripts();
    }
    if (msg.toolCall && msg.toolCall.functionCalls) {
      msg.toolCall.functionCalls.forEach(function (fc) {
        if (fc.name !== 'show_signup_form') return;
        var a = fc.args || {};
        showForm({
          intent: FORMS[a.intent] ? a.intent : DEFAULT_INTENT,
          name: a.name, email: a.email, organisation: a.organisation,
          sector: a.sector, years: a.years, role: a.role, products: a.products,
        });
        try { live.session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: 'form_shown_awaiting_human_click' } }] }); } catch (e) {}
      });
    }
    if (msg.goAway) stopLive('Voice session ending. Tap the mic to reconnect.');
  }
  function stopLive(notice) {
    if (live.timer) { clearTimeout(live.timer); live.timer = null; }
    if (live.connBub) { live.connBub.textContent = 'Voice did not connect this time.'; live.connBub = null; }
    stopPlayback();
    finaliseTranscripts();
    if (live.session) { var s = live.session; live.session = null; try { s.close(); } catch (e) {} }
    if (live.stream) { live.stream.getTracks().forEach(function (t) { t.stop(); }); live.stream = null; }
    if (live.audioEl) { try { live.audioEl.pause(); } catch (e) {} live.audioEl = null; live.dest = null; }
    if (live.ctxIn) { live.ctxIn.close().catch(function () {}); live.ctxIn = null; }
    if (live.ctxOut) { live.ctxOut.close().catch(function () {}); live.ctxOut = null; }
    mic.classList.remove('rec');
    refreshVoiceUi();
    if (notice) agentSay(notice, true);
  }
  function refreshVoiceUi() {
    if (live.session) toggle.textContent = 'Voice: live · stop';
    else if (LIVE.voice) toggle.textContent = 'Voice: start';
    else toggle.textContent = 'Voice: ' + (voiceOn ? 'on' : 'off');
  }
  function acquireMic() {
    var base = { channelCount: 1, echoCancellation: true, noiseSuppression: true };
    return navigator.mediaDevices.getUserMedia({ audio: base }).then(function (stream) {
      var isMobile = (navigator.userAgentData && navigator.userAgentData.mobile) || /iPhone|iPad|Android|Mobi/i.test(navigator.userAgent);
      if (isMobile) return stream; /* on a phone the phone mic is the right mic */
      var label = (stream.getAudioTracks()[0] || {}).label || '';
      if (/headphone|headset|airpod|earbud/i.test(label)) return stream; /* a worn mic is the best mic */
      if (!/phone|ipad|continuity/i.test(label)) return stream;
      /* macOS Continuity has hijacked the default input with a nearby phone */
      return navigator.mediaDevices.enumerateDevices().then(function (devs) {
        var ins = devs.filter(function (d) { return d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default'; });
        var builtin = ins.filter(function (d) { return /built-?in|macbook|internal/i.test(d.label); })[0]
          || ins.filter(function (d) { return !/phone|ipad|continuity/i.test(d.label); })[0];
        if (!builtin) return stream;
        stream.getTracks().forEach(function (t) { t.stop(); });
        return navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: builtin.deviceId }, channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      });
    });
  }
  function startLive() {
    mic.classList.add('rec');
    toggle.textContent = 'Voice: connecting…';
    /* the output context is created synchronously inside the click: made after an
       await, Chrome may treat the gesture as expired and start it suspended = silent Vera */
    live.ctxOut = new AudioContext({ sampleRate: 24000 });
    /* play through an <audio> element so Chrome's echo canceller sees it; raw Web
       Audio output loops back into the mic and Vera interrupts herself */
    live.dest = live.ctxOut.createMediaStreamDestination();
    live.audioEl = document.createElement('audio');
    live.audioEl.srcObject = live.dest.stream;
    live.audioEl.play().catch(function () {});
    live.connBub = el('<span class="typing"><i></i><i></i><i></i></span>&nbsp; Connecting you to Vera&hellip;', 'agent');
    vlog('start', { secure: window.isSecureContext });
    /* mic permission first: a denial must not burn a rate-limited token mint */
    return acquireMic()
      .then(function (stream) {
        live.stream = stream;
        return fetch('/api/voice/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ site: SITE }) });
      })
      .then(function (r) { if (!r.ok) throw new Error('mint ' + r.status); return r.json(); })
      .then(function (d) {
        return import(GENAI_CDN).then(function (mod) {
          if (live.ctxOut.state === 'suspended') live.ctxOut.resume().catch(function () {});
          var ai = new mod.GoogleGenAI({ apiKey: d.token, httpOptions: { apiVersion: 'v1alpha' } });
          return ai.live.connect({
            model: d.model,
            config: { responseModalities: ['AUDIO'] }, /* everything else is locked in the token */
            callbacks: {
              onmessage: onLiveMessage,
              onerror: function () { stopLive('Voice hit a snag. Press Voice to try again, or just type.'); },
              onclose: function (e) {
                var reason = String((e && e.reason) || '');
                if (live.session) {
                  stopLive(/exhaust|quota/i.test(reason)
                    ? 'Vera’s voice is over its usage limit for the moment. Give it a minute and press Voice again, or just type.'
                    : undefined);
                }
              },
            },
          });
        });
      })
      .then(function (session) {
        live.session = session;
        live.ctxIn = new AudioContext({ sampleRate: 16000 });
        var srcNode = live.ctxIn.createMediaStreamSource(live.stream);
        return live.ctxIn.audioWorklet
          .addModule(URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'text/javascript' })))
          .then(function () {
            var node = new AudioWorkletNode(live.ctxIn, 'pcm-forwarder');
            node.port.onmessage = function (e) {
              if (!live.session) return;
              var f32 = e.data, i16 = new Int16Array(f32.length);
              for (var i = 0; i < f32.length; i++) { var v = Math.max(-1, Math.min(1, f32[i])); i16[i] = v < 0 ? v * 0x8000 : v * 0x7FFF; }
              try { live.session.sendRealtimeInput({ audio: { data: b64FromBuf(i16.buffer), mimeType: 'audio/pcm;rate=16000' } }); } catch (e2) {}
            };
            srcNode.connect(node);
            refreshVoiceUi();
            if (live.connBub) { live.connBub.textContent = 'You are through to Vera.'; live.connBub = null; }
            /* nudge Vera to open: one short greeting, then wait */
            try {
              live.session.sendClientContent({
                turns: [{ role: 'user', parts: [{ text: '(The visitor has just connected by voice. Greet them in one short sentence, ask whether you may use their first name and what it is, then wait.)' }] }],
                turnComplete: true,
              });
            } catch (e) {}
            live.timer = setTimeout(function () { stopLive('Voice session ended (five minute cap). Tap the mic to carry on.'); }, 300000);
          });
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
    if (live.session) { stopLive(); return; }
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
    if (live.session || (LIVE.voice && window.isSecureContext)) { voiceFlow(); return; }
    voiceOn = !voiceOn;
    refreshVoiceUi();
    if (!voiceOn && window.speechSynthesis) speechSynthesis.cancel();
  });

  agentSay(CFG.greeting, true);
})();
