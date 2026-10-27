// Concept page logic. Demo mode (default): nothing is sent anywhere; every "would send" is shown in the Under the hood panel.
// Live mode: set LIVE_ENDPOINT to a Google Apps Script web app URL (or pass ?live=<url> for testing) and consented,
// non-victim submissions are POSTed there as text/plain JSON. See README.md.
const LIVE_ENDPOINT = '';

(() => {
  const D = window.DEFINITIONS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  const t0 = performance.now();

  // ---------- torn paper edges (seeded so they look the same every load) ----------
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  $$('[data-torn]').forEach((el) => {
    const pts = [];
    const n = 28, j = 1.6;
    for (let i = 0; i <= n; i++) pts.push(`${(i / n) * 100}% ${rnd() * j}%`);
    for (let i = 0; i <= n; i++) pts.push(`${100 - rnd() * j}% ${(i / n) * 100}%`);
    for (let i = n; i >= 0; i--) pts.push(`${(i / n) * 100}% ${100 - rnd() * j}%`);
    for (let i = n; i >= 0; i--) pts.push(`${rnd() * j}% ${(i / n) * 100}%`);
    el.style.clipPath = `polygon(${pts.join(',')})`;
  });

  // ---------- tracking: dataLayer + event log ----------
  window.dataLayer = window.dataLayer || [];
  const events = [];
  function track(name, payload = {}) {
    const ev = { event: name, t: ((performance.now() - t0) / 1000).toFixed(1) + 's', ...payload };
    window.dataLayer.push(ev);
    events.push(ev);
    renderEvents();
  }

  // ---------- A/B variant ----------
  const params = new URLSearchParams(location.search);
  let variant = (params.get('v') || '').toLowerCase();
  let variantSource = 'url';
  if (!['a', 'b'].includes(variant)) {
    variant = store.get('concept_ab');
    variantSource = 'stored';
    if (!['a', 'b'].includes(variant)) { variant = Math.random() < 0.5 ? 'a' : 'b'; variantSource = 'random'; }
  }
  store.set('concept_ab', variant);
  const HEADLINES = {
    a: 'Indirect exposure doesn\'t stop at a bridge. <span class="hl">Neither does your screening.</span>',
    b: '184+ blockchains. 1.9 billion assets. <span class="hl">One risk score you tune.</span>',
  };
  const h1 = $('#hero-h1');
  h1.innerHTML = HEADLINES[variant];
  h1.dataset.variant = variant;

  // ---------- UTMs + campaign ----------
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const utm = {};
  UTM_KEYS.forEach((k) => { utm[k] = params.get(k) || ''; $('#' + k).value = utm[k]; });
  const campaignId = D.crm.sfdc_campaign_id;

  // ---------- live mode (optional) ----------
  // ?live= only accepts Google Apps Script URLs, so a crafted link can't send form data to another host.
  const liveParam = params.get('live') || '';
  const isAppsScript = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'script.google.com'; } catch { return false; } };
  const liveUrl = isAppsScript(liveParam) ? liveParam : (LIVE_ENDPOINT && isAppsScript(LIVE_ENDPOINT) ? LIVE_ENDPOINT : '');
  const LIVE = Boolean(liveUrl);
  if (liveParam && !isAppsScript(liveParam)) console.warn('?live ignored: only https://script.google.com URLs are accepted');
  if (LIVE) {
    $('#mode-li').innerHTML = '<b>Live mode.</b> Submissions with consent go to a Google Sheet for this concept. Open <b>Under the hood</b> to see exactly what is sent.';
    $('#consent-mode').textContent = '(Concept page: your answers are saved to a Google Sheet.)';
    $('#formnote').textContent = 'Concept page · live mode · sends to a Google Sheet';
    $('#uth-mode').textContent = 'What this page sends, scores and routes. Live mode: consented, non-victim submits go to a Google Sheet.';
  }

  window.__pageTrack = track;
  track('page_view', { page: 'crypto-business/demo (concept)', variant, ...Object.fromEntries(Object.entries(utm).filter(([, v]) => v)) });
  track('ab_variant_assigned', { experiment: 'hero_headline', variant, source: variantSource });

  let ranScreen = false;   // set when a wallet screen finishes (see onScored); worth points in the score
  $('#cta-hero').addEventListener('click', () => { track('cta_click', { cta: 'hero_run_sample', variant }); if (window.heroGlobe) window.heroGlobe.play(0); });
  $$('a[href="#demo"]').forEach((a) => a.addEventListener('click', () => track('cta_click', { cta: 'request_demo', variant })));

  // ---------- survey numbers count up once on scroll-in ----------
  const sayNums = $$('[data-count]');
  if (sayNums.length) {
    const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      if (rm) return;
      const el = e.target, end = +el.dataset.count, t0 = performance.now();
      const step = (now) => { const p = Math.min(1, (now - t0) / 1100); el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))) + '%'; if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }), { threshold: 0.6 });
    sayNums.forEach((n) => io.observe(n));
  }

  // ---------- investigation panel ----------
  const invRoot = $('[data-inv]');
  if (invRoot && window.InvWidget) {
    const IW = window.InvWidget;
    const lastRisk = {};
    const cardsEl = $('[data-wcards]');
    const renderCards = (active) => {
      cardsEl.innerHTML = IW.SAMPLES.map((s, i) => {
        const r = lastRisk[i];
        return `<button type="button" class="wcard" data-w="${i}" aria-pressed="${active === i}">
          <span class="wc-chain c-${s.chain.toLowerCase()}">${IW.svgIcon(s.chain, IW.CHAIN_ICON)}</span>
          <span class="wc-body"><span class="wc-addr">${s.addr}</span><span class="wc-lab">${s.label}</span></span>
          <span class="wc-pill ${r ? 'p-' + r.k : 'p-none'}">${r ? r.label : 'not run'}</span></button>`;
      }).join('');
      $$('.wcard', cardsEl).forEach((b) => b.addEventListener('click', () => runSample(+b.dataset.w, 'wallet_card')));
    };
    let current = null;
    const onScored = (scn, res) => {
      ranScreen = true; refreshScore();
      if (scn.sampleIdx != null) { lastRisk[scn.sampleIdx] = IW.band(res.score); renderCards(scn.sampleIdx); }
    };
    const widget = IW.create(invRoot, { track, onDone: onScored, onRescore: onScored });
    const preview = $('[data-preview]');
    const video = $('[data-pv]');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function goLive() {
      if (!invRoot.hidden) return;
      preview.hidden = true; invRoot.hidden = false;
      try { video.pause(); } catch { /* no video */ }
    }
    function runSample(i, source) {
      goLive(); current = i; renderCards(i);
      widget.run({ ...IW.SAMPLES[i], sampleIdx: i }, { source });
      if (window.heroGlobe) window.heroGlobe.play(i);
    }
    window.__runSample = runSample;
    renderCards(null);
    $('[data-pv-run]').addEventListener('click', () => runSample(0, 'preview_button'));
    $('#cta-hero').addEventListener('click', () => runSample(0, 'hero_cta'));
    // the walkthrough film is the preview; it plays only on screen, and only without reduced motion
    let videoOk = !!video && !!video.querySelector('source');
    const autoRun = () => { if (invRoot.hidden) runSample(0, 'auto_scroll'); };
    if (video) {
      video.addEventListener('error', () => { videoOk = false; }, true);
      video.querySelector('source') && video.querySelector('source').addEventListener('error', () => { videoOk = false; });
    }
    new IntersectionObserver((es) => {
      const vis = es[0].isIntersecting;
      if (!invRoot.hidden) return;
      if (!videoOk || video.readyState === 0 && video.networkState === 3) { if (vis) autoRun(); return; }
      if (reducedMotion) return;           // poster only
      if (vis) video.play().catch(() => {}); else video.pause();
    }, { threshold: 0.35 }).observe($('.inv-stage'));
  }

  // ---------- form ----------
  const form = $('#lead');
  const F = {
    email: $('#f-email'), first: $('#f-first'), last: $('#f-last'), company: $('#f-company'),
    role: $('#f-role'), need: $('#f-need'), msg: $('#f-msg'), consent: $('#f-consent'),
  };
  let started = false;
  const completed = new Set();
  form.addEventListener('focusin', () => { if (!started) { started = true; track('form_start', { variant }); } });
  Object.entries(F).forEach(([k, el]) => {
    const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'blur';
    el.addEventListener(ev, () => {
      const filled = el.type === 'checkbox' ? el.checked : el.value.trim() !== '';
      if (filled && !completed.has(k)) {
        completed.add(k);
        // never put personal data in analytics: field name only
        track(k === 'consent' ? 'consent_given' : 'field_complete', { field: k });
      }
      refreshScore();
    });
    el.addEventListener('input', refreshScore);
  });

  const domainOf = (e) => (e.split('@')[1] || '').toLowerCase().trim();
  const isFree = (e) => D.exclusions.free_email_domains.includes(domainOf(e));
  const isSpam = (e) => D.exclusions.spam_patterns.some((p) => e.toLowerCase().includes(p));
  const isVictim = () => F.need.value === D.exclusions.victim_need ||
    D.exclusions.victim_keywords.some((k) => F.msg.value.toLowerCase().includes(k));
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

  F.email.addEventListener('input', () => {
    const e = F.email.value.trim();
    const h = $('#h-email');
    if (e && validEmail(e) && isFree(e)) { h.className = 'hint warn'; h.textContent = 'Looks like a personal email. A work email routes you to the right team faster.'; }
    else { h.className = 'hint'; h.textContent = ''; }
  });

  function roleBucket(title) {
    const t = title.toLowerCase();
    for (const [name, r] of Object.entries(D.scoring.role)) if (r.match.some((m) => t.includes(m))) return [name, r.points];
    return ['other', 0];
  }

  function computeScore() {
    const S = D.scoring;
    const e = F.email.value.trim();
    const rows = [];
    const [bucket, rp] = F.role.value.trim() ? roleBucket(F.role.value) : ['(no title yet)', 0];
    rows.push(['role: ' + bucket, rp]);
    rows.push(['need: ' + (F.need.value && F.need.value !== 'victim' ? F.need.value : '—'), S.need[F.need.value] ?? 0]);
    rows.push(['work email', e && validEmail(e) && !isFree(e) ? S.work_email : 0]);
    rows.push(['ran a sample screen', ranScreen ? S.ran_sample_screen : 0]);
    rows.push(['wrote a message', F.msg.value.trim() && !isVictim() ? S.wrote_message : 0]);
    const total = rows.reduce((a, [, p]) => a + p, 0);
    let status = 'lead';
    let reason = `below MQL threshold (${S.mql_threshold})`;
    if (isVictim()) { status = 'excluded'; reason = 'victim report: route to support, never to sales'; }
    else if (e && isSpam(e)) { status = 'excluded'; reason = 'spam pattern'; }
    else if (e && isFree(e)) { status = 'lead'; reason = 'free email: nurture until enriched'; }
    else if (total >= S.mql_threshold) { status = 'mql'; reason = `score ≥ ${S.mql_threshold}`; }
    return { rows, total, status, reason };
  }

  function region(email) {
    const tld = domainOf(email).split('.').pop();
    for (const [r, list] of Object.entries(D.routing.regions)) if (list.includes(tld)) return r;
    return D.routing.default_region;
  }

  function buildRecord(sc) {
    const e = F.email.value.trim();
    const now = new Date().toISOString();
    const lifecycle = sc.status === 'mql' ? 'marketingqualifiedlead' : sc.status === 'excluded' ? 'other' : 'lead';
    const hubspot = {
      email: e, firstname: F.first.value.trim(), lastname: F.last.value.trim(), company: F.company.value.trim(),
      jobtitle: F.role.value.trim(), services_of_interest__c: F.need.value === 'victim' ? '' : F.need.value,
      message: F.msg.value.trim() ? '[stored, not sent to analytics]' : '',
      lifecyclestage: lifecycle, hs_lead_status: sc.status === 'excluded' ? 'UNQUALIFIED' : 'NEW',
      ab_variant: variant, ...utm, consent_to_contact: F.consent.checked,
    };
    const salesforce = sc.status === 'excluded' ? null : {
      Lead: {
        FirstName: hubspot.firstname, LastName: hubspot.lastname, Email: e, Company: hubspot.company, Title: hubspot.jobtitle,
        LeadSource: D.crm.lead_source, Status: sc.status === 'mql' ? 'MQL' : 'Open', Industry: D.segment.industry,
        services_of_interest__c: hubspot.services_of_interest__c, MQL_Score__c: sc.total,
        MQL_Date__c: sc.status === 'mql' ? now : null, AB_Variant__c: variant,
        UTM_Source__c: utm.utm_source, UTM_Medium__c: utm.utm_medium, UTM_Campaign__c: utm.utm_campaign,
      },
      CampaignMember: { CampaignId: campaignId, Status: D.crm.campaign_member_status },
    };
    return { hubspot, salesforce };
  }

  function buildRouting(sc) {
    const e = F.email.value.trim();
    if (sc.status === 'excluded') return { queue: isVictim() ? 'Victim support (no sales routing)' : 'Spam review', team: '—', region: '—', sla: null };
    if (sc.status === 'lead') return { queue: D.routing.nurture, team: D.routing.team, region: region(e), sla: D.routing.sla_minutes.lead };
    return { queue: `${D.segment.name} · ${region(e)}`, team: D.routing.team + ' specialists (round-robin)', region: region(e), sla: D.routing.sla_minutes.mql };
  }

  // ---------- submit ----------
  let submitted = null;
  let slaTimer = null;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const err = $('#form-err');
    const e = F.email.value.trim();
    const missing = [];
    if (!validEmail(e)) missing.push('a valid work email');
    if (!F.first.value.trim()) missing.push('first name');
    if (!F.last.value.trim()) missing.push('last name');
    if (!isVictim()) {
      if (!F.company.value.trim()) missing.push('company');
      if (!F.role.value.trim()) missing.push('job title');
      if (!F.need.value) missing.push('what you need');
      if (!F.consent.checked) missing.push('consent');
    }
    track('form_submit_attempt', { fields_complete: completed.size });
    if (missing.length) {
      err.textContent = 'Please add ' + missing.join(', ') + '.';
      track('form_validation_error', { missing });
      return;
    }
    err.textContent = '';
    const sc = computeScore();
    const record = buildRecord(sc);
    const routing = buildRouting(sc);
    submitted = { sc, record, routing, at: Date.now() };
    track('form_submit', { status: sc.status, score: sc.total, variant, campaign: campaignId, email_domain: domainOf(e) });
    if (sc.status === 'excluded') track('lead_excluded', { reason: sc.reason });
    else track('lead_routed', { queue: routing.queue, sla_min: routing.sla });

    const saved = sendLive(sc, record, routing) ? 'sheet' : saveOffline(sc, record, routing) ? 'outbox' : 'none';
    window.__lastLead = { sc, routing, saved };

    const res = $('#result');
    if (isVictim()) {
      res.innerHTML = `<div class="result victim"><h3>We're sorry this happened.</h3>
        <p>This form is for businesses requesting a demo, so we haven't sent your details to a sales team.</p>
        <p>If you lost funds, report it to law enforcement (in the US: <a href="https://www.ic3.gov" rel="noopener">ic3.gov</a>).</p>
        <p>Be careful: scammers pose as fund-recovery services, including TRM. Read <a href="https://www.trmlabs.com/policies/impersonation-scam-warning" rel="noopener">TRM's impersonation scam warning</a>.</p></div>`;
    } else if (sc.status === 'lead') {
      res.innerHTML = `<div class="result nurture"><h3>Thanks, ${esc(F.first.value.trim())}.</h3>
        <p>We'll send a short guide first. Using a personal email? Reply from your work email and we'll route you to a specialist.</p>
        <p class="formnote">${saved === 'sheet' ? 'Saved to the concept Google Sheet.' : 'Offline: saved in this browser’s outbox.'} See Under the hood → Outbox and CRM record.</p></div>`;
    } else {
      res.innerHTML = `<div class="result ok"><h3>Thanks, ${esc(F.first.value.trim())}. You're with the ${esc(D.routing.team)} team.</h3>
        <p>A specialist for ${esc(routing.region)} will reach out. Target first touch: within ${routing.sla} minutes, business hours.</p>
        <p class="formnote">${saved === 'sheet' ? 'Saved to the concept Google Sheet.' : 'Offline: saved in this browser’s outbox.'} See Under the hood → Outbox, CRM record and Routing.</p></div>`;
    }
    renderAll();
    clearInterval(slaTimer);
    if (routing.sla) slaTimer = setInterval(renderRouting, 1000);
  });

  function liveRecord(sc, record, routing) {
    return {
      submitted_at: new Date().toISOString(),
      page_url: location.href.split('#')[0],
      email: F.email.value.trim(), firstname: F.first.value.trim(), lastname: F.last.value.trim(),
      company: F.company.value.trim(), jobtitle: F.role.value.trim(), need: F.need.value, message: F.msg.value.trim(),
      ...utm, sfdcCampaignId: campaignId, ab_variant: variant, capture_source: form.dataset.source || 'form',
      score: sc.total, status: sc.status, status_reason: sc.reason, score_rows: sc.rows,
      routing, consent: F.consent.checked,
      hubspot: record.hubspot, salesforce: record.salesforce,
    };
  }

  // the same gate for the Sheet and the offline outbox: consent, no victims, no excluded records
  function sendable(sc) {
    if (isVictim()) { track('victim_support', { sent: false, reason: 'victim reports never go to the sales sheet' }); return false; }
    if (!F.consent.checked) { track('live_send_skipped', { reason: 'no consent' }); return false; }
    if (sc.status === 'excluded') { track('live_send_skipped', { reason: sc.reason }); return false; }
    return true;
  }
  function postToSheet(rec) {
    // text/plain + no-cors: Apps Script web apps skip the CORS preflight; the response is opaque, so "sent" means the request left
    return fetch(liveUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(rec) });
  }
  function sendLive(sc, record, routing) {
    if (!LIVE || !sendable(sc)) return false;
    postToSheet(liveRecord(sc, record, routing))
      .then(() => track('sent_to_sheet', { ok: true, note: 'Sent to sheet ✓ (opaque response: check the Sheet to confirm the row)' }))
      .catch((err) => track('sent_to_sheet_failed', { error: String(err && err.message || err) }));
    return true;
  }

  // ---------- offline outbox: consented leads stay in this browser until exported or sent ----------
  const OUTBOX = 'concept_outbox';
  const outbox = { all() { try { return JSON.parse(store.get(OUTBOX) || '[]'); } catch { return []; } }, save(list) { store.set(OUTBOX, JSON.stringify(list)); } };
  function saveOffline(sc, record, routing) {
    if (LIVE || !sendable(sc)) return false;
    const list = outbox.all(); list.push(liveRecord(sc, record, routing)); outbox.save(list);
    track('captured_offline', { outbox_size: list.length, source: form.dataset.source || 'form' });
    renderOutbox();
    return true;
  }
  const COLS = ['submitted_at', 'capture_source', 'email', 'firstname', 'lastname', 'company', 'jobtitle', 'need', 'message', 'score', 'status', 'status_reason', 'queue', 'region', 'sla_minutes', 'utm_source', 'utm_medium', 'utm_campaign', 'ab_variant', 'consent'];
  const flat = (r) => ({ ...r, queue: r.routing && r.routing.queue, region: r.routing && r.routing.region, sla_minutes: r.routing && r.routing.sla });
  const csvCell = (v) => { let t = v == null ? '' : String(v); if (/^[=+\-@]/.test(t)) t = "'" + t; return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  function downloadCsv() {
    const rows = outbox.all().map(flat);
    const csv = [COLS.join(','), ...rows.map((r) => COLS.map((c) => csvCell(r[c])).join(','))].join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'concept-leads-' + new Date().toISOString().slice(0, 10) + '.csv' });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    track('outbox_export', { rows: rows.length });
  }
  async function flushOutbox() {
    const list = outbox.all(); let sent = 0;
    for (const rec of list) { try { await postToSheet({ ...rec, sent_from_outbox: true }); sent++; } catch { break; } }
    outbox.save(list.slice(sent));
    track('outbox_sent_to_sheet', { sent, left: list.length - sent });
    renderOutbox();
  }
  function renderOutbox() {
    const p = $('#p-outbox'); if (!p) return;
    const rows = outbox.all();
    p.innerHTML = `<p class="muted">Offline outbox · ${rows.length} consented lead${rows.length === 1 ? '' : 's'} · stored only in this browser (localStorage) · victims and excluded records never enter</p>` +
      `<div class="ob-btns"><button type="button" class="ob-btn" data-a="csv"${rows.length ? '' : ' disabled'}>Download CSV</button>` +
      (LIVE ? `<button type="button" class="ob-btn" data-a="send"${rows.length ? '' : ' disabled'}>Send ${rows.length} to Sheet</button>` : '') +
      `<button type="button" class="ob-btn" data-a="clear"${rows.length ? '' : ' disabled'}>Clear</button></div>` +
      (rows.length ? rows.slice().reverse().map((r) => `<div class="ev"><span class="t">${esc(r.submitted_at.slice(11, 19))}</span> <span class="n">${esc(r.status)} · ${esc(r.score)}</span> <span class="muted">via ${esc(r.capture_source || 'form')}</span><pre>${esc(r.firstname)} ${esc(r.lastname)} · ${esc(r.jobtitle)} · ${esc(r.company)}\n${esc(r.need)} → ${esc(r.routing && r.routing.queue)}</pre></div>`).join('') : '<p>No leads yet. Submit the form, or use “Talk to a specialist” in the chat.</p>');
    p.querySelectorAll('.ob-btn').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.a === 'csv') downloadCsv();
      else if (b.dataset.a === 'send') flushOutbox();
      else if (b.dataset.a === 'clear') { outbox.save([]); track('outbox_cleared', {}); renderOutbox(); }
    }));
  }

  // ---------- under the hood panel ----------
  const toggle = $('#uth-toggle');
  const panel = $('#uth');
  toggle.addEventListener('click', () => {
    const open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    track('under_the_hood_' + (open ? 'open' : 'close'));
  });
  $$('.tab').forEach((tb) => tb.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.setAttribute('aria-selected', String(x === tb)));
    $$('.panel').forEach((p) => { p.hidden = p.id !== 'p-' + tb.dataset.p; });
  }));

  function renderEvents() {
    const p = $('#p-events');
    if (!p) return;
    p.innerHTML = `<p class="muted">window.dataLayer · ${events.length} events · newest first · no personal data in payloads</p>` +
      events.slice().reverse().map((e) => {
        const { event, t, ...rest } = e;
        return `<div class="ev"><span class="t">${t}</span> <span class="n">${esc(event)}</span>${Object.keys(rest).length ? `<pre>${esc(JSON.stringify(rest, null, 1))}</pre>` : ''}</div>`;
      }).join('');
  }
  const kv = (o) => `<dl class="kv">${Object.entries(o).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v === '' || v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : v)}</dd>`).join('')}</dl>`;

  function renderRecord() {
    const p = $('#p-record');
    if (!submitted) { p.innerHTML = '<p class="muted">Submit the form to see the record a real submit would create. Nothing is sent.</p>'; return; }
    const { hubspot, salesforce } = submitted.record;
    p.innerHTML = `<p class="sub-h">HubSpot contact (form submission)</p>${kv(hubspot)}` +
      (salesforce
        ? `<p class="sub-h">Salesforce Lead (via sync)</p>${kv(salesforce.Lead)}<p class="sub-h">Salesforce CampaignMember</p>${kv(salesforce.CampaignMember)}`
        : `<p class="sub-h">Salesforce</p><p>Not synced: excluded records stay out of the inclusion list.</p>`);
  }

  function refreshScore() { renderScore(); }
  function renderScore() {
    const p = $('#p-score');
    const sc = submitted ? submitted.sc : computeScore();
    const badge = sc.status === 'mql' ? '<span class="badge mql">MQL</span>' : sc.status === 'excluded' ? '<span class="badge ex">EXCLUDED</span>' : '<span class="badge lead">LEAD</span>';
    p.innerHTML = `<p class="muted">${submitted ? 'Final score at submit' : 'Live draft score as you type'} · rules from definitions.js v${D.version}</p>` +
      sc.rows.map(([k, v]) => `<div class="score-row${v ? '' : ' zero'}"><span>${esc(k)}</span><span>+${v}</span></div>`).join('') +
      `<div class="total"><span>total ${sc.total} / threshold ${D.scoring.mql_threshold}</span>${badge}</div><p>${esc(sc.reason)}</p>` +
      `<p class="sub-h">Exclusions checked first</p><p>victim keywords · spam patterns · free email domains</p>`;
  }

  function renderRouting() {
    const p = $('#p-routing');
    if (!submitted) { p.innerHTML = '<p class="muted">Submit the form to see routing.</p>'; return; }
    const r = submitted.routing;
    let sla = '—';
    if (r.sla) {
      const left = Math.max(0, r.sla * 60 - Math.floor((Date.now() - submitted.at) / 1000));
      sla = `${String(Math.floor(left / 3600)).padStart(2, '0')}:${String(Math.floor(left / 60) % 60).padStart(2, '0')}:${String(left % 60).padStart(2, '0')} left`;
    }
    p.innerHTML = kv({ segment: D.segment.name, queue: r.queue, team: r.team, region: r.region + (r.region !== '—' ? ' (from email TLD; Clay confirms HQ)' : ''), 'first-touch SLA': sla }) +
      `<p class="sub-h">Order of operations</p><p>1 exclusions → 2 match to an existing account by domain → 3 region → 4 round-robin in team → 5 SLA timer + alert on breach</p>`;
  }

  function renderEnrich() {
    const p = $('#p-enrich');
    if (!submitted) { p.innerHTML = '<p class="muted">Submit the form to see the enrichment queue.</p>'; return; }
    if (submitted.sc.status === 'excluded') { p.innerHTML = '<p>No enrichment: excluded records are not enriched or synced.</p>'; return; }
    const d = domainOf(F.email.value);
    const steps = [
      ['dedupe', `match domain ${d} to an existing Account / open opportunity`],
      ['firmographics', 'company size, HQ country, funding (Clay waterfall: provider 1 → 2 → 3)'],
      ['licensing', 'check public VASP / MSB registers for the company'],
      ['title normalize', `"${F.role.value.trim()}" → role bucket + seniority`],
      ['re-score', 'apply firmographic fit points, re-check MQL'],
      ['verify', 'enrichment never overwrites a value the person typed'],
    ];
    p.innerHTML = `<p class="muted">Queued after submit (demo: not run)</p>` + steps.map(([k, v], i) => `<div class="ev"><span class="n">${i + 1}. ${esc(k)}</span><pre>${esc(v)}</pre></div>`).join('');
  }

  function renderSetup() {
    $('#p-setup').innerHTML = kv({ mode: LIVE ? 'live → ' + liveUrl.replace(/\/macros\/s\/([^/]{6})[^/]*/, '/macros/s/$1…') : 'demo (nothing sent)', ab_experiment: 'hero_headline', ab_variant: variant + ` (${variantSource}; force with ?v=a or ?v=b)`, ...utm, sfdcCampaignId: campaignId, consent: F.consent.checked ? 'given' : 'not yet', dataLayer_events: window.dataLayer.length }) +
      `<p class="sub-h">Try</p><p>?v=b&utm_source=linkedin&utm_medium=paid_social&utm_campaign=crypto-compliance-q4</p>`;
  }

  function renderAll() { renderEvents(); renderRecord(); renderScore(); renderRouting(); renderEnrich(); renderSetup(); renderOutbox(); }
  form.addEventListener('input', renderSetup);
  form.addEventListener('change', renderSetup);
  renderAll();
})();
