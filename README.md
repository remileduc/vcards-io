vcards-io
=========

[![CI][ci-badge]][ci]
[![Coverage][coverage-badge]][ci]
[![App][app-badge]][app]
[![Network][network-badge]][csp]
[![Licence][licence-badge]](LICENSE)

Offline, browser-only tool to back up phone contacts to a `.vcf` file,
inspect and edit them, and restore them on another phone. Built on
JSContact (RFC 9553) with reusable libraries:

| Package                | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `@vcards-io/vcard`     | tolerant vCard 2.1 / 3.0 / 4.0 reader, 4.0 normaliser,       |
|                        | 3.0 / 4.0 writer                                             |
| `@vcards-io/jscontact` | JSContact 2.0 types, validator, pointer/patch, JSON backup   |
| `@vcards-io/convert`   | vCard <-> JSContact (RFC 9555) and the Android / Apple / RFC |
|                        | export profiles                                              |
| `apps/web`             | the Vite + Lit web app                                       |

Status: milestones 0 to 3 are done: `@vcards-io/vcard` reads, normalises
and writes, and `@vcards-io/jscontact` has the types, the validator, the
patches and the JSON backup format. Milestone 4 (`@vcards-io/convert`,
vCard to JSContact) is next. The specification, architecture and
milestones are in `docs/plan.md`; device behaviour in `docs/interop.md`;
decisions in `docs/decisions.md`.

Specifications
--------------

Everything the libraries read or write is defined in these documents. Where
the Android and Apple importers disagree with them, `docs/interop.md` wins
for the `android` and `apple` export profiles. The examples embedded in the
RFCs are test fixtures under `fixtures/rfc/`.

vCard 2.1 predates the IETF work and is not an RFC: [vCard: The Electronic
Business Card, Version 2.1][vcard21] (versit Consortium, 18 September 1996),
historically published by the Internet Mail Consortium. The later versions:

| RFC                 | Title                                                              | Used for                                                |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| [RFC 2425][rfc2425] | A MIME Content-Type for Directory Information                      | 3.0 content lines and folding                           |
| [RFC 2426][rfc2426] | vCard MIME Directory Profile                                       | vCard 3.0                                               |
| [RFC 6350][rfc6350] | vCard Format Specification                                         | vCard 4.0, the internal model                           |
| [RFC 6868][rfc6868] | Parameter Value Encoding in iCalendar and vCard                    | caret encoding of 4.0 parameters                        |
| [RFC 6473][rfc6473] | vCard KIND:application                                             | KIND values                                             |
| [RFC 6474][rfc6474] | vCard Format Extensions: Place of Birth, Place and Date of Death   | BIRTHPLACE, DEATHPLACE, DEATHDATE                       |
| [RFC 6715][rfc6715] | vCard Format Extensions: OMA Converged Address Book Extensions     | EXPERTISE, HOBBY, INTEREST, ORG-DIRECTORY               |
| [RFC 6869][rfc6869] | vCard KIND:device                                                  | KIND values                                             |
| [RFC 7852][rfc7852] | Additional Data Related to an Emergency Call                       | TEL TYPE main-number                                    |
| [RFC 8605][rfc8605] | vCard Format Extensions: ICANN Extensions for RDAP                 | CONTACT-URI, ADR CC parameter                           |
| [RFC 9554][rfc9554] | vCard Format Extensions for JSContact                              | CREATED, PRONOUNS, SOCIALPROFILE, PROP-ID, DERIVED, ... |

JSContact:

| RFC                 | Title                                                              | Used for                                                |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| [RFC 9553][rfc9553] | JSContact: A JSON Representation of Contact Data                   | the internal and persisted format                       |
| [RFC 9982][rfc9982] | JSContact Version 2.0: A JSON Representation of Contact Data       | optional uid, JSCOMPS registration                      |
| [RFC 9555][rfc9555] | JSContact: Converting from and to vCard                            | `@vcards-io/convert`, both directions                   |
| [RFC 7095][rfc7095] | jCard: The JSON Format for vCard                                   | encoding of `vCardProps`                                |

Supporting formats:

| RFC                 | Title                                                              | Used for                                                |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| [RFC 2045][rfc2045] | Multipurpose Internet Mail Extensions (MIME) Part One              | quoted-printable, read only (2.1, tolerated in 3.0)     |
| [RFC 2397][rfc2397] | The "data" URL scheme                                              | inline photos in 4.0                                    |
| [RFC 3966][rfc3966] | The tel URI for Telephone Numbers                                  | TEL;VALUE=uri                                           |
| [RFC 5870][rfc5870] | A Uniform Resource Identifier for Geographic Locations ('geo' URI) | GEO in 4.0                                              |

[ci]: https://github.com/remileduc/vcards-io/actions/workflows/ci.yml
[ci-badge]: https://github.com/remileduc/vcards-io/actions/workflows/ci.yml/badge.svg?branch=main
[coverage-badge]: https://img.shields.io/endpoint?url=https%3A%2F%2Fremileduc.github.io%2Fvcards-io%2Fcoverage.json
[app]: https://remileduc.github.io/vcards-io/
[app-badge]: https://img.shields.io/badge/app-live-blue
[csp]: apps/web/vite.config.ts
[network-badge]: https://img.shields.io/badge/network-none-success
[licence-badge]: https://img.shields.io/github/license/remileduc/vcards-io

[vcard21]: https://web.archive.org/web/20160402232011/https://www.imc.org/pdi/vcard-21.rtf
[rfc2425]: https://www.rfc-editor.org/rfc/rfc2425
[rfc2426]: https://www.rfc-editor.org/rfc/rfc2426
[rfc6350]: https://www.rfc-editor.org/rfc/rfc6350
[rfc6868]: https://www.rfc-editor.org/rfc/rfc6868
[rfc6473]: https://www.rfc-editor.org/rfc/rfc6473
[rfc6474]: https://www.rfc-editor.org/rfc/rfc6474
[rfc6715]: https://www.rfc-editor.org/rfc/rfc6715
[rfc6869]: https://www.rfc-editor.org/rfc/rfc6869
[rfc7852]: https://www.rfc-editor.org/rfc/rfc7852
[rfc8605]: https://www.rfc-editor.org/rfc/rfc8605
[rfc9554]: https://www.rfc-editor.org/rfc/rfc9554
[rfc9553]: https://www.rfc-editor.org/rfc/rfc9553
[rfc9982]: https://www.rfc-editor.org/rfc/rfc9982
[rfc9555]: https://www.rfc-editor.org/rfc/rfc9555
[rfc7095]: https://www.rfc-editor.org/rfc/rfc7095
[rfc2045]: https://www.rfc-editor.org/rfc/rfc2045
[rfc2397]: https://www.rfc-editor.org/rfc/rfc2397
[rfc3966]: https://www.rfc-editor.org/rfc/rfc3966
[rfc5870]: https://www.rfc-editor.org/rfc/rfc5870

Development
-----------

Requires Node 24 or later and pnpm 12.

```
pnpm install
pnpm lint        # biome
pnpm typecheck   # tsc --noEmit in every package
pnpm test        # vitest
pnpm build       # libraries (tsc) then the app (vite)
pnpm dev         # vite dev server, http://localhost:5173/vcards-io/
pnpm preview     # serve the production build
pnpm repl        # node REPL
```

Licence: MIT.
