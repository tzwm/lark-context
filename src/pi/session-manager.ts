import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { SessionMapping } from '../types/index.js';

export class SessionManager {
  private sessionsFilePath: string;
  private sessions: Map<string, SessionMapping>;

  constructor(dataPath: string) {
    this.sessionsFilePath = path.join(dataPath, 'sessions.json');
    this.sessions = new Map();
  }

  async loadSessions(): Promise<void> {
    try {
      const data = await fs.readFile(this.sessionsFilePath, 'utf-8');
      const sessions = JSON.parse(data) as Record<string, SessionMapping>;
      this.sessions = new Map(Object.entries(sessions));
      console.log('[SessionManager] Loaded sessions:', this.sessions.size);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('[SessionManager] No sessions file found, starting fresh');
        this.sessions = new Map();
      } else {
        console.error('[SessionManager] Failed to load sessions:', error);
        throw error;
      }
    }
  }

  async saveSessions(): Promise<void> {
    try {
      const sessionsObj = Object.fromEntries(this.sessions);
      await fs.writeFile(this.sessionsFilePath, JSON.stringify(sessionsObj, null, 2), 'utf-8');
      console.log('[SessionManager] Sessions saved');
    } catch (error) {
      console.error('[SessionManager] Failed to save sessions:', error);
      throw error;
    }
  }

  async getOrCreateSession(threadId: string): Promise<string> {
    await this.loadSessions();

    const existing = this.sessions.get(threadId);
    if (existing) {
      console.log('[SessionManager] Found existing session for thread:', threadId);
      await this.updateLastUsed(threadId);
      return existing.sessionId;
    }

    console.log('[SessionManager] Creating new session for thread:', threadId);
    const newSession: SessionMapping = {
      sessionId: '',
      threadId,
      lastUsed: new Date().toISOString(),
    };

    this.sessions.set(threadId, newSession);
    await this.saveSessions();

    return newSession.sessionId;
  }

  async updateSessionId(threadId: string, sessionId: string): Promise<void> {
    await this.loadSessions();

    const existing = this.sessions.get(threadId);
    if (existing) {
      existing.sessionId = sessionId;
      existing.lastUsed = new Date().toISOString();
    } else {
      this.sessions.set(threadId, {
        sessionId,
        threadId,
        lastUsed: new Date().toISOString(),
      });
    }

    await this.saveSessions();
  }

  async updateLastUsed(threadId: string): Promise<void> {
    const session = this.sessions.get(threadId);
    if (session) {
      session.lastUsed = new Date().toISOString();
      await this.saveSessions();
    }
  }

  async getAllSessions(): Promise<Record<string, SessionMapping>> {
    await this.loadSessions();
    return Object.fromEntries(this.sessions);
  }

  async deleteSession(threadId: string): Promise<void> {
    await this.loadSessions();
    this.sessions.delete(threadId);
    await this.saveSessions();
    console.log('[SessionManager] Session deleted for thread:', threadId);
  }

  async cleanupOldSessions(days = 30): Promise<number> {
    await this.loadSessions();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let deletedCount = 0;

    for (const [chatId, session] of this.sessions.entries()) {
      const lastUsed = new Date(session.lastUsed);
      if (lastUsed < cutoffDate) {
        this.sessions.delete(chatId);
        deletedCount++;
        console.log('[SessionManager] Cleaning up old session:', chatId);
      }
    }

    if (deletedCount > 0) {
      await this.saveSessions();
    }

    return deletedCount;
  }
}
