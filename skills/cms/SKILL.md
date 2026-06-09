---
strata_id: b37ce334-0bac-4fdf-90e7-cf278dd7ae68
type: note
created: 2026-05-03T18:57:19+00:00
modified: 2026-05-03T18:57:19.343674364+00:00
metadata:
  bashPatterns:
  - \bhs\s+(upload|fetch|watch|create)\b
  docs:
  - https://developers.hubspot.com/docs/api/cms
  importPatterns:
  - '@hubspot/api-client'
  - '@hubspot/cli'
  pathPatterns:
  - '**/cms/**'
  - '**/pages/**'
  - '**/blog/**'
  - '**/templates/**'
  - '**/*.hubl'
  - '**/*.html'
  priority: 4
  promptSignals:
    phrases:
    - hubspot cms
    - hubspot page
    - hubspot blog
    - hubdb
    - hubl
    - hubspot template
    - hubspot module
    - site page
name: cms
description: HubSpot CMS API — pages, blog posts, templates, modules, HubDB, site tree. Use when building or managing HubSpot-hosted content programmatically.
---

## What It Is & When to Use It

HubSpot CMS Hub is a hosted content management platform where pages, blog posts, landing pages, and knowledge base articles live alongside your CRM data. Unlike a generic CMS, every piece of content in HubSpot is natively aware of contacts, companies, and deals — personalization and smart content are first-class features, not plugins.

Use this skill when:
- Creating, updating, publishing, or cloning site pages or landing pages programmatically
- Managing blog posts, authors, and tags via API
- Reading or writing HubDB tables (structured data that powers dynamic content)
- Uploading or syncing theme files, templates, or modules via the `hs` CLI
- Building integrations that generate HubSpot-hosted content from external data

**CMS Hub tiers and what they unlock:**

| Tier | What it adds |
|------|-------------|
| Free | Basic pages, blog, forms |
| Starter | Custom domains, remove HubSpot branding |
| Professional | Smart content, A/B testing, SEO recommendations, HubDB |
| Enterprise | Content staging, serverless functions, memberships, content partitioning |

HubDB and advanced personalization require Professional+. Content staging (preview environments) is Enterprise-only.

---

## Service Surface

### Pages API

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List site pages | `/cms/v3/pages/site-pages` | GET |
| Get site page | `/cms/v3/pages/site-pages/{id}` | GET |
| Create site page | `/cms/v3/pages/site-pages` | POST |
| Update site page | `/cms/v3/pages/site-pages/{id}` | PATCH |
| Delete site page | `/cms/v3/pages/site-pages/{id}` | DELETE |
| Clone site page | `/cms/v3/pages/site-pages/{id}/clone` | POST |
| Schedule publish | `/cms/v3/pages/site-pages/{id}/schedule` | POST |
| Push live (publish) | `/cms/v3/pages/site-pages/{id}/push-live` | POST |
| Revert to draft | `/cms/v3/pages/site-pages/{id}/revert` | POST |
| List landing pages | `/cms/v3/pages/landing-pages` | GET |
| Create landing page | `/cms/v3/pages/landing-pages` | POST |

### Blog API

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List blog posts | `/cms/v3/blogs/posts` | GET |
| Get blog post | `/cms/v3/blogs/posts/{id}` | GET |
| Create blog post | `/cms/v3/blogs/posts` | POST |
| Update blog post | `/cms/v3/blogs/posts/{id}` | PATCH |
| Publish/draft blog post | `/cms/v3/blogs/posts/{id}/draft/push-live` | POST |
| List blog authors | `/cms/v3/blogs/authors` | GET |
| Create blog author | `/cms/v3/blogs/authors` | POST |
| List blog tags | `/cms/v3/blogs/tags` | GET |
| Create blog tag | `/cms/v3/blogs/tags` | POST |

### HubDB API

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List tables | `/cms/v3/hubdb/tables` | GET |
| Get table | `/cms/v3/hubdb/tables/{tableIdOrName}` | GET |
| Create table | `/cms/v3/hubdb/tables` | POST |
| Publish table | `/cms/v3/hubdb/tables/{tableIdOrName}/draft/push-live` | POST |
| List rows | `/cms/v3/hubdb/tables/{tableIdOrName}/rows` | GET |
| Create row | `/cms/v3/hubdb/tables/{tableIdOrName}/rows` | POST |
| Update row | `/cms/v3/hubdb/tables/{tableIdOrName}/rows/{rowId}/draft` | PATCH |
| Delete row | `/cms/v3/hubdb/tables/{tableIdOrName}/rows/{rowId}/draft` | DELETE |
| Clone table | `/cms/v3/hubdb/tables/{tableIdOrName}/clone` | POST |

**Required scopes:**
- `content` — read/write pages and blog posts
- `hubdb` — read/write HubDB tables

**Rate limits:** CMS API endpoints share the portal's global rate limit pool (100 requests/10 seconds burst, 40,000/day for Professional). HubDB and Pages API calls count equally against this limit.

---

## Mental Model

**Draft and published are separate states.** Every page and blog post has a draft version and a published (live) version. Edits made via API always modify the draft. You must explicitly call the push-live endpoint to make changes visible. Reading the draft vs. the published version returns different content — check the `state` field (`DRAFT`, `PUBLISHED`, `SCHEDULED`).

**HubDB is a relational table system, not a document store.** Each table has typed columns (text, number, URL, image, rich text, select, multi-select, date, foreign key). Rows must conform to the schema. HubDB is designed for content that powers dynamic page sections — think "team directory" or "product catalog" that HubL templates iterate over. It is not a general-purpose database.

**HubDB has draft and published states too.** Row changes are made to the draft table. You must publish the table (`push-live`) for changes to appear on live pages. A common gotcha: you insert rows and they don't appear on the site because you forgot to publish the table.

**HubL is server-side rendered, not client-rendered.** HubL (HubSpot's Jinja-inspired template language) runs at request time on HubSpot's servers. There is no client-side rendering or hydration. If you need dynamic behavior, use JavaScript in the page — but HubL variables and loops are resolved server-side only.

**The `hs` CLI syncs files by path.** When you run `hs upload` or `hs watch`, it maps your local file structure to the HubSpot Design Manager. File paths are significant — moving a file in the Design Manager changes its ID but not its path-based reference in templates. Always use `hs fetch` to pull remote state before editing locally to avoid conflicts.

**Templates reference modules by path.** Custom modules live in the Design Manager under a path like `@marketplace/your-theme/modules/hero.module`. When a page uses a template, the template references modules by this path. If you move or rename a module, pages using it break silently.

---

## Common Patterns

### Pattern 1: Create and publish a site page

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

async function createAndPublishPage(params: {
  name: string;
  slug: string;
  htmlTitle: string;
  metaDescription: string;
  contentGroupId: string; // The "page group" / domain config ID
  templatePath: string;   // e.g. "@marketplace/my-theme/templates/basic.html"
  bodyContent: string;    // HTML body content
}) {
  // Step 1: Create in draft state
  const page = await hubspotClient.cms.pages.sitePages.basicApi.create({
    name: params.name,
    slug: params.slug,
    htmlTitle: params.htmlTitle,
    metaDescription: params.metaDescription,
    contentGroupId: params.contentGroupId,
    templatePath: params.templatePath,
    layoutSections: {},
    widgets: {},
  });

  console.log(`Created page draft: ${page.id}`);

  // Step 2: Push to live
  await hubspotClient.cms.pages.sitePages.basicApi.pushLiveDraft(page.id);

  console.log(`Published page: ${page.id} at slug /${params.slug}`);
  return page.id;
}
```

### Pattern 2: Create a blog post with author and tags

```typescript
async function createBlogPost(params: {
  blogId: string;     // The content group ID for the blog
  name: string;       // Internal name
  htmlTitle: string;  // SEO title shown in browser tab
  slug: string;
  postBody: string;   // Full HTML content
  authorId: string;
  tagIds: string[];
  featuredImageUrl?: string;
  publishImmediately?: boolean;
}) {
  const now = new Date();

  const post = await hubspotClient.cms.blogs.blogPosts.basicApi.create({
    contentGroupId: params.blogId,
    name: params.name,
    htmlTitle: params.htmlTitle,
    slug: params.slug,
    postBody: params.postBody,
    blogAuthorId: params.authorId,
    tagIds: params.tagIds,
    ...(params.featuredImageUrl && {
      featuredImage: params.featuredImageUrl,
      useFeaturedImage: true,
    }),
    publishDate: now.toISOString(),
    currentState: "DRAFT",
  });

  if (params.publishImmediately) {
    await hubspotClient.cms.blogs.blogPosts.basicApi.pushLiveDraft(post.id);
    console.log(`Blog post published: ${post.id}`);
  } else {
    console.log(`Blog post created as draft: ${post.id}`);
  }

  return post.id;
}
```

### Pattern 3: Insert rows into a HubDB table

```typescript
async function insertHubDbRows(
  tableIdOrName: string,
  rows: Record<string, unknown>[]
) {
  // Create rows in the draft table
  const results = await Promise.all(
    rows.map(values =>
      hubspotClient.cms.hubdb.rowsApi.createTableRow(tableIdOrName, {
        values,
      })
    )
  );

  console.log(`Inserted ${results.length} rows into ${tableIdOrName} (draft)`);

  // Publish the table so changes appear on live pages
  await hubspotClient.cms.hubdb.tablesApi.publishDraftTable(tableIdOrName);

  console.log(`Published HubDB table: ${tableIdOrName}`);
  return results.map(r => r.id);
}

// Example usage for a "Team Members" table
// Table columns: name (TEXT), title (TEXT), department (SELECT), headshot (IMAGE)
await insertHubDbRows("team_members", [
  {
    name: "Jane Smith",
    title: "Head of Product",
    department: { name: "Product" },
    headshot: { url: "https://example.com/jane.jpg" },
  },
]);
```

### Pattern 4: Paginate all published blog posts

```typescript
async function* getAllPublishedPosts(blogId: string) {
  let after: string | undefined;
  const limit = 100;

  do {
    const response = await hubspotClient.cms.blogs.blogPosts.basicApi.getPage(
      /* createdAt */ undefined,
      /* createdAfter */ undefined,
      /* createdBefore */ undefined,
      /* updatedAt */ undefined,
      /* updatedAfter */ undefined,
      /* updatedBefore */ undefined,
      /* sort */ undefined,
      after,
      limit,
      /* archived */ false,
      /* property */ undefined
    );

    for (const post of response.results) {
      if (post.currentState === "PUBLISHED") {
        yield post;
      }
    }

    after = response.paging?.next?.after;
  } while (after);
}

// Usage
for await (const post of getAllPublishedPosts("12345678")) {
  console.log(post.htmlTitle, post.publishDate);
}
```

### Pattern 5: Read a HubDB table and its rows (for external rendering)

```typescript
interface HubDbRow {
  id: string;
  values: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

async function getHubDbTableData(tableIdOrName: string): Promise<{
  columns: Array<{ name: string; type: string; label: string }>;
  rows: HubDbRow[];
}> {
  // Get table schema
  const table = await hubspotClient.cms.hubdb.tablesApi.getTableDetails(
    tableIdOrName,
    /* archived */ false
  );

  const columns = table.columns?.map(col => ({
    name: col.name ?? "",
    type: col.type ?? "TEXT",
    label: col.label ?? col.name ?? "",
  })) ?? [];

  // Get all rows (published)
  const rows: HubDbRow[] = [];
  let after: string | undefined;

  do {
    const response = await hubspotClient.cms.hubdb.rowsApi.getTableRows(
      tableIdOrName,
      /* sort */ undefined,
      /* after */ after,
      /* limit */ 100,
      /* properties */ undefined
    );

    rows.push(...response.results.map(r => ({
      id: String(r.id),
      values: r.values ?? {},
      createdAt: r.createdAt ?? "",
      updatedAt: r.updatedAt ?? "",
    })));

    after = response.paging?.next?.after;
  } while (after);

  return { columns, rows };
}
```

### Pattern 6: Schedule a page to publish at a future time

```typescript
async function schedulePagePublish(pageId: string, publishAtMs: number) {
  // publishAtMs is a Unix timestamp in milliseconds
  await hubspotClient.cms.pages.sitePages.basicApi.scheduleBasePage({
    id: pageId,
    publishDate: new Date(publishAtMs).toISOString(),
  });

  console.log(`Page ${pageId} scheduled to publish at ${new Date(publishAtMs).toISOString()}`);
}
```

---

## Gotchas

**Draft edits never appear on live until you push.** Calling `PATCH /cms/v3/pages/site-pages/{id}` modifies the draft only. The live page is unchanged until you call `.pushLiveDraft()` or the scheduled publish time fires. This is by design but trips up integrations that expect changes to be instant.

**HubDB tables must be published after every write.** Row inserts, updates, and deletions are all draft operations. HubL templates rendering on the live site read the published version of the table. Always call `publishDraftTable` after mutations or your changes will appear on preview but not on the live site.

**HubDB SELECT column values are objects, not strings.** When writing to a SELECT column, the value must be `{ name: "Option Name" }` (matching the option name exactly, case-sensitive), not a plain string. IMAGE columns need `{ url: "..." }`. NUMBER columns take numeric values. Passing the wrong type causes a 400 with an unhelpful error message.

**`slug` must be unique per domain.** Two pages cannot share the same slug on the same domain. If a page with that slug already exists (even in a deleted/archived state), creation fails with a 409. Always check for existing slugs before creating, or use a suffixed slug.

**Template paths are case-sensitive.** The `templatePath` in the Pages API must exactly match the path in the Design Manager, including capitalization and file extension (`.html` or `.hubl`). A wrong template path creates the page with no template applied, which renders a blank page.

**CMS API rate limits are shared with CRM.** All API calls from a Private App share the same rate limit bucket. A bulk HubDB import running in parallel with CRM sync operations will cause rate limit errors on both. Serialize heavy CMS writes or add backoff logic.

**Content staging is Enterprise-only.** Staging environments (multi-environment previews) are gated behind CMS Hub Enterprise. On lower tiers, the only preview is the draft preview URL, which is a HubSpot-generated `hs-sites.com` URL. Do not confuse draft preview with staging.

**The `hs` CLI is auth'd per portal.** Running `hs upload` requires an active `hs auth` session for the target portal. In CI/CD, use the `--portal` flag and set `HUBSPOT_PORTAL_ID` + `HUBSPOT_PERSONAL_ACCESS_KEY` environment variables instead of interactive auth.

**Cloning a page does not auto-publish the clone.** `POST /cms/v3/pages/site-pages/{id}/clone` creates a new draft with a `Clone of [Name]` title and no live version. You must update its slug and push live. The original page's slug is not copied — the clone gets a new auto-generated slug to avoid conflicts.

---

## Official Documentation

- CMS Pages API: https://developers.hubspot.com/docs/api/cms/pages
- Blog Posts API: https://developers.hubspot.com/docs/api/cms/blog-post
- Blog Authors API: https://developers.hubspot.com/docs/api/cms/blog-authors
- Blog Tags API: https://developers.hubspot.com/docs/api/cms/blog-tags
- HubDB API: https://developers.hubspot.com/docs/api/cms/hubdb
- CMS Overview: https://developers.hubspot.com/docs/api/cms
- HubL Templating Reference: https://developers.hubspot.com/docs/cms/hubl
- HubSpot CLI (hs): https://developers.hubspot.com/docs/cms/developer-reference/local-development-cli
- CMS Hub Tiers: https://www.hubspot.com/products/cms