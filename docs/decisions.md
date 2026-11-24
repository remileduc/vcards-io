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

2026-11-22 A PatchObject is checked where it lands, on a copy that cannot overflow
----------------------------------------------------------------------------------

`applyPatchObject` checks the three conditions of RFC 9553 section 1.4.3
it can check alone, with the pointer syntax: that an array member is
replaced and neither added nor removed, that the parents exist, that no
pointer is the prefix of another (the pointers are sorted token by token,
where a prefix is followed directly by what it starts). It reports every
invalid patch, not the first, and returns `null` as soon as there is one.
The fourth condition, a value valid for its property, needs the
validator: the checkpoint 3 validator runs on the Card `localize`
returns, so a patch setting `name/full` to 5 applies here. Four choices
go past the RFC's letter. `-` is refused as an array index only: in an
object it is a name, and a valid Id. A last token `__proto__` is refused
(`patch-prototype-key`) and no `__proto__` key is ever assigned, while an
own `__proto__` key already in the data is copied as data. A target that
is no object or array has its own code: the fuzz test found that `null`
with an empty patch came back as "null, no issue", and the review found
the same of `localize` on a Card that is no object. And a value of
`undefined` is refused (`patch-value-undefined`): no file holds one, but
code building a patch can, and the result was no longer JSON. Only the
value of a patch is looked at, not what is inside it. The copy is not
`structuredClone`: Node 24 answers a 200 000-deep array, which
`JSON.parse` accepts, with a `RangeError`, so the copy, `equal` and the
walks are loops. Against `@sdxc/jscontact` the generated and fixture cases
agree. The divergences, each a case of the differential test: it refuses
every `-`, defines `__proto__`, patches a target that is no object (or
throws on it), reads a patch that is no object (a string is applied
character by character, `null` throws), and applies a localization that
patches `localizations` itself.

2026-11-22 localize returns the Card itself when it has nothing to apply
------------------------------------------------------------------------

Section 2.7.1 says "stop" when a Card has no patch for the language and
leaves setting `language` optional. `localize` then returns the Card it
was given, not a copy and with its `localizations`: copying to say
"nothing changed" costs a whole Card per row of a list, and the oracle
does the same. With a patch, the result is a copy without `localizations`
whose `language` is the tag as the Card writes it, even when the patch
sets `language` too: the text is now in that language. Tags match without
case and exactly: `fr` does not answer for `fr-CA`, the RFC asking for "a
key for that language tag", and a fallback chain is the caller's choice.

2026-11-22 The display name follows Android's DisplayNameSources
----------------------------------------------------------------

The plan had `cardDisplayName` fall back from the name to the
organization, the first email, the first phone, "as AOSP does". AOSP does
otherwise: `ContactsContract.DisplayNameSources` ranks the structured name
(40), the phonetic name (37), the nickname (35), the organization (30),
the phone (20) and the email (10), read in
`aosp-mirror/platform_frameworks_base` on 2026-11-22. The function now
follows that order, the phonetic name left out (a JSContact component has
no phonetic without a value), since its only purpose is a list that reads
like the phone's. For an organization Android takes the company, else the
job title, never the department (`updateRawContactDisplayName` in the
ContactsProvider's `ContactsDatabaseHelper`): hence the name of an
Organization, then a Title of kind `title`, and no unit; `ROLE` is not
imported by Android at all. Among several nicknames, phones or emails the
lowest `pref` wins. Components in no stated order are read in Western
order by kind; Android picks an order by script for CJK names, which is
not done: a phone export carries `FN`, so `name.full` is there.

2026-11-22 normalizeCard reads a property table; maps keep their order
----------------------------------------------------------------------

"Stable key order" needs to tell a property from a map key (an Id may be
`name` or `kind`), and "strip empty maps" a map from an object that may be
empty (`relatedTo: { uid: {} }` is a relation, a vendor value of `{}`
must be kept). Both need the type of each object, so `schema.ts` lists
the properties of the 28 object types in the order RFC 9553 defines them,
with the shape of each value; a test compares it with the registry
fixture, and the validator of checkpoint 3 extends it instead of writing
a second table. The export order is that table, with two additions:
properties this version does not know follow by name, and a Card's
`media` goes last, as PHOTO does in a `.vcf`, a picture being one very
long line. Map entries, sets and arrays keep their order: an Id map is in
the order the phone listed its phones, and `p10` sorted before `p2` reads
worse than no sorting. The cold review found that stripping an empty map
broke a localization patch landing in it (`titles: {}` with a patch on
`titles/t1`): a Card that has patches keeps all its empty maps, a blunt
rule preferred to following every pointer for a case no phone produces.
Leaving out an empty map reports no issue: it holds nothing, so there is
nothing changed or lost to show. Localization patches are copied as
written; their values are data for another object and ordering them
would need the table walked along each pointer, for a feature no phone
export uses.

2026-11-22 The validator checks the types, not RFC conformance
--------------------------------------------------------------

Decided before checkpoint 3 was started. JSContact is this project's
internal model, not an input format of its own: a Card comes from our
converter, from our editor or from a backup we wrote, and what the user
brings is vCard. `validateCard` therefore answers one question, the same
for its three callers (the converter on its result, the editor on Save,
the JSON reader): would our code misread this value? It is the runtime
form of `types.ts`: the JSON type of every known property, the mandatory
ones, `@type`, `version`, sets holding `true`, the Id alphabet, the shape
of `vCardProps`, `vCardParams` and `localizations`, and the caps against
hostile input. Every issue is an `error`. Everything else the RFC calls
invalid (unknown and miscased names, enum values, reserved names, formats,
ranges, calendar validity, every rule between properties) is accepted,
kept and written back. The reason is the backup: a strict reader would
also refuse what a hand, another tool or an older version of this one
wrote slightly wrong, for a rule nothing here depends on. Formats and
ranges belong to who can act on them: the converter reports the vCard
value it cannot read, the editor's field checks stop new ones, an export
profile reports what the phone will not take. Patches are not applied by
the validator either, so a broken translation does not cost the contact:
`localize` reports it, and its caller validates the Card it returns.
`docs/jscontact-constraints.md` stays as the record of every RFC rule,
with a `Checked` column that a test will hold the validator to. This
narrows the plan of 2026-11-18 and replaces two things in it: the
`warning` tier of the validator, so the entry of 2026-11-20 on enum values
now reads "kept, and not reported" (its reasoning stands), and the
agreement with `@sdxc/jscontact` on accept or reject, which is dropped:
the oracle answers what the RFC calls valid, and stays for patches and
localizations. The price: `validateCard` on the converter's output no
longer catches a converter writing an impossible date or an empty Name;
the converter's own tests must. If the package is ever meant as a
general JSContact library for Cards from anywhere, full validation with
severities is the feature to add back, and the checklist is its work list.

2026-11-22 JSON Schema with ajv was tried and not taken
-------------------------------------------------------

With the narrower validator, a hand-written JSON Schema run by `ajv` was
looked at again, the rule on dependencies being a limit and not a ban: a
well-known, stable library is acceptable where it fits the workflow.
Measured on `ajv` 8.20.0 with a small JSContact-like schema: compiling at
runtime is out, since `ajv` builds its validators with `new Function` and
the app's CSP (`default-src 'self'`, no `unsafe-eval`) forbids it, which
would pass in Vitest and in `pnpm dev` and fail only on the deployed
site. Its standalone build works as a dev-time step: the output is one ES
module without `eval` and without imports, and it validated the sample
Cards. Two keywords break that: `minLength` and `uniqueItems` make the
"ESM" output `require` helpers from `ajv/dist/runtime`, which no browser
resolves (`pattern` replaces the first). The cost would be a generator
script, a generated module checked into `src` (the workspace resolves the
libraries from source, without a build), about 30 KB of code for five
object types, and messages by keyword (three for one empty Name: two
`required`, one `anyOf`). Not taken, for a reason that has nothing to do
with `ajv`: `schema.ts` already lists every object type and its
properties, tested against the registry, and what is left to check is a
JSON type and a mandatory flag per property, a short walk over that
table. A JSON Schema would be a third description of the same shapes
beside `types.ts` and `schema.ts`, and about ten rows of the checklist
cannot be written in one anyway (a patch resolving in its Card,
neighbours in an array, registries that `Intl` knows). To reopen if a
JSON Schema document becomes something to publish, in which case it is
generated from the table, or if full RFC validation comes back.

2026-11-22 A JSON backup says which format wrote it
---------------------------------------------------

Each Card of a JSON backup carries `remileduc.github.io:formatVersion`, a
positive integer that starts at 1 and is raised only when what we write
changes shape, not with each release. It answers "what if an earlier
version exported something wrong": the reader runs the migrations from
the stamped format to the current one, each a function from one format
to the next and written when the first change happens, then the one
current validator. Keeping an old validator per format was the other
idea and was dropped: accepting an old file does not make the converter
and the UI of today read it, a migration does. A vendor property and not
`prodId`: `prodId` holds the phone's `PRODID` after an import, and a
product name with a version would make migrations follow releases. A
property of each Card and not a wrapper around the array: the file stays
a list of Cards another tool reads. It is written by `stringifyCards`
and removed by `parseJSContact`, so it is a property of the file: a Card
in memory or in the store never has it, and no export profile reports it
as a vendor property it cannot write. A Card without a stamp is read as
the current format, one stamped by a later version is validated as it
stands with a `warning`, and the stamp never replaces validation. It has
to be there from the first release, which is why it is decided now and
implemented with the reader and the writer in checkpoint 3. How the
store migrates its own Cards is left to M6, with the same functions.

2026-11-22 What the validator and the backup reader settled on the way
----------------------------------------------------------------------

Choices of checkpoint 3 the plan left open. The mandatory properties are
a list beside the property table (`MANDATORY` in `schema.ts`), not a flag
in it: Calendar, CryptoKey, Directory, Link and Media share one list of
properties and differ on whether `kind` is required. The Nickname kind of
this project is in the table, so it is checked as a string and
`normalizeCard` writes it after `pref`: `types.ts` declares it, and it is
read as any enumerated property is. The caps and `__proto__` are looked
for in the whole value before the types are, vendor values and patches
included, because what makes a deep value dangerous is not our reading
of it but `JSON.stringify` and `structuredClone` later on; 64 levels is
eight times what the types need, and 100 000 members is a group Card of
that many contacts, far past any phone. The same pass refuses what is
no JSON value, wherever it is (`value-not-json`): `undefined`, a hole in
an array, `NaN`, an infinity, a bigint, a function. The review of the
checkpoint found why it has to: `1e999` is valid JSON text that
`JSON.parse` reads as `Infinity`, the export wrote it back as `null`,
and the next import refused the jCard property and with it the contact;
a hole made the walk over the types throw. For `undefined` in a known
property the reason is the one `exactOptionalPropertyTypes` has at
compile time: the store keeps it and the JSON export drops it, so two
copies of one Card stop being equal. Such a value ends the validation
before the types, so it is reported once. Objects that are no plain
ones (a Date, a Map) are not told apart: only code of ours could put
one in a Card. A `vCardProps` entry that is
wrong gets one issue for the entry, not one per part: nobody repairs a
jCard property by hand. `parseJSContact` changes nothing it is given
(the app may hand it a value it still shows), so a stamped or "1.0" Card
comes back as a copy one level deep, and the issues of a file share one
cap per code: a file of a million `null` gives a thousand issues and a
warning. A member name written twice in the JSON text is not detected:
`JSON.parse` keeps the last, and finding it would take a parser of our
own for a file no tool of ours writes. No migration code exists at
format 1, only the stamp check and the place they will run from:
machinery for a format 2 nobody has designed would be a guess. And
`stringifyCards` ends the text with a line feed, as a text file does.

2026-11-22 What the review of the backup reader changed, and what it left
-------------------------------------------------------------------------

Four findings of the review of checkpoint 3 were fixed, with other
tools' files in mind more than hostile ones. `parseJSContact` returns
`refused`, the count of the Cards it left out: a file where every Card
has the same fault, which is what a tool writing something we refuse
produces, passes the cap of 1000 issues per code and the Cards after it
were named nowhere. A count and not the indexes: it says what the UI
has to say and cannot grow with the input. The cap on the text became
an option (`maxTextLength`, 64 Mi by default) since `stringifyCards` has
none and a store filled by two imports can write more than one import
may read; the app picks the cap for its own backups, the writer stays a
function that returns text. A byte order mark before the text is
skipped: an editor adds one and `JSON.parse` refuses it. And a member
name is capped at 1024 code units (`MAX_KEY_LENGTH`), reported as
`card-too-large` and not under a code of its own: the path of every
issue under a name repeats it, so one name of 30 MB gave a thousand
paths of 30 MB each. Left as they are, being what only code can build
or what costs more than it is worth: no cap on the number of
candidates (a 64 Mi text of `[0,0,...]` takes seconds, not memory),
bytes given in place of text, a mandatory property that is not
enumerable, a getter that throws, and the `issues-truncated` warning
that shows twice when one Card alone passes the cap of a code.

2026-11-23 Review of the vcard package: the writer reports, the reader caps and warns
-------------------------------------------------------------------------------------

A review of package 1 before M4 found seven things. They were fixed with
files written by other tools in mind more than hostile ones, and the
choices are these. The writer no longer throws on a model:
`TEL;a_b=1:3`, a group `it_em`, a quoted-printable `=0D=0A` in an `X-`
value and a control character the normaliser itself moved into `SORT-AS`
all parsed and upgraded without an issue and then aborted the export of
every card. A
property no line can hold is now left out and reported as an `error`
(`property-not-written`), which supersedes the `SerializeError` sentences
of 2026-11-09 and 2026-11-17: the class is internal and no longer
exported, only bad options throw (`RangeError`), and `convert` needs no
validator of its own for `vCardProps`. Two of those cases keep their
property instead: a real line break in a raw `unknown` value is written
as `\n` (only decoded quoted-printable puts one there), and the 4.0 table
drops a parameter value with a control character with a warning
(`param-value-not-in-40`) as the 3.0 table already did, because losing an
N for its SORT-AS is worse than losing the SORT-AS. An odd parameter or
group name still costs the whole property: dropping only the parameter
was considered and left out as code for names no known tool writes. The
3.0 table writes `UID` as text and a plain `geo:` URI as `GEO:lat;lon`,
the inverse of the normaliser like inline media, so 3.0 → upgrade → 3.0
no longer gains `VALUE=uri`; `SORT-AS` is still dropped with a warning,
since a `SORT-STRING` line is a property to add and that is a profile's
choice. The reader gets a third cap, `maxContentLines` (500 000 unfolded
lines, an option): a line costs about a kilobyte of model whatever its
length, 4 MiB of `A:` lines took 1.1 GB and 24 MiB ran out of heap. Past
the cap nothing is parsed, like `maxInputBytes`, rather than a card
passing as complete when it was cut; 500 000 is some 50 000 contacts.
Three silent damages are reported or repaired: a BOM right before a card
delimiter (two files joined into one) is stripped instead of hiding the
BEGIN; an indented line with nothing to continue is still read as a line
of its own, as AOSP does, but with a warning (`orphan-continuation`);
and CHARSET applies to quoted-printable and base64 values of text input
too, since what they decode to is bytes whatever the file was (Shift_JIS
came out as mojibake split on a `\` that was half a character). The
escaped-colon repair used a regex that was quadratic on a run of
backslashes; a lookbehind makes it linear. On Apple input a legacy IM
line (`X-AIM`) is dropped, with the label it alone carried, when an IMPP
of the card holds the same account (`legacy-im-duplicate`): iOS writes
MSN, AIM, Yahoo, ICQ and Jabber both ways. The match is on service and
handle, or on scheme when the IMPP names no service, never on the URI
alone, because Apple writes ICQ as `aim:` and an AIM and an ICQ account
may share a handle. The `_$!<Other>!$_` label becomes `TYPE=other`, the
form Apple's own `type=OTHER` on TEL and ADR already had, instead of
being dropped; whether a profile writes it back is its call. Last, the
normaliser was quadratic inside one group (20 000 `item1.TEL` with
labels took 33 s) and across LABEL lines sharing a TYPE set: a group's
members, label and first ADR are now indexed once. Apple writes one
label per group; a group with several non-empty ones has none
interpreted and all stay as written. Reading only the first was tried
and broke idempotence: the first is consumed, so a second pass reads the
next. That shape is hostile only, but the plan promised linear time and
the fix was smaller than the caveat.

A second review of the same change, same day, with the same yardstick.
Fixed: the label rule above; a dropped legacy IM line now leaves its
TYPE and PREF on the IMPP that stays and the `legacy-im-duplicate` info
names the label dropped with it; the 3.0 `GEO:lat;lon` takes its digits
from the `geo:` URI rather than from the parsed numbers (`37.380` came
back as `37.38`); a line of spaces and tabs gets no
`orphan-continuation` on top of the lexer's `invalid-line`; the names
and TYPE values quoted by `property-not-written` go through `excerpt`.
Left as is, because no exporting tool writes the shape and the fix is
more code than the caveat: a BOM in the middle of a line (two BOM files
joined when the first has no final newline), a control character in one
value of a multi-valued `SORT-AS` shifting the others, a raw `unknown`
value with a backslash right before a real line break, the warnings a
property filed before it was left out, and a `cards` array holding
something that is not a card, which is a `TypeError`: "never throws on
a model" means the properties of a card.

2026-11-23 Review of the jscontact package: seven findings, by the same yardstick
---------------------------------------------------------------------------------

Most input is written by other tools, so a finding was fixed when the
fix is a few lines and left when only code or a hostile file gets there.
Fixed: `LocalizeResult.card` is typed `Record<string, unknown> | null`,
no longer `Card | null`, since a patch a valid Card carries can set any
value anywhere and `cardDisplayName` threw on the result; the type now
sends the caller through `validateCard`, which the contract already
asked for. `cardDisplayName` reads separators alone as no name (it showed
`-`) and no `pref` as the least preferred whatever the other numbers
are (a `pref` of 500, which the validator does not range-check, ranked
below none). `nextId` refuses a prefix that is empty or starts with a
digit: an object lists digit-only keys in numeric order, before the
others. `stringifyCards` writes version "2.0", so a "1.0" Card built in
code is written as the reader would have returned it. `maxTextLength`
takes `Infinity` for no cap, and `DEFAULT_MAX_TEXT_LENGTH` is exported.
"Structured diff" is gone from the descriptions until M4.5 writes it.

Two reverse what the entry of 2026-11-22 left. Bytes given in place of
text are decoded as UTF-8 (strictly: bytes that are not UTF-8 are
`json-syntax`) and capped by their length first: read as a Card, a
`Uint8Array` of 32 MB cost 1.4 GB before `card-too-large`, and passing
what `file.arrayBuffer()` returned is a mistake the `unknown` parameter
invites. And the cap on a member name (`MAX_KEY_LENGTH`) became a cap on
the JSON Pointer to a member (`MAX_PATH_LENGTH`, still 1024, still
`card-too-large`): 64 levels of names of 1024 gave paths of 65 kB, and a
thousand issues per code under them 61 MB from 68 kB of JSON. A path of
a real Card stays under 300.

Left: `nextId` still scans from 1, so filling a map through it is
quadratic (5 000 Ids, about a second); it serves the editor and the
merge, one entry at a time, and the converter has its own allocator.
`validateCard` given a typed array directly, or a Card holding one, still
walks its indexes: only code can build that, `JSON.parse` cannot.

2026-11-24 Review of the staged jscontact fixes: three more, by the same yardstick
----------------------------------------------------------------------------------

Same yardstick. Fixed, each in a line or two: `validateCard` compares
the length of a member name with `MAX_PATH_LENGTH` before it escapes
it (the path cap of 2026-11-23 escaped first, so one name of 30 MB took
2.5 s where the name cap took 50 ms); `parseJSContact` reads the length
of its bytes inside its `try`, a `DataView` on a detached buffer being
the one view whose `byteLength` throws (`json-syntax`); and its decoder
has `ignoreBOM`, as those of the vCard reader have, so one byte order
mark is skipped from bytes as from text, not two.

Left. `applyPatchObject` still types its copy as the target: it patches
any object, has no validator to send the caller to, and `PatchResult`
says so; `localize`, which only takes Cards, is the one that changed.
`cardDisplayName` shows the separators around a blank component of an
ordered Name (`John  Doe`, `, John`): dropping them contradicts "a
separator is verbatim, even first", and no tool writes a blank component
between separators. `stringifyCards` sets "2.0" without an issue: it
returns text, and with two versions accepted the only rewrite is the one
the reader reports; a third version has to revisit it. A raw
`SharedArrayBuffer` or an `ArrayBuffer` of another realm is read as a
Card, not as bytes; bytes too many for the engine to decode under
`maxTextLength: Infinity` are `json-syntax`; and a cap sized from the
text refuses the same text as bytes, the cap being in the unit of the
input, as the option says.

2026-11-24 One meaning for `card`, one naming for both libraries, a vendor label
--------------------------------------------------------------------------------

Four findings about the shape of the two APIs rather than about input,
fixed before a first release makes them a major one. `CardIssue.card`
was the position of the Card in the input while vcard's `Issue.card`
indexes the returned cards, so `cards[issue.card]` was right in one
package and silently wrong in the other as soon as a Card was refused.
`card` now means the same in both, an index in the `cards` returned,
set when the Card was kept; the position in the input, which a refused
Card needs, is a second field, `input`. Renamed, to read alike in an app
that imports both: `parseJSContact` and `stringifyCards` are
`parseCards` and `serializeCards`, beside `parseVCards` and
`serializeVCards` (their types `ParseCardsOptions` and
`ParseCardsResult`); `equal` is `jsonEqual`, which says what it
compares where it is imported; the code `type-mismatch` is
`at-type-mismatch`, since it is about `@type` and stood next to
`property-wrong-type`, which is about the JSON type. Earlier entries of
this log keep the old names. Address, Anniversary, Nickname and Relation
have no `label` in RFC 9553 and a phone labels all four (Android
`ADR;TYPE=X-Chalet`, its custom nickname and relation, Apple
`X-ABLabel`), so they declare one vendor property,
`remileduc.github.io:label` (`VENDOR_LABEL`), a string in the property
table like the Nickname kind: one property and not `vCardParams`, so the
editor shows and edits a label the same way wherever it is, and M4 has
its target; this closes what checkpoint 1 of M3 left to M4. Whether an
Android custom event becomes an Anniversary with that label stays M4's.
And the writer's issues carry `propertyIndex`, the index of the property
in `card.properties`: a card the converter builds has no `line`, so
three `TEL` losing their `PREF` gave three identical warnings. An index
and not a change to `property`: `group.NAME` stays what `propertyId`
gives, and the parser and the normaliser, which have the line, set none.
The promise of 2026-11-23 is worded as what it covers: the writer never
throws on a property, and a value whose kind gives no text (`uri` or
`language-tag` without `value`, a kind the model does not have) is now
`property-not-written` instead of the text `undefined`. A card that is
no object with a `properties` array still throws: no tool writes one,
and reporting it would take an issue code that nothing else needs.
