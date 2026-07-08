export type McpServerConfig = {
  command: string;
  args: string[];
};

export type McpToolInfo = {
  name: string;
  description?: string;
};

export type McpCallArguments = Record<string, unknown>;

export type McpCallResult = unknown;
