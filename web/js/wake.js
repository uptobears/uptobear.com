// Waking: countdown before unlock; after unlock, per-token claimable + claim, and Den withdraw.

let state = null;
let tokenDec = 18;

function renderPhase() {
  const open = isUnlocked();
  el("before").hidden = open;
  el("after").hidden = !open;
}

function renderPreview() {
  const box = el("basket-preview");
  if (!box || !state) return;
  const basket = (state.treasury && state.treasury.basket) || [];
  setHtml(box, basket.length
    ? basket.map((b, i) =>
        `<div class="brow">${tokLogo(b, 0, "sm")}<div class="who"><div class="sym">${esc(b.symbol || short(b.token))}</div></div><div class="amt">${esc(fmtToken(toBig(b.held) + toBig(b.distributed || 0), b.decimals))}</div></div>`
      ).join("")
    : `<div class="empty">The basket is empty. The first buy fills it.</div>`);
}

async function renderClaims() {
  const box = el("claims");
  if (!wallet.address) { box.innerHTML = `<p class="empty">Connect a wallet.</p>`; return; }
  if (!state) { box.innerHTML = `<p class="empty">Loading the basket…</p>`; return; }
  const basket = (state.treasury && state.treasury.basket) || [];
  if (!basket.length) { box.innerHTML = `<p class="empty">The basket is empty.</p>`; return; }
  showError("err", null);
  try {
    const treasury = readContract(CONFIG.TREASURY, TREASURY_ABI);
    const den = readContract(CONFIG.DEN, DEN_ABI);
    const [locked, dec, ...claimables] = await Promise.all([
      den.balanceOf(wallet.address),
      tokenDecimals(CONFIG.TOKEN),
      ...basket.map((b) => treasury.claimable(b.token, wallet.address)),
    ]);
    tokenDec = dec;
    setText("you-locked", fmtToken(locked, tokenDec));
    el("withdraw").disabled = !wallet.signer || locked === 0n;
    setHtml(box, basket.map((b, i) => `<div class="card basket">
      ${tokLogo(b, 0, "md")}
      <div><div class="k">${esc(b.symbol || short(b.token))}</div><div class="amt">${esc(fmtToken(claimables[i], b.decimals))}</div><div class="note">claimable now</div></div>
      <div class="actions"><button type="button" data-claim="${esc(b.token)}" ${claimables[i] === 0n || !wallet.signer ? "disabled" : ""}>Collect</button></div>
      <div class="status" id="st-${i}"></div>
      <p class="error" id="er-${i}" hidden></p>
    </div>`).join(""));
    box.querySelectorAll("button[data-claim]").forEach((btn, i) => {
      btn.addEventListener("click", async () => {
        try {
          const t = writeContract(CONFIG.TREASURY, TREASURY_ABI);
          await sendTx(`st-${i}`, `er-${i}`, () => t.claimBasket(btn.dataset.claim));
          await renderClaims();
        } catch (e) {
          showError(`er-${i}`, e);
        }
      });
    });
  } catch (e) {
    showError("err", e);
  }
}

async function doWithdraw() {
  try {
    const den = writeContract(CONFIG.DEN, DEN_ABI);
    await sendTx("withdraw-status", "withdraw-err", () => den.withdraw());
    await renderClaims();
  } catch (e) {
    showError("withdraw-err", e);
  }
}

wireWalletButtons();
wallet.onChange = renderClaims;
el("withdraw").addEventListener("click", doWithdraw);
renderPhase();
startCountdown("wake-in", () => CONFIG.UNLOCK_AT, renderPhase);
pollState((s) => { state = s; renderPreview(); if (isUnlocked()) renderClaims(); });
