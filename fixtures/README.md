Fixtures
========

Real-world and specification vCard samples used by the golden tests. Every
file under `fixtures/**/*.vcf` must parse with zero `error` issues, and its
reviewed `.model.json` / `.jscontact.json` snapshots live next to it.

| Folder     | Content                                                     |
|------------|-------------------------------------------------------------|
| `rfc/`     | Examples lifted from RFC 2426, 6350, 9554, 9555 (added in M1)|
| `android/` | AOSP-style 2.1 exports (stock / Google / Samsung Contacts)  |
| `apple/`   | iOS / macOS Contacts 3.0 exports                            |
| `google/`  | contacts.google.com "vCard for iOS" 3.0 exports             |
| `other/`   | Outlook, Thunderbird, Nextcloud, DAVx5, Fossify, ...        |

Files prefixed `cozy-` come from the cozy/cozy-vcard test suite
(Copyright 2012 Cozy Cloud, MIT/X11 licence, see `COZY-LICENSE`).

Add your own anonymised exports with a short prefix naming the source and
the OS version, e.g. `pixel8-android15.vcf`. Strip photos you do not want
in the repository; a tiny 1x1 JPEG is enough to exercise the code paths.
