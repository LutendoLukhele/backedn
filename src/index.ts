// src/server.ts
import express from 'express';
import { createServer } from 'http';
import WebSocket from 'ws';
import winston from 'winston';
import { CONFIG } from './config';
import { ConversationService } from './services/conversation/ConversationService';
import { ToolOrchestrator } from './services/tool/ToolOrchestrator';
import { StreamManager } from './services/stream/StreamManager';
import { NangoService } from './services/NangoService';
import { ConversationConfig } from './services/conversation/types';
import { FollowUpService } from './services/FollowUpService';
import Groq from 'groq-sdk';

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Initialize services
const nangoService = new NangoService();

const conversationConfig: ConversationConfig = {
  groqApiKey: CONFIG.GROQ_API_KEY ,
  model: CONFIG.MODEL_NAME,
  maxTokens: CONFIG.MAX_TOKENS // Converts the env value to a number
  ,
  nangoService: new NangoService,
  client: undefined,
  tools: [],
  logger
};

const conversationService = new ConversationService(conversationConfig);

const followUpService = new FollowUpService(
  new Groq({ apiKey: CONFIG.GROQ_API_KEY }),
  CONFIG.MODEL_NAME,
  CONFIG.MAX_TOKENS
);

// Setup event handling for follow-up response streaming
followUpService.on('send_chunk', (sessionId, chunk) => {
  streamManager.sendChunk(sessionId, chunk);
});

// Removed logger from ToolOrchestrator config because ToolConfig doesn't support it.
const toolOrchestrator = new ToolOrchestrator({
  configPath: CONFIG.TOOL_CONFIG_PATH,
  nangoService,
  input: {}, // Define the input format 
  name: "tool-orchestrator",
  description: "Orchestrates the execution of tools",
  parameters: {
    type: "object",
    properties: {} // Define the properties expected by tools
  },
  default_params: {}
});

const streamManager = new StreamManager({
  logger,
  chunkSize: CONFIG.STREAM_CHUNK_SIZE
});

// Setup Express app
const app = express();
app.use(express.json());

// Create HTTP server
const server = createServer(app);

// Setup WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const sessionId = req.url?.slice(1) || Math.random().toString(36).substring(7);
  streamManager.addConnection(sessionId, ws);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      // Add this - Log the raw incoming message as full JSON
      logger.info('AI_MESSAGE_RECEIVED', { raw_message: JSON.stringify(data), sessionId });
      
      // Process the message through conversation service
      const response = await conversationService.processMessage(data.content, sessionId);
      
      // Add this - Log the complete AI response
      logger.info('AI_RESPONSE_GENERATED', { raw_response: JSON.stringify(response), sessionId });
      
      // Stream the response content
      for await (const chunk of streamManager.createStream(response.content)) {
        // Log each chunk sent to client
        logger.debug('CHUNK_SENT', { chunk: JSON.stringify(chunk), sessionId });
        streamManager.sendChunk(sessionId, chunk);
      }
      
      
      // Handle tool calls if present
      if (response.toolCalls) {
        for (const toolCall of response.toolCalls) {
          // Log tool call
          logger.info('TOOL_CALL_STARTED', { toolCall: JSON.stringify(toolCall), sessionId });
          
          // Send tool call start notification
          streamManager.sendChunk(sessionId, {
            type: 'tool_call',
            content: `Executing tool: ${toolCall.function.name}`,
            toolCallId: toolCall.id
          });
          
          // Execute tool; supply a non-empty object for args and a timestamp.
          const result = await toolOrchestrator.executeTool({
            name: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments),
            sessionId,
            id: '',
            toolName: '',
            args: {},
            result: undefined,
            timestamp: new Date()
          });
          
          // Log tool result
          logger.info('TOOL_RESULT', { result: JSON.stringify(result), toolCallId: toolCall.id, sessionId });
          
          // Send tool result
          
          followUpService.triggerFollowUp({
            toolName: toolCall.function.name,
            toolResult: result,
            sessionId: sessionId
          });

          streamManager.sendChunk(sessionId, {
            type: 'tool_result',
            content: JSON.stringify(result),
            toolCallId: toolCall.id
          });
        }
      }
    } catch (error) {
      logger.error('Error processing message', { error, sessionId });
      streamManager.sendChunk(sessionId, {
        type: 'error',
        content: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}); // Add this closing brace here

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Start server
const PORT = CONFIG.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});

// Handle graceful shutdown
// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});