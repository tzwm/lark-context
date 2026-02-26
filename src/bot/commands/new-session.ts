import type { ChatInfo } from '../../types/index.js';
import type { Command } from '../command-handler.js';
import type { BotHandler } from '../handler.js';

export const newSessionCommand: Command = {
  name: 'new',
  description: '创建新的 Pi 会话',
  async execute(botHandler: BotHandler, chatInfo: ChatInfo, args: string[]): Promise<void> {
    // 使用与 handlePiQuery 相同的 threadId 逻辑
    const threadId = chatInfo.chatType === 'p2p' ? `p2p-${chatInfo.chatId}` : chatInfo.chatId;

    const newSessionId = await botHandler.createNewSession(chatInfo, threadId);
    console.log('[NewSession] Created new session:', newSessionId, 'for thread:', threadId);
    await botHandler.sendTextMessage(chatInfo.chatId, `✅ 已创建新会话：${newSessionId}`);
  },
};
