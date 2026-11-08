import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Folders that never hold a project's own source. */
const SKIPPED = new Set([
  '.cache',
  '.git',
  '.next',
  '.turbo',
  '.wrangler',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

/** Every file under `dir` whose name passes `accept`, skipping build output and dependencies. */
export function findFiles(dir: string, accept: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return SKIPPED.has(entry.name) ? [] : findFiles(path, accept);
    return entry.isFile() && accept(entry.name) ? [path] : [];
  });
}

export function read(file: string): string {
  return readFileSync(file, 'utf8');
}

/** A forward-slash path from `from` to `to`, for markdown links and messages. */
export function relativePath(from: string, to: string): string {
  return relative(from, to).replaceAll('\\', '/');
}
