# E2B Template

This folder contains a prebuilt E2B sandbox template for the Web IDE.

It moves the expensive work out of `createSession()` and into a one-time template build:

- install `@anthropic-ai/claude-code`
- scaffold the starter Next.js app
- install app dependencies
- snapshot a running `next dev` process on port `3000`

## Build it

1. Install the current E2B CLI: `npm i -g @e2b/cli`
2. Authenticate once: `e2b auth login`
3. From the repo root, run: `npm run e2b:template:create --workspace=apps/server`
4. Copy the resulting template name or template ID into `E2B_TEMPLATE`

`e2b template build` is part of an older CLI flow. The current docs use `e2b template create`.

## Use it

Set `E2B_TEMPLATE=claude-web-ide` (or the returned template ID) for the server.

When `E2B_TEMPLATE` is present, the server skips `setup.sh` and creates sandboxes directly from the prebuilt template snapshot.

When `E2B_TEMPLATE` is absent, the server falls back to the slower runtime bootstrap in `apps/server/setup.sh`.
