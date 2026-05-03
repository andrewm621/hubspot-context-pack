---
name: reporting
description: HubSpot Reporting and Analytics API — custom reports, analytics, attribution, deal forecasting. Use when building dashboards or extracting HubSpot analytics data.
metadata:
  priority: 4
  docs:
    - "https://developers.hubspot.com/docs/api/analytics"
  pathPatterns:
    - '**/reports/**'
    - '**/analytics/**'
    - '**/dashboard/**'
  bashPatterns: []
  importPatterns:
    - "@hubspot/api-client"
  promptSignals:
    phrases:
      - "hubspot report"
      - "hubspot analytics"
      - "hubspot dashboard"
      - "attribution"
      - "deal forecast"
      - "funnel report"
      - "traffic analytics"
---

## What It Is & When to Use It

HubSpot's Reporting and Analytics layer gives programmatic access to web traffic data, CRM funnel metrics, marketing attribution, and custom cross-object reports. It is separate from the CRM object APIs — instead of reading individual records, you read aggregated metrics.

Use this skill when:
- Pulling web traffic analytics (sessions, page views, bounce rate) by date range
- Reading deal pipeline velocity or lifecycle stage conversion rates
- Building external dashboards that display HubSpot data alongside other sources
- Exporting attribution data to attribute revenue to marketing channels
- Creating custom reports in HubSpot programmatically
- Automating report snapshots for periodic delivery (e.g., weekly email of pipeline health)

**Tier gates for reporting features:**

| Feature | Minimum Tier |
|---------|-------------|
| Basic traffic analytics API | All tiers |
| Contact analytics (lifecycle stages) | Marketing Hub Starter |
| Custom reports (single-object) | All tiers (limited) |
| Cross-object reports | Professional |
| Attribution reports (contact creation) | Marketing Hub Professional |
| Attribution reports (deal/revenue) | Marketing Hub Professional |
| Forecasting | Sales Hub Professional |
| Custom report builder API | Professional |

Most of the Analytics API endpoints require at least a Professional-tier subscription. The CRM data you need may be accessible via the CRM objects API at lower tiers — if your goal is deal counts or contact totals, using the Search API may be more appropriate than the Reporting API.

---

## Service Surface

### Analytics API (Web Traffic)

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Get page analytics | `/analytics/v2/reports/{object_type}/total` | GET |
| Get breakdown by category | `/analytics/v2/reports/{object_type}/{breakdown}` | GET |
| Get analytics for specific page/object | `/analytics/v2/reports/{object_type}/{object_id}/total` | GET |

**`object_type` values:** `pages`, `blog-posts`, `landing-pages`, `events`, `social-assists`
**`breakdown` values:** `totals`, `by-period`, `sources`, `browsers`, `countries`

### Custom Reports API

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List reports | `/analytics/v2/reports` | GET |
| Get report | `/analytics/v2/reports/{reportId}` | GET |
| Create report | `/analytics/v2/reports` | POST |
| Update report | `/analytics/v2/reports/{reportId}` | PUT |
| Delete report | `/analytics/v2/reports/{reportId}` | DELETE |

### CRM Analytics (Funnel/Pipeline)

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Get lifecycle stage funnel | `/crm-analytics/v0/reports/funnel` | POST |
| Get deal stage conversion | `/crm-analytics/v0/reports/stages` | POST |

**Note:** The `crm-analytics` API is partially undocumented and subject to change. The preferred approach for deal pipeline data is using the CRM Search API to query deal objects by stage and close date.

### Attribution Reports

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List attribution reports | `/reports/v2/data/attribution` | GET |
| Get attribution data | `/reports/v2/data/attribution/{reportId}` | GET |

**Required scopes:**
- `reports` — read custom reports
- `content` — read web analytics (page/blog analytics)
- `business-intelligence` — access analytics data

---

## Mental Model

**Analytics data is delayed 24-48 hours.** HubSpot analytics is not real-time. Page views, session counts, and traffic source data are typically available the following day, with full accuracy 48 hours after the event. Do not build integrations that expect today's data to be accurate. Always frame analytics dashboards as "as of yesterday" at minimum.

**There is no real-time event stream API.** HubSpot does not expose a streaming analytics API. The Webhooks API fires on CRM record changes, not on page views or session events. For near-real-time behavioral data, use HubSpot's native tracking code and a third-party analytics platform (Segment, Mixpanel) in parallel.

**The Analytics API and the CRM API are separate.** The Analytics API returns aggregated metrics about marketing performance. The CRM API returns individual object records. To get "how many contacts were created this month," use the CRM Search API with a date filter — not the Analytics API. To get "how many page views did /pricing get this month," use the Analytics API.

**Custom reports have a tier ceiling.** On Starter tiers, custom report creation via API is limited. Cross-object reports (e.g., contacts + deals in the same report) require Professional. If `POST /analytics/v2/reports` returns a 403, the portal is below the required tier.

**Attribution models are mutually exclusive per report.** Each attribution report uses one model: first touch, last touch, linear, time decay, U-shaped (position-based), full path, or data-driven. You cannot blend models in a single API response. Request separate reports for each model you want to compare.

**Export is often better than API pagination for large datasets.** The Analytics API is not designed for bulk export of raw events. For large-scale data extraction, use the CRM Export API (`/crm/v3/objects/{objectType}/search` with full pagination, or HubSpot's native export-to-CSV via the UI) rather than trying to paginate millions of rows through the Analytics API.

---

## Common Patterns

### Pattern 1: Get web traffic analytics for a date range

```typescript
import { Client } from "@hubspot/api-client";

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

interface TrafficSummary {
  sessions: number;
  pageViews: number;
  bounceRate: number;
  newContacts: number;
  period: string;
}

async function getTrafficAnalytics(params: {
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  breakdown: "daily" | "weekly" | "monthly";
}): Promise<TrafficSummary[]> {
  // The analytics API uses query params, not the SDK client directly
  // Use the underlying HTTP client
  const response = await hubspotClient.apiRequest({
    method: "GET",
    path: "/analytics/v2/reports/sessions/total",
    qs: {
      start: params.startDate,
      end: params.endDate,
      d: params.breakdown === "daily" ? "day" : params.breakdown === "weekly" ? "week" : "month",
    },
  });

  const data = await response.json() as {
    breakdowns: Array<{
      value: string;
      sessions: number;
      pageviews: number;
      bounceRate: number;
      contacts: number;
    }>;
  };

  return data.breakdowns.map(b => ({
    period: b.value,
    sessions: b.sessions,
    pageViews: b.pageviews,
    bounceRate: b.bounceRate,
    newContacts: b.contacts,
  }));
}
```

### Pattern 2: Get traffic by source (channel breakdown)

```typescript
async function getTrafficBySource(startDate: string, endDate: string) {
  const response = await hubspotClient.apiRequest({
    method: "GET",
    path: "/analytics/v2/reports/sessions/sources",
    qs: {
      start: startDate,
      end: endDate,
    },
  });

  const data = await response.json() as {
    breakdowns: Array<{
      value: string;         // source name: "ORGANIC_SEARCH", "EMAIL", etc.
      sessions: number;
      pageviews: number;
      contacts: number;
      customers: number;
    }>;
  };

  // Source values: DIRECT_TRAFFIC, ORGANIC_SEARCH, EMAIL_MARKETING,
  // PAID_SEARCH, SOCIAL_MEDIA, REFERRALS, OTHER_CAMPAIGNS, PAID_SOCIAL
  return data.breakdowns.sort((a, b) => b.sessions - a.sessions);
}
```

### Pattern 3: Build a pipeline health snapshot using CRM Search

```typescript
// The preferred pattern for pipeline metrics: use CRM Search, not the Analytics API.
// The CRM Search API is more reliable and available at all tiers.

interface PipelineSnapshot {
  stageId: string;
  stageLabel: string;
  dealCount: number;
  totalValue: number;
  averageValue: number;
}

async function getPipelineSnapshot(pipelineId: string): Promise<PipelineSnapshot[]> {
  // Step 1: Get pipeline stages to build label map
  const pipelinesResponse = await hubspotClient.crm.pipelines.pipelinesApi.getAll("deals");
  const pipeline = pipelinesResponse.results.find(p => p.id === pipelineId);

  if (!pipeline?.stages) {
    throw new Error(`Pipeline ${pipelineId} not found`);
  }

  const stageMap = new Map(pipeline.stages.map(s => [s.id, s.label]));

  // Step 2: For each stage, count and sum deals
  const snapshots: PipelineSnapshot[] = [];

  for (const stage of pipeline.stages) {
    const searchResponse = await hubspotClient.crm.deals.searchApi.doSearch({
      filterGroups: [{
        filters: [
          {
            propertyName: "pipeline",
            operator: "EQ",
            value: pipelineId,
          },
          {
            propertyName: "dealstage",
            operator: "EQ",
            value: stage.id,
          },
          {
            propertyName: "hs_is_closed",
            operator: "EQ",
            value: "false",
          },
        ],
      }],
      properties: ["amount"],
      limit: 0, // We only need the total, not the records
      after: 0,
      sorts: [],
      query: "",
    });

    // To get total value, we need to fetch records (API doesn't aggregate)
    // Use a generator for large pipelines
    let totalValue = 0;
    let dealCount = 0;

    let after: string | undefined;
    do {
      const page = await hubspotClient.crm.deals.searchApi.doSearch({
        filterGroups: [{
          filters: [
            { propertyName: "pipeline", operator: "EQ", value: pipelineId },
            { propertyName: "dealstage", operator: "EQ", value: stage.id },
            { propertyName: "hs_is_closed", operator: "EQ", value: "false" },
          ],
        }],
        properties: ["amount"],
        limit: 100,
        after: after ? parseInt(after) : 0,
        sorts: [],
        query: "",
      });

      for (const deal of page.results) {
        dealCount++;
        totalValue += parseFloat(deal.properties.amount ?? "0");
      }

      after = page.paging?.next?.after;
    } while (after);

    snapshots.push({
      stageId: stage.id,
      stageLabel: stageMap.get(stage.id) ?? stage.id,
      dealCount,
      totalValue,
      averageValue: dealCount > 0 ? totalValue / dealCount : 0,
    });
  }

  return snapshots;
}
```

### Pattern 4: Get analytics for a specific page

```typescript
async function getPageAnalytics(params: {
  pageUrl: string;  // The full URL path, e.g. "/pricing"
  startDate: string;
  endDate: string;
}) {
  // First, find the page ID by URL
  const pagesResponse = await hubspotClient.cms.pages.sitePages.basicApi.getPage(
    /* createdAt */ undefined,
    /* createdAfter */ undefined,
    /* createdBefore */ undefined,
    /* updatedAt */ undefined,
    /* updatedAfter */ undefined,
    /* updatedBefore */ undefined,
    /* sort */ undefined,
    /* after */ undefined,
    /* limit */ 100,
    /* archived */ false,
    /* property */ undefined
  );

  const page = pagesResponse.results.find(p => p.url?.includes(params.pageUrl));
  if (!page) {
    throw new Error(`Page not found for URL: ${params.pageUrl}`);
  }

  // Get analytics for this specific page
  const response = await hubspotClient.apiRequest({
    method: "GET",
    path: `/analytics/v2/reports/pages/${page.id}/total`,
    qs: {
      start: params.startDate,
      end: params.endDate,
    },
  });

  return response.json();
}
```

### Pattern 5: List and read custom reports

```typescript
interface HubSpotReport {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

async function listCustomReports(): Promise<HubSpotReport[]> {
  const response = await hubspotClient.apiRequest({
    method: "GET",
    path: "/analytics/v2/reports",
    qs: { limit: 100 },
  });

  const data = await response.json() as {
    results: Array<{
      id: string;
      name: string;
      reportType: string;
      createdAt: string;
      updatedAt: string;
    }>;
  };

  return data.results.map(r => ({
    id: r.id,
    name: r.name,
    type: r.reportType,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

async function getReportData(reportId: string) {
  const response = await hubspotClient.apiRequest({
    method: "GET",
    path: `/analytics/v2/reports/${reportId}`,
  });

  return response.json();
}
```

---

## Gotchas

**24-48 hour data delay is not optional.** HubSpot analytics pipelines batch-process data nightly. "Today's" traffic is always incomplete. If your integration compares today vs. yesterday, yesterday's data may still be updating until mid-morning. Build your dashboards around T-2 day data for accuracy, or clearly label data as "estimated" for recent periods.

**The Analytics API is not in the `@hubspot/api-client` SDK (fully).** Many analytics endpoints must be called via `hubspotClient.apiRequest()` rather than a typed SDK method. The SDK's analytics coverage is partial. Always check `hubspotClient.crm.*` for CRM metrics and fall back to raw `apiRequest` for web analytics endpoints.

**Attribution requires Marketing Hub Professional or higher.** Calling attribution endpoints on a portal below this tier returns a 403. This is a common source of confusion because the endpoint exists and appears valid — the error is tier-gated, not a permissions error. The scope `business-intelligence` alone is not sufficient.

**Custom report creation via API has undocumented constraints.** The schema for `POST /analytics/v2/reports` is complex and partially undocumented. Cross-object reports (joining contacts + deals, for example) require knowing internal `dataSetId` values. The most reliable approach for complex reports is to create them in the HubSpot UI and read them via API, rather than creating them programmatically.

**There is no aggregation in the Analytics API responses.** The API returns raw breakdowns — you must sum, average, or calculate rates yourself. If you want "total sessions for Q1," you request by-week data and sum the results. There is no server-side aggregation parameter.

**Session vs. pageview vs. visit: HubSpot's definitions differ from Google Analytics.** A "session" in HubSpot is a 30-minute window of activity (same as GA). "Contacts" in analytics counts are new contacts created that session, not all contacts who visited. If your stakeholders are comparing HubSpot analytics to another tool, reconcile definitions before presenting numbers together.

**Rate limits apply to analytics endpoints.** The analytics API counts against the same portal rate limit as CRM API calls (100 req/10s, 40k/day for Professional). A dashboard polling every 30 seconds across 20 charts will exhaust the daily limit by mid-afternoon. Implement caching with at least 15-minute TTLs for analytics data.

**The `business-intelligence` scope requires explicit grant.** This scope is not bundled with `content` or `reports`. Private Apps must request it explicitly during setup. If analytics calls return 401 or 403, check that the Private App's scopes include `business-intelligence`.

---

## Official Documentation

- Analytics API Overview: https://developers.hubspot.com/docs/api/analytics
- Web Analytics API: https://developers.hubspot.com/docs/api/analytics/web-analytics
- Custom Reports API: https://developers.hubspot.com/docs/api/analytics/reports
- Attribution Reporting: https://knowledge.hubspot.com/reports/understand-attribution-reports-in-hubspot
- CRM Search API (for pipeline metrics): https://developers.hubspot.com/docs/api/crm/search
- Deal Pipelines API: https://developers.hubspot.com/docs/api/crm/pipelines
- Reporting Scopes Reference: https://developers.hubspot.com/docs/api/working-with-oauth#scopes
