@vcards-io/vcard
================

Tolerant vCard 2.1 / 3.0 / 4.0 reader into an ordered, lossless property
model, a normaliser that lifts any card to vCard 4.0 semantics, and a
writer for 3.0 and 4.0 that targets what phones actually import. Vanilla
TypeScript, ES2025, no runtime dependency. Part of
[vcards-io](https://github.com/remileduc/vcards-io); the full
specification is `docs/plan.md` at the repository root.

Usage
-----

```ts
import { parseVCards, serializeVCards, upgradeTo40 } from "@vcards-io/vcard";

// Bytes or text in, any version, mixed files allowed. Never throws on input.
const { cards, issues } = parseVCards(await file.bytes());

// Lift 2.1 / 3.0 (and vendor dialects) to 4.0 semantics; pure, idempotent.
const upgraded = cards.map((card) => upgradeTo40(card).card);

// Write back as 3.0 for a phone (warnings say what 3.0 dropped), or 4.0 as the lossless form.
const { text: forAndroid, issues: lost } = serializeVCards(upgraded, { version: "3.0" });
const archive = serializeVCards(upgraded, { version: "4.0" }).text;
```

Every step reports what it changed as `Issue` objects (`error`, `warning`
or `info`) so a UI can show them; nothing is dropped silently.

The model
---------

```ts
interface VCard     { version: "2.1" | "3.0" | "4.0"; properties: VProperty[] }  // source order kept
interface VProperty { group: string | null; name: string; params: Map<string, string[]>; value: VValue; line?: number }
```

Names and parameter names are uppercased, groups lowercased. A value is
typed (`text`, `text-list`, `structured`, `uri`, `date-and-or-time`,
`timestamp`, `utc-offset`, `language-tag`, `integer`, `float`, `boolean`,
`binary`) from the `VALUE` parameter or the property registry, or kept as
`unknown` raw text when it cannot be. Text is unescaped exactly once, at
the typed-value stage.

Pipeline
--------

| Stage              | Input            | Output                              |
| ------------------ | ---------------- | ----------------------------------- |
| `parseVCards`      | bytes or string  | `VCard[]` (any version) + issues    |
| `upgradeTo40`      | one `VCard`      | the same card in 4.0 semantics      |
| `serializeVCards`  | `VCard[]`        | vCard 3.0 or 4.0 text               |

The parser handles BOMs and UTF-16, quoted-printable, inline base64,
charset parameters, 2.1 bare parameters, folding of every flavour and
hostile sizes (caps are reported as issues). The normaliser applies the
standard rules (`TYPE=pref` to `PREF=1`, inline binary to `data:` URIs,
`LABEL` to the `ADR` parameter, `GEO` to `geo:`, ...) and then the
Android, Apple and Google vendor rules (`X-ANDROID-CUSTOM`, `X-ABLabel`
groups, `X-ABDATE`, `X-SOCIALPROFILE`, legacy `X-AIM` style IM, ...).

Writer
------

`serializeVCards(cards, { version, foldAt? })` returns `{ text, issues }`:
`BEGIN:VCARD`, `VERSION`, the properties in model order, `END:VCARD`.
CRLF, raw UTF-8, no BOM, no `CHARSET`, never quoted-printable, lines
folded at 75 octets without splitting a UTF-8 sequence or an escape.
Properties are written in the order the model holds them: whoever builds
the card decides the order. `issues` holds one `warning` per loss the
version forced, each with the `card` index and the `group.NAME`; 4.0
never raises one.

| Version | Syntax                                                                     |
| ------- | -------------------------------------------------------------------------- |
| 4.0     | RFC 6350: parameters as given, caret-encoded and quoted when needed, comma |
|         | lists, basic ISO dates, `data:` URIs for media. A `binary` value is an     |
|         | error: run `upgradeTo40` first.                                            |
| 3.0     | RFC 2426 as the phones read it: `TYPE=A;TYPE=B` repeated and uppercased    |
|         | (`X-` labels keep their case), `PREF=1` as a last `TYPE=PREF`, inline      |
|         | base64 with `ENCODING=b;TYPE=JPEG` (a `data:` URI on PHOTO/LOGO/SOUND/KEY  |
|         | is decoded back), exactly 5 `N` and 7 `ADR` components, extended ISO       |
|         | dates. Only `TYPE`, `VALUE`, `LANGUAGE`, `CALSCALE` and `X-` parameters    |
|         | are written. Dropped and reported as a warning: every other 4.0 parameter  |
|         | (`param-not-in-30`), a value with a quote or a control character           |
|         | (`param-value-not-in-30`), any `PREF` but 1 (`pref-not-in-30`), a          |
|         | non-empty extra `N`/`ADR` component (`components-not-in-30`).              |

The `VALUE` parameter is derived from the value kind and written first:
absent when the kind is the property's default in that version, set
otherwise (`VALUE=binary` appears only on a text property, where readers
would otherwise take the base64 as a transfer encoding). The input is a card in 4.0 semantics: run
`upgradeTo40` on anything parsed, or a 2.1 card's escapes are doubled.
Names, groups and parameter keys are normalised before writing; `version`
and `foldAt` are validated with a `RangeError`. Lines always end in CRLF,
as both RFCs require.

`SerializeError` is thrown for what no version can express: a `binary`
value in 4.0, a control character a 4.0 parameter cannot caret-encode, a
`TYPE` value holding a comma (readers split it even when quoted), a date
shape outside the grammar, a property or parameter name outside
`[A-Za-z0-9-]`, `BEGIN`/`END` as a property, or a line break the escaping
cannot absorb. It carries the card index and the `group.NAME`. These are
defects of the caller's model, never of input that went through the parser
and the normaliser, with two exceptions the caller must filter: a property
whose name the parser flagged as invalid, and a bare `END:` line kept as a
property.

Utilities
---------

Also exported: `escapeText` / `unescapeText` / `splitEscaped`, `foldLine` /
`unfoldLines`, `caretEncode` / `caretDecode`, `encodeBase64` /
`decodeBase64`, `encodeQuotedPrintable` / `decodeQuotedPrintable`, the
date, timestamp and UTC offset parsers and formatters, `parseDataUri` /
`buildDataUri`, `parseTelUri`, `parseGeoUri`, `guessImageType`,
`PROPERTY_REGISTRY` with `defaultValueKind` / `nearestValueKind` /
`VALUE_TOKENS`, the media type word tables and the relation table
`RELATION_TYPES`.
