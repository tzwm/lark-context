import * as lark from '@larksuiteoapi/node-sdk';
import type { OpenCodeService } from '../opencode/service.js';
import type { SessionManager } from '../opencode/session-manager.js';
import type { MessageEvent } from '../types/index.js';
import { BotHandler } from './handler.js';

export class Bot {
  private eventDispatcher: lark.EventDispatcher;
  private handler: BotHandler;
  private wsClient: lark.WSClient;

  constructor(config: {
    appId: string;
    appSecret: string;
    openCodeService: OpenCodeService;
    sessionManager: SessionManager;
  }) {
    this.handler = new BotHandler(
      config.appId,
      config.appSecret,
      config.openCodeService,
      config.sessionManager,
    );

    this.eventDispatcher = new lark.EventDispatcher({
      encryptKey: undefined,
    }).register({
      'im.message.receive_v1': async data => {
        console.log('[DEBUG] Received event:', JSON.stringify(data, null, 2));
        await this.handler.handleMessage(data as unknown as MessageEvent);
      },
    });

    this.wsClient = new lark.WSClient({
      appId: config.appId,
      appSecret: config.appSecret,
      loggerLevel: lark.LoggerLevel.info,
    });
  }

  getEventDispatcher(): lark.EventDispatcher {
    return this.eventDispatcher;
  }

  getWSClient(): lark.WSClient {
    return this.wsClient;
  }
}
