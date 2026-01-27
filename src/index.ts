import 'dotenv/config';
import express from 'express';
import * as lark from '@larksuiteoapi/node-sdk';
import { Bot } from './bot/index.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

const requiredEnvVars = ['LARK_APP_ID', 'LARK_APP_SECRET'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const bot = new Bot({
  appId: process.env.LARK_APP_ID!,
  appSecret: process.env.LARK_APP_SECRET!,
  encryptKey: process.env.LARK_ENCRYPT_KEY,
  verificationToken: process.env.LARK_VERIFICATION_TOKEN,
});

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/webhook/event', lark.adaptExpress(bot.getEventDispatcher(), {
  autoChallenge: true,
}));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Lark Bot server is running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook/event`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
