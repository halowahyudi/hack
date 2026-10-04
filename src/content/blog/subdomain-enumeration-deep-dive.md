---
title: "Subdomain Enumeration Done Right: Passive and Active Techniques"
description: "A practical, ordered approach to subdomain discovery — from passive OSINT to active resolution, wildcard handling, and cleanup of false positives."
pubDate: 2026-08-14
featured: true
tags:
  - recon
  - subdomain enumeration
  - osint
  - bug bounty
---

Subdomain enumeration is the first real move of almost every engagement. Done poorly it
produces thousands of DNS names, most of them dead. Done well it hands you the smallest
possible set of *live, interesting* targets.

This post is the exact pipeline I run, in order, with the trade-offs at each step.

## 1. Start broad with passive collection

Passive sources require no traffic to your target. Let the internet do the recon for you.

```bash
# Certificate transparency + common sources in one shot
subfinder -d example.com -all -silent

# Asset discovery, pulls from more sources
amass enum -passive -d example.com

# Wayback + URLShortener CT from archived crawls
gobuster dns -d example.com -w /usr/share/seclists/Discovery/DNS/subdomains-top1million.txt --wildcard
```

Tools will disagree. **Merge everything into one sorted, deduplicated file** and never
trust a single source:

```bash
cat subs_*.txt | sort -u > all_subs.txt
```

## 2. Add active brute force for the long tail

Passive sources only know about names that *someone has already resolved*. The
interesting names — `staging`, `ci`, `vpn`, `gitlab`, `jenkins` — are often private and
only show up when you go looking for them.

```bash
ffuf -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt \
  -u http://FUZZ.example.com -t 100 -mc 200
```

> **Rate limiting matters.** Aggressive brute force on a production domain is noisy.
> Keep concurrency sane (`-t 50–150`) and log your activity — you'll need it for the
> report.

## 3. Resolve, dedupe, and hunt the wildcard

Resolve every candidate to an IP, tag the source, and **prove your wildcard**. If
`*.example.com` points at a catch-all, thousands of fake hosts will resolve to the same
IP — filter them out or you'll drown in false positives.

```bash
# Paint the target with a random name first
host random-string-4f8e2.example.com

# Resolve candidates with puredns or httpx
puredns resolve all_subs.txt --wildcard-batch 200000

# Mass probe for HTTP(S) hosts that actually respond
httpx -l resolved.txt -silent -title -status-code -tech-detect -o live.txt
```

## 4. Read the attack surface from what is live

Now enrich the live hosts: screenshots for eyeballing, tech fingerprints for known CVEs,
headers for missing security controls.

```bash
# Screenshot everything
gowitness file -f live.txt

# Tech detection / CVEs
nuclei -l live.txt -tags tech -severity low,medium,high -o tech_findings.txt

# Grab headers + TLS certs (certs leak sibling hosts)
tlsx -l live.txt -san -cn
```

## 5. Iterate with the results

Every live subdomain is a new entry point:

- **`git.` / `ci.` / `jenkins.`** → build secrets, self-hosted runners
- **`vpn.` / `portal.`** → remote access, weak auth
- **`staging-*` / `dev.*`** → unprotected environments, dev creds, debug info
- **API subdomains with different CORS** → privilege boundary confusion

## Checklist

- [ ] Merged passive sources, deduplicated
- [ ] Active brute force with a top-1M wordlist
- [ ] Wildcard confirmed/eliminated
- [ ] Live hosts probed with `httpx`/`puredns`
- [ ] Screenshots + tech fingerprint captured
- [ ] DNS zone transfer attempted (`dig axfr @ns1`)
- [ ] TLS SANs mined for sibling hosts
- [ ] Internal IPs leaked via DNS CNAMEs flagged for the report

The output of this phase decides what the entire rest of the engagement looks like.
It's worth doing slowly and carefully the first ten times.