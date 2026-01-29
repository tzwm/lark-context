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
        tag: 'column_set',
        horizontal_spacing: '8px',
        horizontal_align: 'left',
        columns: [
          {
            tag: 'column',
            width: 'weighted',
            elements: [
              {
                tag: 'div',
                text: {
                  tag: 'plain_text',
                  content: '${model}',
                  text_size: 'notation',
                  text_align: 'left',
                  text_color: 'grey',
                  lines: 1,
                },
                margin: '0px 0px 0px 0px',
              },
            ],
            padding: '0px 0px 0px 0px',
            direction: 'vertical',
            horizontal_spacing: '8px',
            vertical_spacing: '8px',
            horizontal_align: 'left',
            vertical_align: 'top',
            margin: '0px 0px 0px 0px',
            weight: 1,
          },
          {
            tag: 'column',
            width: 'weighted',
            elements: [
              {
                tag: 'div',
                text: {
                  tag: 'plain_text',
                  content: '${info}',
                  text_size: 'notation',
                  text_align: 'right',
                  text_color: 'grey',
                  lines: 1,
                },
                margin: '0px 0px 0px 0px',
              },
            ],
            padding: '0px 0px 0px 0px',
            direction: 'vertical',
            horizontal_spacing: '8px',
            vertical_spacing: '8px',
            horizontal_align: 'left',
            vertical_align: 'top',
            margin: '0px 0px 0px 0px',
            weight: 2,
          },
        ],
        margin: '0px 0px 0px 0px',
      },
    ],
  },
};
