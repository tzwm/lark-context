import type { MessageContent } from '../types/index.js';

export function parseMessageContent(
  content: string,
  mentions?: MessageContent['mentions'],
): MessageContent {
  try {
    const parsed = JSON.parse(content);
    // 使用传入的 mentions 或从 content 中解析
    return {
      text: parsed.text || '',
      mentions: mentions || parsed.mentions,
    } as MessageContent;
  } catch {
    return { text: content, mentions };
  }
}

export function extractBotMention(
  text: string,
  mentions: MessageContent['mentions'],
  botOpenId: string,
): string | null {
  const mentionRegex = /@_user_\d+/g;
  const textMentions = text.match(mentionRegex);

  if (!textMentions || textMentions.length === 0) {
    return null;
  }

  // 检查 mentions 数组中是否有 bot
  const botMention = mentions?.find(mention => mention.id.open_id === botOpenId);
  if (!botMention) {
    return null;
  }

  let cleanText = text;
  for (const mention of textMentions) {
    cleanText = cleanText.replace(mention, '').trim();
  }

  return cleanText || null;
}

export function isBotMentioned(messageContent: MessageContent, botOpenId: string): boolean {
  // 优先使用 mentions 数组来检查
  if (messageContent.mentions && messageContent.mentions.length > 0) {
    return messageContent.mentions.some(mention => mention.id.open_id === botOpenId);
  }

  // 如果没有 mentions 数组，则回退到文本检查
  const botMentionPattern = /@_user_\d+/;
  const matches = messageContent.text.match(botMentionPattern);
  if (!matches) return false;

  // 检查 mentions 中是否有匹配的 key
  return (
    messageContent.mentions?.some(mention => matches.some(match => mention.key === match)) ?? false
  );
}
