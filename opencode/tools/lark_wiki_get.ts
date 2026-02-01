import { tool } from '@opencode-ai/plugin';
import { larkRequest, parseFeishuUrl } from './lark_client';

const _tool = tool({
  description: `获取飞书 Wiki 知识库节点的索引信息（如节点类型、标题、obj_token 等）。

注意：此工具只返回 Wiki 节点的元数据索引，不返回具体内容。
根据返回的 node_type 和 obj_token，使用对应类型的工具获取详细内容：
- docx：使用 lark_docx_get 工具
- sheet：表格内容（待支持）
- mindnote：思维导图内容（待支持）
- bitable：使用 lark_bitable_get 工具
- file：文件内容（待支持）
- slides：幻灯片内容（待支持）

支持的 URL 格式：https://xxx.feishu.cn/wiki/{node_token}`,
  args: {
    url: tool.schema
      .string()
      .optional()
      .describe('完整的飞书 Wiki URL，例如：https://xxx.feishu.cn/wiki/AbCdEfGh'),
    node_token: tool.schema
      .string()
      .optional()
      .describe('Wiki 节点 token（如果已知道，可直接传入）'),
  },
  async execute(args) {
    const LARK_APP_ID = process.env.LARK_APP_ID;
    const LARK_APP_SECRET = process.env.LARK_APP_SECRET;

    if (!LARK_APP_ID || !LARK_APP_SECRET) {
      throw new Error('LARK_APP_ID and LARK_APP_SECRET environment variables are required');
    }

    let nodeToken: string;

    if (args.node_token) {
      nodeToken = args.node_token;
    } else if (args.url) {
      const parsed = parseFeishuUrl(args.url);
      if (!parsed || parsed.type !== 'wiki') {
        throw new Error(
          'Invalid Wiki URL. Expected format: https://xxx.feishu.cn/wiki/{node_token}',
        );
      }
      nodeToken = parsed.id;
    } else {
      throw new Error('Either url or node_token must be provided');
    }

    const result = await larkRequest(
      LARK_APP_ID,
      LARK_APP_SECRET,
      `/wiki/v2/spaces/get_node?token=${nodeToken}`,
      { method: 'GET' },
    );

    return JSON.stringify(result);
  },
});

export default _tool;
