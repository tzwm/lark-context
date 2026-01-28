import type { BotHandler } from './handler.js';

export interface Command {
  name: string;
  description: string;
  execute(botHandler: BotHandler, chatId: string, args: string[]): Promise<void>;
}

export class CommandHandler {
  private commands = new Map<string, Command>();

  register(command: Command): void {
    this.commands.set(command.name, command);
  }

  async execute(botHandler: BotHandler, chatId: string, query: string): Promise<boolean> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery.startsWith('/')) {
      return false;
    }

    const parts = trimmedQuery.split(' ');
    const commandName = parts[0].substring(1);
    const args = parts.slice(1);

    const command = this.commands.get(commandName);
    if (!command) {
      return false;
    }

    await command.execute(botHandler, chatId, args);
    return true;
  }

  getHelp(): string {
    const help = ['可用命令：'];
    for (const command of this.commands.values()) {
      help.push(`  /${command.name} - ${command.description}`);
    }
    return help.join('\n');
  }
}
