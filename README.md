# Lark Context Bot

Feishu bot integrated with OpenCode AI programming assistant.

## Features

- Each Feishu group shares one OpenCode session
- Trigger AI responses via `@bot` mentions
- Support Markdown formatted output
- Automatic timeout and error handling

## Usage

1. Send a message in a Feishu group: `@bot help me write a quick sort function function`
2. Bot will automatically respond with AI-generated code
3. Direct messages to the bot are also supported

## Feishu App Configuration

### Permissions

Configure the following permissions in the Feishu Open Platform:

- `im:message` - Receive messages
- `im:message:group_at_msg` - Group @ messages
- `im:message:send_as_bot` - Send messages

### Event Subscription

Subscribe to the following events:

- `im.message.receive_v1` - Receive message events

## Tech Stack

- Node.js 24+
- TypeScript
- pnpm
- @opencode-ai/sdk
- @larksuiteoapi/node-sdk

## Installation

```bash
# Install dependencies
pnpm install

# Copy environment variable template
cp .env.example .env

# Edit .env file and fill in Feishu app configuration
```

## Configuration

Configure the following variables in `.env` file:

```
LARK_APP_ID=your_app_id
LARK_APP_SECRET=your_app_secret
LARK_VERIFICATION_TOKEN=your_verification_token
LARK_ENCRYPT_KEY=your_encrypt_key
PORT=3000
```

## Running

```bash
# Development mode
pnpm dev

# Production mode
pnpm build
pnpm start
```

## Docker Deployment

```bash
# Build image
docker build -t lark-context .

# Run container
docker run -d -p 3000:3000 --env-file .env lark-context
```

## License

Apache-2.0
