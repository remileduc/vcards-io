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

2026-11-06 Parser front end is internal and works on bytes end to end
----------------------------------------------------------------------

The byte reader, unfolder, content-line lexer and card grouper live in
`packages/vcard/src/parse/` and are not exported: the public surface is
`parseVCards` only, so the raw shapes can change without a breaking release.
Their tests import the modules directly, the one exception to "tests import
from `src/index.js`". Parameter values stay `Uint8Array` until the version
and charset are known; the lexer only decodes names (ASCII) and the few
tokens the unfolder needs (ENCODING, the property name for the AOSP N/ADR/ORG
join). Tolerances beyond the plan that fixtures forced: an unindented line
without `:` continues N/ADR/ORG with a warning (Google export), empty
parameters are silent because AOSP writes `TEL;:` for untyped phones, a
quoted-printable soft break followed by `BEGIN:`/`END:` is never joined so a
truncated value cannot eat a card delimiter, and `#` lines are comments.
Hostile-input review added two caps the plan did not have: issues are
limited to 1000 per code (`IssueCollector`), and the unfolder builds each
logical line in one growable buffer, so a million one-space continuation
lines cost a megabyte rather than a view per line. Fixture tests need
`node:fs`, so `@types/node` is a root dev dependency, but
`tsconfig.base.json` sets `"types": []` and only `test/env.d.ts` references
it: the build program (src alone) still rejects a `node:` import, keeping
the libraries browser-only by construction.

2026-11-06 The unfolder reads line headers through the lexer
------------------------------------------------------------

The unfolder needs the property name and `ENCODING` of the line being built
to apply the quoted-printable, base64 and N/ADR/ORG join rules, before the
lexer runs on the finished logical line. A first version kept its own
simplified header reader (toggle on every `"`, split on `;` and `,`), which
disagreed with the lexer on unbalanced quotes and on quoted values containing
`,QUOTED-PRINTABLE`, so a line could be joined or not on grounds the lexer
would then contradict. The unfolder now only locates the first unquoted `:`,
with a small state machine that applies the lexer's quote rule (a quote opens
only at a value start and must be followed by `,`, `;` or `:`; otherwise it
is plain text, and a quote still open when an unindented line arrives is
unbalanced), then hands the header bytes to `lexContentLine` with a discarded
issue sink and takes name and encoding from the result. The scan resumes
from where it stopped on every fold, and a re-read after a rejected quote is
bounded by that quote's span, so a hostile header folded a hundred thousand
times stays linear. Diagnostics for the header come from the real lexer
pass alone, hence the `discardIssues` sink, also used for the lines kept
verbatim inside a 2.1 AGENT.
