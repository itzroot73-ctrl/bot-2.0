import mineflayer from 'mineflayer';
import readline from 'readline';
import Logger from './utils/Logger.js';
import { DiscordHandler } from './modules/DiscordHandler.js';

export class Bot {
    constructor(config) {
        this.config = config;
        this.mcBot = null;
        this.discord = new DiscordHandler(config, this);
        this.afkInterval = null;
        this.afkEnabled = true;

        // Setup Readline
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: '' // Handled by Logger
        });
        Logger.setReadline(this.rl);
    }

    async init() {
        Logger.showBanner();
        // Init Discord
        await this.discord.init();

        this.connect();
        this.setupConsole();
    }

    connect() {
        Logger.info(`Connecting to ${this.config.host}:${this.config.port} as ${this.config.username}...`);

        const botOptions = {
            host: this.config.host,
            port: this.config.port,
            username: this.config.username,
            auth: this.config.auth,
            version: this.config.version || false,
            hideErrors: true,
            loadInternalPlugins: false // Fix: Disable inventory plugin to prevent crashes
        };

        this.mcBot = mineflayer.createBot(botOptions);

        // Manually load essential plugins (Excluding buggy inventory)
        const registry = require('mineflayer').plugins;
        const safePlugins = [
            registry.loader,
            registry.game,
            registry.kick,
            registry.chat,
            registry.time,
            registry.health,
            registry.settings,
            registry.entities,
            registry.physics,
            registry.pathfinder
        ];

        safePlugins.forEach(plugin => {
            if (plugin) this.mcBot.loadPlugin(plugin);
        });

        this.setupEvents();
    }

    setupEvents() {
        this.mcBot.on('login', () => {
            Logger.success(`Logged in as ${this.mcBot.username}`);
            this.startAFK();
            this.discord.send(`✅ **Logged in as ${this.mcBot.username}**`);
        });

        this.mcBot.on('spawn', () => {
            Logger.info("Bot Spawned! 🌍");
        });

        this.mcBot.on('end', () => {
            Logger.error('Disconnected. Reconnecting in 10s...');
            this.stopAFK();
            setTimeout(() => this.connect(), 10000);
        });

        this.mcBot.on('kicked', (reason) => {
            Logger.error(`Kicked: ${JSON.stringify(reason)}`);
        });

        this.mcBot.on('error', (err) => {
            // Suppress known inventory crash if it happens locally
            if (err.message.includes('assert.ok(slot >= 0)')) return;
            Logger.error(`Error: ${err.message}`);
        });

        this.mcBot.on('messagestr', (message, position) => {
            if (position === 'game_info') return;
            Logger.chat('Server', message);

            // Auto-Replies
            this.checkTriggers(message);
        });
    }

    setupConsole() {
        this.rl.on('line', (input) => {
            const raw = input.trim();
            if (!raw) return;

            if (raw.startsWith('!')) {
                this.handleCommand(raw.slice(1), "Console");
            } else {
                if (this.mcBot) {
                    this.mcBot.chat(raw);
                    Logger.chat('YOU', raw);
                } else {
                    Logger.error("Bot disconnected.");
                }
            }
            // re-prompt handled by Logger
        });
    }

    checkTriggers(message) {
        if (!this.config.triggers) return;
        this.config.triggers.forEach(t => {
            if (message.includes(t.trigger)) {
                Logger.info(`Trigger matched: "${t.trigger}" -> Reply: "${t.reply}"`);
                this.mcBot.chat(t.reply);
            }
        });
    }

    handleCommand(cmdString, source) {
        const args = cmdString.split(' ');
        const command = args[0].toLowerCase();

        switch (command) {
            case 'afk':
                if (args[1] === 'on') {
                    this.afkEnabled = true;
                    this.startAFK();
                    Logger.info("AFK Mode Enabled ✅");
                } else if (args[1] === 'off') {
                    this.afkEnabled = false;
                    this.stopAFK();
                    Logger.info("AFK Mode Disabled 🛑");
                }
                break;

            case 'time': // !time set America/New_York
                // Implementation left as exercise or kept simple
                Logger.info("Timezone changing not fully ported yet.");
                break;

            case 'help':
                Logger.info("Commands: !afk on/off, !setreply, !quit");
                break;

            case 'quit':
                process.exit(0);
                break;

            default:
                if (this.mcBot) this.mcBot.chat(`/${cmdString}`); // Send as command to server
                break;
        }
    }

    startAFK() {
        if (this.afkInterval) clearInterval(this.afkInterval);
        if (!this.afkEnabled) return;

        this.afkInterval = setInterval(() => {
            if (!this.mcBot || !this.mcBot.entity) return;

            const action = Math.floor(Math.random() * 3);
            try {
                switch (action) {
                    case 0:
                        this.mcBot.setControlState('jump', true);
                        setTimeout(() => this.mcBot.setControlState('jump', false), 500);
                        break;
                    case 1:
                        this.mcBot.swingArm();
                        break;
                    case 2:
                        const yaw = Math.random() * Math.PI - (Math.PI / 2);
                        this.mcBot.look(yaw, 0);
                        break;
                }
            } catch (e) { } // Ignore physics errors
        }, 5000);
    }

    stopAFK() {
        if (this.afkInterval) clearInterval(this.afkInterval);
    }
}
