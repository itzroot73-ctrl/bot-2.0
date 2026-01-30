import { Client, GatewayIntentBits, Events } from 'discord.js';
import Logger from '../utils/Logger.js';

export class DiscordHandler {
    constructor(config, botInstance) {
        this.config = config;
        this.bot = botInstance; // Reference to Minecraft Bot wrapper
        this.client = null;
        this.channel = null;
    }

    async init() {
        if (!this.config.discord?.token || this.config.discord?.token.includes('PASTE')) {
            Logger.info('Discord integration skipped (Token missing).');
            return;
        }

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        this.client.once(Events.ClientReady, async (c) => {
            Logger.success(`Discord Connected as ${c.user.tag}`);

            try {
                this.channel = await this.client.channels.fetch(this.config.discord.channelId);
                if (this.channel) {
                    this.channel.send('✅ **Minecraft Bot Online!** (AFK Mode: ON) [v3.2]');
                }
            } catch (error) {
                Logger.error(`Discord Channel Error: ${error.message}`);
                Logger.system(`👉 Verify ID: ${this.config.discord.channelId}`);
                Logger.system("👉 Tip: Enable Developer Mode in Discord -> Right Click Channel -> Copy ID");
            }
        });

        this.client.on(Events.MessageCreate, (message) => {
            if (message.author.bot) return;
            if (message.channel.id !== this.config.discord.channelId) return;

            // Relay to Minecraft
            const content = message.content;
            if (this.bot.mcBot) {
                if (content.startsWith('!')) {
                    // Execute command
                    this.bot.handleCommand(content.slice(1), "Discord");
                } else {
                    // Chat
                    this.bot.mcBot.chat(`[Discord] ${message.author.username}: ${content}`);
                    Logger.discord(message.author.username, content);
                }
            }
        });

        try {
            await this.client.login(this.config.discord.token);
        } catch (error) {
            Logger.error(`Discord Login Failed: ${error.message}`);
        }
    }

    send(message) {
        if (this.channel) this.channel.send(message).catch(() => { });
    }
}
