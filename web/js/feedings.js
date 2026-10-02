// Buys: the hero stats strip, then one card per day, newest first. Three horned logos per day,
// one "Bought with" line, the tokens bought as plain rows; every hash and address waits behind "Receipts".

function renderSweeps(state) {
  const sweeps = (state.sweeps || []).slice().sort((a, b) => Number(b.block) - Number(a.block));
  el("sweeps").innerHTML = sweeps.map((s) =>
    `<div class="row wrap"><span>${esc(s.symbol || short(s.token))}<span class="note"> · block ${groupInt(String(s.block ?? ""))}</span></span><span class="v">${esc(fmtToken(s.amount, s.decimals))}</span><span class="tx">${txLink(s.tx)}</span></div>`
  ).join("") || `<div class="empty">None so far.</div>`;
}

// token address (lower-case) → logo path, from every place state.json carries one
function logoMap(state) {
  const m = new Map();
  const add = (t) => { if (t && t.token && t.logo && !m.has(t.token.toLowerCase())) m.set(t.token.toLowerCase(), t.logo); };
  ((state.live || {}).top || []).forEach(add);
  ((state.treasury || {}).basket || []).forEach(add);
  (state.days || []).forEach((d) => (d.top3 || []).forEach(add));
  return m;
}

// one stat tile: the number as text, the unit (if any) as a small suffix
function setStat(id, value, unit) {
  const e = el(id);
  if (!e) return;
  e.textContent = value;
  if (unit) { const u = document.createElement("span"); u.className = "unit"; u.textContent = unit; e.appendChild(u); }
}
// hero: ETH spent over closed days
function renderStats(state) {
  const days = state.days || [];
  const closed = days.filter((d) => d.closed);
  const spent = closed.reduce((a, d) => a + toBig(d.releasedWei), 0n);
  setStat("st-eth", formatUnits(spent, 18, 2, true), "ETH");
}

function renderFeedings(state) {
  renderStats(state);
  renderSweeps(state);
  const logos = logoMap(state);
  const days = (state.days || []).slice().sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const box = el("days");
  if (!days.length) {
    box.innerHTML = `<p class="empty">No buys yet. The first day closes at 00:00 UTC.</p>`;
    return;
  }
  // days[] stops at 2026-10-31; nothing after waking is a feeding day.
  setHtml(box, days.map((d) => {
    const plates = (d.top3 || []).map((t, i) =>
      `<div class="plate">
        ${tokLogo(t, i + 1, "md")}
        <div class="sym">${esc(t.symbol || short(t.token))}</div>
        <div class="slice">${Number(t.slicePct ?? [50, 30, 20][i]) || 0}%</div>
      </div>`
    ).join("") || `<div class="empty">No votes that day.</div>`;

    const releases = d.releases || (d.release ? [d.release] : []);
    const releasedWei = d.releasedWei ?? releases.reduce((a, r) => a + toBig(r.amountWei), 0n);
    const spent = releases.length
      ? `Bought with ${esc(fmtEth(releasedWei))}`
      : d.closed ? "Not bought yet." : "Day still open.";

    // only the operator's returns are basket buys; anything else is skipped (guard, the indexer no longer records them)
    const bought = (d.returns || []).filter((r) => r.fromOperator === true);
    const rows = bought.map((r) =>
      `<div class="buy">${tokLogo({ symbol: r.symbol, token: r.token, logo: logos.get(String(r.token || "").toLowerCase()) || "" }, 0, "sm")}<span class="sym">${esc(r.symbol || short(r.token))}</span><span class="v">${esc(fmtToken(r.amount, r.decimals))}</span></div>`
    ).join("") || `<div class="buy none">none yet</div>`;

    const receipts = releases.map((r) =>
      `<div class="row wrap"><span>release</span><span class="v">${esc(fmtEth(r.amountWei))}</span><span class="tx">${txLink(r.tx)}</span></div>`
    ).join("") + bought.map((r) =>
      `<div class="row wrap"><span>${esc(r.symbol || short(r.token))}</span><span class="v">${esc(fmtToken(r.amount, r.decimals))}</span><span class="tx">${addrLink(r.token)}</span><span class="tx">${txLink(r.tx)}</span></div>`
    ).join("");

    return `<div class="card reveal day">
      <div class="head"><h3>${esc(d.day)}</h3><span class="pill">${d.closed ? "closed" : "still open"}</span></div>
      <div class="course">Top 3</div>
      <div class="plates">${plates}</div>
      <div class="spent">${spent}</div>
      <div class="course">Tokens bought</div>
      <div class="buys">${rows}</div>
      ${receipts ? `<details class="receipts"><summary>Receipts</summary>${receipts}</details>` : ""}
    </div>`;
  }).join(""));
  box.querySelectorAll(".reveal").forEach((c) => c.classList.add("in"));
}

pollState(renderFeedings);
