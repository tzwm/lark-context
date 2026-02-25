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
  isProcessing: boolean;
  unsubscribe: () => void;
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

      const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
        if (event.type === 'turn_end') {
          console.log('[PiService] turn_end event received');
        }
      });

      active = { session, isProcessing: false, unsubscribe };
      this.activeSessions.set(sessionId, active);
    }

    const startTime = Date.now();
    const parts: Part[] = [];
    let currentAssistantMessage: AssistantMessage | null = null;
    let turnToolResults: ToolResultMessage[] = [];

    // 设置消息收集订阅
    const messageUnsubscribe = active.session.subscribe((event: AgentSessionEvent) => {
      if (event.type === 'turn_end') {
        if (event.message.role === 'assistant') {
          currentAssistantMessage = event.message as unknown as AssistantMessage;
        }
        turnToolResults = turnToolResults.concat(
          event.toolResults as unknown as ToolResultMessage[],
        );
      }
    });

    try {
      if (active.isProcessing) {
        // 会话忙碌，使用 followUp 排队
        console.log('[PiService] Session is busy, using followUp to queue message');
        active.isProcessing = true;
        await active.session.followUp(text);
      } else {
        // 会话空闲，直接 prompt
        console.log('[PiService] Session is idle, using prompt');
        active.isProcessing = true;
        await active.session.prompt(text);
      }

      // 等待处理完成（通过轮询检查 isProcessing 状态）
      await this.waitForProcessingComplete(active);
    } finally {
      messageUnsubscribe();
      active.isProcessing = false;
    }

    if (!currentAssistantMessage) {
      throw new Error('No response from Pi agent.');
    }

    // biome-ignore lint/suspicious/noExplicitAny: pi-coding-agent 库类型定义不完整
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
        // biome-ignore lint/suspicious/noExplicitAny: pi-coding-agent 库类型定义不完整
        modelID: (currentAssistantMessage as any).model,
        tokens: {
          // biome-ignore lint/suspicious/noExplicitAny: pi-coding-agent 库类型定义不完整
          input: (currentAssistantMessage as any).usage.input,
          // biome-ignore lint/suspicious/noExplicitAny: pi-coding-agent 库类型定义不完整
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

  /**
   * 等待会话处理完成
   * 通过轮询检查是否还有未完成的 turn
   */
  private async waitForProcessingComplete(
    active: ActiveSession,
    timeoutMs = 300000,
  ): Promise<void> {
    const startTime = Date.now();

    while (active.isProcessing) {
      if (Date.now() - startTime > timeoutMs) {
        console.warn('[PiService] Processing timeout, forcing completion');
        break;
      }
      // 等待一小段时间后重试
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}
