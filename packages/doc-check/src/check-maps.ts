// Keep the migrated Markdown expressions unchanged for compatibility with existing maps.
/* eslint-disable prefer-named-capture-group, require-unicode-regexp, regexp/no-super-linear-backtracking, regexp/optimal-quantifier-concatenation */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export interface CheckMapsResult {
  problems: string[];
  staleCode: string[];
}

/** Checks the project's maps, documentation links and tasks. */
export function checkMaps(projectRoot: string = '.'): CheckMapsResult {
  const taskHeaderLines = 10;
  const root = resolve(projectRoot);
  const docs = join(root, 'docs');
  const tasks = join(root, '.ai', 'tasks');
  const appMap = join(docs, '000-overview', 'app-map.md');
  const problems: string[] = [];
  const rel = (file: string) => relative(root, file).replaceAll('\\', '/');
  const report = (file: string, message: string) =>
    problems.push(`${rel(file)}: ${message}`);
  const read = (file: string) => readFileSync(file, 'utf8');
  const dirs = (dir: string) =>
    existsSync(dir)
      ? readdirSync(dir).filter(
          (name) => /^\d{3}-/.test(name) && statSync(join(dir, name)).isDirectory(),
        )
      : [];

  function markdownFiles(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return markdownFiles(path);
      return entry.name.endsWith('.md') ? [path] : [];
    });
  }

  /** The first mermaid block, or an empty string. */
  const mermaid = (text: string) => /```mermaid\r?\n([\s\S]*?)```/.exec(text)?.[1] ?? '';

  /** Links inside a diagram's block labels. */
  const blockLinks = (diagram: string) =>
    [...diagram.matchAll(/<a href='([^']+)'>/g)].map((match) => match[1]!);

  function withoutCode(text: string) {
    return text
      .replace(/^( *)(`{3,}|~{3,})(?!mermaid)[^\n]*\n[\s\S]*?^\1\2[ \t]*$/gm, '')
      .replace(/`[^`\n]*`/g, '');
  }

  /** Heading anchors, as GitHub and VS Code build them. */
  function anchors(text: string) {
    const seen = new Map<string, number>();
    const found = new Set<string>();
    const body = text.replace(/^( *)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[ \t]*$/gm, '');
    for (const match of body.matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*(?:#+[ \t]*)?$/gm)) {
      const plain = match[1]!
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[`*]/g, '');
      const base = plain
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .replace(/\s/g, '-');
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      found.add(count === 0 ? base : `${base}-${count}`);
    }
    return found;
  }

  /** A link into the docs or tasks must work; old links to code that moved only get counted. */
  const inside = (dir: string, target: string) => {
    const path = relative(dir, target);
    return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
  };
  const inScope = (target: string) => [docs, tasks].some((dir) => inside(dir, target));
  const staleCode: string[] = [];

  function checkLink(file: string, link: string) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(link)) return;
    const [path, anchor] = decodeURI(link).split('#');
    const target =
      path !== undefined && path !== '' ? resolve(dirname(file), path) : file;
    if (!inside(root, target)) return;
    if (!existsSync(target)) {
      if (inScope(target)) report(file, `broken link ${link}`);
      else staleCode.push(`${rel(file)}: ${link}`);
      return;
    }
    if (
      anchor !== undefined &&
      anchor !== '' &&
      target.endsWith('.md') &&
      !anchors(read(target)).has(anchor.toLowerCase())
    ) {
      report(file, `no heading for ${link}`);
    }
  }

  /** Every link in a file resolves, including those inside diagram labels. */
  function checkLinks(file: string) {
    const text = read(file);
    const clean = withoutCode(text);
    for (const match of clean.matchAll(
      /\]\(<([^>]+)>\)|\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    )) {
      checkLink(file, (match[1] ?? match[2])!);
    }
    for (const match of text.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)) {
      for (const link of blockLinks(match[1]!)) checkLink(file, link);
      if (/^\s*click\s/m.test(match[1]!))
        report(file, 'mermaid `click` does nothing in VS Code: link in the block label');
    }
  }

  /** The files a diagram's block links open, as absolute paths. */
  function targets(file: string) {
    return new Set(
      blockLinks(mermaid(read(file)))
        .filter((link) => !link.startsWith('#'))
        .map((link) => resolve(dirname(file), decodeURI(link).split('#')[0]!)),
    );
  }

  function linksTo(file: string, target: string) {
    for (const match of read(file).matchAll(/\]\(([^)\s#]+)[^)]*\)/g)) {
      if (
        !/^[a-z][a-z0-9+.-]*:/i.test(match[1]!) &&
        resolve(dirname(file), decodeURI(match[1]!)) === target
      )
        return true;
    }
    return false;
  }

  function checkMap(file: string): void {
    const diagram = mermaid(read(file));
    if (!diagram) {
      report(file, 'no map');
      return;
    }
    if (!/^\s*flowchart TD\b/m.test(diagram)) report(file, 'map must be `flowchart TD`');
    if (!/themeCSS/.test(diagram)) report(file, 'map is missing the link style line');
    if (blockLinks(diagram).length === 0) report(file, 'no clickable blocks');
  }

  for (const file of [...markdownFiles(docs), ...markdownFiles(tasks)]) checkLinks(file);

  if (!existsSync(appMap)) {
    report(appMap, 'missing');
  } else {
    checkMap(appMap);
    const onMap = targets(appMap);
    const featureFolders = new Set([...dirs(docs), ...dirs(tasks)]);
    featureFolders.delete('000-overview');
    for (const feature of featureFolders) {
      const map = join(docs, feature, 'README.md');
      if (!existsSync(map)) {
        report(map, 'feature has no map');
        continue;
      }
      if (!onMap.has(map)) report(appMap, `no block opens ${feature}`);
      if (!existsSync(join(tasks, feature))) continue;
      const taskReadme = join(tasks, feature, 'README.md');
      if (!existsSync(taskReadme)) report(taskReadme, 'missing');
      else if (!linksTo(taskReadme, map))
        report(taskReadme, 'does not link its feature map');
      if (!linksTo(map, taskReadme)) report(map, 'does not link its tasks');
    }
    const index = join(docs, 'README.md');
    for (const feature of dirs(docs)) {
      const map = join(docs, feature, 'README.md');
      if (!existsSync(map)) continue;
      checkMap(map);
      if (!linksTo(map, appMap) && map !== appMap)
        report(map, 'does not link back to the app map');
      const opened = targets(map);
      for (const name of readdirSync(join(docs, feature)).filter(
        (n) => n.endsWith('.md') && n !== 'README.md',
      )) {
        const doc = join(docs, feature, name);
        if (feature !== '000-overview' && !opened.has(doc))
          report(map, `no block opens ${name}`);
        if (!linksTo(map, doc)) report(map, `reading order misses ${name}`);
        if (!linksTo(doc, map)) report(doc, 'does not link back to its feature map');
        if (existsSync(index) && !linksTo(index, doc))
          report(index, `misses ${feature}/${name}`);
      }
      if (existsSync(index) && !linksTo(index, map)) report(index, `misses ${feature}`);
    }
  }

  for (const feature of dirs(tasks)) {
    const folder = join(tasks, feature);
    for (const name of readdirSync(folder).filter((n) => /^\d{3}-.*\.md$/.test(n))) {
      const file = join(folder, name);
      const head = read(file).split(/\r?\n/).slice(0, taskHeaderLines).join('\n');
      const line = /^\*\*Docs:\*\*.*$/m.exec(head)?.[0];
      if (line === undefined) report(file, 'no **Docs:** line under the header');
      else if (!/\]\([^)]*docs\/[^)]+\)/.test(line))
        report(file, '**Docs:** links no doc');
    }
  }

  return { problems, staleCode };
}
