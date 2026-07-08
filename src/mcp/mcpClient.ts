import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  McpCallArguments,
  McpCallResult,
  McpServerConfig,
  McpToolInfo
} from "./types.js";

export type ConnectedMcpClient = {
  listTools(): Promise<McpToolInfo[]>;
  callTool(name: string, args: McpCallArguments): Promise<McpCallResult>;
  close(): Promise<void>;
};

export async function connectMcpServer(
  config: McpServerConfig
): Promise<ConnectedMcpClient> {
  const client = new Client({
    name: "gmail-ollama-sdr-agent",
    version: "0.1.0"
  });
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    stderr: "inherit"
  });

  await client.connect(transport);

  return {
    async listTools(): Promise<McpToolInfo[]> {
      const response = await client.listTools();
      return response.tools.map((tool) => ({
        name: tool.name,
        description: tool.description
      }));
    },

    async callTool(name: string, args: McpCallArguments): Promise<McpCallResult> {
      return client.callTool({ name, arguments: args });
    },

    async close(): Promise<void> {
      await client.close();
    }
  };
}
