import type { ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import { larkRequest, parseFeishuUrl } from './lark_client';

const _tool: ToolDefinition = tool({
  description:
    '获取飞书 Docx 文档的详细信息（包含元数据和完整内容）。支持传入完整的 Docx URL 或 document_id。',
  args: {
    url: tool.schema
      .string()
      .optional()
      .describe('完整的飞书 Docx URL，例如：https://xxx.feishu.cn/docx/AbCdEfGh'),
    document_id: tool.schema.string().optional().describe('文档 ID（如果已知道，可直接传入）'),
  },
  async execute(args) {
    const LARK_APP_ID = process.env.LARK_APP_ID;
    const LARK_APP_SECRET = process.env.LARK_APP_SECRET;

    if (!LARK_APP_ID || !LARK_APP_SECRET) {
      throw new Error('LARK_APP_ID and LARK_APP_SECRET environment variables are required');
    }

    let documentId: string;

    if (args.document_id) {
      documentId = args.document_id;
    } else if (args.url) {
      const parsed = parseFeishuUrl(args.url);
      if (!parsed || parsed.type !== 'docx') {
        throw new Error(
          'Invalid Docx URL. Expected format: https://xxx.feishu.cn/docx/{document_id}',
        );
      }
      documentId = parsed.id;
    } else {
      throw new Error('Either url or document_id must be provided');
    }

    const metadataResult = (await larkRequest(
      LARK_APP_ID,
      LARK_APP_SECRET,
      `/docx/v1/documents/${documentId}`,
      {
        method: 'GET',
      },
    )) as { code: number; [key: string]: unknown };

    // 检查元数据是否获取成功
    if (metadataResult.code !== 0) {
      return JSON.stringify(metadataResult);
    }

    // 尝试获取文档内容（blocks 接口）
    let contentResult: unknown;
    try {
      contentResult = await larkRequest(
        LARK_APP_ID,
        LARK_APP_SECRET,
        `/docx/v1/documents/${documentId}/blocks`,
        {
          method: 'GET',
        },
      );
    } catch (error) {
      contentResult = { error: 'Failed to fetch content', details: String(error) };
    }

    const result = {
      code: 0,
      msg: 'success',
      data: {
        metadata: metadataResult,
        content: contentResult,
      },
    };

    return JSON.stringify(result);
  },
});

export default _tool;
