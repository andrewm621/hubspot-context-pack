---
name: associations
description: HubSpot Associations v4 — linking CRM objects, association type IDs, custom labels, batch operations, and schema management.
metadata:
  priority: 6
  pathPatterns:
    - "**/associations/**"
    - "**/association*"
  importPatterns:
    - "@hubspot/api-client"
  promptSignals:
    phrases:
      - "hubspot association"
      - "crm association"
      - "object relationship"
      - "link contact company"
      - "associate deal"
      - "association type"
      - "association label"
  docs:
    - "https://developers.hubspot.com/docs/api/crm/associations"
---

## What It Is & When to Use It

Associations define relationships between CRM objects — contacts linked to companies, deals linked to contacts, tickets linked to companies. HubSpot uses a typed association model where each link has a `typeId` indicating the relationship type. v4 of the Associations API (current) supports custom labels and bidirectional association management.

Use this skill when creating or reading object relationships, working with custom association labels, bulk-associating records, or querying the association schema.

---

## Service Surface

**Associations v4 endpoints:**

| Operation | Endpoint | Method | Max Batch |
|-----------|----------|--------|-----------|
| Create association | `/crm/v4/associations/{fromType}/{toType}/batch/create` | POST | 100 |
| Read associations | `/crm/v4/associations/{fromType}/{toType}/batch/read` | POST | 100 |
| Delete associations | `/crm/v4/associations/{fromType}/{toType}/batch/archive` | POST | 100 |
| List association defs | `/crm/v4/associations/{fromType}/{toType}/labels` | GET | — |
| Create custom label | `/crm/v4/associations/{fromType}/{toType}/labels` | POST | — |
| Update label | `/crm/v4/associations/{fromType}/{toType}/labels/{typeId}` | PUT | — |
| Delete label | `/crm/v4/associations/{fromType}/{toType}/labels/{typeId}` | DELETE | — |
| Get object's associations | `/crm/v4/objects/{objectType}/{objectId}/associations/{toObjectType}` | GET | — |

**Required scopes:** `crm.objects.contacts.read` (or appropriate object scope) plus `crm.associations.read`, `crm.associations.write`

**Standard association type IDs (HUBSPOT_DEFINED):**

| From → To | typeId | Name |
|-----------|--------|------|
| Contact → Company | 279 | contact_to_company |
| Company → Contact | 280 | company_to_contact |
| Contact → Deal | 4 | contact_to_deal |
| Deal → Contact | 3 | deal_to_contact |
| Company → Deal | 342 | company_to_deal |
| Deal → Company | 341 | deal_to_company |
| Contact → Ticket | 16 | contact_to_ticket |
| Ticket → Contact | 15 | ticket_to_contact |
| Company → Ticket | 340 | company_to_ticket |
| Deal → Line Item | 19 | deal_to_line_item |

---

## Mental Model

**Associations are typed and bidirectional.** Every association has a `typeId` from the `fromObject`'s perspective. The reverse direction has a different `typeId`. When creating a contact-to-company association, use type 279. The corresponding company-to-contact entry (type 280) is created automatically.

**`HUBSPOT_DEFINED` vs `USER_DEFINED` categories.** HubSpot's built-in associations are `HUBSPOT_DEFINED`. Custom labels you create are `USER_DEFINED`. Both can coexist on the same pair of objects.

**Custom labels add semantic meaning.** Instead of just "contact associated to company," you can label the relationship "Decision Maker," "End User," or "Billing Contact." Labels are optional metadata on top of the base association.

**Batch operations are the right default.** For syncing 50+ associations, always use the batch endpoints. Single-record association creation is 50-100x slower at scale.

**Reading associations requires a separate call.** When you GET a contact, associations are not included by default. You must either request them in the `associations` parameter or use the batch/read associations endpoints.

---

## Common Patterns

### Pattern 1: Associate a contact with a company

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

async function associateContactWithCompany(contactId: string, companyId: string) {
  await hubspotClient.crm.associations.v4.batchApi.create(
    "contacts",
    "companies",
    {
      inputs: [{
        _from: { id: contactId },
        to: { id: companyId },
        types: [{
          associationCategory: "HUBSPOT_DEFINED",
          associationTypeId: 279, // contact_to_company
        }],
      }],
    }
  );
}
```

### Pattern 2: Batch associate multiple contacts to a company

```typescript
async function associateManyContactsToCompany(contactIds: string[], companyId: string) {
  // Process in chunks of 100 (API limit)
  const chunks: string[][] = [];
  for (let i = 0; i < contactIds.length; i += 100) {
    chunks.push(contactIds.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    await hubspotClient.crm.associations.v4.batchApi.create(
      "contacts",
      "companies",
      {
        inputs: chunk.map(contactId => ({
          _from: { id: contactId },
          to: { id: companyId },
          types: [{
            associationCategory: "HUBSPOT_DEFINED" as const,
            associationTypeId: 279,
          }],
        })),
      }
    );
  }
}
```

### Pattern 3: Read all associations for an object

```typescript
async function getContactAssociations(contactId: string) {
  // Get associated companies
  const companies = await hubspotClient.crm.associations.v4.basicApi.getPage(
    "contacts",
    contactId,
    "companies"
  );

  // Get associated deals
  const deals = await hubspotClient.crm.associations.v4.basicApi.getPage(
    "contacts",
    contactId,
    "deals"
  );

  return {
    companyIds: companies.results.map(r => r.toObjectId),
    dealIds: deals.results.map(r => r.toObjectId),
  };
}
```

### Pattern 4: Batch read associations for multiple objects

```typescript
async function batchGetCompanyAssociations(contactIds: string[]) {
  const response = await hubspotClient.crm.associations.v4.batchApi.read(
    "contacts",
    "companies",
    {
      inputs: contactIds.map(id => ({ id })),
    }
  );

  // Map results: contactId → [companyId, ...]
  const map = new Map<string, string[]>();
  for (const result of response.results) {
    map.set(
      result.from.id,
      result.to.map(t => t.toObjectId)
    );
  }

  return map;
}
```

### Pattern 5: Create a custom association label

```typescript
async function createCustomAssociationLabel(
  fromObjectType: string,
  toObjectType: string,
  label: string
) {
  // Create a labeled association type between two object types
  const response = await hubspotClient.crm.associations.v4.schema.definitionsApi.create(
    fromObjectType,
    toObjectType,
    {
      label,
      name: label.toLowerCase().replace(/\s+/g, "_"),
    }
  );

  console.log("Created association label:", response.results);
  // Returns the typeId for the new label — store this for use in creates
  return response.results;
}
```

### Pattern 6: Associate with a custom label

```typescript
async function associateContactAsDecisionMaker(
  contactId: string,
  companyId: string,
  decisionMakerTypeId: number // obtained from createCustomAssociationLabel
) {
  await hubspotClient.crm.associations.v4.batchApi.create(
    "contacts",
    "companies",
    {
      inputs: [{
        _from: { id: contactId },
        to: { id: companyId },
        types: [
          // Include the standard association type too
          {
            associationCategory: "HUBSPOT_DEFINED",
            associationTypeId: 279,
          },
          // And the custom label
          {
            associationCategory: "USER_DEFINED",
            associationTypeId: decisionMakerTypeId,
          },
        ],
      }],
    }
  );
}
```

### Pattern 7: Remove an association

```typescript
async function removeContactFromCompany(contactId: string, companyId: string) {
  await hubspotClient.crm.associations.v4.batchApi.archive(
    "contacts",
    "companies",
    {
      inputs: [{
        _from: { id: contactId },
        to: [{ id: companyId }],
      }],
    }
  );
}
```

---

## Gotchas

**v3 associations API is different from v4.** Older code may use `/crm/v3/associations/`. The v4 API has a different structure and supports labels. Migrate to v4 for new code.

**Deleting an association does not delete the objects.** Archiving an association only removes the link — both records remain in the CRM.

**Association type IDs are directional.** Type 279 is contact→company. Type 280 is company→contact. Using the wrong direction in a batch create will fail silently or return an error. Always use the type ID from the perspective of the `fromType` in your endpoint path.

**Custom label type IDs are portal-specific.** If you build an app that uses custom labels, the typeId for a label will be different in each portal. Never hardcode custom label type IDs — always fetch them via the schema API.

**One contact can have multiple companies (but one "primary").** The primary company is surfaced on the contact record UI as `associatedcompanyid`. When you associate a contact to a company, the most recently associated company becomes primary. You can't directly set the primary via the API — it's the last association created.

**Batch read returns empty results for objects with no associations.** If a contact has no associated companies, it won't appear in the batch read results. Handle missing keys gracefully when processing the Map.

---

## Official Documentation

- Associations v4 Overview: https://developers.hubspot.com/docs/api/crm/associations
- Association Type IDs Reference: https://developers.hubspot.com/docs/api/crm/associations#association-type-id-reference
- Custom Association Labels: https://developers.hubspot.com/docs/api/crm/associations#create-custom-association-labels
- Node.js SDK Associations: https://github.com/HubSpot/hubspot-api-nodejs/blob/main/codegen/crm/associations/v4/README.md
