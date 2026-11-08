import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { resolveConfig } from './config';
import { readDrizzleSchema } from './drizzle';
import { read, relativePath } from './files';
import { renderApiRoutes, renderDatabase } from './render';
import { readTrpcRouter } from './trpc';

export const DATABASE_FILE = 'database.md';
export const API_ROUTES_FILE = 'api-routes.md';

export interface GenerateOptions {
  /** The repo root; the current directory when left out. */
  root?: string;
  /** Compare only: report files that are missing, changed or no longer generated. */
  check?: boolean;
}

export type FileStatus = 'removed' | 'stale' | 'unchanged' | 'written';

export interface GenerateResult {
  /** Each generated file, relative to the root, and what happened to it. */
  files: Array<{ path: string; status: FileStatus }>;
  /** Why a diagram was skipped. */
  notes: string[];
}

function link(out: string, root: string, file: string): string {
  return `[${relativePath(root, file)}](${relativePath(out, file)})`;
}

/**
 * Write the database diagram (Drizzle) and the API route list (tRPC) the repo
 * has, or with `check`, only say which files are out of date.
 */
export async function generateDocs(
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const root = resolve(options.root ?? '.');
  const config = resolveConfig(root);
  const { out } = config;
  const wanted = new Map<string, string | undefined>([
    [DATABASE_FILE, undefined],
    [API_ROUTES_FILE, undefined],
  ]);

  if (config.drizzle) {
    const groups = await readDrizzleSchema(config.drizzle.schema, config.drizzle.dialect);
    wanted.set(
      DATABASE_FILE,
      renderDatabase(groups, link(out, root, config.drizzle.schema)),
    );
  }
  if (config.trpc) {
    const procedures = readTrpcRouter(
      config.trpc.router,
      config.trpc.type,
      config.trpc.tsconfig,
    );
    const source = `${link(out, root, config.trpc.router)} (\`${config.trpc.type}\`)`;
    wanted.set(API_ROUTES_FILE, renderApiRoutes(procedures, source));
  }

  const files: GenerateResult['files'] = [];
  for (const [name, content] of wanted) {
    const file = join(out, name);
    const path = relativePath(root, file);
    const current = existsSync(file) ? read(file).replaceAll('\r\n', '\n') : undefined;
    if (content === undefined) {
      if (current === undefined) continue;
      if (!options.check) rmSync(file);
      files.push({ path, status: options.check ? 'stale' : 'removed' });
    } else if (current === content) {
      files.push({ path, status: 'unchanged' });
    } else if (options.check) {
      files.push({ path, status: 'stale' });
    } else {
      mkdirSync(out, { recursive: true });
      writeFileSync(file, content);
      files.push({ path, status: 'written' });
    }
  }
  return { files, notes: config.notes };
}
