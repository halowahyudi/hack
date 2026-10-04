---
title: "Virtual Office UMKM"
description: "A multi-tenant web platform that gives small businesses a virtual office — digital storefront, document storage, and customer status tracking."
pubDate: 2025-04-10
updated: 2026-07-18
featured: true
icon: 🏢
status: active
type: webapp
tags:
  - web-app
  - umkm
  - multi-tenant
  - typescript
stack:
  - Next.js
  - PostgreSQL
  - Prisma
  - Tailwind CSS
---

Virtual Office UMKM brings the "office" experience to micro-businesses that run from
a WhatsApp personal chat: a saleable storefront, a tidy folder for business documents,
and a lightweight customer follow-up board.

## What's inside

- **Multi-tenant by design**: every tenant gets isolated data rows keyed to its own
  workspace — the same isolation discipline that makes it easy to reason about
  security boundaries.
- **Order flow** from catalog → cart → confirmation, tuned for the small-business
  reality of "chat with me first".
- **Document store** with signed URLs and strict per-tenant access — no accidental
  cross-workspace leaks in tests or in prod.

## Notes that carry over

Building this is where I hardened my opinions on authorization (always verify
ownership server-side, never trust the client's workspace id) and on migrations —
`prisma migrate` in CI with an explicit `lock` to keep deployment races honest.
