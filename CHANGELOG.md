# Changelog: @cookiemunch/mcp

Every published release, newest first. Dates are the day the version was cut. Each release tracks the same-numbered `@cookiemunch/sdk`.

## 0.8.0 (2026-10-30)

- Added: `connect_dsar_executor` takes `mintFrom` and `externalId`; `secretKey` is optional. Built on `@cookiemunch/sdk` 0.8.0.
- Added: `connect_identity_provider`: one-call connect for an identity provider's privacy orchestrator.

## 0.7.1 (2026-10-24)

- Changed: tool descriptions name each vendor's own embed manifest (`/.well-known/<product>-embed.json`); built on `@cookiemunch/sdk` 0.7.1.

## 0.7.0 (2026-10-24)

- Added: `get_sandbox`, `create_sandbox` (erasing a sandbox stays a person's `cookiemunch sandbox delete`), `list_api_versions`, `set_own_api_version`.
- Changed: built on `@cookiemunch/sdk` 0.7.0.

## 0.6.0 (2026-10-24)

- Added: `open_dsar_case`, `get_dsar_case`, `cancel_dsar_case`, `get_dsar_case_receipt`, `find_dsar_by_trace`, `get_dsar_settings`, `set_dsar_settings`, `get_subject_card`, `run_executor_conformance`, `roll_executor_completion_secret`. The grace period is opt-in for existing sites (they read `graceDays: 0` until set).
- Added: `get_dsar_executor`, `recheck_dsar_executor`, `list_dsar_executor_health_history`, `run_executor_conformance`, `roll_executor_completion_secret`, `get_subject_card`.
- Added: `get_own_key`, `vend_api_key`, `list_api_keys_standard`, `revoke_leaked_key`; `list_partner_links`, `create_partner_link`, `revoke_partner_link`; `get_resource_tags`, `update_resource_tags`.
- Added: `list_cookie_suggestions`, `declare_cookie_suggestions`, `import_cookie_manifest`, `get_embed_manifest`, `get_category_registry`, `get_site_brand`, `import_site_brand`, `get_consent_insights`, `get_entitlements`, `get_provision_env`.
- Added: `list_health_waivers`, `set_health_waiver`, `remove_health_waiver`, `get_audit_sink`, `set_audit_sink`, `remove_audit_sink`, `replay_webhook`.
- Changed: built on `@cookiemunch/sdk` 0.6.0.

## 0.5.0 (2026-10-23)

- Added: `get_org_controller`, `set_org_controller`, `remove_org_controller`.
- Added: `get_consent_sync_secret`, `rotate_consent_sync_secret`, `remove_consent_sync_secret`.
- Added: `mint_preference_center_token`.
- Changed: built on `@cookiemunch/sdk` 0.5.0.

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
