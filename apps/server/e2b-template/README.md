# E2B Template

This folder contains the E2B sandbox template definition for the Web IDE.

It uses the E2B v2 SDK-based format so we can move the expensive work out of `createSession()` and into a one-time template build:

- install `@anthropic-ai/claude-code`
- copy the pre-scaffolded Next.js (Pages Router) + OpenNext template from `templates/`
- install app dependencies
- snapshot a running `next dev` process on port `3000`

## Build it

1. Install the server workspace dependencies so `e2b`, `tsx`, and `dotenv` are available: `npm install --workspace=apps/server`
2. Set `E2B_API_KEY` in your environment or in `apps/server/.env`
3. From the repo root, run: `npm run e2b:template:create --workspace=apps/server`
4. Copy the resulting template name or template ID into `E2B_TEMPLATE`

The SDK build reads `e2b.Dockerfile` with `Template().fromDockerfile(...)` and then sets the snapshotted dev server start command in `template.ts`.

If you need a separate non-production template tag, run `npm run e2b:template:create:dev --workspace=apps/server`.

## Use it

Set `E2B_TEMPLATE=claude-web-ide` (or the returned template ID) for the server.

When `E2B_TEMPLATE` is present, the server skips `setup.sh` and creates sandboxes directly from the prebuilt template snapshot.

When `E2B_TEMPLATE` is absent, the server falls back to the slower runtime bootstrap in `apps/server/setup.sh`.
