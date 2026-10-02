// Shared helpers: formatting (BigInt wei), state.json loading with sample fallback,
// countdowns, the footer, and the MAY-CLAIM sentences (the only claims the site makes).

const CLAIMS = {
  lock: "Hibernating locks $UPTOBEAR until 2026-11-01 00:00 UTC. No early exit. No admin exists on the Den.",
  weight: "Your weight = amount × time remaining at deposit. It is your vote power AND your share of the basket.",
  votes: "Votes are on-chain, sticky, changeable any time; any address can be voted for, including $UPTOBEAR, ETH (as WETH), USDG, stocks.",
  fees: "Every trade pays 3%: 1% Pons fee (0.7% reaches the creator stream) + 2% creator tax. The creator stream splits 50% owner wallet / 50% treasury, in the contract.",
  feeding: "Each day's treasury ETH is released to the operator, who buys the top 3 (50/30/20) on any venue and returns the tokens. Nothing on-chain checks that the operator buys what was voted: the daily release and return transactions are public and the site reconciles them.",
  operator: "The operator can move any basket token out of the treasury at any time (emergency power) and receives every day's fee ETH except the owner's half; nothing on-chain binds the operator to the vote. Fee ETH is not touched by the sweep; it reaches the operator only through release(), which the operator can call at any time.",
  fixed: "Operator and owner wallets are fixed at deploy and cannot be changed.",
  boundary: "The day boundary and the top 3 are reconstructed from public events; the contracts do not compute them.",
  withdraw: "Withdrawing at waking returns exactly what you deposited; the Den holds only $UPTOBEAR and can only ever send it back to you.",
  exemptions: "No launch-minute exemptions.",
  claims: "On waking, hibernators claim each basket token pro-rata by weight; late returns distribute too; a broken token cannot block the others; after a sweep, claims pay what remains and never more.",
  thirdParty: "Pons can redirect the creator stream with a 3-day timelock (factory owner power). Stock tokens are subject to the issuer's blocklist/pause/adminBurn powers.",
  roll: "If a target cannot be bought or returned (honeypot, venue down), its slice rolls into the next feeding and the post says so. The feeding amount is the release transaction's amount, not a promise of one day's exact fees.",
  thin: "The operator skips a token that is too thin to buy safely; its slice rolls into the next feeding.",
  weth: "ETH in the basket is held as WETH, a proxy contract upgradeable by its admin (same class of third-party power as the stock tokens).",
  after: "After November 1 the token keeps trading and fees keep accruing 50/50; what the treasury half does next is decided later and announced.",
  gas: "Anyone can trigger the fee claim; a vote or deposit costs well under a cent in gas today (0.02 gwei).",
};

const ZERO = "0x0000000000000000000000000000000000000000";

// ---- formatting ---------------------------------------------------------
function toBig(v) {
  if (typeof v === "bigint") return v;
  if (v === null || v === undefined || v === "") return 0n;
  return BigInt(String(v));
}
function groupInt(s) {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
// BigInt → decimal string with at most `frac` fractional digits (trailing zeros trimmed unless fixed).
function formatUnits(v, decimals, frac, fixed) {
  v = toBig(v);
  decimals = Number(decimals);
  const neg = v < 0n;
  if (neg) v = -v;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  let rem = (v % base).toString().padStart(decimals, "0");
  rem = rem.slice(0, frac);
  if (!fixed) rem = rem.replace(/0+$/, "");
  return (neg ? "-" : "") + groupInt(whole.toString()) + (rem ? "." + rem : "");
}
function fmtEth(wei) {
  return formatUnits(wei, 18, 4, true) + " ETH";
}
function fmtToken(amount, decimals) {
  return formatUnits(amount, decimals ?? 18, 4, false);
}
function fmtPct(n, d) {
  const x = Number(n);
  if (!isFinite(x)) return "0%";
  return x.toFixed(d ?? 1) + "%";
}
function short(addr) {
  if (!addr || addr.length < 12) return addr || "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}
// weight share in percent, from BigInt strings, with 2 decimals.
function sharePct(part, total) {
  part = toBig(part);
  total = toBig(total);
  if (total === 0n) return 0;
  return Number((part * 10000n) / total) / 100;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function el(id) {
  return document.getElementById(id);
}
function setText(id, text) {
  const e = el(id);
  if (e) e.textContent = text;
}
// True once the launch addresses are in config.js (the zero address means "not launched yet").
function contractsLive() {
  return CONFIG.TOKEN !== ZERO && CONFIG.DEN !== ZERO;
}
const NOT_LIVE = "Not launched yet. Addresses land here at launch.";
function showError(id, e) {
  const box = el(id);
  if (!box) return;
  const msg = e && (e.shortMessage || e.reason || e.message || String(e));
  box.textContent = msg ? String(msg).slice(0, 300) : "";
  box.hidden = !msg;
}
function txLink(hash) {
  if (!hash) return "";
  if (CONFIG.EXPLORER_TX_URL) {
    return `<a class="mono" href="${esc(CONFIG.EXPLORER_TX_URL + hash)}" target="_blank" rel="noopener">${esc(short(hash))}</a>`;
  }
  return `<span class="mono">${esc(hash)}</span>`;
}
function addrLink(addr, label) {
  const text = esc(label || addr);
  if (CONFIG.EXPLORER_URL && addr && addr !== ZERO) {
    return `<a class="mono" href="${esc(CONFIG.EXPLORER_URL + "/address/" + addr)}" target="_blank" rel="noopener">${text}</a>`;
  }
  return `<span class="mono">${text}</span>`;
}

// ---- time --------------------------------------------------------------
function nowSec() {
  return Math.floor(Date.now() / 1000);
}
function nextMidnightUtc() {
  return (Math.floor(nowSec() / 86400) + 1) * 86400;
}
function fmtCountdown(secs) {
  if (secs < 0) secs = 0;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const hh = String(h).padStart(2, "0"), mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}
// Ticks every second; `target` is a function returning the unix target so it can roll over.
// Elements with class "clock" render digit tiles (each digit bumps when it changes); others get plain text.
function renderClock(e, text) {
  const parts = [];
  const m = text.match(/^(?:(\d+)d )?(\d\d):(\d\d):(\d\d)$/);
  if (!m) { e.textContent = text; return; }
  if (m[1]) { for (const ch of m[1]) parts.push({ d: ch }); parts.push({ unit: "d" }); }
  [m[2], m[3], m[4]].forEach((g, i) => {
    if (i) parts.push({ sep: ":" });
    for (const ch of g) parts.push({ d: ch });
  });
  const kids = e.children;
  const same = kids.length === parts.length && [...kids].every((k, i) => (parts[i].d !== undefined) === k.classList.contains("dig"));
  if (!same) {
    e.innerHTML = parts.map((p) => p.d !== undefined ? `<span class="dig">${p.d}</span>` : p.sep ? `<span class="sep">${p.sep}</span>` : `<span class="unit">${p.unit}</span>`).join("");
    return;
  }
  parts.forEach((p, i) => {
    if (p.d === undefined) return;
    const k = kids[i];
    if (k.textContent !== p.d) {
      k.textContent = p.d;
      k.classList.remove("bump");
      void k.offsetWidth;
      k.classList.add("bump");
    }
  });
}
function startCountdown(id, target, onZero) {
  const tick = () => {
    const left = target() - nowSec();
    const e = el(id);
    if (e && e.classList.contains("clock")) renderClock(e, fmtCountdown(left));
    else setText(id, fmtCountdown(left));
    if (left <= 0 && onZero) onZero();
  };
  tick();
  return setInterval(tick, 1000);
}
function isUnlocked() {
  return nowSec() >= CONFIG.UNLOCK_AT;
}

// ---- state.json ----------------------------------------------------------
async function fetchJson(url) {
  const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
// Loads state.json; on failure loads the sample and shows the badge. Calls render(state, isSample).
async function loadState(render) {
  let state = null, sample = false;
  try {
    state = await fetchJson(CONFIG.STATE_URL); // fetchJson adds the cache-buster
  } catch (e) {
    try {
      state = await fetchJson(CONFIG.SAMPLE_URL);
      sample = true;
    } catch (e2) {
      showError("err", e2);
      return null;
    }
  }
  const badge = el("sample-badge");
  if (badge) badge.hidden = !sample;
  renderMeta(state, sample);
  try {
    render(state, sample);
  } catch (e) {
    showError("err", e);
  }
  return state;
}
function pollState(render) {
  loadState(render);
  setInterval(() => loadState(render), CONFIG.POLL_MS);
}

// Stale-data warning at the top of <main> (updatedAt older than 10 minutes) and the indexed-at line in the footer.
const STALE_AFTER = 600;
function renderMeta(state, sample) {
  let warn = el("stale");
  if (!warn) {
    warn = document.createElement("p");
    warn.id = "stale";
    warn.className = "warn";
    warn.hidden = true;
    const host = el("stale-slot") || document.querySelector("main");
    if (host) host.insertBefore(warn, host.firstChild);
  }
  const age = nowSec() - Number(state.updatedAt || 0);
  if (!sample && age > STALE_AFTER) {
    warn.textContent = `Data is ${Math.floor(age / 60)} minutes old. The indexer has not written since.`;
    warn.hidden = false;
  } else {
    warn.hidden = true;
  }
  const t = new Date(Number(state.blockTime) * 1000);
  setText("indexed", `indexed at block ${groupInt(String(state.block ?? ""))}${isNaN(t) ? "" : " · " + t.toISOString().replace("T", " ").slice(0, 19) + " UTC"}`);
}

// ---- footer ----------------------------------------------------------------
// The footer facts: plain, positive renderings of the MAY-CLAIM sentences. Each fact names the CLAIMS keys it
// derives from; every CLAIMS key must be covered (the gated "exemptions" is spliced in), or the footer fails loudly.
const FACTS = [
  [["lock"], "Your $UPTOBEAR is locked until Nov 1 2026, 00:00 UTC. No admin exists, so nobody can touch it. Not even us."],
  [["weight"], "Weight = amount × days left. It is your vote power and your share of the basket. Early bears weigh more."],
  [["votes"], "Vote for any token: $UPTOBEAR, ETH, USDG, stocks. Votes live on-chain and you can change yours any time."],
  [["fees"], "Every trade pays 3% (1% Pons, 2% creator tax). The creator stream splits in the contract: half to the treasury, half to operational costs."],
  [["feeding", "boundary"], "Every day the treasury's ETH buys the top 3 voted tokens (50/30/20) and the tokens come back to the basket. The top 3 is read from the public on-chain votes."],
  [["withdraw"], "At waking you get back exactly what you staked. The Den holds only $UPTOBEAR and can only ever send it back to you."],
  [["exemptions"], "No launch-minute exemptions."],
  [["claims"], "At waking, every staker claims every basket token pro-rata by weight. Late returns get shared too, one broken token never blocks the rest, and after a sweep claims pay what remains and never more."],
  [["roll", "thin"], "If a token can't be bought or returned safely that day, its slice rolls into the next feeding and the post says so. A feeding is the release transaction's amount."],
  [["gas"], "Anyone can trigger the fee claim. A vote or stake costs well under a cent in gas today."],
];
function renderFooter() {
  const f = document.querySelector("footer.fine") || document.querySelector("footer.site");
  if (!f) return;
  const rows = [["$UPTOBEAR", CONFIG.TOKEN], ["the Den (staking contract)", CONFIG.DEN], ["the treasury", CONFIG.TREASURY]]
    .map(([n, a]) => `<div class="addr"><span class="k">${n}</span> ${addrLink(a)}</div>`)
    .join("");
  const facts = FACTS.filter(([keys]) => !keys.includes("exemptions") || CONFIG.NO_EXEMPTIONS_VERIFIED);
  const covered = new Set(facts.flatMap(([keys]) => keys));
  // Owner decision 2026-09-30: these CLAIMS are not printed in the footer. The sweep power still appears on the
  // Buys page ("Operator sweeps"). Listed here so the omission is explicit and the coverage guard stays strict.
  const OMITTED = ["operator", "fixed", "thirdParty", "weth", "after"];
  const missing = Object.keys(CLAIMS).filter((k) => k !== "exemptions" && !OMITTED.includes(k) && !covered.has(k));
  if (missing.length) throw new Error("footer facts are missing CLAIMS keys: " + missing.join(", "));
  const how = facts.map(([, text]) => `<li>${esc(text)}</li>`).join("");
  f.innerHTML = `<div class="wrap">
    <div class="addrs">${rows}</div>
    <div class="cols">
      <div class="stamp"><img class="anim-bob" src="./assets/gen/09-avatar.png" alt="" data-moo onerror="this.src='./assets/bear/bear_96_orange.png';this.onerror=null"><p class="note" id="indexed"></p></div>
      <div>
        <details class="fine-print">
          <summary><h2>The bear facts</h2><span class="sub">What the contracts do for you, straight from the code.</span></summary>
          <ol class="how">${how}</ol>
        </details>
        <p class="tag">In October, every bear is a bull.</p>
      </div>
    </div>
  </div>`;
}
function renderSayings() {
  document.querySelectorAll("[data-say]").forEach((n) => {
    const keys = n.dataset.say.split(/\s+/).filter(Boolean);
    n.textContent = keys.map((k) => CLAIMS[k] || "").join(" ");
  });
}
// "Buy $UPTOBEAR" buttons: one config value, shown only when it is set (external trade page, new tab)
function wireBuyLinks() {
  document.querySelectorAll("[data-buy]").forEach((a) => {
    const holder = a.closest(".buy-note, #vs-buy-line");
    if (!CONFIG.BUY_URL) { a.hidden = true; if (holder) holder.hidden = true; return; }
    a.href = CONFIG.BUY_URL; a.target = "_blank"; a.rel = "noopener"; a.hidden = false; if (holder && holder.classList.contains("buy-note")) holder.hidden = false;
  });
}
document.addEventListener("DOMContentLoaded", () => { renderSayings(); renderFooter(); wireBuyLinks(); });
