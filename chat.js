// Concept assistant UI. Offline by default: answers come only from kb.js through chatcore.js, with citations.
// Live mode (Claude via the Apps Script) only with ?live=<script.google.com URL>&chat=live; the server does its own
// retrieval and grounding check, and the page checks the reply again before showing it.
// A/B: ?chat=on|off|ab (default on; ab = real 50/50 split; variant B = form + chat). The assistant submits the form only after the visitor clicks the consent button.
(() => {
  const C = window.ChatCore;
  if (!C) return;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const track = (e, p) => { try { window.__pageTrack ? window.__pageTrack(e, p) : (window.dataLayer = window.dataLayer || []).push({ event: e, ...p }); } catch { /* analytics optional */ } };
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

  // ---------- A/B ----------
  const params = new URLSearchParams(location.search);
  let variant = (params.get('chat') || '').toLowerCase();
  let source = 'url';
  // Demo default: chat on. ?chat=ab runs the real 50/50 split (sticky per browser).
  if (variant === 'ab') { variant = store.get('concept_chat'); source = 'stored'; if (!['on', 'off'].includes(variant)) { variant = Math.random() < 0.5 ? 'on' : 'off'; source = 'random'; } }
  else if (!['on', 'off', 'live'].includes(variant)) { variant = 'on'; source = 'default'; }
  const wantLive = variant === 'live';
  if (wantLive) variant = 'on';
  store.set('concept_chat', variant);
  track('ab_variant_assigned', { experiment: 'chat_assistant', variant: variant === 'on' ? 'b_form_plus_chat' : 'a_form_only', source });
  if (variant !== 'on') return;

  const liveParam = params.get('live') || '';
  const isAppsScript = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'script.google.com'; } catch { return false; } };
  const LIVE = wantLive && isAppsScript(liveParam) ? liveParam : '';

  // ---------- DOM ----------
  document.body.classList.add('has-chat');
  const launcher = document.createElement('button');
  launcher.type = 'button'; launcher.className = 'chat-launch'; launcher.setAttribute('aria-expanded', 'false'); launcher.setAttribute('aria-controls', 'chat-panel');
  launcher.innerHTML = '<span class="chat-dot" aria-hidden="true"></span>Ask about coverage';
  const panel = document.createElement('section');
  panel.id = 'chat-panel'; panel.className = 'chat'; panel.hidden = true; panel.setAttribute('aria-label', 'Concept assistant');
  panel.innerHTML = `
    <header class="chat-head">
      <div><h2>Ask about coverage</h2><p class="chat-label">Concept assistant · answers only from TRM's public pages</p></div>
      <button type="button" class="chat-x" aria-label="Close assistant">×</button>
    </header>
    <div class="chat-log" role="log" aria-live="polite"></div>
    <div class="chat-sugg" aria-label="Suggested questions"></div>
    <form class="chat-form"><label class="sr" for="chat-in">Your question</label><input id="chat-in" type="text" autocomplete="off" placeholder="Ask about chains, bridges, sanctions…" maxlength="500"><button type="submit" class="btn btn-primary">Ask</button></form>
    <p class="chat-foot">${LIVE ? 'Live · Claude Sonnet 5.5, grounded in retrieved excerpts' : `Offline · ${C.KB.length} approved excerpts`} · never share seed phrases or keys</p>`;
  document.body.append(launcher, panel);
  const log = $('.chat-log', panel), sugg = $('.chat-sugg', panel), form = $('.chat-form', panel), input = $('#chat-in', panel);
  const SUGG = ['Which chains do you cover?', "What's the difference between Forensics and Ardence?", 'How do you handle cross-chain bridges?', 'I was scammed, can you help?'];
  sugg.innerHTML = '<button type="button" class="chip-q chip-cta">Talk to a specialist</button>' + SUGG.map((q) => `<button type="button" class="chip-q">${esc(q)}</button>`).join('');
  sugg.querySelectorAll('.chip-q').forEach((b) => b.addEventListener('click', () => (b.classList.contains('chip-cta') ? startCapture('chip') : ask(b.textContent))));

  let opened = false;
  function setOpen(open) {
    panel.hidden = !open; launcher.setAttribute('aria-expanded', String(open));
    launcher.classList.toggle('on', open);
    if (open) {
      if (!opened) { opened = true; botSay({ sentences: [{ text: 'Hi. I answer from TRM’s public pages only, with a source for every point.', cites: [] }, { text: 'Pick a question or type your own.', cites: [] }], citations: [] }, null); }
      track('chat_open', {}); setTimeout(() => input.focus(), 50);
    }
  }
  launcher.addEventListener('click', () => setOpen(panel.hidden));
  // the Under the hood panel and the chat share the right edge: opening one closes the other
  const uth = document.getElementById('uth-toggle');
  if (uth) uth.addEventListener('click', () => { if (!panel.hidden) setOpen(false); });
  $('.chat-x', panel).addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) setOpen(false); });

  // ---------- messages ----------
  function userSay(text) {
    const d = document.createElement('div'); d.className = 'msg msg-user'; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight;
  }
  function botSay(reply, meta) {
    const d = document.createElement('div'); d.className = 'msg msg-bot' + (reply.kind === 'victim' ? ' msg-victim' : reply.kind === 'secret' ? ' msg-warn' : '');
    const cite = (n) => { const c = reply.citations.find((x) => x.n === n); return c ? `<a class="cite" href="${esc(c.url)}" target="_blank" rel="noopener" title="${esc(c.title)}">${n}</a>` : ''; };
    d.innerHTML = reply.sentences.map((s) => `<span class="sent">${esc(s.text)}${s.link ? ` <a href="${esc(s.link)}" target="_blank" rel="noopener">${esc(s.link.replace('https://', ''))}</a>` : ''}${s.cites.map(cite).join('')}</span>`).join(' ') +
      (reply.citations.length ? `<div class="srcs">${reply.citations.map((c) => `<a class="src" href="${esc(c.url)}" target="_blank" rel="noopener"><b>${c.n}</b>${esc(c.title)} ↗</a>`).join('')}</div>` : '') +
      (meta && meta.mode ? `<div class="msg-meta">${esc(meta.mode)}${meta.grounded === false ? ' · ungrounded answer blocked' : ''}</div>` : '');
    log.appendChild(d);
    if (reply.offerHandoff || (meta && meta.offerHandoff)) offerHandoff();
    log.scrollTop = log.scrollHeight;
  }

  // ---------- handoff to the form (prefill only; the visitor confirms and submits) ----------
  const learned = { topics: [], company: '' };
  const NEED = { screening: 'Wallet screening', monitoring: 'Transaction monitoring', sanctions: 'Sanctions compliance', forensics: 'Investigations', ardence: 'Investigations', 'due-diligence': 'Entity due diligence', bridges: 'Wallet screening', coverage: 'Wallet screening', attribution: 'Investigations', stablecoins: 'Transaction monitoring' };
  const topNeed = () => {
    const counts = {};
    learned.topics.forEach((t) => { if (NEED[t]) counts[NEED[t]] = (counts[NEED[t]] || 0) + 1; });
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || '';
  };
  let handoffOffered = false;
  function offerHandoff() {
    if (handoffOffered) return;
    handoffOffered = true;
    const d = document.createElement('div'); d.className = 'msg msg-bot msg-handoff';
    d.innerHTML = '<span class="sent">Want to talk to a specialist? I can ask a few quick questions here, or prefill the form for you.</span><div class="ho-btns"><button type="button" class="btn btn-primary ho-chat">Ask me here</button><button type="button" class="ib ho-yes">Prefill the form</button><button type="button" class="ib ho-no">Not now</button></div>';
    log.appendChild(d); log.scrollTop = log.scrollHeight;
    $('.ho-chat', d).addEventListener('click', () => { d.querySelector('.ho-btns').remove(); startCapture('handoff'); });
    $('.ho-yes', d).addEventListener('click', () => { prefill(); d.querySelector('.ho-btns').remove(); });
    $('.ho-no', d).addEventListener('click', () => { d.querySelector('.ho-btns').remove(); handoffOffered = false; track('chat_handoff', { accepted: false }); });
  }
  function prefill() {
    const need = topNeed() || 'Just exploring';
    const sel = $('#f-need'), co = $('#f-company');
    if (sel) { sel.value = need; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    if (co && learned.company && !co.value) { co.value = learned.company; co.dispatchEvent(new Event('input', { bubbles: true })); co.dispatchEvent(new Event('blur')); }
    const demo = $('#demo');
    if (demo) demo.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => { const em = $('#f-email'); if (em) em.focus({ preventScroll: true }); }, 400);
    const note = $('#chat-prefill-note') || Object.assign(document.createElement('p'), { id: 'chat-prefill-note', className: 'hint warn' });
    note.textContent = 'Prefilled by the assistant: please check these fields, add your details and tick consent yourself.';
    const lead = $('#lead'); if (lead && !note.isConnected) lead.prepend(note);
    track('chat_handoff', { accepted: true, need_prefilled: need, company_prefilled: !!learned.company });
    botSay({ sentences: [{ text: `Done: I set “${need}”${learned.company ? ' and your company' : ''} in the form below.`, cites: [] }, { text: 'Nothing is sent until you submit it yourself.', cites: [] }], citations: [] }, null);
  }
  const COMPANY = /\b(?:[Ii]'?m|[Ii] am|[Ww]e'?re|[Ww]e are|[Ii] work)\s+(?:from|at|with)\s+([A-Z][\w&.\- ]{1,40}?)(?=[,.!?]|\s+(?:and|we|i|looking|interested)\b|$)/;

  // ---------- capture flow: ask the form's questions one at a time, write each answer into the real form ----------
  // The form stays the single source of truth: same fields, same score, same routing, same send/outbox path.
  // Answers never go to analytics (field names only). The form is submitted only when the visitor clicks "Yes, contact me".
  const FF = { email: $('#f-email'), first: $('#f-first'), last: $('#f-last'), company: $('#f-company'), role: $('#f-role'), need: $('#f-need'), msg: $('#f-msg'), consent: $('#f-consent') };
  const NEEDS = FF.need ? [...FF.need.options].map((o) => o.value).filter((v) => v && v !== 'victim') : [];
  const FREE = (window.DEFINITIONS && window.DEFINITIONS.exclusions.free_email_domains) || [];
  const STEPS = [
    { key: 'email', ask: 'What’s your work email?', ph: 'name@company.com', check: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'That doesn’t look like an email. Try again?') },
    { key: 'first', ask: 'Your first name?', ph: 'First name' },
    { key: 'last', ask: 'And your last name?', ph: 'Last name' },
    { key: 'company', ask: 'Which company are you with?', ph: 'Company' },
    { key: 'role', ask: 'What’s your job title?', ph: 'e.g. Head of Compliance' },
    { key: 'need', ask: 'What do you need most?', chips: () => NEEDS },
    { key: 'msg', ask: 'Anything else the specialist should know? (optional)', ph: 'Optional', chips: () => ['Skip'] },
  ];
  let cap = null;   // { i, source } while the flow runs
  const fill = (k, v) => { const el = FF[k]; if (!el) return; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'blur')); };
  function chipsMsg(list, onPick) {
    const d = document.createElement('div'); d.className = 'msg msg-bot cap-chips';
    d.innerHTML = list.map((t) => `<button type="button" class="chip-q">${esc(t)}</button>`).join('');
    d.querySelectorAll('.chip-q').forEach((b) => b.addEventListener('click', () => { d.remove(); onPick(b.textContent); }));
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  }
  const say = (...lines) => botSay({ sentences: lines.map((text) => ({ text, cites: [] })), citations: [] }, null);
  function startCapture(source) {
    if (cap || !FF.email) return;
    if (panel.hidden) setOpen(true);
    cap = { i: -1, source };
    track('chat_capture_start', { source });
    say(`Great. I’ll ask up to ${STEPS.length} quick questions and fill the demo form as we go.`, 'Type “stop” any time.');
    nextStep();
  }
  function nextStep() {
    cap.i++;
    if (STEPS[cap.i] && STEPS[cap.i].key === 'company' && learned.company) {
      if (FF.company.value !== learned.company) { fill('company', learned.company); say(`I have your company as ${learned.company}.`); }
      cap.i++;
    }
    if (cap.i >= STEPS.length) return askConsent();
    const st = STEPS[cap.i];
    input.placeholder = st.ph || 'Pick one above';
    say(st.ask);
    if (st.chips) {
      let list = st.chips();
      const top = st.key === 'need' && topNeed();
      if (top) list = [top, ...list.filter((x) => x !== top)];   // suggest what they asked about first
      chipsMsg(list, answer);
    }
    setTimeout(() => input.focus(), 30);
  }
  function answer(raw) {
    const text = String(raw || '').trim();
    if (!text) return;
    const red = C.redactSecrets(text);
    userSay(red.text);
    if (/^(stop|cancel|quit)$/i.test(text)) { endCapture('stopped'); say('Stopped. Nothing was sent.', 'What you typed stays in the form below; you can clear it there.'); return; }
    if (C.isVictim(red.text)) { endCapture('victim'); track('victim_support', { source: 'chat_capture' }); botSay(C.FIXED.victim, { mode: 'fixed reply' }); return; }
    if (red.found.length) { track('chat_secret_redacted', { kinds: red.found }); say('Please don’t share seed phrases or keys. I removed it. Try that answer again.'); return; }
    const st = STEPS[cap.i];
    const err = st.check ? st.check(red.text) : '';
    if (err) { say(err); return; }
    if (st.key === 'need' && !NEEDS.includes(red.text)) { say('Pick one of the options above.'); chipsMsg(NEEDS, answer); return; }
    const v = st.key === 'msg' && /^skip$/i.test(red.text) ? '' : red.text;
    fill(st.key, v);
    if (st.key === 'company') learned.company = v;
    track('chat_capture_step', { field: st.key });   // field name only, never the value
    if (st.key === 'email' && FREE.includes((v.split('@')[1] || '').toLowerCase())) say('That looks like a personal email. It works, but a work email gets you to a specialist faster.');
    log.querySelectorAll('.cap-chips').forEach((x) => x.remove());
    nextStep();
  }
  function askConsent() {
    input.placeholder = 'Use the buttons above';
    const d = document.createElement('div'); d.className = 'msg msg-bot msg-handoff';
    d.innerHTML = `<span class="sent">Last one: can a TRM specialist contact you about this request? You can opt out of marketing emails any time.</span><div class="ho-btns"><button type="button" class="btn btn-primary cs-yes">Yes, contact me</button><button type="button" class="ib cs-no">No</button></div>`;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
    $('.cs-no', d).addEventListener('click', () => { d.querySelector('.ho-btns').remove(); userSay('No'); endCapture('no_consent'); say('No problem. Nothing was sent.'); });
    $('.cs-yes', d).addEventListener('click', () => {
      d.querySelector('.ho-btns').remove(); userSay('Yes, contact me');
      FF.consent.checked = true; FF.consent.dispatchEvent(new Event('change'));
      const form = $('#lead'); form.dataset.source = 'chat';
      form.requestSubmit();
      form.dataset.source = '';
      const s = window.__lastLead;
      endCapture(s ? 'submitted' : 'invalid');
      if (!s) { say('Something is missing in the form. Please check it below.'); $('#demo').scrollIntoView({ block: 'start' }); return; }
      const where = s.saved === 'sheet' ? 'Saved to the concept Google Sheet.' : 'Offline: saved in this browser’s outbox (Under the hood → Outbox).';
      if (s.sc.status === 'mql') say(`Thanks, ${FF.first.value.trim()}. You’re with the ${s.routing.team}.`, `A specialist for ${s.routing.region} will reach out, target within ${s.routing.sla} minutes in business hours.`, where);
      else say(`Thanks, ${FF.first.value.trim()}. We’ll send a short guide first, then a specialist follows up.`, where);
    });
  }
  function endCapture(outcome) { if (!cap) return; track('chat_capture_done', { outcome, source: cap.source }); cap = null; input.placeholder = 'Ask about chains, bridges, sanctions…'; log.querySelectorAll('.cap-chips').forEach((x) => x.remove()); }
  window.__chatCapture = startCapture;   // used by the headless tests

  // ---------- QA log (output verification, for Under the hood) ----------
  const qa = [];
  function renderQA() {
    const p = $('#p-chatqa'); if (!p) return;
    p.innerHTML = `<p class="muted">Chat QA · one row per answer · retrieved chunk ids, scores and the grounding check · no message text stored</p>` + (qa.length ? qa.slice().reverse().map((r) => `
      <div class="ev qa"><span class="t">#${r.n}</span> <span class="n">${esc(r.kind)}</span> <span class="muted">intent: ${esc(r.intent)} · mode: ${esc(r.mode)}</span>
      <pre>${r.retrieved.length ? r.retrieved.map((x) => `${x.id}  score ${x.score}${x.used ? '  ← cited' : ''}`).join('\n') : '(no retrieval: fixed reply)'}</pre>
      <div class="${r.grounded === null ? 'qa-na' : r.grounded ? 'qa-ok' : 'qa-bad'}">grounded: ${r.grounded === null ? 'n/a (fixed reply)' : r.grounded} ${r.checks ? '· ' + r.checks.map((c) => (c.valid ? '✓' : '✗') + '[' + c.cites.join(',') + ']').join(' ') : ''}</div></div>`).join('') : '<p>No answers yet. Ask the assistant a question.</p>');
  }
  window.__chatQA = { render: renderQA, rows: qa };

  function record(r, reply, mode, grounded, checks) {
    const used = new Set((reply.citations || []).map((c) => c.id));
    qa.push({ n: qa.length + 1, kind: reply.kind, intent: r.intent, mode, grounded, checks, retrieved: r.retrieved ? r.retrieved.results.slice(0, 5).map((x) => ({ id: x.id, score: x.score, used: used.has(x.id) })) : [] });
    renderQA();
  }

  // ---------- ask ----------
  let productQs = 0;
  async function ask(raw) {
    const text = String(raw || '').trim();
    if (!text) return;
    const r = C.route(text);                       // guards run before any retrieval
    userSay(r.redacted);                           // secrets never reach the screen, logs or the server
    const m = r.redacted.match(COMPANY); if (m) learned.company = m[1].trim();
    track('chat_question', { intent: r.intent });

    if (r.intent === 'victim') { track('victim_support', { source: 'chat' }); botSay(r.reply, { mode: 'fixed reply' }); record(r, r.reply, 'fixed', null); return; }
    if (r.intent === 'secret') { track('chat_secret_redacted', { kinds: r.secretKinds }); botSay(r.reply, { mode: 'fixed reply' }); record(r, r.reply, 'fixed', null); return; }
    if (r.intent === 'handoff') { record(r, { kind: 'handoff', citations: [] }, 'fixed', null); offerHandoff(); return; }
    if (r.intent === 'pricing' || r.intent === 'legal') { track('chat_fallback', { reason: r.intent }); botSay(r.reply, { mode: 'fixed reply' }); record(r, r.reply, 'fixed', null); return; }

    if (C.PRODUCT_TOPICS.includes(r.intent)) { productQs++; learned.topics.push(r.intent); }
    let reply = r.reply, mode = 'offline', grounded = reply.kind === 'answer' ? true : null, checks = null;

    if (LIVE && reply.kind === 'answer') {
      const typing = document.createElement('div'); typing.className = 'msg msg-bot typing'; typing.textContent = '…'; log.appendChild(typing);
      try {
        const res = await fetch(LIVE, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ type: 'chat', question: r.redacted }) });
        const j = await res.json();
        if (j && j.ok && j.answer && Array.isArray(j.citations)) {
          // check the server's answer again on the page before showing it
          const g = C.checkGrounding(j.answer, j.citations.length);
          checks = g.rows;
          if (g.grounded) { reply = { kind: 'answer', sentences: C.parseCited(j.answer), citations: j.citations }; mode = 'live'; grounded = true; }
          else { grounded = false; mode = 'live → offline'; track('ungrounded_answer_blocked', { where: 'page' }); }
        } else if (j && j.fallback) { mode = 'live → offline (' + j.fallback + ')'; }
      } catch { mode = 'offline (live unreachable)'; track('chat_fallback', { reason: 'live_error' }); }
      typing.remove();
    }
    if (reply.kind === 'fallback') track('chat_fallback', { reason: r.fallbackReason || 'no_answer' });
    else track('chat_answer', { chunk_ids: reply.citations.map((c) => c.id), grounded: grounded !== false, mode });
    botSay(reply, { mode, grounded });
    record(r, reply, mode, grounded, checks || (reply.kind === 'answer' ? reply.sentences.map((s) => ({ cites: s.cites, valid: s.cites.length > 0 })) : null));
    if (productQs >= 2) offerHandoff();
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; if (cap) answer(v); else ask(v); });
  window.__chatAsk = ask;   // used by the headless tests
  renderQA();
})();
