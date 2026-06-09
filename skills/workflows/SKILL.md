---
strata_id: 21a29fe6-a6b3-4fb7-8526-05a534d10828
type: note
created: 2026-05-03T18:44:06+00:00
modified: 2026-05-03T18:44:06.669871732+00:00
metadata:
  docs:
  - https://developers.hubspot.com/docs/api/automation/workflows
  importPatterns:
  - '@hubspot/api-client'
  pathPatterns:
  - '**/workflows/**'
  - '**/workflow*'
  - '**/automation/**'
  priority: 6
  promptSignals:
    phrases:
    - hubspot workflow
    - hubspot automation
    - hubspot trigger
    - workflow action
    - enrollment criteria
    - custom code action
    - workflow branch
name: workflows
description: HubSpot Workflows — automation triggers, actions, branching logic, and custom code actions for contact/company/deal-based automation.
---

## What It Is & When to Use It

Workflows are HubSpot's automation engine. They enroll CRM records when trigger criteria are met and execute a sequence of actions (send email, update property, create task, notify user, branch on conditions, run custom code). Available for all Hub tiers, though advanced features require Marketing Hub, Sales Hub, or Operations Hub Professional+.

Use this skill when reading workflow data programmatically, creating or modifying workflows via API, building custom code actions, or understanding enrollment behavior and trigger logic.

---

## Service Surface

**Note:** The Workflows API is under `/automation/v4/flows/` (newer) and some legacy endpoints under `/automation/v3/`. The v4 API is preferred for new integrations.

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List workflows | `/automation/v4/flows` | GET |
| Get workflow | `/automation/v4/flows/{flowId}` | GET |
| Create workflow | `/automation/v4/flows` | POST |
| Update workflow | `/automation/v4/flows/{flowId}` | PATCH |
| Delete workflow | `/automation/v4/flows/{flowId}` | DELETE |
| Enroll record | `/automation/v4/flows/{flowId}/enrollments` | POST |
| Unenroll record | `/automation/v4/flows/{flowId}/enrollments/{enrollmentId}` | DELETE |

**Required scopes:** `automation` (for reading/managing workflows)

**Workflow types by enrolled object:**
| Type | Object | Triggers On |
|------|--------|-------------|
| Contact-based | Contacts | Contact properties, form submissions, list membership |
| Company-based | Companies | Company properties, associated contact actions |
| Deal-based | Deals | Deal stage changes, deal properties, close date |
| Ticket-based | Tickets | Ticket properties, pipeline stage |
| Quote-based | Quotes | Quote status, expiry |
| Custom object | Custom objects | Custom object property changes (Ops Hub Pro+) |

---

## Mental Model

**Workflows are an enrollment engine.** A record enters a workflow when it matches enrollment triggers. It then progresses through actions sequentially. Timing delays, branches, and loops are supported.

**Enrollment triggers are evaluated in real-time.** When a contact's property changes, HubSpot evaluates all workflows to determine if enrollment criteria are now met. For high-frequency property changes, this can cause unexpected re-enrollment.

**Re-enrollment is opt-in.** By default, a record only enrolls once in a given workflow. Re-enrollment must be explicitly enabled if you want records to go through the workflow again after property changes.

**Custom code actions (Node.js) run in a sandbox.** Operations Hub Professional/Enterprise unlocks custom code actions. They run in a Node.js Lambda-like environment with access to input properties and can output new property values. They cannot make HubSpot API calls within the execution — use the output properties to trigger subsequent API calls.

**Branches are if/else forks.** Branch actions evaluate conditions on the enrolled record and route to different action sequences. Complex logic can be built with nested branches.

---

## Common Patterns

### Pattern 1: List all workflows

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

async function listWorkflows() {
  const response = await hubspotClient.automation.v4.flows.getAll();

  return response.results.map(flow => ({
    id: flow.id,
    name: flow.name,
    type: flow.type,
    enabled: flow.enabled,
    enrollmentCriteria: flow.enrollmentCriteria,
  }));
}
```

### Pattern 2: Get workflow details

```typescript
async function getWorkflow(flowId: number) {
  const flow = await hubspotClient.automation.v4.flows.getById(flowId);

  return {
    id: flow.id,
    name: flow.name,
    type: flow.type,
    enabled: flow.enabled,
    objectType: flow.objectTypeId,
    actions: flow.actions,
  };
}
```

### Pattern 3: Manually enroll a contact in a workflow

```typescript
async function enrollContactInWorkflow(flowId: number, contactId: string) {
  await hubspotClient.automation.v4.flows.enrollments.create(flowId, {
    objectType: "CONTACT",
    objectId: contactId,
  });
}
```

### Pattern 4: Custom code action template (Node.js, runs inside HubSpot)

```javascript
// This code runs INSIDE HubSpot's workflow custom code action sandbox.
// Not called via the API — it's code you paste into the HubSpot UI.

exports.main = async (event, callback) => {
  // Input properties are passed from the enrolled record
  const email = event.inputFields["email"];
  const firstName = event.inputFields["firstname"];

  // Perform custom logic
  const score = calculateLeadScore(email, firstName);

  // Return output properties to be set on the record
  callback({
    outputFields: {
      lead_score: score,
      last_scored_at: new Date().toISOString(),
    }
  });
};

function calculateLeadScore(email, firstName) {
  // Custom scoring logic
  let score = 50;
  if (email?.includes(".edu")) score += 20;
  if (firstName) score += 10;
  return score;
}
```

### Pattern 5: Create a simple workflow via API

```typescript
async function createContactWorkflow(params: {
  name: string;
  propertyName: string;
  propertyValue: string;
}) {
  // Workflow creation via API requires careful action/trigger structure
  // Check the API docs for current schema — it evolves frequently
  const flow = await hubspotClient.automation.v4.flows.create({
    name: params.name,
    type: "CONTACT_DATE_CENTERED",
    objectTypeId: "0-1", // Contacts
    enabled: false, // Create disabled, enable manually after review
    enrollmentCriteria: {
      filterBranch: {
        filterBranchType: "AND",
        filters: [{
          filterType: "PROPERTY",
          property: params.propertyName,
          operation: {
            operationType: "MULTISTRING",
            operator: "IS_ANY_OF",
            values: [params.propertyValue],
          },
        }],
      },
      type: "STATIC_AUDIENCE",
      listMembershipType: "MEMBER",
    },
    actions: [],
  });

  return flow.id;
}
```

---

## Gotchas

**The Workflows API schema is complex and evolving.** The v4 API introduces a new action schema that differs from v3. Always check the current API reference before writing workflow creation code — field names and structures change between versions.

**Custom code actions cannot call the HubSpot API directly.** The sandbox environment doesn't include the HubSpot client. Use output property values to trigger subsequent API calls outside the workflow, or use the `hs_execution_state` property pattern.

**Re-enrollment must be explicitly configured.** If a contact's property changes multiple times and you want the workflow to run each time, re-enrollment must be enabled on the workflow. Default behavior enrolls once per record lifetime.

**Workflow enrollment can be delayed.** After a trigger condition is met, enrollment is typically near-real-time but can lag up to a few minutes under heavy load.

**Disabling a workflow does not unenroll active records.** Records that are already enrolled continue through actions. Disable the workflow to stop new enrollments, but active executions complete.

**Custom code actions require Operations Hub Professional.** Contact-based, company-based, and deal-based workflows are available at lower tiers, but the "Custom Code" action type is gated behind Ops Hub Pro/Enterprise.

**The workflow API is not suitable for high-frequency automation.** For real-time event-driven processing, use Webhooks + your own backend instead of workflows. Workflows are designed for CRM-state-change automation, not sub-second response times.

---

## Official Documentation

- Workflows API (v4): https://developers.hubspot.com/docs/api/automation/workflows
- Custom Code Actions: https://knowledge.hubspot.com/workflows/how-to-use-custom-code-actions-in-workflows
- Workflow Enrollment API: https://developers.hubspot.com/docs/api/automation/workflows#enrollment
- Operations Hub Automation: https://knowledge.hubspot.com/automation/use-programmable-automation