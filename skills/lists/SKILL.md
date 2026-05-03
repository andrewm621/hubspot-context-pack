---
name: lists
description: HubSpot Lists API — contact lists, company lists, static vs active lists, list membership, filtering. Use when segmenting contacts or building audience management.
metadata:
  priority: 5
  docs:
    - "https://developers.hubspot.com/docs/api/crm/lists"
  pathPatterns:
    - '**/lists/**'
    - '**/segments/**'
  bashPatterns: []
  importPatterns:
    - "@hubspot/api-client"
  promptSignals:
    phrases:
      - "hubspot list"
      - "contact list"
      - "active list"
      - "static list"
      - "list membership"
      - "segment"
---

## What It Is & When to Use It

HubSpot Lists (also called ILS — Internal List Segmentation) are named collections of CRM records used for segmenting audiences, targeting emails, enrolling contacts in workflows, and controlling what content is shown on HubSpot CMS pages. Lists can contain Contacts or Companies (not Deals or other objects — those use different segmentation mechanisms).

**Static lists** have manually managed membership. You explicitly add or remove individual records. They don't change unless you change them. Use static lists when you need precise, human-curated audiences: VIP customers, event attendees, manual exclusion lists, imported CSV lists.

**Active lists** use filter criteria to automatically maintain membership. HubSpot re-evaluates the filter criteria continuously (typically every 15 minutes for large lists) and adds or removes records as they meet or stop meeting the criteria. Use active lists when you want "everyone who has done X" — form submitters, contacts at a specific lifecycle stage, contacts who opened a specific email.

Use this skill when:
- Segmenting contacts for email marketing campaigns
- Enrolling specific contact groups into workflows
- Managing import lists or suppression lists
- Building audience management tooling for a HubSpot integration
- Checking whether a contact is a member of a specific list
- Creating filter-based segments to power personalization or reporting

---

## Service Surface

HubSpot has two Lists API versions. The v3 API is the current standard for new integrations.

### Lists API (v3) — Current

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Create list | `/crm/v3/lists` | POST |
| Get list by ID | `/crm/v3/lists/{listId}` | GET |
| Get list by name | `/crm/v3/lists/object-type-id/{objectTypeId}/name/{listName}` | GET |
| Update list name | `/crm/v3/lists/{listId}/update-list-name` | PUT |
| Update list filter branch (active) | `/crm/v3/lists/{listId}/update-list-filters` | PUT |
| Delete list | `/crm/v3/lists/{listId}` | DELETE |
| Restore deleted list | `/crm/v3/lists/{listId}/restore` | PUT |
| Search lists | `/crm/v3/lists/search` | POST |
| Get list memberships | `/crm/v3/lists/{listId}/memberships` | GET |
| Add records to static list | `/crm/v3/lists/{listId}/memberships/add` | PUT |
| Remove records from static list | `/crm/v3/lists/{listId}/memberships/remove` | PUT |
| Add and remove records (combined) | `/crm/v3/lists/{listId}/memberships/add-and-remove` | PUT |
| Get lists by record membership | `/crm/v3/lists/records/{objectTypeId}/{objectId}/memberships` | GET |
| Get list record count | `/crm/v3/lists/{listId}/memberships?includeCount=true` | GET |
| Fetch list by multiple IDs | `/crm/v3/lists/fetch-multiple` | GET |

**Required scopes:** `crm.lists.read`, `crm.lists.write`

### Object Type IDs

| Object | objectTypeId |
|--------|-------------|
| Contacts | `0-1` |
| Companies | `0-2` |

### List Limits (by tier)

| Tier | Active Lists | Static Lists |
|------|-------------|-------------|
| Free | 5 | 25 |
| Starter | 25 | 1,000 |
| Professional | 1,000 | 1,000 |
| Enterprise | 1,500 | 1,500 |

These are portal-level limits, not per-user. Hitting these limits will cause list creation to fail with a `LIMIT_EXCEEDED` error.

### Rate Limits

| Operation | Limit |
|-----------|-------|
| List management API | 100 req/10s |
| Membership fetch | 100 req/10s |
| Bulk membership add/remove | 100 records per call |

---

## Mental Model

**Static lists = explicit membership; active lists = computed membership.** This distinction determines the entire set of operations available. Active lists reject add/remove calls — membership is owned by the filter engine. Static lists accept add/remove calls but have no filter criteria.

**Active list processing is asynchronous and delayed.** When you create an active list with filter criteria, HubSpot schedules a processing job. For lists with thousands of records, the initial population can take 5–30 minutes. For ongoing updates (a contact just met the criteria), the delay is typically a few minutes but can be longer during peak load. Never assume an active list is up-to-date in real time.

**Lists reference records by `hs_object_id` (record ID), not email or other properties.** Even though filter criteria reference property values, membership is tracked by internal ID. When adding to a static list, pass the contact's `hs_object_id`, not their email.

**Active list filters use a filter branch tree.** Filters are structured as a tree of OR branches containing AND filters. This maps to: `(condition A AND condition B) OR (condition C AND condition D)`. Understanding this structure is essential for building complex active lists via API. The root is an `OR` branch; each child is an `AND` filter group.

**ILS (Internal List Segmentation) replaced the legacy v1 lists system.** The older v1 API (`/contacts/v1/lists/`) is still accessible but is in maintenance mode. If you encounter legacy code using v1 endpoints, it will still work but should be migrated to v3 for new features and continued support. The `listId` values differ between v1 and v3 — v1 used numeric IDs, v3 uses ILS-specific IDs (also numeric but from a different ID space).

**You cannot convert a static list to active or vice versa.** List type is set at creation and is immutable. If you need to change a list type, create a new list and migrate references.

---

## Common Patterns

### Pattern 1: Create a static contact list

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

async function createStaticList(name: string): Promise<string> {
  const response = await hubspotClient.crm.lists.coreApi.create({
    name,
    objectTypeId: "0-1",     // Contacts
    processingType: "MANUAL", // MANUAL = static list
  });

  // Returns the ILS list ID
  return response.listId;
}

// Usage
const listId = await createStaticList("Q4 2024 Event Attendees");
console.log(`Created list: ${listId}`);
```

### Pattern 2: Add and remove contacts from a static list

```typescript
async function addContactsToList(listId: string, contactIds: string[]) {
  // Max 100 records per call — chunk if needed
  const chunks: string[][] = [];
  for (let i = 0; i < contactIds.length; i += 100) {
    chunks.push(contactIds.slice(i, i + 100));
  }

  const results = { added: 0, alreadyMember: 0, errors: 0 };

  for (const chunk of chunks) {
    const response = await hubspotClient.crm.lists.membershipsApi.addAndRemoveById(
      listId,
      {
        recordIdsToAdd: chunk,
        recordIdsToRemove: [],
      }
    );

    results.added += response.recordsIdsAdded?.length ?? 0;
    results.alreadyMember += response.recordIdsMissing?.length ?? 0;
  }

  return results;
}

async function removeContactsFromList(listId: string, contactIds: string[]) {
  const chunks: string[][] = [];
  for (let i = 0; i < contactIds.length; i += 100) {
    chunks.push(contactIds.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    await hubspotClient.crm.lists.membershipsApi.addAndRemoveById(
      listId,
      {
        recordIdsToAdd: [],
        recordIdsToRemove: chunk,
      }
    );
  }
}
```

### Pattern 3: Create an active list with filter criteria

Active lists use a `filterBranch` tree. This example creates a list of contacts in the "customer" lifecycle stage who have a known email address.

```typescript
async function createActiveList(name: string) {
  const response = await hubspotClient.crm.lists.coreApi.create({
    name,
    objectTypeId: "0-1",       // Contacts
    processingType: "DYNAMIC", // DYNAMIC = active list
    filterBranch: {
      filterBranchType: "OR",
      filterBranches: [
        {
          filterBranchType: "AND",
          filterBranches: [],
          filters: [
            {
              filterType: "PROPERTY",
              property: "lifecyclestage",
              operation: {
                operationType: "ENUMERATION",
                operator: "IS_ANY_OF",
                values: ["customer"],
                includeObjectsWithNoValueSet: false,
              },
            },
            {
              filterType: "PROPERTY",
              property: "email",
              operation: {
                operationType: "MULTI_STRING",
                operator: "IS_NOT_EMPTY",
                includeObjectsWithNoValueSet: false,
              },
            },
          ],
        },
      ],
      filters: [],
    },
  });

  return response.listId;
}
```

### Pattern 4: Search for lists by name

```typescript
interface ListSummary {
  listId: string;
  name: string;
  processingType: string; // "MANUAL" or "DYNAMIC"
  objectTypeId: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

async function searchListsByName(query: string): Promise<ListSummary[]> {
  const response = await hubspotClient.crm.lists.listsApi.search(
    undefined, // listIds
    undefined, // offset
    query,     // query string — searches by name
    undefined, // count
    undefined, // processingTypes
    undefined, // additionalPropertiesMap
    undefined  // sort
  );

  return (response.lists ?? []).map(list => ({
    listId: list.listId,
    name: list.name,
    processingType: list.processingType,
    objectTypeId: list.objectTypeId,
    size: list.size ?? 0,
    createdAt: new Date(list.createdAt),
    updatedAt: new Date(list.updatedAt),
  }));
}
```

### Pattern 5: Paginate all members of a list

```typescript
async function* getListMembers(listId: string): AsyncGenerator<string> {
  let after: string | undefined;

  do {
    const response = await hubspotClient.crm.lists.membershipsApi.getPage(
      listId,
      after,   // after cursor
      undefined, // before
      100       // limit
    );

    for (const member of (response.results ?? [])) {
      yield member.recordId;
    }

    after = response.paging?.next?.after;
  } while (after);
}

// Usage: export all list member IDs
const memberIds: string[] = [];
for await (const memberId of getListMembers("your-list-id")) {
  memberIds.push(memberId);
}
console.log(`List has ${memberIds.length} members`);
```

### Pattern 6: Get all lists a contact belongs to

```typescript
async function getContactListMemberships(contactId: string): Promise<string[]> {
  const response = await hubspotClient.crm.lists.membershipsApi.getListMembershipsRecordIsIn(
    "0-1",       // objectTypeId for Contacts
    contactId,   // the contact's hs_object_id
    undefined,   // after
    undefined,   // before
    undefined    // limit
  );

  return (response.results ?? []).map(m => m.listId);
}

// Usage: find which lists contact 123456 is in, then fetch list details
const contactId = "123456";
const listIds = await getContactListMemberships(contactId);

if (listIds.length > 0) {
  // Fetch multiple list details in one call
  const listsResponse = await hubspotClient.crm.lists.listsApi.getMultiple(
    listIds,
    undefined, // includeFilters
  );
  console.log("Member of:", listsResponse.lists.map(l => l.name));
}
```

### Pattern 7: Update active list filter criteria

```typescript
async function updateActiveListFilters(listId: string, newEmailDomain: string) {
  // Replace the filter branch entirely — this is a PUT, not PATCH
  await hubspotClient.crm.lists.coreApi.updateListFilters(
    listId,
    false, // resetLists — set to true to clear all current members before reprocessing
    {
      filterBranch: {
        filterBranchType: "OR",
        filterBranches: [
          {
            filterBranchType: "AND",
            filterBranches: [],
            filters: [
              {
                filterType: "PROPERTY",
                property: "email",
                operation: {
                  operationType: "MULTI_STRING",
                  operator: "CONTAINS",
                  values: [`@${newEmailDomain}`],
                  includeObjectsWithNoValueSet: false,
                },
              },
            ],
          },
        ],
        filters: [],
      },
    }
  );
}
```

### Pattern 8: Delete a list safely

```typescript
async function deleteList(listId: string, verify = true) {
  if (verify) {
    // Fetch list info to confirm before deletion
    const list = await hubspotClient.crm.lists.coreApi.getById(
      listId,
      false // includeFilters
    );

    if (list.listType === "DYNAMIC") {
      console.warn(
        `Deleting active list "${list.name}" with ${list.size ?? "unknown"} members.`
      );
    }
  }

  await hubspotClient.crm.lists.coreApi.remove(listId);
  // Note: deleted lists can be restored within 90 days via the restore endpoint
}
```

---

## Gotchas

**Active list membership is eventually consistent — never assume real-time accuracy.** After a contact property changes and the contact now meets (or stops meeting) list criteria, there is a processing delay before list membership reflects the change. For large active lists this can be 15–60 minutes. Never use active list membership as a real-time gate in synchronous user flows. Check property values directly instead.

**Adding records to an active list throws an error.** If you call the add membership endpoint on a `DYNAMIC` list, you will get an error like `"Cannot manually add a record to a DYNAMIC list"`. Check `processingType` before calling add/remove — only `MANUAL` lists accept membership mutations.

**List IDs from the v3 API are ILS IDs, not the legacy v1 numeric IDs.** If you have code or stored data referencing v1 list IDs, they will not work with v3 endpoints and vice versa. The ILS ID is returned as `listId` in v3 responses. There is no direct mapping endpoint — you must search by name to find the ILS ID for a legacy list.

**Static list membership `add` is idempotent; it does not error on already-members.** HubSpot returns the count of newly added records vs already-member records in `recordIdsAdded` vs `recordIdsMissing`. A "missing" record in the add response means it was already a member — not an error.

**`resetLists: true` on filter update wipes and reprocesses the entire membership.** When updating an active list's filter branch, the optional `resetLists` parameter controls whether HubSpot clears all current members and reprocesses from scratch. Use `false` (default) for incremental updates. Use `true` only when you need to purge members who no longer qualify under a completely different filter logic — be aware this can take significant time on large lists.

**List limits are enforced at creation, not at capacity.** HubSpot checks whether you are under your tier's list limit when you create a new list. If you are at the limit (e.g., 1,000 active lists on Professional), the creation call fails with `LIMIT_EXCEEDED`. The workaround is to delete unused lists before creating new ones. Check active list count with a search call before attempting bulk creation.

**Company lists use `objectTypeId: "0-2"` and are otherwise equivalent.** The Lists API works identically for companies as it does for contacts — same endpoints, same filter structure, just a different `objectTypeId`. Company list filters reference company properties (e.g., `numberofemployees`, `industry`, `country`).

**Filter operators are case-sensitive strings.** Common operators: `EQ`, `NEQ`, `GT`, `GTE`, `LT`, `LTE`, `CONTAINS`, `NOT_CONTAINS`, `IS_ANY_OF`, `IS_NOT_ANY_OF`, `IS_EMPTY`, `IS_NOT_EMPTY`, `HAS_EVER_BEEN_EQUAL_TO`, `HAS_NEVER_BEEN_EQUAL_TO`. Using the wrong case or a typo will result in a `400 Bad Request` with a generic validation message that doesn't identify the specific invalid operator.

**Deleted lists can be restored within 90 days.** HubSpot soft-deletes lists. If you accidentally delete a list, call the restore endpoint within 90 days to recover it along with its membership. After 90 days, the list is permanently purged.

**Membership pagination uses cursor-based `after` values, not page numbers.** Do not attempt to calculate page offsets — always use the `paging.next.after` value from the previous response as the `after` parameter for the next call. Attempting to paginate with a numeric offset will not work.

---

## Official Documentation

- Lists API (v3): https://developers.hubspot.com/docs/api/crm/lists
- List Filter Branch Reference: https://developers.hubspot.com/docs/api/crm/list-filters-definitions
- Lists API Changelog: https://developers.hubspot.com/changelog/lists-v3-api-now-generally-available
- Legacy Lists API (v1, maintenance mode): https://legacydocs.hubspot.com/docs/methods/lists/lists-overview
- Node.js SDK — Lists: https://github.com/HubSpot/hubspot-api-nodejs/tree/main/codegen/crm/lists
- HubSpot Knowledge Base — Lists Overview: https://knowledge.hubspot.com/lists/create-active-or-static-lists
