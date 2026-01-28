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

  formatResponse(response: {
    info: AssistantMessage;
    parts: Part[];
  }): string {
    const blocks: Array<Array<{ tag: string; text?: string; style?: string }>> = [];

    if (!response.parts || !Array.isArray(response.parts)) {
      return 'No response content available';
    }

    for (const part of response.parts) {
      if (part.type === 'text') {
        const lines = part.text.split('\n');
        for (const line of lines) {
          if (line.startsWith('```')) {
            blocks.push([
              {
                tag: 'text',
                text: line,
                style: 'code',
              },
            ]);
          } else if (line.startsWith('# ')) {
            blocks.push([
              {
                tag: 'text',
                text: line.substring(2),
                style: 'heading',
              },
            ]);
          } else if (line.startsWith('## ')) {
            blocks.push([
              {
                tag: 'text',
                text: line.substring(3),
                style: 'subheading',
              },
            ]);
          } else if (line.startsWith('### ')) {
            blocks.push([
              {
                tag: 'text',
                text: line.substring(4),
                style: 'subsubheading',
              },
            ]);
          } else if (line.startsWith('- ')) {
            blocks.push([
              {
                tag: 'text',
                text: `• ${line.substring(2)}`,
              },
            ]);
          } else if (line.match(/^\d+\. /)) {
            blocks.push([
              {
                tag: 'text',
                text: line,
              },
            ]);
          } else if (line.startsWith('> ')) {
            blocks.push([
              {
                tag: 'text',
                text: line.substring(2),
                style: 'quote',
              },
            ]);
          } else if (line.trim() === '') {
            blocks.push([]);
          } else {
            blocks.push([
              {
                tag: 'text',
                text: line,
              },
            ]);
          }
        }
      } else if (part.type === 'tool') {
        blocks.push([
          {
            tag: 'text',
            text: `🔧 **Tool**: ${part.tool}`,
          },
        ]);
        blocks.push([
          {
            tag: 'text',
            text: `Status: ${part.state.status}`,
          },
        ]);
        if (part.state.status === 'completed') {
          blocks.push([
            {
              tag: 'text',
              text: part.state.output,
            },
          ]);
        } else if (part.state.status === 'error') {
          blocks.push([
            {
              tag: 'text',
              text: `Error: ${part.state.error}`,
              style: 'quote',
            },
          ]);
        }
      } else if (part.type === 'file') {
        blocks.push([
          {
            tag: 'text',
            text: `📄 File: ${part.filename || part.url}`,
          },
        ]);
      } else if (part.type === 'reasoning') {
        blocks.push([
          {
            tag: 'text',
            text: `🤔 *Reasoning*: ${part.text}`,
          },
        ]);
      }
    }

    if (response.info?.tokens) {
      blocks.push([]);
      blocks.push([
        {
          tag: 'text',
          text: '---',
        },
      ]);
      blocks.push([
        {
          tag: 'text',
          text: `Tokens: ${response.info.tokens.input} in, ${response.info.tokens.output} out`,
        },
      ]);
      blocks.push([
        {
          tag: 'text',
          text: `Cost: $${response.info.cost.toFixed(4)}`,
        },
      ]);
    }

    return JSON.stringify({
      post: {
        zh_cn: {
          title: '',
          content: blocks,
        },
      },
    });
  }
}
