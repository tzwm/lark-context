# Lark Bot Implementation Plan

## Phase 1: Project Setup

1. **Complete README**
   - Add installation instructions
   - Add configuration guide (.env setup)
   - Add development and production run commands
   - Add Docker deployment instructions

2. **Initialize Project Structure**
   - Create `package.json` with dependencies
   - Setup TypeScript configuration (`tsconfig.json`)
   - Create `.env.example` template
   - Create `.gitignore`
   - Setup pnpm workspace

3. **Directory Structure**
   ```
   src/
     ├── index.ts          # Entry point
     ├── bot/              # Feishu bot logic
     │   ├── index.ts
     │   ├── handler.ts    # Message handler
     │   └── utils.ts      # Helper functions
     └── types/            # TypeScript types
   ```

## Phase 2: Feishu Bot Implementation

1. **Basic Bot Setup**
   - Initialize Lark SDK client
   - Setup webhook endpoint
   - Implement event verification
   - Handle message events

2. **Message Handling**
   - Parse incoming messages
   - Extract @bot mentions
   - Process message content
   - Send responses back to Feishu

3. **Session Management**
   - Create session manager for per-group sessions
   - Map Feishu chat_id to session IDs
   - Store session state (in-memory for now)

4. **Error Handling**
   - Handle timeout errors
   - Handle API errors
   - Log errors appropriately

## Phase 3: Testing (Without OpenCode SDK)

1. **Manual Testing**
   - Deploy bot locally
   - Test webhook endpoint
   - Send test messages via Feishu
   - Verify responses

2. **Integration Tests**
   - Test message parsing
   - Test @bot mention detection
   - Test response formatting

## Phase 4: Docker Deployment

1. **Docker Configuration**
   - Create `Dockerfile`
   - Create `.dockerignore`
   - Optimize image size

2. **Deployment**
   - Build Docker image
   - Test container locally
   - Document deployment process

## Phase 5: Future Enhancements (Not in this phase)

- OpenCode SDK integration
- Persistent session storage (Redis/Database)
- Advanced message formatting
- Rate limiting
- Monitoring and logging

## Implementation Order

1. Complete README and setup project structure
2. Implement basic Feishu bot with webhook
3. Add message handling and @bot detection
4. Implement session management
5. Test bot without OpenCode SDK
6. Setup Docker deployment
