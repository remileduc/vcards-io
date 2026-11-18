Security policy
===============

vcards-io reads contact files from untrusted sources, entirely in the
browser. A crafted file that does anything worse than produce `Issue`
entries is a security bug and is handled as one.

Reporting a vulnerability
-------------------------

Report it privately through GitHub, with "Report a vulnerability" on the
repository's Security tab:

<https://github.com/remileduc/vcards-io/security/advisories/new>

Please do not open a public issue or pull request for it.

Include the affected package or the app, the version or commit, and the
smallest input that reproduces the problem. Anonymise real contact data
before sending it.

This is a personal project maintained on a best-effort basis: there is no
guaranteed response time and no bug bounty.

Supported versions
------------------

Fixes go to the latest release of each `@vcards-io/*` package and to the
deployed app (the `main` branch). Older releases are not patched.

Scope
-----

In scope:

- an input that hangs, crashes or exhausts memory in a library or the
  app, or gets past an input size cap;
- script or markup injection in the app from imported contact data;
- a URL from contact data that is followed or rendered as a link with a
  scheme outside the allow-list;
- any network request made by the built app, which is meant to make none.

Out of scope: problems that need a compromised browser, extension or
device, and findings in development-only tooling that do not affect the
published packages or the built app.
