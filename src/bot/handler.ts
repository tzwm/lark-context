import * as lark from '@larksuiteoapi/node-sdk';
import { larkRequest } from '../lark_client.js';
import type { AssistantResponse } from '../pi/service.js';
import type { Part } from '../pi/service.js';
import type { PiService } from '../pi/service.js';
import type { SessionManager } from '../pi/session-manager.js';
import type { ChatInfo, MessageEvent } from '../types/index.js';
import { CommandHandler } from './command-handler.js';
import { newSessionCommand } from './commands/new-session.js';
import { messageTemplate } from './message-template.js';
import { extractBotMention, isBotMentioned, parseMessageContent } from './utils.js';

export class BotHandler {
  private client: lark.Client;
  private piService: PiService;
  private sessionManager: SessionManager;
  private processedEventIds = new Map<string, boolean>();
  private readonly MAX_PROCESSED_EVENTS = 10000;
  private commandHandler = new CommandHandler();
  private botOpenId: string | null = null;

  private appId: string;
  private appSecret: string;

  constructor(
    appId: string,
    appSecret: string,
    piService: PiService,
    sessionManager: SessionManager,
  ) {
    this.client = new lark.Client({
      appId,
      appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });
    this.piService = piService;
    this.sessionManager = sessionManager;
    this.appId = appId;
    this.appSecret = appSecret;

    this.commandHandler.register(newSessionCommand);

    // 从 API 获取 bot open_id
    this.initializeBotOpenId();
  }

  private async initializeBotOpenId(): Promise<void> {
    try {
      // 使用 bot/v3/info API 获取 bot 信息
      const response = await larkRequest(this.appId, this.appSecret, '/bot/v3/info', {
        method: 'GET',
      });

      console.log('[BotHandler] Bot info API response:', JSON.stringify(response, null, 2));

      const typedResponse = response as {
        code: number;
        msg: string;
        bot?: { open_id: string };
      };

      // API 返回的 bot 信息直接在 response.bot 中
      if (typedResponse.code === 0 && typedResponse.bot?.open_id) {
        this.botOpenId = typedResponse.bot.open_id;
        console.log('[BotHandler] Bot open_id initialized from API:', this.botOpenId);
      } else {
        console.error('[BotHandler] Failed to get bot open_id from API:', typedResponse.msg);
      }
    } catch (error) {
      console.error('[BotHandler] Failed to initialize bot open_id from API:', error);
    }
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

    const { chat_id, content, message_type, mentions } = event.message;
    console.log('[BotHandler] Message details:', { chat_id, message_type, content, mentions });

    if (message_type !== 'text') {
      console.log('[BotHandler] Message is not text type, skipping');
      return;
    }

    const messageContent = parseMessageContent(content, mentions);
    console.log('[BotHandler] Parsed message content:', messageContent);

    const isPrivateChat = event.message.chat_type === 'p2p';
    console.log('[BotHandler] Is private chat:', isPrivateChat);

    // 使用已设置的 botOpenId
    if (!this.botOpenId) {
      console.log('[BotHandler] Bot open_id not initialized, skipping');
      return;
    }

    if (!isPrivateChat && !isBotMentioned(messageContent, this.botOpenId)) {
      console.log('[BotHandler] Bot not mentioned in group chat, skipping');
      return;
    }

    const query = isPrivateChat
      ? messageContent.text
      : extractBotMention(messageContent.text, messageContent.mentions, this.botOpenId);
    console.log('[BotHandler] Extracted query:', query);

    if (!query || query.trim() === '') {
      console.log('[BotHandler] Query is empty, sending help message');
      await this.sendTextMessage(chat_id, '请告诉我您需要什么帮助？');
      return;
    }

    console.log('[BotHandler] Full event sender:', JSON.stringify(event.sender, null, 2));

    // 私聊始终使用同一 session（符合直觉），群聊按 thread 区分
    const threadId = isPrivateChat
      ? `p2p-${chat_id}` // 私聊固定使用 chat_id 作为 thread 标识
      : event.message.thread_id || event.message.message_id; // 群聊使用 thread_id
    console.log('[BotHandler] Thread ID:', threadId);

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
      await this.handlePiQuery(query, event.message.message_id, threadId, detailedChatInfo);
    } catch (error) {
      console.error('[BotHandler] Error handling query:', error);
      await this.sendTextMessage(
        chat_id,
        `处理您的请求时出错：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handlePiQuery(
    query: string,
    userMessageId: string,
    threadId: string,
    chatInfo: ChatInfo,
  ): Promise<void> {
    console.log('[BotHandler] Handling Pi query for thread:', threadId);

    let sessionId = await this.sessionManager.getOrCreateSession(threadId);

    if (!sessionId) {
      console.log('[BotHandler] Creating new Pi session');
      const newSessionId = await this.piService.createSession(chatInfo);
      await this.sessionManager.updateSessionId(threadId, newSessionId);
      sessionId = newSessionId;
    }

    console.log('[BotHandler] Using session:', sessionId);

    await this.addMessageReaction(userMessageId, 'Typing');

    try {
      const response = await this.piService.sendPrompt(sessionId, query);

      await this.sendResponseCard(chatInfo.chatId, response, userMessageId);
      console.log('[BotHandler] Response sent successfully');
    } catch (error) {
      console.error('[BotHandler] Pi error:', error);
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
      info: AssistantResponse['info'];
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
      } else if (part.type === 'reasoning' && part.text) {
        thinking += `${part.text}\n\n`;
      } else if (part.type === 'tool') {
        const status =
          part.state?.status === 'completed' ? '✓' : part.state?.status === 'error' ? '✗' : '...';
        thinking += `[${status} ${part.tool}]\n`;
      }
      // 忽略 file 类型
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

    // 分块发送，避免超过飞书卡片限制
    const MAX_THINKING_LENGTH = 500;
    const MAX_BODY_LENGTH = 3000;

    // 分块发送 thinking
    if (thinking.trim()) {
      const thinkingBlocks = this.splitText(thinking.trim(), MAX_THINKING_LENGTH);
      for (let i = 0; i < thinkingBlocks.length; i++) {
        const isLastThinkingBlock = i === thinkingBlocks.length - 1;
        const thinkingCard = this.createThinkingCard(
          thinkingBlocks[i],
          i === 0 ? response.info.modelID : '',
          i === 0 && response.info.tokens ? info : '',
          images,
          isLastThinkingBlock && !body.trim(),
        );
        await this.sendCard(chatId, thinkingCard, replyMessageId);
      }
    }

    // 分块发送 body
    if (body.trim()) {
      const bodyBlocks = this.splitText(body.trim(), MAX_BODY_LENGTH);
      for (let i = 0; i < bodyBlocks.length; i++) {
        const isLastBodyBlock = i === bodyBlocks.length - 1;
        const bodyCard = this.createBodyCard(
          bodyBlocks[i],
          i === 0 && !thinking.trim() ? response.info.modelID : '',
          i === 0 && !thinking.trim() && response.info.tokens ? info : '',
          isLastBodyBlock,
        );
        await this.sendCard(chatId, bodyCard, replyMessageId);
      }
    }
  }

  private splitText(text: string, maxLength: number): string[] {
    const blocks: string[] = [];
    let current = text;

    while (current.length > 0) {
      if (current.length <= maxLength) {
        blocks.push(current);
        break;
      }

      // 在换行处截断
      let splitIndex = current.lastIndexOf('\n\n', maxLength);
      if (splitIndex === -1) {
        splitIndex = current.lastIndexOf('\n', maxLength);
      }
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = maxLength;
      }

      blocks.push(current.substring(0, splitIndex));
      current = current.substring(splitIndex).trimStart();
    }

    return blocks;
  }

  private createThinkingCard(
    thinking: string,
    model: string,
    info: string,
    images: string[],
    isLast: boolean,
  ): Record<string, unknown> {
    const template = JSON.parse(JSON.stringify(messageTemplate)) as typeof messageTemplate;
    const templateElements = template.body.elements as Array<Record<string, unknown>>;

    // 设置 thinking 内容
    const thinkingElement = templateElements[0] as Record<string, unknown> | undefined;
    if (thinkingElement?.tag === 'div') {
      (thinkingElement.text as Record<string, unknown>).content = thinking;
    }

    // 清空 body markdown
    const bodyElement = templateElements[2] as Record<string, unknown> | undefined;
    if (bodyElement?.tag === 'markdown') {
      bodyElement.content = '';
    }

    // 如果有图片且是最后一块，插入图片组件
    if (images.length > 0 && isLast) {
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
        templateElements.splice(bodyIndex + 1, 0, imgCombination);
      }
    }

    // 设置 footer 信息
    this.setCardFooter(templateElements, model, info, isLast);

    return template;
  }

  private createBodyCard(
    body: string,
    model: string,
    info: string,
    isLast: boolean,
  ): Record<string, unknown> {
    const template = JSON.parse(JSON.stringify(messageTemplate)) as typeof messageTemplate;
    const templateElements = template.body.elements as Array<Record<string, unknown>>;

    // 清空 thinking
    const thinkingElement = templateElements[0] as Record<string, unknown> | undefined;
    if (thinkingElement?.tag === 'div') {
      (thinkingElement.text as Record<string, unknown>).content = '';
    }

    // 设置 body 内容
    const bodyElement = templateElements[2] as Record<string, unknown> | undefined;
    if (bodyElement?.tag === 'markdown') {
      bodyElement.content = body;
    }

    // 设置 footer 信息
    this.setCardFooter(templateElements, model, info, isLast);

    return template;
  }

  private setCardFooter(
    templateElements: Array<Record<string, unknown>>,
    model: string,
    info: string,
    show: boolean,
  ): void {
    // 找到 column_set (footer)
    const footerIndex = templateElements.findIndex(e => e?.tag === 'column_set');
    if (footerIndex !== -1) {
      const footer = templateElements[footerIndex] as Record<string, unknown> | undefined;
      if (footer?.columns) {
        const columns = footer.columns as Array<Record<string, unknown>>;
        const leftColumn = columns[0] as Record<string, unknown> | undefined;
        const rightColumn = columns[1] as Record<string, unknown> | undefined;

        if (show && leftColumn?.elements) {
          const leftElements = leftColumn.elements as Array<Record<string, unknown>>;
          const leftText = leftElements[0]?.text as Record<string, unknown> | undefined;
          if (leftText) leftText.content = model;
        } else if (leftColumn?.elements) {
          const leftElements = leftColumn.elements as Array<Record<string, unknown>>;
          const leftText = leftElements[0]?.text as Record<string, unknown> | undefined;
          if (leftText) leftText.content = '';
        }

        if (show && rightColumn?.elements) {
          const rightElements = rightColumn.elements as Array<Record<string, unknown>>;
          const rightText = rightElements[0]?.text as Record<string, unknown> | undefined;
          if (rightText) rightText.content = info;
        } else if (rightColumn?.elements) {
          const rightElements = rightColumn.elements as Array<Record<string, unknown>>;
          const rightText = rightElements[0]?.text as Record<string, unknown> | undefined;
          if (rightText) rightText.content = '';
        }
      }
    }
  }

  async createNewSession(chatInfo: ChatInfo, threadId?: string): Promise<string> {
    console.log('[BotHandler] Creating new Pi session for chat:', chatInfo.chatId);
    const newSessionId = await this.piService.createSession(chatInfo);
    // 如果不传 threadId，使用 chatId 作为 fallback（兼容旧逻辑）
    const key = threadId || chatInfo.chatId;
    await this.sessionManager.updateSessionId(key, newSessionId);
    console.log('[BotHandler] New session created:', newSessionId);
    return newSessionId;
  }
}
