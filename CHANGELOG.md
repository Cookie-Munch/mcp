# Changelog: @cookiemunch/mcp

Every published release, newest first. Dates are the day the version was cut. Each release tracks the same-numbered `@cookiemunch/sdk`.

## 0.4.1 (2026-10-22)

- Added: `apply_cookie_preset` takes `referally` (`cookieDomain`, `cookieDays`, `category`).
- Added: requests send `User-Agent: cookiemunch-mcp/<version>`.

## 0.4.0 (2026-10-19)

- Added: tools for site PATCH, integration health, `provision` and partner links.
- Added: executor preset and canary tools; declaration preset tools and observed-cookie removal.

## 0.3.0 (2026-10-15)

- Added: `retire_cookie` and `unretire_cookie`; `scan_site` can wait for the result, including a scan already running.

## 0.2.0 (2026-10-15)

- Added: executor webhook test and delivery log with dry runs.
- Added: `purposes` and `dryRun` on declared cookies; rights-page identity tools.
- Fixed: design-warning headers say what happened; notices are not blamed on Accept.

## 0.1.2 (2026-10-15)

- Changed: the package builds standalone from its public repository and is published with npm provenance.

## 0.1.1 (2026-10-14)

- Added: tools to declare, bulk-declare and undeclare cookies and to apply an import.
- Added: `preview_site_config` (dry run) and design warnings leading every config tool result.
- Added: rights-page tools (read, write, preview, publish, versions, rollback) and custom-domain tools.

## 0.1.0 (2026-10-14)

- First release: the Developer API as MCP tools (`whoami`, sites, config, consent stats and log, DSAR, vendors, RoPA).
