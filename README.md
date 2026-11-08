# Docs Tools

> A modern TypeScript monorepo managed with pnpm and TurboRepo.

## 🚀 Getting Started

### Development

Build all packages:

```sh
pnpm build
```

Run tests:

```sh
pnpm test
```

Lint and format:

```sh
pnpm lint
pnpm format
```

### Create a New Package

Generate a new package in the monorepo:

```sh
pnpm run gen:package
```

## 📦 Packages

### [doc-check](./packages/doc-check/README.md)

Check project documentation maps, links and tasks in local workflows and CI.

### [doc-gen](./packages/doc-gen/README.md)

Generate database diagrams (Drizzle) and API route lists (tRPC) for project docs, and check them in CI.


## 🚢 Releases

This project uses [Changesets](https://github.com/changesets/changesets) for version management and publishing.

## 📄 License

[MIT](LICENSE)
