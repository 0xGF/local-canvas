# local-canvas-swc-plugin

SWC plugin that stamps every JSX opening element with `data-source-file`,
`data-source-line`, and `data-source-col` attributes so [Local Canvas][lc] can
map clicks in the browser back to a source location. Same semantics as the
Babel plugin, but runs inside the host's SWC transform — zero Babel step,
Turbopack-native.

The plugin is published as part of the main `local-canvas` npm package; the
`./swc` subpath export points at the bundled WASM. There's no separate install
for consumers — `npm install local-canvas` is enough.

## Next.js

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    swcPlugins: [
      ["local-canvas/swc", { projectRoot: __dirname }],
    ],
  },
};

export default nextConfig;
```

`projectRoot` anchors the emitted paths. Set it whenever Turbopack's workspace
root resolves above the project (monorepo, `file:..` link) so stamped paths
come out clean (`src/app/page.tsx`, not `apps/web/src/app/page.tsx`).

## Host compatibility

SWC plugins have an ABI boundary pinned to `swc_core`'s serialization format.
Host + plugin have to agree or the plugin load fails with
`Plugin's AST schema version is not compatible with host's`.

| Host              | Embedded `swc_core` | Status          |
|-------------------|---------------------|-----------------|
| Next.js **16.2+** | `64.0.x`            | ✅ Verified      |
| Next.js 15.x      | `14.x` (swc_common) | ❌ ABI mismatch  |
| Next.js ≤ 14      | older               | ❌ ABI mismatch  |

The plugin's `Cargo.toml` tracks `swc_core = "64.0.*"`. Supporting an older
Next major would require a parallel build at the matching `swc_core` version;
the visitor logic is pure so a branch-per-host strategy is viable, but nobody
has asked yet. File an issue if you need it.

[lc]: https://github.com/0xGF/local-canvas

## Development

```sh
cd src/plugin/swc
cargo test              # unit + e2e (parses real JSX, snapshots output)
cargo build-wasip1 --release
```

The `.cargo/config.toml` defines `build-wasip1` / `build-wasm32` aliases. CI
(`.github/workflows/swc-plugin.yml`) runs fmt, clippy, tests, the wasip1
build, and a size ceiling check on every push to `main` and PR that touches
`src/plugin/swc/**`.

## How it works

Single-file visitor in [src/lib.rs](src/lib.rs):

1. `process_transform` — plugin entry point. Reads `projectRoot` from the
   transform config, pulls `filename` + `cwd` from the plugin metadata,
   resolves a project-relative path.
2. `resolve_source_context` — computes the project-relative path, handling
   three host quirks: absolute filenames, Turbopack's pre-stripped-against-
   workspace filenames, and the fallback "just emit what we've got" case.
3. `TransformVisitor` — walks every JSXOpeningElement. Skips Fragments and
   already-stamped elements. Uses `lookup_char_pos(node.span.lo)` for line
   + column from the host's source map.

Paths are normalized to forward slashes so the overlay's resolver works on
Windows too.
