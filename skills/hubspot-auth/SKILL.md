---
strata_id: 013e0e4c-0405-4616-8498-17ea366c116b
type: note
created: 2026-05-03T18:41:21+00:00
modified: 2026-05-03T18:41:21.040906177+00:00
description: HubSpot authentication — Private App tokens, OAuth 2.0 flows, scopes, and token lifecycle management.
metadata:
  docs:
  - https://developers.hubspot.com/docs/api/private-apps
  - https://developers.hubspot.com/docs/api/working-with-oauth
  importPatterns:
  - '@hubspot/api-client'
  pathPatterns:
  - '*.hubspot.*'
  - hubspot/**
  - '**/.env*'
  priority: 8
  promptSignals:
    phrases:
    - hubspot auth
    - private app
    - hubspot oauth
    - hubspot token
    - hubspot api key
    - hubspot access token
    - hubspot scopes
name: hubspot-auth
---

## What It Is & When to Use It

HubSpot authentication governs how your integration proves identity to the HubSpot API. There are two current methods: **Private Apps** (recommended for single-account integrations) and **OAuth 2.0** (required for multi-account or marketplace apps). API Keys are fully deprecated and being sunset — migrate immediately.

Use this skill when setting up a new HubSpot integration, configuring scopes, handling token refresh, or debugging 401/403 errors.

---

## Service Surface

| Method | Token Type | Expiry | Use Case |
|--------|-----------|--------|----------|
| Private App | Access token (static) | Never (until revoked) | Internal tools, single account |
| OAuth 2.0 | Access token + refresh token | 6 hours (access) | Multi-account, marketplace |
| API Key | API key string | Deprecated / sunset | Legacy only — migrate now |

**Rate limits:** Same for Private App and OAuth — 100 req/10s burst, 500k/day.

**Required scopes** must be declared when creating a Private App or OAuth app. The API returns 403 if a scope is missing.

Common scope groups:
| Scope | Grants Access To |
|-------|----------------|
| `crm.objects.contacts.read` | Read contact records |
| `crm.objects.contacts.write` | Create/update contacts |
| `crm.objects.companies.read` | Read company records |
| `crm.objects.companies.write` | Create/update companies |
| `crm.objects.deals.read` | Read deal records |
| `crm.objects.deals.write` | Create/update deals |
| `crm.schemas.contacts.read` | Read contact property schemas |
| `automation` | Manage workflows |
| `webhooks` | Manage webhook subscriptions |

---

## Mental Model

**Private App = a service account.** It has exactly one set of scopes and one access token. It acts on behalf of the HubSpot portal it was created in. No expiry — revoke it to disable access.

**OAuth 2.0 = a user-authorized delegation.** A HubSpot account owner grants your app permission to act on their account. The access token expires every 6 hours; your app must refresh it using the refresh token.

**Scopes are additive and minimal.** Request only what you need. Requesting unnecessary scopes reduces the chance of approval for marketplace submissions and is a security risk.

**Token storage.** For Private Apps, a single env var (`HUBSPOT_ACCESS_TOKEN`) is sufficient. For OAuth, you must persist the `access_token`, `refresh_token`, and `expires_at` per connected account in your database.

**The `hubspotClient` instance is stateless.** You can instantiate it per-request or once at startup. For OAuth, pass the access token dynamically, not at startup.

---

## Common Patterns

### Pattern 1: Private App setup

```typescript
import { Client } from "@hubspot/api-client";

// Create client with access token from environment
const hubspotClient = new Client({
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
});

// Verify connection
async function verifyConnection() {
  const response = await hubspotClient.crm.contacts.basicApi.getPage(
    1, undefined, undefined, undefined, undefined, false
  );
  console.log("Connected — contact count:", response.total);
}
```

### Pattern 2: OAuth 2.0 authorization flow

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({
  clientId: process.env.HUBSPOT_CLIENT_ID,
  clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
  redirectUri: process.env.HUBSPOT_REDIRECT_URI,
  scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"],
});

// Step 1: Generate the authorization URL
function getAuthorizationUrl() {
  return hubspotClient.oauth.getAuthorizationUrl(
    process.env.HUBSPOT_CLIENT_ID!,
    process.env.HUBSPOT_REDIRECT_URI!,
    "crm.objects.contacts.read crm.objects.contacts.write"
  );
}

// Step 2: Exchange code for tokens after redirect
async function exchangeCodeForTokens(code: string) {
  const tokenResponse = await hubspotClient.oauth.tokensApi.create(
    "authorization_code",
    code,
    process.env.HUBSPOT_REDIRECT_URI,
    process.env.HUBSPOT_CLIENT_ID,
    process.env.HUBSPOT_CLIENT_SECRET
  );

  return {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
    expiresAt: Date.now() + tokenResponse.expiresIn * 1000,
  };
}

// Step 3: Create a client for a specific account
function getClientForAccount(accessToken: string) {
  return new Client({ accessToken });
}
```

### Pattern 3: Token refresh for OAuth

```typescript
interface TokenStore {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

async function getValidAccessToken(store: TokenStore): Promise<string> {
  // Refresh 5 minutes before expiry
  if (Date.now() > store.expiresAt - 5 * 60 * 1000) {
    const refreshClient = new Client({
      clientId: process.env.HUBSPOT_CLIENT_ID,
      clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
    });

    const tokenResponse = await refreshClient.oauth.tokensApi.create(
      "refresh_token",
      undefined,
      undefined,
      process.env.HUBSPOT_CLIENT_ID,
      process.env.HUBSPOT_CLIENT_SECRET,
      store.refreshToken
    );

    // Persist these values to your database
    store.accessToken = tokenResponse.accessToken;
    store.refreshToken = tokenResponse.refreshToken;
    store.expiresAt = Date.now() + tokenResponse.expiresIn * 1000;
  }

  return store.accessToken;
}
```

### Pattern 4: Middleware for token refresh (Express)

```typescript
import { Request, Response, NextFunction } from "express";
import { Client } from "@hubspot/api-client";

async function hubspotMiddleware(req: Request, res: Response, next: NextFunction) {
  const accountId = req.user?.hubspotAccountId;
  if (!accountId) return next();

  const tokenStore = await db.getTokenStore(accountId);
  const accessToken = await getValidAccessToken(tokenStore);

  req.hubspotClient = new Client({ accessToken });
  next();
}
```

---

## Gotchas

**API Keys are deprecated and being removed.** HubSpot announced API Key sunset. Any code using `hapikey=` query param auth is running on borrowed time. Migrate to Private Apps.

**Scopes must match exactly.** If you request `crm.objects.contacts.read` but try to write, you get a 403. The error message from HubSpot will name the missing scope — read it carefully.

**OAuth refresh tokens can expire.** Refresh tokens are revoked if unused for 30+ days, if the user disconnects the app, or if the app's scopes change. Always handle `invalid_grant` errors in your refresh flow by re-initiating the OAuth authorization.

**Private App tokens appear in HubSpot's audit log.** Every API call is logged. If your Private App token is leaked, revoke it immediately from the HubSpot portal settings.

**The `hubspotClient` is not thread-safe for token mutation.** For OAuth flows where you update the token mid-request, create a new `Client` instance per request rather than mutating a shared client.

**Scope names changed over time.** Older docs reference scopes like `contacts` (legacy). Current scopes use the format `crm.objects.contacts.read`. If testing against the API and getting unexpected 403s, verify scopes in the Private App settings UI.

**Max 20 Private Apps per portal.** This limit catches teams that create a new app for every developer. Use shared apps with appropriate scopes instead.

---

## Official Documentation

- Private Apps: https://developers.hubspot.com/docs/api/private-apps
- OAuth 2.0 Guide: https://developers.hubspot.com/docs/api/working-with-oauth
- OAuth Scopes Reference: https://developers.hubspot.com/docs/api/oauth/scopes
- API Key Deprecation Notice: https://developers.hubspot.com/docs/api/migrating-api-keys-to-private-apps
- Node.js SDK Auth: https://github.com/HubSpot/hubspot-api-nodejs#oauth