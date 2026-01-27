import * as lark from '@larksuiteoapi/node-sdk';
import type { MessageEvent } from '../types/index.js';
import { BotHandler } from './handler.js';

export class Bot {
  private eventDispatcher: lark.EventDispatcher;
  private handler: BotHandler;
  private wsClient?: lark.WSClient;

  constructor(config: {
    appId: string;
    appSecret: string;
    encryptKey?: string;
    verificationToken?: string;
    mode?: 'webhook' | 'long-connection';
  }) {
    this.handler = new BotHandler(config.appId, config.appSecret);

    const isWebhookMode = config.mode === 'webhook';
    this.eventDispatcher = new lark.EventDispatcher({
      encryptKey: isWebhookMode ? config.encryptKey : undefined,
    }).register({
      'im.message.receive_v1': async data => {
        await this.handler.handleMessage(data as unknown as MessageEvent);
      },
    });

    if (config.mode === 'long-connection' || !config.mode) {
      this.wsClient = new lark.WSClient({
        appId: config.appId,
        appSecret: config.appSecret,
        loggerLevel: lark.LoggerLevel.info,
      });
    }
  }

  getEventDispatcher(): lark.EventDispatcher {
    return this.eventDispatcher;
  }

  getWSClient(): lark.WSClient | undefined {
    return this.wsClient;
  }
}
