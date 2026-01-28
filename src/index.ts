import 'dotenv/config';
import * as lark from '@larksuiteoapi/node-sdk';
import express from 'express';
import { Bot } from './bot/index.js';
import { OpenCodeService } from './opencode/service.js';
import { SessionManager } from './opencode/session-manager.js';

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const EVENT_MODE = (process.env.LARK_EVENT_MODE || 'long-connection') as
  | 'webhook'
  | 'long-connection';

const requiredEnvVars = ['LARK_APP_ID', 'LARK_APP_SECRET', 'DATA_PATH', 'OPENCODE_HOST'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const DATA_PATH = process.env.DATA_PATH as string;
const OPENCODE_HOST = process.env.OPENCODE_HOST as string;
const OPENCODE_TIMEOUT = Number.parseInt(process.env.OPENCODE_TIMEOUT || '60000', 10);
const OPENCODE_USERNAME = process.env.OPENCODE_SERVER_USERNAME;
const OPENCODE_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD;

console.log('[Init] Initializing OpenCode service...');
const openCodeService = new OpenCodeService({
  host: OPENCODE_HOST,
  timeout: OPENCODE_TIMEOUT,
  dataPath: DATA_PATH,
  username: OPENCODE_USERNAME,
  password: OPENCODE_PASSWORD,
});

console.log('[Init] Checking OpenCode server health...');
const isHealthy = await openCodeService.healthCheck();
if (!isHealthy) {
  console.error('[Init] OpenCode server is not healthy. Exiting.');
  process.exit(1);
}
console.log('[Init] OpenCode server is healthy');

console.log('[Init] Initializing session manager...');
const sessionManager = new SessionManager(DATA_PATH);
await sessionManager.loadSessions();
console.log('[Init] Session manager initialized');

const bot = new Bot({
  appId: process.env.LARK_APP_ID as string,
  appSecret: process.env.LARK_APP_SECRET as string,
  encryptKey: process.env.LARK_ENCRYPT_KEY,
  verificationToken: process.env.LARK_VERIFICATION_TOKEN,
  mode: EVENT_MODE,
  openCodeService,
  sessionManager,
});

if (EVENT_MODE === 'long-connection') {
  const wsClient = bot.getWSClient();
  if (wsClient) {
    wsClient.start({
      eventDispatcher: bot.getEventDispatcher(),
    });
    console.log('Lark Bot is running in long-connection mode');
  }
} else {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(
    '/webhook/event',
    lark.adaptExpress(bot.getEventDispatcher(), {
      autoChallenge: true,
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.listen(PORT, () => {
    console.log(`Lark Bot server is running on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhook/event`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}
