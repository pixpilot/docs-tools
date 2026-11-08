import type { Dialect } from './config';
import { basename, dirname, extname, resolve } from 'node:path';

import { createJiti } from 'jiti';

import { read } from './files';

export interface Column {
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
  unique: boolean;
}

export interface ForeignKey {
  columns: string[];
  table: string;
  foreignColumns: string[];
}

export interface Table {
  name: string;
  columns: Column[];
  foreignKeys: ForeignKey[];
}

/** Tables from one module the schema entry re-exports, such as `voice.schema.ts`. */
export interface TableGroup {
  name: string;
  tables: Table[];
}

// The small part of Drizzle this reads. Drizzle is the project's, not ours.
interface DrizzleColumn {
  name: string;
  primary: boolean;
  notNull: boolean;
  isUnique: boolean;
  getSQLType: () => string;
}
interface DrizzleTableConfig {
  name: string;
  schema?: string;
  columns: DrizzleColumn[];
  primaryKeys?: Array<{ columns: DrizzleColumn[] }>;
  uniqueConstraints?: Array<{ columns: DrizzleColumn[] }>;
  foreignKeys: Array<{
    reference: () => {
      columns: DrizzleColumn[];
      foreignColumns: DrizzleColumn[];
      foreignTable: unknown;
    };
  }>;
}
interface DrizzleCore {
  is: (value: unknown, type: unknown) => boolean;
  Table: unknown;
  getTableName: (table: unknown) => string;
}

const CORE_MODULE: Record<Dialect, string> = {
  mysql: 'drizzle-orm/mysql-core',
  postgresql: 'drizzle-orm/pg-core',
  singlestore: 'drizzle-orm/singlestore-core',
  sqlite: 'drizzle-orm/sqlite-core',
};

const RE_EXPORT = /export\s+(?:\*|\{[^}]*\})\s+from\s+['"](?<specifier>[^'"]+)['"]/gu;

function groupName(specifier: string): string {
  const name = basename(specifier, extname(specifier));
  return name.replace(/\.schema$/u, '') || specifier;
}

function toTable(
  config: DrizzleTableConfig,
  getTableName: DrizzleCore['getTableName'],
): Table {
  const primary = new Set(
    (config.primaryKeys ?? []).flatMap((key) => key.columns.map((column) => column.name)),
  );
  const unique = new Set(
    (config.uniqueConstraints ?? [])
      .filter((constraint) => constraint.columns.length === 1)
      .flatMap((constraint) => constraint.columns.map((column) => column.name)),
  );
  return {
    name: config.name,
    columns: config.columns.map((column) => ({
      name: column.name,
      type: column.getSQLType(),
      primaryKey: column.primary || primary.has(column.name),
      notNull: column.notNull,
      unique: column.isUnique || unique.has(column.name),
    })),
    foreignKeys: config.foreignKeys.map((key) => {
      const reference = key.reference();
      return {
        columns: reference.columns.map((column) => column.name),
        table: getTableName(reference.foreignTable),
        foreignColumns: reference.foreignColumns.map((column) => column.name),
      };
    }),
  };
}

/**
 * The tables a Drizzle schema exports, loaded with the project's own Drizzle.
 * Each module the entry re-exports becomes a group; the entry's own tables, or
 * all of them when it re-exports nothing, form a group named after the file.
 */
export async function readDrizzleSchema(
  schemaFile: string,
  dialect: Dialect,
): Promise<TableGroup[]> {
  const jiti = createJiti(schemaFile, { interopDefault: false });
  const load = async (id: string): Promise<Record<string, unknown>> => {
    try {
      return await jiti.import<Record<string, unknown>>(id);
    } catch (error) {
      throw new Error(
        `Could not load ${id} for the database diagram: ${(error as Error).message}`,
      );
    }
  };
  const core = (await load('drizzle-orm')) as unknown as DrizzleCore;
  const { getTableConfig } = (await load(CORE_MODULE[dialect])) as unknown as {
    getTableConfig: (table: unknown) => DrizzleTableConfig;
  };

  // By schema and name: a module can load twice, giving the same table twice.
  const seen = new Set<string>();
  const collect = (module: Record<string, unknown>): Table[] =>
    Object.values(module)
      .filter((value) => core.is(value, core.Table))
      .map((value) => getTableConfig(value))
      .filter((config) => {
        const key = `${config.schema ?? ''}.${config.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((config) => toTable(config, core.getTableName))
      .sort((a, b) => a.name.localeCompare(b.name));

  const groups: TableGroup[] = [];
  const specifiers = [...read(schemaFile).matchAll(RE_EXPORT)].map(
    (match) => match.groups?.['specifier'] ?? '',
  );
  const modules = await Promise.all(
    specifiers.map(async (specifier) =>
      load(
        specifier.startsWith('.') ? resolve(dirname(schemaFile), specifier) : specifier,
      ),
    ),
  );
  // In the entry's order, so a table re-exported twice belongs to its first module.
  specifiers.forEach((specifier, index) => {
    const tables = collect(modules[index] ?? {});
    if (tables.length > 0) groups.push({ name: groupName(specifier), tables });
  });
  const rest = collect(await load(schemaFile));
  if (rest.length > 0) {
    const name = groupName(schemaFile);
    groups.push({
      name: groups.length > 0 || name === 'index' ? 'other' : name,
      tables: rest,
    });
  }
  return groups;
}
