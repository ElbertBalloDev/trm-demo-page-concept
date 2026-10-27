// Knowledge base for the concept assistant: short chunks quoted or closely paraphrased from TRM's PUBLIC pages,
// read 2026-10-26. Each claim stays tied to the page that states it (e.g. Forensics says 65+ blockchains;
// Wallet Screening and Compliance say 184+). Nothing here is TRM's own data beyond what those pages say.
(function (root) {
  const U = {
    demo: ['https://www.trmlabs.com/crypto-business/demo', 'Blockchain Intelligence for Crypto Compliance'],
    ardence: ['https://www.trmlabs.com/ardence', 'Ardence: AI Investigation Platform'],
    forensics: ['https://www.trmlabs.com/forensics', 'TRM Forensics'],
    compliance: ['https://www.trmlabs.com/crypto-compliance', 'Crypto Compliance'],
    wallet: ['https://www.trmlabs.com/crypto-compliance/wallet-screening', 'TRM Wallet Screening'],
    tm: ['https://www.trmlabs.com/crypto-compliance/transaction-monitoring', 'TRM Transaction Monitoring'],
    sanctions: ['https://www.trmlabs.com/crypto-compliance/sanctions', 'Sanctions'],
    kya: ['https://www.trmlabs.com/crypto-compliance/know-your-asset', 'TRM Know-Your-Asset'],
    edd: ['https://www.trmlabs.com/crypto-compliance/entity-due-diligence', 'TRM Entity Due Diligence'],
    scam: ['https://www.trmlabs.com/policies/impersonation-scam-warning', 'Impersonation Scam Warning'],
    roxom: ['https://www.trmlabs.com/files/case-study-how-roxom-is-pioneering-agentic-compliance', 'How Roxom is Pioneering Agentic Compliance (case study)'],
    hifi: ['https://www.trmlabs.com/files/case-study-how-hifi-built-compliance-into-stablecoin-infrastructure-from-day-zero', 'How HIFI Built Compliance Into Stablecoin Infrastructure From Day Zero (case study)'],
    fentanyl: ['https://www.trmlabs.com/resources/blog/beyond-fentanyl-trm-report-reveals-cryptocurrencys-role-in-the-international-drug-precursor-market', 'Beyond Fentanyl: TRM Report (blog summary)'],
  };
  const c = (id, page, text, topic) => ({ id, text, source_url: U[page][0], page_title: U[page][1], topic });
  const KB = [
    // crypto-business demo page
    c('demo-1', 'demo', 'TRM offers blockchain intelligence for crypto compliance, to safeguard business growth and prevent bad actors from compromising an organization.', 'compliance'),
    c('demo-2', 'demo', 'For AML compliance, TRM screens for the highest-priority risks, automatically detects indirect exposure risks across chains and assets, and lets teams configure alerts to streamline transaction monitoring and reduce false positives.', 'compliance'),
    c('demo-3', 'demo', 'The crypto-business page says TRM protects against evolving sanctions risk with coverage on 184+ blockchains.', 'coverage'),
    c('demo-4', 'demo', 'TRM automatically traces through cross-chain bridges and detects indirect risk exposure when funds move across chains.', 'bridges'),
    c('demo-5', 'demo', 'Configurable risk scoring lets a firm tune 150+ risk indicators to its risk appetite for real-time scoring of wallets, transactions and entities. The page also lists 1.9 billion assets covered.', 'coverage'),
    c('demo-6', 'demo', 'TRM adds context and evidentiary support to blocking and freezing decisions with information like source details and confidence levels.', 'attribution'),
    // compliance overview
    c('comp-1', 'compliance', 'The Crypto Compliance page describes regulatory-ready blockchain intelligence across 184+ chains and 840+ cross-chain bridges.', 'coverage'),
    c('comp-2', 'compliance', 'Compliance360 is described as an end-to-end solution that works within existing systems and workflows, covering entity risk, address risk and asset risk.', 'compliance'),
    c('comp-3', 'compliance', 'TRM says AI agents can connect to its blockchain intelligence to resolve transaction monitoring alerts, investigate wallet screening results and surface behavioral patterns; Co-Case Agent is built to accelerate human judgment, not replace it.', 'ai'),
    // wallet screening
    c('wallet-1', 'wallet', 'Wallet Screening checks addresses in real time across blockchains to detect risks before a transaction is authorized, with over 155 configurations covering risk types such as ownership, counterparty and indirect, and categories like sanctions and scams.', 'screening'),
    c('wallet-2', 'wallet', 'The Wallet Screening page says it screens 1.9B+ digital assets over 184+ blockchains, including all ERC-20 tokens, popular stablecoins and DeFi tokens.', 'coverage'),
    c('wallet-3', 'wallet', 'TRM attributes entities using a dedicated threat team, data science and over 300 million sources monitored monthly, including sanctions lists and the dark web; the attribution source and confidence level are visible in the platform.', 'attribution'),
    c('wallet-4', 'wallet', 'Submitting a wallet address returns trading volume, a full list of risks and attribution in under 400 milliseconds, according to the Wallet Screening page.', 'screening'),
    // transaction monitoring
    c('tm-1', 'tm', 'Transaction Monitoring continuously monitors deposits and withdrawals with configurable, multi-condition rules using inputs such as transaction amounts, velocity, blockchain and counterparty risk indicators.', 'monitoring'),
    c('tm-2', 'tm', 'Alerts can be reviewed and closed with case management: assign an owner, record notes, see what triggered the alert and follow a workflow to closure. Transactions are rescreened daily, and a risk engine audit log records changes to categories or severity levels.', 'monitoring'),
    // sanctions
    c('sanc-1', 'sanctions', 'TRM screens transactions and wallets against new sanctions designations in a matter of hours, not days after publication.', 'sanctions'),
    c('sanc-2', 'sanctions', 'TRM says its threat intelligence extends sanctions coverage beyond official designations to a larger footprint of threat actors’ crypto activity, and shows direct, counterparty and indirect (downstream or upstream) exposure.', 'sanctions'),
    c('sanc-3', 'sanctions', 'The Sanctions page states that TRM attributed $93 billion in volume received by sanctioned entities and jurisdictions in 2025.', 'sanctions'),
    // know-your-asset, entity due diligence
    c('kya-1', 'kya', 'Know-Your-Asset helps stablecoin and token issuers detect illicit use of their token across the crypto ecosystem, monitor usage across blockchains, entities and major holders, and get real-time alerts to report, block or freeze tokens.', 'stablecoins'),
    c('edd-1', 'edd', 'Entity Due Diligence gives on- and off-chain intelligence on crypto entities (VASPs) for onboarding and enhanced due diligence, with alert rules that notify when an entity’s risk profile changes and benchmarking against trusted and high-risk exchanges.', 'due-diligence'),
    // forensics
    c('for-1', 'forensics', 'TRM Forensics is a blockchain investigations platform. The Forensics page says it searches across 65+ blockchains and over 1.9 billion digital assets.', 'forensics'),
    c('for-2', 'forensics', 'Forensics supports automatic cross-chain tracing to follow the flow of funds across blockchains, multi-route pathfinding through multiple hops, and Signatures® to detect patterns such as peeling chains and layering.', 'bridges'),
    c('for-3', 'forensics', 'TRM describes “glass box” attribution: it shows the attribution source and confidence score for every attribution, supporting parallel reconstruction of investigations for use as evidence in court.', 'attribution'),
    c('for-4', 'forensics', 'Co-Case Agent is described as an AI assistant for crypto investigations that keeps every action human-led and court-defensible.', 'ai'),
    // ardence
    c('ard-1', 'ardence', 'Ardence is TRM’s AI investigation platform built for all-source intelligence. It brings corporate, cyber, identity, dark web, financial, sanctions and other intelligence into one reviewable investigation.', 'ardence'),
    c('ard-2', 'ardence', 'With Ardence the investigator defines the question, scope and starting point, such as a person, organization, domain, IP address, email, account or wallet, and Ardence searches the intelligence sources available to the team.', 'ardence'),
    c('ard-3', 'ardence', 'Ardence keeps every finding connected to its sources, so the path from evidence to conclusion is traceable and auditable, and investigators own the conclusion.', 'ardence'),
    c('ard-4', 'ardence', 'Ardence’s Data Network brings intelligence from TRM and specialized providers into one investigation under a single Ardence contract; provider availability varies by customer and jurisdiction.', 'ardence'),
    c('ard-5', 'ardence', 'Ardence can use reviewed evidence to draft legal process, submit asset freezes or request infrastructure takedowns.', 'ardence'),
    // case studies
    c('rox-1', 'roxom', 'In TRM’s Roxom case study, Roxom built a seven-agent anti-money laundering investigation swarm in a week, and many daily workflows now run more agents than people, with a person deciding every outcome.', 'case-study'),
    c('hifi-1', 'hifi', 'In TRM’s HIFI case study, HIFI took two weeks on average to implement support for new blockchains, and its compliance lead called TRM’s wallet attribution one of the key inputs underpinning its transaction monitoring operation.', 'case-study'),
    // research
    c('fent-1', 'fentanyl', 'TRM’s Beyond Fentanyl report (June 2024) found that 97% of the over 120 Chinese precursor manufacturers studied offered payment in cryptocurrencies, and they received over USD 26 million in cryptocurrency in 2023.', 'research'),
    // victims and scams
    c('scam-1', 'scam', 'TRM Labs is not involved in fund recovery processes for victims. TRM warns that scammers use false domains to impersonate TRM Labs and government agencies, and that the only official TRM Labs domain is trmlabs.com.', 'scam'),
  ];
  const api = { KB, SOURCES: U };
  root.TRM_KB = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
