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
      state: {
        status: 'pending' | 'running' | 'completed' | 'error';
        output?: string;
        error?: string;
      };
    };

interface ActiveSession {
  session: AgentSession;
  unsubscribe: () => void;
  pendingResolvers: Array<{
    startTime: number;
    resolve: (response: AssistantResponse) => void;
    reject: (error: Error) => void;
  }>;
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

  async sendPrompt(sessionId: string, text: string): Promise<AssistantResponse> {
    const workspacePath = process.env.PI_WORKSPACE_PATH || process.cwd();

    // 获取或创建活跃会话
    let active = this.activeSessions.get(sessionId);

    if (!active) {
      // 创建新会话
      console.log('[PiService] Creating new active session:', sessionId);
      const { session } = await createAgentSession({
        cwd: workspacePath,
        sessionManager: SessionManager.open(sessionId),
        authStorage: this.authStorage,
        modelRegistry: this.modelRegistry,
      });

      active = {
        session,
        unsubscribe: () => {},
        pendingResolvers: [],
      };
      this.activeSessions.set(sessionId, active);
    }

    const startTime = Date.now();
    const pendingResolvers = active.pendingResolvers;

    // 创建一个 Promise 来等待响应
    const responsePromise = new Promise<AssistantResponse>((resolve, reject) => {
      pendingResolvers.push({ startTime, resolve, reject });
    });

    // 设置事件监听（只设置一次）
    if (!active.unsubscribe || active.unsubscribe === (() => {})) {
      const unsubscribe = active.session.subscribe((event: AgentSessionEvent) => {
        if (event.type === 'turn_end') {
          // 获取下一个等待的 resolver
          const resolver = pendingResolvers.shift();
          if (!resolver) {
            console.warn('[PiService] turn_end received but no pending resolver');
            return;
          }

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
      });

      active.unsubscribe = unsubscribe;
    }

    // 根据是否正在 streaming 决定使用 prompt 还是 followUp
    if (active.session.isStreaming) {
      console.log('[PiService] Session is streaming, using followUp');
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
