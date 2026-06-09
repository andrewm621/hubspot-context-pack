---
strata_id: b60ec3f3-b0f0-43f7-9fce-692cbff85689
type: note
created: 2026-05-03T18:57:34+00:00
modified: 2026-05-03T18:57:34.479591454+00:00
metadata:
  bashPatterns: []
  docs:
  - https://developers.hubspot.com/docs/api/crm/tickets
  importPatterns:
  - '@hubspot/api-client'
  pathPatterns:
  - '**/tickets/**'
  - '**/ticket*'
  - '**/support/**'
  priority: 5
  promptSignals:
    phrases:
    - hubspot ticket
    - support ticket
    - ticket pipeline
    - help desk
    - service hub
    - ticket property
name: tickets
description: HubSpot Tickets API — support tickets, pipelines, SLAs, associations with contacts/companies. Use when building help desk or support integrations.
---

## What It Is & When to Use It

Tickets represent customer support requests in HubSpot Service Hub. Structurally they are a standard CRM object — same API shape as Contacts, Companies, and Deals — but with a support-oriented property set and pipeline semantics optimized for resolution tracking rather than revenue conversion.

Use this skill when:
- Building a help desk integration that creates tickets from incoming support channels (email, chat, form)
- Syncing tickets between HubSpot and an external ticketing system (Zendesk, Jira, Linear)
- Moving tickets through support stages programmatically (triage → in progress → resolved)
- Reading ticket timelines and activity for reporting or escalation logic
- Associating tickets with contacts and companies for account-level support views
- Implementing SLA monitoring (Service Hub Professional+)

Tickets share the CRM v3 object API. If you know the Contacts or Deals API, the endpoints and SDK patterns are identical — only the object type name and available properties differ.

---

## Service Surface

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Get ticket by ID | `/crm/v3/objects/tickets/{id}` | GET |
| List tickets | `/crm/v3/objects/tickets` | GET |
| Create ticket | `/crm/v3/objects/tickets` | POST |
| Update ticket | `/crm/v3/objects/tickets/{id}` | PATCH |
| Delete ticket | `/crm/v3/objects/tickets/{id}` | DELETE |
| Search tickets | `/crm/v3/objects/tickets/search` | POST |
| Batch read | `/crm/v3/objects/tickets/batch/read` | POST |
| Batch create | `/crm/v3/objects/tickets/batch/create` | POST |
| Batch update | `/crm/v3/objects/tickets/batch/update` | POST |
| Get ticket pipelines | `/crm/v3/pipelines/tickets` | GET |
| Get pipeline stages | `/crm/v3/pipelines/tickets/{pipelineId}/stages` | GET |
| Get associations | `/crm/v4/objects/tickets/{id}/associations/{toType}` | GET |

**Required scopes:** `tickets` (read+write combined scope), or `crm.objects.contacts.read` for association lookups.

**Key default properties:**

| Property | Type | Description |
|----------|------|-------------|
| `subject` | string | Ticket title / one-liner (required) |
| `content` | string | Full description / body |
| `hs_pipeline` | string | Pipeline ID |
| `hs_pipeline_stage` | string | Stage ID within that pipeline |
| `hs_ticket_priority` | enumeration | `LOW`, `MEDIUM`, `HIGH` |
| `hs_ticket_category` | enumeration | Portal-configurable categories |
| `source_type` | enumeration | `EMAIL`, `FORM`, `CHAT`, `PHONE`, `API` |
| `hubspot_owner_id` | string | Assigned owner (user ID) |
| `hs_object_id` | string | Internal HubSpot ID (read-only) |
| `createdate` | datetime | Creation timestamp (read-only) |
| `hs_lastmodifieddate` | datetime | Last update timestamp (read-only) |
| `closed_date` | datetime | Auto-set when moved to a closed stage |
| `time_to_close` | number | Minutes from creation to closed_date (read-only) |
| `time_to_first_agent_reply` | number | Minutes to first reply (Service Hub Pro+, read-only) |

---

## Mental Model

**Tickets use the same pipeline/stage model as Deals.** A pipeline is a container; stages are the steps inside it. The `hs_pipeline` property holds the pipeline ID and `hs_pipeline_stage` holds the stage ID — both internal IDs, not display names. Fetch pipeline config once and cache it.

**Every portal ships with a default "Support Pipeline."** It has stages with IDs like `1` (New), `2` (Waiting on Contact), `3` (Waiting on Us), `4` (Closed). These numeric IDs are portal-specific — they are not universal. Always fetch your portal's pipelines before hardcoding a stage value.

**`closed_date` is set automatically when a ticket moves to a stage flagged as "closed."** You don't set it yourself. If you move a ticket out of a closed stage, `closed_date` is cleared. This means `time_to_close` can reset — handle this in reporting logic.

**SLA fields are computed, not stored in properties you write.** `hs_due_date` (SLA deadline), `hs_is_overdue` (boolean), and `time_to_first_agent_reply` are system-calculated. You read them; you don't write them. SLAs are configured per pipeline stage in Service Hub settings.

**Associations mirror the Contacts/Deals pattern.** A ticket can associate with multiple contacts and companies. There is no singular "owner contact" on a ticket record — relationships are managed through the Associations v4 API.

**Source type distinguishes how the ticket arrived.** Use `source_type: "API"` when creating tickets programmatically. This prevents your integration-created tickets from polluting channel-based reporting.

---

## Common Patterns

### Pattern 1: Fetch pipeline stages (cache this, it changes rarely)

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

interface TicketStage {
  id: string;
  label: string;
  isClosed: boolean;
  displayOrder: number;
  metadata: Record<string, string>;
}

interface TicketPipeline {
  id: string;
  label: string;
  stages: TicketStage[];
}

async function getTicketPipelines(): Promise<TicketPipeline[]> {
  const response = await hubspotClient.crm.pipelines.pipelinesApi.getAll("tickets");

  return response.results.map(pipeline => ({
    id: pipeline.id,
    label: pipeline.label,
    stages: (pipeline.stages ?? []).map(stage => ({
      id: stage.id,
      label: stage.label,
      displayOrder: stage.displayOrder,
      isClosed: stage.metadata?.isClosed === "true",
      metadata: stage.metadata ?? {},
    })),
  }));
}

// Build a lookup: stageId → stage info
async function buildStageMap() {
  const pipelines = await getTicketPipelines();
  const map = new Map<string, TicketStage & { pipelineId: string }>();

  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages) {
      map.set(stage.id, { ...stage, pipelineId: pipeline.id });
    }
  }

  return map;
}
```

### Pattern 2: Create a ticket with contact association

```typescript
async function createTicket(data: {
  subject: string;
  content?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  pipelineId: string;
  stageId: string;
  sourceType?: "EMAIL" | "FORM" | "CHAT" | "PHONE" | "API";
  contactId?: string;
  companyId?: string;
  ownerId?: string;
}) {
  const associations = [];

  if (data.contactId) {
    associations.push({
      to: { id: data.contactId },
      types: [{
        associationCategory: "HUBSPOT_DEFINED" as const,
        associationTypeId: 16, // ticket_to_contact
      }],
    });
  }

  if (data.companyId) {
    associations.push({
      to: { id: data.companyId },
      types: [{
        associationCategory: "HUBSPOT_DEFINED" as const,
        associationTypeId: 340, // ticket_to_company
      }],
    });
  }

  const ticket = await hubspotClient.crm.tickets.basicApi.create({
    properties: {
      subject: data.subject,
      hs_pipeline: data.pipelineId,
      hs_pipeline_stage: data.stageId,
      ...(data.content && { content: data.content }),
      ...(data.priority && { hs_ticket_priority: data.priority }),
      ...(data.sourceType && { source_type: data.sourceType }),
      ...(data.ownerId && { hubspot_owner_id: data.ownerId }),
    },
    associations,
  });

  return ticket.id;
}
```

### Pattern 3: Update ticket pipeline stage

```typescript
async function moveTicketToStage(ticketId: string, newStageId: string) {
  await hubspotClient.crm.tickets.basicApi.update(ticketId, {
    properties: {
      hs_pipeline_stage: newStageId,
    },
  });
  // If newStageId maps to a "closed" stage, closed_date will be auto-set by HubSpot
}
```

### Pattern 4: Search open tickets by priority

```typescript
async function getHighPriorityOpenTickets(pipelineId: string, closedStageIds: string[]) {
  // Filter to tickets NOT in a closed stage
  const response = await hubspotClient.crm.tickets.searchApi.doSearch({
    filterGroups: [{
      filters: [
        {
          propertyName: "hs_pipeline",
          operator: "EQ" as const,
          value: pipelineId,
        },
        {
          propertyName: "hs_ticket_priority",
          operator: "EQ" as const,
          value: "HIGH",
        },
        {
          // NOT_IN operator for excluding closed stages
          propertyName: "hs_pipeline_stage",
          operator: "NOT_IN" as const,
          values: closedStageIds,
        },
      ],
    }],
    properties: ["subject", "content", "hs_pipeline_stage", "hs_ticket_priority", "hubspot_owner_id", "createdate"],
    limit: 100,
    after: 0,
    sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
    query: "",
  });

  return response.results;
}
```

### Pattern 5: Get ticket with associated contacts and companies

```typescript
async function getTicketWithAssociations(ticketId: string) {
  // Fetch the ticket record
  const ticket = await hubspotClient.crm.tickets.basicApi.getById(
    ticketId,
    ["subject", "content", "hs_pipeline_stage", "hs_ticket_priority", "createdate", "closed_date"],
    undefined,
    undefined,
    false
  );

  // Fetch associated contacts
  const contactAssociations = await hubspotClient.crm.associations.v4.basicApi.getPage(
    "tickets",
    ticketId,
    "contacts"
  );

  // Fetch associated companies
  const companyAssociations = await hubspotClient.crm.associations.v4.basicApi.getPage(
    "tickets",
    ticketId,
    "companies"
  );

  return {
    ticket: ticket.properties,
    contactIds: contactAssociations.results.map(r => r.toObjectId),
    companyIds: companyAssociations.results.map(r => r.toObjectId),
  };
}
```

### Pattern 6: Paginate all tickets in a pipeline

```typescript
async function* getTicketsByPipeline(pipelineId: string, properties: string[]) {
  let after: string | undefined;

  do {
    const response = await hubspotClient.crm.tickets.searchApi.doSearch({
      filterGroups: [{
        filters: [{
          propertyName: "hs_pipeline",
          operator: "EQ" as const,
          value: pipelineId,
        }],
      }],
      properties,
      limit: 100,
      after: after ? parseInt(after, 10) : 0,
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      query: "",
    });

    for (const ticket of response.results) {
      yield ticket;
    }

    after = response.paging?.next?.after;
  } while (after);
}
```

### Pattern 7: Batch update ticket stages (bulk close)

```typescript
async function bulkCloseTickets(ticketIds: string[], closedStageId: string) {
  // Process in chunks of 100 (API batch limit)
  const chunks: string[][] = [];
  for (let i = 0; i < ticketIds.length; i += 100) {
    chunks.push(ticketIds.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    await hubspotClient.crm.tickets.batchApi.update({
      inputs: chunk.map(id => ({
        id,
        properties: {
          hs_pipeline_stage: closedStageId,
        },
      })),
    });
  }
}
```

---

## Gotchas

**Pipeline and stage IDs are portal-specific and numeric-looking but not sequential.** The default pipeline's stage IDs may look like `"1"`, `"2"`, `"4"` in one portal and be GUIDs in another. Do not hardcode them — always resolve them from the pipelines API at startup.

**`hs_pipeline` is required at creation.** Unlike Deals, where HubSpot falls back to the default pipeline, Tickets API will return a 400 error if `hs_pipeline` is omitted. Always explicitly set both `hs_pipeline` and `hs_pipeline_stage`.

**`closed_date` is read-only and auto-managed.** Setting `closed_date` in a PATCH request is silently ignored. Move the ticket to a stage configured as "closed" — HubSpot sets the date automatically.

**The `tickets` scope grants both read and write.** Unlike `crm.objects.contacts.read` / `.write`, the Tickets scope is a single `tickets` scope. Requesting separate read/write scopes for tickets is unnecessary.

**SLA properties require Service Hub Professional or Enterprise.** `hs_due_date`, `hs_is_overdue`, `time_to_first_agent_reply` return null for portals without Service Hub Pro+. Build null-safe handling around these fields in any reporting code.

**Search is eventually consistent.** A ticket created via the API may not appear in search results for several seconds. If you create a ticket and immediately search for it, use GET by ID instead.

**Association type IDs for tickets differ from deals.** The association type for ticket→contact is `16` (contact_to_ticket perspective: `15`). The type for ticket→company is `340`. Do not reuse deal association type IDs — they are different objects.

**`source_type` cannot be updated after creation.** This property is set-once at creation time. Plan your source attribution before writing records.

---

## Official Documentation

- Tickets API: https://developers.hubspot.com/docs/api/crm/tickets
- Pipelines API (tickets): https://developers.hubspot.com/docs/api/crm/pipelines
- Ticket Properties Reference: https://developers.hubspot.com/docs/api/crm/properties
- Service Hub SLAs: https://knowledge.hubspot.com/service/set-up-slas-in-hubspot
- Associations v4: https://developers.hubspot.com/docs/api/crm/associations
- Node.js SDK Tickets: https://github.com/HubSpot/hubspot-api-nodejs/blob/main/codegen/crm/tickets/README.md