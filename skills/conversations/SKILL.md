---
name: conversations
description: HubSpot Conversations API — inbox, threads, messages, chatbots, live chat, channels. Use when building chat integrations or managing conversation data.
metadata:
  priority: 4
  docs:
    - "https://developers.hubspot.com/docs/api/conversations"
  pathPatterns:
    - '**/conversations/**'
    - '**/chat/**'
    - '**/inbox/**'
  bashPatterns: []
  importPatterns:
    - "@hubspot/api-client"
  promptSignals:
    phrases:
      - "hubspot conversation"
      - "hubspot chat"
      - "hubspot inbox"
      - "live chat"
      - "chatbot"
      - "hubspot thread"
      - "hubspot message"
      - "conversations api"
---

## What It Is & When to Use It

HubSpot Conversations is the unified inbox where messages from multiple channels (live chat widget, email, Facebook Messenger, WhatsApp) arrive and are managed by sales and support reps. The Conversations API gives programmatic access to inboxes, threads (conversations), and messages — and lets you build custom channels so your own messaging platform feeds into HubSpot.

Use this skill when:
- Reading or searching threads (conversations) associated with a contact
- Sending messages into an existing thread from your backend (e.g., automated follow-up)
- Building a custom channel integration to route messages from a third-party messaging platform into HubSpot
- Fetching conversation history to provide context in an external tool
- Bridging HubSpot live chat into a custom support workflow
- Syncing HubSpot thread data into an external CRM or data warehouse

**What this is NOT:**
- The Conversations API does not control the chatbot flow builder (that's a UI-only tool)
- It does not send email through the email channel — use the Marketing Email or Transactional Email APIs for that
- Tickets are a separate CRM object (Service Hub) and are associated with threads but are not the same thing

**Tier gates:**

| Feature | Minimum Tier |
|---------|-------------|
| Live chat widget | All tiers (Free) |
| Inbox + conversations API | All tiers (read) |
| Write messages via API | Starter |
| Custom channels | Requires developer account approval |
| Chatbot flows | Starter |
| Custom bot via API | Professional |
| WhatsApp integration | Professional |

---

## Service Surface

### Inboxes

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List inboxes | `/conversations/v3/conversations/inboxes` | GET |

### Threads

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Get thread | `/conversations/v3/conversations/threads/{threadId}` | GET |
| List threads | `/conversations/v3/conversations/threads` | GET |
| Update thread | `/conversations/v3/conversations/threads/{threadId}` | PATCH |
| Delete thread | `/conversations/v3/conversations/threads/{threadId}` | DELETE |
| Archive thread | `/conversations/v3/conversations/threads/{threadId}/archive` | POST |
| Restore thread | `/conversations/v3/conversations/threads/{threadId}/restore` | POST |

### Messages

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List messages in thread | `/conversations/v3/conversations/threads/{threadId}/messages` | GET |
| Get message | `/conversations/v3/conversations/threads/{threadId}/messages/{messageId}` | GET |
| Send message | `/conversations/v3/conversations/threads/{threadId}/messages` | POST |
| Get original message | `/conversations/v3/conversations/threads/{threadId}/messages/{messageId}/original` | GET |

### Custom Channels

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Create custom channel | `/conversations/v3/custom-channels` | POST |
| List custom channels | `/conversations/v3/custom-channels` | GET |
| Send inbound message (to HubSpot) | `/conversations/v3/custom-channels/{channelId}/messages` | POST |

**Required scopes:**
- `conversations.read` — read threads and messages
- `conversations.write` — send messages, update threads
- `conversations.visitor_identification.tokens.create` — visitor identification for live chat

**Rate limits:** Conversations API has stricter limits than the CRM API — 10 requests per second per portal. The daily limit is 40,000 requests for Professional portals. Burst traffic (e.g., processing a webhook backlog) must be throttled explicitly.

---

## Mental Model

**Inbox > Thread > Message is the hierarchy.** An inbox is a container (e.g., "Support Inbox," "Sales Chat"). A thread is a single conversation with one contact, living in an inbox. Messages are the individual exchanges within a thread. One contact can have multiple threads across different inboxes or channels.

**Threads are not tickets.** This is the most common confusion. A thread lives in Conversations and represents the chat/messaging interaction. A ticket lives in the CRM (Service Hub) and represents the support case. HubSpot can auto-create a ticket from a thread (configurable in the inbox settings), but they are separate objects. The thread API and the CRM Tickets API are independent.

**Channels are the source of a thread.** Each thread has an associated channel: live chat, email, Facebook Messenger, WhatsApp, or a custom channel. When you send a message into a thread, HubSpot routes it back through the same channel to the visitor. A thread's channel is set at creation and cannot be changed.

**Custom channels require an approved developer app.** To create a custom channel (routing messages from your own platform into HubSpot), you must register a developer app and get the custom channel feature enabled. This is not self-service — you submit a request to HubSpot's developer program. The channel itself has a webhook URL where HubSpot will POST outbound messages, and you POST inbound messages to HubSpot's endpoint.

**Visitor Identification ties anonymous visitors to CRM contacts.** For the live chat widget, visitors are anonymous by default. If a visitor is logged into your application and you know their email, you can generate a Visitor Identification Token and pass it to the chat widget — HubSpot will then associate their chat session with their CRM contact record. This requires the `conversations.visitor_identification.tokens.create` scope.

**The Conversations API is still maturing.** Some endpoints that appear in the documentation return 404 or 501 on certain portal configurations. Always add error handling for 5xx responses and treat Conversations API calls as more fragile than CRM API calls. HubSpot's changelog notes frequent additions to this API area.

---

## Common Patterns

### Pattern 1: List all threads for a contact

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

interface ThreadSummary {
  id: string;
  inboxId: string;
  status: string;
  createdAt: string;
  latestMessageTimestamp: string;
  contactId?: string;
}

async function getThreadsForContact(contactId: string): Promise<ThreadSummary[]> {
  // Threads are fetched via the conversations API with a contact association filter
  const response = await hubspotClient.apiRequest({
    method: "GET",
    path: "/conversations/v3/conversations/threads",
    qs: {
      associatedContactId: contactId,
      limit: 50,
    },
  });

  const data = await response.json() as {
    results: Array<{
      id: string;
      inboxId: string;
      status: string;
      createdAt: string;
      latestMessageTimestamp: string;
      associatedContactId?: string;
    }>;
    paging?: { next?: { after: string } };
  };

  return data.results.map(t => ({
    id: t.id,
    inboxId: t.inboxId,
    status: t.status,   // "OPEN", "CLOSED"
    createdAt: t.createdAt,
    latestMessageTimestamp: t.latestMessageTimestamp,
    contactId: t.associatedContactId,
  }));
}
```

### Pattern 2: Get messages in a thread

```typescript
interface ConversationMessage {
  id: string;
  type: string;        // "MESSAGE", "COMMENT", "BOT_MESSAGE"
  direction: string;   // "INCOMING" (from visitor), "OUTGOING" (from agent)
  text: string;
  createdAt: string;
  senderType: string;  // "CONTACT", "AGENT", "BOT", "INTEGRATION"
  senderId?: string;
}

async function getThreadMessages(threadId: string): Promise<ConversationMessage[]> {
  const messages: ConversationMessage[] = [];
  let after: string | undefined;

  do {
    const response = await hubspotClient.apiRequest({
      method: "GET",
      path: `/conversations/v3/conversations/threads/${threadId}/messages`,
      qs: {
        limit: 50,
        ...(after && { after }),
      },
    });

    const data = await response.json() as {
      results: Array<{
        id: string;
        type: string;
        direction: string;
        text: string;
        createdAt: string;
        senders: Array<{ actorId: string; senderField: string }>;
      }>;
      paging?: { next?: { after: string } };
    };

    for (const msg of data.results) {
      const sender = msg.senders?.[0];
      messages.push({
        id: msg.id,
        type: msg.type,
        direction: msg.direction,
        text: msg.text ?? "",
        createdAt: msg.createdAt,
        senderType: sender?.senderField ?? "UNKNOWN",
        senderId: sender?.actorId,
      });
    }

    after = data.paging?.next?.after;
  } while (after);

  return messages;
}
```

### Pattern 3: Send a message into an existing thread

```typescript
async function sendMessageToThread(params: {
  threadId: string;
  text: string;
  agentId?: string;  // HubSpot user ID of the sending agent (optional)
}) {
  const response = await hubspotClient.apiRequest({
    method: "POST",
    path: `/conversations/v3/conversations/threads/${params.threadId}/messages`,
    body: {
      type: "MESSAGE",
      text: params.text,
      direction: "OUTGOING",
      ...(params.agentId && {
        senders: [{
          actorId: `A-${params.agentId}`,  // Agent actor IDs are prefixed with "A-"
          senderField: "FROM",
        }],
      }),
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to send message: ${JSON.stringify(error)}`);
  }

  const message = await response.json() as { id: string; createdAt: string };
  return message;
}
```

### Pattern 4: Generate a Visitor Identification Token (for live chat auth)

```typescript
// Use this server-side to associate a known user with the HubSpot chat widget
// Pass the token to the client-side HubSpot tracking code

async function generateVisitorIdentificationToken(email: string): Promise<string> {
  const response = await hubspotClient.apiRequest({
    method: "POST",
    path: "/conversations/v3/visitor-identification/tokens/create",
    body: { email },
  });

  const data = await response.json() as { token: string };
  return data.token;
}

// On the client side, set the token before the chat widget loads:
// window.hsConversationsSettings = {
//   identificationEmail: "user@example.com",
//   identificationToken: "<token from server>",
// };
```

### Pattern 5: Close a thread

```typescript
async function closeThread(threadId: string) {
  await hubspotClient.apiRequest({
    method: "PATCH",
    path: `/conversations/v3/conversations/threads/${threadId}`,
    body: {
      status: "CLOSED",
    },
  });

  console.log(`Thread ${threadId} closed`);
}

async function reopenThread(threadId: string) {
  await hubspotClient.apiRequest({
    method: "PATCH",
    path: `/conversations/v3/conversations/threads/${threadId}`,
    body: {
      status: "OPEN",
    },
  });

  console.log(`Thread ${threadId} reopened`);
}
```

### Pattern 6: Send an inbound message via a custom channel

```typescript
// This pattern requires a registered custom channel with HubSpot.
// Your platform sends messages to HubSpot; HubSpot routes outbound replies
// to your webhook URL.

async function receiveMessageFromCustomChannel(params: {
  channelId: string;
  channelAccountId: string;
  senderId: string;     // External user ID in your system
  senderName: string;
  senderEmail: string;
  messageText: string;
  externalThreadId: string;  // Your platform's conversation ID
  timestampMs: number;
}) {
  const response = await hubspotClient.apiRequest({
    method: "POST",
    path: `/conversations/v3/custom-channels/${params.channelId}/messages`,
    body: {
      type: "MESSAGE",
      channelId: params.channelId,
      channelAccountId: params.channelAccountId,
      direction: "INCOMING",
      text: params.messageText,
      senders: [{
        senderField: "FROM",
        name: params.senderName,
        deliveryIdentifier: {
          type: "HS_EMAIL_ADDRESS",
          value: params.senderEmail,
        },
      }],
      recipients: [],
      subject: `Message from ${params.senderName}`,
      externalThreadId: params.externalThreadId,
      externalId: `${params.externalThreadId}-${params.timestampMs}`,
      createdAt: new Date(params.timestampMs).toISOString(),
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Custom channel message failed: ${JSON.stringify(error)}`);
  }

  return response.json();
}
```

---

## Gotchas

**The rate limit is 10 requests per second — not 100.** The Conversations API is significantly stricter than the CRM API. At 10 req/sec, polling a thread list for 50 contacts takes a minimum of 5 seconds. If you're processing a webhook backlog or doing bulk thread reads, implement explicit throttling with a 100ms delay between requests.

**Threads and tickets are separate — don't conflate them.** A common integration mistake is trying to read ticket data from thread endpoints or vice versa. To get the ticket associated with a thread, use the CRM Associations API to look up associations from the thread to the `TICKET` object type. They are linked, but they live in different API namespaces.

**`actorId` format for agents uses an "A-" prefix.** When referencing a HubSpot agent (user) as the sender of a message, the `actorId` is `A-{userId}` where `userId` is the HubSpot portal user ID (not the CRM owner ID). Confusing these formats results in the message appearing in the thread with no sender attribution.

**Custom channel setup requires developer program approval.** You cannot create a custom channel on any portal without HubSpot explicitly enabling the feature for your developer app. This is not configurable via API alone — you must apply through the HubSpot Developer Program. Budget time for the approval process before promising this capability to a client.

**Outbound message delivery depends on the channel.** When you POST a message to a thread, HubSpot routes it through the thread's channel. For custom channels, HubSpot POSTs the message to your registered webhook URL — your system is responsible for actually delivering it to the end user. If your webhook is down, the message is queued but delivery guarantees are limited.

**`externalThreadId` must be unique and consistent for custom channels.** When sending inbound messages, the `externalThreadId` links multiple messages into the same HubSpot thread. If you send two messages with the same `externalThreadId`, they appear in the same thread. If you reuse an ID from a different conversation by mistake, messages get merged into the wrong thread. Treat this field as a stable, unique conversation key from your external system.

**The Conversations API does not support bulk operations.** There is no batch endpoint for threads or messages. Each thread read, message send, and status update is a separate API call. For large-scale conversation processing, design your system to work asynchronously and respect the 10 req/sec limit.

**Visitor Identification Tokens expire after 12 hours.** Generate the token server-side at the time the user loads the page, not at login time. For long-lived sessions, re-generate the token on page load. A stale token causes the chat widget to fall back to anonymous mode silently.

**Deleting a thread is permanent.** `DELETE /conversations/v3/conversations/threads/{threadId}` permanently removes the thread and all its messages. Unlike CRM object deletion (which is soft-delete and recoverable), thread deletion is immediate and not reversible via the API. Use the archive endpoint instead for non-destructive removal from the inbox view.

---

## Official Documentation

- Conversations API Overview: https://developers.hubspot.com/docs/api/conversations/conversations
- Threads API: https://developers.hubspot.com/docs/api/conversations/threads
- Messages API: https://developers.hubspot.com/docs/api/conversations/messages
- Custom Channels API: https://developers.hubspot.com/docs/api/conversations/custom-channels
- Visitor Identification API: https://developers.hubspot.com/docs/api/conversations/visitor-identification
- Live Chat Widget Developer Guide: https://developers.hubspot.com/docs/api/conversation/chat-widget-sdk
- Conversations Inbox Setup: https://knowledge.hubspot.com/conversations/set-up-your-conversations-inbox
