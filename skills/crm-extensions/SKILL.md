---
name: crm-extensions
description: HubSpot CRM Extensions — custom cards, UI extensions, custom actions, timeline events, calling. Use when building custom UI within the HubSpot CRM interface.
metadata:
  priority: 4
  docs:
    - "https://developers.hubspot.com/docs/api/crm/extensions"
  pathPatterns:
    - '**/extensions/**'
    - '**/cards/**'
    - '**/ui-extensions/**'
    - 'app.json'
  bashPatterns:
    - '\bhs\s+project\b'
  importPatterns:
    - "@hubspot/ui-extensions"
    - "@hubspot/api-client"
  promptSignals:
    phrases:
      - "crm extension"
      - "custom card"
      - "ui extension"
      - "hubspot card"
      - "timeline event"
      - "calling extension"
      - "crm sidebar"
---

## What It Is & When to Use It

CRM Extensions let you embed custom UI directly into HubSpot's CRM record pages — contact sidebars, deal panels, ticket views, and more. There are two distinct systems, both called "CRM Extensions":

1. **CRM Cards (v2)** — Server-driven cards. HubSpot fetches data from your endpoint when a user opens a record and renders it in a card UI. No React required. Available for all app types.

2. **UI Extensions (Projects)** — React-based custom UI running in an iframe within HubSpot. Built with `@hubspot/ui-extensions` React components. Only available in HubSpot Projects (the newer developer platform, local dev via `hs project`).

Additionally, two related extension systems:
- **Timeline Events** — Append custom events to the CRM record activity timeline (calls logged, status changes, anything you want visible in the record history).
- **Calling Extensions** — Integrate a third-party calling provider so agents can make calls from within HubSpot records.

Use this skill when building anything that renders inside the HubSpot CRM UI, not just reading/writing data via API.

---

## Service Surface

### CRM Cards (v2) — Server-Driven

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Create card definition | `/crm/v3/extensions/cards` | POST |
| List card definitions | `/crm/v3/extensions/cards` | GET |
| Get card definition | `/crm/v3/extensions/cards/{cardId}` | GET |
| Update card definition | `/crm/v3/extensions/cards/{cardId}` | PATCH |
| Delete card definition | `/crm/v3/extensions/cards/{cardId}` | DELETE |

**Required scopes:** `crm.extensions.cards.read`, `crm.extensions.cards.write`

Your app must also expose a publicly reachable HTTPS endpoint that HubSpot calls to fetch card data.

### Timeline Events

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Create event type | `/crm/v3/timeline/{appId}/event-templates` | POST |
| List event types | `/crm/v3/timeline/{appId}/event-templates` | GET |
| Update event type | `/crm/v3/timeline/{appId}/event-templates/{eventTemplateId}` | PUT |
| Delete event type | `/crm/v3/timeline/{appId}/event-templates/{eventTemplateId}` | DELETE |
| Create event | `/crm/v3/timeline/events` | POST |
| Create events batch | `/crm/v3/timeline/events/batch/create` | POST |
| Get event | `/crm/v3/timeline/events/{eventTemplateId}/{eventId}` | GET |

**Required scopes:** `timeline`

### Calling Extensions

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Register calling app | `/crm/v3/extensions/calling/{appId}/settings` | POST |
| Get calling settings | `/crm/v3/extensions/calling/{appId}/settings` | GET |
| Update calling settings | `/crm/v3/extensions/calling/{appId}/settings` | PATCH |
| Delete calling settings | `/crm/v3/extensions/calling/{appId}/settings` | DELETE |

**Required scopes:** `crm.objects.contacts.read`, `crm.objects.contacts.write` (for logging calls)

---

## Mental Model

### CRM Cards: Two Generations

**CRM Cards v1 (deprecated, pre-2022):** Configured via `crm-card` settings in the app developer dashboard. Limited data types, no custom actions.

**CRM Cards v2 (current):** Registered via API (`/crm/v3/extensions/cards`). Rich data types, custom actions (buttons that trigger your endpoint), and support for multiple card types. Use v2 for all new development.

**How v2 cards work at runtime:** When a HubSpot user opens a CRM record, HubSpot calls your configured `targetUrl` endpoint with query params identifying the record (`associatedObjectId`, `associatedObjectType`, `portalId`, `userId`). Your server fetches whatever data it needs and returns JSON conforming to the card data schema. HubSpot renders this data in the sidebar. The user never sees your server — only the rendered output.

### UI Extensions: A Different System

UI Extensions are **React components** that run inside HubSpot's interface, built with the `@hubspot/ui-extensions` SDK. They use HubSpot-defined components (`hubspot.extend()`, `<Text>`, `<Button>`, `<Table>`) — not arbitrary HTML/CSS. The SDK handles communication between your React component and the HubSpot host environment via message passing.

UI Extensions are **only available in HubSpot Projects** — the `hs project` developer workflow. You cannot deploy a UI Extension from a classic (OAuth app) configuration. Projects have their own local dev server (`hs project dev`), build system, and deployment pipeline separate from classic app publishing.

### Timeline Events: Your Custom Activity Feed

Timeline events let you write to the CRM record's activity timeline — the chronological log of interactions. Each event type is a template with configurable tokens (variables) and a Markdown-capable body template. Events are immutable once created: you cannot update or delete individual event instances (only the template definition).

### Calling Extensions: Phone Calls Inside HubSpot

Calling Extensions register your calling app (e.g., a VoIP provider) as an option in HubSpot's "Call" button. When a user initiates a call, your iframe opens inside HubSpot's calling widget. After the call, your app logs the outcome back to HubSpot. The extension integrates with HubSpot's call logging and recording infrastructure.

---

## Common Patterns

### Pattern 1: Register a CRM Card (v2)

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

async function registerCrmCard(appId: number) {
  const card = await hubspotClient.crm.extensions.cards.cardsApi.create(appId, {
    title: "Order History",
    fetch: {
      targetUrl: "https://your-app.example.com/hubspot/card-data",
      objectTypes: [
        {
          name: "contacts",
          propertiesToSend: ["email", "firstname", "lastname"],
        },
      ],
    },
    display: {
      properties: [
        {
          name: "order_count",
          label: "Total Orders",
          dataType: "NUMBER",
        },
        {
          name: "last_order_date",
          label: "Last Order",
          dataType: "DATE",
        },
        {
          name: "lifetime_value",
          label: "Lifetime Value",
          dataType: "CURRENCY",
          currencyPropertyName: "currency_code",
        },
      ],
    },
    actions: {
      baseUrls: ["https://your-app.example.com"],
    },
  });

  console.log("Card registered:", card.id);
  return card;
}
```

### Pattern 2: Handle the CRM Card data fetch request (Express)

```typescript
import express from "express";
import crypto from "crypto";

const app = express();

// HubSpot calls this URL when the user opens a CRM record
app.get("/hubspot/card-data", async (req, res) => {
  const {
    associatedObjectId,  // The CRM record ID (e.g., contact ID)
    associatedObjectType, // "CONTACT", "COMPANY", etc.
    portalId,
    userId,
  } = req.query as Record<string, string>;

  // Validate the request signature (v3 signature)
  const signature = req.headers["x-hubspot-signature-v3"] as string;
  const timestamp = req.headers["x-hubspot-request-timestamp"] as string;
  if (!validateHubSpotSignature(req, signature, timestamp)) {
    return res.status(403).json({ error: "Invalid signature" });
  }

  // Fetch your data for this contact
  const orders = await getOrdersForContact(associatedObjectId);

  // Return the card data payload
  res.json({
    results: orders.map(order => ({
      objectId: order.id,
      title: order.orderNumber,
      link: `https://your-app.example.com/orders/${order.id}`,
      properties: [
        {
          label: "Order Date",
          dataType: "DATE",
          value: String(order.createdAt.getTime()),
        },
        {
          label: "Amount",
          dataType: "CURRENCY",
          value: String(order.totalCents / 100),
          currencyCode: "USD",
        },
        {
          label: "Status",
          dataType: "STATUS",
          value: order.status,
          optionType: order.status === "fulfilled" ? "SUCCESS" : "DEFAULT",
        },
      ],
    })),
    primaryAction: {
      type: "ACTION_HOOK",
      label: "Sync Orders",
      uri: "https://your-app.example.com/hubspot/sync-orders",
      httpMethod: "POST",
    },
    secondaryActions: [
      {
        type: "IFRAME",
        label: "View All Orders",
        uri: `https://your-app.example.com/orders?contactId=${associatedObjectId}`,
        width: 890,
        height: 748,
      },
    ],
  });
});

function validateHubSpotSignature(
  req: express.Request,
  signature: string,
  timestamp: string
): boolean {
  const secret = process.env.HUBSPOT_CLIENT_SECRET!;
  const method = req.method.toUpperCase();
  const url = `https://your-app.example.com${req.originalUrl}`;
  const body = ""; // GET requests have no body

  const sourceString = method + url + body + timestamp;
  const hash = crypto
    .createHmac("sha256", secret)
    .update(sourceString)
    .digest("base64");

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}
```

### Pattern 3: Create a timeline event type (template)

```typescript
async function createTimelineEventType(appId: number) {
  const eventTemplate = await hubspotClient.crm.timeline.templatesApi.create(appId, {
    name: "Order Placed",
    headerTemplate: "Order {{order_number}} placed for {{amount}}",
    detailTemplate: "**Product:** {{product_name}}\n**Status:** {{status}}\n[View Order]({{order_link}})",
    tokens: [
      {
        name: "order_number",
        label: "Order Number",
        type: "string",
        objectPropertyName: null,
      },
      {
        name: "amount",
        label: "Order Amount",
        type: "string",
        objectPropertyName: null,
      },
      {
        name: "product_name",
        label: "Product",
        type: "string",
        objectPropertyName: null,
      },
      {
        name: "status",
        label: "Status",
        type: "string",
        objectPropertyName: null,
      },
      {
        name: "order_link",
        label: "Order URL",
        type: "string",
        objectPropertyName: null,
      },
    ],
    objectType: "CONTACT",
  });

  console.log("Event template ID:", eventTemplate.id);
  return eventTemplate;
}
```

### Pattern 4: Write a timeline event to a contact's record

```typescript
async function logOrderPlaced(opts: {
  appId: number;
  eventTemplateId: string;
  contactId: string;
  order: {
    id: string;
    number: string;
    amount: string;
    productName: string;
    status: string;
  };
}) {
  await hubspotClient.crm.timeline.eventsApi.create({
    eventTemplateId: opts.eventTemplateId,
    objectId: opts.contactId,
    // id must be unique per event; use an external ID for idempotency
    id: `order-${opts.order.id}`,
    tokens: {
      order_number: opts.order.number,
      amount: opts.order.amount,
      product_name: opts.order.productName,
      status: opts.order.status,
      order_link: `https://your-app.example.com/orders/${opts.order.id}`,
    },
    timestamp: new Date().toISOString(),
  });
}
```

### Pattern 5: Batch write timeline events

```typescript
async function batchLogEvents(
  eventTemplateId: string,
  events: Array<{
    contactId: string;
    externalEventId: string;
    tokens: Record<string, string>;
  }>
) {
  // Batch in chunks of 100
  const chunks = [];
  for (let i = 0; i < events.length; i += 100) {
    chunks.push(events.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    await hubspotClient.crm.timeline.eventsApi.createBatch({
      inputs: chunk.map(e => ({
        eventTemplateId,
        objectId: e.contactId,
        id: e.externalEventId,
        tokens: e.tokens,
        timestamp: new Date().toISOString(),
      })),
    });
  }
}
```

### Pattern 6: Register a calling extension

```typescript
async function registerCallingExtension(appId: number) {
  await hubspotClient.crm.extensions.calling.settingsApi.create(appId, {
    name: "My VoIP Provider",
    url: "https://calling.your-app.example.com/widget",
    height: 600,
    width: 400,
    isReady: false, // Set to true only after full production testing
  });
}
```

### Pattern 7: Minimal UI Extension component (Projects pattern)

```typescript
// src/app/extensions/OrderHistoryCard.tsx
// Requires: @hubspot/ui-extensions, built via hs project dev

import React from "react";
import {
  hubspot,
  Text,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Button,
  Flex,
} from "@hubspot/ui-extensions";

hubspot.extend<"crm-record-tab">(({ context, runServerlessFunction }) => (
  <OrderHistoryCard context={context} runServerlessFunction={runServerlessFunction} />
));

interface Order {
  id: string;
  number: string;
  amount: string;
  status: string;
}

function OrderHistoryCard({ context, runServerlessFunction }: {
  context: { crm: { objectId: number; objectTypeId: string } };
  runServerlessFunction: (opts: { name: string; parameters?: Record<string, unknown> }) => Promise<{ response: unknown }>;
}) {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    runServerlessFunction({
      name: "getOrders",
      parameters: { contactId: String(context.crm.objectId) },
    }).then(result => {
      setOrders((result.response as { orders: Order[] }).orders);
      setLoading(false);
    });
  }, []);

  if (loading) return <Text>Loading orders...</Text>;

  return (
    <Flex direction="column" gap="small">
      <Text format={{ fontWeight: "bold" }}>Order History</Text>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>Order #</TableHeader>
            <TableHeader>Amount</TableHeader>
            <TableHeader>Status</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {orders.map(order => (
            <TableRow key={order.id}>
              <TableCell>{order.number}</TableCell>
              <TableCell>{order.amount}</TableCell>
              <TableCell>{order.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Flex>
  );
}
```

---

## Gotchas

**CRM Cards v1 is deprecated — do not use.** v1 cards configured via the legacy dashboard UI or `crm-card` in old app configs are deprecated. New cards must use the v2 API (`/crm/v3/extensions/cards`). Existing v1 cards may still render, but new development should always target v2.

**UI Extensions only work in HubSpot Projects.** If you're building a classic OAuth public app, you cannot use UI Extensions. The `@hubspot/ui-extensions` SDK and `hs project` workflow are a separate developer paradigm. Classic apps can use CRM Cards v2 but not React-based UI Extensions.

**CRM Card data fetch has a 5-second timeout.** HubSpot will abort the request to your `targetUrl` if it takes longer than 5 seconds to respond. If your backend is doing slow database queries or external API calls, cache aggressively or pre-compute card data asynchronously and return cached results synchronously within the timeout.

**Timeline events are immutable.** Once created, an event instance cannot be updated or deleted via the API. The event template (type) can be updated, but individual event records are permanent. Use this for audit trail purposes — do not try to use timeline events for mutable state.

**Timeline event `id` is your idempotency key.** If you POST a timeline event with an `id` that already exists for that `eventTemplateId`, HubSpot will silently ignore the duplicate rather than creating a second event. This is intentional and useful — use your external system's primary key as the event `id`.

**The card data fetch request is unauthenticated by default — validate the signature.** HubSpot sends a v3 HMAC-SHA256 signature header (`x-hubspot-signature-v3`) with every card data request. Always verify this signature using your app's client secret before processing the request. Skipping this is a security vulnerability.

**UI Extension components are not arbitrary HTML.** The `@hubspot/ui-extensions` SDK provides a curated set of components (`Text`, `Button`, `Table`, `Image`, `Link`, `Flex`, `Box`, etc.). You cannot use arbitrary HTML elements or inject custom CSS. The component library evolves — check the SDK changelog when upgrading.

**Calling extension `isReady: false` hides it from users.** Set `isReady: true` only when your calling widget is production-ready. During development, leave it `false` so it doesn't appear in HubSpot portals connected to your app.

**App ID is required for timeline and calling extension APIs.** Unlike CRM object APIs that use `accessToken` only, the timeline and calling extension endpoints require your `appId` (a numeric app identifier found in the developer portal). Do not confuse this with the `portalId` (the customer's HubSpot account ID).

---

## Official Documentation

- CRM Cards Overview: https://developers.hubspot.com/docs/api/crm/extensions/custom-cards
- CRM Cards v2 API Reference: https://developers.hubspot.com/docs/api/crm/extensions
- UI Extensions (Projects): https://developers.hubspot.com/docs/platform/ui-extensions-overview
- UI Extensions SDK Reference: https://developers.hubspot.com/docs/platform/ui-extensions-sdk-reference
- Timeline Events API: https://developers.hubspot.com/docs/api/crm/timeline
- Calling Extensions Overview: https://developers.hubspot.com/docs/api/crm/extensions/calling-sdk
- HubSpot Projects (hs CLI): https://developers.hubspot.com/docs/platform/build-and-deploy-using-hubspot-projects
- Request Signature Validation: https://developers.hubspot.com/docs/api/webhooks/validating-requests
