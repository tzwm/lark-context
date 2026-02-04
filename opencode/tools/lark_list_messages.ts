import type { ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import { larkRequest } from './lark_client';

const _tool: ToolDefinition = tool({
  description:
    'Retrieve message history from Lark/Feishu chat or thread with filtering and pagination support. Returns the raw API response.',
  args: {
    container_id: tool.schema
      .string()
      .describe('Feishu container ID (chat_id for group chats, or thread_id for threads)'),
    container_id_type: tool.schema
      .enum(['chat', 'thread'])
      .default('chat')
      .describe("Container type: 'chat' for group chats, 'thread' for threads"),
    page_size: tool.schema
      .number()
      .min(1)
      .max(100)
      .default(30)
      .describe('Number of messages per page (1-100)'),
    page_token: tool.schema
      .string()
      .optional()
      .describe('Pagination token for retrieving next page of results'),
    start_time: tool.schema
      .string()
      .optional()
      .describe('Start timestamp (ms) for message filtering'),
    end_time: tool.schema.string().optional().describe('End timestamp (ms) for message filtering'),
    sort_type: tool.schema
      .enum(['ByCreateTimeAsc', 'ByCreateTimeDesc'])
      .default('ByCreateTimeDesc')
      .describe(
        "Sort order: 'ByCreateTimeAsc' for oldest first, 'ByCreateTimeDesc' for newest first",
      ),
  },
  async execute(args) {
    const LARK_APP_ID = process.env.LARK_APP_ID;
    const LARK_APP_SECRET = process.env.LARK_APP_SECRET;

    if (!LARK_APP_ID || !LARK_APP_SECRET) {
      throw new Error('LARK_APP_ID and LARK_APP_SECRET environment variables are required');
    }

    const searchParams = new URLSearchParams();
    searchParams.append('container_id_type', args.container_id_type);
    searchParams.append('container_id', args.container_id);
    searchParams.append('page_size', String(args.page_size));
    searchParams.append('sort_type', args.sort_type);

    if (args.page_token) {
      searchParams.append('page_token', args.page_token);
    }
    if (args.start_time) {
      searchParams.append('start_time', args.start_time);
    }
    if (args.end_time) {
      searchParams.append('end_time', args.end_time);
    }

    const endpoint = `/im/v1/messages?${searchParams.toString()}`;

    const result = await larkRequest(LARK_APP_ID, LARK_APP_SECRET, endpoint, {
      method: 'GET',
    });

    return JSON.stringify(result);
  },
});

export default _tool;
