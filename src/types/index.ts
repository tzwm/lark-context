import type * as lark from '@larksuiteoapi/node-sdk';

export type MessageEvent = Parameters<NonNullable<lark.EventHandles['im.message.receive_v1']>>[0];

export type MessageContent = {
  text: string;
  mentions?: Array<{
    key: string;
    id: {
      open_id?: string;
      union_id?: string;
      user_id?: string | null;
    };
    name: string;
    tenant_key?: string;
  }>;
};

export interface SessionMapping {
  sessionId: string;
  threadId: string;
  lastUsed: string;
}

export interface ChatInfo {
  chatId: string;
  chatType: string;
  chatName?: string;
  senderId?: string;
  senderName?: string;
  // 消息信息（用于每轮对话前缀）
  messageId?: string;
  threadId?: string;
  eventId?: string;
  mentions?: string[];
}
