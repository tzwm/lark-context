import * as lark from '@larksuiteoapi/node-sdk';
import type { PiService } from '../pi/service.js';
import type { SessionManager } from '../pi/session-manager.js';
import type { MessageEvent } from '../types/index.js';
import { BotHandler } from './handler.js';

export class Bot {
  private eventDispatcher: lark.EventDispatcher;
  private handler: BotHandler;
  private wsClient: lark.WSClient;

  constructor(config: {
    appId: string;
    appSecret: string;
    piService: PiService;
    sessionManager: SessionManager;
  }) {
    this.handler = new BotHandler(
      config.appId,
      config.appSecret,
      config.piService,
      config.sessionManager,
    );

    this.eventDispatcher = new lark.EventDispatcher({
      encryptKey: undefined,
    }).register({
      'im.message.receive_v1': data => {
        console.log('[DEBUG] Received event:', JSON.stringify(data, null, 2));
        // 异步处理消息，避免阻塞事件ACK导致飞书重试
        this.handler.handleMessage(data as unknown as MessageEvent).catch(error => {
          console.error('[Event] Failed to handle message:', error);
        });
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
