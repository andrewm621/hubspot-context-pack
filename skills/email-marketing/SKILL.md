---
strata_id: 1c5b37fc-16eb-4685-be38-3371f542233f
type: note
created: 2026-05-03T18:57:00+00:00
modified: 2026-05-03T18:57:00.469282002+00:00
description: HubSpot Email Marketing API — sending transactional and marketing emails, email templates, subscription management, analytics. Use when building email integrations.
metadata:
  bashPatterns:
  - \bhs\s+email\b
  docs:
  - https://developers.hubspot.com/docs/api/marketing/transactional-emails
  importPatterns:
  - '@hubspot/api-client'
  pathPatterns:
  - '**/email/**'
  - '**/emails/**'
  - '**/marketing/**'
  priority: 5
  promptSignals:
    phrases:
    - hubspot email
    - transactional email
    - marketing email
    - email template
    - subscription
    - email analytics
    - single send
name: email-marketing
---

## What It Is & When to Use It

HubSpot has two distinct email systems that serve different purposes and require different API approaches. Understanding which system you need before writing a line of code will save significant debugging time.

**Marketing emails** are created and managed through the HubSpot UI or API, sent to contact lists via campaigns or automation workflows, and tracked in the marketing analytics dashboard. They are subject to subscription preferences — a contact must be opted in to receive them. Marketing emails are the right tool for newsletters, promotional campaigns, re-engagement sequences, and any mass communication.

**Transactional emails** are triggered programmatically via the Single Send API in response to user actions: purchase receipts, password resets, booking confirmations, account notifications. They bypass marketing subscription preferences (because a user who just purchased expects a receipt regardless of whether they opted into your marketing list). Transactional emails require the **Transactional Email add-on** — a paid upgrade that is not included on any standard HubSpot tier.

Use this skill when:
- Sending automated receipts, confirmations, or notifications from your application
- Triggering emails via API in response to CRM events (deal closed, form submitted)
- Managing contact email subscription preferences programmatically
- Reading email performance analytics via API
- Creating or managing email templates programmatically

---

## Service Surface

### Transactional Email (Single Send API)

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Send transactional email | `/marketing/v3/transactional/single-email/send` | POST |

**Required scopes:** `transactional-email`

**Prerequisites:** Transactional Email add-on must be enabled on the HubSpot account. The email template must be created in HubSpot and marked as a transactional template.

### Marketing Email API

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List marketing emails | `/marketing/v3/emails` | GET |
| Get email by ID | `/marketing/v3/emails/{emailId}` | GET |
| Create email | `/marketing/v3/emails` | POST |
| Update email | `/marketing/v3/emails/{emailId}` | PATCH |
| Send test email | `/marketing/v3/emails/{emailId}/send-test` | POST |
| Get email statistics | `/marketing/v3/emails/{emailId}/statistics/list` | GET |

**Required scopes:** `content`

### Subscription Preferences API

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Get contact subscription status | `/communication-preferences/v3/status/email/{emailAddress}` | GET |
| Subscribe contact | `/communication-preferences/v3/subscribe` | POST |
| Unsubscribe contact | `/communication-preferences/v3/unsubscribe` | POST |
| List subscription types | `/communication-preferences/v3/definitions` | GET |

**Required scopes:** `communication_preferences.read`, `communication_preferences.write`

### Rate Limits

| Tier | Transactional Sends/Day | API Requests/10s |
|------|------------------------|-----------------|
| Free | Not available (add-on required) | — |
| Starter | Up to 5× contact tier limit/month | 100 |
| Professional | Up to 10× contact tier limit/month | 100 |
| Add-on | Portal-specific limit negotiated with HubSpot | 100 |

The exact transactional email volume limit is not a fixed daily number — it is tied to your contact tier and negotiated as part of the add-on. Check your portal's usage dashboard for your specific limit.

---

## Mental Model

**Marketing emails and transactional emails use completely different API paths.** There is no unified "send email" endpoint. Marketing emails go through campaign infrastructure with list targeting and scheduling; transactional emails go through the Single Send API with per-recipient targeting.

**Templates are the bridge.** Both email types use HubSpot templates, but transactional templates must be explicitly designated as "transactional" in HubSpot. A marketing template cannot be sent via the Single Send API, and vice versa. Templates are built with HubL (HubSpot's templating language, similar to Jinja2) or with the drag-and-drop editor.

**Subscription types gate marketing email sends.** HubSpot stores a list of subscription types (e.g., "Marketing Blog", "Product Updates"). Each contact has an opted-in/out status per subscription type. When you send a marketing email, HubSpot automatically filters out contacts who have opted out of that subscription type. You cannot override this for marketing emails — that's what transactional emails are for.

**GDPR and CAN-SPAM compliance is enforced server-side.** HubSpot validates subscription status before sending. Attempting to send a marketing email to an opted-out contact via the API will not throw an error — HubSpot silently skips that recipient. Check send statistics after the fact to see actual delivery counts.

**Single Send vs Workflow send.** The Single Send API sends one email to one recipient immediately. For batch sends, you enroll contacts in a workflow that sends the email. There is no batch marketing email send endpoint — bulk marketing sends happen through campaigns and workflows, not direct API calls.

---

## Common Patterns

### Pattern 1: Send a transactional email via Single Send API

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

interface TransactionalEmailParams {
  toEmail: string;
  emailId: number;          // HubSpot template ID (must be transactional type)
  contactProperties?: Record<string, string>; // Merge token overrides
  customProperties?: Record<string, string>;  // Custom template variables
}

async function sendTransactionalEmail(params: TransactionalEmailParams) {
  const response = await hubspotClient.marketing.transactional.singleSendApi.sendEmail({
    emailId: params.emailId,
    message: {
      to: params.toEmail,
      // Optional: override from name/address (must be verified sender in HubSpot)
      // from: "noreply@yourdomain.com",
      // replyTo: "support@yourdomain.com",
    },
    // Contact properties used to populate HubL merge tokens
    contactProperties: params.contactProperties ?? {},
    // Custom properties accessible as {{ custom.key }} in the template
    customProperties: params.customProperties ?? {},
  });

  return {
    statusId: response.statusId,  // Track delivery status with this ID
    sendResult: response.sendResult, // "SENT", "QUEUED", "REJECTED", etc.
  };
}

// Usage: send a purchase confirmation
await sendTransactionalEmail({
  toEmail: "customer@example.com",
  emailId: 12345,
  contactProperties: {
    firstname: "Jane",
    lastname: "Doe",
  },
  customProperties: {
    order_number: "ORD-2024-9871",
    total_amount: "$129.00",
    items: "2x Widget Pro",
  },
});
```

### Pattern 2: Check and update contact email subscription status

```typescript
interface SubscriptionStatus {
  subscriptionId: number;
  name: string;
  status: "SUBSCRIBED" | "NOT_SUBSCRIBED" | "OPTED_OUT";
}

async function getContactSubscriptionStatus(email: string): Promise<SubscriptionStatus[]> {
  const response = await hubspotClient.communicationPreferences.statusApi.getEmailStatus(email);

  return response.subscriptionStatuses.map(sub => ({
    subscriptionId: sub.id ? parseInt(sub.id) : 0,
    name: sub.name ?? "",
    status: sub.status as "SUBSCRIBED" | "NOT_SUBSCRIBED" | "OPTED_OUT",
  }));
}

async function subscribeContact(email: string, subscriptionId: number, legalBasis?: string) {
  await hubspotClient.communicationPreferences.statusApi.subscribe({
    emailAddress: email,
    subscriptionId: String(subscriptionId),
    legalBasis: legalBasis ?? "LEGITIMATE_INTEREST_PQL",
    legalBasisExplanation: "Contact opted in via website form",
  });
}

async function unsubscribeContact(email: string, subscriptionId: number) {
  await hubspotClient.communicationPreferences.statusApi.unsubscribe({
    emailAddress: email,
    subscriptionId: String(subscriptionId),
    legalBasis: "CONSENT_WITH_NOTICE",
    legalBasisExplanation: "Contact requested unsubscribe",
  });
}
```

### Pattern 3: List available subscription types

```typescript
async function getSubscriptionTypes() {
  const response = await hubspotClient.communicationPreferences.definitionsApi.getPage();

  return response.subscriptionDefinitions.map(def => ({
    id: def.id,
    name: def.name,
    description: def.description,
    isActive: def.isActive,
    isDefault: def.isDefault,
    communicationMethod: def.communicationMethod, // "EMAIL", "SMS", etc.
  }));
}

// Common usage: find the subscription ID for a named type
async function findSubscriptionByName(name: string): Promise<number | null> {
  const types = await getSubscriptionTypes();
  const match = types.find(t => t.name.toLowerCase() === name.toLowerCase());
  return match ? parseInt(match.id ?? "0") : null;
}
```

### Pattern 4: Retrieve marketing email performance statistics

```typescript
interface EmailStats {
  emailId: string;
  subject: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

async function getEmailStatistics(emailId: string): Promise<EmailStats> {
  // Use the raw HTTP client for endpoints not yet in the SDK
  const apiResponse = await hubspotClient.apiRequest({
    method: "GET",
    path: `/marketing/v3/emails/${emailId}/statistics/list`,
  });

  const data = await apiResponse.json() as any;
  const counters = data.counters ?? {};

  const sent = counters.SENT ?? 0;
  const delivered = counters.DELIVERED ?? 0;
  const opened = counters.OPEN ?? 0;
  const clicked = counters.CLICK ?? 0;
  const bounced = (counters.MTA_BOUNCED ?? 0) + (counters.BOUNCE ?? 0);
  const unsubscribed = counters.UNSUBSCRIBED ?? 0;

  return {
    emailId,
    subject: data.subject ?? "",
    sent,
    delivered,
    opened,
    clicked,
    bounced,
    unsubscribed,
    openRate: delivered > 0 ? opened / delivered : 0,
    clickRate: opened > 0 ? clicked / opened : 0,
    bounceRate: sent > 0 ? bounced / sent : 0,
  };
}
```

### Pattern 5: List marketing emails with pagination

```typescript
async function* listMarketingEmails(filters?: {
  campaignId?: string;
  state?: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
}) {
  let after: string | undefined;

  do {
    const params = new URLSearchParams();
    params.set("limit", "50");
    if (after) params.set("after", after);
    if (filters?.state) params.set("state", filters.state);
    if (filters?.campaignId) params.set("campaignId", filters.campaignId);

    const response = await hubspotClient.apiRequest({
      method: "GET",
      path: `/marketing/v3/emails?${params.toString()}`,
    });

    const data = await response.json() as any;

    for (const email of (data.results ?? [])) {
      yield {
        id: email.id as string,
        name: email.name as string,
        subject: email.content?.subject as string,
        state: email.state as string,
        updatedAt: new Date(email.updatedAt),
      };
    }

    after = data.paging?.next?.after;
  } while (after);
}

// Usage
for await (const email of listMarketingEmails({ state: "PUBLISHED" })) {
  console.log(`${email.name}: ${email.subject}`);
}
```

### Pattern 6: Send a test email to verify template rendering

```typescript
async function sendTestEmail(emailId: string, testRecipients: string[]) {
  const response = await hubspotClient.apiRequest({
    method: "POST",
    path: `/marketing/v3/emails/${emailId}/send-test`,
    body: {
      emailAddresses: testRecipients,
      // Optional: override contactId to use a specific contact's properties
      // contactId: "123456",
    },
  });

  if (!response.ok) {
    const error = await response.json() as any;
    throw new Error(`Failed to send test email: ${error.message}`);
  }
}
```

---

## Gotchas

**Transactional Email requires a paid add-on — not included in any standard tier.** This is the most common surprise when building email integrations. If you call the Single Send API without the add-on enabled, you will receive a `403 Forbidden` with `"Transactional email is not enabled for this account"`. Verify the add-on is active in Settings > Account > Billing before building.

**The template ID in Single Send API is the HubSpot internal email template ID, not a template name.** Find it in the URL when editing the template in HubSpot (`/email/{id}/edit`), or via the Marketing Email list API. Using a non-existent or non-transactional template ID returns a `400` error.

**Transactional emails can still bounce and affect your sender reputation.** Despite bypassing subscription checks, transactional emails still go through HubSpot's sending infrastructure and are subject to bounce tracking. A hard bounce from a transactional send will suppress that address from future transactional sends automatically — there is no flag to override this.

**Marketing emails sent to opted-out contacts fail silently.** HubSpot does not return an error when a campaign targets an opted-out contact. The contact is simply excluded from the send. You will only discover the exclusion by checking the email statistics endpoint after the send. If you're seeing unexpected delivery shortfalls, check subscription status on the affected contacts.

**`sendResult: "QUEUED"` does not mean delivered.** The Single Send API returns quickly but email delivery is asynchronous. `QUEUED` means HubSpot accepted the request. Actual delivery status (bounced, delivered, opened) requires polling the email statistics API or using webhooks for notification events.

**Subscription type IDs are portal-specific.** Every HubSpot portal has its own set of subscription type IDs. You cannot hardcode subscription IDs from one portal and use them in another — the IDs will either be wrong or map to different subscription types. Always call the definitions endpoint to resolve IDs dynamically.

**Legal basis is required for GDPR portals.** If the HubSpot portal has GDPR features enabled, subscription operations require a `legalBasis` value. Omitting it will return a `400` error. Valid values include `LEGITIMATE_INTEREST_PQL`, `LEGITIMATE_INTEREST_CLIENT`, `PERFORMANCE_OF_CONTRACT`, `CONSENT_WITH_NOTICE`, `FREELY_GIVEN_CONSENT_OF_THE_DATA_SUBJECT`, and others. Use `LEGITIMATE_INTEREST_PQL` for product-qualified leads or `CONSENT_WITH_NOTICE` for explicit opt-in forms.

**The Marketing Email API (`/marketing/v3/emails`) is not the same as the legacy Email API (`/marketing/v1/emails`).** The v3 API is for the newer drag-and-drop editor emails; v1 covers legacy Classic editor emails. Some older portals may have emails only accessible via v1. If you can't find an email in v3 results, check v1.

**Merge tokens use contact property internal names.** In HubL templates, `{{ contact.firstname }}` references the `firstname` contact property. If you pass `contactProperties: { "First Name": "Jane" }` (using the label instead of the internal name), the merge token will not render. Use internal property names (`firstname`, `lastname`, `email`, etc.).

---

## Official Documentation

- Transactional Email / Single Send API: https://developers.hubspot.com/docs/api/marketing/transactional-emails
- Marketing Email API (v3): https://developers.hubspot.com/docs/api/marketing/marketing-email
- Communication Preferences (Subscriptions): https://developers.hubspot.com/docs/api/marketing/subscriptions-preferences
- HubL Templating Reference: https://developers.hubspot.com/docs/cms/hubl
- Email Statistics API: https://developers.hubspot.com/docs/api/marketing/marketing-email#email-statistics
- Node.js SDK — Transactional: https://github.com/HubSpot/hubspot-api-nodejs/tree/main/codegen/marketing/transactional
- Node.js SDK — Communication Preferences: https://github.com/HubSpot/hubspot-api-nodejs/tree/main/codegen/communication_preferences