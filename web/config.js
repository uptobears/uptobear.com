// Site configuration. Fill the three addresses after deploy (see README.md). Everything else is fixed.
const CONFIG = {
  CHAIN_ID: 4663,
  CHAIN_HEX: "0x1237",
  CHAIN_NAME: "Robinhood Chain",
  RPC_URL: "https://rpc.mainnet.chain.robinhood.com",
  EXPLORER_URL: "",      // explorer base (…/address/<addr>); "" = plain addresses, no links
  EXPLORER_TX_URL: "",   // tx URL prefix (…/tx/); "" = plain hashes, no links

  TOKEN: "0x0000000000000000000000000000000000000000",     // $UPTOBEAR
  DEN: "0x0000000000000000000000000000000000000000",       // Den
  TREASURY: "0x0000000000000000000000000000000000000000",  // Treasury

  UNLOCK_AT: 1793491200,          // 2026-11-01T00:00:00Z (waking)
  BUY_URL: "",                    // where to buy $UPTOBEAR (the Pons trade page for the token); filled at launch, buttons stay hidden while empty
  STATE_URL: "./state.json",      // written by the indexer every 60 s
  SAMPLE_URL: "./state.sample.json",
  POLL_MS: 30000,

  // Set true only after DEPLOY.md step 6 confirms exactly two SnipeTaxExempted events (Launcher, Treasury).
  NO_EXEMPTIONS_VERIFIED: false,
};
