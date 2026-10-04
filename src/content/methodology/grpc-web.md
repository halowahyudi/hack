---
title: "gRPC-Web Pentest"
description: "Map and test gRPC-Web services: decode binary frames, enumerate methods, and probe per-method auth and metadata handling."
phase: Web
order: 40
tags:
  - grpc
  - protobuf
  - api
  - web
tools:
  - grpcurl
  - grpcui
  - burp suite
  - jq
updated: 2026-10-01
---

A runbook for testing **gRPC-Web** services in an authorized scope. Goal: enumerate methods, decode the length-prefixed framing, and verify authorization is enforced per RPC rather than only in the UI.

## 1. Fingerprint the gateway

Look for `application/grpc-web+proto` content types and paths shaped like `/package.Service/Method`. Check whether reflection is exposed and whether a REST gateway maps the same methods.

```bash
curl -s -D - -o /dev/null https://target/ \
  -H 'Content-Type: application/grpc-web+proto'
grpcurl -plaintext target:50051 list
```

## 2. Triage reflection and descriptors

If reflection is on, list and describe services directly instead of reverse-engineering JS.

```bash
grpcurl -plaintext target:50051 list
grpcurl -plaintext target:50051 describe pkg.Service
grpcurl -plaintext target:50051 describe pkg.Service.Method > method.json
```

Without reflection, harvest method names from client bundles or a Burp capture.

```bash
curl -s https://target/static/app.js | grep -oE '/[A-Za-z0-9_.]+\.[A-Za-z0-9_]+/[A-Za-z0-9_]+' | sort -u
```

## 3. Decode the gRPC-Web framing

Each body is one or more frames: a flag byte, a 4-byte big-endian length, then the protobuf payload. The trailer frame sets the high bit.

```text
[0x00][len:4][protobuf data]
[0x80][len:4][grpc-status + metadata trailers]
```

Decode a base64 body saved from Burp:

```bash
echo "<base64-body>" | base64 -d | xxd | head
python3 -c "import sys;d=sys.stdin.buffer.read();i=0
while i<len(d):
 print('flag',d[i],'len',int.from_bytes(d[i+1:i+5],'big'));i+=5+int.from_bytes(d[i+1:i+5],'big')" < body.bin
```

## 4. Enumerate methods with grpcurl

Call methods directly once you have names. Use an interactive UI for manual exploration.

```bash
grpcurl -plaintext -d '{"id":1}' target:50051 pkg.Service/GetUser
grpcurl -plaintext -import-path . -proto svc.proto -d '{}' target:50051 pkg.Service/Admin
grpcui -plaintext target:50051
```

## 5. Test authorization per method

The common flaw: the browser only shows methods you are allowed to call, but the backend never checks the token on that RPC. Replay every method with and without credentials.

```bash
# No metadata / no token
grpcurl -plaintext -d '{}' target:50051 pkg.Service/ListUsers
# With a captured low-privilege token
grpcurl -plaintext -H 'authorization: Bearer <low-priv>' -d '{}' target:50051 pkg.Service/DeleteUser
```

## 6. Probe metadata and identity headers

Metadata is HTTP/2 headers. Watch for trust in client-supplied `x-user-id`, `role`, or `tenant` keys, and confirm whether they override the token.

```bash
grpcurl -plaintext -H 'authorization: Bearer <user>' -H 'x-user-id: 1' -d '{}' target:50051 pkg.Service/GetAccount
grpcurl -plaintext -d '{}' target:50051 pkg.Service/GetAccount 2>&1 | jq -R 'select(test("grpc-message"))'
```

Verbose `grpc-message` strings often leak internal paths or validation logic.

## 7. Full pipeline (one block)

```bash
TARGET=target:50051
# Discover
grpcurl -plaintext $TARGET list | tee services.txt
while read s; do grpcurl -plaintext $TARGET describe $s; done < services.txt > schema.txt
# Call without auth to find weak methods
while read m; do
  echo "== $m"; grpcurl -plaintext -d '{}' $TARGET $m 2>&1 | head -n 5
done < <(grep -oE '^[A-Za-z0-9_.]+/[A-Za-z0-9_]+' schema.txt | sort -u)
# Replay with a token
grpcurl -plaintext -H 'authorization: Bearer <token>' -d '{}' $TARGET pkg.Service/Admin
```

## Ethics & legality

- Only test services in an official scope or with written authorization.
- Do not exfiltrate real user data; prove access with your own test identities.
- Capture request/response evidence per method for the report.
