import 'dotenv/config';
import { Bot } from './bot/index.js';
import { PiService } from './pi/service.js';
import { SessionManager } from './pi/session-manager.js';

const requiredEnvVars = ['LARK_APP_ID', 'LARK_APP_SECRET', 'DATA_PATH'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const DATA_PATH = process.env.DATA_PATH as string;

console.log('[Init] Initializing Pi service...');
const piService = new PiService();

console.log('[Init] Checking Pi health...');
const isHealthy = await piService.healthCheck();
if (!isHealthy) {
  console.error('[Init] Pi has no available models configured. Continuing anyway but may fail.');
} else {
  console.log('[Init] Pi is healthy');
}

console.log('[Init] Initializing session manager...');
const sessionManager = new SessionManager(DATA_PATH);
await sessionManager.loadSessions();
console.log('[Init] Session manager initialized');

const bot = new Bot({
  appId: process.env.LARK_APP_ID as string,
  appSecret: process.env.LARK_APP_SECRET as string,
  piService,
  sessionManager,
});

const wsClient = bot.getWSClient();
if (wsClient) {
  wsClient.start({
    eventDispatcher: bot.getEventDispatcher(),
  });
  console.log('Lark Bot is running in long-connection mode');
}
