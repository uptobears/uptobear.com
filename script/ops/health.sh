#!/bin/sh
# Indexer health check for cron (every 5 min): alerts when state.json is stale or the indexed block lags the chain.
#   */5 * * * * STATE_URL=https://uptobear.com/state.json RPC=https://rpc.mainnet.chain.robinhood.com ALERT_WEBHOOK=<discord-compatible webhook> sh health.sh
# Without ALERT_WEBHOOK it only prints; exit 1 on a problem so cron mail also works.
STATE_URL=${STATE_URL:?}; RPC=${RPC:-https://rpc.mainnet.chain.robinhood.com}
MAX_AGE=${MAX_AGE:-300}; MAX_LAG_BLOCKS=${MAX_LAG_BLOCKS:-3000}
now=$(date +%s)
json=$(curl -sf -m 20 -A "Mozilla/5.0" "$STATE_URL") || { msg="state.json unreachable at $STATE_URL"; }
if [ -z "$msg" ]; then
  updated=$(printf '%s' "$json" | python3 -c 'import sys,json;print(json.load(sys.stdin)["updatedAt"])' 2>/dev/null || echo 0)
  block=$(printf '%s' "$json" | python3 -c 'import sys,json;print(json.load(sys.stdin)["block"])' 2>/dev/null || echo 0)
  alert=$(printf '%s' "$json" | python3 -c 'import sys,json;a=json.load(sys.stdin).get("recipientAlert");print("" if not a else (a["kind"]+" "+a.get("proposedRecipient",a.get("newRecipient",""))))' 2>/dev/null)
  [ -n "$alert" ] && msg="Pons fee recipient change: $alert (factory owner power; act before effectiveAt)"
  age=$((now - updated))
  if [ -n "$msg" ]; then :
  elif [ "$age" -gt "$MAX_AGE" ]; then msg="state.json is ${age}s old (indexer stopped?)"
  elif [ "$age" -lt -60 ]; then msg="state.json updatedAt is ${age}s in the future (clock skew on the host?)"; fi
  if [ -z "$msg" ] && [ "${DEEP:-0}" = "1" ]; then
    head=$(curl -sf -m 20 -A "Mozilla/5.0" -X POST "$RPC" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' | python3 -c 'import sys,json;print(int(json.load(sys.stdin)["result"],16))' 2>/dev/null || echo 0)
    [ "$head" -gt 0 ] && [ $((head - block)) -gt "$MAX_LAG_BLOCKS" ] && msg="indexer lags the chain by $((head - block)) blocks (block $block vs head $head)"
  fi
fi
[ -z "$msg" ] && { echo "ok (age ${age:-?}s, block ${block:-?})"; exit 0; }
echo "ALERT: $msg"
[ -n "$ALERT_WEBHOOK" ] && curl -sf -m 10 -X POST "$ALERT_WEBHOOK" -H 'content-type: application/json' -d "{\"content\":\"UPTOBEAR indexer: $msg\"}" >/dev/null
exit 1
