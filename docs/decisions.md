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
