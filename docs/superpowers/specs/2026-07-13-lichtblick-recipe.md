# Lichtblick build recipe (spike results, 2026-07-13)

Verified locally on macOS (node v25.9.0) — the Docker stage uses node:22 +
`npm i -g corepack` (node ≥25 no longer bundles corepack; node:22 does, but
installing explicitly is version-proof).

## Build

```bash
git clone --depth 1 --branch v1.27.0 https://github.com/lichtblick-suite/lichtblick
cd lichtblick
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack yarn install --immutable        # yarn 4.17.0 via packageManager field
corepack yarn web:build:prod             # webpack 5, ~20 s compile after install
```

**Output dir:** `web/.webpack/` (index.html + hashed bundles + wasm/png).

## Subpath serving

**No patch needed.** Asset URLs in index.html are relative
(`src="main.<hash>.js"`), webpack `publicPath` defaults to `"auto"`
(`packages/suite-web/src/webpackConfigs.ts:140`). Verified: served under
`/viewer/`, the main bundle resolves 200.

## Connection deep link

`/viewer/?ds=foxglove-websocket&ds.url=<ws-url>` — handled by
`packages/suite-base/src/util/appURLState.ts` (`ds`, `ds.url` params), the
same convention as Foxglove Studio. Extra query params on the ws url
(our `?session=UUID`) ride along inside the encoded `ds.url` value.

## Layout preload — chosen mechanism: official self-host global

`packages/suite-base/src/providers/CurrentLayoutProvider/defaultLayout.ts`:

```ts
const staticDefaultLayout = (globalThis as {LICHTBLICK_SUITE_DEFAULT_LAYOUT?: LayoutData})
  .LICHTBLICK_SUITE_DEFAULT_LAYOUT;
export const defaultLayout: LayoutData = staticDefaultLayout ?? {…builtin…};
```

So: generate `default-layout.js` containing
`globalThis.LICHTBLICK_SUITE_DEFAULT_LAYOUT = <nav-trial-layout.json>;`
and inject `<script src="default-layout.js"></script>` into index.html
BEFORE the main bundle script tag (sed: `<script src="main.` →
`<script src="default-layout.js"></script><script src="main.`).
Fresh visitors get the nav-trial layout as their "Default" layout —
no page-side seeding needed (`seedViewerLayout()` in the page plan is a
no-op → removed). Our layout JSON keys (`configById, globalVariables,
userNodes, playbackConfig, layout`) match `LayoutData`.

Bonus (not used in v2): `?layout=<name>` selects among existing layouts
(`suite-web/src/WebRoot.tsx`); useful if we ever ship multiple layouts.

## Surprises

- node 25 removed bundled corepack → `npm i -g corepack --force` (a stale
  broken shim existed locally).
- Build is fast (~20 s) once `yarn install` (~4 min) is done; Docker stage
  should cache the install layer.
