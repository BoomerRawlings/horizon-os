# Dashboard

The Horizon app code lives here.

## Start Here

- [[../06_Integrations/Horizon/index|Horizon index]] - app-level data map, state policy, and build/runtime reference.
- `src/` - React app source.
- `server.cjs` - local API/static server.
- `electron/main.cjs` - native desktop app bootstrap.
- `dist/` - built UI served by the server.

## Git Policy

- Commit source and safe built `dist/` assets.
- Do not commit `node_modules/`.
- Do not commit `native-dist/`.
- Do not commit local runtime state from `00_System/local/Horizon/`.
