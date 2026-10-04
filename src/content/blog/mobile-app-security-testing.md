---
title: "Mobile App Security Testing: A Static-to-Dynamic Workflow"
description: "A reproducible Android/iOS testing workflow — static analysis, runtime instrumentation with Frida, traffic interception, and storage inspection."
pubDate: 2026-04-18
tags:
  - mobile security
  - frida
  - android
  - ios
---

Mobile apps are where the API's dumbest mistakes get exposed — hardcoded secrets,
disabled certificate pinning, world-readable storage. This is my repeatable workflow,
from APK to a sorted findings list.

## 1. Static analysis

Start with the binary. On Android:

```bash
apktool d app.apk -o decompiled/
jadx -d java/ app.apk            # actual source for clarity
```

**Chase these first:**

```bash
grep -rEi "api[_-]?key|secret|token|password|BEGIN (RSA|PRIVATE)" decompiled/res/ java/
grep -rE "http://" java/         # plaintext traffic in release builds
find decompiled -name "*.xml" | xargs grep -iE "allowBackup|usesCleartextTraffic"
```

On iOS, pull the decrypted IPA (jailbroken device or a logging profile) and run
`strings` + object mirrors over the binary to find URL schemes, API endpoints, and
stored C strings.

MobSF gives you a nice starting picture, but the manual greps above are what find the
real gems.

## 2. Runtime instrumentation with Frida

Static analysis lies about what the code *does at runtime*. Enter Frida:

```python
# python3 frida-pinbypass.py --dump-secrets
import frida, sys

def on_message(message, data):
    if message['type'] == 'send':
        print(f"[SECRET] {message['payload']}")

system = frida.get_usb_device()
session = system.attach("com.target.app")
script = session.create_script("""
Interceptor.attach(Module.findExportByName(null, "SSL_CTX_set_custom_verify"),
    { onEnter(args) { send("SSL verify callback hooked"); } });
""")
script.on('message', on_message)
script.load()
sys.stdin.read()
```

Frida's killer apps on mobile:

- **Pin bypass** for both Android (`SSL PINNING`) and iOS (`frida -U -f com.x --codeshare ssl-pinning-bypass`)
- **Hooking unmanaged strings** — grab the auth token, signing seed, or encryption key
  right before it hits the network stack
- **Simulating jailbreak/root opposite detection** — find anti-tampering features

## 3. Traffic interception

Point the app at Burp, then:

```bash
# install CA, then force the app to trust it
adb shell settings put global http_proxy 10.0.2.2:8080
adb reverse tcp:8080 tcp:8080
```

If the conversation is pinned or refuses to proxy, that's *itself* a finding (often
fine, but flag it) — or instrument with Frida to push it through.

**Intercept, then mutate:**

- Authorization tokens the app sends on each request → can one be replayed from another device?
- Device-registered endpoint headers (`X-Device-Id`) → can they be forged?
- Client-side encryption before transmission → where is the key?

## 4. Storage & persistence

```bash
# Android (debuggable apps or rooted)
adb shell run-as com.target.app ls -la files/
adb shell run-as com.target.app cat shared_prefs/*.xml

# SQLite databases are rarely encrypted
adb shell run-as com.target.app cp databases/app.db /sdcard/
sqlite3 app.db ".tables"
```

Look for: session tokens in *plaintext pref files*, chat DBs unencrypted, app "secret" 
keys shipped in `assets/`. iOS equivalent: `~/Library/Preferences/` plists on the 
simulator and the app sandbox on a jailbroken device.

## 5. Triage the results

Every finding gets scored by reachability on a *real device*, not the emulator:

- **High:** secret exfiltrates the app sandbox; pin bypass reaches a prod API with a leaked key
- **Medium:** sensitive data in plaintext storage; transport permits MITM with root certs
- **Low:** cleartext fallback endpoints; missing jailbreak detection

And the one habit that earns trust from the developer side: **give them the command
they need to reproduce**, not just the screenshot.

> This workflow is mobile half of my pentesting methodology. Pair it with API testing
> on the same targets — the mobile client and the web API almost never enforce the same
> rules, and that gap is where the good bugs hide.