import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  API_ROUTES_FILE,
  DATABASE_FILE,
  DEFAULT_OUT,
  generateDocs,
  readDrizzleSchema,
  readTrpcRouter,
  renderDatabase,
  resolveConfig,
} from '../src';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures', 'project');
const schema = join(fixture, 'db', 'src', 'schema', 'index.ts');
const router = join(fixture, 'api', 'src', 'router.ts');

let root: string;

// Inside the package, so the fixture resolves drizzle-orm, @trpc/server and zod.
beforeEach(() => {
  root = resolve(here, '..', '.cache', `test-${process.pid}-${Date.now()}`);
  mkdirSync(root, { recursive: true });
  cpSync(fixture, root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function generated(name: string): string {
  return readFileSync(join(root, DEFAULT_OUT, name), 'utf8');
}

describe('readDrizzleSchema', () => {
  it('should group tables by the module the schema entry re-exports', async () => {
    const groups = await readDrizzleSchema(schema, 'postgresql');

    expect(
      groups.map((group) => [group.name, group.tables.map((table) => table.name)]),
    ).toEqual([
      ['posts', ['posts']],
      ['users', ['users']],
    ]);
  });

  it('should read columns, keys and foreign keys', async () => {
    const [posts, users] = await readDrizzleSchema(schema, 'postgresql');

    expect(users?.tables[0]?.columns).toEqual([
      { name: 'id', type: 'uuid', primaryKey: true, notNull: true, unique: false },
      { name: 'email', type: 'text', primaryKey: false, notNull: true, unique: true },
      {
        name: 'created_at',
        type: 'timestamp with time zone',
        primaryKey: false,
        notNull: true,
        unique: false,
      },
    ]);
    expect(posts?.tables[0]?.foreignKeys).toEqual([
      { columns: ['author_id'], table: 'users', foreignColumns: ['id'] },
      { columns: ['editor_id'], table: 'users', foreignColumns: ['id'] },
    ]);
  });
});

describe('renderDatabase', () => {
  it('should draw one ER diagram per group, with relationships', async () => {
    const text = renderDatabase(
      await readDrizzleSchema(schema, 'postgresql'),
      '[schema](x)',
    );

    expect(text).toContain('2 tables in 2 groups.');
    expect(text).toContain('        timestamp_with_time_zone created_at\n');
    expect(text).toContain('        numeric(10_2) price "nullable"\n');
    expect(text).toContain('        text email UK\n');
    expect(text).toContain('    posts }o--|| users : "author_id"\n');
    expect(text).toContain('    posts }o--o| users : "editor_id"\n');
  });
});

describe('readTrpcRouter', () => {
  it('should list every procedure with its type, input fields and doc comment', () => {
    expect(readTrpcRouter(router)).toEqual([
      { path: 'admin.stats', type: 'query' },
      { path: 'byId', type: 'query', input: 'string' },
      { path: 'health', type: 'query' },
      { path: 'posts.create', type: 'mutation', input: '{ title }' },
      {
        path: 'posts.list',
        type: 'query',
        input: '{ userId, limit? }',
        description: "Lists a user's posts, newest first.",
      },
    ]);
  });

  it('should fail when the file does not export the type', () => {
    expect(() => readTrpcRouter(router, 'MissingRouter')).toThrow(
      /does not export MissingRouter/u,
    );
  });
});

describe('resolveConfig', () => {
  it('should find the Drizzle config and the AppRouter export', () => {
    const config = resolveConfig(root);

    expect(config.drizzle).toEqual({
      schema: join(root, 'db', 'src', 'schema', 'index.ts'),
      dialect: 'postgresql',
    });
    expect(config.trpc).toEqual({
      router: join(root, 'api', 'src', 'router.ts'),
      type: 'AppRouter',
    });
  });

  it('should skip what doc-gen.config.json turns off', () => {
    writeFileSync(
      join(root, 'doc-gen.config.json'),
      '{ "drizzle": false, "trpc": false }',
    );
    const config = resolveConfig(root);

    expect(config.drizzle).toBeUndefined();
    expect(config.trpc).toBeUndefined();
    expect(config.notes).toHaveLength(2);
  });

  it('should ask for the router when several files export AppRouter', () => {
    writeFileSync(
      join(root, 'api', 'src', 'other.ts'),
      'export type AppRouter = never;\n',
    );

    expect(() => resolveConfig(root)).toThrow(/Found 2 files exporting AppRouter/u);
  });
});

describe('generateDocs', () => {
  it('should write both files, then find them unchanged', async () => {
    const first = await generateDocs({ root });
    const second = await generateDocs({ root, check: true });

    expect(first.files.map((file) => file.status)).toEqual(['written', 'written']);
    expect(second.files.map((file) => file.status)).toEqual(['unchanged', 'unchanged']);
    expect(generated(DATABASE_FILE)).toContain(
      'Generated by `doc-gen` from [db/src/schema/index.ts](../../../db/src/schema/index.ts).',
    );
    expect(generated(API_ROUTES_FILE)).toContain(
      "## posts\n\n- `posts.create` · mutation · `{ title }`\n- `posts.list` · query · `{ userId, limit? }`: Lists a user's posts, newest first.\n",
    );
  });

  it('should report stale files in check mode without writing', async () => {
    await generateDocs({ root });
    writeFileSync(join(root, DEFAULT_OUT, API_ROUTES_FILE), 'old\n');
    const result = await generateDocs({ root, check: true });

    expect(result.files.find((file) => file.path.endsWith(API_ROUTES_FILE))?.status).toBe(
      'stale',
    );
    expect(generated(API_ROUTES_FILE)).toBe('old\n');
  });

  it('should remove a file it no longer generates', async () => {
    await generateDocs({ root });
    writeFileSync(join(root, 'doc-gen.config.json'), '{ "trpc": false }');
    const result = await generateDocs({ root });

    expect(result.files.find((file) => file.path.endsWith(API_ROUTES_FILE))?.status).toBe(
      'removed',
    );
    expect(existsSync(join(root, DEFAULT_OUT, API_ROUTES_FILE))).toBe(false);
  });
});
