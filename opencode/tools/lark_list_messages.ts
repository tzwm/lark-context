import lark from '@larksuiteoapi/node-sdk';
import { tool } from '@opencode-ai/plugin';

const _tool = tool({
  description:
    'Retrieve message history from Lark/Feishu chat or thread with filtering and pagination support',
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

    try {
      const larkClient = new lark.Client({
        appId: LARK_APP_ID,
        appSecret: LARK_APP_SECRET,
        appType: lark.AppType.SelfBuild,
        domain: lark.Domain.Feishu,
      });

      const result = await larkClient.im.message.list({
        params: {
          container_id_type: args.container_id_type,
          container_id: args.container_id,
          page_size: args.page_size,
          sort_type: args.sort_type,
          page_token: args.page_token,
          start_time: args.start_time,
          end_time: args.end_time,
        },
      });

      if (!result.data?.items) {
        return 'No messages found';
      }

      const messages = result.data.items.map(msg => {
        const msgData = msg as Record<string, unknown>;
        const sender = msgData.sender as Record<string, unknown> | undefined;
        const senderType = sender?.sender_type || 'unknown';
        const senderId =
          (sender?.sender_id as Record<string, unknown> | undefined)?.open_id || 'unknown';
        const msgType = msgData.msg_type || 'unknown';
        const createTime = msgData.create_time || 'unknown';
        const msgId = msgData.message_id || 'unknown';
        const contentStr = msgData.content as string | undefined;
        let content = '';

        try {
          if (contentStr) {
            const parsed = JSON.parse(contentStr);
            if (parsed.text) {
              content = parsed.text;
            } else if (parsed.elements) {
              content = parsed.elements.map((el: { text?: string }) => el.text || '').join('');
            } else {
              content = JSON.stringify(parsed);
            }
          }
        } catch {
          content = contentStr || '';
        }

        return `[${createTime}] ${msgType} | ${senderType} (${senderId}) | ${msgId}: ${content}`;
      });

      const response = messages.join('\n\n');

      if (result.data.has_more) {
        return `${response}\n\n---\nMore messages available. Use page_token: ${result.data.page_token} to fetch next page.`;
      }

      return response;
    } catch (error) {
      console.error('Error fetching Lark messages:', error);
      throw new Error(
        `Failed to fetch messages: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

export default _tool;
