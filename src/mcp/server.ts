/**
 * Payload OS — MCP server (stdio).
 *
 *   npm run mcp
 *
 * Exposes the feed as MCP tools over the committed demonstration corpus.
 * Stdio transport: this opens no port. Every payload carries
 * fixture_only: true, as the HTTP feed does.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MCP_TOOLS, runMcpTool } from './tools';

const server = new McpServer({ name: 'payload-os', version: '0.1.0' });

for (const tool of MCP_TOOLS) {
  server.registerTool(
    tool.name,
    { description: tool.description, inputSchema: tool.shape },
    async (args: Record<string, unknown>) => {
      try {
        const result = await runMcpTool(tool.name, args);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `ERROR: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    },
  );
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
