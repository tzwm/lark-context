import type { AssistantMessage, Message, Part } from '@opencode-ai/sdk';
import { createOpencodeClient } from '@opencode-ai/sdk';
import type { OpenCodeConfig } from '../types/index.js';

const SYSTEM_PROMPT = `You are an AI assistant integrated with Feishu/Lark.
You can access chat history using the 'feishu' tool to get context.

When users ask about recent messages, use the feishu tool to retrieve them.
Always include sender information when referencing messages.

You are working in a collaborative environment. Be helpful, concise, and provide clear answers.`;

export class OpenCodeService {
  private client: ReturnType<typeof createOpencodeClient>;

  constructor(config: OpenCodeConfig) {
    const username = config.username || 'opencode';
    const auth = config.password ? `${username}:${config.password}` : undefined;

    this.client = createOpencodeClient({
      baseUrl: config.host,
      ...(auth
        ? {
            auth: auth,
            security: [{ type: 'http', scheme: 'basic' }],
          }
        : {}),
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.global.event();
      return true;
    } catch (error) {
      console.error('OpenCode health check failed:', error);
      return false;
    }
  }

  async createSession(): Promise<string> {
    try {
      console.log('[OpenCode] Creating session...');
      const createResult = await this.client.session.create({
        body: {},
      });

      console.log('[OpenCode] Create result:', JSON.stringify(createResult, null, 2));

      if (!createResult.data) {
        throw new Error('Failed to create session: No data returned');
      }

      const sessionId = createResult.data.id;
      console.log('[OpenCode] Session created:', sessionId);

      console.log('[OpenCode] Setting system prompt...');
      await this.client.session.prompt({
        path: { id: sessionId },
        body: {
          noReply: true,
          parts: [
            {
              type: 'text',
              text: SYSTEM_PROMPT,
            },
          ],
        },
      });

      console.log('[OpenCode] System prompt set');
      return sessionId;
    } catch (error) {
      console.error('[OpenCode] Failed to create session:', error);
      throw error;
    }
  }

  async sendPrompt(
    sessionId: string,
    text: string,
  ): Promise<{
    info: AssistantMessage;
    parts: Part[];
  }> {
    try {
      console.log('[OpenCode] Sending prompt to session:', sessionId);

      const result = await this.client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [
            {
              type: 'text',
              text,
            },
          ],
        },
      });

      console.log('[OpenCode] Prompt result:', JSON.stringify(result, null, 2));

      if (!result.data) {
        throw new Error('No response from OpenCode');
      }

      if (!result.data.parts && !result.data.info) {
        console.error('[OpenCode] Invalid response structure:', result.data);
        throw new Error('OpenCode returned empty or invalid response. Check server configuration.');
      }

      return result.data;
    } catch (error) {
      console.error('[OpenCode] Failed to send prompt:', error);
      throw error;
    }
  }

  async getSessionMessages(sessionId: string): Promise<
    {
      info: Message;
      parts: Part[];
    }[]
  > {
    try {
      const result = await this.client.session.messages({
        path: { id: sessionId },
      });

      if (!result.data) {
        return [];
      }

      return result.data;
    } catch (error) {
      console.error('[OpenCode] Failed to get session messages:', error);
      throw error;
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      console.log('[OpenCode] Deleting session:', sessionId);

      const result = await this.client.session.delete({
        path: { id: sessionId },
      });

      if (!result.data) {
        return false;
      }

      return result.data;
    } catch (error) {
      console.error('[OpenCode] Failed to delete session:', error);
      throw error;
    }
  }
}
