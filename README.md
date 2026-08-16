# Handshakes monorepo

Daily sports puzzle games sharing one dataset, jersey renderer, and UI toolkit.

```
apps/journeyman       → journeymanjersey.com   (imported from the standalone repo, history preserved)
apps/handshakes       → handshakes.game        (daily teammate-chain puzzle)
packages/sport-data   → players, team_seasons, appearances, graph + solver
packages/jerseys      → era-accurate SVG jersey renderer + colorway dataset
packages/ui           → shell primitives, streak storage, share-string generator
```

## Setup

```
npm install
npm run dev:handshakes    # or dev:journeyman
```

## Deployment cutover (Journeyman)

The original standalone repo at `../journeyman` is still what Vercel deploys.
Once this monorepo is pushed and verified, point the Vercel project's root
directory at `apps/journeyman` in this repo and retire the standalone one.
Until then, treat `apps/journeyman` here as the migration target, not the
deployment source.
