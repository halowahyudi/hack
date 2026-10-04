---
title: "Domain / Subdomain Takeover"
description: "Finding dangling DNS records pointing at unclaimed services like S3, GitHub Pages, and Heroku, then proving takeover safely."
phase: Web
order: 30
tags:
  - subdomain-takeover
  - dns
  - reconnaissance
  - cloud
tools:
  - dig
  - subfinder
updated: 2026-10-01
---

A subdomain takeover runbook for authorized pentests / bug bounty on **in-scope** targets only. Goal: find DNS records pointing at unclaimed third-party resources and prove the fingerprint without claiming anything you do not own.

## 1. Collect candidate hostnames

```bash
subfinder -d target.com -silent -o subs.txt
assetfinder --subs-only target.com >> subs.txt
sort -u subs.txt -o subs.txt
wc -l subs.txt
```

## 2. Resolve and capture CNAME chains

A dangling CNAME to a third-party service is the core indicator.

```bash
# Show the full CNAME chain and final A record
while read -r host; do
  echo "== $host"
  dig +short CNAME "$host"
  dig +short A "$host"
done < subs.txt | tee dns_dump.txt

# Faster bulk variant
dnsx -l subs.txt -cname -a -resp -silent -o dnsx.txt
```

## 3. Fingerprint unclaimed services

Match the CNAME target against known takeover fingerprints (S3, GitHub Pages, Heroku, Azure, Fastly, etc.).

```bash
# Common "unclaimed" response markers
while read -r host; do
  body=$(curl -s -m 8 "http://$host/")
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 8 "http://$host/")
  case "$body" in
    *"NoSuchBucket"*|*"There isn't a GitHub Pages site here"*|*"No such app"*|*"404 Web Site not found"*)
      echo "CANDIDATE $code $host" ;;
  esac
done < subs.txt
```

## 4. Automate with subzy and nuclei

```bash
subzy run --targets subs.txt --hide_fails

# Nuclei takeover templates
nuclei -l subs.txt -t http/takeovers/ -silent -o takeovers.txt
cat takeovers.txt
```

## 5. Prove safely

Do **not** register the resource unless you own it or have written authorization. A safe proof is the unclaimed fingerprint plus a banner that shows the service is unconfigured.

```bash
# Capture the exact unclaimed response as evidence
curl -s -D - "http://candidate.target.com/" -o evidence.html
curl -s "http://candidate.target.com/" | grep -ioE "NoSuchBucket|GitHub Pages|No such app|404 Web Site not found"
```

If the program explicitly authorizes claiming the dangling resource, use a throwaway account and an inert page.

## 6. Verify NS and MX dangling records too

```bash
dig +short NS dangling.target.com
dig +short MX target.com
```

An unclaimed NS record can allow full zone delegation, which is higher impact than a CNAME.

## Full pipeline

```bash
# 1. Collect subdomains
subfinder -d target.com -silent -o subs.txt
assetfinder --subs-only target.com >> subs.txt
sort -u subs.txt -o subs.txt

# 2. Resolve CNAMEs
dnsx -l subs.txt -cname -a -resp -silent -o dnsx.txt

# 3. Fingerprint unclaimed services
while read -r host; do
  body=$(curl -s -m 8 "http://$host/")
  case "$body" in
    *"NoSuchBucket"*|*"There isn't a GitHub Pages site here"*|*"No such app"*|*"404 Web Site not found"*)
      echo "CANDIDATE $host" ;;
  esac
done < subs.txt | tee candidates.txt

# 4. Automated confirmation
subzy run --targets subs.txt --hide_fails
nuclei -l subs.txt -t http/takeovers/ -silent -o takeovers.txt

# 5. Evidence
curl -s -D - "http://candidate.target.com/" -o evidence.html
```

## Ethics & legality

- Only test hostnames within the authorized scope; do not scan unrelated domains.
- Never claim a dangling resource unless the program explicitly allows it; use a screenshot of the unclaimed fingerprint otherwise.
- If you do claim, use a throwaway account, an inert page, and release it promptly.
- Save DNS traces, HTTP responses, and tool output as evidence.
