---
strata_id: 8e7f3b1b-86da-479b-bcd7-818610a9c0da
type: note
created: 2026-05-03T18:44:46+00:00
modified: 2026-05-03T18:44:46.734810111+00:00
metadata:
  docs:
  - https://developers.hubspot.com/docs/api/webhooks
  importPatterns:
  - '@hubspot/api-client'
  pathPatterns:
  - '**/webhooks/**'
  - '**/webhook*'
  priority: 6
  promptSignals:
    phrases:
    - hubspot webhook
    - webhook subscription
    - hubspot event
    - webhook verification
    - hubspot notification
    - crm webhook
    - webhook payload
description: HubSpot Webhooks — subscription types, payload format, signature verification (v1 and v3), retry policy, and rate limits.
name: webhooks
---

## What It Is & When to Use It

HubSpot Webhooks push real-time notifications to your endpoint when CRM objects are created, updated, or deleted. Unlike polling, webhooks eliminate the need to constantly query the API for changes. They're essential for keeping an external system in sync with HubSpot data.

Use this skill when building a webhook receiver, subscribing to CRM events, implementing payload verification, handling retry logic, or debugging webhook delivery failures.

---

## Service Surface

**Webhook management** (configure subscriptions):

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List subscriptions | `/webhooks/v3/{appId}/subscriptions` | GET |
| Create subscription | `/webhooks/v3/{appId}/subscriptions` | POST |
| Get subscription | `/webhooks/v3/{appId}/subscriptions/{subscriptionId}` | GET |
| Update subscription | `/webhooks/v3/{appId}/subscriptions/{subscriptionId}` | PATCH |
| Delete subscription | `/webhooks/v3/{appId}/subscriptions/{subscriptionId}` | DELETE |
| Batch update | `/webhooks/v3/{appId}/subscriptions/batch/update` | POST |
| Get settings | `/webhooks/v3/{appId}/settings` | GET |
| Update settings | `/webhooks/v3/{appId}/settings` | PUT |

**Note:** Webhook subscriptions are configured at the **app level** (using your App ID and developer API key), not at the portal level. The target URL is set in app settings.

**Subscription types:**

| Event Type Pattern | Fires When |
|-------------------|-----------|
| `contact.creation` | A contact is created |
| `contact.deletion` | A contact is deleted/archived |
| `contact.privacyDeletion` | GDPR deletion requested |
| `contact.propertyChange` | A specific contact property changes |
| `company.creation` | A company is created |
| `company.deletion` | A company is deleted |
| `company.propertyChange` | A company property changes |
| `deal.creation` | A deal is created |
| `deal.deletion` | A deal is deleted |
| `deal.propertyChange` | A deal property changes |
| `ticket.creation` | A ticket is created |
| `ticket.deletion` | A ticket is deleted |
| `ticket.propertyChange` | A ticket property changes |
| `product.creation` | A product is created |
| `contact.merge` | Two contacts are merged |

**Retry policy:** HubSpot retries failed deliveries (non-2xx responses, timeouts) up to 10 times over 24 hours using exponential backoff.

**Rate limit on delivery:** HubSpot batches events and delivers up to 100 events per request to your endpoint. Your endpoint must handle batch payloads.

---

## Mental Model

**Webhooks deliver arrays of events.** Each request body is an array of event objects, even if only one event occurred. Always process the full array.

**Events can arrive out of order.** HubSpot makes no ordering guarantees. Use the `occurredAt` timestamp on each event to determine the actual sequence, not arrival order.

**Events can arrive duplicated.** HubSpot has at-least-once delivery semantics. Track processed event IDs (using `eventId`) and deduplicate in your handler.

**Verification is mandatory for security.** HubSpot signs webhook payloads. Always verify the signature before processing. Use v3 signatures (timestamp-based) for new integrations.

**The payload contains minimal data.** Webhook events include the object ID and changed property value, not the full contact/deal record. If you need more properties, fetch the full record from the API after receiving the event.

**Property change events only fire for subscribed properties.** When creating a `propertyChange` subscription, you specify which property to watch. You need one subscription per property you want to track.

---

## Common Patterns

### Pattern 1: Create a webhook subscription

```typescript
import { Client } from "@hubspot/api-client";
import axios from "axios"; // The SDK wraps the webhooks API differently

// Webhook management uses developer API key, not private app token
const hubspotClient = new Client({ developerApiKey: process.env.HUBSPOT_DEVELOPER_API_KEY });

async function createContactCreationSubscription(appId: number, targetUrl: string) {
  const response = await hubspotClient.webhooks.subscriptionsApi.create(appId, {
    eventType: "contact.creation",
    active: true,
  });

  console.log("Subscription created:", response.id);
  return response.id;
}

async function createDealStageChangeSubscription(appId: number) {
  // Subscribe to deal stage changes
  const response = await hubspotClient.webhooks.subscriptionsApi.create(appId, {
    eventType: "deal.propertyChange",
    propertyName: "dealstage", // required for propertyChange events
    active: true,
  });

  return response.id;
}
```

### Pattern 2: Webhook receiver with v3 signature verification

```typescript
import { createHmac } from "crypto";
import { Request, Response } from "express";

const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET!;

interface HubSpotWebhookEvent {
  eventId: number;
  subscriptionId: number;
  portalId: number;
  appId: number;
  occurredAt: number;
  subscriptionType: string;
  attemptNumber: number;
  objectId: number;
  changeSource: string;
  propertyName?: string;
  propertyValue?: string;
}

function verifyWebhookV3(
  rawBody: string,
  signature: string,
  timestamp: string,
  requestUri: string,
  method: string
): boolean {
  // v3 signature: HMAC-SHA256 of clientSecret + method + requestUri + rawBody + timestamp
  const source = `${HUBSPOT_CLIENT_SECRET}${method}${requestUri}${rawBody}${timestamp}`;
  const expected = createHmac("sha256", HUBSPOT_CLIENT_SECRET)
    .update(source)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;

  let match = 0;
  for (let i = 0; i < expected.length; i++) {
    match |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return match === 0;
}

export async function webhookHandler(req: Request, res: Response) {
  // Respond quickly — HubSpot considers >3s a failure
  res.status(200).send("OK");

  const signature = req.headers["x-hubspot-signature-v3"] as string;
  const timestamp = req.headers["x-hubspot-request-timestamp"] as string;

  if (!signature || !timestamp) {
    console.error("Missing webhook signature headers");
    return;
  }

  // Reject requests older than 5 minutes (replay attack protection)
  const age = Date.now() - parseInt(timestamp, 10);
  if (age > 5 * 60 * 1000) {
    console.error("Webhook timestamp too old:", age, "ms");
    return;
  }

  const rawBody = JSON.stringify(req.body); // use raw body string
  const requestUri = `https://your-domain.com${req.originalUrl}`;

  if (!verifyWebhookV3(rawBody, signature, timestamp, requestUri, "POST")) {
    console.error("Webhook signature verification failed");
    return;
  }

  const events: HubSpotWebhookEvent[] = req.body;

  for (const event of events) {
    await processEvent(event);
  }
}

async function processEvent(event: HubSpotWebhookEvent) {
  console.log(`Processing event ${event.eventId}: ${event.subscriptionType} for object ${event.objectId}`);

  switch (event.subscriptionType) {
    case "contact.creation":
      await handleContactCreated(event.objectId);
      break;
    case "deal.propertyChange":
      if (event.propertyName === "dealstage") {
        await handleDealStageChange(event.objectId, event.propertyValue!);
      }
      break;
    case "contact.deletion":
      await handleContactDeleted(event.objectId);
      break;
  }
}

async function handleContactCreated(contactId: number) {
  // Fetch full contact data from the API
  const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });
  const contact = await hubspotClient.crm.contacts.basicApi.getById(
    String(contactId),
    ["email", "firstname", "lastname"]
  );
  // ... sync to your system
}
```

### Pattern 3: Idempotent event processing with deduplication

```typescript
const processedEventIds = new Set<number>(); // Use Redis in production

async function processEventIdempotently(event: HubSpotWebhookEvent) {
  if (processedEventIds.has(event.eventId)) {
    console.log(`Skipping duplicate event ${event.eventId}`);
    return;
  }

  processedEventIds.add(event.eventId);

  // Process the event...
  await processEvent(event);
}
```

### Pattern 4: v1 signature verification (legacy)

```typescript
import { createHash } from "crypto";

function verifyWebhookV1(rawBody: string, signature: string): boolean {
  // v1: SHA256 of clientSecret + rawBody (no timestamp)
  const source = HUBSPOT_CLIENT_SECRET + rawBody;
  const expected = createHash("sha256").update(source).digest("hex");
  return expected === signature;
  // Header: X-HubSpot-Signature
}
```

---

## Gotchas

**Respond with 2xx immediately, process asynchronously.** Your endpoint has 3 seconds to respond. If it takes longer, HubSpot considers it a failure and retries. Respond immediately with 200, then process the event asynchronously (push to a queue, background job, etc.).

**Events contain the changed value at delivery time, not at the time of the change.** For `propertyChange` events, `propertyValue` is the value when the webhook was delivered, which may differ from the value at `occurredAt` if the property was subsequently changed before delivery.

**Webhook subscriptions are app-level, not portal-level.** You configure them once per app. All portals that install your OAuth app receive webhooks. The `portalId` field in the event tells you which portal it came from.

**The target URL is configured in app settings, not per-subscription.** All subscriptions for an app deliver to the same URL. You cannot have different endpoints per subscription type — route internally based on `subscriptionType`.

**Use raw body for signature verification.** If your web framework parses the body before your verification code runs, the parsed-then-stringified body may not match the original. Use `express.raw()` or capture the raw body before JSON parsing.

**v3 signatures include timestamp in the hash.** v1 does not — it's vulnerable to replay attacks. Always use v3 for new implementations and validate the timestamp is recent (< 5 minutes).

**Delivery rate is limited.** During high-volume periods (bulk imports, mass updates), HubSpot may batch and throttle delivery. Don't assume real-time delivery during bulk operations.

---

## Official Documentation

- Webhooks Overview: https://developers.hubspot.com/docs/api/webhooks
- Webhook Signature Verification: https://developers.hubspot.com/docs/api/webhooks#security
- Subscription Types Reference: https://developers.hubspot.com/docs/api/webhooks#event-types
- Setting Up Webhooks: https://developers.hubspot.com/docs/api/webhooks#configure-your-webhook-settings