export interface MessageEvent {
  schema: string;
  header: {
    event_id: string;
    event_type: string;
    event_time: number;
    tenant_key: string;
    app_id: string;
  };
  event: {
    sender: {
      sender_id: {
        open_id: string;
        user_id: string;
        union_id: string;
      };
      sender_type: string;
      tenant_key: string;
    };
    message: {
      message_id: string;
      chat_id: string;
      chat_type: string;
      content: string;
      msg_type: string;
      create_time: string;
      update_time: string;
      deleted: boolean;
      updated_by_multi?: boolean;
      parent_id?: string;
      thread_id?: string;
      mentions?: Mention[];
    };
  };
}

export interface Mention {
  key: string;
  id: string;
  name: string;
  type: string;
}

export interface MessageContent {
  text: string;
  mentions?: Mention[];
}
