// Enhanced src/services/FollowUpService.ts

import { EventEmitter } from 'events';
import { Groq } from 'groq-sdk';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { ToolResult } from './conversation/types';

interface ToolCall {
    name: any;
    arguments: any;
    id: string;
    sessionId: string;
    toolName: string;
    args: Record<string, any>;
    result: any;
    timestamp: Date;
}


interface FollowUpRequest {
  toolName: string;
  toolResult: ToolResult;
  sessionId: string;
}

interface ChatCompletionChunk {
  type: 'content' | 'tool_result' | 'error';
  content: string;
  toolCallId?: string;
}

export class FollowUpService extends EventEmitter {
  private client: Groq;
  private model: string;
  private maxTokens: number;
  private logger: winston.Logger;

  constructor(client: Groq, model: string, maxTokens: number) {
    super();
    this.client = client;
    this.model = model;
    this.maxTokens = maxTokens;

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [new winston.transports.Console()],
    });

    // Listen for follow-up requests
    this.on('generate_follow_up', this.handleFollowUp);
  }

  /**
   * Handles the follow-up response generation.
   */
  private async handleFollowUp(request: FollowUpRequest) {
    const { toolName, toolResult, sessionId } = request;
    const followUpId = uuidv4();

    try {
      this.logger.info('Generating follow-up response', { followUpId, sessionId });

      // Construct follow-up messages
      const followUpMessages = [
        {
          role: 'system' as const,
          content: 'Process the tool result and provide a natural response that explains the results to the user. If the tool execution failed, explain what went wrong and suggest alternatives.'
        },
        {
          role: 'function' as const,
          name: toolName,
          content: JSON.stringify(toolResult)
        }
      ];

      // Create a follow-up stream using the chat client
      const followUpStream = await this.client.chat.completions.create({
        model: this.model,
        messages: followUpMessages,
        max_tokens: this.maxTokens,
        stream: true
      });

      // Send initial message
      this.emit('send_chunk', sessionId, {
        type: 'content',
        content: JSON.stringify({ text: "Here's what I found:" })
      } as ChatCompletionChunk);

      // Stream the response
      let buffer = '';
      for await (const chunk of followUpStream) {
        const followUpDelta = chunk.choices[0]?.delta;
        if (followUpDelta?.content) {
          buffer += followUpDelta.content;
          
          // Send chunks at natural breaks or when buffer gets large
          if (buffer.match(/[.!?]\s/) || buffer.length > 50) {
            this.emit('send_chunk', sessionId, {
              type: 'content',
              content: buffer.trim()
            } as ChatCompletionChunk);
            buffer = '';
          }
        }
      }

      // Send any remaining buffer
      if (buffer) {
        this.emit('send_chunk', sessionId, {
          type: 'content',
          content: buffer.trim()
        } as ChatCompletionChunk);
      }

      this.logger.info('Follow-up response generated successfully', { followUpId, sessionId });
    } catch (error: any) {
      this.logger.error('Follow-up response generation failed:', {
        error: error.message || 'Unknown error',
        followUpId,
        sessionId
      });

      this.emit('send_chunk', sessionId, {
        type: 'error',
        content: JSON.stringify({
          message: 'Error generating follow-up response',
          error: error instanceof Error ? error.message : 'Unknown error'
        }),
        toolCallId: followUpId
      } as ChatCompletionChunk);
    }
  }

  /**
   * Triggers follow-up response generation for a given tool execution result.
   */
  public triggerFollowUp(request: FollowUpRequest) {
    this.emit('generate_follow_up', request);
  }
}