# Dashboard

The Horizon app code lives here.

## Start Here

- [[../06_Integrations/Horizon/index|Horizon index]] - app-level data map, state policy, and build/runtime reference.
- `src/` - React app source.
- `server.cjs` - local API/static server.
- `electron/main.cjs` - native desktop app bootstrap.
- `server/vaultConnection.cjs` - machine-local workspace selection and validation.
- `dist/` - built UI served by the server.

The installed app and the user's workspace are separate. The Windows installer places Horizon under `%LOCALAPPDATA%/Programs/Horizon`. On first launch, **Create my workspace** makes a ready-to-use Horizon workspace in Documents with one action. **Use an existing vault** points Horizon at an existing Obsidian vault without copying it.

## Git Policy

- Commit source and safe built `dist/` assets.
- Do not commit `node_modules/`.
- Do not commit `native-dist/`.
- Do not commit local runtime state from `00_System/local/Horizon/`.
