import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkMaps } from '../src';

let root: string;

function write(path: string, content: string): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function diagram(link: string): string {
  return `\`\`\`mermaid\n%%{init: {"themeCSS":"a"}}%%\nflowchart TD\nA["<a href='${link}'>open</a>"]\n\`\`\`\n`;
}

function validProject(): void {
  write('docs/000-overview/app-map.md', diagram('../001-example/README.md'));
  write(
    'docs/001-example/README.md',
    `${diagram('guide.md')}\n[app](../000-overview/app-map.md)\n[tasks](../../.ai/tasks/001-example/README.md)\n[guide](guide.md)`,
  );
  write(
    'docs/001-example/guide.md',
    '# Guide\n[map](README.md)\n## Repeated\n## Repeated\n',
  );
  write('docs/README.md', '[map](001-example/README.md)\n[guide](001-example/guide.md)');
  write('.ai/tasks/001-example/README.md', '[map](../../../docs/001-example/README.md)');
  write(
    '.ai/tasks/001-example/001-work.md',
    '# Work\n**Docs:** [Guide](../../../docs/001-example/guide.md#repeated-1)',
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'doc-check-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('checkMaps', () => {
  it('accepts connected maps, tasks and duplicate heading anchors', () => {
    validProject();
    expect(checkMaps(root)).toEqual({ problems: [], staleCode: [] });
  });

  it('reports missing maps and task documentation links', () => {
    write('.ai/tasks/001-example/001-work.md', '# Work');
    expect(checkMaps(root).problems).toEqual(
      expect.arrayContaining([
        'docs/000-overview/app-map.md: missing',
        '.ai/tasks/001-example/001-work.md: no **Docs:** line under the header',
      ]),
    );
  });

  it('reports broken doc links and headings but counts stale code links separately', () => {
    validProject();
    write(
      'docs/001-example/guide.md',
      '# Guide\n[map](README.md)\n[missing](missing.md)\n[anchor](#missing)\n[code](../../src/gone.ts)',
    );
    const result = checkMaps(root);
    expect(result.problems).toEqual(
      expect.arrayContaining([
        'docs/001-example/guide.md: broken link missing.md',
        'docs/001-example/guide.md: no heading for #missing',
      ]),
    );
    expect(result.staleCode).toEqual(['docs/001-example/guide.md: ../../src/gone.ts']);
  });

  it('checks map conventions and links between feature maps and tasks', () => {
    validProject();
    write('docs/001-example/README.md', '```mermaid\nflowchart LR\nclick A "url"\n```');
    const problems = checkMaps(root).problems.join('\n');
    expect(problems).toContain('map must be `flowchart TD`');
    expect(problems).toContain('map is missing the link style line');
    expect(problems).toContain('no clickable blocks');
    expect(problems).toContain('does not link its tasks');
    expect(problems).toContain('mermaid `click` does nothing');
  });

  it('does not check links in ordinary code blocks or inline code', () => {
    validProject();
    write(
      'docs/001-example/guide.md',
      '# Guide\n[map](README.md)\n`[fake](missing.md)`\n```md\n[fake](missing.md)\n```\n## Repeated\n## Repeated',
    );
    expect(checkMaps(root).problems).toEqual([]);
  });
});
