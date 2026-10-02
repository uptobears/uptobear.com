// Motion + drawn components. Loaded on every page after common.js.
// - Scenes: transparent videos (HEVC .mov for Safari, VP9 .webm for Chrome/Firefox) with the keyed PNG as poster;
//   if both sources fail the poster stays; if the poster fails a sticker stands in; a missing sticker leaves the space empty.
// - Token logos (tokLogo): a round logo (or flat initials) wearing the cartoon horns; rank 1 gets the BULL name tag.
//   The logo path comes from state.json ("logos/<token>.png", same origin, relative to STATE_URL) and is set on
//   img.src by property after the HTML is in the DOM (hydrateToks) — never concatenated into markup.
// - Jars (jarSvg): SVG honey jars, honey rises to --fill when the section scrolls in.
// - prefers-reduced-motion: no videos (posters only), no marquee, no float; fills and bars jump to their value.
// - transforms/opacity only; nothing here touches layout on scroll.

const GEN = "./assets/gen/";
const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const STICKERS = ["10a-thumbs.png", "10b-arms.png", "10c-sleep.png", "10d-phone.png", "10e-diamonds.png", "10f-blanket.png", "10g-sign.png", "10h-moo.png"];
const STICKER_ANIMS = ["anim-bob", "anim-wiggle", "anim-hop", "anim-tilt", "anim-sway", "anim-breathe", "anim-float", "anim-wiggle d2"];
// A scene that cannot load (no video, no poster) shows this sticker instead.
const SCENE_STICKER = { "03-hibernate": "10c-sleep.png", "04-vote": "10a-thumbs.png", "05-feeding": "10b-arms.png", "06-waking": "10g-sign.png" };

// ---- drawn parts (inline SVG, cartoon line style) ----------------------------------
const INK = "#2a1a10";
// Headband + two horns, drawn in a 100×100 box whose disc is the circle at (50,58) r36.
const HORNS_SVG = `<svg class="horns" viewBox="0 0 100 100" aria-hidden="true">
  <path d="M12 46 C-2 34 0 16 10 4 C15 18 26 30 34 45 Z" fill="#F3E2B8" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M88 46 C102 34 100 16 90 4 C85 18 74 30 66 45 Z" fill="#F3E2B8" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M14.7 41.5 A39 39 0 0 1 85.3 41.5 L74.5 46.6 A27 27 0 0 0 25.5 46.6 Z" fill="#D8322A" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M84 40 C90 42 94 48 93 54 C90 50 87 47 83 45 Z" fill="#D8322A" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
</svg>`;
const TAG_SVG = `<svg class="tag" viewBox="0 0 100 100" aria-hidden="true">
  <g transform="rotate(-5 50 87)">
    <rect x="28" y="78" width="44" height="18" rx="4" fill="#FFFBF3" stroke="${INK}" stroke-width="3"/>
    <text x="50" y="91.5" text-anchor="middle" font-size="12.5" fill="${INK}">BULL</text>
  </g>
</svg>`;
// Small horns badge for the board's rank numerals.
const MINI_HORNS_SVG = `<svg viewBox="0 0 100 60" aria-hidden="true">
  <path d="M14 56 C-2 44 0 22 12 6 C18 22 30 36 38 54 Z" fill="#F3E2B8" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M86 56 C102 44 100 22 88 6 C82 22 70 36 62 54 Z" fill="#F3E2B8" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M22 58 Q50 40 78 58 L74 60 L26 60 Z" fill="#D8322A" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
</svg>`;
const WAVE_PATH = "M0 30 C180 2 300 58 480 30 S780 2 960 30 S1260 58 1440 30";

function waveSvg() {
  return `<svg viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true">
    <path d="${WAVE_PATH} V60 H0 Z" class="fill"/>
    <path d="${WAVE_PATH}" fill="none" stroke="${INK}" stroke-width="6" vector-effect="non-scaling-stroke"/>
  </svg>`;
}
function mountWaves() {
  document.querySelectorAll(".wave").forEach((w) => {
    if (w.children.length) return;
    w.innerHTML = waveSvg();
    // the wave shape is the band BELOW: cream after a sand band (.to-cream), sand after a cream band (.to-orange, name kept)
    const css = getComputedStyle(document.documentElement);
    const cream = css.getPropertyValue("--cream").trim() || "#FFF4E3";
    const sand = css.getPropertyValue("--sand").trim() || "#F3E4C8";
    w.querySelector(".fill").setAttribute("fill", w.classList.contains("to-cream") ? cream : sand);
  });
}

// ---- token logos --------------------------------------------------------------------
// Only a plain relative path with an image extension is accepted; anything else renders as initials.
function resolveLogo(path) {
  const p = String(path || "");
  if (!/^[A-Za-z0-9_\-./]+\.(png|jpg|jpeg|webp|svg|gif)$/i.test(p) || p.startsWith("/") || p.includes("..") || p.includes("//")) return "";
  try {
    const base = new URL(CONFIG.STATE_URL, location.href);
    const u = new URL(p, base);
    return u.origin === location.origin ? u.href : "";
  } catch (e) {
    return "";
  }
}
function logoHue(token) {
  let h = 0;
  for (const ch of String(token || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}
function initialsOf(symbol, token) {
  const sym = String(symbol || "").replace(/^\$/, "").replace(/[^\x20-\x7E]/g, "");
  if (!sym || /^0x/i.test(sym)) return "0x" + String(token || "").slice(2, 4).toUpperCase();
  return sym.slice(0, sym.length > 4 ? 3 : 4).toUpperCase();
}
const TOK_LOGOS = []; // index → logo path; the markup carries only the integer index
// entry: {symbol, token, logo}. rank 1..3 wear the horns (1 also the BULL tag); other ranks are plain discs.
function tokLogo(entry, rank, cls) {
  entry = entry || {};
  const idx = TOK_LOGOS.push(entry.logo || "") - 1;
  const horned = rank >= 1 && rank <= 3;
  return `<span class="tok ${horned ? "" : "plain"} ${cls || ""}" data-tok="${idx}" title="${esc(entry.symbol || "")}">
    <span class="disc" style="--hue:${logoHue(entry.token)}"><span class="ini">${esc(initialsOf(entry.symbol, entry.token))}</span></span>
    ${horned ? HORNS_SVG : ""}${rank === 1 ? TAG_SVG : ""}
  </span>`;
}
// After innerHTML: put the real <img> into every tok that has a logo. src is set by property.
function hydrateToks(root) {
  (root || document).querySelectorAll(".tok[data-tok]").forEach((t) => {
    const src = resolveLogo(TOK_LOGOS[Number(t.dataset.tok)]);
    delete t.dataset.tok;
    if (!src) return;
    const disc = t.querySelector(".disc");
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.draggable = false;
    img.addEventListener("load", () => disc.classList.add("has-img"));
    img.addEventListener("error", () => { img.remove(); disc.classList.remove("has-img"); });
    img.src = src;
    disc.appendChild(img);
  });
  TOK_LOGOS.length = 0; // every index is consumed once the markup is in the DOM; do not let the list grow per poll
}
function setHtml(target, html) {
  const e = typeof target === "string" ? el(target) : target;
  if (!e) return;
  e.innerHTML = html;
  hydrateToks(e);
}

// ---- honey jars ----------------------------------------------------------------------
const JAR_BODY = "M30 30 H90 V38 C104 42 108 54 108 66 V130 C108 146 96 152 82 152 H38 C24 152 12 146 12 130 V66 C12 54 16 42 30 38 Z";
// i: 0..2 (big/medium/small), entry: the token or null, fill: 0..1
function jarSvg(i, entry, fill) {
  const id = "jar" + i;
  return `<div class="art">
    <svg viewBox="0 0 120 160" aria-hidden="true">
      <defs>
        <linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2C14E"/><stop offset="1" stop-color="#E9A93B"/></linearGradient>
        <clipPath id="${id}-c"><path d="${JAR_BODY}"/></clipPath>
      </defs>
      <ellipse cx="60" cy="154" rx="46" ry="5" fill="rgba(42,26,16,0.16)"/>
      <path d="${JAR_BODY}" fill="rgba(255,255,255,0.55)"/>
      <g clip-path="url(#${id}-c)">
        <g class="honey" style="--fill:${Math.max(0, Math.min(1, Number(fill) || 0))}">
          <rect x="0" y="30" width="120" height="140" fill="url(#${id}-g)"/>
          <path d="M0 30 Q15 24 30 30 T60 30 T90 30 T120 30 V40 H0 Z" fill="#F2C14E"/>
          <rect x="0" y="30" width="120" height="6" fill="rgba(255,255,255,0.4)"/>
        </g>
      </g>
      <path d="${JAR_BODY}" fill="none" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M22 62 C17 82 17 112 22 136" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="5" stroke-linecap="round"/>
      <rect x="26" y="18" width="68" height="14" rx="6" fill="#B5651D" stroke="${INK}" stroke-width="4"/>
      <rect x="32" y="6" width="56" height="16" rx="6" fill="#C8771F" stroke="${INK}" stroke-width="4"/>
      <g transform="rotate(-3 60 100)">
        <rect x="28" y="74" width="64" height="54" rx="8" fill="#FFFBF3" stroke="${INK}" stroke-width="4"/>
        <path d="M36 82 H84" stroke="#F3E2B8" stroke-width="3" stroke-linecap="round"/>
        <path d="M36 120 H84" stroke="#F3E2B8" stroke-width="3" stroke-linecap="round"/>
      </g>
    </svg>
    ${entry ? tokLogo(entry, i + 1) : ""}
  </div>`;
}

// ---- scenes --------------------------------------------------------------------------
// <div class="scene" data-scene="03-hibernate"><div class="art"></div></div>
function mountScene(slot) {
  if (slot.dataset.mounted) return;
  slot.dataset.mounted = "1";
  const name = slot.dataset.scene;
  const art = slot.querySelector(".art") || slot;
  const poster = GEN + name + ".png";
  const sticker = SCENE_STICKER[name];
  const showImage = (src, next) => {
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.draggable = false;
    img.setAttribute("data-moo", "");
    img.addEventListener("error", () => { img.remove(); if (next) next(); });
    img.src = src;
    art.replaceChildren(img);
  };
  const showPoster = () => showImage(poster, sticker ? () => showImage(GEN + sticker) : null);
  if (REDUCED) { showPoster(); return; }
  const v = document.createElement("video");
  v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
  v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("autoplay", ""); v.setAttribute("loop", "");
  v.preload = "auto";
  v.poster = poster;
  v.setAttribute("data-moo", "");
  const mov = document.createElement("source");
  mov.src = GEN + name + ".mov";
  mov.type = 'video/quicktime; codecs="hvc1"';
  const webm = document.createElement("source");
  webm.src = GEN + name + ".webm";
  webm.type = "video/webm";
  // the error of the LAST <source> means no candidate played: keep the poster as a still
  webm.addEventListener("error", () => { if (v.isConnected) showPoster(); });
  v.appendChild(mov);
  v.appendChild(webm);
  art.replaceChildren(v);
  v.play().catch(() => {});
}
function mountScenes() {
  const slots = document.querySelectorAll(".scene[data-scene]");
  if (!("IntersectionObserver" in window)) { slots.forEach(mountScene); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { mountScene(e.target); io.unobserve(e.target); } });
  }, { rootMargin: "400px 0px" });
  slots.forEach((s) => (s.dataset.eager ? mountScene(s) : io.observe(s)));
}

// ---- stickers rail -----------------------------------------------------------------------
function stickerHtml(i) {
  return `<div class="sticker ${STICKER_ANIMS[i]} d${(i % 4) + 1}" role="listitem" data-moo>
    <img src="${GEN}${STICKERS[i]}" alt="" loading="lazy" draggable="false" onerror="this.parentNode.remove()">
  </div>`;
}
function mountRail() {
  const track = document.querySelector(".rail-track");
  if (!track) return;
  const set = STICKERS.map((_, i) => stickerHtml(i)).join("");
  track.innerHTML = set + set; // two copies: the marquee scrolls exactly one set (-50%)
  track.querySelectorAll(".sticker").forEach((s, i) => { if (i >= STICKERS.length) s.setAttribute("aria-hidden", "true"); });
}

// ---- MOO easter egg --------------------------------------------------------------------------
function moo(x, y, target) {
  if (target) {
    target.classList.remove("wobble");
    void target.offsetWidth; // restart the animation
    target.classList.add("wobble");
    target.addEventListener("animationend", () => target.classList.remove("wobble"), { once: true });
  }
  const b = document.createElement("div");
  b.className = "moo";
  b.textContent = "MOO";
  b.style.left = x + "px";
  b.style.top = y + "px";
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 950);
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-moo]");
  if (!t) return;
  moo(e.clientX, e.clientY, t);
});

// ---- scroll: reveal (also arms the jar fill and the board bars) --------------------------------
function mountReveal() {
  const els = document.querySelectorAll(".reveal, .jars, .board");
  if (!("IntersectionObserver" in window) || REDUCED) { els.forEach((e) => e.classList.add("in")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.15 });
  els.forEach((e) => io.observe(e));
}
// Called after a render: the transition starts on the next frame (or when the element scrolls in).
function armGrow(target) {
  const e = typeof target === "string" ? el(target) : target;
  if (!e) return;
  e.classList.remove("go");
  requestAnimationFrame(() => requestAnimationFrame(() => e.classList.add("go")));
}
// The hero headline: each word pops in on load.
function mountHeadline() {
  const h = document.querySelector(".hero h1");
  if (!h || REDUCED) return;
  const words = h.textContent.trim().split(/\s+/);
  h.innerHTML = words.map((w, i) => `<span class="word" style="animation: hop 0.9s cubic-bezier(.3,0,.2,1) ${0.12 * i}s 1">${esc(w)}</span>`).join(" ");
}

// ---- tx loader hook (wallet.js calls window.uiBusy(statusId, bool)) -------------------------
window.uiBusy = function (statusId, busy) {
  const s = el(statusId);
  if (!s) return;
  let l = s.querySelector(".loader");
  if (!busy) { if (l) l.remove(); return; }
  if (l) return;
  l = document.createElement("span");
  l.className = "loader";
  l.setAttribute("aria-hidden", "true");
  s.prepend(l);
};

document.addEventListener("DOMContentLoaded", () => {
  mountWaves();
  mountScenes();
  mountRail();
  mountReveal();
  mountHeadline();
});
