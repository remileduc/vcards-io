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
`packages/vcard/src/platform-globals.d.ts` (first named
`whatwg-encoding.d.ts`, renamed on 2026-11-09 when `structuredClone` joined
it), so an accidental `document` or `fetch` in library code still fails to
typecheck. The app keeps the DOM lib.

2026-11-06 Date values are partial-field objects, timestamps are complete
-------------------------------------------------------------------------

`DateAndOrTime` has every part optional; the `VValue` variant that carries
it keeps the original string in `raw` beside it. A date has no hour, a time
has no date part, a date-time has both, and both parts use the same form
(basic or extended), so a mixed `1985-0412` is rejected rather than silently
normalised. Formatters range-check every field and throw `RangeError`.
`Timestamp` (REV, CREATED) requires a full date-time and a date-only REV is
rejected by `parseTimestamp`, so the reader types it as date-and-or-time
with a warning instead of inventing a midnight (an `info` in 2.1/3.0, where
RFC 2426 explicitly allows a date-only REV, as its own example shows). Fractional seconds are
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
without `:` continues N/ADR/ORG with a warning (Google export) unless it
reads as a property header folded inside its parameter list (`NAME;` with a
`=` after it) as in the RFC 9554 examples (added 2026-11-08 when those
became fixtures; a first version looked at whether a fold followed instead,
which lost a Google break long enough to be folded itself), empty
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

2026-11-08 Value decoding follows the version's escaping, unknown stays raw
---------------------------------------------------------------------------

`parseVCards` types values in `parse/properties.ts` after the card's version
is known. vCard 2.1 text is kept exactly as written and only list splitting
unescapes `\\ \; \, \:`, which is what the AOSP 2.1 parser does; 3.0 and
4.0 use the lenient `unescapeText`. TYPE values are lowercased except `X-`
custom labels, whose case Android displays. A property missing from the
registry becomes `unknown` with its raw, still-escaped text, so the writer
can re-emit it byte for byte and JSContact `vCardProps` gets the RFC 9555
`unknown` type; a registry property used outside its versions (NICKNAME in
2.1, LABEL in 4.0) is read with the kind of its last version plus an `info`.
`VALUE=text` never flattens N, ADR or CATEGORIES. Inline binaries take their
media type from the magic bytes first, because exporters label every photo
JPEG, then `MEDIATYPE`, then the `TYPE` media name. A scalar that does not
parse (date, offset, number, boolean, language tag) is kept `unknown` with an
`invalid-value` warning; a non-gregorian `CALSCALE` (Apple's lunar
`X-ALTBDAY`) is not attempted and gets an `info`. Charset decoding is strict
(`fatal`) with a windows-1252 retry and warning, and `ignoreBOM` keeps a
U+FEFF inside a value. `CHARSET` only means something on bytes: when the
input was a string or UTF-16 the parser made the UTF-8 itself, so a legacy
`CHARSET=ISO-8859-1` (Outlook, Nokia) or a `defaultCharset` option would
only turn correct text into mojibake, and both are ignored with a
`charset-ignored` info; the same info covers `CHARSET` on a 4.0 line, which
RFC 6350 removed. `ENCODING=BASE64` is the value itself only for media
properties, `VALUE=binary` and unknown properties; for text kinds it is the
transfer encoding versit 2.1 made it, so `NOTE;ENCODING=BASE64;CHARSET=UTF-8`
decodes to text through its charset instead of becoming a blob. A
PHOTO/LOGO/SOUND/KEY without ENCODING in 2.1/3.0 is read as a URI when it
has a scheme (Thunderbird writes `PHOTO:http://`), with an `info`, otherwise
kept `unknown` with a warning. Lookup tables keyed by input (`VALUE`, `TYPE`
media names) are `Map`s, so `VALUE=constructor` finds nothing rather than
`Object`. Every fixture has a `.model.json` beside it, the parse result with
parameter maps as objects and binary data as base64, checked with Vitest's
`toMatchFileSnapshot` and rewritten by `vitest -u` for review in the diff.
The fuzz tests (`fast-check`) assert that no input, text or bytes, makes
`parseVCards` throw; the review of this checkpoint also found that spreading
a repeated parameter's values into `push` overflowed the stack on a line
with a few hundred thousand values, hence the plain loop.

2026-11-08 The versit 2.1 examples are fixtures too, and adjusted two defaults
------------------------------------------------------------------------------

vCard 2.1 has no RFC; the versit Consortium specification (the RTF linked
from the main README, converted to text for the extraction) provides the
examples in `fixtures/rfc/versit21-*.vcf`. Two readings changed because of
them: `SOUND` defaults to text in 2.1 (the spec's own example is
`SOUND:JON Q PUBLIK`, a pronunciation string; 3.0 keeps binary, 4.0 uri),
and the nested vCard inside an empty `AGENT:` is reported as an `info`
instead of a warning, since the spec documents exactly that form; the
Android importer rejects it, which is for the `android` profile to report.
The spec's hypothetical `X-DL` example nests vCards outside AGENT and is not
a fixture: no importer reads that, and the parser closes the outer card on
such a BEGIN by design.

2026-11-08 Review against the versit text: KEY, bare `B`, one-line AGENT
-------------------------------------------------------------------------

Reading the parser against the full versit 2.1 text found three places
where valid 2.1 input was read wrong. `KEY` defaults to text in 2.1
(section 2.7.1: "The default format is clear-text"; RFC 2426 3.7.2 made it
binary, RFC 6350 a URI), so a clear-text key no longer gets a
`binary-without-encoding` warning, while `KEY;ENCODING=BASE64` still
decodes to binary because the media check looks at every version's kind.
The bare-word promotion to `ENCODING` now follows the versit
`pencodingval` list exactly: `B` is RFC 2426 named-parameter syntax and
never a 2.1 bare word, and promoting it meant a stray `;B` base64-decoded a
phone number. The AGENT grammar is `"AGENT" [params] ":" vcard`, so
`AGENT:BEGIN:VCARD` with the nested card on the following lines is as valid
as the prose example with an empty `AGENT:`; the grouper now nests both
forms, keyed on the AGENT value being exactly `BEGIN:VCARD`, which the 3.0
escaped one-line form never is. Not changed, on purpose: `\;` inside a
parameter value (section 2.1.2) is not honoured, nested groups `A.B.TEL`
and `X-` names with characters outside `[A-Z0-9-]` are read but warned
about, and unfolding drops one whitespace byte where RFC 822 would keep it;
all three match what AOSP does with 2.1 input.

2026-11-09 Upgrade normaliser: shape-driven, canonical, quiet about what it keeps
--------------------------------------------------------------------------------

`upgradeTo40` clones the card (`structuredClone`, declared in
`platform-globals.d.ts` beside the encoding globals) and runs standard, vendor
and finishing rules in place; rules match the shape of a property, not the
card's version, so a 4.0 card with legacy shapes is normalised too and a
second pass is a no-op that reports nothing, which the fixture and fuzz tests
assert. Three things go beyond the plan's tables. First, vCard 2.1 text is
unescaped at upgrade time (`\\ \; \, \:`, exactly AOSP's set: `\n` is not
in it, so a Windows path such as `C:\new` survives): the parser keeps 2.1
text as written for losslessness, but a 4.0 model holding `a\;b` would be
re-escaped by the writer to `a\\;b`, a different value. Second, the `VALUE`
parameter is made canonical: absent when the value kind is the property's
4.0 default, set from the kind otherwise, so `TZ:-0500` gets
`VALUE=utc-offset`, a bare-UUID `UID` gets `VALUE=text` (a `urn:uuid:` one
becomes a URI), a date-only `REV` gets `VALUE=date-and-or-time`, and two
cards with the same meaning have the same model whatever their writer
spelled; the writer only has to emit the parameter when present. Third, the
issue policy: an `info` per semantic rewrite, a `warning` when malformed
input stops a rule (non-numeric GEO, unknown Android type number, orphan
X-ABLabel), and silence for what is kept on purpose, for CHARSET/ENCODING
(already consumed by the parser) and for N/ADR padding. Smaller choices:
`_$!<Main>!$_` maps to TYPE `main`, the word Apple itself writes as
`type=MAIN`, not `main-number`; Google's `RELATIVE`, `REFERRED_BY` and
`DOMESTIC_PARTNER` labels join the relation table; an Android custom
relation's label is emitted as an `itemN.X-ABLabel` in a fresh group so the
converter has one label mechanism; an X-ABLabel repeating the IMPP
SERVICE-TYPE is dropped; a label whose group holds only raw `X-` properties
(an X-ABDATE "Other") stays with them; `X-GENDER` words are mapped beside
`X-WAB-GENDER`; a 2.1 `VALUE=CONTENT-ID:<id>` becomes `cid:id`. Groups are
never renamed or removed. The TYPE media-name table moved from the parser to
`values/media.ts` so both stages share it, and a declared `MEDIATYPE` or a
`TYPE` with a slash now has to match the RFC 2045 type/subtype shape before
it is believed. The cold review of this checkpoint found four things worth
recording: per-label scans made a 20 000-row card quadratic (rules now build
one group index and drop in one pass; a test bounds the time), duplicate
VERSION lines survived (one `VERSION:4.0` is kept), the Google 8th-component
rule fired on genuine RFC 9554 addresses (3.0 cards only now), and the issue
list was unbounded (same cap as the parser).

2026-11-09 Writer: syntax tables only, semantics stay in the profiles
----------------------------------------------------------------------

`serializeVCards` is an engine plus one syntax table per version
(`write/v30.ts`, `write/v40.ts`); the engine formats values, derives the
`VALUE` parameter, assembles, validates and folds lines, and the table says
what its version can carry. Properties are written in model order: the
canonical readable order is the job of whoever builds the card (`convert`
emitters, M5), so a parse-and-write round trip stays lossless. The `VALUE`
parameter is derived from the kind against the target version's default
rather than copied from the model, so output is canonical whatever the
caller declared; a redundant `VALUE=uri` read from a 4.0 card is therefore
not written back, which the round-trip tests ignore because the kind is
still compared. The 3.0 table is deliberately strict about parameters: only
what RFC 2426 defines plus `CALSCALE` (Apple writes `X-ALTBDAY;CALSCALE=
chinese` in 3.0 and the date is garbage without it) and `X-` names, because
iOS hides a card whose PHOTO carries a 4.0 parameter and AOSP ignores
unknown names anyway; `MEDIATYPE` on a media property is turned back into
the legacy `TYPE=JPEG` word, the inverse of the normaliser's rule, and N and
ADR are cut or padded to 5 and 7 components since RFC 9554 says the extra
ones repeat what the first ones hold. Every `PREF=n` becomes a last
`TYPE=PREF`, and a `TYPE=pref` still in the model is moved there too:
which properties carry PREF when targeting 3.0 is the profile's call, and
last is where Apple writes it (a re-read card then writes the same text).
A `binary` value gets no `VALUE` on a media or unknown property (ENCODING
says it) but `VALUE=binary` on a text property such as NOTE, where readers
take base64 as a transfer encoding. The writer has no issue channel: the profiles own
the loss report, and the writer throws `SerializeError` only for what a
version cannot express (binary in 4.0, a quote or control character in a
3.0 parameter, a date shape without a form, an invalid name, `BEGIN`/`END`
as a property, a line break escaping cannot absorb). A missing FN is not an
error here: three versit 2.1 fixture cards have none and `convert` always
builds one. Parameter values that start or end with whitespace are quoted
because readers trim unquoted ones. Two things the tolerant parser keeps
cannot be written and must be dropped by the layer building a card for
export: a property whose name the parser flagged invalid (Google's
`\NARBITRARY_STRING`) and a bare `END:` line kept as a property
(DAVdroid). Found by the round-trip tests and fixed on the way: the
parser's `http\://` repair stripped one backslash where Google's export had
two, so the repair now removes the whole run (one fixture snapshot
changed). The cold review of this checkpoint found: the engine uppercased
names on output while every table lookup was case-sensitive, so a
hand-built lowercase `charset` key leaked into 4.0 output and lowercase
`type`/`pref` keys bypassed the 3.0 table (names, groups and parameter
keys are now normalised once, before the tables see the property);
`foldAt` and `version` were not validated at runtime (both are now
`RangeError`s and the table lookup is a Map so `"constructor"` finds
nothing); binary on a text property re-read as
mojibake; and 3.0 time-only values carried the RFC 6350 `T` prefix, which
RFC 2426 does not have (a bare extended time is written now; truncated
forms, which only 4.0 defines, keep the prefix). Lone surrogates are
replaced by U+FFFD once per line, which is what every UTF-8 encoder does
anyway, so folded and unfolded lines agree. Parameters with no non-empty
value are skipped, as readers would.

2026-11-09 Line endings are always CRLF, no option
--------------------------------------------------

The plan's `SerializeOptions` carried a `lineEnding` of CRLF or LF for a
human-readable archive on Unix. RFC 2426 §2.1 and RFC 6350 §3.2 both
define a content line as ending in CRLF, the phones expect it, and a
runtime option that can inject text at the end of every line is surface
the layers above would have to validate. The option is removed from
`serializeVCards` and from `foldLine`: nothing in the package can produce
anything but CRLF. Both AOSP and Apple read LF files anyway, so a user who
converts the file afterwards loses nothing.

2026-11-09 Writer reports what 3.0 drops, and only PREF=1 becomes TYPE=PREF
---------------------------------------------------------------------------

The first writer checkpoint gave the writer no issue channel and left the
loss report to the profiles, but the 3.0 table is where the losses are
decided (`PARAMS_30`, `COMPONENTS_30`, the PREF collapse), and a profile
re-implementing those tables to describe them would drift from them. The
review of that checkpoint also found that any `PREF=n`, the least preferred
included, became `TYPE=PREF`, which marked every ranked number as preferred
on the phone, and that a parsed 4.0 card with a caret-encoded newline in an
`X-` parameter made the 3.0 writer abort a whole export for one odd
parameter in one contact. So `serializeVCards` now returns `{ text, issues
}` like the parser and the normaliser, with the card index on each issue
(`Issue.card`), and the 3.0 table reports every loss as a `warning`:
`param-not-in-30` (names it has no form for), `param-value-not-in-30` (a
quote or control character RFC 2426 cannot escape, the value is dropped
rather than the export refused), `pref-not-in-30` (any rank but 1, which is
the only one `TYPE=PREF` can say) and `components-not-in-30` (a non-empty N
or ADR component beyond 5 or 7; padding and empty tails are lossless and
silent). `SerializeError` is left for what no version can write, and a
`TYPE` value holding a comma joined that list because readers split a
quoted `TYPE` on commas in every version, so quoting it would re-read as a
different model. Two more canonicalisations came out of the same review:
the derived `VALUE` parameter is always written first, whether or not the
model declared one, so two exports of one contact never differ by parameter
order; and the writer validates names with the lexer's `NAME_RE` and floats
with the parser's `FLOAT`, so reader and writer cannot disagree on either
grammar.

2026-11-09 Blank lines between cards are an opt-in writer option
----------------------------------------------------------------

The plan ruled out blank lines between cards because Apple's reader is
unverified on anything between `END:VCARD` and the next `BEGIN:VCARD`.
They do make a long export much easier to scan, which is the point of
the human-readable output, so `serializeVCards` takes
`blankLinesBetweenCards` (an integer 0 to 9, `RangeError` otherwise,
default 0) and writes that many empty CRLF lines between consecutive
cards, never before the first or after the last. The default stays 0 for
the reason the plan gave. AOSP's `readBeginVCard` skips blank lines in
every version, so the `android` profile may turn it on; the `apple`
profile must not; the `rfc` profile stays at 0 because neither RFC 2426
nor RFC 6350 has a blank line between entities in its grammar. Our own
parser drops empty physical lines before it looks for a property, so the
spaced output re-reads to the same cards with no issue.

2026-11-11 Public API of the vcard package settled before 0.1.0
---------------------------------------------------------------

Everything exported becomes a semver promise once 0.1.0 ships, so seven
things changed while they still could. `Issue.code` is the `IssueCode` union
built from four exported `as const` lists (`COMMON_ISSUE_CODES` for
`issues-truncated`, then one per stage: parse, upgrade, serialize); every
stage reports through helpers that accept only its own list, so a typo no
longer compiles, a test checks that every listed code is raised by a helper
call in its own stage's sources and in no other stage's, and the app can map
codes to translated text with a `Record<IssueCode, string>` instead of
showing the English `message`. That table is the reason a new code is a
major release: a complete `Record` stops compiling when the union grows.
`Issue` takes the code type as a parameter defaulting to `IssueCode`, so
`@vcards-io/convert` returns the same shape with its own list added and
never has to touch this package's lists. Two rewrites that shared
`legacy-im-to-impp` without producing an IMPP got their own codes,
`legacy-im-to-socialprofile` (X-TWITTER) and `legacy-im-to-tel`
(X-SKYPE-PSTNNUMBER). Parse issues now carry `card`, the index in
`ParseResult.cards`: it is assigned at the end by line range (each card
knows the line that closed it) rather than where the issue is raised,
because the line stage runs before cards exist and an over-long line it
drops never reaches the grouper; issues outside a card and whole-input ones
(BOM, size cap) have none. A nested BEGIN line is the one line in two
ranges, so the grouper sets the index itself on what it reports there:
`nested-begin` under the card it closed, `version-missing` under the card it
opened. For the same reason `qp-soft-break-dangling` is reported on the line
holding the `=` and not on the delimiter after it, which may open another
card or follow a line outside any card. The `utc-offset` value nests its
fields as `{ kind, value: UtcOffset }` like the two date kinds, which
removes the structural-typing accident the writer relied on; a value in the
old flat shape, or any value without the fields of its kind, is a
`SerializeError` naming the card and the property (the writer rethrows the
`TypeError`). `encodeQuotedPrintable` left the package for
`packages/vcard/test/helpers/`: it only ever built 2.1 test input and the
project never writes QP. `unfoldLines` is gone: it was a plain RFC 6350
unfolder nothing used, and it disagreed with the parser's tolerant one (no
QP soft breaks, no unindented base64), so a consumer running it on a 2.1
file got different lines than `parseVCards`. VERSION is no longer a
property: `card.version` is the only copy, the grouper consumes VERSION
lines (an unknown or a second one is still a `version-unknown` /
`version-duplicate` warning, since the line is dropped), `upgradeTo40` sets
the field, and the writer treats a VERSION property in a hand-built model as
a `SerializeError` like BEGIN and END instead of skipping it, because
writing it would give the card two VERSION lines. So that a model which went
through the normaliser can always be written, `upgradeTo40` drops such a
property with an `info` (`version-dropped`, which no longer means a
collapsed duplicate). The export path does not run the normaliser, so
`jscontactToVCard` must refuse BEGIN, END and VERSION entries of
`vCardProps` itself (docs/plan.md, profiles). The `VERSION` entry of
`PROPERTY_REGISTRY` went too: the registry describes what `properties` can
hold, and its cardinality of exactly one would fail every card. The price,
accepted: the VERSION line number is lost, an unknown `VERSION:5.0` line is
not kept anywhere, and a group or parameters on the VERSION line are dropped
with an `info` (`version-extras-dropped`).
Finally the README states which exports are the stable contract (pipeline,
model types, issue codes, text and value helpers) and which exist for the
sibling packages with no stability promise (`PROPERTY_REGISTRY` and its
lookups, `COMMON_PARAMS`, `TEXT_FAMILY`, `VALUE_TOKENS`, the media word
tables, `declaredMediaType`, the relation table, `URI_SCHEME`).

2026-11-17 Pre-release cleanup: shared modules, `propertyId`, floats in plain digits
-----------------------------------------------------------------------------------

The three stages (`parse/`, `upgrade/`, `write/`) no longer import from one
another: what they share lives in `issues.ts` (sink, capped collector,
`excerpt`) and `model.ts` (`NAME_RE`, `propertyId`, parameter helpers), and
value syntax stays in `values/`. `propertyId` joins the stable contract
because `Issue.property` already exposes its `group.NAME` form and a
consumer needs the same function to match an issue to a property. The float
sentence of the 2026-11-09 writer review is superseded: validating
`String(number)` with the parser's `FLOAT` made the writer throw on values
the reader accepts without an issue (`0.0000001` is `1e-7` as a number), so
one odd property aborted an export. `values/number.ts` now holds the pair:
`parseFloatValue` rejects text that overflows a double (kept as `unknown`,
`invalid-value`), `formatFloatValue` writes plain digits whatever the
magnitude, and only NaN and the infinities are a `SerializeError`. The
reader takes a property's fallback kind from `nearestValueKind`, the
function the writer and the normaliser use, so the three cannot disagree on
it; the `property-not-in-version` message no longer names the version it
was read as. The registry check "is this kind the property's default" is
one predicate, `sameValueKind`, and the normaliser's legacy IM table is
keyed by the registry's `LegacyImProperty` type, so a name the registry
lacks does not compile. The parse stage's severity helpers live in
`parse/report.ts`, so only one module is called `issues.ts`. Writer
warnings carry the id of the property as the caller wrote it, like
`SerializeError`, not of the canonical copy: it is what `propertyId`
returns for the caller's own object.

2026-11-17 Publish hygiene: no source maps, per-package coverage gate
---------------------------------------------------------------------

The libraries no longer emit `.js.map` or `.d.ts.map`. `files` ships `dist`
without `src`, so the maps pointed at files a consumer does not have, and
they were half of the tarball; the output is unminified ES2025, close
enough to the source to debug as is. The app is unaffected: it resolves the
libraries from `src` and Vite writes its own maps. Each library gets a
`prepack` that cleans and rebuilds, so a publish cannot ship a stale or
leftover file, and `publishConfig.access: public`, which a scoped package
needs on its first publish. The 80 % coverage gate now also applies to each
package's `src/**`, so a well-covered library cannot mask a weak one.
Vitest matches the coverage include and exclude from the repo root in a
full run but from the project root under `--project`, where the
root-anchored include matched no file, reported 0/0 and passed; both are
now listed in the two forms, anchored so that a nested checkout is not
swept in. A threshold glob that matches no file passes silently, so the
config throws when a source root does not exist; the `apps/web` gate has
nothing to measure until the app has modules outside the Lit shell. Each
package's `VERSION` constant is checked against its `package.json` by a
test.

2026-11-18 README badges: coverage served from Pages
----------------------------------------------------

The README shows the CI status with GitHub's own workflow badge and the
line coverage with a Shields endpoint badge. `pages.yml` runs the tests
with coverage, then writes `coverage.json` (label, floored percentage,
colour by threshold) into the deployed site with `jq`. No coverage service,
third-party action or write token is involved, and the workflows stay
read-only. The tests run a second time in the deploy rather than reusing
the CI artifact, so a manual deploy publishes the badge too. The colour
scale starts at yellow: under 80 % the gate fails and nothing deploys.

2026-11-18 M3 in three checkpoints, tested against `@sdxc/jscontact`
-------------------------------------------------------------------

`@vcards-io/jscontact` is built like the vcard package: three checkpoints
(types and vendor; pointer, patch and utilities; validator and API freeze),
one session each, a cold review agent at the end, then a stop for review
and commit. `@sdxc/jscontact` is the only JSContact implementation on npm
and is not taken as a runtime dependency: it peer-depends on the `remix`
framework for its validation, was first published on 2026-10-25 by one
maintainer, and its README promises no compatibility between releases. It
is MIT and a useful second opinion, so it is a dev dependency of the
jscontact package alone (not of the root), pinned to an exact release,
and used only by differential tests (`remix` is not listed: pnpm installs
a missing peer by itself, `autoInstallPeers` being on by default): both
implementations must agree on accept or reject and on the result of a
patch, and each intended divergence is listed with its reason. The price,
accepted: about 90 packages in the lockfile for one test oracle, some of
them native build tools; none of it is shipped, and `src` never imports
it. `jmapio/jscontact-tests`, which the plan hoped to use as a corpus, is
a Python harness with no data and is dropped.

2026-11-18 The validator stays hand-written
-------------------------------------------

RFC 9553 ships no JSON Schema and no CDDL; the one JSON Schema found for
JSContact is GPL-3.0 and older than RFC 9982. Writing our own schema and
running it through a validator was considered (`ajv` compiles with
`new Function`, which the app's CSP forbids, so it would also need a
build-time step; `@cfworker/json-schema` interprets), and so was a
TypeScript schema library (`valibot`). None of them carries severities,
our issue codes or the cross-field rules (a localization patch that must
resolve inside its Card, `sortAs` keys against the name components, case
variants of known names), which would stay hand-written beside the first
runtime dependency of a library. The validator is therefore a table per
object type read by a small checker of our own; a JSON Schema document can
be generated from those tables later if one is worth publishing.

2026-11-18 Platform globals shared at the root, relation table renamed
----------------------------------------------------------------------

Two changes to the vcard package, made with the first M3 checkpoint while
nothing is published. `platform-globals.d.ts` was only in vcard's own
`include`, so a sibling package importing vcard from source failed to
typecheck (`TextDecoder`, `structuredClone` not found); it would have
stopped `convert`. The published package was never affected: built and
typechecked from a consumer with no DOM lib and `skipLibCheck` off, it
passes. The file moves to the repository root, gains `crypto` for
`newUid`, and every library tsconfig lists it; the app keeps the DOM lib
instead. And vcard's `RELATION_TYPES` / `RelationType` become
`RELATION_MAPPINGS` / `RelationMapping`: RFC 9553 has a relation enum,
which jscontact exports under the RFC's name like every other enum, and
`convert` imports both packages.

2026-11-18 Ids are deterministic
--------------------------------

The plan had `newId()` return ten random characters. Android exports carry
no `PROP-ID`, so every import of the same file would have produced
different Ids: unstable fixture snapshots, a JSON export full of noise, and
a diff that sees every phone as removed and added. `nextId(map, prefix)`
returns the smallest unused `<prefix><n>` instead (`p1`, `p2`, the form the
RFC 9553 examples use), and the converter numbers entries in property
order. Ids are then stable for one file but still not comparable between
two backups (removing the first phone shifts the rest), which is why the
diff matches map entries by content before it looks at their Id.

2026-11-18 The validator reports issues with severities
-------------------------------------------------------

The plan's `validateCard` answered valid or not with a list of errors. It
now returns `{ card, issues }` in the shape the vcard stages use: an
`as const` code list, a JSON Pointer `path`, a cap per code, and three
severities. An `error` is what would make our own code misread the value;
what RFC 9553 calls invalid but can be kept and written back untouched (an
unknown property, an unknown enum value, a case variant, the reserved
`extra`) is a `warning`, because the readers of this project are tolerant
and a backup edited by hand must not be refused for a typo. The package
declares its own `CardIssue` type: it does not depend on
`@vcards-io/vcard`, and `convert` wraps one into the other. JSON is hostile
input like a `.vcf`: depth and size caps are issues, pointer and patch code
walks own properties only and never assigns `__proto__`.

2026-11-18 Match, diff and merge move to a milestone 4.5
--------------------------------------------------------

The diff was the library half of M8, after the app. It moves to a new
milestone between the two converter milestones and gains card matching and
merge. After M4, because matching cards and entries has to be tuned on real
converted cards, which do not exist before; before M5, because a
structured diff makes the round-trip tests readable; before M6, because the
import dialog needs matching for its duplicate policy, where "merge" joins
"replace / keep both / skip". The merge is two-way, two backups having no
common ancestor: map entries and sets are unioned, a single-valued field
that differs is a conflict resolved by a `prefer` option and always
reported, and a card with several candidates is never merged on its own.

2026-11-18 Dev tooling is declared once, in the root
----------------------------------------------------

Each sub-package listed `typescript` and `vitest` beside the root, while
`fast-check`, `@types/node`, Biome, `publint` and `attw` were only in the
root and used from below anyway: pnpm puts the workspace root's
`node_modules/.bin` on the `PATH` of every package script, and Node finds
an import in a parent `node_modules`. The mix had no rule behind it, so
there is one now: what several packages share is declared in the root
`package.json` alone, and a package declares only what it alone uses
(`vite` in the app, `@sdxc/jscontact` in jscontact). One
version per tool with nothing to keep in sync, and published manifests
that list no dev tooling. The price is that a package folder cannot be
installed on its own (`--filter`, `--ignore-workspace`); it could not
before either, since the Vitest config, the lint config and half the test
imports live in the root, and a plain `pnpm install` run anywhere in the
workspace installs everything.

2026-11-18 Each library carries its own copy of the licence
-----------------------------------------------------------

npm always packs a `LICENSE` file, but only one found in the package
folder: the three libraries had none, so their tarballs would have shipped
the `"license": "MIT"` field without the text the MIT licence requires to
accompany copies. `packages/*/LICENSE` are plain copies of the root file.
The app is not published and has none.

2026-11-18 JSContact types refuse what a literal can get wrong, no more
-----------------------------------------------------------------------

The interfaces follow RFC 9553 section by section, in a `types.ts` without
runtime code; the enumerated values are `as const` lists in `enums.ts`, in
the order of the RFC text, so that a dropdown built from one reads well.
An enumerated property is typed `Kind | VendorExtension`, the second being
the `domain:name` pattern, so a vendor value is accepted everywhere and a
miscased or invented word does not compile. A set is typed as a map to
`true`, not to `boolean`: the RFC demands `true` for members, relation
types, phone features, keywords and address contexts, says nothing for the
other contexts, and `false` would only be a second way to leave a key out.
The "at least one of" and other cross-field rules are not encoded as
unions: they would turn every edit of a draft in the UI into a type
puzzle, and the validator checks them on real data anyway. Two places go
beyond the RFC's letter. `Timestamp` requires its `@type`, which the RFC
does too when the default type of the property is another one, and that
makes `Anniversary.date` narrow. And `Nickname` declares
`remileduc.github.io:kind` with its five values: the property is ours, so
the converter and the UI read it typed, and the validator may check it.
The vendor relation names are kept bare (`mother`) because `convert` joins
them with `x-` on one side and the vendor prefix on the other.

2026-11-18 JSContact fixtures are cut from the RFC text, one Card per rule
--------------------------------------------------------------------------

`fixtures/jscontact/` holds three kinds of files. The figures of RFC 9553
were cut from the RFC text by a script and wrapped into complete Cards
(`@type` and `version` "2.0" added where the figure is a fragment), with
two misprints corrected and one figure left out, as `fixtures/README.md`
lists. The registry tables of its section 3 were extracted the same way;
they are a second transcription of the property names and enum values,
independent of the prose the types were written from, and the tests
compare the two. Four rows of Table 2 that contradict the sections were
corrected in the file. Third, one small Card per requirement, invalid or
to be accepted, written by hand: RFC 9553 prints no invalid example. The
checklist the validator will be written from is a document,
`docs/jscontact-constraints.md`, whose rows carry the names of these
Cards; a test compares the two word for word, because a checklist that
drifts from its fixtures is worse than none. The figures also exist as
TypeScript literals in the jscontact tests: a JSON import widens every
string, so only a literal lets the compiler check them against `Card`,
and a test asserts both copies are equal. The oracle (`@sdxc/jscontact`)
accepts every figure and every Card of the valid file, and accepts 64 of
the 161 invalid ones (unknown enum values, `extra`, patches, URI and
language syntax): the list of intended divergences checkpoint 3 has to
write starts there.

2026-11-18 convert typechecks from the repository root
------------------------------------------------------

The ADR on platform globals names one obstacle to a package importing a
sibling from source; the first test of `convert` that imports both
libraries found a second. `tsc` refuses a source file outside `rootDir`
even with `noEmit`, and the sibling's `src/index.ts` is outside
`packages/convert`. Its `tsconfig.json` (typecheck only) now has
`rootDir: "../.."`; the build config keeps `src` and resolves siblings
through their `dist` declarations, which `rootDir` does not concern. The
vcard and jscontact configs keep `rootDir: "."` on purpose: neither may
import a sibling, and this makes the compiler say so. With the wider
`rootDir` the compiler no longer stops `convert` from importing a file
inside a sibling, so a Biome `noRestrictedImports` pattern does: a sibling
is imported by its package name only.

2026-11-19 The registry fixture follows the live IANA registry
--------------------------------------------------------------

`fixtures/jscontact/rfc9553-registry.json` was cut from the text of RFC
9553, which is frozen, while the registry it prints is not. Compared with
the registry at iana.org (last updated 2026-09-22), the versions, the 38
types, every property with its type and contexts, and the 17 enum tables
are identical, and the four slips of Table 2 are in the live registry too.
One thing the RFC text could not show: RFC 9610 (JMAP for Contacts)
reserved `id` and `addressBookIds` in a Card and `blobId` in a Media.
Section 1.7.3 makes an object with a reserved property invalid, so the
fixture lists them, the checklist has a Card for each, and the validator
will report them as it does `extra`: a warning, the property kept. That is
the realistic case of a Card copied out of a JMAP server. The comparison
was made by hand with a throwaway script; it is not a test, since the
project's tests run offline.

2026-11-20 Ids are allocated in two passes and their references follow them
---------------------------------------------------------------------------

A review of the plan found four holes around deterministic Ids, all of the
same kind: an Id is also a name other things point at
(`Title.organizationId`, the paths of localization patches, a JSPROP
pointer). The converter reserved a `PROP-ID` only when it met it, so a
generated `p1` could take the Id a later `TEL;PROP-ID=p1` states and send
a patch to the wrong phone; it now reserves every valid `PROP-ID` of a
collection first, then numbers the rest from a counter, which is also
linear where a `nextId` call per property was quadratic on hostile input.
The merge re-keyed a colliding Id of the second backup without touching
what referenced it; it now renames B's Ids through `renameId` before
copying, for collisions and for entries paired by content alike. Deleting
an entry left its references dangling, and `nextId`, giving the smallest
free number, handed the freed Id to the next entry added; the fix is
`removeEntry`, which removes the references with the entry, not another
numbering: "highest plus one" reuses the Id of the last entry just the
same and only hides the dangling reference. Last, `prefer: 'newer'` had
no answer when a Card has no `updated`, which is every Android export: it
then behaves as `'a'`.


2026-11-20 An enum value outside its list stays a warning
---------------------------------------------------------

The same review argued that an unknown enum value must be an `error`,
since `validateCard` returns the input typed as `Card` and the unions do
not list the value. Kept as a `warning`. RFC 9553 section 1.9 lets a
minor version register new enum values without readers changing, so a
Card written next year must load, and a backup edited by hand must not be
refused for one word. The types already make the safe reading the only
one that compiles: every enumerated property is `Kind | VendorExtension`,
so no `switch` is exhaustive and no `Record<Kind, …>` lookup is total
without a branch for what is not listed. The rule is that this branch
tests membership (`isListed`) and not the presence of a colon; an unknown
word then goes where a vendor value goes, kept, shown as written, and
reported by a profile that cannot export it.


2026-11-20 The oracle is outside Dependabot's group; the root needs Node 24.3
-----------------------------------------------------------------------------

Two costs of `@sdxc/jscontact` the first ADR missed. Dependabot grouped
every npm update under one pattern, so the monthly pull request would
have bumped the pinned oracle with the rest: either its changed verdicts
fail the differential tests and hold every other update back, or it is
merged unread and its new tree runs in the job that builds the Pages
artifact. It is now ignored there and bumped by hand. And its `remix`
peer requires Node 24.3, above the 24 the repository declared: the
private root `package.json` now says `>=24.3`, the published libraries
keep `>=24` since no dependency of theirs asks for more. Both entries go
away with the oracle if it is dropped after milestone 3.
