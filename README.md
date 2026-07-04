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
| `COOKIEMUNCH_BASE_URL` | no | `http://localhost:8787` |

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
        "COOKIEMUNCH_API_KEY": "fck_your_key_here",
        "COOKIEMUNCH_BASE_URL": "https://cmp.example.com"
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
        "COOKIEMUNCH_API_KEY": "fck_your_key_here",
        "COOKIEMUNCH_BASE_URL": "https://cmp.example.com"
      }
    }
  }
}
```

## Programmatic use

```ts
import { createCookieMunchMcp } from '@cookiemunch/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = createCookieMunchMcp({ apiKey: process.env.COOKIEMUNCH_API_KEY!, baseUrl: 'https://cmp.example.com' });
await server.connect(new StdioServerTransport());
```
