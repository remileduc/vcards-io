vcards-io v2: specification, architecture and milestones
========================================================

Context
-------

Primary purpose: **back up phone contacts to a file, inspect and edit them,
and restore them on a new phone**. Android (stock/Google Contacts, which
share the AOSP `com.android.vcard` library) is the first target, Apple
Contacts (iOS/macOS) the second. A later diff tool compares two backups.

The 2023 `remileduc/vcards-io` repo is a three-day, unfinished library: a
generic line-level reader/writer in strict TypeScript, Jest, ESLint and a
tidy CI. No data model, no UI, known bugs (double unescaping, no groups, no
quoted params, no quoted-printable, CRLF only, order lost). Keep only its
_shape_: strict TS, dependency-free core, CI with coverage gate, JSDoc.

Same spirit, new spec: vanilla TypeScript, latest tooling, no retro-compat;
JSContact (RFC 9553, version "2.0" per RFC 9982) as the internal and
persisted format, converted per RFC 9555; reusable npm libraries for all
non-UI code; a static, offline web app on top.

What the research established (2026-11-02, from AOSP source, Apple/Google
export samples, RFCs and npm):

- **Android import** (`ImportVCardActivity` + `VCardParser_V21/V30`):
  tries the 2.1 parser, then 3.0; `VERSION:4.0` → "unsupported", nothing
  imported. The 2.1 parser throws on _any_ parameter name outside
  TYPE/VALUE/ENCODING/CHARSET/LANGUAGE/X-* (so `PREF=1`, `LABEL=`,
  `SORT-AS=` kill the whole file); the 3.0 parser keeps unknown params. One
  malformed card (bad base64, missing END, nested AGENT) rejects the whole
  file. Property names are compared case-sensitively (`tel:` is dropped). A
  UTF-8 BOM silently drops the first card. Groups (`item1.`) are parsed and
  ignored; `X-ABLabel` is dropped. Importing twice duplicates everything.
- **Android export** (stock app): vCard 2.1, UTF-8, `CHARSET=UTF-8;
  ENCODING=QUOTED-PRINTABLE` on non-ASCII, bare TYPE params, `PHOTO;
  ENCODING=BASE64;JPEG:` followed by a blank line, `X-ANDROID-CUSTOM` rows
  for nickname/event/relation, legacy IM `X-AIM`…, `X-SIP`, `X-PHONETIC-*`.
  No UID/REV/PRODID, no groups, no ANNIVERSARY property ever.
- **Apple** imports 3.0 reliably and 4.0 badly (iCloud rejects; `data:`
  photos and `BDAY:--MMDD` dropped; RFC 9554 extra N/ADR components or 4.0
  params on PHOTO make iOS drop the card). Its dialect: `itemN.` groups,
  `X-ABLabel:_$!<Other>!$_`, `X-ABADR`, `X-ABDATE`, `X-ABRELATEDNAMES`,
  `X-APPLE-OMIT-YEAR=1604`, `X-SOCIALPROFILE`, `IMPP;X-SERVICE-TYPE`,
  `X-ADDRESSBOOKSERVER-KIND/MEMBER` for groups.
- **Google Contacts web** "for iOS" export is 3.0 in the Apple dialect with
  an 8th ADR component (formatted address), `PHOTO:https://…` URLs,
  `CATEGORIES:myContacts`, sometimes empty `X-ABLabel:`.
- **No npm library** does tolerant 2.1/3.0/4.0 + RFC 9554 + JSContact in
  the browser. Writing the core is justified. `@sdxc/jscontact` (4.0 only,
  date-versioned) and `bitfireAT/vcard4android`, `sabre/vobject`
  `VCardConverter` (4→3 rules) are good references.
- **RFC 9982** (May 2026): JSContact 2.0, `uid` optional, converters must
  not synthesize one, `version: "2.0"` mandatory, `JSCOMPS` registered.
- Toolchain: TypeScript 7 (native), Vite 8, Vitest 5, Biome 2.6, Lit 3.3,
  pnpm 12. Node 24 LTS is what you will install via apt (fine for Vite 8).

Consequence for the original brief: **vCard 3.0 is the primary export**
(the only version both phone importers accept), produced through
device-specific _profiles_; vCard 4.0 export stays as the standards profile
and as the lossless interchange format. Reading covers 2.1/3.0/4.0.

Decisions already taken (with you)
----------------------------------

| Topic       | Decision                                                            |
| ----------- | ------------------------------------------------------------------- |
| Purpose     | Backup / inspect / edit / restore phone contacts; Android first,    |
|             | Apple second; readers tolerant; vendor fields mapped to real fields |
| Packages    | pnpm monorepo: `@vcards-io/vcard`, `@vcards-io/jscontact`,          |
|             | `@vcards-io/convert`, and `apps/web`                                |
| UI          | Lit 3 web components, no other UI dependency                        |
| Storage     | IndexedDB (JSContact JSON as values), `navigator.storage.persist()` |
| Fixtures    | You provide anonymised real exports (Android, iOS, Google, Outlook, |
|             | Thunderbird) under `fixtures/real/<source>/`                        |
| Deploy      | GitHub Pages via Actions on push to `main`, MIT licence             |
| Lint/format | Biome 2 (no ESLint/Prettier)                                        |
| Node        | Node 24 installed by you on the host via apt; pnpm 12 via npm       |
| npm scope   | `@vcards-io` (you create the org on npmjs before milestone 9)       |
| Git         | You own git. I never commit; you `git init` and review              |

Decisions I am proposing (say so if you disagree)
-------------------------------------------------

| Topic                 | Proposal                                                                         |
| --------------------- | -------------------------------------------------------------------------------- |
| Export profiles       | `android` (3.0, default), `apple` (3.0), `rfc` (4.0). Each is a property-level   |
|                       | mapping in `convert`; the writer only knows syntax per version                   |
| Why not 2.1 out       | Android's 2.1 parser aborts on any unknown parameter and has no `TYPE=` comma    |
|                       | splitting; its 3.0 parser accepts everything we emit. Apple prefers 3.0 too      |
| Library build         | Plain `tsc` (ESM + `.d.ts` + maps). No bundler for libs; avoids TS7 plugin risk  |
| App build             | Vite 8                                                                           |
| Tests                 | Vitest 5 (unit, golden fixtures), Playwright (e2e, milestone 7+)                 |
| uid policy            | Libraries never generate `uid`. The app assigns `urn:uuid:` on import when       |
|                       | missing (it needs a storage key; Android files never carry UID)                  |
| Vendor extensions     | Project vendor prefix for JSContact values with no standard equivalent (Android  |
|                       | nickname kinds, relation types such as mother/brother). Prefix = the Pages host  |
|                       | you control, `remileduc.github.io:` (RFC 9553 §1.8 requires a domain)            |
| Timestamps w/o zone   | REV/CREATED: assume UTC + warning. BDAY etc.: date part as PartialDate + warning |
| Unmapped TYPE values  | Kept in `vCardParams.type` (e.g. `msg`, `internet`, `pref` from 3.0)             |
| Text KEY / bad TZ     | Go to `vCardProps` (lossless), not shown as fields                               |
| Base language         | Properties without LANGUAGE = base. If an ALTID set is all-LANGUAGE: pick the    |
|                       | card LANGUAGE, else first; set `language` if the card had none                   |
| JSPROP                | Emit `VALUE=TEXT` (ABNF says required); accept both on read                      |
| Diff format           | Own small structured diff (Id-maps as sets); not JSON Patch libs                 |
| Photos                | Stored as `data:` URIs inside the Card; resized to ≤512 px JPEG on upload        |
|                       | (Android exports its thumbnail anyway); original kept if ≤ 256 kB                |
| Remote photo URLs     | (Google web export) kept as `Media.uri`, flagged "not restorable" in UI; never   |
|                       | fetched (offline, CSP)                                                           |
| Offline               | Static site first; `manifest` + hand-written ~50-line service worker in M9       |
| vCard 3.0 _reading_   | Full. vCard 2.1 _writing_: never                                                 |
| Human-readable output | All exports are written for humans first: raw UTF-8, never QP or CHARSET,        |
|                       | minimal escaping, fixed readable property order with PHOTO last, folding only    |
|                       | where a line exceeds 75 octets (at a space when possible), pretty JSON.          |
|                       | Deviations only where an importer forces them (see Writer)                       |

Target standards
----------------

| Standard             | Role                                                         |
| -------------------- | ------------------------------------------------------------ |
| vCard 2.1 (versit)   | read (Android/Samsung/Outlook exports)                       |
| RFC 2425/2426 (3.0)  | read + write (profiles `android`, `apple`)                   |
| RFC 6350 (4.0)       | read + write (profile `rfc`)                                 |
| RFC 6868             | caret escaping in parameter values (4.0)                     |
| RFC 6473/6474/6715   | KIND:application, BIRTHPLACE/DEATHPLACE/DEATHDATE,           |
|                      | EXPERTISE/HOBBY/INTEREST/ORG-DIRECTORY                       |
| RFC 6869/7852/8605   | KIND:device, TEL main-number, CONTACT-URI + CC               |
| RFC 7095 (jCard)     | only as the `vCardProps` encoding                            |
| RFC 9554             | CREATED, GRAMGENDER, LANGUAGE, PRONOUNS, SOCIALPROFILE,      |
|                      | N 7 comps, ADR 18 comps, PHONETIC/SCRIPT/PROP-ID/DERIVED...  |
| RFC 9553 + 9982      | JSContact 2.0 data model                                     |
| RFC 9555 (+errata)   | vCard ↔ JSContact mapping, JSPROP/JSPTR/JSCOMPS              |
| AOSP vcard lib       | de-facto spec for `android` profile (import + export quirks) |
| Apple 3.0 dialect    | de-facto spec for `apple` profile                            |

Repository layout
-----------------

```
vcards-io/
  package.json              private root; "engines": { "node": ">=24" }, "packageManager": "pnpm@12.x"
  pnpm-workspace.yaml       packages/*, apps/*
  biome.json
  tsconfig.base.json        strict, ES2025 target, verbatimModuleSyntax, exactOptionalPropertyTypes
  .github/workflows/        ci.yml, pages.yml, (later) release.yml
  fixtures/
    rfc/                    examples lifted from the RFCs (.vcf + expected .json)
    android/                AOSP-style 2.1 samples (cozy-vcard android-full.vcf, MIT) + yours
    apple/                  iOS/macOS 3.0 samples (cozy-vcard ios-*.vcf) + yours
    google/                 Google web 3.0 export samples + yours
    other/                  Outlook 2.1, Thunderbird 4.0, Nextcloud/sabre 3.0, Fossify 4.0
    jscontact-tests/        corpus from jmapio/jscontact-tests (MIT), if its format is usable
  packages/
    vcard/                  @vcards-io/vcard
    jscontact/              @vcards-io/jscontact
    convert/                @vcards-io/convert
  apps/
    web/                    Vite + Lit site
  docs/
    plan.md                 this document, kept up to date
    decisions.md            short ADR log (one paragraph per decision)
    interop.md              the Android/Apple behaviour tables (from the research), updated by device tests
```

Each package: `src/`, `test/`, `package.json` (`"type": "module"`, `exports`
map with `types` first, `sideEffects: false`, `files: ["dist"]`), own
`tsconfig.json` extending the base. Dependencies between packages use
`workspace:^`. No runtime dependency in any library.

Package 1: `@vcards-io/vcard`
-----------------------------

Purpose: tolerant reader for 2.1/3.0/4.0 into an ordered, lossless property
model; a normaliser that upgrades 2.1/3.0 semantics to 4.0 so the converter
only has to know 4.0; a writer engine with syntax tables for 3.0 and 4.0.

### Public API

```ts
parseVCards(input: string | Uint8Array | ArrayBuffer, opts?: ParseOptions): ParseResult
// ParseResult = { cards: VCard[]; issues: Issue[] }
// ParseOptions = { defaultCharset?: string /* 'utf-8' */, maxLineLength?: number, maxInputBytes?: number }

upgradeTo40(card: VCard, opts?: { vendor?: boolean }): { card: VCard; issues: Issue[] }
serializeVCards(cards: VCard[], opts?: SerializeOptions): string
// SerializeOptions = { version: '3.0' | '4.0', lineEnding?: '\r\n' | '\n', foldAt?: number | 'none' /* 75 octets */ }

interface VCard   { version: '2.1' | '3.0' | '4.0'; properties: VProperty[] }   // order preserved
interface VProperty {
  group: string | null;           // lowercased ('item1')
  name: string;                   // uppercased ('TEL', 'X-ANDROID-CUSTOM')
  params: VParams;                // Map<string /*UPPER*/, string[]>; insertion order kept
  value: VValue;
  line?: number;                  // source line for diagnostics
}
type VValue =
  | { kind: 'text'; value: string }
  | { kind: 'text-list'; values: string[] }                 // NICKNAME, CATEGORIES
  | { kind: 'structured'; components: string[][] }          // N, ADR, ORG, GENDER, CLIENTPIDMAP, X-ANDROID-CUSTOM
  | { kind: 'uri'; value: string }
  | { kind: 'date-and-or-time'; value: DateAndOrTime; raw: string }
  | { kind: 'timestamp'; value: Timestamp; raw: string }
  | { kind: 'utc-offset'; sign: 1 | -1; hours: number; minutes: number }
  | { kind: 'language-tag' | 'integer' | 'float' | 'boolean'; value: ... }
  | { kind: 'binary'; data: Uint8Array; mediaType?: string } // inline base64 (2.1/3.0); writer re-encodes for 3.0
  | { kind: 'unknown'; raw: string }                          // unparsed, escapes kept

interface Issue { severity: 'error' | 'warning' | 'info'; code: string; message: string; line?: number; property?: string }

// Every part optional: a date has no hour, a time has no date part, a date-time has both.
interface DateAndOrTime { year?: number; month?: number; day?: number; hour?: number; minute?: number; second?: number; zone?: UtcOffset | 'utc' }
interface Timestamp     { year: number; month: number; day: number; hour: number; minute: number; second: number; zone?: UtcOffset | 'utc' }  // no zone = floating
interface UtcOffset     { sign: 1 | -1; hours: number; minutes: number }
```

Also exported: `escapeText`, `unescapeText`, `splitEscaped` (split on an
unescaped separator, escapes kept), `foldLine`, `unfoldLines`,
`caretEncode`/`caretDecode` (RFC 6868), `decodeQuotedPrintable`,
`encodeQuotedPrintable` (only for tests of 2.1 reading),
`encodeBase64`/`decodeBase64` (`Uint8Array.fromBase64` with fallback;
whitespace ignored, missing padding accepted, anything else throws
`SyntaxError`), `parseDateAndOrTime`/`formatDateAndOrTime`,
`parseTimestamp`/`formatTimestamp` (a date without a time is rejected: the
caller types it as date-and-or-time and reports), `parseUtcOffset`/
`formatUtcOffset`, `parseDataUri`/`buildDataUri`, `parseTelUri`,
`parseGeoUri`, `guessImageType` (magic bytes: JPEG/PNG/GIF/WebP),
`PROPERTY_REGISTRY` (default value type, structure, cardinality, allowed
params, per version), `defaultValueKind(name, version)` and
`COMMON_PARAMS` (parameters any property may carry; property-specific ones
are only in `PropertySpec.params`, the two never overlap). Parsers return
`null` on bad input, including mixed basic/extended forms such as
`1985-0412`; formatters throw `RangeError` for a field out of range or a
shape the grammar cannot express, so hostile JSContact never reaches the
writer as unparseable text.

### Internal pipeline

1. **Bytes in.** A `string` input is encoded to UTF-8 bytes so there is one
   code path. BOM sniffing: `EF BB BF` → UTF-8 (strip; we never write one);
   `FF FE`/`FE FF` → transcode UTF-16 to UTF-8 bytes; BOM-less UTF-16
   heuristic: `bytes[0]` is `B` or `b` and `bytes[1]==0` (or the reverse for
   big-endian), the same case-insensitivity as `BEGIN:VCARD` itself.
   `maxInputBytes` applies to the UTF-8 result, so a string or a UTF-16 file
   that only grows past the cap once transcoded is rejected too, and never
   fully encoded first.
2. **Physical lines.** Split on CRLF, LF or CR at byte level. Track line
   numbers. Enforce `maxLineLength` (default 1 MiB) and `maxInputBytes`
   (default 64 MiB) as `error` issues, not exceptions. Issues themselves are
   capped at 1000 per code (then one `issues-truncated` warning per code),
   since a file that warns on every line would otherwise cost gigabytes.
3. **Logical lines (unfold), version-agnostic.** Join a line starting with SP
   or HTAB to the previous one, dropping exactly one whitespace byte. Two
   extra rules, safe for every version:
   - previous logical line has `ENCODING=QUOTED-PRINTABLE` (or bare
     `QUOTED-PRINTABLE`) and ends with `=` → drop that `=` and append the
     next physical line verbatim, indented or not (AOSP writes `=\r\n` soft
     breaks with no indentation and, like RFC 2045 6.7, keeps a leading
     space on the next line as content). The soft break is consumed here,
     so `decodeQuotedPrintable` never sees one inside a logical line;
   - previous line has `ENCODING=BASE64|B` and the next non-empty physical
     line has no `:` and matches `[A-Za-z0-9+/=]+` → append (Outlook writes
     unindented base64). A blank line ends a base64 block (AOSP writes one);
   - previous line is `N`, `ADR` or `ORG` and the next physical line has no
     `:` at all, does not start with `#` and does not read as a property
     header (`NAME;` or `group.NAME;` then a `=` somewhere) → append with a
     warning (AOSP does this; Google exports have such breaks, `834;;;;`).
     A line that reads as a header is one folded inside its parameter list
     (RFC 9554 examples), so it starts a new property. Any other unindented
     line without `:` is reported and skipped by the lexer.
   The header these rules key on (property name, `ENCODING`) is read by the
   lexer of step 4 itself once the unfolder has found the first unquoted
   `:`, with the lexer's own quote rule, so the two never disagree on what a
   line is encoded as.
   A soft break directly followed by `BEGIN:`/`END:` is not joined (warning),
   so a truncated value cannot swallow a card delimiter.
   Unfolding on bytes reassembles multi-byte UTF-8 split by careless writers.
   Physical lines over `maxLineLength` are dropped with an `error`, and so
   are the indented continuations that follow them. When the over-long line
   continues a logical line (a fold, a soft break, unindented base64), that
   logical line is dropped with it rather than passed on truncated.
4. **Content-line lexing on bytes.** Group/name up to `;` or `:`; parameters
   up to the first **unquoted** `:`; never look at `:` in the value (URIs,
   `tel:`, Google's `http\://` escapes). Produce `RawLine { group, name,
   params: RawParam[] {name, values: Uint8Array[], bare}, value: Uint8Array,
   line }`; parameter values stay bytes because their charset is only known
   in step 6, and `bare` marks 2.1 words promoted to a named parameter. The
   value bytes are never trimmed (`VERSION: 3.0` is tolerated by the version
   check, not by the lexer). Empty parameters (`TEL;:`, AOSP's untyped
   phone) are skipped silently. Quoted param
   values kept whole; unquoted ones split on `,`. A bare parameter (no `=`)
   becomes `ENCODING` if `QUOTED-PRINTABLE|BASE64|8BIT|7BIT` (the versit
   `pencodingval` list; RFC 2426's `B` only counts as `ENCODING=b`, so a
   stray bare `B` cannot turn a value into base64), `CHARSET` if it looks
   like one, else `TYPE` (2.1 `knowntype` list, `PREF`, and `X-<label>`
   custom labels). Tolerate `[ws]` around `=` and `:`, a `,` used as
   separator in 2.1 (`LABEL;INTL;PARCEL,ENCODING=...`, the versit 2.3.2
   example), lowercase `type=`, repeated `type=` (Apple), and `TYPE="a,b"`.
5. **Card grouping.** `BEGIN:VCARD`…`END:VCARD` case-insensitive. Missing
   END → close at EOF with a warning. A 2.1 AGENT's nested vCard, either
   `BEGIN:VCARD` on the line after an empty `AGENT:` (the versit 2.5.4
   example) or `AGENT:BEGIN:VCARD` with the card continuing on the next
   lines (the versit 2.9 grammar) → the nested lines become the AGENT's raw
   text value (LF-joined) with an `info` (it is valid 2.1; the `android`
   profile reports the loss), and only their BEGIN/END are looked at, so the
   nested text raises no lexer diagnostics; any other nested BEGIN closes the
   current card with a warning. Lines outside cards → warning. Lines
   starting with `#` → skipped with an `info` (AOSP treats them as comments).
   VERSION anywhere in the card (2.1/3.0); missing → 2.1 if bare params or
   QP seen, else 3.0, warning. Mixed versions in one file are fine for us.
6. **Version-aware value decoding.** With the version known:
   - params: decoded with the line's charset, 4.0 caret-decode; TYPE
     values split on `,` even when quoted (RFC 6350 section 8 writes
     `TYPE="work,voice"`) and lowercased except `X-` custom labels (Android
     shows their case); param names uppercased; repeated params merged;
     empty values dropped;
   - value bytes: QP → bytes (accept QP in 3.0 too, AOSP does); base64 →
     bytes, which are the value itself (`binary`, mediaType from magic
     bytes, else `MEDIATYPE`, else the `TYPE` media name `JPEG`) for media
     properties, `VALUE=binary` and unknown properties, and a transfer
     encoding (versit 2.1) for everything else; then
     `TextDecoder(CHARSET ?? defaultCharset, {fatal})`; on a decode error
     retry with `windows-1252` and warn (Outlook); unknown CHARSET →
     default + warning. CHARSET and `defaultCharset` are ignored with an
     `info` when the input was text or UTF-16 (already UTF-8 by then) and
     CHARSET is ignored on 4.0 lines (RFC 6350 removed it);
   - typing: `VALUE` param, else registry default for property+version
     (a property outside its versions is read as in its last version, with
     an `info`), else `unknown` (raw text, escapes kept). `VALUE=text` never
     flattens a structured or list property. 3.0/4.0 TEXT values unescaped
     once (`\\ \, \; \n \N`; lenient `\x`→`x`, so `\:` works). 2.1 text is
     kept as written and only list splitting unescapes `\\ \; \, \:`, as
     AOSP does. Structured values split on unescaped `;`, list components
     on unescaped `,` (never in 2.1; ORG components are not lists, the
     registry flag `commaIsLiteral` handles it). URI values never split or
     unescaped, except Google's `http\://` which is repaired with a warning.
     Scalars (dates, offsets, numbers, booleans, language tags) that do not
     parse fall back to `unknown` with a warning, never an exception. A 2.1
     / 3.0 media property without ENCODING is read as `uri` when the text
     has a scheme (Thunderbird) with an `info`, else kept `unknown` with a
     warning. `CHARSET`, `ENCODING` and `VALUE` values are always ASCII.
   - dates: basic and extended ISO, `--MMDD`, `--MM-DD` (Android yearless),
     `--MM`, `---DD`, `YYYY-MM`, `YYYY`, times with zones; original string
     kept. Apple's 1604 placeholder year and `X-APPLE-OMIT-YEAR` parse as
     written, the normaliser rewrites them. A date-only `REV` becomes
     date-and-or-time with a warning in 4.0 and an `info` before (RFC 2426
     allows a date there); a non-gregorian `CALSCALE` keeps the value
     `unknown` with an `info`.
7. **Output** `VCard` with `version` as read. Unknown properties are kept as
   `text` or `unknown` values, never dropped.

### Upgrade normaliser (2.1/3.0 → 4.0 semantics)

Pure function on the model, table-driven (`upgrade/rules.ts`), each rule a
small function with a unit test. Standard rules:

| 2.1 / 3.0 input                             | 4.0 output                                               |
| ------------------------------------------- | -------------------------------------------------------- |
| `TYPE=PREF` / bare `PREF`                   | `PREF=1`, value removed from TYPE                        |
| inline binary PHOTO/LOGO/SOUND/KEY          | `uri` value `data:<mediatype>;base64,...`; TYPE media    |
|                                             | name (`JPEG`) → `MEDIATYPE=image/jpeg`                   |
| `VALUE=URL`/`uri`                           | `VALUE=uri`                                              |
| LABEL property                              | `LABEL=` param on the ADR with the same group, else      |
|                                             | the ADR with the same TYPE set, else a new ADR with only |
|                                             | LABEL (lossless)                                         |
| SORT-STRING                                 | `SORT-AS` on N                                           |
| AGENT (uri)                                 | `RELATED;TYPE=agent;VALUE=uri`                           |
| AGENT (inline vcard)                        | kept as-is for `vCardProps`                              |
| GEO `lat;lon` / `lat,lon`                   | `geo:lat,lon` URI                                        |
| TZ `-05:00` / `-0500`                       | `utc-offset` (kept; converter maps to Etc/GMT±n)         |
| CHARSET / ENCODING / CONTEXT params         | dropped                                                  |
| NAME, PROFILE, MAILER, CLASS                | kept as-is (end in `vCardProps`)                         |
| ADR/LABEL TYPE `dom                         | intl                                                     | postal | parcel` | kept in TYPE (end in `vCardParams.type`) |
| EMAIL TYPE `internet`                       | dropped (default); `x400` kept                           |
| TEL TYPE `msg                               | bbs                                                      | modem  | car     | isdn                                     | pcs` | kept in TYPE (→ `vCardParams.type`) |
| ADR with 8 comps (Google formatted address) | 8th → `LABEL=` param; 7 comps kept                       |
| N with 5 comps, ADR with 7 comps            | padded to 7 / 18 empty components                        |

Vendor rules (`upgrade/vendor.ts`, on by default, individually testable).
This is where the "understand Android fields" requirement lives:

| Vendor property                                        | 4.0 output                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| `X-ANDROID-CUSTOM:vnd.android.cursor.item/nickname;    | `NICKNAME;X-KIND=<default                                            | other                                          | maiden | short | initials | custom:label>` |
| <name>;<type>;<label>;...`                             | (X-KIND consumed by convert into the vendor nickname kind)           |
| `.../contact_event;<date>;1;...` (anniversary)         | `ANNIVERSARY:<date>`                                                 |
| `.../contact_event;<date>;3;...` (birthday)            | `BDAY:<date>` if no BDAY yet, else kept raw                          |
| `.../contact_event;<date>;2                            | 0;<label>;...`                                                       | kept raw (→ `vCardProps`, re-emitted verbatim) |
| `.../relation;<name>;<type>;<label>;...`               | `RELATED;VALUE=text;TYPE=<mapped>` (table below)                     |
| other `X-ANDROID-CUSTOM` MIME types                    | kept raw                                                             |
| `X-AIM/X-MSN/X-YAHOO/X-ICQ/X-JABBER/X-SKYPE-USERNAME/` | `IMPP;SERVICE-TYPE=<Name>:<scheme>:<handle>` (aim:, msnim:, ymsgr:,  |
| `X-SKYPE/X-GOOGLE-TALK/X-GTALK/"X-GOOGLE TALK"/X-QQ/`  | icq:, xmpp:, skype:, xmpp:, qq:, callto:); `X-TWITTER` →             |
| `X-NETMEETING/X-TWITTER`                               | `SOCIALPROFILE;SERVICE-TYPE=Twitter;VALUE=text`                      |
| `X-SIP:<addr>`                                         | `IMPP:sip:<addr>` (Android's 3.0 form)                               |
| `X-SKYPE-PSTNNUMBER`                                   | `TEL;TYPE=x-skype`                                                   |
| `X-PHONETIC-FIRST/MIDDLE/LAST-NAME`                    | kept raw in M2 (→ `vCardProps`); mapping to N;PHONETIC needs a       |
|                                                        | script/system we do not know; revisit                                |
| `X-ADDRESSBOOKSERVER-KIND` / `-MEMBER`                 | `KIND` / `MEMBER`                                                    |
| `itemN.X-ABLabel:_$!<X>!$_`                            | built-ins → TYPE on the grouped property (`Home`→home, `Work`→work,  |
|                                                        | `Mobile`→cell, `Main`→main-number, `HomePage`/`Other`→drop); custom  |
|                                                        | text kept (→ `label` in convert); empty label dropped (Google)       |
| `itemN.X-ABADR:us`                                     | `CC=US` on grouped ADR                                               |
| `BDAY;X-APPLE-OMIT-YEAR=1604:1604-04-15` / bare 1604   | `BDAY:--0415`                                                        |
| `itemN.X-ABDATE` + label `Anniversary`                 | `ANNIVERSARY`; other labels → kept raw                               |
| `itemN.X-ABRELATEDNAMES` + label                       | `RELATED;VALUE=text;TYPE=<mapped>` (same table as Android relations) |
| `X-SOCIALPROFILE;type=twitter;x-user=u:url`            | `SOCIALPROFILE;SERVICE-TYPE=Twitter;USERNAME=u:url`                  |
| `IMPP;X-SERVICE-TYPE=Skype`                            | `IMPP;SERVICE-TYPE=Skype`                                            |
| `X-ABShowAs:COMPANY`                                   | `KIND:org`                                                           |
| `X-WAB-GENDER`                                         | `GENDER`                                                             |
| `X-MS-*`, `X-ABUID`, `X-ACTIVITY-ALERT`, others        | untouched (lossless via `vCardProps`); revisit after fixtures        |

Relation mapping (shared by Android numeric types, Apple labels, and the
export profiles):

| Android type / Apple label | RELATED TYPE (4.0)   | JSContact relation key                 |
| -------------------------- | -------------------- | -------------------------------------- |
| 3 child / Child            | `child`              | `child`                                |
| 6 friend / Friend          | `friend`             | `friend`                               |
| 9 parent / Parent          | `parent`             | `parent`                               |
| 14 spouse / Spouse         | `spouse`             | `spouse`                               |
| 8 mother / Mother          | `x-mother`           | `remileduc.github.io:mother`           |
| 5 father / Father          | `x-father`           | `remileduc.github.io:father`           |
| 2 brother / Brother        | `x-brother`          | `remileduc.github.io:brother`          |
| 13 sister / Sister         | `x-sister`           | `remileduc.github.io:sister`           |
| 4 domestic partner         | `x-domestic-partner` | `remileduc.github.io:domestic-partner` |
| 10 partner / Partner       | `x-partner`          | `remileduc.github.io:partner`          |
| 1 assistant / Assistant    | `x-assistant`        | `remileduc.github.io:assistant`        |
| 7 manager / Manager        | `x-manager`          | `remileduc.github.io:manager`          |
| 11 referred by             | `x-referred-by`      | `remileduc.github.io:referred-by`      |
| 12 relative                | `kin`                | `kin`                                  |
| 0 custom / free label      | `x-custom`           | `{}` + `label`                         |

Every rule records a `warning`/`info` issue so the UI can list what was
rewritten.

### Writer

- Engine + per-version syntax table (`write/v30.ts`, `write/v40.ts`). The
  engine emits `BEGIN:VCARD`, `VERSION`, then properties in model order,
  then `END:VCARD`, CRLF, no BOM, property names uppercased (Android
  compares case-sensitively), parameter names uppercased (`TYPE=`, since
  Google's own iOS export does that and Apple reads it).
- **3.0 syntax**: `TYPE=a;TYPE=b` repeated (never comma-joined: AOSP 3.0
  reads both, Apple writes repeated); `PREF` as `TYPE=PREF` (uppercase,
  AOSP checks case-sensitively); `binary` values as `ENCODING=b;TYPE=JPEG`
  folded at 75 with leading space and no 4.0 params (iOS drops the card
  otherwise); escaping `\\ \, \; \n`; no CHARSET; exactly 5 N and 7 ADR
  components (Apple drops cards when a fold lands in an empty 4.0 tail);
  `data:` URIs are decoded back to `binary` by the engine.
- **4.0 syntax**: caret encoding, quoted params, `PREF=n`, 7/18 components,
  `data:` URIs, `JSCOMPS` etc.
- Folding at 75 **octets** via `TextEncoder`, never splitting a UTF-8
  sequence or a `\` escape; base64 valid by construction (invalid base64
  aborts an entire Android import).
- `SerializeError` only for programming errors (missing FN, `binary` in 4.0).

### Human-readable output rules

The files are meant to be opened in a text editor as much as in a phone.

| Rule                                                      | Why it is safe                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Raw UTF-8 text, never `ENCODING=QUOTED-PRINTABLE`, never  | 3.0 and 4.0 are UTF-8 by definition; AOSP decodes 3.0 values as UTF-8 by     |
| `CHARSET=`                                                | default (`DEFAULT_IMPORT_CHARSET`); Apple writes raw UTF-8 itself            |
| Escape only what the version requires (`\\ \, \; \n`);    | RFC 2426/6350; AOSP and Apple unescape these                                 |
| never escape `:`                                          |                                                                              |
| Canonical property order per card: FN, N, NICKNAME, ORG,  | Importers do not care about order; humans do. PHOTO's base64 block goes last |
| TITLE, TEL, EMAIL, ADR, URL, IMPP/X-IM, BDAY and events,  | so the readable fields are at the top of each card                           |
| relations, NOTE, CATEGORIES, UID, REV, X-*, PHOTO         |                                                                              |
| Fold only lines longer than 75 octets; when a space falls | Folding is mandatory in Apple's reader for PHOTO and expected by the RFC;    |
| inside the window, break before it (unfold removes the    | short lines are never touched; a `foldAt: 'none'` option exists for          |
| CRLF + one whitespace, so the text reads naturally)       | people who prefer long lines, off by default                                 |
| No blank lines between cards                              | Apple's tolerance for garbage between cards is unverified; AOSP 2.1 is fine, |
|                                                           | not worth the risk                                                           |
| `UID`/`REV` written once, at the end, not interleaved     | Easier to skim; both phones ignore or accept them anywhere                   |
| JSON export: `JSON.stringify(cards, null, 2)` with a      | JSContact says key order is irrelevant; a stable order diffs well in git     |
| stable key order (`@type`, `version`, `uid`, `name`, …,   | and reads top-down                                                           |
| `vCardProps`, `media` last)                               |                                                                              |

The only non-readable content left is base64 photo data, which no importer
accepts in any other form.

### Tests

- Unit tests per utility with RFC examples.
- Golden tests: every `fixtures/**/*.vcf` parsed; model compared to a
  reviewed `*.model.json`; `parse → serialize(4.0) → parse` stable for 4.0
  inputs; `parse → upgrade → serialize → parse → upgrade` idempotent for
  2.1/3.0 inputs.
- Hostile inputs: 100 MB line, binary garbage, truncated base64, lone
  surrogates, mixed line endings, missing END, nested BEGIN, BOM, UTF-16.

Package 2: `@vcards-io/jscontact`
---------------------------------

Purpose: JSContact 2.0 types, validator, Id/uid helpers, JSON Pointer +
PatchObject utilities, the project's vendor extension definitions, and the
structured diff.

### Types (`types.ts`)

Hand-written interfaces for every RFC 9553 object (Card, Name,
NameComponent, Nickname, Organization, OrgUnit, SpeakToAs, Pronouns, Title,
EmailAddress, OnlineService, Phone, LanguagePref, Calendar,
SchedulingAddress, Address, AddressComponent, CryptoKey, Directory, Link,
Media, Anniversary, PartialDate, Timestamp, Note, Author, PersonalInfo,
Relation, Resource, JCardProp) plus RFC 9555 fields (`vCardProps`,
`vCardParams`, `vCardName`). Every enum is an `as const` array with a
derived union type (`CARD_KINDS`, `NAME_COMPONENT_KINDS`,
`ADDRESS_COMPONENT_KINDS`, `PHONE_FEATURES`, `CONTEXTS`,
`ADDRESS_CONTEXTS`, `MEDIA_KINDS`, `CALENDAR_KINDS`, `DIRECTORY_KINDS`,
`PERSONAL_INFO_KINDS`, `PERSONAL_INFO_LEVELS`, `RELATION_TYPES`,
`GRAMMATICAL_GENDERS`, `PHONETIC_SYSTEMS`, `TITLE_KINDS`,
`ANNIVERSARY_KINDS`, `LINK_KINDS`). Unknown/vendor properties pass through
an index signature typed `unknown`.

### Vendor extensions (`vendor.ts`)

`VENDOR_PREFIX = 'remileduc.github.io:'` and the extra values the phone
dialects need, so the UI can offer them in dropdowns and the profiles can
map them back:

| Extension                              | Where             | Values                                           |
| -------------------------------------- | ----------------- | ------------------------------------------------ |
| `remileduc.github.io:kind` on Nickname | Nickname object   | `maiden`, `short`, `initials`, `other`, `custom` |
| vendor relation keys                   | Relation.relation | the ten keys in the relation table above         |

Nothing else: Android "other/custom" events, `X-PHONETIC-*`, `X-MS-*` stay
in `vCardProps` until fixtures show they matter.

### Validator (`validate.ts`)

`validateCard(value: unknown): { ok: true; card: Card } | { ok: false; errors: ValidationError[] }`
with pointer-addressed errors. Hand-written (no JSON Schema library: there
is no official schema; ~400 lines). Covers `@type`, `version` ∈
{"1.0","2.0"}, Id charset/length, enum values (standard or `domain:value`),
the "at least one of" rules (Name, Organization, Address, Author,
OnlineService, SpeakToAs), `isOrdered`/separator constraints, `pref`
1..100, `sortAs` keys present, `members` requires `kind: group`,
PartialDate dependencies, UTCDateTime format, `localizations` keys and
patches, case-variant property names (§1.7.1).

### Utilities

- `newUid()` → `urn:uuid:` + `crypto.randomUUID()`; `newId()` → 10-char
  base64url from `crypto.getRandomValues` (stable Ids are what makes diffs,
  localizations, keyed rendering and PROP-ID round trips cheap).
- `jsonPointer.get/set/remove/parse/escape`, `applyPatchObject(card,
  patch)` implementing §1.4.3 all-or-nothing, `localize(card, lang)`.
- `cardDisplayName(card)`: `name.full` ?? ordered components ??
  organization ?? first email ?? first phone ?? "(no name)" (mirrors AOSP's
  display-name fallback order so the list matches the phone).
- `normalizeCard(card)`: stable key order for JSON export, strip empty maps.

### Diff (`diff.ts`)

```ts
diffCards(a: Card, b: Card, opts?: { ignore?: string[] /* pointers, default ['updated'] */ }): Change[]
// Change = { path: string, op: 'add' | 'remove' | 'replace', before?: unknown, after?: unknown }
diffCardSets(a: Card[], b: Card[]): { added: Card[]; removed: Card[]; unchanged: Card[]; changed: { before: Card; after: Card; changes: Change[] }[] }
```

Id-keyed maps compared by key; boolean maps as sets; arrays positionally in
v1; primitives by value; `vCardProps` entries by serialized form. Set
matching by `uid`, then by fingerprint (`cardDisplayName` lowercased +
sorted emails + sorted phone digits), which is the normal case for Android
backups (no UID). Own implementation (~200 lines); `rfc6902`/`jsondiffpatch`
would need a wrapper of the same size for these semantics.

Package 3: `@vcards-io/convert`
-------------------------------

Purpose: RFC 9555 both ways, plus the export profiles. Depends on the two
packages above.

```ts
vcardToJSContact(card: VCard /* 4.0 */, opts?: ConvertOptions): { card: Card; issues: Issue[] }
jscontactToVCard(card: Card, opts: { profile: 'android' | 'apple' | 'rfc'; prodId?: string }): { card: VCard; issues: Issue[] }
// Convenience chain used by the app:
importVCards(input: string | Uint8Array, opts?): { cards: Card[]; issues: Issue[] }   // parse → upgradeTo40 → convert
exportVCards(cards: Card[], opts: { profile }): { text: string; issues: Issue[] }    // convert(profile) → serialize(version)
```

### vCard → JSContact algorithm

1. Guard: `card.version === '4.0'` else throw (callers must `upgradeTo40`).
2. Start `{ "@type": "Card", "version": "2.0" }`. `UID` → `uid` verbatim;
   never generate one (RFC 9982 §5).
3. **Ids**: `PROP-ID` param if valid, else `newId()`.
4. **ALTID sets**: group by `name + ALTID`; pick the base (no LANGUAGE;
   else LANGUAGE == card `LANGUAGE`; else first). `PHONETIC` members merge
   into the base object's `phonetic*` fields. Other members become
   `localizations[lang]` patches at the object's path. LANGUAGE without
   ALTID → localization of the single same-name base if there is exactly
   one, else standalone object with `vCardParams.language`.
5. **Handlers**: one function per property name in a `Map`, each taking
   `(prop, ctx)` and writing into the card and `ctx.byGroup`. The
   non-obvious ones:
   - N → `name.components` (7 comps, kinds `surname, given, given2, title,
     credential, surname2, generation`); drop family values duplicated in
     surname2 and suffix values duplicated in generation; `SORT-AS` →
     `sortAs[kind]`; valid `JSCOMPS` → `isOrdered: true` with separators,
     else `isOrdered: false`.
   - ADR → 18 components; if any of comps 7..17 is non-empty ignore ext (1)
     and street (2); `LABEL`→`full`, `GEO`→`coordinates`, `TZ`→`timeZone`,
     `CC`→`countryCode`; TYPE `home|work|billing|delivery` → contexts.
   - GEO / TZ properties: attach to the same-group ADR; else to the single
     ADR if exactly one and the GEO/TZ is ungrouped; else a standalone
     Address. utc-offset whole hours −12..+14 → `Etc/GMT∓n`, `+0000` →
     `Etc/UTC`; text must look like `Area/Location` else `vCardProps`.
   - TEL → `number` verbatim (text or `tel:`); features only when a
     TEL-specific TYPE is present (`cell`→`mobile`, `fax`, `main-number`,
     `pager`, `text`, `textphone`, `video`, `voice`); `home|work` →
     contexts; other TYPE values (`msg`, `x-skype`, Apple `iphone`,
     `main`→`main-number`, `other`) → features/`vCardParams.type`.
   - BDAY/DEATHDATE/ANNIVERSARY → Anniversary; full/`YYYY-MM`/`YYYY`/
     `--MMDD` → PartialDate; timestamp with zone → `Timestamp`; without
     zone → PartialDate of the date part + warning; `--MM`, `---DD`,
     time-only, text → `vCardProps`. BIRTHPLACE/DEATHPLACE → `place`.
   - GENDER → `vCardProps` only.
   - RELATED → `relatedTo[value].relation` with TYPE keys mapped through the
     relation table (standard keys as-is, `x-mother` → vendor key,
     `x-custom` → `{}`), `label` from X-ABLabel/Android label.
   - NICKNAME → one Nickname per list value; `X-KIND` param (from the
     normaliser) → vendor `kind`.
   - CATEGORIES → `keywords`; MEMBER → `members`; ORG → `organizations`
     (first comp `name`, rest `units`); TITLE/ROLE → `titles` with
     `organizationId` when exactly one ORG shares the group; X-ABLabel →
     `label` on the same-group object; IMPP/SOCIALPROFILE →
     `onlineServices` with `vCardName` and `service` from SERVICE-TYPE;
     PHOTO/LOGO/SOUND → `media` (`data:` or `https:` URI verbatim);
     EXPERTISE/HOBBY/INTEREST → `personalInfo`; LANG → `preferredLanguages`;
     CREATED/REV → `created`/`updated`; PRODID, KIND, LANGUAGE, GRAMGENDER,
     PRONOUNS, NOTE (+AUTHOR, AUTHOR-NAME, CREATED params), KEY, SOURCE,
     ORG-DIRECTORY, CALURI, FBURL, CALADRURI, CONTACT-URI, URL.
   - `PREF` → `pref`; `MEDIATYPE` → `mediaType`; `PID` → `vCardParams.pid`;
     `DERIVED=true` → skipped with an info issue; `VALUE` never copied;
     unknown params → `vCardParams`.
   - Several FN without LANGUAGE: keep the one with the fewest params.
6. **Fallback**: anything unmapped (VERSION, XML, CLIENTPIDMAP, GENDER,
   X-ANDROID-CUSTOM leftovers, X-PHONETIC-_, X-MS-_, X-*, cardinality
   overflow) → `vCardProps` as jCard with group kept in the `group` param.
7. **JSPROP**: collect, build one PatchObject, validate, apply last.
8. `validateCard` on the result; a failure is a converter bug surfaced as
   an `error` issue.

### JSContact → vCard: profiles

Each profile is a table of _property emitters_ over the Card (shared code,
profile-specific choices). The `rfc` profile is RFC 9555 Appendix A in
reverse. The phone profiles emit what the device importer actually reads.

| Card data                | `android` (3.0)                                    | `apple` (3.0)                                      | `rfc` (4.0)                     |
| ------------------------ | -------------------------------------------------- | -------------------------------------------------- | ------------------------------- |
| name                     | `N` 5 comps + `FN` (always both; AOSP builds the   | same                                               | `N` 7 comps, `JSCOMPS`, `FN`    |
|                          | display name from FN)                              |                                                    |                                 |
| nicknames                | `NICKNAME` one per line (AOSP does not split       | `NICKNAME`                                         | `NICKNAME` list, `PROP-ID`      |
|                          | lists) + `X-ANDROID-CUSTOM:.../nickname;n;<type>`  |                                                    |                                 |
|                          | for non-default vendor kinds                       |                                                    |                                 |
| phones                   | `TEL;TYPE=CELL                                     | HOME                                               | WORK                            | FAX                                                | PAGER                           | PREF`; custom | `TEL;type=CELL;type=VOICE;type=pref`, `IPHONE`, | `TEL;VALUE=uri:tel:` + `PREF=n` |
|                          | label → `TYPE=X-<label>` (AOSP strips `X-`); never | `MAIN`; custom label → `itemN.` + `X-ABLabel`      | + TYPE                          |
|                          | `VOICE` alone (→ OTHER) nor `INTERNET`; warn when  |                                                    |                                 |
|                          | number has letters/`#`/`*`/extension (AOSP strips) |                                                    |                                 |
| emails                   | `EMAIL;TYPE=HOME                                   | WORK                                               | PREF`; never `INTERNET`         | `EMAIL;type=INTERNET;type=HOME;type=pref`          | `EMAIL;PREF=n;TYPE=`            |
|                          | (becomes custom label "INTERNET" on Android)       |                                                    |                                 |
| addresses                | `ADR;TYPE=HOME                                     | WORK                                               | X-<label>` 7 comps; street =    | `itemN.ADR;type=HOME` 7 comps + `itemN.X-ABADR:cc` | `ADR` 18 comps + `LABEL`, `CC`, |
|                          | number+name…; `full` dropped (AOSP rebuilds it)    | + optional `X-ABLabel`                             | `GEO`, `TZ`, `JSCOMPS`          |
| organizations / titles   | `ORG:company;dept` + `TITLE`                       | same                                               | `ORG`, `TITLE`, `ROLE`, groups  |
| anniversaries            | one `BDAY` (yearless as `--MM-DD`), wedding →      | `BDAY` (yearless as `1604-MM-DD;X-APPLE-OMIT-YEAR` | `BDAY`, `ANNIVERSARY`,          |
|                          | `X-ANDROID-CUSTOM:.../contact_event;d;1;;…`        | `=1604`), wedding → `itemN.X-ABDATE` +             | `DEATHDATE` + places            |
|                          | extra births → warning (lost)                      | `X-ABLabel:_$!<Anniversary>!$_`                    |                                 |
| relatedTo                | `X-ANDROID-CUSTOM:.../relation;name;<type>;label`  | `itemN.X-ABRELATEDNAMES` + `_$!<Mother>!$_` label  | `RELATED;TYPE=` (vendor keys as |
|                          | (`;` in values replaced, AOSP mis-splits)          |                                                    | `x-…`)                          |
| onlineServices           | legacy `X-AIM/X-MSN/X-YAHOO/X-ICQ/X-JABBER/`       | `itemN.IMPP;X-SERVICE-TYPE=Skype:skype:…`,         | `IMPP;SERVICE-TYPE=`,           |
|                          | `X-SKYPE-USERNAME/X-GOOGLE-TALK` (the only ones    | `X-SOCIALPROFILE;type=twitter;x-user=`             | `SOCIALPROFILE`                 |
|                          | AOSP reads); sip → `IMPP:sip:`; others → warning   |                                                    |                                 |
| media photo              | `PHOTO;ENCODING=b;TYPE=JPEG:` base64 (data: URIs   | same, no extra params                              | `PHOTO:data:image/jpeg;base64,` |
|                          | decoded; https URLs → warning, not restorable)     |                                                    |                                 |
| notes, links             | `NOTE`, `URL` (type lost on Android)               | `NOTE`, `itemN.URL` + label                        | `NOTE`, `URL`, `CONTACT-URI`    |
| keywords                 | `CATEGORIES` (ignored by AOSP, harmless)           | `CATEGORIES` (ignored by Apple)                    | `CATEGORIES`                    |
| kind group + members     | card skipped + warning (would import as a contact) | `X-ADDRESSBOOKSERVER-KIND:group` + `-MEMBER`       | `KIND:group` + `MEMBER`         |
| uid, updated, created    | `UID`, `REV` (ignored by AOSP, harmless)           | `UID`, `REV`                                       | `UID`, `REV`, `CREATED`         |
| speakToAs, personalInfo, | dropped + info issue                               | dropped + info issue                               | full RFC 9554 output            |
| localizations, phonetics |                                                    |                                                    |                                 |
| vCardProps               | re-emitted verbatim when the property is legal in  | same                                               | verbatim                        |
|                          | 3.0 syntax; else dropped + info                    |                                                    |                                 |
| unknown vendor JSContact | dropped + info                                     | dropped + info                                     | `JSPROP;JSPTR=…;VALUE=TEXT`     |

Shared rules: emitters produce the canonical readable property order (see
"Human-readable output rules"), never QP or CHARSET; `PROP-ID` only in
`rfc`; FN derivation (`name.full`, else
ordered join, else `cardDisplayName`, with `DERIVED=TRUE` in `rfc`);
`localizations` → ALTID + LANGUAGE in `rfc` only. Each profile returns the
list of _losses_ as `info` issues so the export dialog can show "what this
phone will not get back" before the file is written.

The Android and Apple emitters are compatible with each other's importers
in practice (each ignores the other's `X-` properties), so a later
`universal` profile can emit both sets once device testing confirms it; the
one conflict is yearless birthdays, where the profiles must differ.

### Tests

- RFC 9555 figures as golden pairs with the known example bugs corrected
  (Fig. 9 `day`, Fig. 53 indexes, Table 2 country).
- Round trips: `jscontact → vcard(rfc) → jscontact` deep-equal for every
  valid Card fixture; `vcard → jscontact → vcard(rfc) → jscontact` equal.
- Phone round trips: `android fixture → jscontact → vcard(android)` must
  carry every field AOSP can store (checked field by field against a
  reviewed snapshot), same for `apple`.
- **Device checklist** (manual, you): import the `android` export on a real
  Android phone and the `apple` export on an iPhone/Mac; compare against
  `docs/interop.md`; findings feed the profile tables. This is the only test
  that counts for the primary use case, and it should be run at M5 and M7.
- `jmapio/jscontact-tests` corpus if usable; `fast-check` generator later.

App: `apps/web`
---------------

### Principles

- One Vite project, Lit 3 components, TypeScript, CSS nesting and custom
  properties, light/dark via `prefers-color-scheme`. No router library:
  `location.hash` (`#/contacts/<uid>`, `#/diff`) handled in `vc-app`.
- No network at all. CSP meta tag, injected by a Vite plugin at build time
  only (the dev server needs HMR): `default-src 'self'; img-src 'self' data:
  blob:; media-src data: blob:; connect-src 'none'; object-src 'none';
  base-uri 'none'`. Links from card data are rendered only for `http(s):`,
  `mailto:`, `tel:` with `rel="noopener noreferrer"`; everything else is text.
  Lit templates escape by default; `unsafeHTML` is banned (Biome rule).
- Photos are rendered through `URL.createObjectURL(new Blob([...], {type}))`
  only when the media type is `image/*`.
- Input caps: file size (64 MiB), number of cards per import (warn > 5000).

### Modules

```
apps/web/src/
  main.ts                 registers elements, mounts <vc-app>
  router.ts               hash routing, ~40 lines
  store/db.ts             IndexedDB wrapper: open with versioned upgrade, get/put/delete/getAll, tx helper
  store/contacts.ts       ContactsStore: in-memory Map<uid, Card> mirror, EventTarget 'change', persist-through
  store/store-controller.ts  Lit ReactiveController subscribing a component to the store
  services/import.ts      File/Blob → importVCards → assign uid if missing → duplicate check → store; returns issues
  services/export.ts      Card[] → exportVCards(profile) / JSON; download via <a download> + showSaveFilePicker when present
  services/photo.ts       File → createImageBitmap(resize, orientation) → canvas → JPEG data: URI
  fields/registry.ts      field descriptors: collection, labels, widget per field, enum source (incl. vendor), validation
  components/
    vc-app                shell: toolbar + list + detail, keyboard shortcuts
    vc-toolbar            import, export, new, duplicate, copy, delete, search
    vc-contact-list       windowed list, sorted via Intl.Collator, filter
    vc-card-view          read-only rendering of a Card
    vc-card-editor        edit a structuredClone; Save validates with validateCard; Cancel discards
    vc-name-editor        full + components (kind dropdown, value, reorder), sortAs
    vc-address-editor     common lines + "more components", countryCode via Intl.DisplayNames, coordinates, timeZone
    vc-entry-list         generic editor for any Id-map collection, driven by fields/registry
    vc-enum-select        <select> from an as-const enum (+ vendor values + "custom…")
    vc-flags-picker       checkbox group for contexts/features/relation maps
    vc-partial-date       year/month/day inputs (optional year) + calendarScale
    vc-photo-field        drop/pick image, preview, remove, resize toggle; "remote URL" badge
    vc-raw-props          read-only table of vCardProps / vCardParams ("unmapped data")
    vc-issues-panel       import issues per file; export losses per profile
    vc-import-dialog      <dialog>: file input + drag-drop, charset override, preview counts, duplicate policy
    vc-export-dialog      <dialog>: profile selector (Android / Apple / Standard 4.0 / JSON), loss preview, filename
    vc-diff-view          (M8) two-column list + change detail
  styles/tokens.css       colours, spacing, typography; shared via adoptedStyleSheets
```

### Behaviours

- **Import**: multiple files; each parsed independently; cards with an
  existing uid or an identical fingerprint prompt "replace / keep both /
  skip"; issues panel lists line-level warnings and vendor rewrites.
- **Edit**: dirty tracking; Save sets `updated`; Esc cancels with a confirm
  dialog when dirty; `beforeunload` guard.
- **Dropdowns**: every enum-typed field is a `<select>` or checkbox group
  built from the `as const` arrays plus the vendor values; "custom (vendor)"
  accepts `domain:value` only.
- **Copy** = vCard text (current profile) and JSON to clipboard.
  **Duplicate** = clone with new uid and fresh `created`/`updated`.
  **Delete** = `<dialog>` confirm, batch allowed.
- **Export**: dialog with profile, filename `contacts-YYYYMMDD.vcf`, loss
  preview from the profile's `info` issues, and a one-line reminder that
  Android does not de-duplicate on import. JSON export is pretty-printed
  with stable key order; vcf exports follow the human-readable rules.
- **Persistence**: store `cards` keyed by `uid`; `meta` store for prefs
  (last profile). `navigator.storage.persist()` requested once; quota shown.
- **Keyboard**: `/` search, `n` new, `Delete`, `Ctrl+S` save.

Milestones
----------

Each milestone ends with: all tests green, `pnpm lint && pnpm typecheck &&
pnpm test && pnpm build` clean, docs updated.

### M0. Bootstrap (small)

- Prerequisite (you): Node 24 via apt on the host, then `npm install -g pnpm`.
- Root `package.json` (`engines`, `packageManager`), `pnpm-workspace.yaml`,
  `biome.json` (tabs, width 4; recommended rules + `noExplicitAny`,
  `useImportType`, forbid `unsafeHTML`), `tsconfig.base.json`,
  `.editorconfig`, `.gitignore`, `LICENSE`, `README.md`.
- Three empty packages + app with `exports`, `publint` and `attw` passing.
- CI (`ci.yml`): `setup-node` with `node-version: latest` so new Node releases break CI first, pnpm cache, `lint`,
  `typecheck`, `test --coverage` (80 % gate), `build`, `publint`.
  `pages.yml`: build app with `base: '/vcards-io/'`, `deploy-pages`.
  `permissions: {}` at top. Dependabot monthly.
- `fixtures/` seeded with RFC examples and the MIT cozy-vcard samples
  (android-full, ios-full, ios-complex-types, google-full); you add yours.
- `docs/plan.md`, `docs/decisions.md`, `docs/interop.md` (research tables).

### M1. `@vcards-io/vcard`: lexer + parser (large)

- Byte-level line reader, unfolding with the QP/base64 tolerance rules,
  BOM/UTF-16.
- Content-line lexer, parameter parsing, bare 2.1 params, quoted values,
  Apple repeated `type=`, Google `\:`.
- Card grouping, VERSION detection, mixed-version files, issues.
- Value decoding: QP (also in 3.0), base64, charset, caret, escaping,
  typing via registry; `X-ANDROID-CUSTOM` typed as structured.
- Date-and-or-time / timestamp / utc-offset parsers incl. Android `--MM-DD`
  and Apple 1604 forms.
- Property registry with per-version defaults.
- Tests: RFC examples, hostile inputs, every fixture parses without `error`.

### M2. `@vcards-io/vcard`: upgrade normaliser + writer 3.0/4.0 (large)

- Standard upgrade rules, then vendor rules (Android, Apple, Google), each
  with fixture-based tests.
- Writer engine + 3.0 and 4.0 syntax tables, octet folding, base64
  re-encoding of `data:` for 3.0.
- Round-trip and idempotence tests. `README.md` with usage.

### M3. `@vcards-io/jscontact`: types, vendor, validator, utils (medium)

- Types + enums + vendor extensions, validator with pointer errors, JSON
  Pointer and PatchObject, `newUid`/`newId`, `cardDisplayName`,
  `normalizeCard`, `localize`.
- Tests from RFC 9553 examples (valid and the invalid cases in §1.7).

### M4. `@vcards-io/convert`: vCard → JSContact (large)

- Context, Ids, ALTID/LANGUAGE sets, group index, handlers table, GEO/TZ
  merge, relation table, vendor nickname kinds, vCardProps fallback, JSPROP.
- Golden tests from RFC 9555 figures and all fixtures (`*.jscontact.json`
  snapshots reviewed by hand the first time; Android and Apple fixtures must
  land every phone-visible field in a real JSContact property, not in
  `vCardProps`).

### M5. `@vcards-io/convert`: profiles + round trips + device test (large)

- Shared emitters, `rfc` profile (FN derivation, JSCOMPS, localizations →
  ALTID, labels → groups, JSPROP, vCardProps writer), then `android`, then
  `apple` profile tables with loss reporting.
- Round-trip suites; phone round-trip snapshots.
- `importVCards`/`exportVCards` convenience functions.
- **Device checklist run #1** (you): export an `android` file from a real
  Android backup fixture, import on a phone, check every field; same on
  Apple if available. Fix profiles, update `docs/interop.md`.

### M6. App v1: import, browse, store, export (medium)

- Vite + Lit skeleton, CSP, tokens, IndexedDB store, controller.
- Import dialog with issues panel and duplicate policy, contact list,
  read-only card view with "unmapped data", export dialog with profiles and
  loss preview, delete, duplicate, copy. Deployed to Pages at the end of M6.

### M7. App v2: editor (large)

- Field registry, generic entry list, name/address/date/photo editors,
  dropdowns (incl. vendor values) and flag pickers, validation display,
  dirty tracking, shortcuts, new card.
- Playwright e2e: import fixture → edit phone → export(android) → parse and
  assert; photo upload → export contains `PHOTO;ENCODING=b`.
- **Device checklist run #2** (you) with an edited backup.

### M8. Diff (medium)

- `diffCards`/`diffCardSets` in `@vcards-io/jscontact`.
- `vc-diff-view`: pick file A and B (or "current store" as A), list coloured
  added/removed/changed/unchanged with counts, click → field-level changes
  with labels from the field registry, raw before/after for `vCardProps`.
  Optional word-level diff of long text with `diff` (jsdiff) if needed.

### M9. Polish and release (small/medium)

- PWA: `manifest.webmanifest`, hand-written precaching service worker,
  "update available" toast.
- `universal` profile if device tests showed Android+Apple emitters coexist.
- npm publish workflow with provenance (`release.yml`, manual dispatch,
  tag-based), `CHANGELOG.md`, API docs via TypeDoc.
- UI string table isolated for later i18n (English only shipped).

Implementation hints (the non-obvious parts)
--------------------------------------------

- **Work on bytes until charset is known.** `TextDecoder` follows the
  WHATWG Encoding Standard (`iso-8859-1` maps to `windows-1252`). Use
  `{ fatal: true }` for the first UTF-8 attempt so mojibake is detected.
- **Folding counts octets**: encode with `TextEncoder`, cut at ≤75 bytes on
  a UTF-8 boundary (`(b & 0xC0) !== 0x80`), never split a `\` escape. Only
  PHOTO really needs it for Android, but Apple and the RFC expect it on all.
- **The first unquoted `:` ends the parameters.** Tiny state machine with
  an `inQuotes` flag. Never `split(':')`.
- **Registry over classes.** One data table per property beats one class
  per property (ez-vcard's "scribes") and keeps the model a plain object.
- **X-ANDROID-CUSTOM**: `mimetype;data1;…;data15`; always write all 15
  slots; strip `;` from values (AOSP unescapes before splitting, so `\;`
  does not survive); QP-encode the whole line if non-ASCII is impossible
  in 3.0 so just write UTF-8 (AOSP decodes the value then splits).
- **Phone numbers on Android**: AOSP keeps only digits, `+` at index 0, `*`,
  `#`, and converts `p`/`w`; everything else is stripped on import. The
  export dialog should warn per number, not silently rewrite.
- **Ids first, paths second** in the converter: localization patches and
  group links need `phones/<id>/number` while the property is processed.
- **JSCOMPS**: parse into `{ defaultSeparator?, entries }`, validate indexes
  against the component matrix and the de-duplicated value count, then set
  `isOrdered: true`.
- **PatchObject application** is all-or-nothing: validate every key (no
  `-`, no prefix keys, parents exist, `null` only on optional properties)
  before touching the card.
- **Stable Ids make everything else cheap**: diffs, localizations, keyed
  rendering (`repeat()` by Id), PROP-ID round trips.
- **IndexedDB**: one `open()` with `onupgradeneeded` creating `cards`
  (keyPath `uid`) and `meta`; wrap requests in Promises; one write
  transaction per user action; `getAll()` on startup into the in-memory map.
- **Photo pipeline**: `createImageBitmap(file, { imageOrientation:
  'from-image', resizeWidth, resizeHeight, resizeQuality: 'high' })` →
  `OffscreenCanvas` → `convertToBlob({ type: 'image/jpeg', quality: 0.85 })`
  → `Uint8Array.toBase64()`. Safari cannot encode WebP; JPEG is what both
  phones expect. Canvas re-encoding strips EXIF.
- **File save**: feature-detect `showSaveFilePicker` (Chromium only), else
  `<a download>` with a Blob URL revoked after click.
- **Intl**: `Collator` for sorting; `DisplayNames` for region and language
  labels (static ISO 3166-1 alpha-2 list); `supportedValuesOf('timeZone')`.
- **Lit specifics**: components hold no business state; the store is the
  source of truth; `ReactiveController` for subscriptions; `repeat()` keyed
  by Id; `live()` on inputs; forms submit nowhere.
- **Security posture**: every input is hostile. Size caps, no HTML
  injection paths, CSP with `connect-src 'none'`, URL scheme allow-list,
  data URIs rendered as images only after a prefix check, `vCardProps`
  always shown as text.
- **Old-repo lessons folded in**: unescape exactly once at the typed-value
  stage, keep property order, support groups, quoted params, multi-valued
  params, LF-only files, multiple cards per file.

Verification
------------

- Per package: `pnpm -r test` (Vitest, coverage ≥ 80 %), `pnpm -r typecheck`
  (`tsc --noEmit`), `pnpm lint` (Biome), `pnpm -r build`, `publint` + `attw`.
- Golden fixtures: every `fixtures/**/*.vcf` parses with zero `error`
  issues and matches its reviewed `.model.json` and `.jscontact.json`.
- Round trips as described in each package section; phone round-trip
  snapshots for the `android` and `apple` profiles.
- App: `pnpm --filter web build` then `vite preview`; Playwright e2e flows
  (import → edit → export → re-parse; diff two fixtures; reload keeps data).
- Device checklist (manual, you, at M5 and M7): restore an exported file on
  a real Android phone (and Apple device), compare field by field with
  `docs/interop.md`. Findings update the profile tables.
- Manual: open the Pages deployment offline after a first visit (M9),
  import your real exports, check the issues panel and the unmapped-data
  section for anything that should have been a real field.

Fixtures: drop your anonymised exports under `fixtures/<source>/` whenever
ready; M1 starts with the RFC and cozy-vcard samples and picks yours up as
they arrive. An export from your current Android phone is the single most
valuable fixture: it is the exact input the whole project exists for.
