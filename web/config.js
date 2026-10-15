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
  X_URL: "https://x.com/uptobears",                      // the project's X account (https://x.com/<handle>); the X button stays hidden while empty
  STATE_URL: "./state.json",      // written by the indexer every 60 s
  SAMPLE_URL: "./state.sample.json",
  POLL_MS: 30000,

  // The one team wallet on the launch snipe-tax exemption list (owner decision 2026-10-14). Set only after DEPLOY.md
  // step 6 confirms exactly three SnipeTaxExempted events (Launcher, Treasury, this wallet). "" = line not printed.
  TEAM_WALLET: "",
};
