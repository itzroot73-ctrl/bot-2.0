import mineflayer from 'mineflayer';
import readline from 'readline';
import Logger from './utils/Logger.js';
import { DiscordHandler } from './modules/DiscordHandler.js';

import { createRequire } from 'module';
const nodeRequire = createRequire(import.meta.url);

export class Bot {
    constructor(config) {
        this.config = config;
        this.mcBot = null;
        this.discord = new DiscordHandler(config, this);
        this.afkInterval = null;
        this.afkEnabled = true;
        this.isBanned = false; // Detection for ban status

        // Setup Readline
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: ''
        });
        Logger.setReadline(this.rl);
        Logger.info("Bot Module Loaded (Full v2.5 Stable) 🚀");
    }

    async init() {
        Logger.showBanner();
        await this.discord.init();
        this.connect();
        this.setupConsole();
    }

    connect() {
        this.isBanned = false; // Reset status on connect
        if (this.config.host === 'localhost' || this.config.host === '') {
            Logger.error("No Server IP set! (Defaulting to localhost failed).");
            Logger.system("👉 Type command: !setip <ip> (Example: !setip play.hypixel.net)");
            return;
        }

        Logger.info(`Connecting to ${this.config.host}:${this.config.port} as ${this.config.username}...`);

        const botOptions = {
            host: this.config.host,
            port: this.config.port,
            username: this.config.username,
            auth: this.config.auth,
            version: this.config.version || false,
            hideErrors: true
        };

        this.mcBot = mineflayer.createBot(botOptions);

        // Fix: Suppress inventory assertion error specifically
        this.mcBot.on('error', (err) => {
            if (err.message && err.message.includes('assert.ok(slot >= 0)')) return;
        });

        this.setupEvents();
    }

    setupEvents() {
        this.mcBot.on('login', () => {
            const msg = `🎮 Bot successfully joined as [ ${this.mcBot.username} ] ✅`;
            Logger.success(msg);
            Logger.system("Systems Online. Waiting for commands... 📡");

            this.startAFK();
            this.discord.send(`✅ **${this.mcBot.username} Joined the Server!** 🎮`);
        });

        this.mcBot.on('spawn', () => {
            Logger.info("Bot Spawned! 🌍");
        });

        this.mcBot.on('end', () => {
            if (this.isBanned) {
                Logger.error("⚠ Reconnect cancelled: Bot is BANNED from the server. 🚫");
                return;
            }
            Logger.error('❌ Disconnected. Reconnecting in 10s... 🔄');
            this.stopAFK();
            setTimeout(() => this.connect(), 10000);
        });

        this.mcBot.on('kicked', (reason) => {
            const cleanReason = this.cleanKickReason(reason);
            const lowerReason = cleanReason.toLowerCase();

            if (lowerReason.includes('ban') || lowerReason.includes('blacklist')) {
                this.isBanned = true;
                Logger.error(`🚫 BANNED FROM SERVER: ${cleanReason} 🛑`);
                this.discord.send(`⚠️ **BANNED FROM SERVER!** 🛑\nReason: ${cleanReason}`);
            } else {
                Logger.error(`👢 Kicked: ${cleanReason} ⚠️`);
                this.discord.send(`👢 **Bot was Kicked!** ⚠️\nReason: ${cleanReason}`);
            }
        });

        this.mcBot.on('death', () => {
            Logger.error("💀 Bot DIED! Respawning... ⚰️");
            this.discord.send("💀 **Bot Died in Minecraft!** ⚰️ (Auto-Respawning...)");
            this.mcBot.respawn();
        });

        this.mcBot.on('error', (err) => {
            if (err.message && err.message.includes('assert.ok(slot >= 0)')) return;

            const msg = err.message || "";
            if (err.code === 'ENOTFOUND') {
                Logger.error("⚠️ Invalid server address 🌐");
                Logger.system("👉 Use: !setip play.example.com");
            } else if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
                Logger.error("🔇 Server Offline or Port Closed 🔌");
                Logger.system("👉 Make sure your server is STARTED in Aternos.");
            } else if (err.code === 'ECONNRESET') {
                Logger.error("🔄 Connection Reset by Server 📶");
                Logger.system("👉 The server might be restarting. Wait and try again.");
            } else if (msg.includes('Unsupported protocol version') || msg.includes('minecraftVersion')) {
                Logger.error("📡 Server Version Detection Failed 🤖");
                Logger.system("👉 Check if the server is ONLINE or if the IP is correct.");
            } else {
                Logger.error(`⚠️ Bot Error: ${msg} 🛠️`);
            }
        });

        const processedChats = new Set();
        setInterval(() => processedChats.clear(), 500);

        this.mcBot.on('chat', (username, message) => {
            if (username === this.mcBot.username) return;
            const fullMsg = `<${username}> ${message}`;
            processedChats.add(fullMsg);
            processedChats.add(message);
            Logger.chat(username, message);
        });

        this.mcBot.on('messagestr', (message, position) => {
            if (position === 'game_info') return;
            if (processedChats.has(message)) return;
            if ([...processedChats].some(pm => message.includes(pm) && pm.length > 5)) return;
            Logger.chat('Server', message);
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
                    Logger.success("✅ AFK Mode: Enabled");
                } else if (args[1] === 'off') {
                    this.afkEnabled = false;
                    this.stopAFK();
                    Logger.info("❌ AFK Mode: Disabled");
                } else {
                    Logger.error("Usage: !afk on/off");
                }
                break;

            case 'jump':
                if (this.mcBot) {
                    this.mcBot.setControlState('jump', true);
                    this.mcBot.setControlState('jump', false);
                    Logger.info("Bot Jumped! 🦘");
                }
                break;

            case 'wave':
                if (this.mcBot) {
                    this.mcBot.swingArm();
                    Logger.info("Bot Waved! 👋");
                }
                break;

            case 'spin':
                if (this.mcBot) {
                    const yaw = this.mcBot.entity.yaw + Math.PI;
                    this.mcBot.look(yaw, 0);
                    Logger.info("Bot Spun! 🔄");
                }
                break;

            case 'botinfo':
                if (this.mcBot && this.mcBot.entity) {
                    const health = Math.round(this.mcBot.health);
                    const food = Math.round(this.mcBot.food);
                    const msg = `Health: ${health} ❤️ | Food: ${food} 🍗 | Pos: ${this.mcBot.entity.position.toString()}`;
                    if (source === "Console") Logger.info(msg);
                    else this.mcBot.chat(msg);
                }
                break;

            case 'setip':
                if (args[1]) {
                    this.config.host = args[1];
                    this.config.port = args[2] ? parseInt(args[2]) : 25565;
                    import('fs').then(fs => {
                        fs.writeFileSync('./config.json', JSON.stringify(this.config, null, 2));
                    });
                    Logger.success(`Server IP Updated to: ${this.config.host}:${this.config.port}`);
                    Logger.info("Connecting...");
                    this.connect();
                } else {
                    Logger.error("Usage: !setip <ip> [port]");
                }
                break;

            case 'setreply':
                const fullStr = args.slice(1).join(' ');
                if (fullStr.includes(' and ')) {
                    const [trigger, reply] = fullStr.split(' and ');
                    if (!this.config.triggers) this.config.triggers = [];
                    this.config.triggers.push({ trigger: trigger.trim(), reply: reply.trim() });
                    import('fs').then(fs => {
                        fs.writeFileSync('./config.json', JSON.stringify(this.config, null, 2));
                    });
                    Logger.success(`Auto-Reply Added: "${trigger.trim()}" -> "${reply.trim()}"`);
                } else {
                    Logger.error("Usage: !setreply <trigger> and <reply>");
                }
                break;

            case 'replylist':
                if (!this.config.triggers || this.config.triggers.length === 0) {
                    Logger.info("No auto-replies set.");
                } else {
                    Logger.system("=== Auto-Replies ===");
                    this.config.triggers.forEach((t, i) => {
                        Logger.info(`[${i}] "${t.trigger}" -> "${t.reply}"`);
                    });
                    Logger.system("====================");
                }
                break;

            case 'help':
            case 'commands':
                if (source === "Console") {
                    Logger.system("=== 🤖 AFK BOT COMMANDS ===");
                    Logger.info("  !afk on/off        - Toggle AFK Mode");
                    Logger.info("  !jump, !wave       - Perform Actions");
                    Logger.info("  !spin              - Spin Around");
                    Logger.info("  !setreply T and R  - Add Auto-Reply");
                    Logger.info("  !replylist         - Show Auto-Replies");
                    Logger.info("  !botinfo           - Show Health/Food");
                    Logger.info("  !setip <ip>        - Change Server IP");
                    Logger.info("  !quit              - Stop Bot");
                    Logger.system("===============================");
                } else {
                    this.mcBot.chat("Available Commands: !afk, !jump, !wave, !spin, !botinfo");
                }
                break;

            case 'quit':
                process.exit(0);
                break;

            default:
                if (this.mcBot) this.mcBot.chat(`/${cmdString}`);
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
            } catch (e) { }
        }, 5000);
    }

    stopAFK() {
        if (this.afkInterval) clearInterval(this.afkInterval);
    }

    // Helper to clean Minecraft JSON kick messages
    cleanKickReason(reason) {
        if (!reason) return "Unknown reason";
        if (typeof reason === 'string') return reason;

        // Handle Mineflayer JSON object structure
        try {
            if (reason.value && reason.value.translate) {
                const key = reason.value.translate.value;
                if (key === 'multiplayer.disconnect.banned') return "You are banned from this server.";
                if (key === 'multiplayer.disconnect.kicked') return "Kicked by an operator.";
                return key;
            }
            if (reason.extra) {
                return reason.extra.map(e => e.text || e).join('');
            }
            if (reason.text) return reason.text;
        } catch (e) { }

        return JSON.stringify(reason);
    }
}
