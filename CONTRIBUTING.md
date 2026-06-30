# Contributing to Syncraft Labs

Contributing guide for Syncraft Labs.

## Development Setup

### Prerequisites

- **Node.js** ≥ 20.0.0
- **npm** ≥ 10.0.0

### Getting Started

```bash
# Clone the repository
git clone https://github.com/denislistiadi/syncraft-labs.git
cd syncraft-labs

# Install dependencies (all workspaces)
npm install

# Build all packages (core → react/vue dependency order handled by Turbo)
npm run build

# Run all tests
npm run test
```

### Project Structure

```
syncraft-labs/
├── packages/
│   ├── core/          # @syncraft-labs/core — engine & IndexedDB layer
│   ├── react/         # @syncraft-labs/react — useSync hook
│   └── vue/           # @syncraft-labs/vue — useSync composable
├── apps/
│   └── playground/    # React + Vite demo app
├── turbo.json         # Turborepo pipeline config
├── tsconfig.base.json # Shared TypeScript config
└── vitest.workspace.ts
```

### Common Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build all packages (via Turbo) |
| `npm run dev` | Start dev mode (watch + playground) |
| `npm run test` | Run all tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run clean` | Remove all `dist/` and `node_modules/` |

### Working on a Specific Package

```bash
# Build only core
cd packages/core
npm run build

# Watch mode for core
npm run dev

# Run core tests
npm run test

# Run core tests in watch mode
npm run test:watch
```

## Making Changes

### Branch Naming

- `feat/description` — New features
- `fix/description` — Bug fixes
- `docs/description` — Documentation only
- `refactor/description` — Code refactoring
- `test/description` — Test additions/changes

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`  
**Scopes:** `core`, `react`, `vue`, `playground`, `infra`

Examples:
```
feat(core): add maxOutboxSize configuration option
fix(react): prevent double-hydration on StrictMode
docs(readme): add Vue composable examples
test(core): add outbox overflow test cases
```

### Code Style

- **TypeScript** strict mode — no `any` unless absolutely necessary
- **JSDoc** comments on all public API surfaces
- **Immer** for all state mutations — never mutate directly
- Keep files focused — one concept per file
- Prefer `readonly` arrays and interfaces where possible

### Testing

- All tests use [Vitest](https://vitest.dev/)
- IndexedDB tests use [`fake-indexeddb`](https://github.com/nicolo-ribaudo/fake-indexeddb) for in-memory simulation
- React tests use `@testing-library/react`
- Vue tests use `@vue/test-utils`

```bash
# Run all tests
npm run test

# Run tests for a specific package
cd packages/core && npm run test

# Watch mode
npm run test:watch
```

**Before submitting a PR, make sure:**

```bash
# All tests pass
npm run test

# All packages build cleanly
npm run build
```

## Pull Request Process

1. Fork the repo and create your branch from `main`
2. Make your changes with clear commit messages
3. Add tests for any new functionality
4. Ensure all tests pass and builds succeed
5. Update documentation if the public API changes
6. Update `CHANGELOG.md` under `[Unreleased]`
7. Submit your PR with a clear description

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include reproduction steps for bugs
- For security issues, email directly instead of opening a public issue

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
