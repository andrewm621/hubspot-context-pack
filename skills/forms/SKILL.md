---
strata_id: 3c2d2f55-f142-4684-8ec8-da6f59d1152a
type: note
created: 2026-05-03T18:58:27+00:00
modified: 2026-05-03T18:58:27.201119617+00:00
description: HubSpot Forms API — form creation, submission handling, form fields, progressive profiling, file uploads. Use when building form integrations or processing submissions.
metadata:
  bashPatterns:
  - \bhs\s+forms?\b
  docs:
  - https://developers.hubspot.com/docs/api/marketing/forms
  importPatterns:
  - '@hubspot/api-client'
  pathPatterns:
  - '**/forms/**'
  - '**/form*'
  priority: 5
  promptSignals:
    phrases:
    - hubspot form
    - form submission
    - form field
    - progressive profiling
    - form embed
name: forms
---

## What It Is & When to Use It

HubSpot Forms are the primary mechanism for capturing lead and customer data from web pages. The Forms API serves two distinct use cases: **form management** (creating and configuring forms programmatically) and **form submission** (sending data to HubSpot from external systems or headless implementations).

Form submissions create or update Contact records in the CRM. This is by design — the form submission pipeline is the standard way to bring external data into HubSpot contacts without directly calling the Contacts API. Submissions also trigger workflows, update lists, and record the submission event on the contact's activity timeline.

Use this skill when:
- Collecting data from an external website or app and pushing it into HubSpot
- Embedding a HubSpot form on a site you control (using the embed code or JS API)
- Creating or updating forms programmatically (for agencies or multi-portal setups)
- Processing form submission webhook payloads
- Implementing a custom form UI that backs onto HubSpot field definitions
- Building progressive profiling into your own forms using HubSpot's field logic

---

## Service Surface

### Forms Management API (v3)

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List forms | `/marketing/v3/forms` | GET |
| Get form by ID | `/marketing/v3/forms/{formId}` | GET |
| Create form | `/marketing/v3/forms` | POST |
| Update form | `/marketing/v3/forms/{formId}` | PATCH |
| Delete form | `/marketing/v3/forms/{formId}` | DELETE |

**Required scopes:** `forms`

### Form Submission API

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Submit form data | `/submissions/v3/integration/submit/{portalId}/{formId}` | POST |
| Get submissions for form | `/form-integrations/v1/submissions/forms/{formId}` | GET |

**Required scopes (management):** `forms`
**Submission endpoint:** No auth required for public form submissions (uses `portalId` + `formId` to identify the target). For server-side submissions, include `hutk` (HubSpot tracking cookie) if available.

### File Upload (Form Fields)

File upload fields require a separate upload step before form submission:

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Upload file | `/filemanager/api/v3/files/upload` | POST (multipart/form-data) |

**Required scopes:** `files`

### Rate Limits

| Operation | Limit |
|-----------|-------|
| Form submissions per contact/hour | 1,000 |
| Form submissions API (overall) | 100 req/10s |
| Form management API | 100 req/10s |

---

## Mental Model

**Form submission is a data ingestion pipeline, not just a contact update.** When you submit to a form, HubSpot does significantly more than a plain contact PATCH: it records the submission event on the timeline, fires workflow enrollment checks, updates list memberships, and applies the form's internal logic (notifications, thank-you actions, progressive profiling). A direct Contacts API update does none of these. Choose form submission when you want the full CRM pipeline to fire.

**HubSpot form fields map to contact properties.** Each form field has a `name` that corresponds to the internal name of a HubSpot contact property (e.g., `email`, `firstname`, `phone`, `company`). Custom fields reference custom property internal names. There is no separate "form data" store — all submitted values write to the contact record.

**Progressive profiling shows different fields to known contacts.** When you embed a HubSpot form and a known contact (tracked via the HubSpot cookie `hutk`) visits the page, HubSpot can show fields that contact hasn't filled in yet, rather than asking for the same information again. This only works with the native HubSpot embed — not the submission API.

**Forms come in four types.** Each has different hosting and embedding characteristics:
- **Regular (embedded):** Added to external pages via `<script>` embed code or HubSpot's JS API
- **Pop-up:** Triggered by scroll, exit intent, or time-on-page via a snippet
- **Standalone page:** Hosted on a HubSpot-managed page URL (no external site needed)
- **Collected forms:** Forms on non-HubSpot pages that HubSpot's tracking code detects and captures

**The v3 Forms API and the legacy v2 Forms API are structurally different.** The v3 API uses a JSON schema with `fieldGroups` containing `fields`; the v2 API uses a flat `formFieldList`. The submission endpoint (`/submissions/v3/`) works with both form versions. Use v3 for all new form creation.

---

## Common Patterns

### Pattern 1: Submit form data from an external system

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

interface FormSubmissionData {
  portalId: string;
  formId: string;
  fields: Array<{ name: string; value: string }>;
  // Optional: HubSpot tracking cookie value for attribution
  hutk?: string;
  // Optional: Page context for analytics attribution
  pageUri?: string;
  pageName?: string;
  ipAddress?: string;
}

async function submitFormData(data: FormSubmissionData) {
  // The submission endpoint uses portalId + formId in the URL path
  // It does NOT require an access token — it uses the portalId/formId pair
  // However, calling through the SDK client adds the auth header automatically,
  // which is fine and allows server-side attribution.
  const response = await hubspotClient.apiRequest({
    method: "POST",
    path: `/submissions/v3/integration/submit/${data.portalId}/${data.formId}`,
    body: {
      fields: data.fields,
      context: {
        ...(data.hutk && { hutk: data.hutk }),
        ...(data.pageUri && { pageUri: data.pageUri }),
        ...(data.pageName && { pageName: data.pageName }),
        ...(data.ipAddress && { ipAddress: data.ipAddress }),
      },
      // legalConsentOptions required if GDPR is enabled on the portal
      // legalConsentOptions: {
      //   consent: {
      //     consentToProcess: true,
      //     text: "I agree to receive communications",
      //     communications: [{ value: true, subscriptionTypeId: 999, text: "Marketing emails" }],
      //   },
      // },
    },
  });

  if (!response.ok) {
    const error = await response.json() as any;
    throw new Error(`Form submission failed: ${error.message ?? response.statusText}`);
  }

  // Successful submission returns 200 with no body (or minimal body)
  return { success: true };
}

// Usage: sync a signup from your app into HubSpot
await submitFormData({
  portalId: process.env.HUBSPOT_PORTAL_ID!,
  formId: "abc123de-f456-7890-abcd-ef1234567890",
  fields: [
    { name: "email", value: "jane@example.com" },
    { name: "firstname", value: "Jane" },
    { name: "lastname", value: "Doe" },
    { name: "company", value: "Acme Corp" },
    { name: "phone", value: "+15551234567" },
  ],
  pageUri: "https://yourapp.com/signup",
  pageName: "App Signup",
});
```

### Pattern 2: Get a form definition (fields, configuration)

```typescript
interface FormField {
  name: string;
  label: string;
  type: string;
  required: boolean;
  hidden: boolean;
  defaultValue: string;
  options: Array<{ label: string; value: string }>;
}

interface FormDefinition {
  id: string;
  name: string;
  formType: string;
  fields: FormField[];
  redirectUrl?: string;
  thankYouMessageJson?: string;
  notifyRecipients?: string[];
}

async function getFormDefinition(formId: string): Promise<FormDefinition> {
  const response = await hubspotClient.marketing.forms.formsApi.getById(formId);

  // Extract fields from fieldGroups (v3 structure)
  const fields: FormField[] = [];
  for (const group of (response.fieldGroups ?? [])) {
    for (const field of (group.fields ?? [])) {
      fields.push({
        name: field.name,
        label: field.label ?? field.name,
        type: field.fieldType ?? "text",
        required: field.required ?? false,
        hidden: field.hidden ?? false,
        defaultValue: field.defaultValue ?? "",
        options: (field.options ?? []).map(opt => ({
          label: opt.label ?? "",
          value: opt.value ?? "",
        })),
      });
    }
  }

  return {
    id: response.id ?? formId,
    name: response.name ?? "",
    formType: response.formType ?? "hubspot",
    fields,
  };
}
```

### Pattern 3: Create a form programmatically

```typescript
async function createLeadCaptureForm(config: {
  name: string;
  campaignName?: string;
  notifyEmails?: string[];
  redirectUrl?: string;
}) {
  const response = await hubspotClient.marketing.forms.formsApi.create({
    name: config.name,
    formType: "hubspot",
    // fieldGroups contains the visual layout of the form
    fieldGroups: [
      {
        groupType: "default_group",
        richTextType: "text",
        fields: [
          {
            objectTypeId: "0-1", // Contacts object
            name: "email",
            label: "Email",
            required: true,
            hidden: false,
            fieldType: "email",
            validation: {
              blockedEmailAddresses: [],
              useDefaultBlockList: false,
            },
          },
          {
            objectTypeId: "0-1",
            name: "firstname",
            label: "First name",
            required: false,
            hidden: false,
            fieldType: "single_line_text",
          },
          {
            objectTypeId: "0-1",
            name: "lastname",
            label: "Last name",
            required: false,
            hidden: false,
            fieldType: "single_line_text",
          },
        ],
      },
    ],
    configuration: {
      language: "en",
      cloneable: true,
      editable: true,
      archivable: true,
      // Recaptcha and other settings
      recaptchaEnabled: false,
      notifyContactOwner: false,
      notifyRecipients: config.notifyEmails ?? [],
    },
    displayOptions: {
      renderRawHtml: false,
      style: { fontFamily: "inherit" },
      submitButtonText: "Submit",
    },
    legalConsentOptions: {
      type: "none", // or "implicit" / "explicit" for GDPR portals
    },
  });

  return {
    id: response.id,
    name: response.name,
    embedCode: `<script charset="utf-8" type="text/javascript" src="//js.hsforms.net/forms/embed/v2.js"></script>
<script>
  hbspt.forms.create({
    region: "na1",
    portalId: "${process.env.HUBSPOT_PORTAL_ID}",
    formId: "${response.id}",
  });
</script>`,
  };
}
```

### Pattern 4: Retrieve form submissions with pagination

```typescript
interface FormSubmission {
  submittedAt: Date;
  values: Record<string, string>;
  pageUrl?: string;
  contactId?: string;
}

async function* getFormSubmissions(formId: string): AsyncGenerator<FormSubmission> {
  let after: string | undefined;

  do {
    const params = new URLSearchParams({ limit: "50" });
    if (after) params.set("after", after);

    const response = await hubspotClient.apiRequest({
      method: "GET",
      path: `/form-integrations/v1/submissions/forms/${formId}?${params.toString()}`,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch submissions: ${response.statusText}`);
    }

    const data = await response.json() as any;

    for (const submission of (data.results ?? [])) {
      const values: Record<string, string> = {};
      for (const field of (submission.values ?? [])) {
        values[field.name] = field.value;
      }

      yield {
        submittedAt: new Date(submission.submittedAt),
        values,
        pageUrl: submission.pageUrl,
        contactId: submission.contactId,
      };
    }

    after = data.paging?.next?.after;
  } while (after);
}

// Usage
for await (const submission of getFormSubmissions("your-form-id")) {
  console.log(submission.submittedAt, submission.values.email);
}
```

### Pattern 5: Handle file upload field submissions

File upload fields require uploading the file first, then submitting the returned file URL as the field value.

```typescript
import * as fs from "fs";
import * as path from "path";
import FormData from "form-data";

async function uploadFileForFormField(filePath: string, folderId?: string): Promise<string> {
  const fileContent = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  const formData = new FormData();
  formData.append("file", fileContent, { filename: fileName });
  formData.append("options", JSON.stringify({
    access: "PRIVATE",
    overwrite: false,
    // Optional: place in a specific folder
    ...(folderId && { folderId }),
  }));
  formData.append("folderPath", "/form-uploads");

  // Must use fetch/axios directly — SDK doesn't wrap the filemanager endpoint
  const uploadResponse = await fetch(
    "https://api.hubapi.com/filemanager/api/v3/files/upload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
        ...formData.getHeaders(),
      },
      body: formData as any,
    }
  );

  if (!uploadResponse.ok) {
    throw new Error(`File upload failed: ${uploadResponse.statusText}`);
  }

  const result = await uploadResponse.json() as any;
  // Return the file URL to use as the form field value
  return result.objects?.[0]?.url ?? result.url;
}

async function submitFormWithFileUpload(
  portalId: string,
  formId: string,
  email: string,
  filePath: string,
  fileFieldName: string
) {
  // Step 1: Upload file
  const fileUrl = await uploadFileForFormField(filePath);

  // Step 2: Submit form with file URL as field value
  await submitFormData({
    portalId,
    formId,
    fields: [
      { name: "email", value: email },
      { name: fileFieldName, value: fileUrl },
    ],
  });
}
```

### Pattern 6: Use HubSpot JS embed API for progressive profiling

This is the client-side embed pattern. Progressive profiling only works when using the HubSpot JS embed (not the submission API) because HubSpot needs to read the `hutk` cookie to identify returning contacts and determine which fields to show.

```html
<!-- Place in your page head or body -->
<script charset="utf-8" type="text/javascript" src="//js.hsforms.net/forms/embed/v2.js"></script>

<div id="hubspot-form-container"></div>

<script>
  hbspt.forms.create({
    region: "na1",                              // "na1" for US, "eu1" for EU data center
    portalId: "YOUR_PORTAL_ID",
    formId: "YOUR_FORM_ID",
    target: "#hubspot-form-container",          // CSS selector for mount point

    // Optional callbacks
    onFormReady: function(form) {
      console.log("Form loaded", form);
    },
    onFormSubmit: function(form, data) {
      // data is an array of { name, value } objects
      console.log("Form submitted", data);
    },
    onFormSubmitted: function(form, data) {
      // Fires after successful submission confirmed by HubSpot
      console.log("Submission confirmed");
    },
  });
</script>
```

---

## Gotchas

**Form submissions create contacts — duplicates are a real risk.** Every form submission with a new email address creates a new contact. If you're submitting the same email multiple times (e.g., multiple pages of a multi-step form), HubSpot will update the existing contact rather than create a duplicate, but only if the email matches exactly. Submitting without an email creates a new anonymous contact each time — avoid this.

**The submission endpoint returns 200 for malformed submissions without error details.** HubSpot's form submission endpoint is designed for frontend use where the caller cannot inspect server errors easily. Some validation failures (unknown property name, value format mismatch) return HTTP 200 with an error body rather than a 4xx status. Always check the response body for an `"error"` or `"errors"` key, not just the HTTP status code.

**File upload size limit is 20MB per file.** The HubSpot file manager enforces a 20MB limit on uploads. Files larger than this will be rejected with a `413 Payload Too Large` response. For larger files, use external storage and store the URL as a text field value.

**CORS blocks direct browser-to-API form submissions on non-HubSpot pages.** The submission API (`/submissions/v3/`) does accept cross-origin requests from any domain, but the `Authorization` header cannot be sent from a browser due to CORS preflight restrictions. Server-side submissions (your backend calls the API) work fine with auth. Browser-side submissions should use the native HubSpot JS embed or the public submission endpoint without auth.

**Progressive profiling requires the HubSpot tracking cookie (`hutk`).** For progressive profiling to work, the visitor must have the HubSpot tracking code on the page so the `hubspotutk` cookie is set. The cookie value (passed as `hutk` in the context object) is how HubSpot identifies returning contacts. Without it, every form render shows the full field list.

**The v3 forms API structure (`fieldGroups`) is different from the v2 API (`formFieldList`).** Mixing up these structures is a common source of errors when creating forms. The v3 API requires fields nested inside `fieldGroups`. Fields submitted directly at the top level will be ignored or rejected.

**Form field `name` must match a contact property internal name exactly.** If you submit `{ name: "first_name", value: "Jane" }` when the HubSpot property internal name is `firstname`, the value is silently dropped — no error, no update. Always verify property internal names in HubSpot Settings > Properties before mapping fields.

**Submission rate limiting is per contact, not per IP.** HubSpot allows up to 1,000 submissions per contact per hour. This is surprisingly generous for legitimate use cases, but be aware that if you're syncing historical data (backfilling submissions), you should pace the submissions or use the Contacts API batch upsert instead, which has a higher throughput.

**`formType` must be `"hubspot"` for programmatically created forms.** Other values like `"captured"` are set by HubSpot internally for forms it detects on external pages. Always specify `"hubspot"` when creating via API.

---

## Official Documentation

- Forms API (v3): https://developers.hubspot.com/docs/api/marketing/forms
- Form Submission API: https://developers.hubspot.com/docs/api/marketing/forms#submit-data-to-a-form
- Form Submissions (Legacy v1): https://legacydocs.hubspot.com/docs/methods/forms/get-submissions-for-a-form
- HubSpot JS Embed API: https://developers.hubspot.com/docs/api/marketing/forms#embed-forms-on-external-sites
- File Manager API: https://developers.hubspot.com/docs/api/files/files
- Progressive Profiling: https://knowledge.hubspot.com/forms/use-progressive-profiling-to-gradually-gather-information-from-contacts
- Node.js SDK — Forms: https://github.com/HubSpot/hubspot-api-nodejs/tree/main/codegen/marketing/forms