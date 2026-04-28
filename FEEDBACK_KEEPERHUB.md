# KeeperHub — Builder Feedback

> WalletYeet, ETHGlobal Open Agents 2026. Submitted for the KeeperHub Builder Feedback Bounty.

## Context

WalletYeet is an AI-orchestrated wallet migration tool built solo for ETHGlobal Open Agents. Three AI agents (Scout, Auditor, Planner) discover assets, score risks, and plan multi-destination wallet migrations to a `MigrationVault` contract on Sepolia. This document captures the KeeperHub integration experience candidly.

---

## Friction points encountered

### 1. Hard to find the API-key creation flow

For any developer landing on `docs.keeperhub.com`, an API key is the **#1 thing they need** — without it, no other piece of the integration is possible. There is currently no clear "Get an API key" pointer anywhere on the docs landing page.

The actual path requires four steps that aren't signposted from the docs:

1. Sign up at `app.keeperhub.com`
2. Find **Settings** in the dashboard
3. Open **API Keys**
4. **Switch to the Organisation tab** — easy to miss. The default tab gives `wfb_` keys (webhook-scoped); most builders actually need `kh_` keys (programmatic, organization-scoped).

The `kh_` vs `wfb_` auth-scope distinction is documented well *once you find the relevant docs page*, but landing on the docs cold there's no signposting toward "here's how to authenticate first."

**Suggestion.** Put a prominent "**Get your API key**" call-to-action on the docs landing page, with a short screenshot sequence or animation showing exactly where in the dashboard to click. Even better: expose API-key creation directly from the docs via OAuth so a builder is unblocked in 30 seconds rather than 5 minutes of clicking around.

For comparison: Alchemy, Anthropic, OpenAI, and Vercel all surface "get a key" as the very first action on their developer-docs landing pages. KeeperHub's docs currently lean toward concept exposition (workflows, executions, integrations) — both should be visible, but "get unblocked first" should win the fold.

### 2. Broken hyperlink in Getting Started

On `https://docs.keeperhub.com/#getting-started`, point 1 references `app.keeperhub.com` as plain text. For a Getting Started page where every cross-reference is somewhere the reader will act on next, every URL should be one click away. Tiny papercut, easy fix.

---

*Submitted by Sonalika Sahoo for the KeeperHub Builder Feedback Bounty, ETHGlobal Open Agents Hackathon, April–May 2026.*
