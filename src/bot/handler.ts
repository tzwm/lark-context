import * as lark from '@larksuiteoapi/node-sdk';
import type { AssistantMessage, Part } from '@opencode-ai/sdk';
import type { OpenCodeService } from '../opencode/service.js';
import type { SessionManager } from '../opencode/session-manager.js';
import type { MessageEvent } from '../types/index.js';
import { CommandHandler } from './command-handler.js';
import { newSessionCommand } from './commands/new-session.js';
import { messageTemplate } from './message-template.js';
import { extractBotMention, isBotMentioned, parseMessageContent } from './utils.js';

export class BotHandler {
  private client: lark.Client;
  private openCodeService: OpenCodeService;
  private sessionManager: SessionManager;
  private processedEventIds = new Map<string, boolean>();
  private readonly MAX_PROCESSED_EVENTS = 10000;
  private commandHandler = new CommandHandler();

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

    this.commandHandler.register(newSessionCommand);
  }

  async handleMessage(event: MessageEvent): Promise<void> {
    console.log('[BotHandler] handleMessage called');
    console.log('[BotHandler] Event structure:', JSON.stringify(event, null, 2));

    if (!event.event_id) {
      console.log('[BotHandler] No event_id in event, skipping');
      return;
    }

    if (this.processedEventIds.has(event.event_id)) {
      console.log('[BotHandler] Event already processed, skipping:', event.event_id);
      return;
    }

    this.processedEventIds.set(event.event_id, true);

    if (this.processedEventIds.size > this.MAX_PROCESSED_EVENTS) {
      const firstKey = this.processedEventIds.keys().next().value;
      if (firstKey) {
        this.processedEventIds.delete(firstKey);
      }
    }

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

    const isPrivateChat = event.message.chat_type === 'p2p';
    console.log('[BotHandler] Is private chat:', isPrivateChat);

    if (!isPrivateChat && !isBotMentioned(messageContent.text)) {
      console.log('[BotHandler] Bot not mentioned in group chat, skipping');
      return;
    }

    const query = isPrivateChat ? messageContent.text : extractBotMention(messageContent.text);
    console.log('[BotHandler] Extracted query:', query);

    if (!query || query.trim() === '') {
      console.log('[BotHandler] Query is empty, sending help message');
      await this.sendTextMessage(chat_id, '请告诉我您需要什么帮助？');
      return;
    }

    const isCommand = await this.commandHandler.execute(this, chat_id, query);
    if (isCommand) {
      return;
    }

    try {
      await this.handleOpenCodeQuery(chat_id, query, event.message.message_id);
    } catch (error) {
      console.error('[BotHandler] Error handling query:', error);
      await this.sendTextMessage(
        chat_id,
        `处理您的请求时出错：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleOpenCodeQuery(
    chatId: string,
    query: string,
    userMessageId: string,
  ): Promise<void> {
    console.log('[BotHandler] Handling OpenCode query for chat:', chatId);

    let sessionId = await this.sessionManager.getOrCreateSession(chatId);

    if (!sessionId) {
      console.log('[BotHandler] Creating new OpenCode session');
      const newSessionId = await this.openCodeService.createSession();
      await this.sessionManager.updateSessionId(chatId, newSessionId);
      sessionId = newSessionId;
    }

    console.log('[BotHandler] Using session:', sessionId);

    await this.addMessageReaction(userMessageId, 'Typing');

    try {
      const response = await this.openCodeService.sendPrompt(sessionId, query);

      await this.sendResponseCard(chatId, response, userMessageId);
      console.log('[BotHandler] Response sent successfully');
    } catch (error) {
      console.error('[BotHandler] OpenCode error:', error);
      const errorCard = {
        config: {
          wide_screen_mode: true,
        },
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `❌ 处理请求时出错：${error instanceof Error ? error.message : String(error)}`,
            },
          },
        ],
      };
      await this.sendCard(chatId, errorCard, userMessageId);
      throw error;
    }
  }

  async sendTextMessage(chatId: string, text: string): Promise<string> {
    console.log('[BotHandler] sendTextMessage called:', { chatId, text });
    const card = {
      config: {
        wide_screen_mode: true,
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: text,
          },
        },
      ],
    };
    return this.sendCard(chatId, card);
  }

  private async addMessageReaction(messageId: string, emojiType: string): Promise<void> {
    console.log('[BotHandler] addMessageReaction called:', { messageId, emojiType });
    try {
      await this.client.im.v1.messageReaction.create({
        path: { message_id: messageId },
        data: { reaction_type: { emoji_type: emojiType } },
      });
      console.log('[BotHandler] Reaction added successfully');
    } catch (error) {
      console.error('[BotHandler] Failed to add reaction:', error);
      throw error;
    }
  }

  private async sendCard(
    chatId: string,
    card: Record<string, unknown>,
    replyMessageId?: string,
  ): Promise<string> {
    console.log('[BotHandler] sendCard called:', { chatId, replyMessageId });
    try {
      let result: { data?: { message_id?: string } };
      if (replyMessageId) {
        result = await this.client.im.v1.message.reply({
          path: {
            message_id: replyMessageId,
          },
          data: {
            content: JSON.stringify(card),
            msg_type: 'interactive',
            reply_in_thread: false,
          },
        });
      } else {
        result = await this.client.im.message.create({
          params: {
            receive_id_type: 'chat_id',
          },
          data: {
            receive_id: chatId,
            content: JSON.stringify(card),
            msg_type: 'interactive',
          },
        });
      }
      console.log('[BotHandler] Card sent successfully:', result);
      return result.data?.message_id || '';
    } catch (error) {
      console.error('[BotHandler] Failed to send card:', error);
      throw error;
    }
  }

  private async sendResponseCard(
    chatId: string,
    response: {
      info: AssistantMessage;
      parts: Part[];
    },
    replyMessageId: string,
  ): Promise<void> {
    console.log('[BotHandler] sendResponseCard called:', { chatId, replyMessageId });

    const template = messageTemplate;

    let thinking = '';
    let body = '';
    let info = '';

    for (const part of response.parts) {
      if (part.type === 'text' && part.text) {
        body += `${part.text}\n\n`;
      } else if (part.type === 'tool') {
        body += `🔧 **Tool**: ${part.tool}\n`;
        body += `Status: ${part.state?.status}\n`;
        if (part.state?.status === 'completed' && part.state?.output) {
          body += `${part.state.output}\n\n`;
        } else if (part.state?.status === 'error' && part.state?.error) {
          body += `Error: ${part.state.error}\n\n`;
        }
      } else if (part.type === 'file') {
        body += `📄 File: ${part.filename || part.url}\n\n`;
      } else if (part.type === 'reasoning' && part.text) {
        thinking += `${part.text}\n\n`;
      }
    }

    if (response.info?.tokens) {
      info = `in: ${response.info.tokens.input.toLocaleString()} out: ${response.info.tokens.output.toLocaleString()}`;
      if (response.info.time?.completed) {
        const duration = response.info.time.completed - response.info.time.created;
        info += ` ${(duration / 1000).toFixed(2)}s`;
      }
    }

    const replaceVariables = (obj: unknown, variables: Record<string, string>): unknown => {
      if (typeof obj === 'string') {
        let result = obj;
        for (const [key, value] of Object.entries(variables)) {
          result = result.replace(`\${${key}}`, value);
        }
        return result;
      }
      if (Array.isArray(obj)) {
        return obj.map(item => replaceVariables(item, variables));
      }
      if (typeof obj === 'object' && obj !== null) {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
          result[key] = replaceVariables(value, variables);
        }
        return result;
      }
      return obj;
    };

    const card = replaceVariables(template, {
      thinking: thinking.trim(),
      body: body.trim(),
      info,
      model: response.info.modelID,
    });

    await this.sendCard(chatId, card as Record<string, unknown>, replyMessageId);
  }

  async createNewSession(chatId: string): Promise<string> {
    console.log('[BotHandler] Creating new OpenCode session for chat:', chatId);
    const newSessionId = await this.openCodeService.createSession();
    await this.sessionManager.updateSessionId(chatId, newSessionId);
    console.log('[BotHandler] New session created:', newSessionId);
    return newSessionId;
  }
}
