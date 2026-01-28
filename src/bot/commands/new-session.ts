import type { Command } from '../command-handler.js';
import type { BotHandler } from '../handler.js';

export const newSessionCommand: Command = {
  name: 'new',
  description: '创建新的 OpenCode 会话',
  async execute(botHandler: BotHandler, chatId: string): Promise<void> {
    const newSessionId = await botHandler.createNewSession(chatId);
    await botHandler.sendTextMessage(chatId, `✅ 已创建新会话: ${newSessionId}`);
  },
};
