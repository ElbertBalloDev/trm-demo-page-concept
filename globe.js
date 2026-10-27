// Hero globe. Built on the globe from Elbert's own trm-globe-demo (three.js, NASA Blue Marble / Black Marble textures,
// Natural Earth borders), re-graded dark for the navy page. Several made-up screenings run at once, each with its own
// lifecycle (draw → hold → fade → removed), spawned where the globe is facing. Rotation is one continuous orientation:
// nothing ever restarts. Loads lazily after first paint, pauses off-screen, respects reduced motion.
(() => {
  const host = document.getElementById('hero-globe');
  if (!host) return;
  const card = document.getElementById('globe-card');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // sample wallets from the page widget: window.heroGlobe.play(i) shows and focuses these
  const SAMPLE_TRACES = [
    { addr: '0x7a3f…e91c', chains: 'ETH → TRON', sev: 'High',
      pins: [[51.5, -0.1], [41.0, 29.0], [25.2, 55.3], [19.1, 72.9], [22.3, 114.2]], bridge: 2, end: 'red' },
    { addr: 'bc1q8x…k8zq', chains: 'BTC', sev: 'Medium',
      pins: [[43.7, -79.4], [47.4, 8.5], [41.0, 29.0], [1.35, 103.8]], bridge: 1, end: 'blue' },
    { addr: 'TQx4m…9LmP', chains: 'TRON → ETH', sev: 'Low',
      pins: [[-23.5, -46.6], [19.4, -99.1], [25.8, -80.2], [40.7, -74.0]], bridge: 2, end: 'blue' },
  ];
  const ROWS = {
    High: [['Direct', 'Mixer (sanctioned)', 'High'], ['Indirect', 'Bridged ETH → TRON, 2 hops', 'High'], ['Indirect', 'Entity on a sanctions list', 'Medium']],
    Medium: [['Direct', 'Peel chain, 4 transactions', 'Medium'], ['Indirect', '18% of inflows via a mixer', 'High'], ['Direct', 'Cashes out at a licensed exchange', 'High']],
    Low: [['Direct', 'Payment processor inflows', 'High'], ['Indirect', 'Bridged TRON → ETH', 'High'], ['Direct', 'No flagged exposure found', 'High']],
  };
  const SEV_CLASS = { High: 'sev-high', Medium: 'sev-med', Low: 'sev-low' };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- lazy script loading (after first paint) ----------
  const base = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/globe(-dev)?\.js.*$/, '') : '';
  const load = (src) => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = base + src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
  const hasWebGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
  function fallback() { host.classList.add('globe-static'); }
  function start() {
    if (!hasWebGL) { fallback(); return; }
    load('vendor/three.min.js')
      .then(() => Promise.all([load('vendor/topojson-client.min.js'), load('vendor/countries-50m.js'), load('vendor/textures.js')]))
      .then(build)
      .catch((e) => { console.warn('globe failed', e); fallback(); });
  }
  const kick = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 900 }) : setTimeout(start, 200));
  if (document.readyState === 'complete') requestAnimationFrame(kick); else addEventListener('load', () => requestAnimationFrame(kick));

  // ---------- the globe ----------
  function build() {
    const THREE = window.THREE;
    const D2R = Math.PI / 180, R = 1;
    const v3 = (lat, lon, r = R) => { const p = lat * D2R, l = lon * D2R; return new THREE.Vector3(r * Math.cos(p) * Math.sin(l), r * Math.sin(p), r * Math.cos(p) * Math.cos(l)); };

    const canvas = document.createElement('canvas');
    canvas.className = 'globe-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { fallback(); return; }
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    cam.position.set(0, 0, 4.6);
    const tilt = new THREE.Group(); const globe = new THREE.Group(); tilt.add(globe); scene.add(tilt);

    const tl = new THREE.TextureLoader(); const aniso = renderer.capabilities.getMaxAnisotropy();
    const tex = (k) => { const t = tl.load(window.TEX[k]); t.anisotropy = aniso; return t; };
    // dark grade: land barely lit, city lights carry the picture
    const earthMat = new THREE.ShaderMaterial({
      uniforms: { day: { value: tex('day') }, night: { value: tex('night') }, water: { value: tex('water') }, L: { value: new THREE.Vector3(-0.6, 0.5, 0.6).normalize() } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: `uniform sampler2D day, night, water; uniform vec3 L; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          vec3 N=normalize(vN), V=normalize(vV);
          float w=texture2D(water,vUv).r;
          float lum=dot(texture2D(day,vUv).rgb, vec3(.299,.587,.114));
          vec3 ocean=vec3(.012,.035,.11), land=vec3(.05,.09,.2)+lum*vec3(.08,.12,.2);
          vec3 col=mix(land, ocean, w);
          float lam=clamp(dot(N,L),0.,1.);
          col*= .75+.5*lam;
          col+= texture2D(night,vUv).rgb*vec3(1.,.82,.55)*1.25;
          col+= vec3(.02,.89,.98)*pow(1.-max(dot(N,V),0.),3.2)*.42;
          gl_FragColor=vec4(col,1.);
        }`,
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), earthMat);
    earth.rotation.y = -Math.PI / 2;
    globe.add(earth);
    // atmosphere rim in TRM cyan
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 96, 64), new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 n; void main(){ n=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 n; void main(){ float a=pow(clamp(.8-abs(n.z),0.,1.),2.8); gl_FragColor=vec4(.024,.89,.98,1.)*a*.9; }',
    })));
    // thin borders and coastlines
    function meshLines(ml, color, opacity) {
      const pos = [];
      for (const line of ml.coordinates) for (let i = 1; i < line.length; i++) {
        const a = v3(line[i - 1][1], line[i - 1][0], 1.0018), b = v3(line[i][1], line[i][0], 1.0018);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      globe.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })));
    }
    const C = window.COUNTRIES;
    meshLines(window.topojson.mesh(C, C.objects.countries, (a, b) => a !== b), 0x6fa8ff, 0.16);
    meshLines(window.topojson.mesh(C, C.objects.countries, (a, b) => a === b), 0x7fd8ff, 0.28);

    // ---------- the network: ~260 wallet / entity points, ~120 faint arcs, travelling pulses ----------
    // one Points draw for all dots, one LineSegments draw for all arcs, one Points draw for all pulses
    // real finance and exchange hubs by region; background density follows the regional weights, so no region dominates
    const REGIONS = {
      na: { w: 0.15, hubs: [[40.7, -74], [37.8, -122.4], [43.7, -79.4], [25.8, -80.2], [41.9, -87.6]] },
      latam: { w: 0.10, hubs: [[-23.5, -46.6], [-34.6, -58.4], [19.4, -99.1], [4.7, -74.1], [-12, -77], [-33.4, -70.6]] },
      eu: { w: 0.15, hubs: [[51.5, -0.1], [47.4, 8.5], [50.1, 8.7], [48.9, 2.35], [52.4, 4.9], [40.4, -3.7]] },
      mea: { w: 0.20, hubs: [[25.2, 55.3], [41, 29], [6.5, 3.4], [-1.3, 36.8], [-26.2, 28], [30.0, 31.2], [24.7, 46.7], [32.1, 34.8], [33.6, -7.6], [5.6, -0.2]] },
      sasia: { w: 0.20, hubs: [[19.1, 72.9], [12.97, 77.6], [28.6, 77.2], [1.35, 103.8], [13.8, 100.5], [-6.2, 106.8], [3.1, 101.7], [14.6, 121], [10.8, 106.7], [24.9, 67.0]] },
      easia: { w: 0.20, hubs: [[22.3, 114.2], [31.2, 121.5], [37.6, 127], [35.7, 139.7], [25.0, 121.5], [-33.9, 151.2], [-37.8, 145], [-36.8, 174.8]] },
    };
    const HUBS = Object.values(REGIONS).flatMap((r) => r.hubs);
    let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const NET = [];   // {lat, lon, kind}
    for (const [la, lo] of HUBS) NET.push({ lat: la, lon: lo, hub: true });
    const regionList = Object.values(REGIONS);
    const pickRegion = () => { let x = rnd(); for (const r of regionList) { if ((x -= r.w) <= 0) return r; } return regionList[regionList.length - 1]; };
    while (NET.length < 280) {
      const reg = pickRegion();
      const [la, lo] = reg.hubs[Math.floor(rnd() * reg.hubs.length)];
      const r = 1.5 + rnd() * 9, th = rnd() * Math.PI * 2;
      NET.push({ lat: Math.max(-55, Math.min(68, la + Math.sin(th) * r)), lon: lo + Math.cos(th) * r * 1.4 });
    }
    NET.forEach((n) => { const x = rnd(); n.kind = x < 0.05 ? 'red' : x < 0.12 ? 'amber' : x < 0.55 ? 'cyan' : 'blue'; n.v = v3(n.lat, n.lon, 1.004); });
    const NETCOL = { cyan: [0.55, 0.92, 1], blue: [0.35, 0.6, 1], amber: [1, 0.7, 0.3], red: [1, 0.35, 0.45] };
    {
      const pos = [], col = [], size = [];
      NET.forEach((n) => { pos.push(n.v.x, n.v.y, n.v.z); col.push(...NETCOL[n.kind]); size.push((n.hub ? 2.6 : 1.3) + rnd() * 1.4); });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
      globe.add(new THREE.Points(g, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { px: { value: renderer.getPixelRatio() } },
        vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; varying float vF; uniform float px;
          void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); vec3 n=normalize(normalMatrix*position);
            vF=smoothstep(-.05,.25,n.z); gl_PointSize=size*px*3.; gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying vec3 vC; varying float vF;
          void main(){ float d=length(gl_PointCoord-.5); float core=smoothstep(.22,.1,d); float glow=smoothstep(.5,.0,d)*.45;
            gl_FragColor=vec4(vC*(core+glow), (core+glow)*vF); }`,
      })));
    }
    // arcs: only between points more than ~800 km apart (0.126 rad on a 6371 km Earth)
    const MIN_ANG = 800 / 6371, ARC_SEG = 40;
    const arcsNet = [];
    let guard = 0;
    while (arcsNet.length < 120 && guard++ < 5000) {
      const i = Math.floor(rnd() * NET.length), j = Math.floor(rnd() * NET.length);
      if (i === j) continue;
      const A = NET[i].v, B = NET[j].v, ang = A.angleTo(B);
      if (ang < MIN_ANG || ang > 2.2) continue;
      const mid = A.clone().add(B).normalize().multiplyScalar(R + 0.02 + ang * 0.18);
      arcsNet.push(new THREE.QuadraticBezierCurve3(A.clone(), mid, B.clone()));
    }
    {
      const pos = [], col = [];
      for (const c of arcsNet) {
        const pts = c.getPoints(ARC_SEG);
        for (let k = 1; k < pts.length; k++) {
          pos.push(pts[k - 1].x, pts[k - 1].y, pts[k - 1].z, pts[k].x, pts[k].y, pts[k].z);
          const f = Math.sin(Math.PI * k / ARC_SEG);   // fade toward the ends
          const c1 = 0.35 + 0.65 * f; col.push(0.45 * c1, 0.75 * c1, 1 * c1, 0.45 * c1, 0.75 * c1, 1 * c1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      globe.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })));
    }
    // pulses: a short bright tail travelling along a subset of arcs, staggered
    const COMETS = 36, TAIL = 5;
    const comets = [];
    for (let k = 0; k < COMETS; k++) comets.push({ c: arcsNet[Math.floor(rnd() * arcsNet.length)], s: rnd() * 6, dur: 2.2 + rnd() * 2.6 });
    const cPos = new Float32Array(COMETS * TAIL * 3), cA = new Float32Array(COMETS * TAIL);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
    cg.setAttribute('alpha', new THREE.BufferAttribute(cA, 1));
    globe.add(new THREE.Points(cg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { px: { value: renderer.getPixelRatio() } },
      vertexShader: 'attribute float alpha; varying float vA; uniform float px; void main(){ vA=alpha; vec3 n=normalize(normalMatrix*position); vA*=smoothstep(-.05,.25,n.z); gl_PointSize=(3.+4.*alpha)*px; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.0,d); gl_FragColor=vec4(vec3(.75,.95,1.)*a, a*vA); }',
    })));
    const tmp = new THREE.Vector3();
    function ambient(now) {
      comets.forEach((cm, k) => {
        let p = (now - cm.s) / cm.dur;
        if (p > 1) { cm.c = arcsNet[Math.floor(rnd() * arcsNet.length)]; cm.s = now + rnd() * 2.5; cm.dur = 2.2 + rnd() * 2.6; p = -1; }
        for (let q = 0; q < TAIL; q++) {
          const o = (k * TAIL + q);
          const pp = p - q * 0.025;
          if (p < 0 || pp < 0 || pp > 1) { cA[o] = 0; continue; }
          cm.c.getPoint(pp, tmp); cPos[o * 3] = tmp.x; cPos[o * 3 + 1] = tmp.y; cPos[o * 3 + 2] = tmp.z;
          cA[o] = (1 - q / TAIL) * 0.85 * Math.sin(Math.PI * Math.min(1, pp * 1.0));
        }
      });
      cg.attributes.position.needsUpdate = true; cg.attributes.alpha.needsUpdate = true;
    }


    // ---------- concurrent traces: pooled buffers, no per-frame allocation ----------
    const SLOTS = 4, MAXPIN = 5, MAXSEG = MAXPIN - 1, PPS = 150;
    const HEX = { blue: [0.18, 0.53, 1], amber: [0.95, 0.64, 0.23], red: [1, 0.24, 0.37], green: [0.2, 0.86, 0.6], cyan: [0.1, 0.9, 0.98], white: [0.9, 0.95, 1] };
    const NT = SLOTS * MAXSEG * PPS, NP = SLOTS * MAXPIN;
    const tPos = new Float32Array(NT * 3), tCol = new Float32Array(NT * 3), tA = new Float32Array(NT), tSize = new Float32Array(NT);
    const pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3), pA = new Float32Array(NP), pS = new Float32Array(NP), rA = new Float32Array(NP), rS = new Float32Array(NP);
    const hPos = new Float32Array(SLOTS * 3), hA = new Float32Array(SLOTS), hCol = new Float32Array(SLOTS * 3).fill(1), hS = new Float32Array(SLOTS);
    const glowVS = `attribute float alpha; attribute vec3 color; attribute float size; uniform float px; uniform float base; varying vec3 vC; varying float vA;
      void main(){ vC=color; vA=alpha; vec3 n=normalize(normalMatrix*position); vA*=smoothstep(-.02,.22,n.z);
        gl_PointSize=(base+size)*px; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
    const glowFS = `varying vec3 vC; varying float vA; uniform float ring;
      void main(){ float d=length(gl_PointCoord-.5); float a;
        if(ring>.5){ a=smoothstep(.5,.42,d)*smoothstep(.3,.4,d); } else { a=smoothstep(.2,.06,d)*.85+smoothstep(.5,.0,d)*.22; }
        gl_FragColor=vec4(vC*a, a*vA); }`;
    function pointsLayer(pos, col, alpha, size, baseSize, ring, normal) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
      g.setAttribute('size', new THREE.BufferAttribute(size, 1));
      const m = new THREE.Points(g, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: normal ? THREE.NormalBlending : THREE.AdditiveBlending,
        uniforms: { px: { value: renderer.getPixelRatio() }, base: { value: baseSize }, ring: { value: ring ? 1 : 0 } },
        vertexShader: glowVS, fragmentShader: glowFS,
      }));
      m.frustumCulled = false; globe.add(m); return g;
    }
    const gTrace = pointsLayer(tPos, tCol, tA, tSize, 6.2, false, true);
    const gRing = pointsLayer(pPos, pCol, rA, rS, 0, true);
    const gPin = pointsLayer(pPos, pCol, pA, pS, 0, false);
    const gHead = pointsLayer(hPos, hCol, hA, hS, 11, false);
    const curves = Array.from({ length: SLOTS * MAXSEG }, () => new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()));
    const tmp2 = new THREE.Vector3();
    const slots = Array.from({ length: SLOTS }, (_, i) => ({ i, live: false, next: 0.3 + i * 1.7 }));

    // made-up ids
    const HEXD = '0123456789abcdef', B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const rr = Math.random;   // live variety; the network layout above stays seeded
    const pick = (set, n) => Array.from({ length: n }, () => set[Math.floor(rr() * set.length)]).join('');
    function fakeAddr(chain) {
      if (chain === 'BTC') return `bc1q${pick(HEXD, 2)}…${pick(HEXD, 4)}`;
      if (chain === 'TRON') return `T${pick(B58, 4)}…${pick(B58, 4)}`;
      return `0x${pick(HEXD, 4)}…${pick(HEXD, 4)}`;
    }

    // ---------- mode: compliance (prevent) or investigations (trace) ----------
    const urlMode = new URLSearchParams(location.search).get('mode');
    let mode = urlMode === 'investigate' ? 'investigate' : 'compliance';
    let exchangeHub = null;   // compliance: the customer's exchange, picked where the globe is facing

    // orientation: one continuous quaternion; auto-rotate, drag and focus all start from wherever it is
    const q = new THREE.Quaternion(), qTarget = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    const AX_Y = new THREE.Vector3(0, 1, 0), AX_X = new THREE.Vector3(1, 0, 0);
    q.multiplyQuaternions(qa.setFromAxisAngle(AX_X, 15 * D2R), qb.setFromAxisAngle(AX_Y, -65 * D2R));   // opens on the Gulf / Indian Ocean
    let spin = 0, focus = null, focusUntil = 0, simT = 0, holdUntil = 0, lastHold = -10, autoGain = 0;
    const hubVis = HUBS.map(([la, lo]) => ({ la, lo, v: v3(la, lo, 1.004) }));
    const facing = (v, zMin = 0.42) => { const w = tmp2.copy(v).applyQuaternion(q); return w.z > zMin && Math.abs(w.x) < 0.82 && Math.abs(w.y) < 0.84; };
    const busyHubs = () => new Set(slots.filter((s) => s.live).flatMap((s) => s.hubs || []));

    function pathFrom(start, n, busy, endAt) {
      const vis = hubVis.filter((h) => facing(h.v));
      const path = [start];
      while (path.length < n + 1) {
        const cur = path[path.length - 1];
        const last = path.length === n;
        let opts;
        if (last && endAt) opts = cur.v.angleTo(endAt.v) > 0.13 ? [endAt] : [];
        else opts = vis.filter((h) => !path.includes(h) && h !== endAt && !busy.has(h) && cur.v.angleTo(h.v) > 0.13 && cur.v.angleTo(h.v) < 0.7 && (path.length < 2 || path[0].v.angleTo(h.v) > path[0].v.angleTo(cur.v) * 0.9));
        if (!opts.length) return null;
        path.push(opts[Math.floor(rr() * opts.length)]);
      }
      return path;
    }

    // compliance: a wallet sends funds into the customer's exchange; screened on landing
    function genCompliance() {
      if (!exchangeHub || !facing(exchangeHub.v, 0.55)) {
        const cands = hubVis.filter((h) => facing(h.v, 0.7));
        exchangeHub = cands[Math.floor(rr() * cands.length)] || exchangeHub;
      }
      if (!exchangeHub) return null;
      const busy = busyHubs();
      const vis = hubVis.filter((h) => h !== exchangeHub && facing(h.v, 0.25) && !busy.has(h) && h.v.angleTo(exchangeHub.v) > 0.13);
      if (!vis.length) return null;
      const start = vis[Math.floor(rr() * vis.length)];
      const twoHop = rr() < 0.4;
      const path = twoHop ? pathFrom(start, 2, busy, exchangeHub) : [start, exchangeHub];
      if (!path) return null;
      const x = rr();
      const outcome = x < 0.6 ? 'passed' : x < 0.82 ? 'held' : 'blocked';
      const risk = outcome === 'passed' ? 'Low' : outcome === 'held' ? 'Medium' : 'High';
      const chain = ['ETH', 'TRON', 'BTC'][Math.floor(rr() * 3)];
      const addr = fakeAddr(chain);
      const nSeg = path.length - 1;
      const land = nSeg * 0.9;
      const resultKind = outcome === 'passed' ? 'green' : outcome === 'held' ? 'amber' : 'red';
      const sar = outcome === 'blocked' && rr() < 0.5;
      const reasons = { passed: [['Direct', 'Known counterparty, licensed VASP', 'High'], ['Indirect', 'No flagged exposure within 3 hops', 'High']],
        held: [['Indirect', '22% of funds via a mixer, 2 hops back', 'Medium'], ['Direct', 'New wallet, first deposit', 'High']],
        blocked: [['Direct', 'Sent from a sanctioned mixer', 'High'], ['Indirect', 'Entity on a sanctions list, 1 hop', 'High']] };
      return {
        hubs: path, pins: path.map((h) => h.v.clone()), pinKinds: path.map((h, k) => (k === path.length - 1 ? 'cyan' : 'blue')),
        segKinds: path.slice(1).map(() => 'blue'), drawSeg: 0.9, hold: 3.6,
        stopShort: outcome === 'blocked' ? 0.84 : outcome === 'held' ? 0.93 : null,
        recolor: { at: land, kind: resultKind },
        anchor: outcome === 'passed' ? path.length - 1 : path.length - 1,
        chips: outcome === 'passed' ? [{ at: land, html: `<span>${esc(addr)}</span><b class="sev-low">PASSED</b>` }]
          : outcome === 'held' ? [{ at: land, html: `<span>${esc(addr)}</span><b class="sev-med">HELD for review</b>` }]
            : [{ at: land, html: `<span>${esc(addr)}</span><b class="sev-high">BLOCKED by customer</b>` }],
        row: { a: esc(addr), b: `<b class="pill ${SEV_CLASS[risk]}">${risk}</b>`, statuses: [[0, 'screening…'], [land, outcome === 'passed' ? '<span class="st-ok">passed</span>' : outcome === 'held' ? '<span class="st-warn">held</span>' : '<span class="st-bad">blocked</span>'], ...(sar ? [[land + 1.6, '<span class="st-bad">blocked · SAR filed</span>']] : [])] },
        detail: { title: 'Inbound deposit', id: addr, sev: risk, rows: reasons[outcome] },
      };
    }

    // investigations: funds leave a victim or hack point, hop across chains, converge on a cash-out exchange
    const CASES = ['Ransomware', 'Scam', 'Hack'];
    function genInvestigate() {
      const busy = busyHubs();
      const vis = hubVis.filter((h) => facing(h.v, 0.35) && !busy.has(h));
      if (vis.length < 4) return null;
      const start = vis[Math.floor(rr() * vis.length)];
      const n = 3 + Math.floor(rr() * 2);
      const path = pathFrom(start, n, busy, null);
      if (!path) return null;
      const bridge = 1 + Math.floor(rr() * (path.length - 2));
      const nSeg = path.length - 1;
      const done = nSeg * 0.95;
      const kind = CASES[Math.floor(rr() * CASES.length)];
      const id = `CASE-${pick('0123456789', 4)}`;
      return {
        hubs: path, pins: path.map((h) => h.v.clone()),
        pinKinds: path.map((h, k) => (k === 0 ? 'red' : k === path.length - 1 ? 'cyan' : k === bridge ? 'amber' : 'blue')),
        segKinds: path.slice(1).map((h, k) => (k + 1 === bridge || k === bridge ? 'amber' : 'blue')),
        drawSeg: 0.95, hold: 4.4, stopShort: null, recolor: null, anchor: path.length - 1, sources: true,
        chips: [{ at: done, html: '<b class="sev-cyan">Alert sent to exchange</b>' }, { at: done + 1.6, html: '<b class="sev-cyan">Freeze requested · awaiting exchange</b>' }],
        row: { a: `${kind} <span class="muted">${id}</span>`, b: `<span class="hops" data-hops>0 hops</span>`, statuses: [[0, 'tracing…'], [done, '<span class="st-warn">alerted</span>'], [done + 1.6, '<span class="st-ok">freeze requested</span>']], hops: nSeg },
        detail: { title: `${kind} case`, id, sev: null, rows: [['Path', `${nSeg} hops across ${bridge ? 2 : 1} chain${bridge ? 's' : ''}`, ''], ['Bridge', 'ETH → TRON contract', 'High'], ['Cash-out', 'Exchange alerted · the exchange decides on a freeze', '']] },
      };
    }

    function sampleSpec(t) {
      const pins = t.pins.map(([la, lo]) => v3(la, lo, 1.004));
      const nSeg = pins.length - 1;
      return {
        hubs: [], pins, pinKinds: pins.map((p, k) => (k === pins.length - 1 ? t.end : k === t.bridge ? 'amber' : 'blue')),
        segKinds: pins.slice(1).map((p, k) => (k === nSeg - 1 && t.end === 'red' ? 'red' : k + 1 === t.bridge || k === t.bridge ? 'amber' : 'blue')),
        drawSeg: 0.8, hold: 7, stopShort: null, recolor: null, anchor: pins.length - 1,
        chips: [{ at: nSeg * 0.8, html: `<span>${esc(t.addr)}</span><b class="${SEV_CLASS[t.sev]}">${t.sev.toUpperCase()}</b>` }],
        row: { a: esc(t.addr), b: `<b class="pill ${SEV_CLASS[t.sev]}">${t.sev}</b>`, statuses: [[0, 'screening…'], [nSeg * 0.8, 'sample screen']] },
        detail: { title: 'Wallet screen', id: t.addr, sev: t.sev, rows: ROWS[t.sev] },
        sample: t.addr,
      };
    }

    function spawn(slot, simT, spec) {
      if (!spec) { slot.next = simT + 0.7; return; }
      const nSeg = spec.pins.length - 1;
      Object.assign(slot, { live: true, leaving: false, born: simT, spec, nSeg, nPin: spec.pins.length, hubs: spec.hubs, life: nSeg * spec.drawSeg + spec.hold + 0.9, statusIdx: -1, chipIdx: -1, recolored: false, mode: spec.sample ? 'sample' : mode });
      for (let k = 0; k < MAXPIN; k++) {
        const o = slot.i * MAXPIN + k;
        if (k >= spec.pins.length) { pA[o] = 0; rA[o] = 0; continue; }
        const p = spec.pins[k];
        pPos[o * 3] = p.x; pPos[o * 3 + 1] = p.y; pPos[o * 3 + 2] = p.z;
        const c = HEX[spec.pinKinds[k]]; pCol[o * 3] = c[0]; pCol[o * 3 + 1] = c[1]; pCol[o * 3 + 2] = c[2];
        pS[o] = k === 0 || k === spec.pins.length - 1 ? 9 : 7;
      }
      for (let g = 0; g < MAXSEG; g++) {
        const base = (slot.i * MAXSEG + g) * PPS;
        if (g >= nSeg) { tA.fill(0, base, base + PPS); continue; }
        const A = spec.pins[g], B = spec.pins[g + 1], cv = curves[slot.i * MAXSEG + g];
        cv.v0.copy(A); cv.v2.copy(B); cv.v1.copy(A).add(B).normalize().multiplyScalar(R + 0.05 + A.angleTo(B) * 0.3);
        const c = HEX[spec.segKinds[g]];
        for (let k = 0; k < PPS; k++) {
          cv.getPoint(k / (PPS - 1), tmp);
          const o = (base + k) * 3;
          tPos[o] = tmp.x; tPos[o + 1] = tmp.y; tPos[o + 2] = tmp.z;
          tCol[o] = c[0]; tCol[o + 1] = c[1]; tCol[o + 2] = c[2];
        }
      }
      gTrace.attributes.position.needsUpdate = true; gTrace.attributes.color.needsUpdate = true;
      gPin.attributes.position.needsUpdate = true; gPin.attributes.color.needsUpdate = true; gPin.attributes.size.needsUpdate = true;
      gRing.attributes.position.needsUpdate = true; gRing.attributes.color.needsUpdate = true;
      slot.endV = spec.pins[spec.anchor];
      slot.centre = spec.pins.reduce((a, p) => a.add(p), new THREE.Vector3()).normalize();
      if (simT > 0.5 && simT - lastHold > 6) { holdUntil = simT + 1.5; lastHold = simT; }   // read pause, at most every 6 s
      queueAdd(slot);
    }
    function recolor(slot, kind) {
      const c = HEX[kind];
      for (let g = 0; g < slot.nSeg; g++) {
        const base = (slot.i * MAXSEG + g) * PPS;
        for (let k = 0; k < PPS; k++) { const o = (base + k) * 3; tCol[o] = c[0]; tCol[o + 1] = c[1]; tCol[o + 2] = c[2]; }
      }
      const o = (slot.i * MAXPIN) * 3; pCol[o] = c[0]; pCol[o + 1] = c[1]; pCol[o + 2] = c[2];
      gTrace.attributes.color.needsUpdate = true; gPin.attributes.color.needsUpdate = true; gRing.attributes.color.needsUpdate = true;
    }
    function remove(slot, simT) {
      slot.live = false; slot.hubs = null; slot.next = simT + 0.5 + rnd() * 1.2;
      tA.fill(0, slot.i * MAXSEG * PPS, (slot.i + 1) * MAXSEG * PPS);
      for (let k = 0; k < MAXPIN; k++) { pA[slot.i * MAXPIN + k] = 0; rA[slot.i * MAXPIN + k] = 0; }
      hA[slot.i] = 0;
      if (focus === slot) unfocus();
      queueRemove(slot);
    }

    // ---------- label chips + queue card (DOM, reused) ----------
    const chipLayer = document.createElement('div'); chipLayer.className = 'gchips'; host.appendChild(chipLayer);
    slots.forEach((s) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'gchip'; b.hidden = true;
      b.addEventListener('click', () => toggleFocus(s)); chipLayer.appendChild(b); s.chip = b;
    });
    const MODE_TEXT = {
      compliance: { title: (n) => `Screening · <b>${n}</b> live`, foot: 'The customer decides: block, hold or file a report.' },
      investigate: { title: (n) => `Cases · <b>${n}</b> active`, foot: 'Law enforcement acts: warrants, seizures, arrests.' },
    };
    let listEl = null, detailEl = null, titleEl = null, footEl = null;
    if (card) {
      card.classList.add('gq');
      card.innerHTML = `<div class="gq-head"><span class="gq-dot" aria-hidden="true"></span><span data-q="title"></span><span class="gq-tag">made-up data</span></div>
        <ul class="gq-list" data-q="list"></ul><div class="gq-detail" data-q="detail" hidden></div>
        <p class="gq-foot" data-q="foot"></p>
        <p class="gc-foot"><span class="lgi"><i class="lg lg-blue"></i>path</span><span class="lgi"><i class="lg lg-amber"></i>bridge</span><span class="lgi"><i class="lg lg-red"></i>flagged</span><span class="lgi"><i class="lg lg-green"></i>passed</span><span class="lgi">· illustrative</span></p>`;
      listEl = card.querySelector('[data-q="list"]'); detailEl = card.querySelector('[data-q="detail"]'); titleEl = card.querySelector('[data-q="title"]'); footEl = card.querySelector('[data-q="foot"]');
    }
    function updateHead() {
      if (!titleEl) return;
      const n = slots.filter((s) => s.live && !s.leaving).length;
      titleEl.innerHTML = MODE_TEXT[mode].title(n);
      footEl.textContent = MODE_TEXT[mode].foot;
      card.dataset.mode = mode;
    }
    function queueAdd(slot) {
      if (!listEl) return;
      if (slot.row) slot.row.remove();
      const li = document.createElement('li');
      li.className = 'gq-in';
      li.innerHTML = `<button type="button" class="gq-row"><span class="gq-a">${slot.spec.row.a}</span><span class="gq-b">${slot.spec.row.b}</span><span class="gq-st">${slot.spec.row.statuses[0][1]}</span></button>`;
      li.querySelector('button').addEventListener('click', () => toggleFocus(slot));
      listEl.prepend(li); slot.row = li; slot.statusIdx = 0; slot.hopsEl = li.querySelector('[data-hops]');
      while (listEl.children.length > 6) listEl.lastElementChild.remove();
      requestAnimationFrame(() => requestAnimationFrame(() => li.classList.remove('gq-in')));
      updateHead();
    }
    function queueRemove(slot) {
      const li = slot.row; slot.row = null;
      if (li) { li.classList.add('gq-out'); setTimeout(() => li.remove(), 450); }
      slot.chip.hidden = true;
      updateHead();
    }
    function renderDetail(slot) {
      if (!detailEl) return;
      const d = slot.spec.detail;
      detailEl.hidden = false;
      detailEl.innerHTML = `<div class="gc-head"><div><p class="ui-label">${esc(d.title)}</p><p class="ui-addr">${esc(d.id)}</p></div>${d.sev ? `<div class="sev"><span>Risk</span><b class="${SEV_CLASS[d.sev]}">${d.sev}</b></div>` : ''}</div>
        <ul class="ui-rows">${d.rows.map(([k, t, c]) => `<li><span class="tag ${k === 'Indirect' || k === 'Bridge' ? 'tag-indirect' : 'tag-direct'}">${esc(k)}</span><span>${esc(t)}</span><span class="conf">${esc(c)}</span></li>`).join('')}</ul>`;
    }

    // ---------- focus: ease from the current orientation, and back out from wherever it is ----------
    function focusOn(slot, simT) {
      focus = slot; focusUntil = simT + 6;
      const c = slot.centre;
      const lat = Math.asin(Math.max(-1, Math.min(1, c.y))), lon = Math.atan2(c.x, c.z);
      qTarget.multiplyQuaternions(qa.setFromAxisAngle(AX_X, lat + 0.22), qb.setFromAxisAngle(AX_Y, -lon + 0.32));   // lands upper-right, clear of the card
      renderDetail(slot);
      listEl && [...listEl.children].forEach((li) => li.classList.toggle('gq-focus', li === slot.row));
      card && card.classList.add('gq-focused');
      kickFrame();
    }
    function unfocus() {
      focus = null;
      if (detailEl) { detailEl.hidden = true; detailEl.innerHTML = ''; }
      listEl && [...listEl.children].forEach((li) => li.classList.remove('gq-focus'));
      card && card.classList.remove('gq-focused');
    }
    function toggleFocus(slot) { if (focus === slot) unfocus(); else focusOn(slot, simT); }

    // ---------- mode toggle ----------
    const seg = document.getElementById('globe-mode');
    function setMode(m, source) {
      if (m === mode) return;
      mode = m;
      // crossfade: current traces fade out now; the next spawns use the new mode
      for (const s of slots) if (s.live && s.mode !== 'sample') { s.leaving = true; s.life = Math.min(s.life, simT - s.born + 0.9); s.next = 0; }
      slots.forEach((s, k) => { if (!s.live) s.next = simT + 0.4 + k * 0.6; });
      unfocus();
      if (listEl) [...listEl.children].forEach((li) => li.classList.add('gq-out'));
      setTimeout(() => { if (listEl) [...listEl.querySelectorAll('.gq-out')].forEach((li) => li.remove()); }, 450);
      exchangeHub = null;
      updateHead();
      if (seg) seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      try { window.dataLayer && window.dataLayer.push({ event: 'globe_mode_changed', mode, source }); window.__pageTrack && window.__pageTrack('globe_mode_changed', { mode, source }); } catch { /* analytics optional */ }
      if (reduced) staticState();
      kickFrame();
    }
    if (seg) {
      seg.querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
        b.addEventListener('click', () => setMode(b.dataset.mode, 'toggle'));
      });
    }

    // ---------- interaction: drag with momentum ----------
    let dragging = false, lastX = 0, lastY = 0, velY = 0, velX = 0, lastInteract = -10;
    canvas.style.touchAction = 'pan-y';
    canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); host.classList.add('dragging'); kickFrame(); });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
      velY = dx * 0.006; velX = dy * 0.004;
      q.premultiply(qa.setFromAxisAngle(AX_Y, velY)); q.premultiply(qa.setFromAxisAngle(AX_X, velX)); q.normalize();
      lastInteract = simT; if (focus) unfocus(); kickFrame();
    });
    const endDrag = () => { dragging = false; host.classList.remove('dragging'); };
    canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
    // no wheel handler: the page keeps scrolling normally

    function resize() {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);   // CSS keeps the canvas at 100% x 100% (retina-safe)
      cam.aspect = w / h;
      cam.position.z = (w / h < 1 ? 5.2 / Math.min(1, w / h * 1.1) : 5.3);
      cam.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(host);
    resize();

    // ---------- per-frame update ----------
    const ease = (x) => 1 - Math.pow(1 - x, 3);
    const proj = new THREE.Vector3();
    let cardBox = null;
    function measureCard() {
      if (!card) return;
      const h = host.getBoundingClientRect(), c = card.getBoundingClientRect();
      cardBox = getComputedStyle(card).position === 'absolute' ? { l: c.left - h.left, r: c.right - h.left, t: c.top - h.top } : null;
    }
    new ResizeObserver(measureCard).observe(card || host); addEventListener('resize', measureCard); measureCard();
    function update(dt) {
      if (focus) {
        q.slerp(qTarget, 1 - Math.exp(-dt * 3.2));
        if (simT > focusUntil) unfocus();
      } else if (!dragging) {
        velY *= Math.exp(-dt * 2.5); velX *= Math.exp(-dt * 2.5);
        // ~3.2°/s (one turn per ~112 s); eases in after a drag and holds ~1.5 s when a new trace starts
        const want = reduced || simT < holdUntil || simT - lastInteract < 1.2 ? 0 : 1;
        autoGain += (want - autoGain) * (1 - Math.exp(-dt * 1.6));
        const auto = 0.068 * autoGain;
        spin += auto * dt;
        const dy = velY + auto * dt;
        if (Math.abs(dy) > 1e-7) q.premultiply(qa.setFromAxisAngle(AX_Y, dy));
        if (Math.abs(velX) > 1e-7) q.premultiply(qa.setFromAxisAngle(AX_X, velX));
        q.normalize();
      }
      globe.quaternion.copy(q);
      globe.updateMatrixWorld();
      if (!reduced) for (const s of slots) if (!s.live && simT >= s.next) spawn(s, simT, mode === 'compliance' ? genCompliance() : genInvestigate());
      const W = host.clientWidth, H = host.clientHeight, pr = renderer.getPixelRatio();
      for (const s of slots) {
        if (!s.live) continue;
        const sp = s.spec;
        const age = reduced ? s.nSeg * sp.drawSeg + 3 : simT - s.born;
        if (!reduced && age > s.life) { remove(s, simT); continue; }
        const fade = reduced ? 1 : 1 - Math.max(0, Math.min(1, (age - (s.life - 0.9)) / 0.9));
        const dim = focus && focus !== s ? 0.22 : 1;
        const bright = (focus === s ? 1.25 : 1) * dim * fade;
        if (sp.recolor && !s.recolored && age >= sp.recolor.at) { s.recolored = true; recolor(s, sp.recolor.kind); }
        let head = -1;
        const segBase = s.i * MAXSEG * PPS;
        for (let g = 0; g < s.nSeg; g++) {
          const base = segBase + g * PPS;
          const p = Math.max(0, Math.min(1, (age - g * sp.drawSeg) / sp.drawSeg));
          const lim = g === s.nSeg - 1 && sp.stopShort ? sp.stopShort : 1;
          const cut = ease(p) * lim * (PPS - 1);
          for (let k = 0; k < PPS; k++) tA[base + k] = k <= cut ? 0.92 * bright : 0;
          if (p > 0 && p < 1) head = base + Math.floor(cut);
        }
        if (head >= 0) { hPos[s.i * 3] = tPos[head * 3]; hPos[s.i * 3 + 1] = tPos[head * 3 + 1]; hPos[s.i * 3 + 2] = tPos[head * 3 + 2]; hA[s.i] = bright; } else hA[s.i] = 0;
        const pinBase = s.i * MAXPIN;
        for (let k = 0; k < s.nPin; k++) {
          const at = k === 0 ? 0 : k * sp.drawSeg;
          const blockedEnd = sp.stopShort && k === s.nPin - 1;
          const p = Math.max(0, Math.min(1, (age - at) / 0.3));
          pA[pinBase + k] = p * bright * (blockedEnd ? 0.8 : 1);
          const pulse = reduced ? 0.4 : ((age - at) % 1.8) / 1.8;
          rS[pinBase + k] = 10 + pulse * 18;
          rA[pinBase + k] = p * (1 - pulse) * 0.7 * bright;
        }
        // queue status + hop counter
        const st = sp.row.statuses;
        let si = 0; for (let k = 0; k < st.length; k++) if (age >= st[k][0]) si = k;
        if (si !== s.statusIdx && s.row) { s.statusIdx = si; s.row.querySelector('.gq-st').innerHTML = st[si][1]; }
        if (s.hopsEl) { const h = Math.min(s.nSeg, Math.floor(age / sp.drawSeg)); if (s.hopsEl.dataset.n !== String(h)) { s.hopsEl.dataset.n = h; s.hopsEl.textContent = `${h} hop${h === 1 ? '' : 's'} traced`; } }
        // end-point chip faces the camera
        let ci = -1; for (let k = 0; k < sp.chips.length; k++) if (age >= sp.chips[k].at) ci = k;
        if (ci !== s.chipIdx) { s.chipIdx = ci; if (ci >= 0) s.chip.innerHTML = sp.chips[ci].html; }
        proj.copy(s.endV).applyMatrix4(globe.matrixWorld);
        const front = proj.z > 0.18;
        proj.project(cam);
        const cx = (proj.x + 1) / 2 * W, cy = (1 - proj.y) / 2 * H;
        const underCard = cardBox && cx > cardBox.l - 20 && cx < cardBox.r + 20 && cy > cardBox.t - 40;
        if (ci >= 0 && front && fade > 0.05 && !underCard) {
          s.chip.hidden = false;
          s.chip.classList.toggle('flip', cx > W - 230);
          s.chip.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
          s.chip.style.opacity = (fade * (focus && focus !== s ? 0.35 : 1)).toFixed(2);
        } else s.chip.hidden = true;
      }
      // keep chips off the card and from stacking on each other
      const cr = card && cardBox ? card.getBoundingClientRect() : null;
      for (let a = 0; a < SLOTS; a++) {
        const A = slots[a]; if (!A.live || A.chip.hidden) continue;
        if (cr) { const r = A.chip.getBoundingClientRect(); if (r.left < cr.right && cr.left < r.right && r.top < cr.bottom && cr.top < r.bottom) { A.chip.hidden = true; continue; } }
        for (let b = 0; b < a; b++) {
          const B = slots[b]; if (!B.live || B.chip.hidden) continue;
          const ra = A.chip.getBoundingClientRect(), rb = B.chip.getBoundingClientRect();
          if (ra.left < rb.right && rb.left < ra.right && ra.top < rb.bottom && rb.top < ra.bottom) { A.chip.hidden = true; break; }
        }
      }
      gTrace.attributes.alpha.needsUpdate = true;
      gPin.attributes.alpha.needsUpdate = true;
      gRing.attributes.alpha.needsUpdate = true; gRing.attributes.size.needsUpdate = true;
      gHead.attributes.position.needsUpdate = true; gHead.attributes.alpha.needsUpdate = true;
    }

    // ---------- run only when visible; sim time only advances while running ----------
    let visible = true, raf = 0, last = 0, started = false;
    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) { last = 0; return; }
      const dt = last ? Math.min(0.25, (now - last) / 1000) : 0.016;   // real time, even on slow GPUs
      last = now;
      simT += dt;
      update(dt);
      if (!reduced) ambient(simT);
      renderer.render(scene, cam);
      if (!started) { started = true; host.classList.add('globe-ready'); }
      if (!reduced || dragging || focus) raf = requestAnimationFrame(frame);
    }
    const kickFrame = () => { if (!raf) raf = requestAnimationFrame(frame); };
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kickFrame(); }, { threshold: 0.02 }).observe(host);
    document.addEventListener('visibilitychange', kickFrame);
    canvas.addEventListener('pointermove', kickFrame);
    THREE.DefaultLoadingManager.onLoad = kickFrame;

    // reduced motion: a static, fully drawn state for the current mode
    function staticState() {
      slots.forEach((s) => { if (s.live) remove(s, 0); });
      for (let k = 0; k < 3; k++) for (let tries = 0; tries < 12 && !slots[k].live; tries++) spawn(slots[k], 0, mode === 'compliance' ? genCompliance() : genInvestigate());
      kickFrame();
    }
    updateHead();
    if (reduced) staticState();
    else {
      // pre-seed 3 traces mid-animation so the hero is never empty
      for (let k = 0; k < 3; k++) for (let tries = 0; tries < 12 && !slots[k].live; tries++) spawn(slots[k], -(0.6 + k * 1.3), mode === 'compliance' ? genCompliance() : genInvestigate());
      slots[3].next = 0.8;
    }
    kickFrame();

    window.heroGlobe = {
      play(i = 0) {
        const t = SAMPLE_TRACES[Math.max(0, Math.min(SAMPLE_TRACES.length - 1, i))];
        const slot = slots.find((s) => s.live && s.spec.sample === t.addr) || slots.find((s) => !s.live) || slots.slice().sort((a, b) => a.born - b.born)[0];
        if (slot.live && slot.spec.sample !== t.addr) remove(slot, simT);
        if (!slot.live) spawn(slot, simT, sampleSpec(t));
        focusOn(slot, simT);
      },
      setMode: (m) => setMode(m === 'investigate' ? 'investigate' : 'compliance', 'api'),
      focusLive(n = 0) { const s = slots.filter((x) => x.live && x.chipIdx >= 0)[n] || slots.filter((x) => x.live)[n]; if (s) focusOn(s, simT); return !!s; },
      debug() { const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q.clone().invert()); return { simT: +simT.toFixed(2), spin: +spin.toFixed(4), frontLon: +(Math.atan2(f.x, f.z) / D2R).toFixed(2), live: slots.filter((s) => s.live).length, focused: !!focus, mode }; },
    };
  }
})();
