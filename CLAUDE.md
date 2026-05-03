# HubSpot Context Pack — Development Guide

## What This Is

A Claude Code plugin providing AI-consumable knowledge about the HubSpot platform and APIs. Structured as skills (one per domain) with pattern-matching hooks that inject relevant context when working with HubSpot files, commands, or prompts.

## Architecture

```
hubspot-context-pack/
  hubspot.md                # Root knowledge graph (injected on session start)
  skills/*/SKILL.md         # Per-domain skills with YAML frontmatter
  hooks/                    # Hook scripts for context injection
  generated/                # Auto-generated manifest and catalog
  scripts/                  # Build and validation scripts
```

## Skill File Format

Each `SKILL.md` has YAML frontmatter with:
- `name`: Skill identifier (matches directory name)
- `description`: When to use this skill
- `metadata.priority`: 1-10 (higher = injected first when multiple match)
- `metadata.pathPatterns`: Glob patterns for file matching
- `metadata.bashPatterns`: Regex patterns for bash command matching
- `metadata.importPatterns`: Package import patterns
- `metadata.promptSignals.phrases`: Keyword phrases for prompt matching

Body sections: What It Is, Service Surface, Mental Model, Common Patterns, Gotchas, Official Documentation.

## Adding a New Skill

1. Create `skills/<name>/SKILL.md` with frontmatter and 6 sections
2. Run `node scripts/build-manifest.mjs` to regenerate `generated/skill-manifest.json`
3. Run `node scripts/validate.mjs` to check structure and token counts

## Conventions

- Skill body: 3-8k tokens. Use `references/` subdirectory for deep-dives.
- Always use `@hubspot/api-client` v3+ in examples. Never use deprecated `hubspot-api-client` v1 patterns.
- API Key authentication is deprecated — all examples use Private App access tokens or OAuth 2.0.
- Rate limit awareness: note burst limits and daily limits in relevant skills.
- Gotchas must cite real sources (HubSpot Developer Docs, community forums, changelog).
- Decision matrices use tables with clear "Use When" / "Avoid When" columns.
