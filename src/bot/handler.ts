import * as lark from '@larksuiteoapi/node-sdk';
import type { MessageEvent } from '../types/index.js';
import { extractBotMention, isBotMentioned, parseMessageContent } from './utils.js';

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
    console.log('[DEBUG] handleMessage called');
    const { chat_id, content, msg_type } = event.event.message;
    console.log('[DEBUG] Message details:', { chat_id, msg_type, content });

    if (msg_type !== 'text') {
      console.log('[DEBUG] Message is not text type, skipping');
      return;
    }

    const messageContent = parseMessageContent(content);
    console.log('[DEBUG] Parsed message content:', messageContent);

    if (!isBotMentioned(messageContent.text)) {
      console.log('[DEBUG] Bot not mentioned, skipping');
      return;
    }

    const query = extractBotMention(messageContent.text);
    console.log('[DEBUG] Extracted query:', query);

    if (!query) {
      console.log('[DEBUG] Query is empty, sending help message');
      await this.sendMessage(chat_id, '请告诉我您需要什么帮助？');
      return;
    }

    console.log('[DEBUG] Sending response for query:', query);
    await this.sendMessage(
      chat_id,
      `收到您的消息: ${query}\n\n目前仅测试模式，OpenCode 集成即将上线。`,
    );
  }

  private async sendMessage(chatId: string, text: string): Promise<void> {
    console.log('[DEBUG] sendMessage called:', { chatId, text });
    try {
      const result = await this.client.im.message.create({
        params: {
          receive_id_type: 'chat_id',
        },
        data: {
          receive_id: chatId,
          content: JSON.stringify({ text }),
          msg_type: 'text',
        },
      });
      console.log('[DEBUG] Message sent successfully:', result);
    } catch (error) {
      console.error('[DEBUG] Failed to send message:', error);
      throw error;
    }
  }
}
