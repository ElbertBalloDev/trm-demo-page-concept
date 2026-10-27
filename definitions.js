// One source of truth for this page's funnel: the form, the score, the routing and the CRM record all read this object.
// Private-sector (crypto business) rules. sheet/Code.gs carries a copy for the server-side re-score. All values are made up.
window.DEFINITIONS = {
  version: 1,
  segment: { name: 'Private · Crypto Business', industry: 'Crypto Business' },

  exclusions: {
    // victims go to support, never to sales, and never count as leads
    victim_need: 'victim',
    victim_keywords: ['scam', 'scammed', 'stolen', 'theft', 'victim', 'lost my', 'recover my', 'hacked my', 'get my money back'],
    spam_patterns: ['test@', 'asdf', 'example@example', '@mailinator'],
    free_email_domains: ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'proton.me', 'protonmail.com', 'icloud.com', 'aol.com', 'gmx.com'],
  },

  scoring: {
    mql_threshold: 55,
    role: {
      decision: { match: ['chief', 'cco', 'head of', 'mlro', 'bsa officer', 'director', 'vp', 'vice president', 'founder', 'ceo', 'coo'], points: 25 },
      practitioner: { match: ['compliance', 'aml', 'risk', 'investigat', 'analyst', 'manager', 'kyc', 'fraud'], points: 15 },
      technical: { match: ['engineer', 'developer', 'architect', 'product'], points: 10 },
    },
    need: {
      'Transaction monitoring': 20,
      'Wallet screening': 20,
      'Sanctions compliance': 20,
      'Investigations': 15,
      'Entity due diligence': 15,
      'Just exploring': 0,
    },
    work_email: 15,          // company domain, not free mail
    ran_sample_screen: 10,   // behaviour on this page
    wrote_message: 5,
  },

  routing: {
    // region from the email domain's country TLD; Clay fills the real HQ country after submit
    regions: { EMEA: ['uk', 'de', 'fr', 'ch', 'nl', 'ie', 'es', 'it', 'ae', 'se', 'pl', 'pt', 'be', 'at', 'eu'], APAC: ['sg', 'au', 'jp', 'kr', 'hk', 'in', 'nz', 'id', 'ph', 'tw'] },
    default_region: 'AMER',
    team: 'Crypto Business',
    sla_minutes: { mql: 60, lead: 24 * 60 },   // first-touch targets (made up)
    nurture: 'Crypto compliance nurture',
  },

  crm: {
    sfdc_campaign_id: '701XXXXXXXXDEMO01',     // fake; TRM's real pages carry IDs starting with 701
    lead_source: 'Web',
    campaign_member_status: 'Responded',
  },
};
