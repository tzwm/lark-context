import * as lark from '@larksuiteoapi/node-sdk';

export type MessageEvent = Parameters<NonNullable<lark.EventHandles['im.message.receive_v1']>>[0];

export interface Mention {
  key: string;
  id: string;
  name: string;
  type: string;
}

export interface MessageContent {
  text: string;
  mentions?: Mention[];
}

export interface SessionMapping {
  sessionId: string;
  lastUsed: string;
}

export interface OpenCodeConfig {
  host: string;
  timeout: number;
  dataPath: string;
}
