# Next.js app (apps/nextjs)

This directory contains the Next.js frontend web app for the project

# Quick Start

If you use the repository-level startup script (recommended for bringing up DB and services), run them from the repo root as described in the root [`README.md`](../../README.md)).

## Scripts

The `package.json` in this directory provides the main scripts:

- `npm run dev` — start Next.js in development mode (turbopack)
- `npm run build` — build for production
- `npm run start` — start the production server after build
- `npm run lint` — run ESLint
- `npm run test` — run tests (Vitest)
- `npm run test:watch` — run tests in watch mode

Use these when working specifically on the frontend; use the repo-level Docker and orchestration scripts when testing the full stack.

## Testing & CI

Unit and component tests use `vitest`. Run `npm run test` to execute the test suite. The project includes a small `__tests__` folder with component and auth tests.

## Styling & UI

The project uses Tailwind CSS and Radix/UI primitives. Tailwind configuration is in `tailwind.config.ts` and global styles are in `styles/global.css`.

## Troubleshooting

- If ports conflict, ensure no other service is running on `3000`.
- If you see type or ESLint errors after dependency changes, run `npm install` and `npm run build`.

## Links

- Root README: see repository root for overall setup and Docker workflows.
- Developer docs: see [`CONTRIBUTING.md`](../../docs/CONTRIBUTING.md) and [`DEPLOYMENT.md`](../../docs/DEPLOYMENT.md) in the repo root for setup, database, migrations, and deployment steps.
