// @vitest-environment jsdom
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import mermaid from 'mermaid';
import { describe, expect, it } from 'vitest';

import { readDrizzleSchema, renderDatabase } from '../src';

const here = dirname(fileURLToPath(import.meta.url));
const schema = join(here, 'fixtures', 'project', 'db', 'src', 'schema', 'index.ts');

function diagrams(markdown: string): string[] {
  return [...markdown.matchAll(/```mermaid\n(?<body>[\s\S]*?)```/gu)].map(
    (match) => match.groups?.['body'] ?? '',
  );
}

describe('database diagram', () => {
  it('should be checked by a parser that rejects bad syntax', async () => {
    await expect(
      mermaid.parse('erDiagram\n    users {\n        numeric(10, 2) price\n    }\n'),
    ).rejects.toThrow();
  });

  it('should be valid Mermaid, including awkward types and names', async () => {
    const groups = await readDrizzleSchema(schema, 'postgresql');
    groups.push({
      name: 'awkward',
      tables: [
        {
          name: '2fa codes',
          columns: [
            {
              name: 'id',
              type: 'serial',
              primaryKey: true,
              notNull: true,
              unique: false,
            },
            {
              name: 'vec',
              type: 'vector(1536)',
              primaryKey: false,
              notNull: true,
              unique: false,
            },
            {
              name: 'tags',
              type: 'text[]',
              primaryKey: false,
              notNull: false,
              unique: false,
            },
            {
              name: 'amount',
              type: 'numeric(10, 2)',
              primaryKey: false,
              notNull: false,
              unique: true,
            },
          ],
          foreignKeys: [{ columns: ['id'], table: 'users', foreignColumns: ['id'] }],
        },
      ],
    });
    const found = diagrams(renderDatabase(groups, 'x'));

    expect(found).toHaveLength(3);
    for (const diagram of found) {
      await expect(mermaid.parse(diagram)).resolves.toBeTruthy();
    }
  });
});
