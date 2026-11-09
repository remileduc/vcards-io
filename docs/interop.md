Interoperability reference
==========================

What the phone importers and exporters actually do, as established from
source (AOSP `com.android.vcard` and the Contacts app, 2026-11) and from
real export samples (Apple, Google). This is the de-facto specification
for the `android` and `apple` export profiles. Rows marked (unverified) come
from secondary sources or memory and must be confirmed on a device; update
this file after every device checklist run.

Android: import
---------------

Source: `ImportVCardActivity.java`, `ImportProcessor.java`,
`VCardParserImpl_V21/V30/V40.java`, `VCardEntry.java`, `VCardUtils.java`.

| Aspect              | Behaviour                                                              |
| ------------------- | ---------------------------------------------------------------------- |
| Versions            | Tries the 2.1 parser, then 3.0. `VERSION:4.0` → "unsupported", nothing |
|                     | imported. Exact string match: `VERSION: 3.0` fails. Mixed-version      |
|                     | files fail. Missing VERSION is read as 2.1.                            |
| Whole-file failures | Any `VCardException` in the pre-pass aborts everything: bad base64,    |
|                     | missing `END:VCARD`, nested vCard in AGENT (2.1), unknown parameter    |
|                     | name in 2.1, unknown ENCODING in 2.1, `LANGUAGE` not of form `xx-YY`   |
|                     | in 2.1.                                                                |
| 2.1 parameter names | Only TYPE, VALUE, ENCODING, CHARSET, LANGUAGE, X-* accepted. `PREF=1`, |
|                     | `LABEL=`, `SORT-AS=`, `PID=` throw. Bare words become TYPE.            |
| 3.0 parameter names | Unknown names stored and ignored. Quoted values honoured. Comma lists  |
|                     | split. In 2.1 `TYPE=CELL,VOICE` is one value (custom label).           |
| Property name case  | Compared case-sensitively after parsing: `tel:` and `fn:` are dropped. |
| Charset             | Stream read as ISO-8859-1, each value re-decoded with its CHARSET or   |
|                     | UTF-8. 2.1 parameter values are not re-decoded (non-ASCII labels get   |
|                     | mangled). A UTF-8 BOM makes the first `BEGIN:VCARD` unrecognised and   |
|                     | the first card is silently dropped.                                    |
| Encoding            | 7BIT, 8BIT, QUOTED-PRINTABLE, BASE64, B accepted in every version (the |
|                     | 2.1 set is reused). QP soft breaks joined. FN that looks like QP       |
|                     | without ENCODING is auto-decoded.                                      |
| Folding             | 2.1: continuation must start with a space (not tab); N/ADR/ORG lines   |
|                     | without `:` are joined; base64 continues until a blank line or a known |
|                     | property name. 3.0: RFC 2425 unfolding.                                |
| Line endings        | CRLF, LF, CR all fine. Lines starting with `#` ignored.                |
| Groups              | `item1.` prefix parsed and ignored. `X-ABLabel` dropped.               |
| Escaping            | 2.1: values not unescaped except inside list splitting. 3.0: `\n`→LF,  |
|                     | `\x`→x for any x, applied before `;` splitting.                        |
| De-duplication      | None. Importing twice creates every contact twice.                     |
| Photo               | Inline base64 only. `VALUE=URL` and `data:` URIs dropped. Each PHOTO   |
|                     | becomes a Photo row.                                                   |

Properties consumed by `VCardEntry`:

| Property                                | Stored as                                                      |
| --------------------------------------- | -------------------------------------------------------------- |
| FN (NAME if FN empty)                   | display name                                                   |
| N                                       | family;given;middle;prefix;suffix (first 5 only). SORT-AS →    |
|                                         | phonetic names                                                 |
| SORT-STRING                             | phonetic given name, only if no phonetic set                   |
| X-PHONETIC-FIRST/MIDDLE/LAST-NAME       | phonetic given/middle/family                                   |
| NICKNAME, X-NICKNAME                    | Nickname (default type). Comma list not split.                 |
| ADR                                     | pobox; street = c2 + " " + c1; city; region; postcode; country |
| EMAIL                                   | Email with TYPE/label, PREF → primary                          |
| ORG                                     | company = c0; department = c1..cn joined with spaces           |
| TITLE                                   | Organization.title. ROLE ignored.                              |
| PHOTO, LOGO                             | Photo (base64 only)                                            |
| TEL                                     | Phone (type mapping below). Number rewritten: keeps digits,    |
|                                         | `+` at index 0, `*`, `#`; `p`/`w` → pause/wait; letters,       |
|                                         | spaces and extensions removed; NANP formatting applied.        |
| X-SKYPE-PSTNNUMBER                      | Phone, type OTHER                                              |
| X-AIM, X-MSN, X-YAHOO, X-ICQ, X-JABBER, | Im with that protocol; type HOME/WORK else HOME. X-QQ and      |
| X-SKYPE-USERNAME, X-GOOGLE-TALK         | X-NETMEETING are NOT read (although exported).                 |
| NOTE                                    | Note, one row each                                             |
| URL                                     | Website, always type HOMEPAGE                                  |
| BDAY                                    | Event BIRTHDAY, raw string; last one wins                      |
| ANNIVERSARY                             | Event ANNIVERSARY, raw string; last one wins                   |
| IMPP                                    | Only `sip:` values → SipAddress. Others dropped.               |
| X-SIP                                   | SipAddress                                                     |
| X-ANDROID-CUSTOM                        | Raw data row (grammar below)                                   |
| Everything else                         | Dropped: CATEGORIES, UID, REV, PRODID, KIND, MEMBER, RELATED,  |
|                                         | GENDER, GEO, TZ, KEY, LABEL, CLASS, SOURCE, X-ABLabel, X-*     |

TEL TYPE mapping (`VCardUtils.getPhoneTypeFromStrings`, values uppercased):

| TYPE value                                | Phone type                                   |
| ----------------------------------------- | -------------------------------------------- |
| CELL                                      | MOBILE                                       |
| HOME, WORK, CAR, PAGER, ISDN, OTHER,      | the same                                     |
| CALLBACK, COMPANY-MAIN, RADIO, TTY-TDD,   |                                              |
| ASSISTANT                                 |                                              |
| VOICE                                     | OTHER                                        |
| FAX + HOME / WORK / none                  | FAX_HOME / FAX_WORK / OTHER_FAX              |
| none, with PREF                           | MAIN                                         |
| none                                      | OTHER                                        |
| anything else (MSG, MAIN, IPHONE, X-Foo…) | CUSTOM with that label, `X-` prefix stripped |
| PREF (case-sensitive, uppercase only)     | primary                                      |

EMAIL: PREF → primary; HOME, WORK, CELL → that type; `INTERNET` becomes a
custom label "INTERNET" (so never write it for Android); none → OTHER.
ADR: PREF, HOME, WORK; PARCEL/DOM/INTL ignored; other → custom label;
default HOME.

`X-ANDROID-CUSTOM` grammar:

```
X-ANDROID-CUSTOM:<mimetype>;<data1>;<data2>;...;<data15>
```

Field 0 is the MIME type, fields 1..15 map to `data1`..`data15`. Export
always writes all 15 slots. For the three exported types, `data1` = value,
`data2` = type number, `data3` = label (used when type = 0).

| MIME type                             | Type numbers                                            |
| ------------------------------------- | ------------------------------------------------------- |
| vnd.android.cursor.item/nickname      | 1 default, 2 other name, 3 maiden, 4 short, 5 initials, |
|                                       | 0 custom                                                |
| vnd.android.cursor.item/contact_event | 1 anniversary, 2 other, 3 birthday, 0 custom            |
| vnd.android.cursor.item/relation      | 1 assistant, 2 brother, 3 child, 4 domestic partner,    |
|                                       | 5 father, 6 friend, 7 manager, 8 mother, 9 parent,      |
|                                       | 10 partner, 11 referred by, 12 relative, 13 sister,     |
|                                       | 14 spouse, 0 custom                                     |

A `;` inside a value breaks field alignment on re-import (3.0 unescapes
`\;` before splitting). Any MIME type is inserted verbatim into the data
table, unvalidated.

Android: export (stock Contacts app)
------------------------------------

`VCardConfig.VCARD_TYPE_DEFAULT` = 2.1 generic + DEFACT + ANDROID flags.
One card per raw contact, CRLF, no separator between cards.

| Data         | Output                                                                      |
| ------------ | --------------------------------------------------------------------------- |
| N / FN       | `N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:` when non-ASCII; QP soft breaks |
|              | `=\r\n` every 67 chars, no indentation. Empty name → display name in the    |
|              | family slot.                                                                |
| Phonetic     | `X-PHONETIC-FIRST-NAME` etc. (3.0 also `SORT-STRING`)                       |
| TEL          | bare params: HOME, WORK, `HOME;FAX`, CELL, PAGER, VOICE (other), CAR,       |
|              | `WORK;PREF` (company main), ISDN, `PREF` (main), FAX, TLX, `WORK;CELL`,     |
|              | MSG (mms); custom → `X-<label>`; primary appends PREF. Numbers keep digits  |
|              | and `+` only. Duplicates dropped. No type at all → `TEL;:` (empty param).   |
| EMAIL        | PREF, HOME, WORK, CELL, `X-<label>`; none for OTHER. Never INTERNET.        |
| ADR          | `PREF`, HOME, WORK, `X-<label>`, `X-OTHER`; 7 components, ext slot empty    |
| ORG / TITLE  | `ORG:company;department`, `TITLE:`                                          |
| NICKNAME     | 2.1: `X-ANDROID-CUSTOM:.../nickname;…`; 3.0: `NICKNAME:`                    |
| Events       | one `BDAY:`; others as `X-ANDROID-CUSTOM:.../contact_event;…`. Never        |
|              | `ANNIVERSARY`, in any version.                                              |
| Relations    | `X-ANDROID-CUSTOM:.../relation;…`                                           |
| IM           | X-AIM, X-MSN, X-YAHOO, X-SKYPE-USERNAME, X-GOOGLE-TALK, X-ICQ, X-JABBER,    |
|              | X-QQ, X-NETMEETING with HOME/WORK/`X-<label>`/PREF                          |
| SIP          | 2.1 `X-SIP:`; 3.0 `IMPP:sip:`                                               |
| PHOTO        | 2.1 `PHOTO;ENCODING=BASE64;JPEG:`; 3.0 `PHOTO;ENCODING=B;TYPE=JPEG:`; 74    |
|              | chars then `\r\n ` + 73; followed by a blank line. Thumbnail blob only.     |
| NOTE, URL    | one per row, no params                                                      |
| Not exported | groups, starred, UID, REV, PRODID, website type, SIP type, extra birthdays  |

Apple Contacts (iOS / macOS)
----------------------------

Import: 3.0 fully supported; 2.1 (unverified); 4.0 unreliable (iCloud
rejects, iOS drops cards or fields).

| 4.0 feature in input                                | Result on Apple                                  |
| --------------------------------------------------- | ------------------------------------------------ |
| `PHOTO:data:image/jpeg;base64,…`                    | photo lost (especially with `\,`)                |
| `PHOTO;VALUE=URI:https://…`                         | ignored                                          |
| `MEDIATYPE=` / `PROP-ID=` on a 3.0 PHOTO            | whole card hidden                                |
| 7-component N / 18-component ADR with a fold in the | whole card dropped                               |
| empty tail                                          |                                                  |
| `BDAY:--MMDD`                                       | birthday dropped; needs `X-APPLE-OMIT-YEAR=1604` |
| `SOCIALPROFILE`, `ANNIVERSARY`, `RELATED`, `KIND`   | not Apple's names (uses X- equivalents)          |
| `CATEGORIES`                                        | ignored (unverified)                             |

Export dialect (verified from iOS 8 to 18 samples):

| Property     | Shape                                                             |
| ------------ | ----------------------------------------------------------------- |
| header       | `VERSION:3.0`, `PRODID:-//Apple Inc.//iOS 18.0.1//EN`, `N`,       |
|              | `FN`, no CHARSET, raw UTF-8                                       |
| EMAIL        | `EMAIL;type=INTERNET;type=HOME;type=pref:` (lowercase, repeated)  |
| TEL          | `TEL;type=CELL;type=VOICE;type=pref`, `type=IPHONE`, `type=MAIN`, |
|              | `type=HOME;type=FAX`, `type=PAGER`, `type=OTHER;type=VOICE`       |
| custom label | `itemN.TEL:…` + `itemN.X-ABLabel:Custom`                          |
| ADR          | `itemN.ADR;type=HOME;type=pref:;;street;city;state;zip;country`   |
|              | + `itemN.X-ABADR:fr` (lowercase ISO code)                         |
| URL          | `itemN.URL;type=pref:` + `X-ABLabel:_$!<HomePage>!$_`             |
| BDAY         | `BDAY;value=date:1985-04-12`; yearless:                           |
|              | `BDAY;X-APPLE-OMIT-YEAR=1604:1604-04-15` (bare 1604 on old iOS)   |
| other dates  | `itemN.X-ABDATE;type=pref:2013-03-12` + `_$!<Anniversary>!$_`     |
|              | or `_$!<Other>!$_` or custom text                                 |
| relations    | `itemN.X-ABRELATEDNAMES;type=pref:Name` + label `_$!<Mother>!$_`, |
|              | Father, Parent, Brother, Sister, Child, Friend, Spouse,           |
|              | Partner, Assistant, Manager, Other, custom text                   |
| IM           | `itemN.IMPP;X-SERVICE-TYPE=Skype;type=pref:skype:user`,           |
|              | GoogleTalk→`xmpp:`, Yahoo→`ymsgr:`, QQ→`x-apple:`; legacy         |
|              | `itemN.X-MSN:` + `X-ABLabel:MSN` also emitted                     |
| social       | `X-SOCIALPROFILE;type=twitter;x-user=u:http://twitter.com/u`      |
| PHOTO        | `PHOTO;ENCODING=b;TYPE=JPEG:` folded at 75 with leading space;    |
|              | macOS may omit TYPE                                               |
| groups       | `X-ADDRESSBOOKSERVER-KIND:group` + `X-ADDRESSBOOKSERVER-MEMBER:`  |
|              | `urn:uuid:…`                                                      |
| misc         | `X-ABShowAs:COMPANY`, `X-ABUID`, `X-ACTIVITY-ALERT`, `X-ALTBDAY`, |
|              | `UID`, `REV`, `NICKNAME`, `NOTE`, `ORG:Company;Dept`, `TITLE`     |

Google Contacts
---------------

Web export "vCard for iOS Contacts" is 3.0 in the Apple dialect with
uppercase `TYPE=`: `FN` before `N`, no PRODID/UID/REV, `item1.EMAIL` +
`X-ABLabel` (Google types such as `GRAND_CENTRAL`, `BLOG`, `RELATIVE`
appear as labels; empty `X-ABLabel:` occurs), `ADR` sometimes with an 8th
component holding the formatted address, `PHOTO:https://lh3…` URL only,
`CATEGORIES:myContacts`, legacy IM `X-AIM`, `X-GTALK`, `X-SKYPE`, yearless
`BDAY:--1212`, `URL:http\://…` with an escaped colon.

Android app export (Settings → Export) is the AOSP 2.1 output above.

Other producers
---------------

| Producer                  | Format                                                              |
| ------------------------- | ------------------------------------------------------------------- |
| Outlook desktop           | 2.1, one contact per file, `LABEL;WORK;PREF;ENCODING=QUOTED-        |
|                           | PRINTABLE`, `X-MS-OL-*`, Windows-1252 (unverified)                  |
|                           | `X-WAB-GENDER:1` female, `2` male, `0` unset (unverified)           |
| Outlook.com / new Outlook | CSV only                                                            |
| Thunderbird 102+          | 4.0 (stores 4.0; reads 2.1/3.0, handles X-APPLE-OMIT-YEAR)          |
| Nextcloud (sabre)         | serves 3.0 by default; `VCardConverter` 4→3 rules worth copying     |
| DAVx5 / vcard4android     | 3.0 or 4.0; X-ABDATE/X-ABLABEL/X-ABRELATEDNAMES/X-SIP/X-PHONETIC-*, |
|                           | yearless as 1604 in 3.0                                             |
| Fossify Contacts          | 4.0 via ez-vcard, no X- properties, no relations                    |
| Samsung Contacts          | AOSP 2.1 output, groups lost                                        |

Device checklist
----------------

Run at milestone 5 and 7 with a real phone. Record results here.

| Check                                            | Android | Apple |
| ------------------------------------------------ | ------- | ----- |
| File imports without error                       |         |       |
| Name, prefix/suffix, phonetic                    |         |       |
| Every phone with the right type and primary flag |         |       |
| Custom phone/email labels                        |         |       |
| Emails, addresses with type and country          |         |       |
| Organisation, department, title                  |         |       |
| Nicknames (incl. maiden/short/initials)          |         |       |
| Birthday (with and without year), anniversary    |         |       |
| Relations with correct kind                      |         |       |
| IM accounts                                      |         |       |
| Photo                                            |         |       |
| Notes, websites                                  |         |       |
| Non-ASCII text (accents, CJK, emoji)             |         |       |
| 1000+ contacts file                              |         |       |
