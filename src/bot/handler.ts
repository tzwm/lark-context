import * as lark from '@larksuiteoapi/node-sdk';
import type { AssistantMessage, Part } from '@opencode-ai/sdk';
import type { OpenCodeService } from '../opencode/service.js';
import type { SessionManager } from '../opencode/session-manager.js';
import type { ChatInfo, MessageEvent } from '../types/index.js';
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
  private botId: string;

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
    this.botId = appId;

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

    if (!isPrivateChat && !isBotMentioned(messageContent, this.botId)) {
      console.log('[BotHandler] Bot not mentioned in group chat, skipping');
      return;
    }

    const query = isPrivateChat
      ? messageContent.text
      : extractBotMention(messageContent.text, this.botId);
    console.log('[BotHandler] Extracted query:', query);

    if (!query || query.trim() === '') {
      console.log('[BotHandler] Query is empty, sending help message');
      await this.sendTextMessage(chat_id, '请告诉我您需要什么帮助？');
      return;
    }

    console.log('[BotHandler] Full event sender:', JSON.stringify(event.sender, null, 2));

    const basicChatInfo = {
      chatId: chat_id,
      chatType: event.message.chat_type,
      senderId: event.sender?.sender_id?.open_id,
    };

    const detailedChatInfo = await this.getDetailedChatInfo(basicChatInfo);

    const isCommand = await this.commandHandler.execute(this, detailedChatInfo, query);
    if (isCommand) {
      return;
    }

    try {
      await this.handleOpenCodeQuery(query, event.message.message_id, detailedChatInfo);
    } catch (error) {
      console.error('[BotHandler] Error handling query:', error);
      await this.sendTextMessage(
        chat_id,
        `处理您的请求时出错：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleOpenCodeQuery(
    query: string,
    userMessageId: string,
    chatInfo: ChatInfo,
  ): Promise<void> {
    console.log('[BotHandler] Handling OpenCode query for chat:', chatInfo.chatId);

    let sessionId = await this.sessionManager.getOrCreateSession(chatInfo.chatId);

    if (!sessionId) {
      console.log('[BotHandler] Creating new OpenCode session');
      const newSessionId = await this.openCodeService.createSession(chatInfo);
      await this.sessionManager.updateSessionId(chatInfo.chatId, newSessionId);
      sessionId = newSessionId;
    }

    console.log('[BotHandler] Using session:', sessionId);

    await this.addMessageReaction(userMessageId, 'Typing');

    try {
      const response = await this.openCodeService.sendPrompt(sessionId, query);

      await this.sendResponseCard(chatInfo.chatId, response, userMessageId);
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
      await this.sendCard(chatInfo.chatId, errorCard, userMessageId);
      throw error;
    }
  }

  private async getDetailedChatInfo(chatInfo: ChatInfo): Promise<ChatInfo> {
    const result: ChatInfo = {
      chatId: chatInfo.chatId,
      chatType: chatInfo.chatType,
      senderId: chatInfo.senderId,
      senderName: chatInfo.senderName,
    };

    try {
      const chatResponse = await this.client.im.v1.chat.get({
        path: { chat_id: chatInfo.chatId },
        params: { user_id_type: 'open_id' },
      });

      if (chatResponse.data?.name) {
        result.chatName = chatResponse.data.name;
      }
    } catch (error) {
      console.error('[BotHandler] Failed to get chat info:', error);
    }

    if (chatInfo.senderId) {
      try {
        const userResponse = await this.client.contact.v3.user.get({
          path: { user_id: chatInfo.senderId },
          params: {
            user_id_type: 'open_id',
            department_id_type: 'open_department_id',
          },
        });

        if (userResponse.data?.user?.name) {
          result.senderName = userResponse.data.user.name;
        }
      } catch (error) {
        console.error('[BotHandler] Failed to get user info:', error);
      }
    }

    return result;
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

    const template = JSON.parse(JSON.stringify(messageTemplate));

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

    // 从 body 中提取 image keys，并替换为图1、图2等描述
    const imageKeyPattern = /img_v3_[a-zA-Z0-9_-]+/g;
    const images: string[] = [];
    const matches = body.match(imageKeyPattern);
    if (matches) {
      images.push(...matches);
      // 将 image keys 替换为图1、图2等描述
      let imageIndex = 0;
      body = body.replace(imageKeyPattern, () => {
        imageIndex++;
        return `[图${imageIndex}]`;
      });
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

    // 如果有图片，先在模板中插入 img_combination 组件
    if (images.length > 0) {
      const templateElements = template.body.elements as Array<Record<string, unknown>>;
      // 找到 body markdown 组件的索引（第三个元素，索引为2）
      const bodyIndex = 2;
      if (templateElements[bodyIndex]?.tag === 'markdown') {
        const imgCombination = {
          tag: 'img_combination',
          combination_mode:
            images.length === 1 ? 'single' : images.length === 2 ? 'double' : 'trisect',
          img_list: images.map(imgKey => ({ img_key: imgKey })),
          img_list_length: images.length,
          combination_transparent: false,
          margin: '8px 0px 0px 0px',
        };
        // 在 body 后面插入图片组件
        templateElements.splice(bodyIndex + 1, 0, imgCombination);
        console.log('[BotHandler] Inserted img_combination with', images.length, 'images');
      }
    }

    // 构建基础卡片
    const card = replaceVariables(template, {
      thinking: thinking.trim(),
      body: body.trim(),
      info,
      model: response.info.modelID,
    }) as Record<string, unknown>;

    console.log('[BotHandler] Sending card:', JSON.stringify(card, null, 2));
    await this.sendCard(chatId, card, replyMessageId);
  }

  async createNewSession(chatInfo: ChatInfo): Promise<string> {
    console.log('[BotHandler] Creating new OpenCode session for chat:', chatInfo.chatId);
    const newSessionId = await this.openCodeService.createSession(chatInfo);
    await this.sessionManager.updateSessionId(chatInfo.chatId, newSessionId);
    console.log('[BotHandler] New session created:', newSessionId);
    return newSessionId;
  }
}
