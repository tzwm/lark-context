import type { MessageContent } from '../types/index.js';

export function parseMessageContent(content: string): MessageContent {
  try {
    return JSON.parse(content) as MessageContent;
  } catch {
    return { text: content };
  }
}

export function extractBotMention(text: string, botId: string): string | null {
  const mentionRegex = /@_user_\d+/g;
  const mentions = text.match(mentionRegex);

  if (!mentions || mentions.length === 0) {
    return null;
  }

  // 检查是否有提及 bot
  const botMentionKey = `@_user_${botId}`;
  if (!mentions.includes(botMentionKey)) {
    return null;
  }

  let cleanText = text;
  for (const mention of mentions) {
    cleanText = cleanText.replace(mention, '').trim();
  }

  return cleanText || null;
}

export function isBotMentioned(messageContent: MessageContent, botId: string): boolean {
  // 优先使用 mentions 数组来检查
  if (messageContent.mentions && messageContent.mentions.length > 0) {
    return messageContent.mentions.some(mention => mention.id === botId);
  }

  // 如果没有 mentions 数组，则回退到文本检查
  const botMentionPattern = new RegExp(`@_user_${botId}`);
  return botMentionPattern.test(messageContent.text);
}
