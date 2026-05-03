#!/usr/bin/env node

/**
 * SessionStart hook: Detects HubSpot project markers in the working directory.
 * Sets HUBSPOT_PLUGIN_LIKELY_SKILLS env var for skill priority boosting.
 * Outputs user-facing messages about detected HubSpot project type.
 */

import { existsSync, readFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// File markers that indicate HubSpot service usage
const FILE_MARKERS = [
  { file: "hubspot.config.yml", skills: ["hubspot-auth", "contacts"] },
  { file: ".hubspot.config.yml", skills: ["hubspot-auth", "contacts"] },
  { file: "hubspot-cli.json", skills: ["hubspot-auth"] },
];

// Package.json dependency markers
const PACKAGE_MARKERS = {
  "@hubspot/api-client": ["contacts", "companies", "deals", "hubspot-auth"],
  "@hubspot/cli": ["hubspot-auth"],
  "hubspot": ["contacts", "companies", "deals", "hubspot-auth"],
  "hubspot-api-client": ["contacts", "companies", "deals", "hubspot-auth"],
};

function safeReadJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function safeReadFile(path) {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function profileProject(projectRoot) {
  const skills = new Set();

  // Check file markers
  for (const marker of FILE_MARKERS) {
    if (existsSync(join(projectRoot, marker.file))) {
      for (const s of marker.skills) skills.add(s);
    }
  }

  // Check package.json dependencies
  const pkg = safeReadJson(join(projectRoot, "package.json"));
  if (pkg) {
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, skillSlugs] of Object.entries(PACKAGE_MARKERS)) {
      if (dep in allDeps) {
        for (const s of skillSlugs) skills.add(s);
      }
    }
  }

  // Check .env files for HubSpot credentials
  for (const envFile of [".env", ".env.local", ".env.development"]) {
    const content = safeReadFile(join(projectRoot, envFile));
    if (content) {
      if (content.includes("HUBSPOT_ACCESS_TOKEN") || content.includes("HUBSPOT_API_KEY")) {
        skills.add("hubspot-auth");
        skills.add("contacts");
      }
    }
  }

  // Check for specific skill usage in package deps
  const allDeps = pkg ? { ...pkg.dependencies, ...pkg.devDependencies } : {};

  // Detect workflow/automation usage
  if (
    "@hubspot/api-client" in allDeps ||
    "hubspot" in allDeps
  ) {
    // Check for workflow-related code patterns in common config files
    const pkgScripts = JSON.stringify(pkg?.scripts || "");
    if (pkgScripts.includes("workflow") || pkgScripts.includes("automation")) {
      skills.add("workflows");
    }
  }

  // Detect webhook usage from common patterns
  for (const envFile of [".env", ".env.local"]) {
    const content = safeReadFile(join(projectRoot, envFile));
    if (content && content.includes("HUBSPOT_WEBHOOK")) {
      skills.add("webhooks");
    }
  }

  return [...skills].sort();
}

function main() {
  // Read stdin
  try {
    readFileSync(0, "utf-8");
  } catch {}

  const projectRoot = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
  const likelySkills = profileProject(projectRoot);

  if (likelySkills.length > 0) {
    process.env.HUBSPOT_PLUGIN_LIKELY_SKILLS = likelySkills.join(",");

    const messages = [];

    // Check for deprecated API key usage
    for (const envFile of [".env", ".env.local", ".env.development"]) {
      const content = safeReadFile(join(projectRoot, envFile));
      if (content && content.includes("HUBSPOT_API_KEY")) {
        messages.push(
          "WARNING: HUBSPOT_API_KEY detected. HubSpot API Keys are deprecated and will be sunset. Migrate to Private App access tokens (HUBSPOT_ACCESS_TOKEN) for continued API access. See: https://developers.hubspot.com/docs/api/private-apps"
        );
        break;
      }
    }

    if (messages.length > 0) {
      process.stdout.write(messages.join("\n\n") + "\n");
    }
  }
}

main();
