// src/services/stream/types.ts
import { ServiceConfig } from '../base/types';

export interface StreamConfig extends ServiceConfig {
  chunkSize: number;
}



export type StreamChunkType = 'error' | 'tool_result' | 'content' | 'tool_status' | 'tool_call';

export interface StreamChunk {
  type: StreamChunkType;
  content: string;
  toolCallId?: string;
}