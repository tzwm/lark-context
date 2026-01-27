import 'dotenv/config';
import { OpenCodeService } from '../src/opencode/service.js';
import type { OpenCodeConfig } from '../src/types/index.js';

function getOpenCodeConfig(): OpenCodeConfig {
  const host = process.env.OPENCODE_HOST;
  const username = process.env.OPENCODE_SERVER_USERNAME;
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  const dataPath = process.env.DATA_PATH || './data';
  const timeout = Number.parseInt(process.env.OPENCODE_TIMEOUT || '60000', 10);

  if (!host) {
    throw new Error('OPENCODE_HOST is not set');
  }

  return {
    host,
    username,
    password,
    dataPath,
    timeout,
  };
}

async function testHealthCheck(service: OpenCodeService): Promise<boolean> {
  try {
    console.log('Testing health check...');
    const isHealthy = await service.healthCheck();
    console.log(`Health check result: ${isHealthy ? '✅ OK' : '❌ Failed'}`);
    return isHealthy;
  } catch (error) {
    console.error('❌ Health check failed:', error);
    return false;
  }
}

async function testCreateSession(service: OpenCodeService): Promise<string | null> {
  try {
    console.log('\nTesting session creation...');
    const sessionId = await service.createSession();
    console.log(`✅ Session created: ${sessionId}`);
    return sessionId;
  } catch (error) {
    console.error('❌ Session creation failed:', error);
    return null;
  }
}

async function testSendPrompt(
  service: OpenCodeService,
  sessionId: string,
): Promise<boolean> {
  try {
    console.log('\nTesting prompt sending...');
    const response = await service.sendPrompt(sessionId, 'Hello, can you respond with "test"?');
    console.log('✅ Prompt sent successfully');
    console.log('Response info:', JSON.stringify(response.info, null, 2));
    console.log('Response parts:', JSON.stringify(response.parts, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Prompt sending failed:', error);
    return false;
  }
}

async function testGetMessages(
  service: OpenCodeService,
  sessionId: string,
): Promise<boolean> {
  try {
    console.log('\nTesting get session messages...');
    const messages = await service.getSessionMessages(sessionId);
    console.log(`✅ Retrieved ${messages.length} messages`);
    return true;
  } catch (error) {
    console.error('❌ Get messages failed:', error);
    return false;
  }
}

async function testDeleteSession(
  service: OpenCodeService,
  sessionId: string,
): Promise<boolean> {
  try {
    console.log('\nTesting session deletion...');
    const deleted = await service.deleteSession(sessionId);
    console.log(`Session deletion result: ${deleted ? '✅ OK' : '❌ Failed'}`);
    return deleted;
  } catch (error) {
    console.error('❌ Session deletion failed:', error);
    return false;
  }
}

async function main() {
  console.log('🔍 OpenCode Service Test\n');
  console.log('='.repeat(50));

  try {
    const config = getOpenCodeConfig();
    console.log('Config loaded:');
    console.log(`  Host: ${config.host}`);
    console.log(`  Username: ${config.username || 'Not set'}`);
    console.log(`  Password: ${config.password ? '***' : 'Not set'}`);
    console.log('='.repeat(50));

    const service = new OpenCodeService(config);

    const healthOk = await testHealthCheck(service);
    if (!healthOk) {
      console.error('\n❌ Health check failed, stopping tests');
      process.exit(1);
    }

    const sessionId = await testCreateSession(service);
    if (!sessionId) {
      console.error('\n❌ Session creation failed, stopping tests');
      process.exit(1);
    }

    const promptOk = await testSendPrompt(service, sessionId);
    if (!promptOk) {
      console.error('\n❌ Prompt sending failed');
    }

    await testGetMessages(service, sessionId);
    await testDeleteSession(service, sessionId);

    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests completed');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();