export const messageTemplate = {
  schema: '2.0',
  config: {
    update_multi: true,
    style: {
      text_size: {
        normal_v2: {
          default: 'normal',
          pc: 'normal',
          mobile: 'heading',
        },
      },
    },
  },
  body: {
    direction: 'vertical',
    horizontal_spacing: '8px',
    vertical_spacing: '8px',
    horizontal_align: 'left',
    vertical_align: 'top',
    padding: '12px 12px 12px 12px',
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'plain_text',
          content: '${thinking}',
          text_size: 'notation',
          text_align: 'left',
          text_color: 'grey',
        },
        margin: '0px 0px 0px 0px',
      },
      {
        tag: 'markdown',
        content: '',
        text_align: 'left',
        text_size: 'normal_v2',
        margin: '0px 0px 0px 0px',
      },
      {
        tag: 'markdown',
        content: '${body}',
        text_align: 'left',
        text_size: 'normal_v2',
        margin: '0px 0px 0px 0px',
      },
      {
        tag: 'hr',
        margin: '0px 0px 0px 0px',
      },
      {
        tag: 'div',
        text: {
          tag: 'plain_text',
          content: '',
          text_size: 'normal_v2',
          text_align: 'left',
          text_color: 'default',
        },
        margin: '0px 0px 0px 0px',
      },
      {
        tag: 'div',
        text: {
          tag: 'plain_text',
          content: '${info}',
          text_size: 'notation',
          text_align: 'right',
          text_color: 'grey',
        },
        margin: '-14px 0px 0px 0px',
      },
    ],
  },
};
