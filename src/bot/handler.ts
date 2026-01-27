import * as lark from '@larksuiteoapi/node-sdk';
import type { OpenCodeService } from '../opencode/service.js';
import type { SessionManager } from '../opencode/session-manager.js';
import type { MessageEvent } from '../types/index.js';
import { extractBotMention, isBotMentioned, parseMessageContent } from './utils.js';

export class BotHandler {
  private client: lark.Client;
  private openCodeService: OpenCodeService;
  private sessionManager: SessionManager;

  constructor(
    appId: string,
    appSecret: string,
    openCodeService: OpenCodeService,
    sessionManager: SessionManager,
  ) {
    this.client = new lark.Client({
      appId,
      appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });
    this.openCodeService = openCodeService;
    this.sessionManager = sessionManager;
  }

  async handleMessage(event: MessageEvent): Promise<void> {
    console.log('[BotHandler] handleMessage called');
    console.log('[BotHandler] Event structure:', JSON.stringify(event, null, 2));

    if (!event.message) {
      console.log('[BotHandler] No message in event, skipping');
      return;
    }

    const { chat_id, content, message_type } = event.message;
    console.log('[BotHandler] Message details:', { chat_id, message_type, content });

    if (message_type !== 'text') {
      console.log('[BotHandler] Message is not text type, skipping');
      return;
    }

    const messageContent = parseMessageContent(content);
    console.log('[BotHandler] Parsed message content:', messageContent);

    if (!isBotMentioned(messageContent.text)) {
      console.log('[BotHandler] Bot not mentioned, skipping');
      return;
    }

    const query = extractBotMention(messageContent.text);
    console.log('[BotHandler] Extracted query:', query);

    if (!query) {
      console.log('[BotHandler] Query is empty, sending help message');
      await this.sendMessage(chat_id, '请告诉我您需要什么帮助？');
      return;
    }

    try {
      await this.handleOpenCodeQuery(chat_id, query);
    } catch (error) {
      console.error('[BotHandler] Error handling query:', error);
      await this.sendMessage(
        chat_id,
        `处理您的请求时出错：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleOpenCodeQuery(chatId: string, query: string): Promise<void> {
    console.log('[BotHandler] Handling OpenCode query for chat:', chatId);

    let sessionId = await this.sessionManager.getOrCreateSession(chatId);

    if (!sessionId) {
      console.log('[BotHandler] Creating new OpenCode session');
      const newSessionId = await this.openCodeService.createSession();
      await this.sessionManager.updateSessionId(chatId, newSessionId);
      sessionId = newSessionId;
    }

    console.log('[BotHandler] Using session:', sessionId);

    const loadingMessageId = await this.sendMessage(chatId, '🤔 正在处理您的请求...');

    try {
      const response = await this.openCodeService.sendPrompt(sessionId, query);
      const formattedResponse = this.openCodeService.formatResponse(response);

      await this.editMessage(chatId, loadingMessageId, formattedResponse);
      console.log('[BotHandler] Response sent successfully');
    } catch (error) {
      console.error('[BotHandler] OpenCode error:', error);
      await this.editMessage(
        chatId,
        loadingMessageId,
        `❌ 处理请求时出错：${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async sendMessage(chatId: string, text: string): Promise<string> {
    console.log('[BotHandler] sendMessage called:', { chatId, text });
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
      console.log('[BotHandler] Message sent successfully:', result);
      return result.data?.message_id || '';
    } catch (error) {
      console.error('[BotHandler] Failed to send message:', error);
      throw error;
    }
  }

  private async editMessage(chatId: string, messageId: string, text: string): Promise<void> {
    console.log('[BotHandler] editMessage called:', { chatId, messageId, text });
    try {
      await (
        this.client as unknown as {
          im: {
            v1: {
              message: {
                update: (args: {
                  path: { message_id: string };
                  data: { content: string; msg_type: string };
                }) => Promise<void>;
              };
            };
          };
        }
      ).im.v1.message.update({
        path: {
          message_id: messageId,
        },
        data: {
          content: JSON.stringify({ text }),
          msg_type: 'text',
        },
      });
      console.log('[BotHandler] Message edited successfully');
    } catch (error) {
      console.error('[BotHandler] Failed to edit message:', error);
      throw error;
    }
  }
}
