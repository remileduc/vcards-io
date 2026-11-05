vcards-io
=========

Offline, browser-only tool to back up phone contacts to a `.vcf` file,
inspect and edit them, and restore them on another phone. Built on
JSContact (RFC 9553) with reusable libraries:

| Package                | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `@vcards-io/vcard`     | tolerant vCard 2.1 / 3.0 / 4.0 reader, 4.0 normaliser,       |
|                        | 3.0 / 4.0 writer                                             |
| `@vcards-io/jscontact` | JSContact 2.0 types, validator, pointer/patch, diff          |
| `@vcards-io/convert`   | vCard <-> JSContact (RFC 9555) and the Android / Apple / RFC |
|                        | export profiles                                              |
| `apps/web`             | the Vite + Lit web app                                       |

Status: milestone 0 (scaffolding). The specification, architecture and
milestones are in `docs/plan.md`; device behaviour in `docs/interop.md`;
decisions in `docs/decisions.md`.

Development
-----------

Requires Node 24 and pnpm 12.

```
pnpm install
pnpm lint        # biome
pnpm typecheck   # tsc --noEmit in every package
pnpm test        # vitest
pnpm build       # libraries (tsc) then the app (vite)
pnpm dev         # vite dev server, http://localhost:5173/vcards-io/
pnpm preview     # serve the production build
```

Licence: MIT.
