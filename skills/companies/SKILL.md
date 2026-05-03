---
name: companies
description: HubSpot CRM Companies — CRUD, search, domain-based deduplication, and associations with contacts and deals.
metadata:
  priority: 7
  pathPatterns:
    - "**/companies/**"
    - "**/company*"
  importPatterns:
    - "@hubspot/api-client"
  promptSignals:
    phrases:
      - "hubspot company"
      - "company property"
      - "crm company"
      - "create company"
      - "update company"
      - "search companies"
      - "company domain"
  docs:
    - "https://developers.hubspot.com/docs/api/crm/companies"
---

## What It Is & When to Use It

Companies represent organizations in HubSpot CRM. They link to contacts (employees), deals (opportunities), and tickets (support cases). HubSpot has automatic company creation based on contact email domains — understanding this behavior is critical for avoiding duplicates.

Use this skill when creating or syncing company records, searching by domain, managing company properties, or associating companies with contacts and deals.

---

## Service Surface

| Operation | Endpoint | Method | Max Batch |
|-----------|----------|--------|-----------|
| Get company by ID | `/crm/v3/objects/companies/{id}` | GET | — |
| List companies | `/crm/v3/objects/companies` | GET | 100/page |
| Create company | `/crm/v3/objects/companies` | POST | — |
| Update company | `/crm/v3/objects/companies/{id}` | PATCH | — |
| Delete company | `/crm/v3/objects/companies/{id}` | DELETE | — |
| Search companies | `/crm/v3/objects/companies/search` | POST | 200/page |
| Batch read | `/crm/v3/objects/companies/batch/read` | POST | 100 |
| Batch create | `/crm/v3/objects/companies/batch/create` | POST | 100 |
| Batch update | `/crm/v3/objects/companies/batch/update` | POST | 100 |
| Batch upsert | `/crm/v3/objects/companies/batch/upsert` | POST | 100 |

**Required scopes:** `crm.objects.companies.read`, `crm.objects.companies.write`

**Key default properties:** `name`, `domain`, `industry`, `city`, `state`, `country`, `phone`, `website`, `numberofemployees`, `annualrevenue`, `hs_object_id`

---

## Mental Model

**`domain` is the natural unique identifier for companies.** HubSpot deduplicates companies by domain. If you try to create a company with a domain that already exists, HubSpot will not automatically merge — you'll create a duplicate. Always search by domain before creating.

**HubSpot has automatic company association.** When a contact's email matches a company domain (e.g., `user@acme.com` → `acme.com`), HubSpot can automatically associate them if "Automatic company association" is enabled in portal settings. This can cause unexpected associations if you're managing data programmatically.

**The `hs_object_id` is the stable identifier.** Domains can change. `hs_object_id` never changes for a given record.

**Companies can have multiple contacts.** There is no single "primary contact" — associations are many-to-many.

---

## Common Patterns

### Pattern 1: Search company by domain

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

async function findCompanyByDomain(domain: string) {
  const response = await hubspotClient.crm.companies.searchApi.doSearch({
    filterGroups: [{
      filters: [{
        propertyName: "domain",
        operator: "EQ",
        value: domain.toLowerCase(),
      }],
    }],
    properties: ["name", "domain", "industry", "numberofemployees"],
    limit: 1,
    after: 0,
    sorts: [],
    query: "",
  });

  return response.results[0] ?? null;
}
```

### Pattern 2: Upsert company by domain

```typescript
async function upsertCompany(data: {
  name: string;
  domain: string;
  industry?: string;
  numberOfEmployees?: number;
}) {
  // First check if company exists
  const existing = await findCompanyByDomain(data.domain);

  if (existing) {
    await hubspotClient.crm.companies.basicApi.update(existing.id, {
      properties: {
        name: data.name,
        ...(data.industry && { industry: data.industry }),
        ...(data.numberOfEmployees && {
          numberofemployees: String(data.numberOfEmployees)
        }),
      },
    });
    return { id: existing.id, created: false };
  } else {
    const created = await hubspotClient.crm.companies.basicApi.create({
      properties: {
        name: data.name,
        domain: data.domain,
        ...(data.industry && { industry: data.industry }),
        ...(data.numberOfEmployees && {
          numberofemployees: String(data.numberOfEmployees)
        }),
      },
      associations: [],
    });
    return { id: created.id, created: true };
  }
}
```

### Pattern 3: Get company with associated contacts

```typescript
import { AssociationSpecAssociationCategoryEnum } from "@hubspot/api-client/lib/codegen/crm/companies";

async function getCompanyWithContacts(companyId: string) {
  const company = await hubspotClient.crm.companies.basicApi.getById(
    companyId,
    ["name", "domain", "industry"],
    undefined,
    ["contacts"] // request associations
  );

  return {
    id: company.id,
    name: company.properties.name,
    domain: company.properties.domain,
    contactIds: company.associations?.contacts?.results?.map(a => a.id) ?? [],
  };
}
```

### Pattern 4: Associate a company with a contact

```typescript
async function associateContactWithCompany(contactId: string, companyId: string) {
  await hubspotClient.crm.associations.v4.basicApi.create(
    "contacts",
    contactId,
    "companies",
    companyId,
    [{
      associationCategory: "HUBSPOT_DEFINED",
      associationTypeId: 279, // contact_to_company
    }]
  );
}
```

### Pattern 5: Batch update companies

```typescript
async function batchUpdateCompanies(updates: Array<{ id: string; properties: Record<string, string> }>) {
  const chunks = [];
  for (let i = 0; i < updates.length; i += 100) {
    chunks.push(updates.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    await hubspotClient.crm.companies.batchApi.update({
      inputs: chunk.map(u => ({
        id: u.id,
        properties: u.properties,
      })),
    });
  }
}
```

---

## Gotchas

**Domain deduplication is not automatic via API.** The API will happily create two companies with the same domain. Always check before creating. Use the search-by-domain pattern as a guard.

**`domain` property is the website root domain, not a URL.** Store `acme.com`, not `https://www.acme.com`. HubSpot strips the protocol and `www` when matching for auto-association, but stored values should be clean domains.

**`numberofemployees` is stored as a string.** Even though it appears numeric in the UI, the API treats it as a string property. Pass `"500"` not `500`.

**Industry values are enumeration options.** You can't set any string — the value must match one of HubSpot's predefined options (or your custom options). The available values are retrievable via the Properties API.

**Automatic company creation can race with your sync.** If HubSpot's auto-create feature is enabled and contacts are being created simultaneously, you may find companies already exist when you try to create them. Always handle 409 conflicts and search-before-create.

**Deleting companies does not delete associations.** If you delete a company, its associated contacts and deals lose that association but are not deleted. This is correct behavior, but be aware of it when auditing data.

---

## Official Documentation

- Companies API: https://developers.hubspot.com/docs/api/crm/companies
- Company Properties: https://developers.hubspot.com/docs/api/crm/properties
- Associations v4: https://developers.hubspot.com/docs/api/crm/associations
- Auto-association Settings: https://knowledge.hubspot.com/contacts/associate-contacts-and-companies-automatically
