import * as fs from 'node:fs';
import type { AssistantMessage, ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import {
  type AgentSession,
  type AgentSessionEvent,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  createAgentSession,
  getAgentDir,
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
    // 使用全局 auth.json 和 models.json（~/.pi/agent/）
    const agentDir = getAgentDir();
    console.log('[PiService] Using agentDir:', agentDir);
    console.log('[PiService] PI_CODING_AGENT_DIR env:', process.env.PI_CODING_AGENT_DIR);

    this.authStorage = AuthStorage.create();
    this.modelRegistry = new ModelRegistry(this.authStorage);

    // 读取 settings.json
    try {
      const settingsPath = `${agentDir}/settings.json`;
      if (fs.existsSync(settingsPath)) {
        const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(settingsContent);
        console.log('[PiService] settings.json:', {
          defaultProvider: settings.defaultProvider,
          defaultModel: settings.defaultModel,
        });
      } else {
        console.log('[PiService] settings.json not found at:', settingsPath);
      }
    } catch (e) {
      console.log('[PiService] Could not read settings.json:', e);
    }

    // sessions 存储在 DATA_PATH 下
    this.piSessionsPath = `${dataPath}/pi-sessions`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const available = await this.modelRegistry.getAvailable();
      console.log(
        '[PiService] Available models:',
        available.map(m => ({ id: m.id, provider: m.provider })),
      );

      // 检查 auth.json
      try {
        // biome-ignore lint/suspicious/noExplicitAny: AuthStorage 内部结构
        const authData = (this.authStorage as any).data;
        console.log('[PiService] Auth data:', JSON.stringify(authData, null, 2));
      } catch (e) {
        console.log('[PiService] Could not read auth data:', e);
      }

      return available.length > 0;
    } catch (error) {
      console.error('PiService health check failed:', error);
      return false;
    }
  }

  async createSession(chatInfo: ChatInfo): Promise<string> {
    const workspacePath = process.env.PI_WORKSPACE_PATH || process.cwd();
    const agentDir = getAgentDir();

    console.log('[PiService] createSession called');
    console.log('[PiService] agentDir for createAgentSession:', agentDir);
    console.log('[PiService] PI_CODING_AGENT_DIR:', process.env.PI_CODING_AGENT_DIR);

    const { session } = await createAgentSession({
      cwd: workspacePath,
      agentDir, // 显式传递 agentDir，确保使用全局配置
      sessionManager: SessionManager.create(workspacePath, this.piSessionsPath),
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
    console.log('[PiService] Using piSessionsPath:', this.piSessionsPath);

    const { session } = await createAgentSession({
      cwd: workspacePath,
      sessionManager: SessionManager.open(sessionId, this.piSessionsPath),
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
    // 使用 agent_end 事件，等待所有 tool call 轮次完成
    if (event.type !== 'agent_end') {
      return;
    }

    console.log('[PiService] handleSessionEvent: agent_end received');

    const resolver = active.pendingQueue.shift();
    if (!resolver) {
      console.warn('[PiService] agent_end received but no pending request');
      return;
    }

    console.log('[PiService] Processing agent_end, queue length:', active.pendingQueue.length);

    // 从 messages 中找到最后一个 assistant message
    const messages = event.messages as unknown as (AssistantMessage | ToolResultMessage)[];
    console.log('[PiService] agent_end messages count:', messages.length);

    const lastAssistantMessage = [...messages]
      .reverse()
      .find((m): m is AssistantMessage => (m as AssistantMessage).role === 'assistant');

    console.log('[PiService] Found assistant message:', !!lastAssistantMessage);

    if (lastAssistantMessage) {
      // biome-ignore lint/suspicious/noExplicitAny: pi-coding-agent 库类型定义不完整
      const assistantMsg = lastAssistantMessage as any;
      console.log('[PiService] Assistant message details:', {
        model: assistantMsg.model,
        provider: assistantMsg.provider,
        stopReason: assistantMsg.stopReason,
        errorMessage: assistantMsg.errorMessage,
        contentLength: assistantMsg.content?.length,
        usage: assistantMsg.usage,
      });

      // 收集所有的 tool results
      const toolResults = messages.filter(
        m => (m as ToolResultMessage).role === 'toolResult',
      ) as unknown as ToolResultMessage[];

      const parts = this.extractParts(lastAssistantMessage, toolResults);
      console.log('[PiService] Extracted parts count:', parts.length);
      console.log('[PiService] Parts:', JSON.stringify(parts, null, 2));

      resolver.resolve({
        info: {
          // biome-ignore lint/suspicious/noExplicitAny: pi-coding-agent 库类型定义不完整
          modelID: assistantMsg.model,
          tokens: {
            // biome-ignore lint/suspicious/noExplicitAny: pi-coding-agent 库类型定义不完整
            input: assistantMsg.usage.input,
            // biome-ignore lint/suspicious/noExplicitAny: pi-coding-agent 库类型定义不完整
            output: assistantMsg.usage.output,
          },
          time: {
            created: resolver.startTime,
            completed: Date.now(),
          },
        },
        parts,
      });
    } else {
      console.error('[PiService] No assistant message found in agent_end event');
      resolver.reject(new Error('Expected assistant message'));
    }
  }

  async sendPrompt(sessionId: string, text: string): Promise<AssistantResponse> {
    const active = await this.getOrCreateSession(sessionId);

    const startTime = Date.now();

    console.log('[PiService] sendPrompt called, text length:', text.length);
    console.log('[PiService] Message preview:', text.substring(0, 200));

    // 将添加 resolver 和调用 prompt 都放在 Promise executor 中同步执行
    const responsePromise = new Promise<AssistantResponse>((resolve, reject) => {
      // 先添加 resolver 到 queue
      active.pendingQueue.push({ startTime, resolve, reject });
      console.log('[PiService] Added resolver to queue, length:', active.pendingQueue.length);

      // 根据是否正在 streaming 决定使用 prompt 还是 followUp
      if (active.session.isStreaming) {
        console.log(
          '[PiService] Session is streaming, using followUp, queue:',
          active.pendingQueue.length,
        );
        active.session.followUp(text).catch(reject);
      } else {
        console.log('[PiService] Session is idle, using prompt');
        console.log('[PiService] Calling session.prompt...');
        active.session.prompt(text).catch(err => {
          console.error('[PiService] session.prompt error:', err);
          reject(err);
        });
      }
    });

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
