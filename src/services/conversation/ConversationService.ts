import { Groq } from 'groq-sdk';
import { BaseService } from '../base/BaseService';
import { ConversationConfig, Message, ConversationResponse, ToolCall } from './types';
import { ChatCompletionTool } from 'groq-sdk/resources/chat/completions';
import { v4 as uuidv4 } from 'uuid';

export class ConversationService extends BaseService {
  private client: Groq;
  private readonly model: string;
  private readonly maxTokens: number;
  private messageHistory: Map<string, Message[]>;
  private readonly tools: ChatCompletionTool[];

  constructor(config: ConversationConfig) {
    super(config);
    this.client = new Groq({ apiKey: config.groqApiKey });
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.messageHistory = new Map();
    this.tools = this.getHardcodedTools();
  }

  public processMessage = async (message: string, sessionId: string): Promise<ConversationResponse> => {
    try {
      const history = this.getOrCreateHistory(sessionId);
      history.push({ role: 'user', content: message });
  
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: history as any,
        max_tokens: this.maxTokens,
        tools: this.tools,
        tool_choice: 'auto',
        stream: true
      });
  
      let fullResponse = "";
      let toolCalls: ToolCall[] = [];
  
      try {
        for await (const chunk of stream) {
          if (chunk.choices[0]?.delta?.content) {
            fullResponse += chunk.choices[0].delta.content;
          }
  
          if (chunk.choices[0]?.delta?.tool_calls) {
            const incomingToolCalls = chunk.choices[0].delta.tool_calls as Array<{
              id?: string;
              type: string;
              function: {
                name: string;
                arguments: string;
              };
            }> || [];
  
            for (const toolCall of incomingToolCalls) {
              const completeToolCall: ToolCall = {
                id: toolCall.id || uuidv4(),
                type: 'function', // Explicitly set as literal 'function'
                function: {
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments
                }
              };
              
              toolCalls.push(completeToolCall);
            }
          }
        }
  
        const assistantMessage: Message = { role: 'assistant', content: fullResponse };
        history.push(assistantMessage);
  
        return {
          content: fullResponse,
          toolCalls,
          tools: this.tools,
          type: 'final'
        };
  
      } catch (streamError) {
        this.logger.error('Error processing stream', { streamError, sessionId });
        throw streamError;
      }
    } catch (error) {
      this.logger.error('Error processing message', { error, sessionId });
      throw error;
    }
  }

  private getOrCreateHistory(sessionId: string): Message[] {
    if (!this.messageHistory.has(sessionId)) {
      this.messageHistory.set(sessionId, this.initializeHistory());
    }
    return this.messageHistory.get(sessionId)!;
  }

  private initializeHistory(): Message[] {
    return [{
      role: 'system',
      content: `You are an AI assistant that can use various tools to help answer questions and perform tasks.

    You can:
    1. Work with Salesforce records (Account, Contact, Lead, Deal, Article, Case) using:
       - fetch_entity: Retrieve records
       - create_entity: Create new records 
       - update_entity: Modify existing records
    
    2. Handle Gmail operations using:
       - fetch_emails: Get emails
       - send_email: Send emails
    
    3. Manage Google Calendar using:
       - create_calendar: Create new calendars
       - update_calendar: Modify calendars
       - create_event: Schedule events/meetings
       - update_event: Update events/meetings
    
    Use the appropriate tool with correct object names and parameters for each operation.
    
    Follow schemas and patterns defined for all tool calls.`
    }];
  }

  private getHardcodedTools(): ChatCompletionTool[] {
    return [
      {
        type: "function",
        function: {
          name: "fetch_entity",
          description: "Fetch Salesforce records",
          parameters: {
            type: "object",
            properties: {
              operation: { type: "string", enum: ["fetch"] },
              entityType: { type: "string", enum: ["Account", "Contact", "Lead", "Deal", "Article", "Case"] },
              identifier: { type: "string" }
            },
            required: ["operation", "entityType", "identifier"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_entity",
          description: "Create Salesforce entity",
          parameters: {
            type: "object",
            properties: {
              operation: { type: "string", enum: ["create"] },
              entityType: { type: "string", enum: ["Account", "Contact", "Lead", "Deal", "Article", "Case"] },
              fields: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  industry: { type: "string" },
                  phone: { type: "string" },
                  website: { type: "string" }
                },
                required: ["name"]
              }
            },
            required: ["operation", "entityType", "fields"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_entity",
          description: "Update Salesforce entity",
          parameters: {
            type: "object",
            properties: {
              operation: { type: "string", enum: ["update"] },
              entityType: { type: "string", enum: ["Account", "Contact", "Lead", "Deal", "Article", "Case"] },
              identifier: { type: "string" },
              fields: {
                type: "object",
                minProperties: 1,
                properties: {
                  name: { type: "string" },
                  industry: { type: "string" },
                  phone: { type: "string" },
                  website: { type: "string" }
                }
              }
            },
            required: ["operation", "entityType", "identifier", "fields"]
          }
        }
      }
    ];
  }
}