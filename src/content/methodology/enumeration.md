---
title: "Service & Content Enumeration"
description: "Post-recon runbook: port and service mapping, size-filtered content discovery, JS endpoint extraction, and technology fingerprinting to build a prioritized hit list."
phase: Generic Hacking
order: 1
tags:
  - enumeration
  - content discovery
  - port scanning
  - katana
tools:
  - nmap
  - ffuf
  - gobuster
  - katana
  - nuclei
updated: 2026-10-01
---

Once recon gives you a shortlist of live hosts, enumeration is where real vulnerability types start to surface. Goal: map every reachable service, file, and endpoint on **in-scope** hosts, and hand a prioritized inventory to the next phase. Assume all tools are installed and are tested only against authorized targets.

## 1. Port and service mapping

Start with a fast sweep, then drill into what is actually open. Never service-scan the full range — it is slow and noisy.

```bash
mkdir -p enum && cd enum

# Fast SYN sweep, no service probe
nmap -sS -p- --min-rate 4000 -T4 -oG ports.txt <target>

# Extract open ports, then run version + default scripts on just those
OPEN=$(grep -oP '\d+/open' ports.txt | cut -d/ -f1 | paste -sd,)
nmap -sV -sC -p "$OPEN" -T3 -oN services.txt <target>
```

Common high-value services to flag:

| Port | Service | What to chase |
|------|---------|---------------|
| 6379 | Redis | unauthenticated access |
| 27017 | MongoDB | open instance, collection dump |
| 9200 | Elasticsearch | `/_cat/indices` data leak |
| 2375 | Docker | host path disclosure |
| 5984 | CouchDB | default admin patterns |

## 2. Content discovery

Fuzz with a short wordlist first, baseline the wildcard response, then filter by size.

```bash
BASE=$(curl -s -o /dev/null -w '%{size_download}' https://target/nonexistent-xyz)

# Directory/file discovery, filtering wildcard size
ffuf -u https://target/FUZZ -w /wordlists/common.txt \
  -mc 200,201,204,301,302,307,401,403 -fs "$BASE" -t 64 -o ffuf-common.json

# Deeper wordlist once wildcard behavior is understood
ffuf -u https://target/FUZZ -w /wordlists/raft-large-words.txt \
  -mc 200,204 -fs "$BASE" -t 48 -o ffuf-deep.txt

# Extension brute-force on a discovered directory
gobuster dir -u https://target/ -w /wordlists/common.txt -x php,bak,zip,json -t 30 -o gobuster.txt
```

A `403` where nothing should exist is a hint; a `200` with an unexpected size is a finding.

## 3. Endpoint extraction from JS and history

```bash
# Crawl links, forms, and JS routes
katana -u https://target -d 3 -jc -ef pdf,png,jpg,svg -o crawl.txt

# Pull API-ish paths straight out of JS bundles
grep -ohE '"/(api|v[0-9]|rest|graphql)/[^"]+"' crawl.txt | tr -d '"' | sort -u > endpoints.txt

# Historical URLs often expose forgotten or pre-auth endpoints
gau target.com | grep -E '(/api/|\.json|\.xml)' | sort -u >> endpoints.txt
sort -u endpoints.txt -o endpoints.txt
```

Every new endpoint feeds the injection and auth phases. Group results by host in `endpoints.txt`.

## 4. Technology fingerprinting

Fingerprint before scanning — version banners decide which CVEs matter.

```bash
whatweb -i live.txt --log-brief=whatweb.txt
nuclei -l live.txt -tags tech -silent -o tech.txt
```

## 5. Full pipeline

```bash
mkdir -p enum && cd enum

nmap -sS -p- --min-rate 4000 -T4 -oG ports.txt <target>
OPEN=$(grep -oP '\d+/open' ports.txt | cut -d/ -f1 | paste -sd,)
nmap -sV -sC -p "$OPEN" -T3 -oN services.txt <target>

BASE=$(curl -s -o /dev/null -w '%{size_download}' https://target/nonexistent-xyz)
ffuf -u https://target/FUZZ -w /wordlists/common.txt -mc 200,201,204,301,302,307,401,403 -fs "$BASE" -t 64 -o ffuf-common.json
gobuster dir -u https://target/ -w /wordlists/common.txt -x php,bak,zip,json -t 30 -o gobuster.txt

katana -u https://target -d 3 -jc -ef pdf,png,jpg,svg -o crawl.txt
grep -ohE '"/(api|v[0-9]|rest|graphql)/[^"]+"' crawl.txt | tr -d '"' | sort -u > endpoints.txt
gau target.com | grep -E '(/api/|\.json|\.xml)' | sort -u >> endpoints.txt
sort -u endpoints.txt -o endpoints.txt

whatweb -i live.txt --log-brief=whatweb.txt
nuclei -l live.txt -tags tech -silent -o tech.txt
```

## Ethics & legality

- Only enumerate hosts inside an official scope or with written authorization.
- Respect the agreed scan window and rate limits; throttle fuzzing on production.
- Never run credential brute-force from this phase.
- Log every command with timestamp so findings are defensible.
