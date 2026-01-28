import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Get recent messages from Feishu chat",
  args: {
    count: tool.schema
      .number()
      .default(30)
      .describe("Number of recent messages to retrieve"),
  },
  async execute(args, context) {
    const LARK_APP_ID = process.env.LARK_APP_ID;
    const LARK_APP_SECRET = process.env.LARK_APP_SECRET;

    if (!LARK_APP_ID || !LARK_APP_SECRET) {
      throw new Error("LARK_APP_ID and LARK_APP_SECRET environment variables are required");
    }

    try {
      const { createOpencodeClient } = await import("@opencode-ai/sdk");
      const client = createOpencodeClient({
        baseUrl: process.env.OPENCODE_HOST || "http://localhost:4096",
      });

      const session = await client.session.get({
        path: { id: context.sessionID },
      });

      const sessionId = session.data.id;

      const { default: lark } = await import("@larksuiteoapi/node-sdk");
      const larkClient = new lark.Client({
        appId: LARK_APP_ID,
        appSecret: LARK_APP_SECRET,
        appType: lark.AppType.SelfBuild,
        domain: lark.Domain.Feishu,
      });

      const result = await larkClient.im.message.list({
        params: {
          container_id_type: "chat",
          container_id: sessionId,
          limit: args.count,
        },
      });

      if (!result.data?.items) {
        return "No messages found";
      }

      const messages = result.data.items.map((msg: any) => {
        const senderType = msg.sender?.sender_type || "unknown";
        const senderId = msg.sender?.sender_id?.open_id || "unknown";
        const msgType = msg.msg_type || "unknown";
        const createTime = msg.create_time || "unknown";
        let content = "";

        try {
          const parsed = JSON.parse(msg.content);
          if (parsed.text) {
            content = parsed.text;
          } else {
            content = JSON.stringify(parsed);
          }
        } catch {
          content = msg.content;
        }

        return `[${createTime}] ${senderType} (${senderId}): ${content}`;
      });

      return messages.join("\n\n");
    } catch (error) {
      console.error("Error fetching Feishu messages:", error);
      throw new Error(`Failed to fetch messages: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
