# Security policy

## Supported versions

| Version | Supported                                      |
| ------- | ---------------------------------------------- |
| 2.x     | Yes, the current release series                |
| 0.x     | No: deprecated on npm and no longer maintained |

Fixes are released for the current 2.x series. If you use 0.x, please upgrade with the
[migration guide](docs/MIGRATION.md).

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for a vulnerability that has not
been disclosed.**

Report it privately through GitHub instead:
[report a vulnerability](https://github.com/ahlgren1234/react-elegant-toasts/security/advisories/new)
(the "Report a vulnerability" button on the repository's Security tab). Only the maintainer can see
the report.

These details help with the investigation:

- the affected package version, and your React version and framework;
- a description of the vulnerability and its impact;
- the steps or a minimal proof of concept that reproduce it;
- any suggested fix or mitigation.

## Disclosure

The intended approach is coordinated disclosure: the vulnerability is investigated privately, and,
where possible, an advisory is published together with a fix once one is available. This is a
volunteer-maintained project, so no response or resolution times are guaranteed, but every report is
taken seriously.

## Scope

The published package has no runtime dependencies. Findings in development dependencies that do
not affect the published package are handled as ordinary maintenance in public issues.
