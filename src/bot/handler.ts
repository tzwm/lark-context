import * as lark from '@larksuiteoapi/node-sdk';
import type { MessageEvent } from '../types/index.js';
import { parseMessageContent, extractBotMention, isBotMentioned } from './utils.js';

export class BotHandler {
  private client: lark.Client;

  constructor(appId: string, appSecret: string) {
    this.client = new lark.Client({
      appId,
      appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });
  }

  async handleMessage(event: MessageEvent): Promise<void> {
    const { chat_id, content, msg_type } = event.event.message;
    
    if (msg_type !== 'text') {
      return;
    }

    const messageContent = parseMessageContent(content);
    
    if (!isBotMentioned(messageContent.text)) {
      return;
    }

    const query = extractBotMention(messageContent.text);
    
    if (!query) {
      await this.sendMessage(chat_id, '请告诉我您需要什么帮助？');
      return;
    }

    await this.sendMessage(chat_id, `收到您的消息: ${query}\n\n目前仅测试模式，OpenCode 集成即将上线。`);
  }

  private async sendMessage(chatId: string, text: string): Promise<void> {
    try {
      await this.client.im.message.create({
        params: {
          receive_id_type: 'chat_id',
        },
        data: {
          receive_id: chatId,
          content: JSON.stringify({ text }),
          msg_type: 'text',
        },
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }
}
