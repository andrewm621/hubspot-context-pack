---
name: contacts
description: HubSpot CRM Contacts — CRUD, search, property management, contact lists, and associations.
metadata:
  priority: 8
  pathPatterns:
    - "**/contacts/**"
    - "**/contact*"
  importPatterns:
    - "@hubspot/api-client"
  promptSignals:
    phrases:
      - "hubspot contact"
      - "contact property"
      - "contact list"
      - "crm contact"
      - "create contact"
      - "update contact"
      - "search contacts"
      - "contact merge"
  docs:
    - "https://developers.hubspot.com/docs/api/crm/contacts"
---

## What It Is & When to Use It

Contacts are the central object in HubSpot CRM — they represent individual people. All other objects (companies, deals, tickets) associate back to contacts. The Contacts API supports full CRUD, search with complex filters, bulk batch operations, property management, and contact list membership.

Use this skill when reading, creating, or updating contact records; searching the contact database; managing contact properties; working with static or active lists; or syncing contact data between HubSpot and an external system.

---

## Service Surface

| Operation | Endpoint | Method | Max Batch |
|-----------|----------|--------|-----------|
| Get contact by ID | `/crm/v3/objects/contacts/{id}` | GET | — |
| List contacts | `/crm/v3/objects/contacts` | GET | 100/page |
| Create contact | `/crm/v3/objects/contacts` | POST | — |
| Update contact | `/crm/v3/objects/contacts/{id}` | PATCH | — |
| Delete contact | `/crm/v3/objects/contacts/{id}` | DELETE | — |
| Search contacts | `/crm/v3/objects/contacts/search` | POST | 200/page |
| Batch read | `/crm/v3/objects/contacts/batch/read` | POST | 100 |
| Batch create | `/crm/v3/objects/contacts/batch/create` | POST | 100 |
| Batch update | `/crm/v3/objects/contacts/batch/update` | POST | 100 |
| Batch upsert | `/crm/v3/objects/contacts/batch/upsert` | POST | 100 |
| Merge contacts | `/crm/v3/objects/contacts/merge` | POST | — |
| Get properties | `/crm/v3/properties/contacts` | GET | — |
| Create property | `/crm/v3/properties/contacts` | POST | — |

**Required scopes:** `crm.objects.contacts.read`, `crm.objects.contacts.write`

**Rate limits:** 100 req/10s. Use batch endpoints to stay well within limits.

---

## Mental Model

**Contacts are identified by `hs_object_id` (internal ID) and optionally by `email` (unique).** Most operations use the internal ID. Email is a unique identifier that can be used for upserts.

**Properties are the data fields.** Every contact has default HubSpot properties (firstname, lastname, email, phone, etc.) plus any custom properties your account defines. Always request only the properties you need — fetching all properties on large result sets is wasteful.

**Contact lists** are either static (manually managed) or active (rules-based). They're managed separately from the contact CRUD API via the Lists API (`/contacts/v1/lists/` — v1 endpoint, still current).

**Associations link contacts to companies, deals, and tickets.** A contact can be associated with multiple companies. The primary company is tracked via `associatedcompanyid` on the contact. Use the Associations v4 API for creating/reading links.

**Merging contacts** combines duplicate records. The "winner" keeps its ID; the "loser" is archived. All associations from both records are merged onto the winner.

---

## Common Patterns

### Pattern 1: Get a contact by ID with specific properties

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

async function getContact(contactId: string) {
  const contact = await hubspotClient.crm.contacts.basicApi.getById(
    contactId,
    ["firstname", "lastname", "email", "phone", "company", "lifecyclestage"],
    undefined, // propertiesWithHistory
    undefined, // associations
    false      // archived
  );

  return {
    id: contact.id,
    email: contact.properties.email,
    name: `${contact.properties.firstname} ${contact.properties.lastname}`.trim(),
    phone: contact.properties.phone,
    lifecycleStage: contact.properties.lifecyclestage,
  };
}
```

### Pattern 2: Create a contact

```typescript
async function createContact(data: {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  company?: string;
}) {
  const response = await hubspotClient.crm.contacts.basicApi.create({
    properties: {
      email: data.email,
      firstname: data.firstName,
      lastname: data.lastName,
      ...(data.phone && { phone: data.phone }),
      ...(data.company && { company: data.company }),
    },
    associations: [],
  });

  return response.id;
}
```

### Pattern 3: Upsert a contact by email (batch upsert)

```typescript
async function upsertContactByEmail(contacts: Array<{
  email: string;
  firstName: string;
  lastName: string;
}>) {
  // Batch upsert uses a unique property as the idProperty
  const response = await hubspotClient.crm.contacts.batchApi.upsert({
    inputs: contacts.map(c => ({
      idProperty: "email",
      id: c.email,
      properties: {
        email: c.email,
        firstname: c.firstName,
        lastname: c.lastName,
      },
    })),
  });

  return {
    created: response.results.filter(r => r.new).length,
    updated: response.results.filter(r => !r.new).length,
  };
}
```

### Pattern 4: Search contacts with filters

```typescript
interface ContactSearchParams {
  email?: string;
  lifecycleStage?: string;
  after?: string;
  limit?: number;
}

async function searchContacts(params: ContactSearchParams) {
  const filters = [];

  if (params.email) {
    filters.push({
      propertyName: "email",
      operator: "CONTAINS_TOKEN" as const,
      value: params.email,
    });
  }

  if (params.lifecycleStage) {
    filters.push({
      propertyName: "lifecyclestage",
      operator: "EQ" as const,
      value: params.lifecycleStage,
    });
  }

  const response = await hubspotClient.crm.contacts.searchApi.doSearch({
    filterGroups: filters.length > 0 ? [{ filters }] : [],
    properties: ["firstname", "lastname", "email", "lifecyclestage"],
    limit: params.limit ?? 50,
    after: params.after ? parseInt(params.after, 10) : 0,
    sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
    query: "",
  });

  return {
    contacts: response.results,
    nextCursor: response.paging?.next?.after,
    total: response.total,
  };
}
```

### Pattern 5: Paginate all contacts

```typescript
async function* getAllContacts(properties: string[]) {
  let after: string | undefined;

  do {
    const response = await hubspotClient.crm.contacts.basicApi.getPage(
      100,    // limit
      after,  // after cursor
      properties,
      undefined, // propertiesWithHistory
      undefined, // associations
      false      // archived
    );

    for (const contact of response.results) {
      yield contact;
    }

    after = response.paging?.next?.after;
  } while (after);
}

// Usage
for await (const contact of getAllContacts(["email", "firstname", "lastname"])) {
  console.log(contact.properties.email);
}
```

### Pattern 6: Batch read contacts by ID

```typescript
async function batchGetContacts(contactIds: string[], properties: string[]) {
  // Process in chunks of 100 (API limit)
  const chunks: string[][] = [];
  for (let i = 0; i < contactIds.length; i += 100) {
    chunks.push(contactIds.slice(i, i + 100));
  }

  const allContacts = [];
  for (const chunk of chunks) {
    const response = await hubspotClient.crm.contacts.batchApi.read({
      inputs: chunk.map(id => ({ id })),
      properties,
      propertiesWithHistory: [],
    });
    allContacts.push(...response.results);
  }

  return allContacts;
}
```

### Pattern 7: Merge duplicate contacts

```typescript
async function mergeContacts(primaryContactId: string, duplicateContactId: string) {
  await hubspotClient.crm.contacts.basicApi.merge({
    primaryObjectId: primaryContactId,
    objectIdToMerge: duplicateContactId,
  });
  // The duplicate (objectIdToMerge) is archived; primary keeps its ID
}
```

---

## Gotchas

**Email is unique but not required.** You can create contacts without an email. However, upserts by email require one. Contacts without emails can only be updated by `hs_object_id`.

**Search is eventually consistent.** After creating or updating a contact, it may not appear in search results immediately (typically a few seconds delay). If you need to read a contact right after writing it, use the GET by ID endpoint, not search.

**Search result limit is 10,000.** The search API will not return more than 10,000 results regardless of pagination. For full exports, use the `getPage` list endpoint with cursor pagination or the HubSpot export feature.

**Property names are case-sensitive in API calls.** Use `email` not `Email`. Use `firstname` not `firstName`. The internal names shown in the Properties UI are the correct ones to use.

**Archived contacts must be requested explicitly.** Deleted contacts are "archived" in HubSpot, not hard deleted. They still exist but won't appear in normal API responses. Pass `archived: true` to see them.

**Batch create doesn't deduplicate.** If you batch-create contacts with the same email, HubSpot will create duplicates. Use batch upsert with `idProperty: "email"` to safely avoid duplicates.

**Contact list membership via v1 API.** The Lists API still uses the old v1 endpoint (`/contacts/v1/lists/`). There is no v3 equivalent yet. Membership adds/removes use `/contacts/v1/lists/{listId}/add` and `/contacts/v1/lists/{listId}/remove`.

**`lifecyclestage` changes are one-way by default.** HubSpot's default behavior prevents moving a lifecycle stage backward (e.g., from `customer` back to `lead`). This can be changed per portal in settings, but it's a common source of silent failures on updates.

---

## Official Documentation

- Contacts API: https://developers.hubspot.com/docs/api/crm/contacts
- Properties API: https://developers.hubspot.com/docs/api/crm/properties
- Contact Search: https://developers.hubspot.com/docs/api/crm/search
- Contact Lists (v1): https://legacydocs.hubspot.com/docs/methods/lists/lists-overview
- Merge Contacts: https://developers.hubspot.com/docs/api/crm/contacts#merge-two-contacts
- Node.js SDK Contacts: https://github.com/HubSpot/hubspot-api-nodejs/blob/main/codegen/crm/contacts/README.md
