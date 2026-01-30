import mineflayer from 'mineflayer';
import readline from 'readline';
import Logger from './utils/Logger.js';
import { DiscordHandler } from './modules/DiscordHandler.js';

import { createRequire } from 'module';
const nodeRequire = createRequire(import.meta.url);
const { pathfinder, Movements, goals } = nodeRequire('mineflayer-pathfinder');
const { GoalNear, GoalFollow } = goals;

export class Bot {
    constructor(config) {
        this.config = config;
        this.mcBot = null;
        this.discord = new DiscordHandler(config, this);
        this.afkInterval = null;
        this.afkEnabled = false;
        this.isBanned = false; // Detection for ban status
        this.isConnecting = false;
        this.reconnectTimeout = null;
        this.startTime = Date.now(); // Track when the bot started

        // Setup Readline
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: ''
        });
        Logger.setReadline(this.rl);
        Logger.info("UNIFY9 Module Loaded (Elite v3.2) 🍇");
    }

    async init() {
        await this.discord.init();
        this.connect();
        this.setupConsole();
    }

    connect() {
        this.isBanned = false; // Reset status on connect

        if (this.isConnecting && this.mcBot) {
            return; // Already connecting or connected
        }

        if (this.config.host === 'localhost' || this.config.host === '') {
            Logger.error("No Server IP set! (Defaulting to localhost failed).");
            Logger.system("👉 Type command: !setip <ip> (Example: !setip play.hypixel.net)");
            return;
        }

        this.isConnecting = true;
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

        // Anti-Bot: Random delay before connecting (1-2 seconds)
        const delay = Math.floor(Math.random() * 1000) + 1000;
        Logger.info(`Preparing connection... (Stealth Delay: ${delay}ms) ⏳`);

        setTimeout(() => {
            const botName = this.config.username === 'AFK_Bot' ? 'unify9' : this.config.username;
            Logger.info(`Connecting to ${this.config.host}:${this.config.port} as ${botName}...`);

            const botOptions = {
                host: this.config.host,
                port: this.config.port,
                username: botName,
                auth: this.config.auth || 'offline',
                version: this.config.version || "1.20.1",
                hideErrors: true, // Hide technical stack traces
                connectTimeout: 90000, // 90 seconds
                checkTimeoutInterval: 90000,
                brand: 'vanilla', // Spoof real client to bypass some Anti-Bots
                viewDistance: 'tiny' // Optimization: Reduce world loading lag
            };

            this.mcBot = mineflayer.createBot(botOptions);
            this.mcBot.setMaxListeners(100); // Prevent MaxListenersExceededWarning
            this.mcBot.loadPlugin(pathfinder);

            // Fix: Suppress inventory assertion error specifically
            this.mcBot.on('error', (err) => {
                if (err.message && err.message.includes('assert.ok(slot >= 0)')) return;
            });

            this.setupEvents();
        }, delay);
    }

    setupEvents() {
        this.mcBot.on('login', () => {
            this.isConnecting = false; // Done connecting
            Logger.info("Logged in! Waiting for spawn... ⏳");
        });

        this.mcBot.on('spawn', () => {
            const pos = this.mcBot.entity.position;
            const world = this.mcBot.world?.name || "Overworld";
            Logger.success(`🎮 Bot ACTIVE: [ ${this.mcBot.username} ] joined ${world} ✅`);
            Logger.info(`📍 Position: X:${Math.round(pos.x)} Y:${Math.round(pos.y)} Z:${Math.round(pos.z)}`);
            Logger.system("Systems Online. Waiting for commands... 📡");

            const defaultMove = new Movements(this.mcBot);
            this.mcBot.pathfinder.setMovements(defaultMove);

            if (!this.afkInterval) this.startAFK();
            if (!this.afkInterval) this.startAFK();
            this.discord.send(`>>> 🟢 **CONNECTED**\n**${this.mcBot.username}** has joined the server!\n🌍 World: ${world}\n📍 AFK Protocol: **ACTIVE**`);
        });

        this.mcBot.on('end', () => {
            this.isConnecting = false;
            if (this.isBanned) {
                Logger.error("🚫 Reconnect Cancelled: Bot is BANNED from the server.");
                return;
            }
            Logger.error('♻️ Connection Lost. Retrying in 10s... 🔄');
            this.stopAFK();

            if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = setTimeout(() => this.connect(), 10000);
        });

        this.mcBot.on('kicked', (reason) => {
            const cleanReason = this.cleanKickReason(reason);
            const lowerReason = cleanReason.toLowerCase();

            if (lowerReason.includes('ban') || lowerReason.includes('blacklist')) {
                this.isBanned = true;
                Logger.error(`🚫 ACCESS DENIED: ${cleanReason}`);
                this.discord.send(`⚠️ **ACCESS DENIED!** 🛑\nReason: ${cleanReason}`);
            } else if (lowerReason.includes('antibot') || lowerReason.includes('verification')) {
                Logger.error(`🛡️ SECURITY: Access Denied (Anti-Bot)`);
                Logger.system("👉 Hint: Change username or wait 10 minutes.");
            } else {
                Logger.error(`🚪 DISCONNECTED: Bot was removed from server ✨`);
                this.discord.send(`👢 **Bot Removed!** ⚠️\nReason: ${cleanReason}`);
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
            } else if (msg.includes('client timed out')) {
                Logger.error("⏳ Connection Timeout! 🛑");
                Logger.system("👉 The server is too slow to respond or Offline.");
                Logger.system("👉 Try setting a specific version (e.g. 1.20.1) in config.json");
            } else {
                Logger.error(`⚠️ Bot Error: ${msg} 🛠️`);
            }
        });

        // --- ADVANCED ANTI-BOT VERIFICATION ---
        this.mcBot.on('windowOpen', async (window) => {
            const title = window.title ? JSON.parse(window.title).text || window.title : "Unknown Window";
            Logger.system(`📂 Verification GUI Opened: "${title}"`);

            // Common Captcha Keywords
            const captchaKeywords = ["verify", "captcha", "click", "identity", "human"];
            const lowerTitle = title.toLowerCase();

            if (captchaKeywords.some(k => lowerTitle.includes(k))) {
                Logger.info("🔍 Captcha GUI detected! Scanning items...");

                // Scan all items in the window
                const items = window.slots.filter(item => item !== null);
                for (const item of items) {
                    const itemName = item.displayName.toLowerCase();
                    const itemLore = item.nbt?.value?.display?.value?.Lore?.value?.map(l => l.value.toLowerCase()).join(" ") || "";

                    // Logic: If the window title asks to click a specific item (e.g. "Click the Apple")
                    // we look for that item. For now, we click items with "Verify" or high-priority items.
                    if (itemName.includes('verify') || itemLore.includes('verify') || itemName.includes('click')) {
                        Logger.success(`🎯 Found Verification Item: ${item.displayName}. Clicking...`);
                        await this.mcBot.clickWindow(item.slot, 0, 0);
                        return;
                    }
                }

                // Fallback: If no specific item found, but it's a verification window, 
                // try to click the first non-air item if there's only one.
                if (items.length === 1) {
                    Logger.info(`🖱️ Only one item found, attempting fallback click on ${items[0].displayName}...`);
                    await this.mcBot.clickWindow(items[0].slot, 0, 0);
                }
            }
        });

        const chatCache = new Set();
        setInterval(() => chatCache.clear(), 3000); // Clear every 3s to prevent memory bloat

        this.mcBot.on('message', (jsonMsg) => {
            const msg = jsonMsg.toString();
            const lowerMsg = msg.toLowerCase();

            // --- SMART CHAT VERIFICATION SOLVER ---
            // 1. Slash command verification (e.g. /verify 1234)
            const verifyMatch = msg.match(/\/(verify|captcha|register|confirm)\s+(\w+)/i);
            if (verifyMatch) {
                const cmd = verifyMatch[0];
                Logger.success(`🧬 Chat Captcha Detected: Running ${cmd}`);
                this.mcBot.chat(cmd);
            }

            // 2. Math Captcha (e.g. "What is 5 + 3?")
            const mathMatch = msg.match(/(\d+)\s*([\+\-\*])\s*(\d+)\s*=\s*\?/);
            if (mathMatch) {
                const a = parseInt(mathMatch[1]);
                const op = mathMatch[2];
                const b = parseInt(mathMatch[3]);
                let res = 0;
                if (op === '+') res = a + b;
                if (op === '-') res = a - b;
                if (op === '*') res = a * b;
                Logger.success(`🧮 Math Captcha: ${a} ${op} ${b} = ${res}. Sending...`);
                this.mcBot.chat(res.toString());
            }

            // 3. Instruction following (e.g. "Jump to verify")
            if (lowerMsg.includes("jump to verify") || lowerMsg.includes("jump and verify")) {
                Logger.info("🏃 Instruction Captcha: Jumping...");
                this.mcBot.setControlState('jump', true);
                setTimeout(() => this.mcBot.setControlState('jump', false), 500);
            }
            if (lowerMsg.includes("sneak to verify")) {
                Logger.info("🧍 Instruction Captcha: Sneaking...");
                this.mcBot.setControlState('sneak', true);
                setTimeout(() => this.mcBot.setControlState('sneak', false), 2000);
            }

            // --- DISCONNECT DETECTION ---
            const disconnectRegex = /you (left|were kicked|disconnected)/i;
            if (disconnectRegex.test(msg)) {
                Logger.error(`🚪 DISCONNECT DETECTED: "${msg}"`);
                this.discord.send(`⚠️ **Bot Disconnected!** (Reason: ${msg})`);
                if (this.mcBot) this.mcBot.quit();
                setTimeout(() => this.connect(), 2000);
                return;
            }

            // Check Auto-Replies (Works for Player & System messages)
            if (this.config.triggers) {
                const normalizedMsg = msg.replace(/\s+/g, ' ').toLowerCase();
                this.config.triggers.forEach(t => {
                    const normalizedTrigger = t.trigger.replace(/\s+/g, ' ').toLowerCase();
                    if (normalizedMsg.includes(normalizedTrigger)) {
                        const replies = t.reply.split('&&');
                        replies.forEach((r, index) => {
                            setTimeout(() => {
                                if (this.mcBot) this.mcBot.chat(r.trim());
                            }, index * 500);
                        });
                    }
                });
            }
        });

        this.mcBot.on('chat', (username, message) => {
            if (username === this.mcBot.username) return;
            chatCache.add(message); // Mark as handled
            Logger.chat(username, message);
            Logger.chat(username, message);
            this.discord.send(`**<${username}>** ${message}`);
        });

        this.mcBot.on('messagestr', (message, position) => {
            if (position === 'game_info') return;
            if (chatCache.has(message)) return; // Already logged by 'chat'

            const disconnectRegex = /you (left|were kicked|disconnected)/i;
            if (disconnectRegex.test(message)) {
                Logger.error(`🚪 DISCONNECT DETECTED: "${message}"`);
                this.discord.send(`⚠️ **Bot Disconnected!** (Reason: ${message})`);
                if (this.mcBot) this.mcBot.quit();
                setTimeout(() => this.connect(), 2000);
                return;
            }

            Logger.chat('Server', message);
            try {
                // Formatting for cleaner Discord look
                const cleanMsg = message.replace(/§[0-9a-fk-or]/g, '');
                this.discord.send(`\`[SERVER]\` ${cleanMsg}`);
            } catch (e) { }
        });
    }

    setupConsole() {
        this.rl.on('line', (input) => {
            const raw = input.trim();
            if (!raw) return;

            if (raw.startsWith('!')) {
                this.handleCommand(raw.slice(1), "Console");
            } else if (raw.startsWith('/')) {
                if (this.mcBot) {
                    this.mcBot.chat(raw);
                    Logger.info(`Sent Server Command: ${raw} 📡`);
                } else {
                    Logger.error("Bot disconnected.");
                }
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
        // Redundant - checks now handled in 'message' event with normalization
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
                    this.discord.send("✅ **AFK Mode: ENABLED**");
                } else if (args[1] === 'off') {
                    this.afkEnabled = false;
                    this.stopAFK();
                    Logger.info("❌ AFK Mode: Disabled");
                    this.discord.send("❌ **AFK Mode: DISABLED**");
                } else {
                    Logger.error("Usage: !afk on/off");
                }
                break;

            case 'jump':
                if (this.mcBot) {
                    this.mcBot.setControlState('jump', true);
                    this.mcBot.setControlState('jump', false);
                    Logger.info("Bot Jumped! 🦘");
                    this.discord.send("🦘 **Bot Jumped!**");
                }
                break;

            case 'wave':
                if (this.mcBot) {
                    this.mcBot.swingArm();
                    Logger.info("Bot Waved! 👋");
                    this.discord.send("👋 **Bot Waved!**");
                }
                break;

            case 'spin':
                if (this.mcBot) {
                    const yaw = this.mcBot.entity.yaw + Math.PI;
                    this.mcBot.look(yaw, 0);
                    Logger.info("Bot Spun! 🔄");
                    this.discord.send("🔄 **Bot Spun!**");
                }
                break;

            case 'botgo':
                if (!this.mcBot) return;
                this.stopAFK(); // Stop AFK movement during pathfinding

                if (args.length === 4) {
                    // !botgo X Y Z
                    const x = parseFloat(args[1]);
                    const y = parseFloat(args[2]);
                    const z = parseFloat(args[3]);
                    const goal = new GoalNear(x, y, z, 1);
                    this.mcBot.pathfinder.setGoal(goal);
                    Logger.info(`Navigating to [${x}, ${y}, ${z}]... 📍`);
                    this.discord.send(`📍 **Navigating to** \`[${x}, ${y}, ${z}]\`...`);
                } else if (args.length === 2) {
                    // !botgo <player>
                    const targetName = args[1];
                    const target = this.mcBot.players[targetName]?.entity;
                    if (target) {
                        const goal = new GoalFollow(target, 2);
                        this.mcBot.pathfinder.setGoal(goal);
                        Logger.info(`Following ${targetName}... 🏃‍♂️`);
                    } else {
                        Logger.error(`Player ${targetName} not found!`);
                    }
                } else {
                    Logger.error("Usage: !botgo <x> <y> <z> OR !botgo <player>");
                }
                break;

            case 'bitmove':
            case 'bitmobe':
                if (!this.mcBot || !this.mcBot.entity) return;
                this.stopAFK();

                const yaw = this.mcBot.entity.yaw;
                const pos = this.mcBot.entity.position;

                // Calculate position 3 blocks forward based on yaw
                // In Mineflayer: Yaw 0 is South (+Z), PI/2 is West (+X), PI is North (-Z)
                const dx = 3 * Math.sin(yaw);
                const dz = 3 * Math.cos(yaw);
                const targetPos = pos.offset(dx, 0, dz);

                const moveGoal = new GoalNear(targetPos.x, targetPos.y, targetPos.z, 1);
                this.mcBot.pathfinder.setGoal(moveGoal);

                Logger.info(`Moving 3 blocks forward to [${Math.round(targetPos.x)}, ${Math.round(targetPos.z)}]... 🚶‍♂️`);
                this.discord.send(`🚶‍♂️ **Moving Forward** (3 blocks)...`);
                break;

            case 'pathfind':
            case 'pathfiend':
                if (args[1] === 'off') {
                    if (this.mcBot) {
                        this.mcBot.pathfinder.setGoal(null);
                        Logger.info("Pathfinding: DISABLED 🛑");
                    }
                } else if (args[1] === 'on') {
                    Logger.info("Pathfinding: READY 📡 (Use !goto to move)");
                } else {
                    Logger.error("Usage: !pathfind on/off");
                }
                break;

            case 'stop':
                if (this.mcBot) {
                    this.mcBot.pathfinder.setGoal(null);
                    Logger.info("Pathfinding stopped! 🛑");
                    this.discord.send("🛑 **Movement Stopped!**");
                }
                break;

            case 'uptime':
                const uptimeMs = Date.now() - this.startTime;
                const seconds = Math.floor((uptimeMs / 1000) % 60);
                const minutes = Math.floor((uptimeMs / (1000 * 60)) % 60);
                const hours = Math.floor((uptimeMs / (1000 * 60 * 60)) % 24);
                const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));

                let uptimeStr = "";
                if (days > 0) uptimeStr += `${days}d `;
                if (hours > 0) uptimeStr += `${hours}h `;
                if (minutes > 0) uptimeStr += `${minutes}m `;
                uptimeStr += `${seconds}s`;

                const uptimeMsg = `⏳ **Bot Uptime**: ${uptimeStr} 🚀`;
                if (source === "Console") Logger.info(uptimeMsg);
                else if (source === "Discord") this.discord.send(`>>> ⌛ **Uptime Status**\n**Time**: ${uptimeStr}\n🚀 Status: **Online & Stable**`);
                else this.mcBot.chat(uptimeMsg);
                break;

            case 'botinfo':
                if (this.mcBot && this.mcBot.entity) {
                    const health = Math.round(this.mcBot.health);
                    const food = Math.round(this.mcBot.food);
                    const msg = `Health: ${health} ❤️ | Food: ${food} 🍗 | Pos: ${this.mcBot.entity.position.toString()}`;
                    if (source === "Console") Logger.info(msg);
                    else if (source === "Discord") this.discord.send(`>>> 📊 **Bot Status**\n❤️ **Health**: ${health} / 20\n🍗 **Food**: ${food} / 20\n📍 **Position**: ${this.mcBot.entity.position.toString()}`);
                    else this.mcBot.chat(msg);
                }
                break;

            case 'ipset':
            case 'setip':
                if (args[1]) {
                    const newHost = args[1];
                    const newPort = args[2] ? parseInt(args[2]) : 25565;
                    const fullIp = `${newHost}:${newPort}`;

                    // Update History
                    if (!this.config.ipHistory) this.config.ipHistory = [];
                    if (!this.config.ipHistory.includes(fullIp)) {
                        this.config.ipHistory.unshift(fullIp); // Add to start
                        if (this.config.ipHistory.length > 10) this.config.ipHistory.pop(); // Keep last 10
                    }

                    this.config.host = newHost;
                    this.config.port = newPort;
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

            case 'iphistory':
                if (!this.config.ipHistory || this.config.ipHistory.length === 0) {
                    Logger.info("No IP history found.");
                } else {
                    Logger.system("=== 📜 IP HISTORY ===");
                    this.config.ipHistory.forEach((ip, i) => {
                        Logger.info(` [${i + 1}] ${ip}`);
                    });
                    Logger.system("=====================");
                    Logger.system("👉 Tip: Use !setip <ip> to switch!");
                }
                break;

            case 'setversion':
                if (args[1]) {
                    this.config.version = args[1] === 'auto' ? false : args[1];
                    import('fs').then(fs => {
                        fs.writeFileSync('./config.json', JSON.stringify(this.config, null, 2));
                    });
                    Logger.success(`Bot Version Updated to: ${args[1]}`);
                    Logger.info("Reconnecting with new version...");
                    this.connect();
                } else {
                    Logger.error("Usage: !setversion <version> (e.g. 1.20.1 or auto)");
                }
                break;

            case 'setreply':
                const fullStr = args.slice(1).join(' ');
                const splitIndex = fullStr.toLowerCase().indexOf(' and ');

                if (splitIndex !== -1) {
                    const trigger = fullStr.substring(0, splitIndex).trim();
                    const reply = fullStr.substring(splitIndex + 5).trim();

                    if (!this.config.triggers) this.config.triggers = [];

                    // Remove old trigger if it exists to avoid duplicates
                    this.config.triggers = this.config.triggers.filter(t => t.trigger.toLowerCase() !== trigger.toLowerCase());

                    this.config.triggers.push({ trigger, reply });

                    import('fs').then(fs => {
                        fs.writeFileSync('./config.json', JSON.stringify(this.config, null, 2));
                    });

                    const type = reply.startsWith('/') ? "Command" : "Reply";
                    Logger.success(`Success! Saved ${type} for: "${trigger}"`);
                    this.discord.send(`💾 **Saved ${type}**\nTrigger: \`${trigger}\`\nResponse: \`${reply}\``);
                } else {
                    Logger.error("Format Error! Use: !setreply <trigger> and <reply/command>");
                    Logger.system("👉 Example: !setreply hello and /back");
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
                    Logger.info("  !botgo X Y Z       - Move to Coords");
                    Logger.info("  !bitmove           - Move 3 blocks forward");
                    Logger.info("  !stop              - Stop Movement");
                    Logger.info("  !uptime            - Show Bot Uptime");
                    Logger.info("  !setreply <T> and <R> - Add Auto-Reply/Command");
                    Logger.info("  !replylist         - Show Auto-Replies");
                    Logger.info("  !botinfo           - Show Health/Food");
                    Logger.info("  !setip <ip>        - Change Server IP");
                    Logger.info("  !iphistory         - Show Used IPs");
                    Logger.info("  !reconnect         - Force Reconnect");
                    Logger.info("  !quit              - Stop Bot");
                    Logger.system("===============================");
                } else if (source === "Discord") {
                    this.discord.send(`
**🤖 UNIFY9 BOT COMMANDS**
\`!afk on/off\` - Toggle AFK Mode
\`!botgo X Y Z\` - Move to Coords
\`!botgo <player>\` - Follow Player
\`!bitmove\` - Move 3 blocks forward
\`!reconnect\` - Force Reconnect
\`!setreply <trigger> and <reply>\` - Auto-Reply
\`!uptime\` - Show Bot Uptime
\`!botinfo\` - Health & Food status
\`!quit\` - Stop Bot
`);
                } else {
                    this.mcBot.chat("Available Commands: !afk, !jump, !wave, !spin, !botinfo");
                }
                break;

            case 'reconnect':
                Logger.info("Forcing reconnection... ♻️");
                if (this.mcBot) this.mcBot.quit();
                this.connect();
                break;

            case 'quit':
                Logger.warning("Shutting down...");
                this.discord.send(">>> 🔴 **SYSTEM OFFLINE**\n🛑 reason: **User Command**\n👋 Shutting down...");
                if (this.mcBot) this.mcBot.quit();

                // Allow time for Discord message to send
                setTimeout(() => {
                    process.exit(0);
                }, 3000);
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
            const action = Math.floor(Math.random() * 5); // Increased variety
            try {
                switch (action) {
                    case 0: // Sudden Jump
                        this.mcBot.setControlState('jump', true);
                        setTimeout(() => this.mcBot.setControlState('jump', false), 400);
                        break;
                    case 1: // Hand Swing
                        this.mcBot.swingArm();
                        break;
                    case 2: // Look Around (Yaw & Pitch)
                        const yaw = (Math.random() * 360 - 180) * (Math.PI / 180);
                        const pitch = (Math.random() * 90 - 45) * (Math.PI / 180);
                        this.mcBot.look(yaw, pitch);
                        break;
                    case 3: // Sneak/Unsneak
                        this.mcBot.setControlState('sneak', true);
                        setTimeout(() => this.mcBot.setControlState('sneak', false), 1500);
                        break;
                    case 4: // Combined Jump & Swing
                        this.mcBot.setControlState('jump', true);
                        this.mcBot.swingArm();
                        setTimeout(() => this.mcBot.setControlState('jump', false), 400);
                        break;
                }
            } catch (e) { }
        }, 3000 + Math.random() * 4000); // Shorter, more varied interval
    }

    stopAFK() {
        if (this.afkInterval) clearInterval(this.afkInterval);
    }

    // Helper to clean Minecraft JSON kick messages
    cleanKickReason(reason) {
        if (!reason) return "Unknown reason";
        if (typeof reason === 'string') return reason;

        let out = "";
        const traverse = (o) => {
            if (o === null || o === undefined) return;
            if (typeof o === 'string') { out += o; return; }
            if (typeof o === 'number') { out += o.toString(); return; }
            if (Array.isArray(o)) { o.forEach(traverse); return; }

            // Handle Mineflayer NBT value wrapper
            if (o.value !== undefined) traverse(o.value);

            // Standard Chat component
            if (o.text) out += o.text;
            if (o.extra) traverse(o.extra);

            // Translate keys
            if (o.translate) {
                const key = typeof o.translate === 'string' ? o.translate : (o.translate.value || "");
                if (key === 'multiplayer.disconnect.banned') out += "Banned from server.";
                else if (key === 'multiplayer.disconnect.kicked') out += "Kicked by operator.";
                else if (key === 'multiplayer.disconnect.duplicate_login') out += "Duplicate login - Already connected!";
                else out += key;
            }
        };

        try {
            traverse(reason);
            const cleaned = out.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
            return cleaned.length > 0 ? cleaned : JSON.stringify(reason);
        } catch (e) {
            return JSON.stringify(reason);
        }
    }
}
