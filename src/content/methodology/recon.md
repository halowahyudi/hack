---
title: "Reconnaissance → Live Host Discovery"
description: "End-to-end subdomain and asset discovery: passive sources, certificate transparency, resolution, and probing to a clean list of live hosts ready for testing."
phase: Generic Hacking
order: 0
tags:
  - recon
  - subdomain
  - osint
  - attack surface
tools:
  - subfinder
  - assetfinder
  - httpx
  - dnsx
  - jq
updated: 2026-10-01
---

A recon runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: collect as many hostnames as possible, resolve them, and produce a clean list of live hosts to feed the next phase.

## 1. Subdomain discovery from multiple sources

Never trust a single source — each one sees a different slice of the surface.

```bash
# Passive certificate/API aggregation
subfinder -d target.com -silent -o subfinder.txt

# Passive subdomain lookup
assetfinder --subs-only target.com > assetfinder.txt
```

## 2. Certificate Transparency (crt.sh)

CT logs are the richest free source. Query them directly instead of scraping.

```bash
curl -s "https://crt.sh/?q=%25.target.com&output=json" \
  | jq -r '.[].name_value' \
  | sed 's/\*\.//g' \
  | sort -u > crtsh.txt
```

## 3. Merge and deduplicate

```bash
cat subfinder.txt assetfinder.txt crtsh.txt | sort -u > all_domains.txt
wc -l all_domains.txt
```

## 4. Resolve to IPs, then verify which are alive

```bash
# Resolve only — filters out dead names early
dnsx -l all_domains.txt -a -resp -silent -o resolved.txt

# Probe HTTP(S) and capture triage metadata in one pass
httpx -l all_domains.txt -silent -status-code -title -tech-detect -cname -o live.txt
```

`live.txt` is now the clean working set: only hosts that actually answer.

## 5. Full pipeline (one block)

```bash
subfinder -d target.com -silent -o subfinder.txt
assetfinder --subs-only target.com > assetfinder.txt
curl -s "https://crt.sh/?q=%25.target.com&output=json" | jq -r '.[].name_value' | sed 's/\*\.//g' > crtsh.txt

cat subfinder.txt assetfinder.txt crtsh.txt | sort -u > all_domains.txt

dnsx -l all_domains.txt -a -resp -silent -o resolved.txt
httpx -l all_domains.txt -silent -status-code -title -tech-detect -cname -o live.txt
```

## 6. Prioritize the output

- Sort `live.txt` by status code — `200`, `401`, `403`, `500` are all interesting.
- Flag hosts whose **title/tech** suggests admin panels, staging, CI, or databases.
- Keep the CNAME column: it feeds straight into subdomain-takeover checks.

## Ethics & legality

- Only run against domains in an official bug bounty scope or with written authorization.
- Keep request rates reasonable; respect program rate limits.
- Store scan logs (timestamp, tool, target) as evidence for the report.
