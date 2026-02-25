import type { AssistantMessage, ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import {
  type AgentSession,
  type AgentSessionEvent,
  AuthStorage,
  ModelRegistry,
  SessionManager,
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
      arguments: Record<string, unknown>;
      state: {
        status: 'pending' | 'running' | 'completed' | 'error';
        output?: string;
        error?: string;
      };
    };

interface PendingRequest {
  startTime: number;
  resolve: (response: AssistantResponse) => void;
  reject: (error: Error) => void;
}

interface ActiveSession {
  session: AgentSession;
  pendingQueue: PendingRequest[];
}

export class PiService {
  private authStorage: AuthStorage;
  private modelRegistry: ModelRegistry;
  private piSessionsPath: string;
  private activeSessions = new Map<string, ActiveSession>();

  constructor(dataPath: string) {
    this.authStorage = AuthStorage.create();
    this.modelRegistry = new ModelRegistry(this.authStorage);
    this.piSessionsPath = `${dataPath}/pi-sessions`;
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
    const workspacePath = process.env.PI_WORKSPACE_PATH || process.cwd();

    let systemPrompt = `You are an AI assistant integrated with Feishu/Lark.\nYou are working in a collaborative environment. Be helpful, concise, and provide clear answers.\n\nCurrent Context:\n- Chat Type: ${chatTypeInfo}\n- Chat ID: ${chatInfo.chatId}\n- Working Directory: ${workspacePath}`;

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
      cwd: workspacePath,
      sessionManager: SessionManager.create(this.piSessionsPath),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
    });

    return session.sessionId;
  }

  private async getOrCreateSession(sessionId: string): Promise<ActiveSession> {
    const existing = this.activeSessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const workspacePath = process.env.PI_WORKSPACE_PATH || process.cwd();
    console.log('[PiService] Creating new active session:', sessionId);

    const { session } = await createAgentSession({
      cwd: workspacePath,
      sessionManager: SessionManager.open(sessionId),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
    });

    const active: ActiveSession = {
      session,
      pendingQueue: [],
    };

    // 先存入 map，再设置事件监听器
    this.activeSessions.set(sessionId, active);

    // 立即设置事件监听器，确保不会错过任何事件
    session.subscribe((event: AgentSessionEvent) => {
      this.handleSessionEvent(active, event);
    });

    return active;
  }

  private handleSessionEvent(active: ActiveSession, event: AgentSessionEvent): void {
    if (event.type !== 'turn_end') {
      return;
    }

    const resolver = active.pendingQueue.shift();
    if (!resolver) {
      console.warn('[PiService] turn_end received but no pending request');
      return;
    }

    console.log('[PiService] Processing turn_end, queue length:', active.pendingQueue.length);

    if (event.message.role === 'assistant') {
      const assistantMessage = event.message as unknown as AssistantMessage;
      const toolResults = event.toolResults as unknown as ToolResultMessage[];

      const parts = this.extractParts(assistantMessage, toolResults);

      resolver.resolve({
        info: {
          // biome-ignore lint/suspicious/noExplicitAny: pi-coding-agent 库类型定义不完整
          modelID: (assistantMessage as any).model,
          tokens: {
            // biome-ignore lint/suspicious/noExplicitAny: pi-coding-agent 库类型定义不完整
            input: (assistantMessage as any).usage.input,
            // biome-ignore lint/suspicious/noExplicitAny: pi-coding-agent 库类型定义不完整
            output: (assistantMessage as any).usage.output,
          },
          time: {
            created: resolver.startTime,
            completed: Date.now(),
          },
        },
        parts,
      });
    } else {
      resolver.reject(new Error('Expected assistant message'));
    }
  }

  async sendPrompt(sessionId: string, text: string): Promise<AssistantResponse> {
    const active = await this.getOrCreateSession(sessionId);

    const startTime = Date.now();

    // 创建 Promise 来等待响应
    const responsePromise = new Promise<AssistantResponse>((resolve, reject) => {
      active.pendingQueue.push({ startTime, resolve, reject });
    });

    // 根据是否正在 streaming 决定使用 prompt 还是 followUp
    if (active.session.isStreaming) {
      console.log(
        '[PiService] Session is streaming, using followUp, queue:',
        active.pendingQueue.length,
      );
      await active.session.followUp(text);
    } else {
      console.log('[PiService] Session is idle, using prompt');
      await active.session.prompt(text);
    }

    // 等待响应
    return responsePromise;
  }

  private extractParts(
    assistantMessage: AssistantMessage,
    toolResults: ToolResultMessage[],
  ): Part[] {
    const parts: Part[] = [];

    // biome-ignore lint/suspicious/noExplicitAny: pi-coding-agent 库类型定义不完整
    for (const content of (assistantMessage as any).content) {
      if (content.type === 'text') {
        parts.push({ type: 'text', text: content.text });
      } else if (content.type === 'thinking') {
        parts.push({ type: 'reasoning', text: content.thinking });
      } else if (content.type === 'toolCall') {
        const toolCall = content as unknown as ToolCall;
        const result = toolResults.find(r => r.toolCallId === toolCall.id);
        const outputTexts = result?.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');

        parts.push({
          type: 'tool',
          tool: toolCall.name,
          arguments: toolCall.arguments,
          state: {
            status: result?.isError ? 'error' : 'completed',
            output: result?.isError ? undefined : outputTexts,
            error: result?.isError ? outputTexts : undefined,
          },
        });
      }
    }

    return parts;
  }
}
