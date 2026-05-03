# HubSpot Context Pack

A Claude Code plugin that provides AI-consumable knowledge about the HubSpot platform and APIs. When you're working with HubSpot files, running CLI commands, or discussing HubSpot topics, relevant guidance is automatically injected into your conversation.

## Installation

```bash
claude plugin add /path/to/hubspot-context-pack
```

Or from GitHub (once published):
```bash
claude plugin add github:andrewtmiller/hubspot-context-pack
```

## How It Works

The plugin uses Claude Code's hook system to automatically inject relevant HubSpot knowledge:

1. **Session Start** — Injects the HubSpot platform knowledge graph (`hubspot.md`) with API architecture, object model, and decision matrices. Detects HubSpot project markers (config files, SDK imports, env vars) to prioritize relevant skills.

2. **File Operations** — When you read, edit, or write files matching HubSpot patterns (e.g., `hubspot.config.yml`, contact/deal handler files), the relevant skill is injected.

3. **Bash Commands** — When you run HubSpot CLI commands or API calls, matching skills are injected.

4. **Prompt Matching** — When you ask about HubSpot topics, relevant skills are injected based on keyword matching.

## Skills

8 skills covering the HubSpot platform domains a developer actually touches:

### Tier 1 — Core (Priority 8)
| Skill | Domain | Key Topics |
|-------|--------|------------|
| `hubspot-auth` | Authentication | Private Apps, OAuth 2.0, scopes, token refresh |
| `contacts` | CRM Contacts | CRUD, search, properties, lists, associations |

### Tier 1 — Core (Priority 7)
| Skill | Domain | Key Topics |
|-------|--------|------------|
| `companies` | CRM Companies | CRUD, search, domains, associations |
| `deals` | CRM Deals | CRUD, pipelines, stages, associations |
| `custom-objects` | Custom Objects | Schema definition, properties, associations |

### Tier 2 — Extended (Priority 6)
| Skill | Domain | Key Topics |
|-------|--------|------------|
| `workflows` | Automation | Triggers, actions, branching, custom code |
| `webhooks` | Webhooks | Subscriptions, verification, retry policy |
| `associations` | Associations | Types, labels, batch operations, schemas |

## Skill Format

Each skill follows a 6-section structure:

1. **What It Is & When to Use It** — 2-3 sentence orientation
2. **Service Surface** — Endpoints, rate limits, required scopes (table format)
3. **Mental Model** — 3-5 conceptual primitives
4. **Common Patterns** — Recipes with TypeScript code using `@hubspot/api-client`
5. **Gotchas** — Real rate limit traps, quirks, deprecated behaviors, common mistakes
6. **Official Documentation** — Authoritative links only

## Development

```bash
# Generate skill manifest (speeds up hook execution)
node scripts/build-manifest.mjs

# Validate all skills
node scripts/validate.mjs

# Generate skill catalog
node scripts/generate-catalog.mjs
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `HUBSPOT_PLUGIN_HOOK_DEDUP` | (enabled) | Set to `off` to re-inject skills each time |
| `HUBSPOT_PLUGIN_LIKELY_SKILLS` | (auto-detected) | Comma-separated skill list for priority boosting |

## License

Apache-2.0
