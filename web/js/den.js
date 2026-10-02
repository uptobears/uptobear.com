// The Den: per-wallet reads on-chain, basket share from state.json, approve/deposit/vote/withdraw.

let state = null;
let tokenDec = 18;
let you = { balance: 0n, locked: 0n, weight: 0n, totalWeight: 0n, vote: ZERO, allowance: 0n };

function gateByTime() {
  const unlocked = isUnlocked();
  ["approve", "deposit", "vote"].forEach((id) => { el(id).disabled = unlocked; });
  el("withdraw").disabled = !unlocked || !wallet.signer || you.locked === 0n;
  el("withdraw-card").hidden = !unlocked; // "wake your bear" appears only after waking
  setText("unlock-line", unlocked ? "The Den is open. Waking your bear returns your full locked balance." : `Waking at 2026-11-01 00:00 UTC, in ${fmtCountdown(CONFIG.UNLOCK_AT - nowSec())}.`);
}

async function refreshYou() {
  if (!wallet.address) return;
  showError("err", null);
  if (!contractsLive()) { showError("err", NOT_LIVE); renderBasketShare(); gateByTime(); return; }
  try {
    const token = readContract(CONFIG.TOKEN, ERC20_ABI);
    const den = readContract(CONFIG.DEN, DEN_ABI);
    const [bal, alw, locked, weight, tw, vote, dec] = await Promise.all([
      token.balanceOf(wallet.address),
      token.allowance(wallet.address, CONFIG.DEN),
      den.balanceOf(wallet.address),
      den.weightOf(wallet.address),
      den.totalWeight(),
      den.voteOf(wallet.address),
      tokenDecimals(CONFIG.TOKEN),
    ]);
    tokenDec = dec;
    you = { balance: bal, allowance: alw, locked, weight, totalWeight: tw, vote };
    setText("you-balance", fmtToken(bal, tokenDec));
    setText("you-locked", fmtToken(locked, tokenDec));
    setText("you-weight", formatUnits(weight, tokenDec, 0) + " token·s");
    setText("you-share", fmtPct(sharePct(weight, tw), 2));
    setText("allowance-line", `approved for the Den: ${fmtToken(alw, tokenDec)}`);
    setText("you-vote", vote === ZERO ? "none yet" : await tokenSymbol(vote));
    renderBasketShare();
  } catch (e) {
    showError("err", e);
    renderBasketShare();
  }
  gateByTime();
}

function renderBasketShare() {
  const box = el("you-basket");
  if (!wallet.address) { box.className = "empty"; box.textContent = "Connect a wallet."; return; }
  if (!contractsLive()) { box.className = "empty"; box.textContent = NOT_LIVE; return; }
  if (!state) { box.className = "empty"; box.textContent = "Loading the basket…"; return; }
  const basket = (state.treasury && state.treasury.basket) || [];
  const tw = you.totalWeight;
  if (!basket.length) { box.className = "empty"; box.textContent = "The basket is empty. The first feeding fills it."; return; }
  box.className = "";
  box.innerHTML = basket.map((b) => {
    const total = toBig(b.held) + toBig(b.distributed);
    const mine = tw > 0n ? (total * you.weight) / tw : 0n;
    return `<div class="row"><span>${esc(b.symbol || short(b.token))}</span><span class="v">${esc(fmtToken(mine, b.decimals))}</span></div>`;
  }).join("");
}

function parseAmount() {
  const raw = el("amount").value.trim();
  if (!raw) throw new Error("Enter an amount.");
  const v = ethers.parseUnits(raw, tokenDec);
  if (v <= 0n) throw new Error("Amount must be above zero.");
  return v;
}

async function doApprove() {
  try {
    const mode = document.querySelector('input[name="approve-mode"]:checked').value;
    const amount = mode === "max" ? ethers.MaxUint256 : parseAmount();
    const c = writeContract(CONFIG.TOKEN, ERC20_ABI);
    await sendTx("deposit-status", "deposit-err", () => c.approve(CONFIG.DEN, amount));
    await refreshYou();
  } catch (e) {
    showError("deposit-err", e);
  }
}

async function doDeposit() {
  try {
    if (!el("ack").checked) throw new Error("Tick the box: no early exit until Nov 1 2026.");
    const amount = parseAmount();
    if (amount > you.balance) throw new Error("More than your wallet balance.");
    if (amount > you.allowance) throw new Error("Approve first (allowance is below the amount).");
    const den = writeContract(CONFIG.DEN, DEN_ABI);
    const rc = await sendTx("deposit-status", "deposit-err", () => den.deposit(amount));
    if (rc && rc.status === 1) el("sleeping").hidden = false; // the bear is asleep
    await refreshYou();
  } catch (e) {
    showError("deposit-err", e);
  }
}

let symTimer = null;
function onTargetInput() {
  clearTimeout(symTimer);
  const v = el("target").value.trim();
  if (!v) { setText("target-symbol", ""); return; }
  if (!ethers.isAddress(v)) { setText("target-symbol", "not an address"); return; }
  setText("target-symbol", "looking up symbol…");
  symTimer = setTimeout(async () => {
    const s = await tokenSymbol(v);
    setText("target-symbol", s === short(v) ? `no symbol() at ${short(v)} — vote goes to the raw address` : `symbol: ${s}`);
  }, 300);
}

async function doVote() {
  try {
    const v = el("target").value.trim();
    if (!ethers.isAddress(v)) throw new Error("Enter a valid address.");
    if (you.weight === 0n) throw new Error("Hibernate first: votes need weight.");
    const den = writeContract(CONFIG.DEN, DEN_ABI);
    await sendTx("vote-status", "vote-err", () => den.vote(ethers.getAddress(v)));
    await refreshYou();
  } catch (e) {
    showError("vote-err", e);
  }
}

async function doWithdraw() {
  try {
    const den = writeContract(CONFIG.DEN, DEN_ABI);
    await sendTx("withdraw-status", "withdraw-err", () => den.withdraw());
    await refreshYou();
  } catch (e) {
    showError("withdraw-err", e);
  }
}

wireWalletButtons();
wallet.onChange = refreshYou;
el("approve").addEventListener("click", doApprove);
el("deposit").addEventListener("click", doDeposit);
el("vote").addEventListener("click", doVote);
el("withdraw").addEventListener("click", doWithdraw);
el("target").addEventListener("input", onTargetInput);
// stake.html?vote=<address> (the board's "Vote for this" pill) prefills the vote input.
(function prefillVote() {
  const q = new URLSearchParams(location.search).get("vote");
  if (!q || !ethers.isAddress(q)) return;
  el("target").value = ethers.getAddress(q);
  onTargetInput();
})();
gateByTime();
setInterval(gateByTime, 1000);
pollState((s) => {
  state = s;
  setText("side-pct", fmtPct(s.hibernatingPct, 2));
  setText("side-count", groupInt(String(s.hibernators ?? 0)));
  renderBasketShare();
});
