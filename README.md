# @cookiemunch/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the
Cookie Munch Developer API (the `/v1` surface) as MCP tools, built on top of
[`@cookiemunch/sdk`](../sdk). Point an MCP client (Claude Desktop, Claude Code, …)
at it and an assistant can manage sites, read consent analytics, and drive privacy
operations on your behalf.

## How it authenticates

The server reads an API key from the environment and derives your organization from
it server-side — you never pass an `orgId`.

| Env var | Required | Default |
| --- | --- | --- |
| `COOKIEMUNCH_API_KEY` | yes | — |
| `COOKIEMUNCH_BASE_URL` | no | `https://api.cookiemunch.net` |

Generate a key from the dashboard (it looks like `fck_…`).

## Tools

| Tool | Description |
| --- | --- |
| `whoami` | Identity tied to the API key (orgId, plan, key prefix). |
| `list_sites` | List all sites (cbids) in your org. |
| `create_site` | Create a site (cbid auto-generated if omitted). |
| `get_site_config` | Get a site's banner/consent config. |
| `update_site_config` | Upsert (merge) a site's config. |
| `get_consent_stats` | Aggregated per-day consent statistics. |
| `get_consent_log` | Recent anonymised consent records. |
| `list_dsar` | List Data Subject Access Requests. |
| `create_dsar` | Open a new DSAR. |
| `advance_dsar` | Move a DSAR to a new status. |
| `list_vendors` | Vendors with computed risk scores. |
| `list_ropa` | Records of Processing Activities. |
| `get_rights_page`, `update_rights_page`, `patch_rights_page`, `preview_rights_page` | Read, replace, change or dry-run the hosted rights page draft. Pass `baseUpdatedAt` so a newer save is a conflict, not overwritten. |
| `publish_rights_page`, `get_published_rights_page`, `list_rights_page_versions`, `rollback_rights_page` | Publish (live at once), read the live page and its history, roll back. A rollback replaces the draft; pass `baseUpdatedAt` to both. |
| `list_rights_page_domains`, `add_rights_page_domain`, `verify_rights_page_domain`, `remove_rights_page_domain` | Serve the rights page on your own hostname. |
| `create_rights_link` | A signed, single-use rights-page link for a signed-in person. |
| `get_mail_provider`, `set_mail_provider`, `test_mail_provider`, `remove_mail_provider` | Your own email provider for rights-request mail. |

The full list, with every argument, is on [cookiemunch.net/docs/mcp-tools](https://cookiemunch.net/docs/mcp-tools).

## Client configuration

### Claude Desktop / Claude Code

Add to your MCP servers config (`claude_desktop_config.json`, or via
`claude mcp add`):

```json
{
  "mcpServers": {
    "cookiemunch": {
      "command": "npx",
      "args": ["-y", "@cookiemunch/mcp"],
      "env": {
        "COOKIEMUNCH_API_KEY": "fck_your_key_here"
      }
    }
  }
}
```

Or, from a local checkout after `pnpm --filter @cookiemunch/mcp build`:

```json
{
  "mcpServers": {
    "cookiemunch": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/bin.js"],
      "env": {
        "COOKIEMUNCH_API_KEY": "fck_your_key_here"
      }
    }
  }
}
```

## Programmatic use

```ts
import { createCookieMunchMcp } from '@cookiemunch/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = createCookieMunchMcp({ apiKey: process.env.COOKIEMUNCH_API_KEY!, baseUrl: 'https://api.cookiemunch.net' });
await server.connect(new StdioServerTransport());
```
