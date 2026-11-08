#!/usr/bin/env node
/**
 * Guards the one-time `pnpm run setup` (scaffoldfy workspace-initializer).
 *
 *   node setup/guard.mjs warn   -> prints a banner, never fails
 *   node setup/guard.mjs block  -> pnpm:devPreinstall / pre-commit: exits 1
 *
 * There is no "already done" marker: `pnpm run setup` uses the shared
 * setup-guard config to strip the call sites, then deletes this whole folder.
 * If the guard still exists, setup has not completed.
 *
 * Bypass with SKIP_SETUP_CHECK=1.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const TEMPLATE_REPO = 'pnpm-turbo-monorepo-template';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'warn';

// The template repo itself is never "not initialized" -- only its descendants are.
function isTemplateRepoItself() {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return url.replace(/\.git$/u, '').endsWith(`/${TEMPLATE_REPO}`);
  } catch {
    return false;
  }
}

if (process.env.SKIP_SETUP_CHECK === '1' || process.env.CI || isTemplateRepoItself()) {
  process.exit(0);
}

const yellow = '[33m';
const cyan = '[36m';
const reset = '[0m';

console.error(
  [
    '',
    `${yellow}!! Workspace not initialized${reset}`,
    '',
    '  This repo was created from a template. Run the one-time initializer:',
    '',
    `    ${cyan}pnpm run setup${reset}`,
    '',
    '  (bypass with SKIP_SETUP_CHECK=1)',
    '',
  ].join('\n'),
);

process.exit(mode === 'block' ? 1 : 0);
