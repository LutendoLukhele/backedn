import WebSocket from 'ws';
import * as readline from 'readline';

// Define the ClientMessage interface to match your server's expected format.
interface ClientMessage {
  messageId: string;
  content: string;
  sessionId: string;
  type: MessageType;
}

enum MessageType {
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
  SYSTEM = 'SYSTEM',
  STREAM = 'STREAM'
}

// Generate a simple session id (could be replaced with a UUID generator if desired)
const sessionId = Math.random().toString(36).substring(7);

// Connect to your WebSocket server using the specified endpoint.
const ws = new WebSocket('ws://localhost:3000/ws');

// Set up a readline interface for CLI input.
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'Enter message> '
});

// When the WebSocket connection opens, start the CLI prompt.
ws.on('open', () => {
  console.log('Connected to WebSocket server.');
  rl.prompt();
});

// Listen for incoming messages from the server.
ws.on('message', (data: WebSocket.RawData) => {
  // Assuming the data is in JSON format:
  try {
    const message = JSON.parse(data.toString());
    console.log('Received:', message);
  } catch (error) {
    console.error('Error parsing incoming message:', error);
  }
});

// Handle errors and closure of the WebSocket connection.
ws.on('error', (err) => {
  console.error('WebSocket error:', err);
});

ws.on('close', () => {
  console.log('WebSocket connection closed.');
  process.exit(0);
});

// Listen for user input and send messages to the server.
rl.on('line', (input: string) => {
  // Create a ClientMessage object
  const clientMessage: ClientMessage = {
    messageId: `cli-${Date.now()}`,
    content: input,
    sessionId,
    type: MessageType.USER,
  };

  // Send the message to the server.
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(clientMessage));
  } else {
    console.error('WebSocket is not open. Message not sent.');
  }

  rl.prompt();
});

// Handle exit (for example on Ctrl+C)
rl.on('SIGINT', () => {
  console.log('Closing connection...');
  ws.close();
  rl.close();
});
