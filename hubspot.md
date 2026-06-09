---
strata_id: 19a76e9a-6096-430e-a951-2843792ead31
type: note
created: 2026-05-03T18:40:42+00:00
modified: 2026-05-03T18:40:42.502390987+00:00
---

# HubSpot Platform — Knowledge Graph

> Injected by hubspot-context-pack on session start. Provides orientation, decision matrices, and architecture patterns for the HubSpot platform.

---

## Platform Overview

HubSpot is a unified CRM platform organized into five Hubs:

| Hub | Purpose | Key Objects |
|-----|---------|-------------|
| **CRM** | Core data layer shared by all hubs | Contacts, Companies, Deals, Tickets, Custom Objects |
| **Marketing Hub** | Campaigns, email, ads, forms, workflows | Contacts, Lists, Forms, Campaigns |
| **Sales Hub** | Pipeline management, sequences, meetings | Deals, Tasks, Meetings, Sequences |
| **Service Hub** | Customer support and ticketing | Tickets, Feedback Surveys, Knowledge Base |
| **Operations Hub** | Data sync, automation, custom code | Workflows, Data Quality, Programmable Automation |
| **CMS Hub** | Website and landing page management | Pages, Blog Posts, HubDB, Modules |

All hubs share the same CRM data layer. Objects created in one hub are immediately visible in others.

---

## API Architecture

### REST API v3
The primary API surface. All modern endpoints live under `https://api.hubapi.com/crm/v3/`.

**Key design patterns:**
- Resource-based URLs: `/crm/v3/objects/{objectType}/{objectId}`
- Standard HTTP verbs: GET, POST, PATCH, DELETE
- Cursor-based pagination via `after` parameter
- Batch endpoints for bulk operations: `/crm/v3/objects/{objectType}/batch/`
- Search via POST: `/crm/v3/objects/{objectType}/search`

### Rate Limits (as of 2024)
| Auth Method | Burst Limit | Daily Limit |
|------------|------------|-------------|
| Private App | 100 req / 10 seconds | 500,000 req/day |
| OAuth 2.0 | 100 req / 10 seconds | 500,000 req/day |
| API Key (deprecated) | 100 req / 10 seconds | 250,000 req/day |

Rate limit headers returned on every response:
- `X-HubSpot-RateLimit-Daily-Remaining`
- `X-HubSpot-RateLimit-Secondly-Remaining`

On 429, retry after the `Retry-After` header value (seconds).

### Pagination
All list endpoints use cursor-based pagination:
```
GET /crm/v3/objects/contacts?limit=100&after=<cursor>
```
Response includes `paging.next.after` when more results exist. Default page size is 10; max is 100.

### Batch Operations
Batch endpoints reduce API calls dramatically. Use them for bulk reads and writes:
- `POST /crm/v3/objects/{type}/batch/read` — up to 100 objects by ID
- `POST /crm/v3/objects/{type}/batch/create` — up to 100 creates
- `POST /crm/v3/objects/{type}/batch/update` — up to 100 updates
- `POST /crm/v3/objects/{type}/batch/upsert` — up to 100 upserts (requires unique property)

---

## Authentication

### Private Apps (Recommended)
Simple access token auth. Use for server-side integrations where you control the HubSpot account.

```
Authorization: Bearer <access-token>
```

- Tokens do not expire (until revoked)
- Scopes are configured at creation time in the HubSpot developer dashboard
- Max 20 private apps per HubSpot account
- **Best for:** Internal tools, backend integrations, data sync

### OAuth 2.0
For marketplace apps or multi-tenant integrations where you're acting on behalf of different HubSpot accounts.

- Access tokens expire after 6 hours
- Refresh tokens are long-lived (do not expire unless unused for 30+ days)
- Requires `client_id`, `client_secret`, and redirect URI
- **Best for:** Marketplace apps, SaaS products integrating with customer HubSpot accounts

### API Keys (Deprecated — Sunset)
Legacy authentication. HubSpot deprecated API keys and they will be fully removed. Migrate to Private Apps.

**Decision Matrix:**

| Scenario | Auth Method |
|----------|-------------|
| Your own HubSpot account, server-side | Private App |
| Acting on behalf of customers' accounts | OAuth 2.0 |
| Marketplace app listing | OAuth 2.0 (required) |
| Legacy integrations (migrate ASAP) | API Key → Private App |

---

## Object Model

### Standard Objects
All standard objects share the same CRUD API pattern under `/crm/v3/objects/{type}`:

| Object Type | URL Slug | Key Default Properties |
|------------|----------|----------------------|
| Contacts | `contacts` | `firstname`, `lastname`, `email`, `phone` |
| Companies | `companies` | `name`, `domain`, `industry`, `city` |
| Deals | `deals` | `dealname`, `amount`, `closedate`, `dealstage` |
| Tickets | `tickets` | `subject`, `content`, `hs_pipeline`, `hs_ticket_priority` |
| Line Items | `line_items` | `name`, `quantity`, `price`, `hs_product_id` |
| Products | `products` | `name`, `price`, `description` |
| Quotes | `quotes` | `hs_title`, `hs_expiration_date`, `hs_status` |
| Calls | `calls` | `hs_call_title`, `hs_call_duration`, `hs_call_status` |
| Meetings | `meetings` | `hs_meeting_title`, `hs_meeting_start_time` |
| Tasks | `tasks` | `hs_task_subject`, `hs_task_status`, `hs_task_priority` |

### Custom Objects
Define your own object types with custom properties and associations. Requires Operations Hub Professional or Enterprise.

```
POST /crm/v3/schemas
```

Custom object type names are prefixed with `p_` internally but accessed via their defined `name` in the schema.

### Properties
Every object has a set of built-in properties plus account-specific custom properties.

- **Internal name** is used in API calls (e.g., `firstname`, not "First Name")
- **Property groups** organize related properties in the UI
- **Field types:** `string`, `number`, `date`, `datetime`, `enumeration`, `bool`, `phone_number`
- **Enumeration properties** require pre-defined options (via Properties API or UI)

### Associations
Objects are linked via associations. All association operations use `/crm/v4/associations/`.

Association type IDs for standard pairs:
| From | To | Association Type ID |
|------|----|-------------------|
| Contact | Company | 279 (contact_to_company) |
| Contact | Deal | 4 (contact_to_deal) |
| Company | Deal | 342 (company_to_deal) |
| Deal | Contact | 3 (deal_to_contact) |
| Ticket | Contact | 16 (ticket_to_contact) |

Custom association labels can be created via the Associations API.

---

## Core API Patterns

### Search with Filters
```
POST /crm/v3/objects/{type}/search
{
  "filterGroups": [{
    "filters": [{
      "propertyName": "email",
      "operator": "EQ",
      "value": "user@example.com"
    }]
  }],
  "properties": ["firstname", "lastname", "email"],
  "limit": 10
}
```

Filter operators: `EQ`, `NEQ`, `LT`, `LTE`, `GT`, `GTE`, `BETWEEN`, `IN`, `NOT_IN`, `HAS_PROPERTY`, `NOT_HAS_PROPERTY`, `CONTAINS_TOKEN`, `NOT_CONTAINS_TOKEN`

Multiple `filterGroups` are OR'd together. Filters within a group are AND'd.

### CRUD
```
GET    /crm/v3/objects/{type}/{id}?properties=email,firstname
POST   /crm/v3/objects/{type}              { "properties": {...} }
PATCH  /crm/v3/objects/{type}/{id}         { "properties": {...} }
DELETE /crm/v3/objects/{type}/{id}
```

---

## SDK: @hubspot/api-client

Node.js SDK wrapping the REST API. Install: `npm install @hubspot/api-client`

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

// Contacts
const contact = await hubspotClient.crm.contacts.basicApi.getById("123", ["email", "firstname"]);

// Search
const results = await hubspotClient.crm.contacts.searchApi.doSearch({
  filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: "x@y.com" }] }],
  properties: ["firstname", "email"],
  limit: 10,
  after: 0,
  sorts: [],
  query: ""
});
```

The SDK mirrors the API structure: `hubspotClient.crm.{objectType}.{apiGroup}.{method}`.

---

## Webhooks

HubSpot can push events to your endpoint when CRM data changes.

**Subscription types:** `contact.creation`, `contact.deletion`, `contact.propertyChange`, `company.creation`, `deal.stageChange`, etc.

**Verification:** Every webhook delivery includes `X-HubSpot-Signature-v3` header. Verify using HMAC-SHA256 of `clientSecret + httpMethod + requestUri + requestBody + timestamp`.

**Retry policy:** HubSpot retries failed deliveries (non-2xx) up to 10 times over 24 hours with exponential backoff.

---

## CRM Extensions

**Custom Cards** — Add UI cards to CRM object records using the CRM Extensions API. Cards fetch data from your server on demand.

**UI Extensions** — React-based extensions for deeper UI customization (requires Operations Hub).

**Custom Actions** — Workflow actions powered by your API (available to all accounts once configured).

---

## Decision Matrices

### Custom Object vs Standard Object
| Use Custom Object When | Use Standard Object When |
|-----------------------|-------------------------|
| Data doesn't map to any standard type | Data is contacts, companies, deals, tickets |
| You need custom associations between non-standard types | You want native Marketing/Sales Hub features |
| Requires Operations Hub Pro/Enterprise | Any Hub tier |
| Building product catalog beyond Line Items | CRM core workflow is sufficient |

### REST API vs GraphQL (HubL)
| REST API | HubL/GraphQL |
|----------|-------------|
| All CRM operations (CRUD, search, batch) | CMS page templates and modules |
| Webhooks, workflows, extensions | Dynamic content on HubSpot-hosted pages |
| Server-side and external integrations | In-portal CMS development only |

### Private App vs OAuth
| Private App | OAuth 2.0 |
|-------------|----------|
| Single HubSpot account | Multiple customer accounts |
| Internal tooling | Marketplace or SaaS product |
| Simpler setup, no expiry | Requires token refresh logic |
| Not publishable to marketplace | Required for marketplace listing |

---

## Rate Limit Strategies

1. **Use batch endpoints first.** A single batch/read of 100 objects costs 1 API call vs. 100.
2. **Cache aggressively.** Properties and schemas rarely change — cache for hours.
3. **Respect Retry-After.** On 429, parse the header and sleep exactly that long.
4. **Fan-out with queues.** For bulk syncs, queue work and process at ~80 req/10s to stay under the burst limit with headroom.
5. **Daily limit awareness.** 500k/day = ~5.8 req/sec average. Sustained bursts will hit the daily cap before you expect.

---

## Error Handling Patterns

```typescript
try {
  const result = await hubspotClient.crm.contacts.basicApi.getById(id);
} catch (err) {
  if (err.code === 429) {
    const retryAfter = parseInt(err.headers?.["retry-after"] || "10", 10);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    // retry
  } else if (err.code === 404) {
    // Object not found — handle gracefully
  } else {
    throw err;
  }
}
```

Common error codes:
- `400` — Bad request (malformed payload, invalid property name)
- `401` — Unauthorized (bad or revoked token)
- `403` — Forbidden (missing scope)
- `404` — Object not found
- `409` — Conflict (duplicate unique property value)
- `429` — Rate limit exceeded
- `500` / `502` — HubSpot server error (retry with backoff)

---

## Official Documentation

- API Overview: https://developers.hubspot.com/docs/api/overview
- CRM Objects: https://developers.hubspot.com/docs/api/crm/crm-objects
- Authentication: https://developers.hubspot.com/docs/api/private-apps
- OAuth 2.0: https://developers.hubspot.com/docs/api/working-with-oauth
- Associations v4: https://developers.hubspot.com/docs/api/crm/associations
- Webhooks: https://developers.hubspot.com/docs/api/webhooks
- Custom Objects: https://developers.hubspot.com/docs/api/crm/crm-custom-objects
- Node.js SDK: https://github.com/HubSpot/hubspot-api-nodejs
- Rate Limits: https://developers.hubspot.com/docs/api/usage-details
- Changelog: https://developers.hubspot.com/changelog