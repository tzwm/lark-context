import * as lark from '@larksuiteoapi/node-sdk';
import type { MessageEvent } from '../types/index.js';
import { BotHandler } from './handler.js';

export class Bot {
  private eventDispatcher: lark.EventDispatcher;
  private handler: BotHandler;

  constructor(config: {
    appId: string;
    appSecret: string;
    encryptKey?: string;
    verificationToken?: string;
  }) {
    this.handler = new BotHandler(config.appId, config.appSecret);
    
    this.eventDispatcher = new lark.EventDispatcher({
      encryptKey: config.encryptKey,
    }).register({
      'im.message.receive_v1': async (data: any) => {
        await this.handler.handleMessage(data as MessageEvent);
      },
    });
  }

  getEventDispatcher(): lark.EventDispatcher {
    return this.eventDispatcher;
  }
}
