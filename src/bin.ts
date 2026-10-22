#!/usr/bin/env node
/**
 * stdio entry point for the Cookie Munch MCP server. Reads COOKIEMUNCH_API_KEY
 * (required) and COOKIEMUNCH_BASE_URL (optional) from the environment, builds the
 * server, and serves it over stdio — the transport Claude Desktop / Claude Code use
 * to spawn local MCP servers.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createCookieMunchMcp } from './index.js';

async function main(): Promise<void> {
  const apiKey = process.env.COOKIEMUNCH_API_KEY;
  if (!apiKey) {
    console.error('COOKIEMUNCH_API_KEY is required.');
    process.exit(1);
  }
  const baseUrl = process.env.COOKIEMUNCH_BASE_URL ?? 'https://api.cookiemunch.net';
  const server = createCookieMunchMcp({ apiKey, baseUrl, ...(process.env.COOKIEMUNCH_USER_AGENT ? { userAgent: process.env.COOKIEMUNCH_USER_AGENT } : {}) });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The process now stays alive serving MCP requests over stdio.
}

main().catch((err) => {
  console.error('cookiemunch-mcp failed to start:', err);
  process.exit(1);
});
