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
  chatContextInjected: boolean;
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
    const workspacePath = process.env.PI_WORKSPACE_PATH || process.cwd();

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
      chatContextInjected: false,
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
    // 使用 agent_end 事件，等待所有 tool call 轮次完成
    if (event.type !== 'agent_end') {
      return;
    }

    const resolver = active.pendingQueue.shift();
    if (!resolver) {
      // 可能是 injectChatContext 触发的 agent_end，忽略
      console.log(
        '[PiService] agent_end received but no pending request (likely chat context injection)',
      );
      return;
    }

    console.log('[PiService] Processing agent_end, queue length:', active.pendingQueue.length);

    // 从 messages 中找到最后一个 assistant message
    const messages = event.messages as unknown as (AssistantMessage | ToolResultMessage)[];
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((m): m is AssistantMessage => (m as AssistantMessage).role === 'assistant');

    if (lastAssistantMessage) {
      // 收集所有的 tool results
      const toolResults = messages.filter(
        m => (m as ToolResultMessage).role === 'toolResult',
      ) as unknown as ToolResultMessage[];

      const parts = this.extractParts(lastAssistantMessage, toolResults);

      resolver.resolve({
        info: {
          // biome-ignore lint/suspicious/noExplicitAny: pi-coding-agent 库类型定义不完整
          modelID: (lastAssistantMessage as any).model,
          tokens: {
            // biome-ignore lint/suspicious/noExplicitAny: pi-coding-agent 库类型定义不完整
            input: (lastAssistantMessage as any).usage.input,
            // biome-ignore lint/suspicious/noExplicitAny: pi-coding-agent 库类型定义不完整
            output: (lastAssistantMessage as any).usage.output,
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

  async sendPrompt(
    sessionId: string,
    text: string,
    messageContext?: {
      senderName?: string;
      messageId?: string;
      mentions?: string[];
    },
    chatInfo?: ChatInfo,
  ): Promise<AssistantResponse> {
    const active = await this.getOrCreateSession(sessionId);

    const startTime = Date.now();

    // 构建带前缀的消息（包含 Chat 上下文和发送人信息）
    const enrichedText = this.buildEnrichedMessage(
      text,
      messageContext,
      chatInfo,
      !active.chatContextInjected,
    );
    active.chatContextInjected = true;

    const responsePromise = new Promise<AssistantResponse>((resolve, reject) => {
      active.pendingQueue.push({ startTime, resolve, reject });
    });

    // 根据是否正在 streaming 决定使用 prompt 还是 followUp
    if (active.session.isStreaming) {
      console.log(
        '[PiService] Session is streaming, using followUp, queue:',
        active.pendingQueue.length,
      );
      await active.session.followUp(enrichedText);
    } else {
      console.log('[PiService] Session is idle, using prompt');
      await active.session.prompt(enrichedText);
    }

    return responsePromise;
  }

  private buildEnrichedMessage(
    text: string,
    context?: {
      senderName?: string;
      messageId?: string;
      mentions?: string[];
    },
    chatInfo?: ChatInfo,
    isFirstMessage?: boolean,
  ): string {
    const prefixParts: string[] = [];

    // 第一次消息：添加 Chat 上下文
    if (isFirstMessage && chatInfo) {
      const isPrivateChat = chatInfo.chatType === 'p2p';
      const chatTypeInfo = isPrivateChat ? '私聊' : '群聊';

      prefixParts.push(
        `[Feishu Context: Chat=${chatInfo.chatId}, Type=${chatTypeInfo}${chatInfo.chatName ? `, Name=${chatInfo.chatName}` : ''}]`,
      );
    }

    // 发送人信息
    if (context?.senderName) {
      prefixParts.push(`[From: ${context.senderName}]`);
    }

    // @信息
    if (context?.mentions && context.mentions.length > 0) {
      prefixParts.push(`[Mentions: ${context.mentions.join(', ')}]`);
    }

    if (prefixParts.length === 0) return text;

    return `${prefixParts.join(' ')}\n\n${text}`;
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
