import { ChatCompletionTool } from 'groq-sdk/resources/chat/completions';
import { ServiceConfig } from '../base/types';
import { Logger } from 'winston';

// Response chunk type for WebSocket communication
export type ResponseChunk = {
  type: 'content' | 'tool_call' | 'tool_result' | 'error' | 'final';
  content: string;
  toolCallId?: string;
};

// Tool function interface
export interface ToolFunction {
  name: string;
  arguments: string;
  entityType?: string;  // Added for Salesforce integration
  action?: string;      // Added for Salesforce integration
  parameters?: Record<string, any>;  // Added for Salesforce integration
}

// Tool call interface
export interface ToolCall {
  id: string;
  type: 'function';
  function: ToolFunction;
}

export interface ConversationResponse {
  content: string;
  toolCalls: ToolCall[];
  tools?: ChatCompletionTool[];
  type?: 'content' | 'tool_call' | 'tool_result' | 'final' | 'error';
  toolCallId?: string;
}

// Message interface
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Configuration interface
export interface ConversationConfig extends ServiceConfig {
  nangoService: import("../NangoService").NangoService;
  client: any;
  tools: any[];
  groqApiKey: string;
  model: string;
  maxTokens: number;
  logger: Logger;
}

// Tool result interface
export interface ToolResult {
  status: 'success' | 'failed';
  toolName: string;
  data: any;
  error?: string;
}