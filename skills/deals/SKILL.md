---
name: deals
description: HubSpot CRM Deals — CRUD, pipeline and stage management, associations, and deal property patterns.
metadata:
  priority: 7
  pathPatterns:
    - "**/deals/**"
    - "**/deal*"
    - "**/pipeline*"
  importPatterns:
    - "@hubspot/api-client"
  promptSignals:
    phrases:
      - "hubspot deal"
      - "deal pipeline"
      - "deal stage"
      - "crm deal"
      - "create deal"
      - "update deal"
      - "deal amount"
      - "close date"
      - "sales pipeline"
  docs:
    - "https://developers.hubspot.com/docs/api/crm/deals"
---

## What It Is & When to Use It

Deals represent sales opportunities in HubSpot CRM. Each deal belongs to a pipeline and is in a specific stage within that pipeline. Deals associate with contacts (who's involved) and companies (which organization) and support line items for product-level revenue tracking.

Use this skill when creating or syncing deal records, moving deals through pipeline stages, reading pipeline/stage configuration, or associating deals with contacts and companies.

---

## Service Surface

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Get deal by ID | `/crm/v3/objects/deals/{id}` | GET |
| List deals | `/crm/v3/objects/deals` | GET |
| Create deal | `/crm/v3/objects/deals` | POST |
| Update deal | `/crm/v3/objects/deals/{id}` | PATCH |
| Delete deal | `/crm/v3/objects/deals/{id}` | DELETE |
| Search deals | `/crm/v3/objects/deals/search` | POST |
| Batch read | `/crm/v3/objects/deals/batch/read` | POST |
| Batch create | `/crm/v3/objects/deals/batch/create` | POST |
| Batch update | `/crm/v3/objects/deals/batch/update` | POST |
| Get pipelines | `/crm/v3/pipelines/deals` | GET |
| Get pipeline stages | `/crm/v3/pipelines/deals/{pipelineId}/stages` | GET |

**Required scopes:** `crm.objects.deals.read`, `crm.objects.deals.write`

**Key default properties:**
| Property | Description |
|----------|-------------|
| `dealname` | Deal name (required) |
| `amount` | Deal value |
| `closedate` | Expected close date (Unix ms timestamp as string) |
| `dealstage` | Stage ID (not display name) |
| `pipeline` | Pipeline ID (not display name) |
| `dealtype` | newbusiness, existingbusiness |
| `hs_object_id` | Internal ID |

---

## Mental Model

**Pipeline stages use IDs, not names.** The `dealstage` property stores the internal stage ID (e.g., `"appointmentscheduled"`), not the human-readable label. You must fetch pipeline configuration to map between IDs and labels. Cache pipeline config — it changes infrequently.

**Every portal has a default pipeline.** If you don't specify a `pipeline`, deals go into the default. Multi-pipeline setups require explicitly setting both `pipeline` and `dealstage`.

**`closedate` is stored as a Unix timestamp in milliseconds, as a string.** Set it as `String(Date.now())` or an ISO date parsed to ms. This trips up many integrations.

**Deal stages have a `probability` metadata field.** Each stage has a configured probability (0-100) used for pipeline forecasting. You can read this from the stages API.

**Deals are associated, not owned.** A deal doesn't "belong" to a contact — it's associated with one or more contacts and companies. Multiple contacts can be associated with the same deal.

---

## Common Patterns

### Pattern 1: Get pipeline stages (cache this)

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

interface PipelineStage {
  id: string;
  label: string;
  probability: number;
  displayOrder: number;
}

interface Pipeline {
  id: string;
  label: string;
  stages: PipelineStage[];
}

async function getPipelines(): Promise<Pipeline[]> {
  const response = await hubspotClient.crm.pipelines.pipelinesApi.getAll("deals");

  return response.results.map(pipeline => ({
    id: pipeline.id,
    label: pipeline.label,
    stages: pipeline.stages?.map(stage => ({
      id: stage.id,
      label: stage.label,
      probability: parseFloat(stage.metadata?.probability ?? "0"),
      displayOrder: stage.displayOrder,
    })) ?? [],
  }));
}
```

### Pattern 2: Create a deal with contact association

```typescript
async function createDeal(data: {
  name: string;
  amount?: number;
  closeDateMs?: number;
  stageId: string;
  pipelineId: string;
  contactId?: string;
  companyId?: string;
}) {
  const associations = [];

  if (data.contactId) {
    associations.push({
      to: { id: data.contactId },
      types: [{
        associationCategory: "HUBSPOT_DEFINED" as const,
        associationTypeId: 3, // deal_to_contact
      }],
    });
  }

  if (data.companyId) {
    associations.push({
      to: { id: data.companyId },
      types: [{
        associationCategory: "HUBSPOT_DEFINED" as const,
        associationTypeId: 342, // company_to_deal (from company perspective)
      }],
    });
  }

  const deal = await hubspotClient.crm.deals.basicApi.create({
    properties: {
      dealname: data.name,
      dealstage: data.stageId,
      pipeline: data.pipelineId,
      ...(data.amount !== undefined && { amount: String(data.amount) }),
      ...(data.closeDateMs !== undefined && { closedate: String(data.closeDateMs) }),
    },
    associations,
  });

  return deal.id;
}
```

### Pattern 3: Move deal to a new stage

```typescript
async function moveDealToStage(dealId: string, newStageId: string) {
  await hubspotClient.crm.deals.basicApi.update(dealId, {
    properties: {
      dealstage: newStageId,
    },
  });
}
```

### Pattern 4: Search deals by stage and close date range

```typescript
async function getDealsClosingThisMonth(stageId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();

  const response = await hubspotClient.crm.deals.searchApi.doSearch({
    filterGroups: [{
      filters: [
        {
          propertyName: "dealstage",
          operator: "EQ",
          value: stageId,
        },
        {
          propertyName: "closedate",
          operator: "BETWEEN",
          value: String(startOfMonth),
          highValue: String(endOfMonth),
        },
      ],
    }],
    properties: ["dealname", "amount", "closedate", "dealstage"],
    limit: 100,
    after: 0,
    sorts: [{ propertyName: "closedate", direction: "ASCENDING" }],
    query: "",
  });

  return response.results;
}
```

### Pattern 5: Get all deals with pagination

```typescript
async function* getAllDeals(properties: string[]) {
  let after: string | undefined;

  do {
    const response = await hubspotClient.crm.deals.basicApi.getPage(
      100,
      after,
      properties,
      undefined,
      undefined,
      false
    );

    for (const deal of response.results) {
      yield deal;
    }

    after = response.paging?.next?.after;
  } while (after);
}
```

---

## Gotchas

**`closedate` must be a Unix timestamp in milliseconds as a string.** This is different from most date fields in other systems. A common bug is passing an ISO string (`"2024-03-15"`) or seconds instead of ms. Use `String(new Date("2024-03-15").getTime())`.

**`dealstage` stores the internal stage ID, not the label.** Never hardcode stage labels like `"Closed Won"` — they can be renamed. Fetch pipeline configuration and map by ID. Stage IDs look like `"closedwon"` for the default pipeline but are GUIDs for custom pipelines.

**`amount` is a string in the API, even though it's numeric.** Pass `"5000"` not `5000`. Same for `annualrevenue` on companies.

**Deals don't have an email-equivalent unique identifier.** Unlike contacts (email) or companies (domain), there's no natural unique key for deals. If you're syncing from an external CRM, store the external ID in a custom property and use it for upserts.

**Pipeline stages can be deleted.** If a stage is deleted, deals in that stage become "orphaned" in the UI. Your integration should handle deals with unrecognized stage IDs gracefully.

**Line items are a separate object.** Product-level revenue breakdown uses Line Items (`/crm/v3/objects/line_items`), which associate to deals. A deal's `amount` is separate from the sum of its line items — they don't auto-sync.

---

## Official Documentation

- Deals API: https://developers.hubspot.com/docs/api/crm/deals
- Pipelines API: https://developers.hubspot.com/docs/api/crm/pipelines
- Deal Properties: https://developers.hubspot.com/docs/api/crm/properties
- Line Items: https://developers.hubspot.com/docs/api/crm/line-items
