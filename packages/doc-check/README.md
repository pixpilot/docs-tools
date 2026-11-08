# @pixpilot/doc-check

Check that documentation maps, feature docs and tasks follow the project-map conventions and link to each other. Runs locally or in CI using Node.js 24.15 or newer.

## Install and run

```sh
pnpm add -D @pixpilot/doc-check
pnpm exec doc-check
pnpm exec doc-check path/to/project --code
```

Add `"docs:check": "doc-check"` to your package scripts and run `pnpm docs:check` in CI. `--code` lists missing links outside `docs/` and `.ai/tasks/`; they are notes and do not fail the check. Exit codes: 0 for success, 1 for check failures, 2 for invalid arguments or an execution error.

## Rules

The checker expects `docs/000-overview/app-map.md`, numbered feature folders in `docs/` and `.ai/tasks/`, and clickable Mermaid feature maps in their README files. It checks local documentation and task links and heading anchors; map styles, links and back links; the documentation index when present; and `**Docs:**` links in numbered tasks. Missing links to code are notes. External links are not checked. It does not render Mermaid or verify that maps reflect the actual application.

## API

```ts
import { checkMaps } from '@pixpilot/doc-check';

const { problems, staleCode } = checkMaps(process.cwd());
if (problems.length) console.error(problems);
```

Both arrays contain project-relative diagnostic strings. The function defaults to the current working directory and does not print or set an exit code.
