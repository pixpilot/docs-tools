#!/usr/bin/env node
import process from 'node:process';

import { generateDocs } from './generate';

const OK = 0;
const STALE = 1;
const FAILED = 2;

const USAGE = 'Usage: doc-gen [repo] [--check]';
const HELP = `${USAGE}

Writes the database diagram (Drizzle) and API route list (tRPC) to
docs/000-overview/generated/. --check writes nothing and fails when they are out of date.`;

async function main(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return OK;
  }
  const unknown = args.filter((arg) => arg.startsWith('-') && arg !== '--check');
  const paths = args.filter((arg) => !arg.startsWith('-'));
  if (unknown.length > 0 || paths.length > 1) {
    console.error(USAGE);
    return FAILED;
  }
  try {
    const [root] = paths;
    const { files, notes } = await generateDocs({
      ...(root !== undefined && { root }),
      check: args.includes('--check'),
    });
    for (const note of notes) console.log(`Note: ${note}`);
    for (const file of files) console.log(`${file.status}: ${file.path}`);
    const stale = files.filter((file) => file.status === 'stale');
    if (stale.length === 0) return OK;
    console.log(
      `\n${stale.length} generated file(s) out of date: run doc-gen and commit the result.`,
    );
    return STALE;
  } catch (error) {
    console.error(`doc-gen: ${error instanceof Error ? error.message : String(error)}`);
    return FAILED;
  }
}

const [, , ...args] = process.argv;
void main(args).then((code) => {
  process.exitCode = code;
});
