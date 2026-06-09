---
strata_id: 06865679-2ee5-42f2-b59b-8b942d890427
type: note
created: 2026-05-03T18:43:28+00:00
modified: 2026-05-03T18:43:28.720846976+00:00
name: custom-objects
description: HubSpot Custom Objects — schema definition, property configuration, associations, and CRUD for non-standard CRM objects.
metadata:
  docs:
  - https://developers.hubspot.com/docs/api/crm/crm-custom-objects
  importPatterns:
  - '@hubspot/api-client'
  pathPatterns:
  - '**/custom-objects/**'
  - '**/schemas/**'
  priority: 7
  promptSignals:
    phrases:
    - custom object
    - hubspot schema
    - object definition
    - custom crm object
    - crm schema
    - object type
    - custom properties schema
---

## What It Is & When to Use It

Custom Objects let you define new CRM object types beyond the standard set (Contacts, Companies, Deals, etc.). Use them when your data model has entities that don't fit standard objects — e.g., Subscriptions, Properties (real estate), Equipment, Events, or Shipments.

Custom Objects require **Operations Hub Professional or Enterprise**. Use this skill when designing a new object schema, defining properties and associations, or implementing CRUD for a custom object type.

---

## Service Surface

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List schemas | `/crm/v3/schemas` | GET |
| Get schema | `/crm/v3/schemas/{objectType}` | GET |
| Create schema | `/crm/v3/schemas` | POST |
| Update schema | `/crm/v3/schemas/{objectType}` | PATCH |
| Delete schema | `/crm/v3/schemas/{objectType}` | DELETE |
| Create property | `/crm/v3/properties/{objectType}` | POST |
| Create object record | `/crm/v3/objects/{objectType}` | POST |
| Get object record | `/crm/v3/objects/{objectType}/{id}` | GET |
| Update object record | `/crm/v3/objects/{objectType}/{id}` | PATCH |
| Search object records | `/crm/v3/objects/{objectType}/search` | POST |
| Create association def | `/crm/v4/associations/{fromType}/{toType}/labels` | POST |

**Required scopes:** `crm.schemas.read`, `crm.schemas.write`, plus `crm.objects.{customObjectType}.read/write`

---

## Mental Model

**A schema is the type definition.** It declares the object's name, plural name, required properties, and searchable properties. Creating a schema is a one-time operation per object type.

**The `fullyQualifiedName` is what you use in API calls.** When you create a schema, HubSpot assigns it a `fullyQualifiedName` like `p_subscription` (the `p_` prefix indicates a portal-specific object). Use this as the `objectType` in all subsequent API calls.

**Properties belong to the schema.** Define properties when creating the schema (`requiredProperties`, `searchableProperties`) or add them afterward via the Properties API. Properties are typed and cannot change type after creation.

**Associations are defined separately.** You define which standard or custom objects your custom object can be associated with. Associations are many-to-many by default.

**Object records work identically to standard objects.** Once you have a schema, creating/reading/searching records uses the same endpoints as contacts or companies — just with your `fullyQualifiedName` as the object type.

---

## Common Patterns

### Pattern 1: Create a custom object schema

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

async function createSubscriptionSchema() {
  const response = await hubspotClient.crm.schemas.coreApi.create({
    name: "subscription",
    labels: {
      singular: "Subscription",
      plural: "Subscriptions",
    },
    primaryDisplayProperty: "subscription_name",
    requiredProperties: ["subscription_name"],
    searchableProperties: ["subscription_name", "plan_type", "status"],
    properties: [
      {
        name: "subscription_name",
        label: "Subscription Name",
        type: "string",
        fieldType: "text",
        groupName: "subscription_information",
      },
      {
        name: "plan_type",
        label: "Plan Type",
        type: "enumeration",
        fieldType: "select",
        groupName: "subscription_information",
        options: [
          { label: "Free", value: "free", displayOrder: 0, hidden: false },
          { label: "Pro", value: "pro", displayOrder: 1, hidden: false },
          { label: "Enterprise", value: "enterprise", displayOrder: 2, hidden: false },
        ],
      },
      {
        name: "status",
        label: "Status",
        type: "enumeration",
        fieldType: "select",
        groupName: "subscription_information",
        options: [
          { label: "Active", value: "active", displayOrder: 0, hidden: false },
          { label: "Cancelled", value: "cancelled", displayOrder: 1, hidden: false },
          { label: "Trial", value: "trial", displayOrder: 2, hidden: false },
        ],
      },
      {
        name: "mrr",
        label: "Monthly Recurring Revenue",
        type: "number",
        fieldType: "number",
        groupName: "subscription_information",
      },
      {
        name: "start_date",
        label: "Start Date",
        type: "date",
        fieldType: "date",
        groupName: "subscription_information",
      },
    ],
    associatedObjects: ["CONTACT", "COMPANY"],
  });

  console.log("Schema created:", response.fullyQualifiedName);
  // Returns something like "p_subscription"
  return response.fullyQualifiedName;
}
```

### Pattern 2: Create a record for a custom object

```typescript
async function createSubscription(data: {
  name: string;
  planType: "free" | "pro" | "enterprise";
  status: "active" | "trial" | "cancelled";
  mrr?: number;
  startDateMs?: number;
  contactId?: string;
}) {
  // Use fullyQualifiedName from schema creation
  const objectType = "p_subscription";

  const associations = [];
  if (data.contactId) {
    // Association type ID for custom objects to contacts must be looked up
    // via the Associations API after schema creation
    associations.push({
      to: { id: data.contactId },
      types: [{
        associationCategory: "HUBSPOT_DEFINED" as const,
        associationTypeId: 1, // verify this ID via associations labels API
      }],
    });
  }

  const record = await hubspotClient.crm.objects.basicApi.create(objectType, {
    properties: {
      subscription_name: data.name,
      plan_type: data.planType,
      status: data.status,
      ...(data.mrr !== undefined && { mrr: String(data.mrr) }),
      ...(data.startDateMs !== undefined && { start_date: String(data.startDateMs) }),
    },
    associations,
  });

  return record.id;
}
```

### Pattern 3: Search custom object records

```typescript
async function searchSubscriptions(params: {
  planType?: string;
  status?: string;
  after?: string;
}) {
  const objectType = "p_subscription";
  const filters = [];

  if (params.planType) {
    filters.push({
      propertyName: "plan_type",
      operator: "EQ" as const,
      value: params.planType,
    });
  }

  if (params.status) {
    filters.push({
      propertyName: "status",
      operator: "EQ" as const,
      value: params.status,
    });
  }

  const response = await hubspotClient.crm.objects.searchApi.doSearch(objectType, {
    filterGroups: filters.length > 0 ? [{ filters }] : [],
    properties: ["subscription_name", "plan_type", "status", "mrr"],
    limit: 50,
    after: params.after ? parseInt(params.after, 10) : 0,
    sorts: [],
    query: "",
  });

  return {
    results: response.results,
    nextCursor: response.paging?.next?.after,
  };
}
```

### Pattern 4: Get association type IDs for a custom object

```typescript
async function getAssociationTypes(fromObjectType: string, toObjectType: string) {
  const response = await hubspotClient.crm.associations.v4.schema.definitionsApi.getAll(
    fromObjectType,
    toObjectType
  );

  return response.results.map(def => ({
    typeId: def.typeId,
    label: def.label,
    category: def.category,
    name: def.name,
  }));
}

// Usage: find the type ID to use when associating p_subscription to contacts
const types = await getAssociationTypes("p_subscription", "contacts");
```

---

## Gotchas

**Custom Objects require Operations Hub Pro or Enterprise.** Attempting to create schemas on a Starter or Free portal returns a 403. Verify the portal's subscription before building.

**Schema names must be unique and lowercase.** Use `snake_case`. You cannot rename a schema after creation — the `fullyQualifiedName` is permanent. Choose names carefully.

**`fullyQualifiedName` is `p_{name}`, not `{name}`.** The `p_` prefix is HubSpot-assigned. If you named your schema `subscription`, you use `p_subscription` in all object-level API calls.

**Properties cannot change type after creation.** You can add new properties but cannot change `type` or `fieldType` on existing ones. Plan your schema carefully. The only workaround is to create a new property and migrate data.

**Association type IDs for custom objects are not predefined.** Unlike contacts-to-companies (type ID 279), association type IDs for custom object pairs are assigned when you create the association definition. Always look them up via the associations labels API rather than hardcoding.

**Deleting a schema is destructive and irreversible.** All records of that object type are permanently deleted. There is a soft-delete (`/crm/v3/schemas/{type}?archived=true`) but full purge with DELETE removes everything.

**Enumeration options can be added but not removed via API if records use them.** If a property has records with a given enum value, deleting that option from the property schema will fail. Archive the option instead.

---

## Official Documentation

- Custom Objects Overview: https://developers.hubspot.com/docs/api/crm/crm-custom-objects
- Schema API Reference: https://developers.hubspot.com/docs/api/crm/crm-custom-objects#schema-api
- Properties API: https://developers.hubspot.com/docs/api/crm/properties
- Associations v4: https://developers.hubspot.com/docs/api/crm/associations
- Node.js SDK Schemas: https://github.com/HubSpot/hubspot-api-nodejs/blob/main/codegen/crm/schemas/README.md