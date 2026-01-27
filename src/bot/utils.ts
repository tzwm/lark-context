import type { MessageContent } from '../types/index.js'

export function parseMessageContent(content: string): MessageContent {
  try {
    return JSON.parse(content) as MessageContent
  } catch {
    return { text: content }
  }
}

export function extractBotMention(text: string): string | null {
  const mentionRegex = /@_user_\d+/g
  const mentions = text.match(mentionRegex)

  if (!mentions || mentions.length === 0) {
    return null
  }

  let cleanText = text
  for (const mention of mentions) {
    cleanText = cleanText.replace(mention, '').trim()
  }

  return cleanText || null
}

export function isBotMentioned(text: string): boolean {
  return /@_user_\d+/.test(text)
}

export function formatMarkdown(text: string): string {
  return text
}
