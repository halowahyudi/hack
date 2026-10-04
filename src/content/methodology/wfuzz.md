---
title: "Web Fuzzing with WFuzz"
description: "Practical WFuzz workflows: wordlists, filters, authenticated fuzzing, and finding hidden paths, parameters, and virtual hosts."
phase: Web
order: 76
tags:
  - fuzzing
  - discovery
  - wordlist
  - recon
tools:
  - wfuzz
  - ffuf
updated: 2026-10-01
---

WFuzz sends requests with a payload in any position and filters the noise so real findings stand out. It is the workhorse for content discovery, parameter probing, and virtual-host hunting. This runbook covers syntax, wordlists, the `--hc/--hl/--hh` filter family, auth, and repeatable workflows — on **in-scope** targets only.

## 1. Baseline before you fuzz

Know the shape of a miss so you can hide it.

```bash
wfuzz -w /usr/share/wordlists/dirb/common.txt --hc 404 https://target.com

# Baseline a random 404 and capture its size
curl -s -o /dev/null -w "code=%{http_code} size=%{size_download}\n" \
  https://target.com/this-does-not-exist-$(date +%s)
```

## 2. Core syntax and multiple payloads

`FUZZ` marks the injection point; `FUZ2Z`, `FUZ3Z`, ... add more positions.

```bash
wfuzz -w /usr/share/wordlists/dirb/common.txt https://target.com/FUZZ
wfuzz -w burp-parameter-names.txt "https://target.com/api?FUZZ=test"
wfuzz -w users.txt -w passwords.txt -d "user=FUZZ&pass=FUZ2Z" https://target.com/login
```

## 3. Wordlists that earn their keep

Pick the smallest list that fits the target.

```bash
wfuzz -w /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt \
  https://target.com/FUZZ

wfuzz -w /usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt \
  "https://target.com/api?FUZZ=1"
```

## 4. Filter the response noise

The filter flags are the heart of WFuzz. Hide the baseline, then surface anomalies.

```bash
--hc 404            # hide status codes (400-499,404,500)
--hl 42             # hide responses with 42 lines
--hh 0              # hide empty bodies
--hw 120            # hide by word count
--sc 200,301,403    # show-only these codes
--sl 10             # show-only this line count
```

```bash
# Hide the 404 and any same-size soft-404
wfuzz -w raft-medium-directories.txt --hc 404 --hh 0 -o json -f wfuzz_dirs.json \
  https://target.com/FUZZ
```

## 5. Authenticated, header, and vhost fuzzing

```bash
wfuzz -w paths.txt -H "Cookie: session=YOUR_TOKEN" \
  -H "Authorization: Bearer YOUR_TOKEN" --hc 404 https://target.com/FUZZ

wfuzz -w subdomains.txt -H "Host: FUZZ.target.com" --hh 0 https://target.com/
# vhosts often return the same body size; --hh/--hw strips the default page
```

## 6. Common workflows and hygiene

- **Recursion**: `--recursion --recursion-depth 2` to go one level into hit dirs.
- **Rate control**: `-t 20 -s 0.1` for threads and delay.
- **Encoders**: `--encoder url`, `--encoder base64` to transform payloads inline.
- **Save everything**: `-o json -f out.json`, then grep for `302`, auth, admin.
- **Combine with ffuf** when you want a different filter model on the same list.

## Full pipeline

```bash
D=https://target.com
W=/usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt

# 1. Baseline (record the 404 size for soft-404 filtering)
curl -s -o /dev/null -w "baseline code=%{http_code} size=%{size_download}\n" \
  "$D/nonexistent-$(date +%s)"

# 2. Content discovery
wfuzz -w "$W" --hc 404 --hh 0 -o json -f wfuzz_dirs.json "$D/FUZZ"

# 3. Parameter discovery
wfuzz -w /usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt \
  --hc 404 --hw 0 "$D/api?FUZZ=1"

# 4. Virtual hosts on the same IP
wfuzz -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt \
  -H "Host: FUZZ.target.com" --hh 0 "$D/"

# 5. Review saved hits
jq -r '.[] | select(.code==200 or .code==302 or .code==403) | "\(.code) \(.url)"' wfuzz_dirs.json
```

## Ethics & legality

- Fuzz only assets inside an authorized scope; confirm program rules first.
- Keep thread counts and delays polite — fuzzing looks like an attack from the WAF.
- Do not use found credentials beyond a minimal proof; stop and report.
- Save tool, wordlist, timestamp, and rate as evidence.
