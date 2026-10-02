#!/usr/bin/env python3
"""Read-only indexer: turns Den/Treasury events into the site's state.json. Signs nothing, holds nothing.

  python3 script/ops/indexer.py            # one incremental pass, writes STATE_OUT atomically
  python3 script/ops/indexer.py --loop 60  # keep running (or use cron: * * * * *)

Config: script/ops/config.json {rpc, den, treasury, token, den_block, state_out, db}.
Incremental: keeps a cursor + accumulated state in `db` (JSON) so each pass scans only new blocks,
9,999 blocks per getLogs (RHC cap), halving a chunk on RPC errors. Day boundaries (00:00 UTC) are
closed from the accumulated state at the last APPLIED event before the boundary, judged by chain
time (block timestamps), never the wall clock (review B-17). Schema: COORDINATION.md "Site — web/".
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import ipaddress
import json
import os
import re
import socket
import sys
import time

import requests
from PIL import Image
from web3 import Web3

Image.MAX_IMAGE_PIXELS = 4_000_000  # decompression-bomb guard for mirrored logos (review B-23)

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "config.json")))
OUT = CFG.get("abi_dir", os.path.join(HERE, "..", "..", "out"))  # deploy bundle may point this elsewhere
if not os.path.isdir(OUT):
    sys.exit("ABI directory missing: run `forge build` (dev) or set abi_dir in config.json (bundle)")
for k in ("den", "treasury", "token"):
    if int(CFG.get(k, "0x0"), 16) == 0:
        sys.exit(f"script/ops/config.json: {k} is not filled in")
if int(CFG.get("den_block", 0)) == 0:
    sys.exit("script/ops/config.json: den_block is not filled in")

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
w3 = Web3(Web3.HTTPProvider(CFG["rpc"], request_kwargs={"timeout": 60, "headers": {"User-Agent": UA, "Content-Type": "application/json"}}))
CHUNK = 9_999
DAY = 86_400
STATE_OUT = CFG.get("state_out", os.path.join(HERE, "state.json"))
DB_PATH = CFG.get("db", os.path.join(HERE, "indexer.db.json"))
UNLOCK = 1793491200
LAST_DAY = "2026-10-31"  # the season's last feeding day; days[] never goes past it

DEN_ABI = json.load(open(os.path.join(OUT, "Den.sol", "Den.json")))["abi"]
TREASURY_ABI = json.load(open(os.path.join(OUT, "Treasury.sol", "Treasury.json")))["abi"]
ERC20_MIN = [
    {"name": "logo", "type": "function", "inputs": [], "outputs": [{"type": "string"}], "stateMutability": "view"},
    {"name": "symbol", "type": "function", "inputs": [], "outputs": [{"type": "string"}], "stateMutability": "view"},
    {"name": "decimals", "type": "function", "inputs": [], "outputs": [{"type": "uint8"}], "stateMutability": "view"},
    {"name": "totalSupply", "type": "function", "inputs": [], "outputs": [{"type": "uint256"}], "stateMutability": "view"},
    {"name": "balanceOf", "type": "function", "inputs": [{"type": "address"}], "outputs": [{"type": "uint256"}], "stateMutability": "view"},
]
def topic(sig):
    """0x-prefixed topic0 regardless of web3/hexbytes version (review B-28)."""
    return Web3.to_hex(Web3.keccak(text=sig))


TRANSFER_TOPIC = topic("Transfer(address,address,uint256)")
# Pons factory owner can redirect our creator fee stream with a 3-day timelock: watch the factory for our token.
FACTORY = Web3.to_checksum_address(CFG.get("factory", "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e"))
RECIPIENT_TOPICS = {
    topic("CreatorFeeRecipientChangeProposed(address,address,address,uint256,uint256)"): "RecipientProposed",
    topic("CreatorFeeRecipientChangeCancelled(address,address)"): "RecipientCancelled",
    topic("CreatorFeeRecipientUpdated(address,address,address)"): "RecipientUpdated",
    topic("LaunchForceSwept(address)"): "LaunchForceSwept",
    topic("LaunchGraduationRescued(address,address,uint256,uint256)"): "LaunchGraduationRescued",
}

LOGOS_PATH = os.path.join(HERE, "logos.json")  # static map for tokens without a logo() getter (WETH, USDG, stocks)
KNOWN_LOGOS = json.load(open(LOGOS_PATH)) if os.path.exists(LOGOS_PATH) else {}
# Logos are MIRRORED (review B-22): the URL a token advertises is fetched once, re-encoded to a 128px PNG under
# LOGOS_DIR (next to state.json) and the site only ever loads that same-origin file. Failures emit "" and retry daily.
LOGOS_DIR = CFG.get("logos_dir", os.path.join(os.path.dirname(STATE_OUT), "logos"))
LOGO_RETRY = 86_400
URL_RE = re.compile(r"^(https://|ipfs://)[A-Za-z0-9._~:/?#\[\]!$&'()*+,;=%-]+$")

DEN = w3.eth.contract(address=Web3.to_checksum_address(CFG["den"]), abi=DEN_ABI)
TREASURY = w3.eth.contract(address=Web3.to_checksum_address(CFG["treasury"]), abi=TREASURY_ABI)
TOKEN = w3.eth.contract(address=Web3.to_checksum_address(CFG["token"]), abi=ERC20_MIN)
OPERATOR = TREASURY.functions.operator().call()
LOGO_FETCHES_PER_PASS = 10  # review B-26: bound the network work one pass can do
_logo_fetches = 0


def fresh_db():
    return {
        "cursor": int(CFG["den_block"]) - 1,
        "lastEventBlock": int(CFG["den_block"]),
        "closedThrough": None,
        "weight": {},  # user -> weight (str)
        "vote": {},  # user -> target
        "meta": {},  # token -> {symbol, decimals}
        "days": {},  # "YYYY-MM-DD" -> closed day record
        "releases": [],  # {tx, block, amountWei}
        "returns": [],  # {token, amount, from, tx, block}
        "sweeps": [],  # {token, amount, tx, block}
        "basketTokens": [],
        "claimedTotalWei": "0",
        "ownerPaidWei": "0",
        "recipient": None,  # last CreatorFeeRecipient* event seen for our token: {kind, block, tx, ...}
        "blockTs": {},  # block -> timestamp cache (only blocks that matter)
    }


def load_db():
    if os.path.exists(DB_PATH):
        db = json.load(open(DB_PATH))
        if "closedThrough" not in db:
            sys.exit(f"{DB_PATH} is from an older indexer version: delete it and re-run (full rescan)")
        return db
    return fresh_db()


def save_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=1)
    os.replace(tmp, path)


def meta(db, addr):
    a = Web3.to_checksum_address(addr)
    if a not in db["meta"]:
        c = w3.eth.contract(address=a, abi=ERC20_MIN)
        sym, dec = "", 18
        try:
            sym = c.functions.symbol().call()
        except Exception:  # noqa: BLE001 - any non-ERC20 target is still a valid vote
            pass
        try:
            dec = c.functions.decimals().call()
        except Exception:  # noqa: BLE001
            pass
        if not isinstance(sym, str):
            sym = ""
        sym = re.sub(r"[^\x20-\x7e]", "", sym)[:32]  # printable ASCII only, capped (review B-22)
        db["meta"][a] = {"symbol": sym, "decimals": dec, "logo": "", "logoTried": 0}
    m = db["meta"][a]
    m.setdefault("logo", ""); m.setdefault("logoTried", 0)
    global _logo_fetches
    if not m["logo"] and time.time() - m["logoTried"] > LOGO_RETRY and _logo_fetches < LOGO_FETCHES_PER_PASS:
        _logo_fetches += 1
        m["logoTried"] = int(time.time())
        m["logo"] = mirror_logo(a)
    return m


def logo_url(addr):
    """The URL a token advertises: static map first, then its logo() getter. Sanitised, never trusted."""
    url = KNOWN_LOGOS.get(addr.lower(), "")
    if not url:
        try:
            url = w3.eth.contract(address=addr, abi=ERC20_MIN).functions.logo().call()
        except Exception:  # noqa: BLE001
            url = ""
    if not isinstance(url, str) or len(url) > 512 or not URL_RE.match(url):
        return ""
    rest = url.split("://", 1)[1]
    if "@" in rest.split("/", 1)[0]:  # userinfo trick: https://good@evil/…
        return ""
    if url.startswith("ipfs://"):
        url = "https://ipfs.io/ipfs/" + url[len("ipfs://"):]
    return url


def host_is_public(url):
    """SSRF guard (review B-24): every resolved address of the host must be a global unicast IP."""
    try:
        host = url.split("://", 1)[1].split("/", 1)[0].split(":")[0].strip("[]")
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
        if not infos:
            return False
        return all(ipaddress.ip_address(i[4][0]).is_global for i in infos)
    except Exception:  # noqa: BLE001
        return False


def mirror_logo(addr):
    """Download (5 s, <= 2 MB, image/*), re-encode to 128x128 PNG in LOGOS_DIR, return the site-relative path or ""."""
    url = logo_url(addr)
    if not url or not host_is_public(url):
        return ""
    try:
        r = requests.get(url, timeout=5, stream=True, headers={"User-Agent": UA}, allow_redirects=False)
        if r.status_code != 200 or not r.headers.get("Content-Type", "").lower().startswith("image/"):
            return ""
        buf = io.BytesIO(); total = 0
        for chunk in r.iter_content(65536):
            total += len(chunk)
            if total > 2_000_000:
                return ""
            buf.write(chunk)
        im = Image.open(buf)
        if im.width * im.height > 4_000_000:
            return ""
        im.load()
        im = im.convert("RGBA")
        im.thumbnail((128, 128), Image.LANCZOS)
        canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        canvas.paste(im, ((128 - im.width) // 2, (128 - im.height) // 2))
        os.makedirs(LOGOS_DIR, exist_ok=True)
        name = f"{addr.lower()}.png"
        canvas.save(os.path.join(LOGOS_DIR, name), optimize=True)
        return f"logos/{name}"
    except Exception:  # noqa: BLE001 - any failure (network, decoder, size) means no logo
        return ""


def block_ts(db, n):
    k = str(n)
    if k not in db["blockTs"]:
        db["blockTs"][k] = w3.eth.get_block(n).timestamp
    return db["blockTs"][k]


def totals(db):
    t = {}
    for u, target in db["vote"].items():
        t[target] = t.get(target, 0) + int(db["weight"].get(u, "0"))
    return t


def ranked(db, n=10):
    t = totals(db)
    tw = sum(int(x) for x in db["weight"].values())
    rows = sorted(t.items(), key=lambda kv: kv[1], reverse=True)[:n]
    out = []
    for target, wgt in rows:
        m = meta(db, target)
        out.append({"token": target, "symbol": m["symbol"], "logo": m["logo"], "weight": str(wgt), "pct": round(100 * wgt / tw, 2) if tw else 0})
    return out


def with_slices(rows):
    for row, slice_pct in zip(rows, (50, 30, 20)):
        row["slicePct"] = slice_pct
    return rows


def day_of(ts):
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%d")


def close_day(db, day, tally_block):
    """Freeze the day's top 3 from the accumulated state (the state at the last applied event)."""
    if day in db["days"]:
        return
    db["days"][day] = {"day": day, "closed": True, "tallyBlock": tally_block, "top3": with_slices(ranked(db, 3))}


def close_through(db, ts_limit):
    """Close every 00:00Z boundary in (closedThrough, ts_limit]. Independent of chunking and empty passes."""
    if db.get("closedThrough") is None:
        db["closedThrough"] = (block_ts(db, int(CFG["den_block"])) // DAY) * DAY
    d = db["closedThrough"]
    while d + DAY <= ts_limit:
        close_day(db, day_of(d), db["lastEventBlock"])
        d += DAY
    db["closedThrough"] = d


def fetch_events(start, end):
    events = []
    for name in ("Deposited", "Voted"):
        for lg in DEN.events[name].get_logs(from_block=start, to_block=end):
            events.append((lg["blockNumber"], lg["logIndex"], name, lg))
    for name in ("Claimed", "Released", "OwnerDeferred", "OwnerWithdrawn", "Swept"):
        for lg in TREASURY.events[name].get_logs(from_block=start, to_block=end):
            events.append((lg["blockNumber"], lg["logIndex"], name, lg))
    to_topic = "0x" + TREASURY.address[2:].lower().rjust(64, "0")
    for lg in w3.eth.get_logs({"fromBlock": start, "toBlock": end, "topics": [TRANSFER_TOPIC, None, to_topic]}):
        events.append((lg["blockNumber"], lg["logIndex"], "Return", lg))
    token_topic = "0x" + TOKEN.address[2:].lower().rjust(64, "0")
    for lg in w3.eth.get_logs({"fromBlock": start, "toBlock": end, "address": FACTORY, "topics": [list(RECIPIENT_TOPICS.keys()), token_topic]}):
        events.append((lg["blockNumber"], lg["logIndex"], RECIPIENT_TOPICS.get(Web3.to_hex(lg["topics"][0]), "FactoryUnknown"), lg))
    events.sort(key=lambda e: (e[0], e[1]))
    return events


def fetch_events_split(start, end):
    """Halve the range on any RPC error (result cap, timeout); a single failing block raises."""
    try:
        return fetch_events(start, end)
    except Exception as e:  # noqa: BLE001
        if start == end:
            raise RuntimeError(f"block {start} cannot be fetched: {e}") from e
        mid = (start + end) // 2
        return fetch_events_split(start, mid) + fetch_events_split(mid + 1, end)


def topic_address(t):
    h = t.hex() if hasattr(t, "hex") else t
    return Web3.to_checksum_address("0x" + h[-40:])


def apply(db, bn, name, lg):
    if name.startswith("Recipient") or name.startswith("Launch") or name == "FactoryUnknown":
        rec = {"kind": name, "block": bn, "tx": Web3.to_hex(lg["transactionHash"])}
        if name == "RecipientProposed":
            rec["proposedRecipient"] = topic_address(lg["topics"][3])
            data = lg["data"] if isinstance(lg["data"], (bytes, bytearray)) else bytes.fromhex(lg["data"][2:])
            rec["effectiveAt"], rec["expiresAt"] = int.from_bytes(data[:32], "big"), int.from_bytes(data[32:64], "big")
        elif name == "RecipientUpdated":
            rec["newRecipient"] = topic_address(lg["topics"][3])
        db["recipient"] = rec
        return
    a = lg["args"] if name != "Return" else None
    if name == "Deposited":
        u = a["user"]
        db["weight"][u] = str(int(db["weight"].get(u, "0")) + a["weightAdded"])
    elif name == "Voted":
        db["vote"][a["user"]] = a["to"]
    elif name == "Claimed":
        db["claimedTotalWei"] = str(int(db["claimedTotalWei"]) + a["total"])
        db["ownerPaidWei"] = str(int(db["ownerPaidWei"]) + a["toOwner"])
    elif name == "Released":
        db["releases"].append({"tx": Web3.to_hex(lg["transactionHash"]), "block": bn, "amountWei": str(a["amount"])})
    elif name == "Swept":
        db["sweeps"].append({"token": a["token"], "amount": str(a["amount"]), "tx": Web3.to_hex(lg["transactionHash"]), "block": bn})
    elif name == "Return":
        tok = Web3.to_checksum_address(lg["address"])
        amt = int.from_bytes(lg["data"], "big")
        frm = topic_address(lg["topics"][1])
        # review B-26: only the operator's returns define the basket. Anyone can dust the Treasury with junk
        # tokens; those are recorded as transfers but never tracked, priced, logo-fetched or polled.
        if frm.lower() != OPERATOR.lower():
            return  # not a feeding return: not recorded, not tracked (B-26 follow-up)
        db["returns"].append({"token": tok, "amount": str(amt), "from": frm, "tx": Web3.to_hex(lg["transactionHash"]), "block": bn})
        if tok not in db["basketTokens"]:
            db["basketTokens"].append(tok)
        meta(db, tok)


def scan(db, head):
    start = db["cursor"] + 1
    while start <= head:
        end = min(start + CHUNK - 1, head)
        for bn, _, name, lg in fetch_events_split(start, end):
            close_through(db, block_ts(db, bn))  # every boundary crossed since the last applied event
            apply(db, bn, name, lg)
            db["lastEventBlock"] = bn
        db["cursor"] = end
        start = end + 1
    close_through(db, block_ts(db, head))  # days that ended with no events, by chain time


def attribute_returns(db):
    """A return belongs to the latest release before it (a late return lands on its own feeding)."""
    rel_blocks = [r["block"] for r in db["releases"]]
    out = {}
    for r in db["returns"]:
        prior = [b for b in rel_blocks if b <= r["block"]]
        key = prior[-1] if prior else None
        out.setdefault(key, []).append(r)
    return out


def recipient_alert(db, treasury_addr):
    """Alert while a redirect of our fee stream is pending, once the recipient is no longer the Treasury,
    or when the factory owner used a force/rescue power on our launch."""
    rec = db.get("recipient")
    if not rec:
        return None
    if rec["kind"] == "RecipientProposed":
        return {"kind": "proposed", **{k: rec[k] for k in ("proposedRecipient", "effectiveAt", "expiresAt", "tx")}}
    if rec["kind"] == "RecipientUpdated" and rec.get("newRecipient", "").lower() != treasury_addr.lower():
        return {"kind": "redirected", "newRecipient": rec["newRecipient"], "tx": rec["tx"]}
    if rec["kind"] in ("LaunchForceSwept", "LaunchGraduationRescued", "FactoryUnknown"):
        return {"kind": rec["kind"], "tx": rec["tx"]}
    return None


def build_state(db, head):
    tw = sum(int(x) for x in db["weight"].values())
    total_locked = DEN.functions.totalLocked().call()
    supply = TOKEN.functions.totalSupply().call()
    bal = w3.eth.get_balance(TREASURY.address)
    owed = TREASURY.functions.ownerOwed().call()
    operator = TREASURY.functions.operator().call()

    basket = []
    for tok in db["basketTokens"]:
        m = meta(db, tok)
        c = w3.eth.contract(address=tok, abi=ERC20_MIN)
        try:
            held = c.functions.balanceOf(TREASURY.address).call()
        except Exception:  # noqa: BLE001
            held = 0
        distributed = TREASURY.functions.distributed(tok).call()
        basket.append({"token": tok, "symbol": m["symbol"], "logo": m["logo"], "decimals": m["decimals"], "held": str(held), "distributed": str(distributed)})

    by_release = attribute_returns(db)
    days = []
    for day, rec in sorted(db["days"].items()):
        if day > LAST_DAY:
            continue
        d0 = int(dt.datetime.fromisoformat(day).replace(tzinfo=dt.timezone.utc).timestamp())
        # the feeding for day D happens during D+1: releases with block timestamps in [D+1, D+2)
        rels = [r for r in db["releases"] if d0 + DAY <= block_ts(db, r["block"]) < d0 + 2 * DAY]
        rets = []
        for r in rels:
            for x in by_release.get(r["block"], []):
                m = meta(db, x["token"])
                rets.append({**x, "symbol": m["symbol"], "decimals": m["decimals"], "fromOperator": x["from"] == operator})
        days.append({**rec, "releases": rels, "release": rels[-1] if rels else None,
                     "releasedWei": str(sum(int(r["amountWei"]) for r in rels)), "returns": rets})
    today = day_of(block_ts(db, head))
    if today not in db["days"] and today <= LAST_DAY:
        days.append({"day": today, "closed": False, "tallyBlock": db["lastEventBlock"], "top3": with_slices(ranked(db, 3)),
                     "releases": [], "release": None, "releasedWei": "0", "returns": []})

    sweeps = []
    for s in db["sweeps"]:
        m = meta(db, s["token"])
        sweeps.append({**s, "symbol": m["symbol"], "decimals": m["decimals"]})

    return {
        "updatedAt": int(time.time()),
        "recipientAlert": recipient_alert(db, TREASURY.address),
        "block": head,
        "blockTime": block_ts(db, head),
        "chainId": 4663,
        "token": TOKEN.address,
        "den": DEN.address,
        "treasuryAddress": TREASURY.address,
        "operator": operator,
        "unlockAt": UNLOCK,
        "totalSupply": str(supply),
        "totalLocked": str(total_locked),
        "hibernatingPct": round(100 * total_locked / supply, 2) if supply else 0,
        "hibernators": len(db["weight"]),
        "totalWeight": str(tw),
        "live": {"top": ranked(db, 10)},
        "days": days,
        "latestRelease": db["releases"][-1] if db["releases"] else None,
        "sweeps": sweeps,
        "treasury": {"balanceWei": str(bal), "ownerOwed": str(owed), "basket": basket},
        "fees": {"claimedTotalWei": db["claimedTotalWei"], "ownerPaidWei": db["ownerPaidWei"]},
    }


def run_once():
    global _logo_fetches
    _logo_fetches = 0
    db = load_db()
    head = w3.eth.block_number
    scan(db, head)
    state = build_state(db, head)
    save_json(DB_PATH, db)
    save_json(STATE_OUT, state)
    print(f"block {head} hibernators {state['hibernators']} locked {state['hibernatingPct']}% days {len(state['days'])} sweeps {len(state['sweeps'])} -> {STATE_OUT}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", type=int, default=0, help="seconds between passes; 0 = once")
    a = ap.parse_args()
    while True:
        try:
            run_once()
        except Exception as e:  # noqa: BLE001 - keep the loop alive; the next pass retries from the saved cursor
            print(f"indexer error: {e}", file=sys.stderr)
        if not a.loop:
            break
        time.sleep(a.loop)


if __name__ == "__main__":
    main()
