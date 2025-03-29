// src/services/stream/StreamManager.ts
import { BaseService } from '../base/BaseService';
import { StreamConfig, StreamChunk } from './types';
import { WebSocket } from 'ws';

export class StreamManager extends BaseService {
  private connections: Map<string, WebSocket>;
  private readonly chunkSize: number;

  constructor(config: StreamConfig) {
    super(config);
    this.connections = new Map();
    this.chunkSize = config.chunkSize;
  }

  addConnection(sessionId: string, ws: WebSocket): void {
    this.connections.set(sessionId, ws);
    this.setupConnectionHandlers(sessionId, ws);
  }

  async *createStream(content: string): AsyncGenerator<StreamChunk> {
    const chunks = this.chunkContent(content);
    for (const chunk of chunks) {
      yield {
        type: 'content',
        content: chunk
      };
    }
  }

  private chunkContent(content: string): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += this.chunkSize) {
      chunks.push(content.slice(i, i + this.chunkSize));
    }
    return chunks;
  }

  private setupConnectionHandlers(sessionId: string, ws: WebSocket): void {
    ws.on('close', () => {
      this.connections.delete(sessionId);
      this.logger.info('Connection closed', { sessionId });
    });

    ws.on('error', (error) => {
      this.logger.error('WebSocket error', { error, sessionId });
      this.connections.delete(sessionId);
    });
  }

  sendChunk(sessionId: string, chunk: StreamChunk): void {
    const ws = this.connections.get(sessionId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(chunk));
    }
  }
}