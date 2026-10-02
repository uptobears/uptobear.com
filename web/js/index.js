// Home: hibernating share, today's bulls (logos wearing the horns), the three honey jars, the top-10 board.

const SLICES = [50n, 30n, 20n];
const RACE_ENTRIES = {}; // lowercase token address → state entry, for the vote sheet

function bullHtml(t, i, releasable) {
  const amt = (releasable * SLICES[i]) / 100n;
  return `<div class="bull">
    ${tokLogo(t, i + 1, "lg")}
    <div class="sym">${esc(t.symbol || short(t.token))}</div>
    <div class="slice">${SLICES[i]}%</div>
    <div class="amt">${esc(fmtEth(amt))}</div>
    <div class="amt">${esc(fmtPct(t.pct, 1))} of weight</div>
  </div>`;
}

function voteHref(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr) ? `./stake.html?vote=${addr}#vote-card` : "./stake.html#vote-card";
}

// one row of the race table. Rows 1-3 are funded: they show what the treasury buys; the rest show only their votes.
function raceRowHtml(t, i, releasable) {
  const rank = i + 1;
  const top = rank <= 3;
  const addr = String(t.token || "");
  const name = t.symbol || short(addr);
  const pct = Number(t.pct) || 0;
  const f = Math.max(0, Math.min(1, pct / 100));
  const amt = top ? fmtEth((releasable * SLICES[i]) / 100n) : "";
  RACE_ENTRIES[addr.toLowerCase()] = t;
  return `<li class="trow ${top ? "top" : ""} r${rank}" data-token="${esc(addr)}">
    <span class="rank">${top ? MINI_HORNS_SVG : ""}${rank}</span>
    ${tokLogo(t, rank, top ? "md" : "sm")}
    <span class="who"><span class="sym" title="${esc(name)}">${esc(name)}</span>${top ? `<span class="hold">staked until Nov 1</span>` : ""}</span>
    <div class="bar" role="img" aria-label="${esc(fmtPct(pct, 1))} of votes"><div class="fill" style="width:${(f * 100).toFixed(1)}%"></div><span class="pct">${esc(fmtPct(pct, 1))}</span></div>
    <span class="buys">${top ? `<span class="k">the treasury buys</span><span class="amt">${esc(amt)}</span>` : `<span class="amt muted">—</span>`}</span>
    <a class="vote ${rank === 1 ? "primary" : ""}" href="${voteHref(addr)}" data-vote="${esc(addr)}">Vote</a>
  </li>`;
}
function openRowHtml(i) {
  const rank = i + 1;
  return `<li class="trow top open r${rank}">
    <span class="rank">${MINI_HORNS_SVG}${rank}</span>
    <span class="tok md plain"><span class="disc empty"></span></span>
    <span class="who"><span class="sym">Open spot</span><span class="hold">${SLICES[i]}% of the pot is waiting</span></span>
    <div class="bar"><div class="fill" style="width:0%"></div><span class="pct">0%</span></div>
    <span class="buys"><span class="k">the treasury buys</span><span class="amt">whatever wins</span></span>
    <a class="vote" href="./stake.html#vote-card" data-vote="">Vote a token in</a>
  </li>`;
}

function renderIndex(state) {
  const top = (state.live && state.live.top) || [];
  const releasable = toBig(state.treasury.balanceWei) - toBig(state.treasury.ownerOwed);

  setText("hib-pct", fmtPct(state.hibernatingPct, 2));
  setText("hib-count", groupInt(String(state.hibernators ?? 0)));
  setText("releasable", fmtEth(releasable));

  const three = top.slice(0, 3);
  setHtml("bulls", three.map((t, i) => bullHtml(t, i, releasable)).join("") || `<div class="empty">No votes yet.</div>`);

  // the three jars: big / medium / small, honey to 50 / 30 / 20
  const jars = el("jars");
  const jarKey = three.map((t) => t.token + "|" + (t.logo || "")).join(",");
  if (jars.dataset.key !== jarKey) {
    jars.dataset.key = jarKey;
    setHtml(jars, [0, 1, 2].map((i) => {
      const t = three[i] || null;
      const amt = (releasable * SLICES[i]) / 100n;
      return `<div class="jar">
        ${jarSvg(i, t, Number(SLICES[i]) / 100)}
        <div class="pct">${SLICES[i]}%</div>
        <div class="sym">${t ? esc(t.symbol || short(t.token)) : "—"}</div>
        <div class="amt">${esc(fmtEth(amt))}</div>
      </div>`;
    }).join(""));
    armGrow(jars);
  } else {
    jars.querySelectorAll(".jar .amt").forEach((a, i) => { a.textContent = fmtEth((releasable * SLICES[i]) / 100n); });
  }

  // the race: ONE table. Rows 1-3 funded (honey, bigger, the ETH each gets), the cut, rows 4-10.
  setText("race-pot", fmtEth(releasable));
  const rows = top.slice(0, 10);
  const raceKey = rows.map((t) => t.token + "|" + (t.logo || "") + "|" + t.pct).join(",") + "|" + releasable.toString();
  const table = el("race-table");
  if (table && table.dataset.key !== raceKey) {
    table.dataset.key = raceKey;
    const funded = [0, 1, 2].map((i) => (rows[i] ? raceRowHtml(rows[i], i, releasable) : openRowHtml(i))).join("");
    const rest = rows.slice(3).map((t, i) => raceRowHtml(t, i + 3, releasable)).join("") || `<li class="empty">No challengers yet. Vote a token in.</li>`;
    setHtml(table, funded + `<li class="cut" role="separator"><span>the cut · top 3 get bought</span></li>` + rest);
    table.classList.add("in");
  }

  const lr = state.latestRelease;
  const lf = el("last-feeding");
  lf.innerHTML = lr ? `last feeding: ${esc(fmtEth(lr.amountWei))} · ${txLink(lr.tx)}` : "no feeding yet";
}

startCountdown("closes-in", nextMidnightUtc);
startCountdown("race-closes", nextMidnightUtc);
startCountdown("wake-in", () => CONFIG.UNLOCK_AT);
pollState(renderIndex);


// ---------------- vote sheet: vote from the race without leaving the page ----------------
const vs = { addr: null, symbol: "", entry: null, dec: 18, balance: 0n, allowance: 0n, weight: 0n, current: ZERO };

function openVoteSheet(addr) {
  vs.addr = addr && ethers.isAddress(addr) ? ethers.getAddress(addr) : null;
  vs.entry = vs.addr ? RACE_ENTRIES[vs.addr.toLowerCase()] || null : null;
  vs.symbol = vs.entry ? (vs.entry.symbol || short(vs.addr)) : "";
  el("vs-any").hidden = !!vs.addr;
  el("vs-token").hidden = !vs.addr;
  el("vs-input").value = "";
  setText("vs-sym", "");
  showError("vs-err", null); showError("vs-stake-err", null); showError("wallet-err", null);
  setText("vs-status", ""); setText("vs-stake-status", "");
  if (vs.addr) {
    setText("vs-name", vs.symbol);
    setText("vs-addr", short(vs.addr));
    setHtml("vs-logo", tokLogo(vs.entry || { token: vs.addr, symbol: vs.symbol }, 0, "md"));
  }
  el("vote-sheet").hidden = false;
  document.body.classList.add("noscroll");
  refreshSheet();
}
function closeVoteSheet() {
  el("vote-sheet").hidden = true;
  document.body.classList.remove("noscroll");
}

async function refreshSheet() {
  const line = (t) => setText("vs-line", t);
  const vote = el("vs-vote"), stake = el("vs-stake");
  vote.hidden = true; stake.hidden = true;
  if (isUnlocked()) { line("Voting closed at waking."); return; }
  if (!vs.addr) { line("Enter a token address."); return; }
  if (!wallet.address) { line(`Connect a wallet to vote for ${vs.symbol}.`); return; }
  if (!wallet.signer) { line("Switch to Robinhood Chain to vote."); return; }
  if (!contractsLive()) { line(NOT_LIVE); return; }
  try {
    const token = readContract(CONFIG.TOKEN, ERC20_ABI);
    const den = readContract(CONFIG.DEN, DEN_ABI);
    const [bal, alw, weight, current, dec] = await Promise.all([
      token.balanceOf(wallet.address), token.allowance(wallet.address, CONFIG.DEN), den.weightOf(wallet.address), den.voteOf(wallet.address), tokenDecimals(CONFIG.TOKEN),
    ]);
    Object.assign(vs, { balance: bal, allowance: alw, weight, current, dec });
    markMyVote(current);
    if (weight > 0n) {
      if (current.toLowerCase() === vs.addr.toLowerCase()) { line(`${vs.symbol} is already your vote.`); return; }
      line(current === ZERO ? `Your whole weight goes to ${vs.symbol}.` : `Your vote moves to ${vs.symbol}.`);
      vote.textContent = `Vote for ${vs.symbol}`;
      vote.hidden = false;
    } else {
      line(`No stake yet. Stake $UPTOBEAR, then vote for ${vs.symbol}.`);
      el("vs-buy-line").hidden = !(bal === 0n && CONFIG.BUY_URL);
      if (!el("vs-amount").value) el("vs-amount").value = bal > 0n ? formatUnits(bal, dec, 4, false).replace(/,/g, "") : "";
      setText("vs-allowance", `in wallet: ${fmtToken(bal, dec)} · approved: ${fmtToken(alw, dec)}`);
      stake.hidden = false;
    }
  } catch (e) {
    showError("vs-err", e);
  }
}

function markMyVote(current) {
  document.querySelectorAll(".trow .mine-pill").forEach((p) => p.remove());
  document.querySelectorAll(".trow.mine").forEach((r) => r.classList.remove("mine"));
  if (!current || current === ZERO) return;
  const row = [...document.querySelectorAll(".trow[data-token]")].find((r) => r.dataset.token.toLowerCase() === current.toLowerCase());
  if (!row) return;
  row.classList.add("mine");
  const pill = document.createElement("span"); pill.className = "pill mine-pill"; pill.textContent = "your vote";
  row.querySelector(".who").appendChild(pill);
}

function vsAmount() {
  const raw = el("vs-amount").value.trim();
  if (!raw) throw new Error("Enter an amount.");
  const v = ethers.parseUnits(raw, vs.dec);
  if (v <= 0n) throw new Error("Amount must be above zero.");
  return v;
}
async function vsApprove() {
  try {
    const amount = vsAmount();
    const c = writeContract(CONFIG.TOKEN, ERC20_ABI);
    await sendTx("vs-stake-status", "vs-stake-err", () => c.approve(CONFIG.DEN, amount));
    await refreshSheet();
  } catch (e) { showError("vs-stake-err", e); }
}
async function vsDeposit() {
  try {
    if (!el("vs-ack").checked) throw new Error("Tick the box: no early exit until Nov 1 2026.");
    const amount = vsAmount();
    if (amount > vs.balance) throw new Error("More than your wallet balance.");
    if (amount > vs.allowance) throw new Error("Approve first (allowance is below the amount).");
    const den = writeContract(CONFIG.DEN, DEN_ABI);
    const rc = await sendTx("vs-stake-status", "vs-stake-err", () => den.deposit(amount));
    if (rc && rc.status === 1) await refreshSheet();
  } catch (e) { showError("vs-stake-err", e); }
}
async function vsVote() {
  try {
    const den = writeContract(CONFIG.DEN, DEN_ABI);
    const rc = await sendTx("vs-status", "vs-err", () => den.vote(vs.addr));
    if (rc && rc.status === 1) { setText("vs-line", `Voted for ${vs.symbol}. Change it any time.`); el("vs-vote").hidden = true; markMyVote(vs.addr); }
  } catch (e) { showError("vs-err", e); }
}
let vsSymTimer = null;
function onVsInput() {
  clearTimeout(vsSymTimer);
  const v = el("vs-input").value.trim();
  vs.addr = null; vs.entry = null; vs.symbol = "";
  if (!v) { setText("vs-sym", ""); refreshSheet(); return; }
  if (!ethers.isAddress(v)) { setText("vs-sym", "not an address"); refreshSheet(); return; }
  vs.addr = ethers.getAddress(v);
  vs.entry = RACE_ENTRIES[vs.addr.toLowerCase()] || null;
  setText("vs-sym", "looking up symbol…");
  vsSymTimer = setTimeout(async () => {
    const s = await tokenSymbol(vs.addr);
    vs.symbol = s;
    setText("vs-sym", s === short(vs.addr) ? `no symbol() at ${short(vs.addr)} — the vote goes to the raw address` : `symbol: ${s}`);
    refreshSheet();
  }, 300);
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-vote]");
  if (a) { e.preventDefault(); openVoteSheet(a.dataset.vote); return; }
  const any = e.target.closest('a[href="./stake.html#vote-card"]');
  if (any && any.closest(".race-board")) { e.preventDefault(); openVoteSheet(null); return; }
  if (e.target.id === "vote-sheet") closeVoteSheet();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el("vote-sheet").hidden) closeVoteSheet(); });
el("vs-close").addEventListener("click", closeVoteSheet);
el("vs-vote").addEventListener("click", vsVote);
el("vs-approve").addEventListener("click", vsApprove);
el("vs-deposit").addEventListener("click", vsDeposit);
el("vs-input").addEventListener("input", onVsInput);
wireWalletButtons();
wallet.onChange = refreshSheet;
