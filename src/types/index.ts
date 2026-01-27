import type * as lark from '@larksuiteoapi/node-sdk';

export type MessageEvent = Parameters<NonNullable<lark.EventHandles['im.message.receive_v1']>>[0];

export type MessageContent = {
  text: string;
  mentions?: Array<{
    key: string;
    id: string;
    name: string;
    tenant_key?: string;
  }>;
};

export interface SessionMapping {
  sessionId: string;
  lastUsed: string;
}

export interface OpenCodeConfig {
  host: string;
  timeout: number;
  dataPath: string;
}
