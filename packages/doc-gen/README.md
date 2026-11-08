# @pixpilot/doc-gen

Writes a project's database diagram (Drizzle) and API route list (tRPC) as Markdown, so docs link to them instead of drawing them by hand. Node.js 24.15 or newer.

## Install and run

```sh
pnpm add -D @pixpilot/doc-gen
pnpm exec doc-gen          # write the files
pnpm exec doc-gen --check  # write nothing; exit 1 when they are out of date
```

Add `"docs:generate": "doc-gen"` to your scripts and run `pnpm docs:generate --check` in CI. Exit codes: 0 success, 1 out of date, 2 invalid arguments or an error.

## What it writes

In `docs/000-overview/generated/`:

- `database.md`: one Mermaid ER diagram per module the schema entry re-exports (`export * from './voice.schema'` → `## voice`), with columns, keys and foreign keys. Read from a single `drizzle.config.*` (`schema` and `dialect`), loaded with the project's own `drizzle-orm`.
- `api-routes.md`: every procedure under `## <top-level router>`: path, query or mutation, input fields and the first line of its doc comment. Read from the file with `export type AppRouter` through the TypeScript compiler, so the router's runtime code never runs.

A file whose source is missing is skipped, and removed if it was written before.

## Config

Optional `doc-gen.config.json` at the repo root, for repos with several Drizzle configs or `AppRouter` exports:

```json
{
  "out": "docs/000-overview/generated",
  "drizzle": {
    "schema": "packages/database/src/schema/index.ts",
    "dialect": "postgresql"
  },
  "trpc": { "router": "packages/api/src/router.ts", "type": "AppRouter" }
}
```

`"drizzle": false` or `"trpc": false` skips one. `typescript` is a peer dependency.

## API

```ts
import { generateDocs } from '@pixpilot/doc-gen';

const { files, notes } = await generateDocs({ root: process.cwd(), check: true });
```
