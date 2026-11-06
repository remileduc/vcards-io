Decision log
============

One paragraph per decision. Newest at the bottom. Dates are the day the
decision was taken.

2026-11-02 Restart from scratch
-------------------------------

The 2023 code (generic name/params/values model, no UI, several parser
bugs) is not reused. Only its shape is kept: strict TypeScript, no runtime
dependency in libraries, CI with a coverage gate, JSDoc on public API.

2026-11-02 Primary use case is phone backup and restore
-------------------------------------------------------

Android (AOSP `com.android.vcard` importer) first, Apple Contacts second.
Readers are tolerant. Writers emit what the device importers actually read,
through export profiles, not what the RFC says a conforming reader should
accept. See `interop.md`.

2026-11-02 JSContact 2.0 is the internal and persisted format
-------------------------------------------------------------

RFC 9553 as updated by RFC 9982: `version: "2.0"`, `uid` optional,
converters never synthesize a uid. Mapping follows RFC 9555 with its two
errata applied. The app assigns a `urn:uuid:` uid on import when a card has
none, because it needs a storage key and Android exports never carry one.

2026-11-02 Three libraries plus one app, pnpm workspace
-------------------------------------------------------

`@vcards-io/vcard` (parse 2.1/3.0/4.0, normalise to 4.0, write 3.0/4.0),
`@vcards-io/jscontact` (types, validator, pointer/patch, vendor values,
diff), `@vcards-io/convert` (RFC 9555 both ways plus export profiles),
`apps/web` (Vite + Lit). Libraries are built with plain `tsc` to ESM and
`.d.ts`; no bundler, so the TypeScript 7 native compiler has nothing to
plug into.

2026-11-02 vCard 3.0 is the primary export; 2.1 is never written
----------------------------------------------------------------

Android's Contacts app never uses its 4.0 parser and rejects `VERSION:4.0`.
Its 2.1 parser aborts the whole file on any parameter name it does not know
(`PREF=`, `LABEL=`, `SORT-AS=`), while its 3.0 parser keeps unknown
parameters. Apple imports 3.0 reliably and 4.0 badly. Hence profiles
`android` (3.0), `apple` (3.0) and `rfc` (4.0, lossless interchange).

2026-11-02 Exports are written for humans first
-----------------------------------------------

Raw UTF-8, never quoted-printable or `CHARSET`, minimal escaping, a fixed
readable property order with `PHOTO` last, folding only on lines over 75
octets and at a space when possible, pretty-printed JSON with a stable key
order. Deviations only where an importer forces them.

2026-11-02 Lit for the UI, IndexedDB for storage, Biome for lint and format
---------------------------------------------------------------------------

Lit 3 is the one UI dependency (standard custom elements underneath).
IndexedDB because base64 photos blow through the localStorage quota. Biome 2
replaces ESLint and Prettier; the price is weaker type-aware rules.

2026-11-02 Project vendor prefix for JSContact extensions
---------------------------------------------------------

RFC 9553 requires vendor values and properties to be prefixed with a domain
the vendor controls. The GitHub Pages host `remileduc.github.io` is used:
`remileduc.github.io:kind` on Nickname (maiden, short, initials, other,
custom) and vendor relation keys (mother, father, brother, sister,
domestic-partner, partner, assistant, manager, referred-by). Everything
else without a standard equivalent stays in `vCardProps`.

2026-11-02 Toolchain pins
-------------------------

Node 24 LTS (host install via apt), pnpm 12, TypeScript 7, Vite 8,
Vitest 5, Biome 2.6, Lit 3.3, Playwright for e2e from milestone 7. CI uses
`node-version: latest` on purpose, so that a new Node release that breaks the build shows up in CI early; `engines` still states the minimum.

2026-11-06 Encoding globals typed locally, libraries stay off lib.dom
---------------------------------------------------------------------

`TextEncoder`/`TextDecoder` are WHATWG Encoding globals available in every
browser and in Node, but TypeScript only types them in `lib.dom`. The
libraries keep `lib: ["ES2025"]` and declare the subset they use in
`packages/vcard/src/whatwg-encoding.d.ts`, so an accidental `document` or
`fetch` in library code still fails to typecheck. The app keeps the DOM lib.

2026-11-06 Date values are partial-field objects, timestamps are complete
-------------------------------------------------------------------------

`DateAndOrTime` has every part optional; the `VValue` variant that carries
it keeps the original string in `raw` beside it. A date has no hour, a time
has no date part, a date-time has both, and both parts use the same form
(basic or extended), so a mixed `1985-0412` is rejected rather than silently
normalised. Formatters range-check every field and throw `RangeError`.
`Timestamp` (REV, CREATED) requires a full date-time and a date-only REV is
rejected by `parseTimestamp`, so the reader types it as date-and-or-time
with a warning instead of inventing a midnight. Fractional seconds are
accepted and dropped. The Apple placeholder year 1604 and Android's
`--MM-DD` parse as written; rewriting them is the normaliser's job.

2026-11-06 TEL defaults to text in 4.0, common and specific params never overlap
-------------------------------------------------------------------------------

RFC 6350 6.4.1 keeps TEL as free-form text unless `VALUE=uri` is present,
for 3.0 compatibility, and that is what Android and Apple write; the registry
follows the RFC rather than the SHOULD. `COMMON_PARAMS` holds only the
parameters any property may carry (LANGUAGE, VALUE, PREF, ALTID, PID, TYPE,
plus CREATED, DERIVED, PROP-ID from RFC 9554); everything else, MEDIATYPE
included, lives on the property in `PropertySpec.params`, and a test keeps the
two tables disjoint so an allowed-parameter check is the plain union.
