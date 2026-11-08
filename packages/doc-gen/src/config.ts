import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { findFiles, read, relativePath } from './files';

export type Dialect = 'mysql' | 'postgresql' | 'singlestore' | 'sqlite';

/** `doc-gen.config.json` at the repo root. Every field is optional. */
export interface DocGenConfig {
  /** Where the generated files go, from the repo root. */
  out?: string;
  /** The Drizzle schema entry, or `false` to skip the database diagram. */
  drizzle?: false | { schema: string; dialect?: Dialect };
  /** The file exporting the root router type, or `false` to skip the API routes. */
  trpc?: false | { router: string; type?: string; tsconfig?: string };
}

export interface DrizzleSource {
  schema: string;
  dialect: Dialect;
}

export interface TrpcSource {
  router: string;
  type: string;
  tsconfig?: string;
}

export interface ResolvedConfig {
  root: string;
  out: string;
  drizzle?: DrizzleSource;
  trpc?: TrpcSource;
  /** Why a generator found nothing to read, for the CLI's notes. */
  notes: string[];
}

export const CONFIG_FILE = 'doc-gen.config.json';
export const DEFAULT_OUT = 'docs/000-overview/generated';
const DEFAULT_ROUTER_TYPE = 'AppRouter';
const DIALECTS = new Set<string>(['mysql', 'postgresql', 'singlestore', 'sqlite']);

function readConfig(root: string): DocGenConfig {
  const file = join(root, CONFIG_FILE);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(read(file)) as DocGenConfig;
  } catch (error) {
    throw new Error(`${CONFIG_FILE} is not valid JSON: ${(error as Error).message}`);
  }
}

/** A schema path that names a folder means its `index.ts`. */
function schemaEntry(path: string): string {
  if (existsSync(path) && statSync(path).isDirectory()) {
    const index = ['index.ts', 'index.js']
      .map((name) => join(path, name))
      .find(existsSync);
    if (index !== undefined) return index;
  }
  if (!existsSync(path)) throw new Error(`Drizzle schema not found: ${path}`);
  return path;
}

function detectDrizzle(root: string, notes: string[]): DrizzleSource | undefined {
  const configs = findFiles(root, (name) => /^drizzle\.config\.[cm]?[jt]s$/u.test(name));
  if (configs.length === 0) {
    notes.push('No drizzle.config file: skipped the database diagram.');
    return undefined;
  }
  if (configs.length > 1) {
    throw new Error(
      `Found ${configs.length} drizzle.config files: set "drizzle": { "schema": "<path>" } in ${CONFIG_FILE}.`,
    );
  }
  const [config] = configs as [string];
  const text = read(config);
  const schema = /\bschema\s*:\s*(?<quote>['"`])(?<path>[^'"`]+)\k<quote>/u.exec(text)
    ?.groups?.['path'];
  if (schema === undefined || schema.includes('*')) {
    throw new Error(
      `${relativePath(root, config)} has no single schema path: set "drizzle": { "schema": "<path>" } in ${CONFIG_FILE}.`,
    );
  }
  const dialect =
    /\bdialect\s*:\s*['"](?<dialect>\w+)['"]/u.exec(text)?.groups?.['dialect'] ??
    'postgresql';
  if (!DIALECTS.has(dialect)) throw new Error(`Unsupported Drizzle dialect: ${dialect}`);
  return {
    schema: schemaEntry(resolve(dirname(config), schema)),
    dialect: dialect as Dialect,
  };
}

function detectTrpc(root: string, notes: string[]): TrpcSource | undefined {
  const pattern = new RegExp(`export\\s+type\\s+${DEFAULT_ROUTER_TYPE}\\b`, 'u');
  const routers = findFiles(
    root,
    (name) => /\.[cm]?tsx?$/u.test(name) && !/\.(?:d|test|spec)\.[cm]?tsx?$/u.test(name),
  ).filter((file) => pattern.test(read(file)));
  if (routers.length === 0) {
    notes.push(`No "export type ${DEFAULT_ROUTER_TYPE}": skipped the API routes.`);
    return undefined;
  }
  if (routers.length > 1) {
    throw new Error(
      `Found ${routers.length} files exporting ${DEFAULT_ROUTER_TYPE} (${routers.map((file) => relativePath(root, file)).join(', ')}): set "trpc": { "router": "<path>" } in ${CONFIG_FILE}.`,
    );
  }
  return { router: routers[0] as string, type: DEFAULT_ROUTER_TYPE };
}

/**
 * What to generate and from where: `doc-gen.config.json` when it says, else
 * found in the repo (a single `drizzle.config.*`, a single `export type AppRouter`).
 */
export function resolveConfig(root: string): ResolvedConfig {
  const config = readConfig(root);
  const notes: string[] = [];
  const resolved: ResolvedConfig = {
    root,
    out: resolve(root, config.out ?? DEFAULT_OUT),
    notes,
  };

  if (config.drizzle === false) {
    notes.push('Database diagram turned off in doc-gen.config.json.');
  } else if (config.drizzle) {
    resolved.drizzle = {
      schema: schemaEntry(resolve(root, config.drizzle.schema)),
      dialect: config.drizzle.dialect ?? 'postgresql',
    };
  } else {
    const drizzle = detectDrizzle(root, notes);
    if (drizzle) resolved.drizzle = drizzle;
  }

  if (config.trpc === false) {
    notes.push('API routes turned off in doc-gen.config.json.');
  } else if (config.trpc) {
    const router = resolve(root, config.trpc.router);
    if (!existsSync(router)) throw new Error(`tRPC router not found: ${router}`);
    resolved.trpc = {
      router,
      type: config.trpc.type ?? DEFAULT_ROUTER_TYPE,
      ...(config.trpc.tsconfig !== undefined && {
        tsconfig: resolve(root, config.trpc.tsconfig),
      }),
    };
  } else {
    const trpc = detectTrpc(root, notes);
    if (trpc) resolved.trpc = trpc;
  }

  return resolved;
}
