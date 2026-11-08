#!/usr/bin/env node
import process from 'node:process';

import { checkMaps } from './check-maps';

const [, , ...args] = process.argv;
if (args.includes('--help') || args.includes('-h')) {
  console.log(
    'Usage: doc-check [repo] [--code]\n\nChecks maps, docs and tasks. --code lists stale links to code.',
  );
} else {
  const unknown = args.filter((arg) => arg.startsWith('-') && arg !== '--code');
  const paths = args.filter((arg) => !arg.startsWith('-'));
  if (unknown.length || paths.length > 1) {
    console.error('Usage: doc-check [repo] [--code]');
    process.exitCode = 2;
  } else {
    try {
      const { problems, staleCode } = checkMaps(paths[0]);
      if (staleCode.length > 0) {
        console.log(
          `Note: ${staleCode.length} old link(s) to code files that moved; these don't fail the check.`,
        );
        if (args.includes('--code')) console.log(staleCode.join('\n'));
      }
      if (problems.length > 0) {
        console.log(problems.join('\n'));
        console.log(`\n${problems.length} problem(s).`);
        process.exitCode = 1;
      } else {
        console.log('Maps, docs and tasks are connected.');
      }
    } catch (error) {
      console.error(
        `doc-check: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 2;
    }
  }
}
