import type { ChatInfo } from '../../types/index.js';
import type { Command } from '../command-handler.js';
import type { BotHandler } from '../handler.js';

export const newSessionCommand: Command = {
  name: 'new',
  description: '创建新的 OpenCode 会话',
  async execute(botHandler: BotHandler, chatInfo: ChatInfo, args: string[]): Promise<void> {
    const newSessionId = await botHandler.createNewSession(chatInfo);
    await botHandler.sendTextMessage(chatInfo.chatId, `✅ 已创建新会话: ${newSessionId}`);
  },
};
