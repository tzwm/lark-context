import type { ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import { larkRequest, parseFeishuUrl } from './lark_client';

const _tool: ToolDefinition = tool({
  description: '获取飞书多维表格(Bitable)的详细信息。支持传入完整的 Bitable URL 或 app_token。',
  args: {
    url: tool.schema
      .string()
      .optional()
      .describe('完整的飞书 Bitable URL，例如：https://xxx.feishu.cn/base/AbCdEfGh'),
    app_token: tool.schema
      .string()
      .optional()
      .describe('多维表格 app_token（如果已知道，可直接传入）'),
  },
  async execute(args) {
    const LARK_APP_ID = process.env.LARK_APP_ID;
    const LARK_APP_SECRET = process.env.LARK_APP_SECRET;

    if (!LARK_APP_ID || !LARK_APP_SECRET) {
      throw new Error('LARK_APP_ID and LARK_APP_SECRET environment variables are required');
    }

    let appToken: string;

    if (args.app_token) {
      appToken = args.app_token;
    } else if (args.url) {
      const parsed = parseFeishuUrl(args.url);
      if (!parsed || parsed.type !== 'bitable') {
        throw new Error(
          'Invalid Bitable URL. Expected format: https://xxx.feishu.cn/base/{app_token}',
        );
      }
      appToken = parsed.id;
    } else {
      throw new Error('Either url or app_token must be provided');
    }

    const endpoint = `/bitable/v1/apps/${appToken}`;

    const result = await larkRequest(LARK_APP_ID, LARK_APP_SECRET, endpoint, {
      method: 'GET',
    });

    return JSON.stringify(result);
  },
});

export default _tool;
