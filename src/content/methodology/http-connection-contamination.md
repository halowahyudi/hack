---
title: "HTTP Connection Contamination"
description: "Test whether shared backend connections leak state between users through headers, cookies, or pooled sockets."
phase: Web
order: 41
tags:
  - smuggling
  - proxy
  - sessions
  - web
tools:
  - burp suite
  - curl
updated: 2026-10-01
---

A runbook for detecting **connection contamination** in an authorized scope. Goal: determine whether a front end reuses backend connections in a way that lets one request's headers, cookies, or session state bleed into another user's.

## 1. Map the trust boundary

Identify the front end, the backend it forwards to, and where authentication happens. If the backend keeps per-connection state (auth, tenant, socket attributes), pooled reuse can carry context across users.

```bash
curl -s -D - -o /dev/null https://target/ -H 'X-Tenant: test'
curl -s -D - -o /dev/null https://target/ -H 'Connection: keep-alive'
```

## 2. Fingerprint connection reuse

Send two requests on one connection and watch for server/connection headers that imply pooling.

```bash
curl -s -D - -o /dev/null https://target/a https://target/b | grep -iE 'connection|server|via|x-served'
```

## 3. Fire parallel requests with distinct sessions

Send many requests concurrently using different cookies and compare for foreign data. A marker string lets you detect cross-talk quickly.

```bash
mkdir -p out
seq 1 100 | xargs -P 100 -I{} curl -s -b "session=user-A" https://target/account -o out/A_{}
grep -L "user-A-owns-this" out/A_*   # files lacking the expected marker
grep -rl "user-B" out/A_*            # your response contains the other user's data
```

Repeat while authenticated as two accounts and watch for responses that change identity without you logging in.

## 4. Probe header and cookie persistence

Vary connection-sensitive headers across a reused socket and check the next reply.

```bash
# Same connection, different identities
curl -s -b "session=A" https://target/account -o /dev/null \
  -b "session=B" https://target/account -D -
# Watch whether tenant/identity headers survive to the next response
curl -s -H 'X-User-Id: 999' https://target/account -D - | grep -iE 'x-user|set-cookie'
```

## 5. Use Burp / Turbo Intruder for timing

Reuse the exact socket and interleave requests to expose state that only appears under load. Compare baseline vs concurrent response bodies.

```bash
# With Burp running as a proxy, replay through it to control connection reuse
curl -s -x http://127.0.0.1:8080 -b "session=A" https://target/account -o a.html
curl -s -x http://127.0.0.1:8080 -b "session=B" https://target/account -o b.html
diff <(grep -i 'set-cookie\|x-user' a.html) <(grep -i 'set-cookie\|x-user' b.html)
```

## 6. Confirm impact safely

Stop at the smallest proof of cross-user leakage. Do not harvest real data. Record the trigger (load, timing, exact path) and keep the marker-based evidence.

## 7. Full pipeline (one block)

```bash
TARGET=https://target/account
mkdir -p out
seq 1 100 | xargs -P 100 -I{} curl -s -b "session=user-A" "$TARGET" -o out/A_{}
echo "[!] responses missing A's marker:"; grep -L "user-A-owns-this" out/A_*
echo "[!] responses containing B's data:"; grep -rl "user-B" out/A_*
seq 1 100 | xargs -P 100 -I{} curl -s -b "session=user-B" "$TARGET" -o out/B_{}
grep -L "user-B-owns-this" out/B_*
```

## Ethics & legality

- Only test hosts in an official scope or with written authorization.
- Confirm leakage with markers on your own accounts; never harvest third-party data.
- Respect rate limits and document trigger conditions for reproduction.
