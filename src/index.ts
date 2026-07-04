/**
 * @cookiemunch/mcp — a Model Context Protocol server exposing the Cookie Munch
 * Developer API as MCP tools, built on @cookiemunch/sdk. The library entry exports
 * the tool registration (registerTools) and a server factory (createCookieMunchMcp);
 * the stdio bootstrap lives in bin.ts.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createCookieMunch, type CookieMunchClient } from '@cookiemunch/sdk';
import { registerTools, type ToolServer } from './tools.js';

export { registerTools, type ToolServer, type ToolResult } from './tools.js';

export interface CookieMunchMcpOptions {
  apiKey: string;
  baseUrl: string;
  /** Inject a pre-built SDK client (e.g. for tests); otherwise one is created from apiKey/baseUrl. */
  client?: CookieMunchClient;
}

/** Build an McpServer with all Cookie Munch tools registered. Connect a transport to run it. */
export function createCookieMunchMcp(opts: CookieMunchMcpOptions): McpServer {
  const client = opts.client ?? createCookieMunch({ apiKey: opts.apiKey, baseUrl: opts.baseUrl });
  const server = new McpServer({ name: 'cookiemunch', version: '1.0.0' });
  // McpServer structurally satisfies ToolServer; the cast bridges the SDK's broader
  // generic registerTool signature to our minimal, testable surface.
  registerTools(server as unknown as ToolServer, client);
  return server;
}
