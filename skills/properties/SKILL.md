---
name: properties
description: HubSpot Properties API — custom properties, property groups, property options, calculated properties. Use when extending the CRM data model.
metadata:
  priority: 6
  docs:
    - "https://developers.hubspot.com/docs/api/crm/properties"
  pathPatterns:
    - '**/properties/**'
    - '**/property*'
  bashPatterns: []
  importPatterns:
    - "@hubspot/api-client"
  promptSignals:
    phrases:
      - "hubspot property"
      - "custom property"
      - "property group"
      - "property options"
      - "calculated property"
      - "property type"
      - "crm property"
---

## What It Is & When to Use It

Every data field on a HubSpot CRM record is a property. The Properties API lets you read the existing schema, create custom fields on any object type, manage the dropdown/checkbox options for enumeration fields, and organize properties into display groups in the CRM UI.

Use this skill when:
- Adding custom fields to contacts, companies, deals, tickets, or custom objects
- Reading the full property schema to understand what fields exist before building an integration
- Managing enumeration options (adding, hiding, or reordering dropdown/checkbox values)
- Creating property groups to organize fields in the CRM sidebar
- Inspecting internal property names before referencing them in search filters or batch updates
- Working with calculated or formula properties (Operations Hub Professional+)

Properties defined here become the columns available in search filters, list criteria, workflow enrollment conditions, and reports. Getting the data model right is foundational — property internal names are immutable after creation.

---

## Service Surface

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List all properties | `/crm/v3/properties/{objectType}` | GET |
| Get property by name | `/crm/v3/properties/{objectType}/{propertyName}` | GET |
| Create property | `/crm/v3/properties/{objectType}` | POST |
| Update property | `/crm/v3/properties/{objectType}/{propertyName}` | PATCH |
| Archive property | `/crm/v3/properties/{objectType}/{propertyName}` | DELETE |
| Batch read properties | `/crm/v3/properties/{objectType}/batch/read` | POST |
| List property groups | `/crm/v3/properties/{objectType}/groups` | GET |
| Create property group | `/crm/v3/properties/{objectType}/groups` | POST |
| Update property group | `/crm/v3/properties/{objectType}/groups/{groupName}` | PATCH |
| Archive property group | `/crm/v3/properties/{objectType}/groups/{groupName}` | DELETE |

**Object type values:** `contacts`, `companies`, `deals`, `tickets`, `line_items`, `products`, or your custom object's `fullyQualifiedName` (e.g., `p_subscriptions`).

**Required scopes:** `crm.schemas.contacts.read`, `crm.schemas.contacts.write` (replace `contacts` with the appropriate object type). For custom objects: `crm.schemas.custom.read`, `crm.schemas.custom.write`.

**Property types and corresponding field types:**

| Property Type | Valid Field Types | Description |
|--------------|-------------------|-------------|
| `string` | `text`, `textarea`, `html`, `file` | Free-text values |
| `number` | `number` | Numeric values (stored as strings in API) |
| `date` | `date` | Date only, midnight UTC |
| `datetime` | `date` | Date + time, Unix ms timestamp |
| `enumeration` | `select`, `radio`, `checkbox`, `booleancheckbox` | One or many from a defined option set |
| `bool` | `booleancheckbox` | True/false |
| `json` | `text` | JSON blob (advanced use) |
| `phone_number` | `phonenumber` | Phone with country code |
| `object_coordinates` | — | Internal HubSpot use only |

---

## Mental Model

**Property name vs. label vs. internal name.** Every property has three identifiers: the `label` (what users see in the UI, mutable), the `name` (internal API identifier, **immutable after creation**), and the `groupName` (which group it belongs to). API calls always use `name`. Choose internal names carefully — you cannot rename them after the fact.

**Property type is set at creation and cannot change.** A `string` property cannot become `number`. If you made the wrong choice, you must archive the property and create a new one — losing all existing data in the old field.

**Enumeration options have internal values and display labels.** An option's `value` is what the API stores; its `label` is what users see. These can differ. Updating an option's label is safe and doesn't break existing records. Changing an option's `value` does not retroactively update records — existing records keep the old value string.

**`hs_` prefixed properties are read-only HubSpot internals.** You cannot create properties with names starting in `hs_`. These include system-calculated fields like `hs_object_id`, `hs_createdate`, `hs_email_bounce`, etc. You can read them; you cannot write them directly.

**Property groups are display-only.** Groups organize properties into collapsible sections in the CRM record sidebar. Changing a property's `groupName` only affects UI layout — it does not affect data or API access.

**The 1,000 custom property limit is per object type per portal.** This includes all custom properties across all integrations using the portal. In shared portals (like a marketplace app), you're competing for this quota with other apps.

**Calculated properties are a read-only view layer.** They run rollup or formula logic against other properties. You define the formula; HubSpot computes the value. You cannot write to a calculated property directly. Available on Operations Hub Professional+.

---

## Common Patterns

### Pattern 1: List all properties for an object type

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

async function listContactProperties() {
  const response = await hubspotClient.crm.properties.coreApi.getAll(
    "contacts",
    false // archived: false = only active properties
  );

  // Separate custom properties (no hs_ prefix and not HubSpot-defined)
  const customProperties = response.results.filter(
    p => !p.name.startsWith("hs_") && p.createdUserId !== null
  );

  const byGroup = new Map<string, typeof response.results>();
  for (const prop of response.results) {
    const group = prop.groupName ?? "ungrouped";
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group)!.push(prop);
  }

  return {
    all: response.results,
    custom: customProperties,
    byGroup,
  };
}
```

### Pattern 2: Create a custom text property

```typescript
async function createTextProperty(objectType: string, opts: {
  name: string;        // internal name — immutable after creation, use snake_case
  label: string;       // display label — mutable
  groupName: string;   // property group to place it in
  description?: string;
  required?: boolean;
}) {
  const response = await hubspotClient.crm.properties.coreApi.create(objectType, {
    name: opts.name,
    label: opts.label,
    type: "string",
    fieldType: "text",
    groupName: opts.groupName,
    description: opts.description ?? "",
    options: [],
    // formField: true — set to true if you want it available in HubSpot forms
  });

  return response;
}
```

### Pattern 3: Create an enumeration (dropdown) property with options

```typescript
async function createDropdownProperty(objectType: string, opts: {
  name: string;
  label: string;
  groupName: string;
  options: Array<{ label: string; value: string; displayOrder?: number }>;
}) {
  const response = await hubspotClient.crm.properties.coreApi.create(objectType, {
    name: opts.name,
    label: opts.label,
    type: "enumeration",
    fieldType: "select",
    groupName: opts.groupName,
    description: "",
    options: opts.options.map((opt, index) => ({
      label: opt.label,
      value: opt.value,
      displayOrder: opt.displayOrder ?? index,
      hidden: false,
    })),
  });

  return response;
}

// Usage
await createDropdownProperty("contacts", {
  name: "subscription_tier",
  label: "Subscription Tier",
  groupName: "contactinformation",
  options: [
    { label: "Free", value: "free" },
    { label: "Pro", value: "pro" },
    { label: "Enterprise", value: "enterprise" },
  ],
});
```

### Pattern 4: Add a new option to an existing enumeration property

```typescript
async function addOptionToEnumeration(
  objectType: string,
  propertyName: string,
  newOption: { label: string; value: string }
) {
  // First, read the current property to get existing options
  const current = await hubspotClient.crm.properties.coreApi.getByName(
    objectType,
    propertyName
  );

  const existingOptions = current.options ?? [];

  // Append the new option (preserve existing order)
  const updatedOptions = [
    ...existingOptions,
    {
      label: newOption.label,
      value: newOption.value,
      displayOrder: existingOptions.length,
      hidden: false,
    },
  ];

  await hubspotClient.crm.properties.coreApi.update(objectType, propertyName, {
    options: updatedOptions,
  });
}
```

### Pattern 5: Create a number property

```typescript
async function createNumberProperty(objectType: string, opts: {
  name: string;
  label: string;
  groupName: string;
  description?: string;
}) {
  return hubspotClient.crm.properties.coreApi.create(objectType, {
    name: opts.name,
    label: opts.label,
    type: "number",
    fieldType: "number",
    groupName: opts.groupName,
    description: opts.description ?? "",
    options: [],
  });
}
```

### Pattern 6: Create a date property

```typescript
async function createDateProperty(objectType: string, opts: {
  name: string;
  label: string;
  groupName: string;
}) {
  // "date" fieldType = date only (no time)
  // "datetime" fieldType = date + time (stored as Unix ms)
  return hubspotClient.crm.properties.coreApi.create(objectType, {
    name: opts.name,
    label: opts.label,
    type: "date",
    fieldType: "date",
    groupName: opts.groupName,
    description: "",
    options: [],
  });
}

// When writing a date property value, use midnight UTC in ms as a string:
function toHubSpotDate(isoDateString: string): string {
  const d = new Date(isoDateString);
  d.setUTCHours(0, 0, 0, 0);
  return String(d.getTime());
}
```

### Pattern 7: Create a property group

```typescript
async function createPropertyGroup(objectType: string, opts: {
  name: string;   // internal name — immutable
  label: string;  // display name — mutable
  displayOrder?: number;
}) {
  return hubspotClient.crm.properties.groupsApi.create(objectType, {
    name: opts.name,
    label: opts.label,
    displayOrder: opts.displayOrder ?? -1, // -1 = append to end
  });
}
```

### Pattern 8: Check if a property exists before creating it

```typescript
async function ensureProperty(objectType: string, propertyName: string, createFn: () => Promise<void>) {
  try {
    await hubspotClient.crm.properties.coreApi.getByName(objectType, propertyName);
    // Property exists — no action needed
  } catch (err: unknown) {
    const status = (err as { code?: number }).code;
    if (status === 404) {
      await createFn();
    } else {
      throw err;
    }
  }
}

// Usage in app initialization
await ensureProperty("contacts", "subscription_tier", () =>
  createDropdownProperty("contacts", {
    name: "subscription_tier",
    label: "Subscription Tier",
    groupName: "contactinformation",
    options: [{ label: "Free", value: "free" }, { label: "Pro", value: "pro" }],
  })
);
```

### Pattern 9: Hide an obsolete enumeration option (soft deprecation)

```typescript
async function hideEnumerationOption(
  objectType: string,
  propertyName: string,
  optionValueToHide: string
) {
  const current = await hubspotClient.crm.properties.coreApi.getByName(objectType, propertyName);

  const updatedOptions = (current.options ?? []).map(opt => ({
    ...opt,
    hidden: opt.value === optionValueToHide ? true : opt.hidden,
  }));

  await hubspotClient.crm.properties.coreApi.update(objectType, propertyName, {
    options: updatedOptions,
  });
  // Existing records with this value are unaffected — the option just won't appear in UI pickers
}
```

---

## Gotchas

**Internal names are permanent.** The `name` field you set at creation cannot be changed via the API or HubSpot UI. If you pick `"customer_segment"` and later want `"segment"`, you must archive the old property and create a new one — permanently losing all historical data stored in it. Use deliberate, stable naming conventions before writing any records.

**Deleting a property deletes all data in it, with no recovery.** Archiving (DELETE) a property immediately and irreversibly removes every value stored in that field across all records. There is no trash or undo. If in doubt, hide enumeration options or stop writing to the field rather than deleting it.

**Enumeration option `value` strings are what get stored on records — not `label`.** If you change an option's `value` from `"enterprise"` to `"enterprise_plan"`, all existing records retain the old string `"enterprise"`, which will no longer match any option. Those records effectively have an orphaned value. Update the `label` freely; treat `value` as immutable.

**Number properties are stored as strings in the API.** When creating or updating a record, pass `"5000"` not `5000` for a number property. When reading, `contact.properties.annual_revenue` is a string — parse it with `parseFloat()` before doing arithmetic.

**Date properties expect midnight UTC as a Unix millisecond timestamp string.** Passing an ISO date string like `"2024-06-01"` will fail validation or store incorrectly. Use `String(new Date("2024-06-01T00:00:00Z").getTime())`.

**`formField: true` must be set at creation if you want the property available in HubSpot form editors.** This cannot be changed after creation via the API (only via UI). If you forget, you'll need to recreate the property.

**The 1,000 property limit counts archived properties.** Archived properties still count against the quota. If you're hitting limits, you may need to contact HubSpot support to purge archived properties.

**Property groups cannot be renamed via the API — only via UI.** The `PATCH` groups endpoint updates the `displayOrder` but silently ignores `label` changes. Renaming a group must be done in the HubSpot Properties settings UI.

**Calculated properties require Operations Hub Professional+.** Attempting to create a `calculated` type property on a portal without this tier returns a 403. Build a fallback or check portal feature flags before provisioning.

---

## Official Documentation

- Properties API Overview: https://developers.hubspot.com/docs/api/crm/properties
- Property Field Types Reference: https://developers.hubspot.com/docs/api/crm/properties#property-field-types
- Property Groups: https://developers.hubspot.com/docs/api/crm/properties#property-groups
- Calculated Properties: https://developers.hubspot.com/docs/api/crm/properties#calculated-properties
- Node.js SDK Properties: https://github.com/HubSpot/hubspot-api-nodejs/blob/main/codegen/crm/properties/README.md
