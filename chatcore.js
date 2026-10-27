// Concept assistant core: guards, retrieval, offline answers and the grounding check.
// Pure functions, no DOM and no network, so the same file runs in the browser and in Apps Script (as ChatCore.gs).
// Needs TRM_KB (kb.js / KB.gs) loaded first.
(function (root) {
  // the knowledge base is read lazily, so file load order doesn't matter (Apps Script loads .gs files in project order)
  let KB = [];
  let ready = false;

  // ---------- text helpers ----------
  const STOP = new Set(('a an and are as at be but by can do does for from have how i if in into is it its me my of on or our please ' +
    'so tell than that the their them there these they this to was we what when where which who why will with you your about ' +
    'trm labs trm\'s any much many more most also just like get got would could should').split(' '));
  const SYN = {
    chain: 'blockchain', chains: 'blockchain', blockchains: 'blockchain', network: 'blockchain', networks: 'blockchain',
    coverage: 'cover', covered: 'cover', covers: 'cover', support: 'cover', supported: 'cover', supports: 'cover',
    bridges: 'bridge', bridged: 'bridge', bridging: 'bridge', crosschain: 'bridge', 'cross-chain': 'bridge',
    sanction: 'sanctions', sanctioned: 'sanctions', ofac: 'sanctions',
    wallets: 'wallet', address: 'wallet', addresses: 'wallet', screen: 'screening', screens: 'screening',
    monitor: 'monitoring', monitors: 'monitoring', alerts: 'alert', transactions: 'transaction',
    investigation: 'investigate', investigations: 'investigate', investigator: 'investigate', investigators: 'investigate', tracing: 'trace', traces: 'trace', traced: 'trace',
    stablecoin: 'stablecoins', token: 'tokens', tokens: 'tokens', issuer: 'stablecoins', issuers: 'stablecoins',
    agents: 'agent', ai: 'agent', attributions: 'attribution', attributed: 'attribution', confidence: 'attribution', source: 'attribution', sources: 'attribution',
    vasp: 'entity', vasps: 'entity', exchanges: 'entity', counterparty: 'entity', counterparties: 'entity', diligence: 'entity',
    fentanyl: 'fentanyl', precursor: 'fentanyl', drugs: 'fentanyl', difference: 'compare', differ: 'compare', versus: 'compare', vs: 'compare',
  };
  const stem = (w) => (SYN[w] || w.replace(/'s$/, '').replace(/(ing|ies|es|s)$/, (m) => (m === 'ies' ? 'y' : '')));
  function tokens(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9+\-' ]+/g, ' ').split(/\s+/)
      .filter((w) => w && !STOP.has(w)).map((w) => stem(SYN[w] ? w : w.replace(/[^a-z0-9+]/g, ''))).filter((w) => w.length > 1);
  }

  // ---------- BM25 over the knowledge base ----------
  let DOCS = [], N = 1, AVG = 1, DF = {};
  function ensure() {
    if (ready) return;
    KB = (root.TRM_KB && root.TRM_KB.KB) || [];
    DOCS = KB.map((c) => ({ c, t: tokens(c.text + ' ' + c.page_title + ' ' + c.topic + ' ' + c.topic) }));   // topic counted twice: weights it in BM25
    N = DOCS.length || 1;
    AVG = DOCS.reduce((a, d) => a + d.t.length, 0) / N || 1;
    DF = {};
    DOCS.forEach((d) => new Set(d.t).forEach((w) => { DF[w] = (DF[w] || 0) + 1; }));
      const SCAM = KB.find((c) => c.id === 'scam-1');
    FIXED.victim.citations = SCAM ? [{ n: 1, id: SCAM.id, score: null, url: SCAM.source_url, title: SCAM.page_title }] : [];
    ready = KB.length > 0;
  }
  const idf = (w) => Math.log(1 + (N - (DF[w] || 0) + 0.5) / ((DF[w] || 0) + 0.5));
  function retrieve(question, k) {
    ensure();
    const q = Array.from(new Set(tokens(question)));
    const K1 = 1.4, B = 0.7;
    const scored = DOCS.map((d) => {
      let s = 0, hits = 0;
      for (const w of q) {
        const tf = d.t.filter((x) => x === w).length;
        if (!tf) continue;
        hits++;
        s += idf(w) * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * d.t.length / AVG));
      }
      return { id: d.c.id, score: +s.toFixed(3), hits, chunk: d.c };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    return { terms: q, results: scored.slice(0, k || 5) };
  }

  // ---------- guards (run before any retrieval) ----------
  const VICTIM = [/\b(i|we|my (mom|dad|mother|father|friend|family))\b[^.?!]{0,40}\b(was|were|got|been|have been|has been)\s+(scammed|hacked|robbed|defrauded|phished)/i,
    /\brecover(y)?\b[^.?!]{0,30}\b(my|our|stolen|lost)\b/i, /\b(my|our)\b[^.?!]{0,30}\b(stolen|lost)\b[^.?!]{0,20}\b(crypto|bitcoin|funds|money|coins|usdt|eth)/i,
    /\bget (my|our) (money|funds|crypto|bitcoin|coins) back\b/i, /\bi (was|got) scammed\b/i, /\bscammed me\b/i, /\bpig[- ]?butcher(ed|ing) me\b/i, /\bfund recovery\b/i];
  const isVictim = (t) => VICTIM.some((r) => r.test(t));
  const PRICING = /\b(price|prices|pricing|cost|costs|how much|quote|discount|subscription fee|license fee|per seat|budget for)\b/i;
  const LEGAL = /\b(legal advice|is it legal|am i liable|liability|lawyer|attorney|sue|lawsuit|comply with the law|regulatory advice|should i file a sar)\b/i;
  const CUSTOMER = /\b(who (uses|are your customers)|customer list|which (banks|exchanges|companies) use|does (\w+ ){1,3}use trm|is (\w+ ){1,3}a (trm )?customer)\b/i;
  const HANDOFF = /\b(book|schedule|request|get|set up)( a| an)? (demo|call|meeting)|\b(talk|speak|chat) (to|with) (sales|someone|a (person|human|specialist|rep|representative))|\bcontact (sales|you|someone)\b|\bsales team\b/i;

  // seed phrases and private keys: detect, then redact before anything is stored, sent or shown
  const SECRET_RES = [
    { kind: 'private key', re: /\b(0x)?[a-f0-9]{64}\b/gi },
    { kind: 'private key', re: /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/g },
    { kind: 'extended private key', re: /\b[xyzt]prv[1-9A-HJ-NP-Za-km-z]{100,}\b/g },
  ];
  function redactSecrets(text) {
    let out = String(text || ''), found = [];
    for (const { kind, re } of SECRET_RES) out = out.replace(re, () => { found.push(kind); return '[redacted ' + kind + ']'; });
    // a run of 12+ short lowercase words reads like a seed phrase (12/15/18/21/24-word mnemonics)
    out = out.replace(/\b([a-z]{3,8})((\s+[a-z]{3,8}){11,23})\b/g, (m) => {
      const words = m.split(/\s+/);
      const common = words.filter((w) => STOP.has(w)).length;
      if (words.length >= 12 && common <= 2) { found.push('seed phrase'); return '[redacted seed phrase]'; }
      return m;
    });
    if (/\b(seed phrase|mnemonic|recovery phrase|private key)\b\s*[:=]/i.test(out)) {
      out = out.replace(/\b(seed phrase|mnemonic|recovery phrase|private key)\b\s*[:=]\s*[^\n]+/ig, (m, k) => { found.push(k.toLowerCase()); return k + ': [redacted]'; });
    }
    return { text: out, found: Array.from(new Set(found)) };
  }

  // ---------- intent (a category only; the text itself is never logged) ----------
  const PRODUCT_TOPICS = ['coverage', 'bridges', 'attribution', 'compliance', 'screening', 'monitoring', 'sanctions', 'stablecoins', 'due-diligence', 'forensics', 'ardence', 'ai', 'case-study', 'research'];
  function intentOf(text, retrieved) {
    if (isVictim(text)) return 'victim';
    if (redactSecrets(text).found.length) return 'secret';
    if (PRICING.test(text)) return 'pricing';
    if (LEGAL.test(text)) return 'legal';
    if (CUSTOMER.test(text)) return 'customers';
    if (HANDOFF.test(text)) return 'handoff';
    const top = retrieved && retrieved.results[0];
    return top ? top.chunk.topic : 'other';
  }

  // ---------- offline answer: quotes from the top chunks only ----------
  const MIN_SCORE = 2.2, MIN_HITS = 1;
  const PRODUCTS = { forensics: /\bforensics\b/i, ardence: /\bardence\b/i, screening: /\bwallet screening\b/i, monitoring: /\btransaction monitoring\b/i };
  function pickChunks(question) {
    const r = retrieve(question, 8);
    const good = r.results.filter((x) => x.score >= MIN_SCORE && x.hits >= MIN_HITS);
    if (!good.length) return { picked: [], retrieved: r };
    // name two products → take the best chunk for each, so a comparison quotes both
    const named = Object.keys(PRODUCTS).filter((p) => PRODUCTS[p].test(question));
    let picked = [];
    if (named.length >= 2) {
      for (const p of named) {
        // prefer each product's defining chunk (its id ends in -1), then the best score
        const hits = good.filter((x) => x.chunk.topic === p || x.chunk.page_title.toLowerCase().includes(p)).sort((a, b) => (/-1$/.test(b.id) - /-1$/.test(a.id)) || b.score - a.score);
        if (hits[0] && !picked.includes(hits[0])) picked.push(hits[0]);
      }
    }
    const top = good[0].score;
    for (const x of good) { if (picked.length >= 3) break; if (!picked.includes(x) && x.score >= top * 0.6) picked.push(x); }
    picked = picked.slice(0, 3);
    return { picked, retrieved: r };
  }
  function offlineAnswer(question) {
    const { picked, retrieved } = pickChunks(question);
    if (!picked.length) return { kind: 'fallback', reason: 'no_chunk_above_threshold', sentences: [], citations: [], retrieved };
    const citations = picked.map((p, i) => ({ n: i + 1, id: p.id, score: p.score, url: p.chunk.source_url, title: p.chunk.page_title }));
    const sentences = picked.map((p, i) => ({ text: p.chunk.text, cites: [i + 1] }));
    return { kind: 'answer', sentences, citations, retrieved };
  }

  // ---------- grounding check: every sentence must cite a chunk that was provided ----------
  function splitSentences(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+(?:[.!?]+(?:\s*\[\d+\])*|$)/g) || [];
  }
  function checkGrounding(text, k) {
    const sents = splitSentences(text).map((s) => s.trim()).filter((s) => s.replace(/\[\d+\]/g, '').trim().length > 1);
    const rows = sents.map((s) => {
      const cites = (s.match(/\[(\d+)\]/g) || []).map((m) => +m.slice(1, -1));
      const valid = cites.length > 0 && cites.every((n) => n >= 1 && n <= k);
      return { sentence: s, cites, valid };
    });
    return { grounded: rows.length > 0 && rows.every((r) => r.valid), rows };
  }
  // turn a cited text answer into the sentence/cite structure the page renders
  function parseCited(text) {
    return splitSentences(text).map((s) => s.trim()).filter(Boolean).map((s) => ({
      text: s.replace(/\s*\[\d+\]/g, '').trim(), cites: (s.match(/\[(\d+)\]/g) || []).map((m) => +m.slice(1, -1)),
    }));
  }

  // ---------- fixed replies ----------
  const FIXED = {
    victim: {
      kind: 'victim',
      sentences: [
        { text: 'I’m sorry this happened.', cites: [] },
        { text: 'TRM Labs is not involved in fund recovery processes for victims.', cites: [1] },
        { text: 'Please report it to law enforcement; in the US you can file a report at ic3.gov.', cites: [], link: 'https://www.ic3.gov' },
        { text: 'Be careful: scammers impersonate TRM Labs, and the only official TRM Labs domain is trmlabs.com.', cites: [1] },
      ],
      citations: [],
    },
    secret: { kind: 'secret', sentences: [{ text: 'Please never share a seed phrase or private key with anyone, including this chat.', cites: [] }, { text: 'I removed it from your message and did not store or send it.', cites: [] }, { text: 'If someone asked you for it, treat that as a warning sign of a scam.', cites: [] }], citations: [] },
    pricing: { kind: 'refusal', sentences: [{ text: 'I can’t discuss pricing here.', cites: [] }, { text: 'A specialist can scope that with you after a short form.', cites: [] }], citations: [], offerHandoff: true },
    legal: { kind: 'refusal', sentences: [{ text: 'I can’t give legal or regulatory advice.', cites: [] }, { text: 'For that, please talk to your own counsel; a TRM specialist can explain what the products do.', cites: [] }], citations: [], offerHandoff: true },
    fallback: { kind: 'fallback', sentences: [{ text: 'I don’t have an approved answer for that.', cites: [] }, { text: 'Want to talk to a specialist?', cites: [] }], citations: [], offerHandoff: true },
  };

  // ---------- route a question (guards first, then retrieval) ----------
  function route(rawText) {
    ensure();
    const red = redactSecrets(rawText);
    if (isVictim(red.text)) return { intent: 'victim', redacted: red.text, reply: FIXED.victim, retrieved: null };
    if (red.found.length) return { intent: 'secret', redacted: red.text, secretKinds: red.found, reply: FIXED.secret, retrieved: null };
    if (PRICING.test(red.text)) return { intent: 'pricing', redacted: red.text, reply: FIXED.pricing, retrieved: null };
    if (LEGAL.test(red.text)) return { intent: 'legal', redacted: red.text, reply: FIXED.legal, retrieved: null };
    if (HANDOFF.test(red.text)) return { intent: 'handoff', redacted: red.text, reply: null, retrieved: null };
    const ans = offlineAnswer(CUSTOMER.test(red.text) ? 'case study ' + red.text : red.text);
    const intent = CUSTOMER.test(red.text) ? 'customers' : (ans.retrieved.results[0] ? ans.retrieved.results[0].chunk.topic : 'other');
    return { intent, redacted: red.text, reply: ans.kind === 'answer' ? ans : FIXED.fallback, retrieved: ans.retrieved, fallbackReason: ans.reason };
  }

  const api = { get KB() { ensure(); return KB; }, tokens, retrieve, pickChunks, offlineAnswer, checkGrounding, parseCited, splitSentences, redactSecrets, isVictim, route, FIXED, PRODUCT_TOPICS, MIN_SCORE };
  root.ChatCore = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
