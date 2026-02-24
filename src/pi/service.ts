import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { AssistantMessage, ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import {
  type AgentSessionEvent,
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
} from '@mariozechner/pi-coding-agent';
import type { ChatInfo } from '../types/index.js';

export interface AssistantResponse {
  info: {
    modelID: string;
    tokens: { input: number; output: number };
    time: { created: number; completed: number };
  };
  parts: Part[];
}

export type Part =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'file'; filename?: string; url?: string }
  | {
      type: 'tool';
      tool: string;
      state: {
        status: 'pending' | 'running' | 'completed' | 'error';
        output?: string;
        error?: string;
      };
    };

export class PiService {
  private authStorage: AuthStorage;
  private modelRegistry: ModelRegistry;
  private settingsManager: SettingsManager;
  private resourceLoader: DefaultResourceLoader;
  private sessionDir: string;

  constructor(dataPath: string) {
    this.authStorage = AuthStorage.create();
    this.modelRegistry = new ModelRegistry(this.authStorage);
    this.settingsManager = SettingsManager.create();
    this.resourceLoader = new DefaultResourceLoader({
      cwd: process.cwd(),
      settingsManager: this.settingsManager,
    });
    this.sessionDir = path.join(dataPath, 'pi-sessions');
    // 确保会话目录存在
    fs.mkdir(this.sessionDir, { recursive: true }).catch(console.error);
  }

  async initialize(): Promise<void> {
    await this.resourceLoader.reload();
  }

  async healthCheck(): Promise<boolean> {
    try {
      const available = await this.modelRegistry.getAvailable();
      return available.length > 0;
    } catch (error) {
      console.error('PiService health check failed:', error);
      return false;
    }
  }

  async createSession(chatInfo: ChatInfo): Promise<string> {
    const isPrivateChat = chatInfo.chatType === 'p2p';
    const chatTypeInfo = isPrivateChat ? '私聊' : '群聊';
    let systemPrompt = `You are an AI assistant integrated with Feishu/Lark.\nYou are working in a collaborative environment. Be helpful, concise, and provide clear answers.\n\nCurrent Context:\n- Chat Type: ${chatTypeInfo}\n- Chat ID: ${chatInfo.chatId}`;

    if (chatInfo.chatName) {
      systemPrompt += `\n- Chat Name: ${chatInfo.chatName}`;
    }

    if (isPrivateChat) {
      if (chatInfo.senderId) {
        systemPrompt += `\n- User ID: ${chatInfo.senderId}`;
      }
      if (chatInfo.senderName) {
        systemPrompt += `\n- User Name: ${chatInfo.senderName}`;
      }
    }

    const { session } = await createAgentSession({
      sessionManager: SessionManager.create(process.cwd(), this.sessionDir),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      resourceLoader: this.resourceLoader,
    });

    return session.sessionId;
  }

  async sendPrompt(sessionId: string, text: string): Promise<AssistantResponse> {
    const { session } = await createAgentSession({
      sessionManager: SessionManager.open(sessionId),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      resourceLoader: this.resourceLoader,
    });

    const startTime = Date.now();

    const parts: Part[] = [];
    let currentAssistantMessage: AssistantMessage | null = null;
    let turnToolResults: ToolResultMessage[] = [];

    const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      if (event.type === 'turn_end') {
        if (event.message.role === 'assistant') {
          currentAssistantMessage = event.message as unknown as AssistantMessage;
        }
        turnToolResults = turnToolResults.concat(
          event.toolResults as unknown as ToolResultMessage[],
        );
      }
    });

    await session.prompt(text);
    unsubscribe();

    if (!currentAssistantMessage) {
      throw new Error('No response from Pi agent.');
    }

    for (const content of (currentAssistantMessage as any).content) {
      if (content.type === 'text') {
        parts.push({ type: 'text', text: content.text });
      } else if (content.type === 'thinking') {
        parts.push({ type: 'reasoning', text: content.thinking });
      } else if (content.type === 'toolCall') {
        const toolCall = content as unknown as ToolCall;
        const result = turnToolResults.find(r => r.toolCallId === toolCall.id);
        const outputTexts = result?.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');

        parts.push({
          type: 'tool',
          tool: toolCall.name,
          state: {
            status: result?.isError ? 'error' : 'completed',
            output: result?.isError ? undefined : outputTexts,
            error: result?.isError ? outputTexts : undefined,
          },
        });
      }
    }

    return {
      info: {
        modelID: (currentAssistantMessage as any).model,
        tokens: {
          input: (currentAssistantMessage as any).usage.input,
          output: (currentAssistantMessage as any).usage.output,
        },
        time: {
          created: startTime,
          completed: Date.now(),
        },
      },
      parts,
    };
  }
}
