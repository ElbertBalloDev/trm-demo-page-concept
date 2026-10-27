// Wallet-screen investigation panel. All data is made up. Never calls a network.
// Built as a pure function of time: paintAt(t) draws the state at t seconds, so the live page (driven by
// requestAnimationFrame) and the HyperFrames film (driven by hf-seek) render the same frames.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DUR = 2.4;           // run length, seconds
  const RISK_HEX = { low: '#2f86ff', med: '#f2a33a', high: '#ff3d5e' };

  // ---------- entity icons (16x16 glyphs) ----------
  const ICON = {
    wallet: '<rect x="2" y="4" width="12" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="11" cy="8.5" r="1.2" fill="currentColor"/>',
    mixer: '<path d="M3 6a5 5 0 0 1 9-2M13 10a5 5 0 0 1-9 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 1.5v3h-3M4 14.5v-3h3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    exchange: '<path d="M2 6l6-3.5L14 6z" fill="currentColor"/><path d="M3.5 7.5v4.5M6.5 7.5v4.5M9.5 7.5v4.5M12.5 7.5v4.5M2 13.5h12" stroke="currentColor" stroke-width="1.5"/>',
    bridge: '<path d="M1.5 11.5h13M3 11.5V8a5 5 0 0 1 10 0v3.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 11.5V9M10 11.5V9" stroke="currentColor" stroke-width="1.4"/>',
    flagged: '<path d="M8 1.5l6.5 11.5h-13z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 6v3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.3" r=".9" fill="currentColor"/>',
    processor: '<rect x="1.5" y="3.5" width="13" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M1.5 6.5h13" stroke="currentColor" stroke-width="1.6"/>',
    issuer: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.5v7M6 6.2c0-1 4-1 4 .3 0 1.6-4 .8-4 2.6 0 1.3 4 1.3 4 .3" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    peel: '<path d="M3 13L13 3M7 13l6-6M3 9l6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  };
  const TYPE_NAME = { wallet: 'Wallet', mixer: 'Mixer', exchange: 'Exchange', bridge: 'Bridge contract', flagged: 'Flagged entity', processor: 'Payment processor', issuer: 'Stablecoin issuer', peel: 'Peel chain' };
  const CHAIN_ICON = {
    ETH: '<path d="M8 1l4.5 7.2L8 11 3.5 8.2z" fill="currentColor"/><path d="M8 12l4.5-2.8L8 15 3.5 9.2z" fill="currentColor" opacity=".7"/>',
    BTC: '<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6.3 4.5v7M6.3 4.8h2.4c1.8 0 1.8 2.9 0 2.9H6.3h2.8c2 0 2 3.3 0 3.3H6.3" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    TRON: '<path d="M2 3l12 2.5L8.5 14z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M2 3l6.5 11M14 5.5L6 8" stroke="currentColor" stroke-width="1.1"/>',
  };
  const svgIcon = (k, set = ICON) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${set[k] || ''}</svg>`;

  // ---------- scenarios (made up) ----------
  const LANES = {
    ETH: { label: 'Ethereum' }, BRIDGE: { label: 'Bridge' }, TRON: { label: 'TRON' }, BTC: { label: 'Bitcoin' },
  };
  const SAMPLES = [
    {
      addr: '0x7a3f…e91c', full: '0x7a3f9c21b04e5d6f8a1b2c3d4e5f60718293e91c', chain: 'ETH', label: 'Payments client · onboarding', counterparties: 14,
      lanes: ['ETH', 'BRIDGE', 'TRON'],
      nodes: [
        { id: 'w', type: 'wallet', label: 'Screened wallet', lane: 'ETH', x: 80, risk: 'low', t: 0.15, src: 'customer onboarding', conf: 1, root: true },
        { id: 'mx', type: 'mixer', label: 'Mixer', sub: 'sanctioned', lane: 'ETH', x: 260, risk: 'high', t: 0.75, src: 'sanctions list (OFAC SDN)', conf: 0.92, parent: 'w' },
        { id: 'h1', type: 'wallet', label: 'Hop wallet', lane: 'ETH', x: 440, risk: 'low', t: 1.05, src: 'cross-chain trace', conf: 0.9, parent: 'mx' },
        { id: 'br', type: 'bridge', label: 'Bridge contract', sub: 'ETH → TRON', lane: 'BRIDGE', x: 570, risk: 'med', t: 1.35, src: 'cross-chain trace', conf: 0.88, parent: 'h1' },
        { id: 'h2', type: 'wallet', label: 'TRON hop', lane: 'TRON', x: 680, risk: 'med', t: 1.6, src: 'cross-chain trace', conf: 0.86, parent: 'br' },
        { id: 'fl', type: 'flagged', label: 'Flagged entity', sub: 'sanctions list', lane: 'TRON', x: 800, risk: 'high', t: 1.85, src: 'sanctions list (OFAC SDN)', conf: 0.81, parent: 'h2' },
      ],
      edges: [
        { from: 'w', to: 'mx', amt: '12.4 ETH', ts: '09:14 UTC', t: 0.55, risk: 'high' },
        { from: 'mx', to: 'h1', amt: '11.9 ETH', ts: '09:31 UTC', t: 0.9 },
        { from: 'h1', to: 'br', amt: '11.8 ETH', ts: '09:40 UTC', t: 1.2, bridge: true },
        { from: 'br', to: 'h2', amt: '31,920 USDT', ts: '09:41 UTC', t: 1.45, bridge: true },
        { from: 'h2', to: 'fl', amt: '31,500 USDT', ts: '10:02 UTC', t: 1.7, risk: 'high' },
      ],
      steps: [
        [0.0, 'resolving address… 0x7a3f…e91c (Ethereum)'],
        [0.3, 'direct counterparties: 14'],
        [0.7, 'direct exposure: mixer (sanctioned) · 12.4 ETH'],
        [1.15, 'following funds across bridge (ETH→TRON)'],
        [1.65, 'matched entity: sanctions list (source: OFAC SDN, confidence 0.92)'],
        [2.1, 'score computed · 2 chains · 3 hops'],
      ],
      findings: [
        { kind: 'direct', text: 'Sent 12.4 ETH directly to a sanctioned mixer', src: 'sanctions list (OFAC SDN)', conf: 0.92, w: 42, hop: 1, node: 'mx', t: 0.8 },
        { kind: 'indirect', text: 'Funds bridged ETH → TRON as USDT', src: 'cross-chain trace', conf: 0.88, w: 16, hop: 2, bridge: true, node: 'br', t: 1.4 },
        { kind: 'indirect', text: 'Funds reach an entity on a sanctions list', src: 'sanctions list (OFAC SDN)', conf: 0.81, w: 28, hop: 3, bridge: true, node: 'fl', t: 1.9 },
      ],
    },
    {
      addr: 'bc1q8x…k8zq', full: 'bc1q8xw3h6m2l0p9r7t5v4y2z8k6j4n2c0a9s7k8zq', chain: 'BTC', label: 'OTC desk counterparty', counterparties: 6,
      lanes: ['BTC'],
      nodes: [
        { id: 'w', type: 'wallet', label: 'Screened wallet', lane: 'BTC', x: 80, dy: 20, risk: 'low', t: 0.15, src: 'counterparty review', conf: 1, root: true },
        { id: 'pc', type: 'peel', label: 'Peel chain', sub: '4 transactions', lane: 'BTC', x: 250, dy: 20, risk: 'med', t: 0.6, src: 'behavioral heuristic', conf: 0.7, parent: 'w' },
        { id: 'mx', type: 'mixer', label: 'Mixer', sub: '2 hops back', lane: 'BTC', x: 420, dy: -70, risk: 'high', t: 1.0, src: 'on-chain attribution', conf: 0.86, parent: 'pc' },
        { id: 'h', type: 'wallet', label: 'Hop wallet', lane: 'BTC', x: 600, dy: 20, risk: 'low', t: 1.35, src: 'on-chain trace', conf: 0.9, parent: 'pc' },
        { id: 'x', type: 'exchange', label: 'Exchange B', sub: 'cash-out', lane: 'BTC', x: 800, dy: 20, risk: 'low', t: 1.7, src: 'on-chain attribution', conf: 0.95, parent: 'h' },
      ],
      edges: [
        { from: 'w', to: 'pc', amt: '2.40 BTC', ts: '14:05 UTC', t: 0.4 },
        { from: 'pc', to: 'mx', amt: '0.43 BTC', ts: '14:22 UTC', t: 0.85, risk: 'high' },
        { from: 'pc', to: 'h', amt: '1.91 BTC', ts: '14:30 UTC', t: 1.2 },
        { from: 'h', to: 'x', amt: '1.90 BTC', ts: '15:02 UTC', t: 1.55 },
      ],
      steps: [
        [0.0, 'resolving address… bc1q8x…k8zq (Bitcoin)'],
        [0.3, 'direct counterparties: 6'],
        [0.65, 'pattern: peel chain over 4 transactions'],
        [1.05, 'indirect exposure: 18% of inflows via a mixer'],
        [1.6, 'cash-out: Exchange B (licensed)'],
        [2.1, 'score computed · 1 chain · 3 hops'],
      ],
      findings: [
        { kind: 'direct', text: 'Peel chain pattern over 4 transactions', src: 'behavioral heuristic', conf: 0.7, w: 14, hop: 1, node: 'pc', t: 0.7 },
        { kind: 'indirect', text: '18% of inflows passed through a mixer', src: 'on-chain attribution', conf: 0.86, w: 30, hop: 2, node: 'mx', t: 1.1 },
        { kind: 'direct', text: 'Cashes out at Exchange B (licensed)', src: 'on-chain attribution', conf: 0.95, w: 4, hop: 3, node: 'x', t: 1.75 },
      ],
    },
    {
      addr: 'TQx4m…9LmP', full: 'TQx4mR8vK2pZ7nW3cY6bH1dF5gJ9sL0aE4uT9LmP', chain: 'TRON', label: 'Merchant settlement', counterparties: 9,
      lanes: ['TRON', 'BRIDGE', 'ETH'],
      nodes: [
        { id: 'w', type: 'wallet', label: 'Screened wallet', lane: 'TRON', x: 80, risk: 'low', t: 0.15, src: 'merchant review', conf: 1, root: true },
        { id: 'pp', type: 'processor', label: 'Payment processor', lane: 'TRON', x: 290, risk: 'low', t: 0.6, src: 'on-chain attribution', conf: 0.96, parent: 'w' },
        { id: 'br', type: 'bridge', label: 'Bridge contract', sub: 'TRON → ETH', lane: 'BRIDGE', x: 520, risk: 'low', t: 1.05, src: 'cross-chain trace', conf: 0.9, parent: 'pp' },
        { id: 'is', type: 'issuer', label: 'Stablecoin issuer', lane: 'ETH', x: 780, risk: 'low', t: 1.5, src: 'on-chain attribution', conf: 0.98, parent: 'br' },
      ],
      edges: [
        { from: 'w', to: 'pp', amt: '84,200 USDT', ts: 'daily', t: 0.4 },
        { from: 'pp', to: 'br', amt: '80,000 USDT', ts: '18:10 UTC', t: 0.85, bridge: true },
        { from: 'br', to: 'is', amt: '80,000 USDC', ts: '18:12 UTC', t: 1.3, bridge: true },
      ],
      steps: [
        [0.0, 'resolving address… TQx4m…9LmP (TRON)'],
        [0.3, 'direct counterparties: 9'],
        [0.7, 'regular inflows from a payment processor'],
        [1.1, 'following funds across bridge (TRON→ETH)'],
        [1.6, 'no exposure to flagged entities found'],
        [2.1, 'score computed · 2 chains · 2 hops'],
      ],
      findings: [
        { kind: 'direct', text: 'Regular inflows from a payment processor', src: 'on-chain attribution', conf: 0.96, w: 3, hop: 1, node: 'pp', t: 0.7 },
        { kind: 'indirect', text: 'Bridged TRON → ETH to a stablecoin issuer', src: 'cross-chain trace', conf: 0.9, w: 6, hop: 2, bridge: true, node: 'br', t: 1.15 },
        { kind: 'direct', text: 'No exposure to flagged entities found', src: 'screening result', conf: 0.97, w: 0, hop: 2, node: 'is', t: 1.65 },
      ],
    },
  ];

  // ---------- rules: TRM's "risk indicators you tune", as a mechanic ----------
  const DEFAULT_RULES = { indirect: true, hopLimit: 3, bridgeSignal: true };
  function counts(f, rules) {
    if (f.kind === 'indirect' && !rules.indirect) return false;
    if (f.hop > rules.hopLimit) return false;
    if (f.bridge && f.kind === 'indirect' && !rules.bridgeSignal && f.w < 20) return false;
    return true;
  }
  function scoreOf(scn, rules) {
    const fs = scn.findings.filter((f) => counts(f, rules));
    const total = fs.reduce((a, f) => a + f.w * f.conf, 0);
    const score = Math.min(100, Math.round(total + (fs.length ? 6 : 0)));
    const dir = fs.filter((f) => f.kind === 'direct').reduce((a, f) => a + f.w * f.conf, 0);
    const directPct = total ? Math.round(dir / total * 100) : 100;
    const chains = new Set(scn.nodes.filter((n) => n.lane !== 'BRIDGE').map((n) => n.lane)).size;
    const hops = Math.max(...scn.findings.map((f) => f.hop));
    return { score, directPct, indirectPct: 100 - directPct, chains, hops, counted: fs };
  }
  const band = (s) => (s >= 70 ? { k: 'high', label: 'High' } : s >= 40 ? { k: 'med', label: 'Medium' } : { k: 'low', label: 'Low' });

  // ---------- the panel ----------
  function create(root, opts = {}) {
    const track = opts.track || (() => {});
    const film = !!opts.film;
    const reduced = !film && matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.innerHTML = `
      <div class="inv-bar"><span class="ui-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="inv-title" data-r="title">Wallet screen</span><span class="inv-clock" data-r="clock">00:00.0</span></div>
      <div class="inv-grid">
        <div class="inv-graph-wrap">
          <svg class="inv-graph" data-r="graph" viewBox="0 0 880 330" role="group" aria-label="Fund-flow graph"></svg>
          <div class="inv-tip" data-r="tip" role="tooltip" hidden></div>
        </div>
        <div class="inv-side">
          <div class="inv-gauge">
            <svg viewBox="0 0 120 70" aria-hidden="true"><path class="g-track" d="M10 62 A50 50 0 0 1 110 62"/><path class="g-fill" data-r="garc" d="M10 62 A50 50 0 0 1 110 62"/></svg>
            <div class="g-num"><b data-r="gnum">0</b><span data-r="gband">Risk score</span></div>
          </div>
          <div class="inv-log" data-r="log" aria-live="polite"></div>
        </div>
      </div>
      <ul class="inv-findings" data-r="findings"></ul>
      <div class="inv-results" data-r="results">
        <div class="r-score"><span class="r-k">Risk score</span><b data-r="rscore">0</b><span class="r-band" data-r="rband"></span></div>
        <div class="r-exp"><span class="r-k">Exposure</span><div class="r-stack"><i data-r="sdir"></i><i data-r="sind"></i></div><span class="r-leg" data-r="rleg"></span></div>
        <div class="r-meta"><span class="r-k">Trace</span><span data-r="rmeta"></span></div>
        <div class="r-actions">
          <button type="button" class="ib" data-act="block">Block</button>
          <button type="button" class="ib" data-act="escalate">Escalate to investigator</button>
          <button type="button" class="ib" data-act="export">Export evidence</button>
        </div>
      </div>
      <details class="inv-rules" data-r="rules">
        <summary>Configure risk rules <span class="muted">· re-scores live</span></summary>
        <div class="rules-row">
          <label class="tog"><input type="checkbox" data-rule="indirect" checked><span></span>Count indirect exposure</label>
          <label class="tog"><input type="checkbox" data-rule="bridgeSignal" checked><span></span>Treat bridge activity as a risk signal</label>
          <label class="sel">Hop limit <select data-rule="hopLimit"><option>2</option><option selected>3</option><option>4</option><option>5</option></select></label>
        </div>
      </details>
      <div class="inv-toast" data-r="toast" role="status" hidden></div>`;
    const q = (k) => root.querySelector(`[data-r="${k}"]`);
    const svg = q('graph');
    const garc = q('garc');
    const GLEN = garc.getTotalLength ? garc.getTotalLength() : 157;
    garc.style.strokeDasharray = `${GLEN}`;

    let scn = null, rules = { ...DEFAULT_RULES }, layout = null, pinned = null;
    let res = null, prevScore = 0, ruleT = -1, scoreFrom = 0;

    function laneY(scnLanes) {
      const ys = scnLanes.length === 1 ? [165] : [70, 165, 260];
      return Object.fromEntries(scnLanes.map((l, i) => [l, ys[i]]));
    }

    function build(s) {
      scn = s; pinned = null;
      const Y = laneY(s.lanes);
      const pos = Object.fromEntries(s.nodes.map((n) => [n.id, { x: n.x, y: Y[n.lane] + (n.dy || 0) }]));
      let html = '';
      s.lanes.forEach((l) => {
        const y = Y[l];
        const hh = s.lanes.length === 1 ? 140 : 42;
        html += `<g class="lane${l === 'BRIDGE' ? ' lane-bridge' : ''}"><rect x="0" y="${y - hh}" width="880" height="${hh * 2}" rx="10"/><text x="14" y="${y - hh + 16}">${esc(LANES[l].label)}</text></g>`;
      });
      s.edges.forEach((e, i) => {
        const A = pos[e.from], B = pos[e.to];
        const mx = (A.x + B.x) / 2;
        const d = `M${A.x},${A.y} C${mx},${A.y} ${mx},${B.y} ${B.x},${B.y}`;
        const cls = e.risk === 'high' ? 'e-high' : e.bridge ? 'e-bridge' : 'e-norm';
        const flat = A.y === B.y; const lx = flat ? mx : mx + 12, ly = flat ? A.y - 26 : (A.y + B.y) / 2 - 4; const anchor = flat ? 'middle' : 'start';
        html += `<g class="edge ${cls}" data-e="${i}"><path class="e-base" d="${d}"/><path class="e-flow" d="${d}"/><text class="e-lab" x="${lx}" y="${ly}" text-anchor="${anchor}">${esc(e.amt)}<tspan x="${lx}" dy="12">${esc(e.ts)}</tspan></text></g>`;
      });
      s.nodes.forEach((n) => {
        const p = pos[n.id];
        html += `<g class="node r-${n.risk}${n.root ? ' n-root' : ''}" data-n="${n.id}" tabindex="0" role="button" aria-label="${esc(TYPE_NAME[n.type])}: ${esc(n.label)}, risk ${n.risk}" transform="translate(${p.x},${p.y})"><g class="n-in">
          <circle class="n-halo" r="24"/><circle class="n-dot" r="17"/>
          <g class="n-ico" transform="translate(-8,-8)">${ICON[n.type]}</g>
          <text class="n-lab" y="36" text-anchor="middle">${esc(n.label)}</text>${n.sub ? `<text class="n-sub" y="49" text-anchor="middle">${esc(n.sub)}</text>` : ''}
        </g></g>`;
      });
      svg.innerHTML = html;
      layout = { edges: [...svg.querySelectorAll('.edge')].map((g) => { const p = g.querySelector('.e-base'); const L = p.getTotalLength ? p.getTotalLength() : 300; p.style.strokeDasharray = `${L}`; return { g, p, L, lab: g.querySelector('.e-lab'), flow: g.querySelector('.e-flow') }; }), nodes: Object.fromEntries([...svg.querySelectorAll('.node')].map((g) => [g.dataset.n, g])) };
      q('title').textContent = `Wallet screen · ${s.addr} · ${LANES[s.chain].label}`;
        q('findings').innerHTML = s.findings.map((f, i) => `<li class="fcard" data-f="${i}"><span class="chip chip-${f.kind}">${f.kind}</span><div class="f-body"><p>${esc(f.text)}</p><p class="f-meta">source: ${esc(f.src)} · hop ${f.hop}<span class="f-nc">not counted by your rules</span></p></div><div class="f-conf"><span>conf ${f.conf.toFixed(2)}</span><i><b style="width:${Math.round(f.conf * 100)}%"></b></i></div></li>`).join('');
      res = scoreOf(s, rules); prevScore = res.score; ruleT = -1;
      bindNodes();
    }

    // ---------- paint the state at time t ----------
    function paintAt(t) {
      if (!scn) return;
      q('clock').textContent = `${String(Math.floor(Math.min(t, DUR) / 60)).padStart(2, '0')}:${(Math.min(t, DUR) % 60).toFixed(1).padStart(4, '0')}`;
      scn.nodes.forEach((n) => {
        const g = layout.nodes[n.id];
        const p = clamp((t - n.t) / 0.3);
        g.style.opacity = p;
        g.firstElementChild.style.transform = `scale(${0.6 + 0.4 * ease(p)})`;
        g.classList.toggle('n-live', p >= 1);
      });
      scn.edges.forEach((e, i) => {
        const E = layout.edges[i];
        const p = ease(clamp((t - e.t) / 0.35));
        E.p.style.strokeDashoffset = `${E.L * (1 - p)}`;
        E.lab.style.opacity = clamp((t - e.t - 0.2) / 0.3);
        E.g.classList.toggle('e-done', p >= 1 && !reduced);
      });
      // step log: each line types in 0.25 s
      q('log').innerHTML = scn.steps.map(([st, txt], i) => {
        const p = clamp((t - st) / 0.25);
        if (p <= 0) return '';
        const shown = txt.slice(0, Math.ceil(txt.length * p));
        const cursor = p < 1 || (i === scn.steps.length - 1 && t < DUR + 0.6) ? '<i class="caret"></i>' : '';
        return `<div class="ln"><span class="lt">${(st).toFixed(1).padStart(4, '0')}</span>${esc(shown)}${cursor}</div>`;
      }).join('');
      // gauge
      res = scoreOf(scn, rules);
      let val;
      if (ruleT >= 0 && t >= ruleT) val = scoreFrom + (res.score - scoreFrom) * ease(clamp((t - ruleT) / 0.6));
      else val = prevScore * ease(clamp((t - 0.5) / (DUR - 0.5)));
      const b = band(val);
      garc.style.strokeDashoffset = `${GLEN * (1 - val / 100)}`;
      garc.setAttribute('class', `g-fill g-${b.k}`);
      q('gnum').textContent = Math.round(val);
      q('gband').textContent = t >= DUR ? `${b.label} risk` : 'scoring…';
      // findings
      scn.findings.forEach((f, i) => {
        const li = root.querySelector(`.fcard[data-f="${i}"]`);
        const p = ease(clamp((t - f.t) / 0.35));
        li.style.opacity = p; li.style.transform = `translateX(${(1 - p) * 24}px)`;
        li.classList.toggle('f-off', !counts(f, rules));
      });
      // results
      const rp = clamp((t - DUR) / 0.4);
      const rr = q('results');
      rr.style.opacity = rp; rr.classList.toggle('on', rp > 0.5);
      const fb = band(Math.round(val));
      q('rscore').textContent = Math.round(val);
      q('rband').textContent = fb.label; q('rband').className = `r-band rb-${fb.k}`;
      q('sdir').style.width = `${res.directPct}%`; q('sind').style.width = `${res.indirectPct}%`;
      q('rleg').textContent = `direct ${res.directPct}% · indirect ${res.indirectPct}%`;
      q('rmeta').textContent = `chains touched: ${res.chains} · hops: ${res.hops} · counterparties: ${scn.counterparties}`;
    }

    // ---------- interaction (live page only) ----------
    const tip = q('tip');
    function pathTo(id) {
      const set = new Set([id]); let n = scn.nodes.find((x) => x.id === id);
      while (n && n.parent) { set.add(n.parent); n = scn.nodes.find((x) => x.id === n.parent); }
      return set;
    }
    function applyPin() {
      const on = pinned ? pathTo(pinned) : null;
      Object.entries(layout.nodes).forEach(([id, g]) => { g.classList.toggle('dim', !!on && !on.has(id)); g.classList.toggle('pinned', id === pinned); });
      scn.edges.forEach((e, i) => layout.edges[i].g.classList.toggle('dim', !!on && !(on.has(e.from) && on.has(e.to))));
    }
    function showTip(id, g) {
      const n = scn.nodes.find((x) => x.id === id);
      tip.innerHTML = `<b>${esc(TYPE_NAME[n.type])}</b><span>${esc(n.label)}${n.sub ? ` · ${esc(n.sub)}` : ''}</span><span>risk: <em class="tr-${n.risk}">${n.risk === 'med' ? 'medium' : n.risk}</em></span><span>source: ${esc(n.src)}</span><span>confidence: ${n.conf.toFixed(2)}</span><span class="muted">${pinned === id ? 'pinned · click to unpin' : 'click to pin path'}</span>`;
      const wrap = svg.getBoundingClientRect(), r = g.getBoundingClientRect();
      tip.hidden = false;
      const left = Math.min(wrap.width - 190, Math.max(4, r.left - wrap.left + r.width / 2 - 90));
      const top = r.top - wrap.top > 120 ? r.top - wrap.top - tip.offsetHeight - 8 : r.bottom - wrap.top + 8;
      tip.style.left = `${left}px`; tip.style.top = `${top}px`;
    }
    function bindNodes() {
      if (film) return;
      Object.entries(layout.nodes).forEach(([id, g]) => {
        g.addEventListener('mouseenter', () => showTip(id, g));
        g.addEventListener('focus', () => showTip(id, g));
        g.addEventListener('mouseleave', () => { tip.hidden = true; });
        g.addEventListener('blur', () => { tip.hidden = true; });
        const pin = () => { pinned = pinned === id ? null : id; applyPin(); showTip(id, g); track('node_pinned', { node: TYPE_NAME[scn.nodes.find((x) => x.id === id).type], pinned: !!pinned }); };
        g.addEventListener('click', pin);
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pin(); } });
      });
    }

    // live clock
    let t0 = 0, raf = 0, runTo = 0;
    const now = () => (performance.now() - t0) / 1000;
    function loop() {
      raf = 0;
      const t = now();
      paintAt(t);
      if (t < runTo) raf = requestAnimationFrame(loop);
      else if (opts.onDone && t >= DUR && !loop.doneFired) { loop.doneFired = true; opts.onDone(scn, res); }
    }
    function run(s, meta = {}) {
      build(s);
      track('widget_run', { wallet: s.addr, chain: s.chain, source: meta.source || 'click' });
      loop.doneFired = false;
      if (reduced) { t0 = performance.now() - (DUR + 1) * 1000; paintAt(DUR + 1); finish(); return; }
      t0 = performance.now(); runTo = DUR + 0.5;
      if (!raf) raf = requestAnimationFrame(loop);
      setTimeout(finish, (DUR + 0.5) * 1000);
    }
    function finish() {
      if (finish.last === scn) return; finish.last = scn;
      res = scoreOf(scn, rules);
      track('widget_complete', { wallet: scn.addr, score: res.score, risk: band(res.score).label, findings: scn.findings.length });
      opts.onDone && opts.onDone(scn, res);
    }

    if (!film) {
      root.querySelectorAll('[data-rule]').forEach((el) => el.addEventListener('change', () => {
        const before = scoreOf(scn, rules).score;
        rules = { ...rules, [el.dataset.rule]: el.type === 'checkbox' ? el.checked : +el.value };
        const after = scoreOf(scn, rules).score;
        track('rule_changed', { rule: el.dataset.rule, value: rules[el.dataset.rule], score_before: before, score_after: after });
        // re-score: animate the gauge from the shown value to the new one
        const t = Math.max(now(), DUR);
        scoreFrom = before; ruleT = t; prevScore = after;
        t0 = performance.now() - t * 1000; runTo = t + 0.7;
        if (!raf) raf = requestAnimationFrame(loop);
        if (reduced) paintAt(t + 1);
        opts.onRescore && opts.onRescore(scn, scoreOf(scn, rules));
      }));
      const toast = q('toast'); let tt = 0;
      root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
        track('action_clicked', { action: b.dataset.act, wallet: scn && scn.addr, demo: true });
        toast.textContent = `Demo: no action taken (${b.textContent.trim().toLowerCase()})`;
        toast.hidden = false; clearTimeout(tt); tt = setTimeout(() => { toast.hidden = true; }, 2200);
      }));
    }

    return {
      run, build, paintAt, DUR,
      setRules(r, at, from) { rules = { ...DEFAULT_RULES, ...r }; if (at != null) { ruleT = at; scoreFrom = from; prevScore = scoreOf(scn, rules).score; } },
      get scenario() { return scn; }, get rules() { return rules; },
      score: () => scoreOf(scn, rules),
    };
  }

  window.InvWidget = { create, SAMPLES, scoreOf, DEFAULT_RULES, band, CHAIN_ICON, svgIcon, DUR };
})();
