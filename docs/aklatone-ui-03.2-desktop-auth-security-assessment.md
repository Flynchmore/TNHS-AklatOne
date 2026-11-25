# AklatOne Desktop Auth Security Assessment

## Current auth architecture
- Frontend in-memory token (localStorage not used).
- Backend JWT (exp from token).
- No refresh token.

## Tauri capability audit
- default.json: core:default only. Least privilege.

## Credential storage comparison
- localStorage: not secure for desktop.
- Stronghold: encrypted, but extra complexity.
- OS keychain: recommended for Linux/Windows/macOS.

## Recommended strategy
- Use OS credential store (keyring) via Tauri plugin if available; otherwise Stronghold.
- Store token in OS keychain; never in frontend bundle.

## Cross-platform
- Linux: Secret Service.
- Windows: Credential Manager.
- macOS: Keychain (requires macOS build).

## Security risks
- Token in memory lost on app close (acceptable).
- No server-side session invalidation.

## Implementation roadmap
- Add Tauri command to store/retrieve token in OS keychain.
- Update auth context to use native storage when running in Tauri.

## Tests required
- Token storage/retrieval in desktop environment.

## Unresolved decisions
- Choose between Stronghold and OS keychain.
- macOS build environment unavailable.