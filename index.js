const mineflayer = require('mineflayer');
const prompt = require('prompt-sync')();
const chalk = require('chalk');
const moment = require('moment-timezone');
const fs = require('fs');
const readline = require('readline');
const { Client, GatewayIntentBits } = require('discord.js');

// Load config
let config = require('./config.json');

console.log(chalk.bold.cyan("Minecraft AFK Bot 2.0 Setup"));

// Interactive Username
let username = prompt(`Enter Username (default: ${config.username}): `);
if (!username || username.trim() === '') {
    username = config.username;
}

// Helper to log with timestamp and color
function log(message, type = 'info') {
    const timestamp = moment().tz(config.timezone).format('HH:mm:ss');
    const prefix = `[${timestamp}]`;

    if (type === 'chat') {
        console.log(chalk.white(`${prefix} [CHAT] ${message}`));
    } else if (type === 'error') {
        console.log(chalk.red(`${prefix} [ERROR] ${message}`));
    } else {
        console.log(chalk.white(`${prefix} [INFO] ${message}`));
    }
}

let bot;
let afkInterval;
let afkEnabled = true;
let discordClient = null;
let discordChannel = null;

// Setup Discord
if (config.discord && config.discord.token && config.discord.token !== "PASTE_YOUR_TOKEN_HERE") {
    discordClient = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
        ]
    });

    discordClient.once('ready', async () => {
        log(`Discord Bot logged in as ${discordClient.user.tag} ✅`, 'info');
        try {
            discordChannel = await discordClient.channels.fetch(config.discord.channelId);
            if (discordChannel) {
                discordChannel.send(`**${username}** (Minecraft Bot) is now ONLINE! ✅`);
            } else {
                log("Could not find Discord channel. Check ID.", 'error');
            }
        } catch (err) {
            log(`Discord Channel Error: ${err.message}`, 'error');
        }
    });

    discordClient.on('messageCreate', (message) => {
        if (!bot || !discordChannel) return;
        if (message.author.bot) return; // Ignore bots
        if (message.channel.id !== config.discord.channelId) return;

        const content = message.content;
        log(`[Discord] ${message.author.username}: ${content}`, 'chat');

        // Handle Commands from Discord
        if (content.startsWith('!')) {
            handleCommand(message.author.username, content, (reply) => {
                message.reply(reply); // Reply in Discord
            });
        } else {
            // Send to Minecraft Chat
            bot.chat(`[Discord] ${message.author.username}: ${content}`);
        }
    });

    discordClient.login(config.discord.token).catch(err => {
        log(`Discord Login Failed: ${err.message}`, 'error');
    });
} else {
    log("Discord integration skipped (Token missing in config.json). ⚠️", 'info');
}


// Setup Console Input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on('line', (line) => {
    if (!bot) return;
    const input = line.trim();
    if (input === '') return;

    if (input.startsWith('!')) {
        const args = input.slice(1).split(' ');
        const command = args[0].toLowerCase();

        if (command === 'setip') {
            const newHost = args[1];
            const newPort = args[2] ? parseInt(args[2]) : 25565;

            if (newHost) {
                config.host = newHost;
                config.port = newPort;
                fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
                console.log(chalk.green(`Server IP set to ${newHost}:${newPort}. Restarting bot...`));

                // Force restart logic
                if (bot) bot.quit();
                if (afkInterval) clearInterval(afkInterval);
                createBot();
            } else {
                console.log(chalk.red("Usage: !setip <ip> [port]"));
            }
        } else {
            handleCommand("Console", input, (reply) => {
                console.log(chalk.yellow(`[Bot]: ${reply}`));
            });
        }
    } else {
        bot.chat(input);
    }
});

// Common Command Handler
function handleCommand(user, message, replyCallback) {
    // Note: !setip is handled separately in console input because it's a structural change
    // but we can also allow it from Discord? The user specifically asked for "no ip enter ip... !setip".
    // Let's allow it in common handler too if needed, but for now console is safest for initial setup.
    // Actually, user said "!setip kiyala ip ek set krnn puluwn wennth one", likely from console if it doesn't connect.

    if (!bot && message.startsWith("!setip")) {
        // Allow setip even if bot is null (disconnected state)
        // But handleCommand logic above has a check for !bot. We need to move that check.
    }

    if (!bot && !message.startsWith("!setip")) {
        replyCallback("Bot is currently disconnected/reconnecting. (Use !setip <ip> to configure) ⚠️");
        return;
    }

    const args = message.slice(1).split(' ');
    const command = args[0].toLowerCase();

    if (command === 'setip') {
        const newHost = args[1];
        const newPort = args[2] ? parseInt(args[2]) : 25565;
        if (newHost) {
            config.host = newHost;
            config.port = newPort;
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
            replyCallback(`Server IP updated to ${newHost}:${newPort}. Restarting... 🔄`);

            if (bot) bot.quit();
            if (afkInterval) clearInterval(afkInterval);
            setTimeout(createBot, 1000);
        } else {
            replyCallback("Usage: !setip <ip> [port] ❓");
        }
        return;
    }

    if (command === 'afk') {
        if (args[1] === 'on') {
            afkEnabled = true;
            replyCallback("AFK mode enabled. ✅");
            bot.chat("AFK mode enabled. ✅"); // Also say in MC
        } else if (args[1] === 'off') {
            afkEnabled = false;
            replyCallback("AFK mode disabled. 🛑");
            bot.chat("AFK mode disabled. 🛑");
        }
    } else if (command === 'help' || command === 'commands') {
        replyCallback("Commands: !afk, !time, !setreply, !replylist, !stopreply, !botinfo, !commands, !help 🛠️");
    } else if (command === 'botinfo') {
        const info = `Health: ${Math.round(bot.health)}/20 ❤️ | Food: ${Math.round(bot.food)}/20 🍗`;
        replyCallback(info);
        if (user !== "Console") bot.chat(info);
    } else if (command === 'status') {
        replyCallback("I am online!");
    } else if (command === 'replylist') {
        if (!config.triggers || config.triggers.length === 0) {
            replyCallback("No auto-replies set. 📭");
        } else {
            let list = "Auto-Replies 📜:\n";
            config.triggers.forEach((rule, index) => {
                list += `${index + 1}. "${rule.trigger}" -> "${rule.reply}"\n`;
            });
            replyCallback(list);
        }
    } else if (command === 'stopreply') {
        const index = parseInt(args[1]);
        if (!isNaN(index) && config.triggers && config.triggers.length > 0) {
            const arrayIndex = index - 1;
            if (arrayIndex >= 0 && arrayIndex < config.triggers.length) {
                const removed = config.triggers.splice(arrayIndex, 1);
                fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
                replyCallback(`Removed reply for "${removed[0].trigger}" 🗑️`);
            } else {
                replyCallback("Invalid ID. ⚠️");
            }
        } else {
            replyCallback("Usage: !stopreply [id] ❓");
        }
    } else if (command === 'setreply') {
        const fullArgs = args.slice(1).join(' ');
        const parts = fullArgs.split(' and ');
        if (parts.length >= 2) {
            const triggerText = parts[0].trim();
            const replyText = parts.slice(1).join(' and ').trim();
            if (triggerText && replyText) {
                if (!config.triggers) config.triggers = [];
                config.triggers.push({ trigger: triggerText, reply: replyText });
                fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
                replyCallback(`Auto-reply set for "${triggerText}" 💾`);
            }
        } else {
            replyCallback("Usage: !setreply [trigger] and [reply] ❓");
        }
    } else if (command === 'time' && args[1] === 'set') {
        const newZone = args[2];
        if (newZone && moment.tz.zone(newZone)) {
            config.timezone = newZone;
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
            replyCallback(`Timezone set to ${newZone} 🕒`);
        } else {
            replyCallback("Invalid timezone. ❌");
        }
    }
}

function createBot() {
    if (config.host === 'localhost' || config.host === '') {
        log("No Server IP set! Please use command: !setip <ip>", 'error');
        console.log(chalk.yellow("Example: !setip play.hypixel.net"));
        return; // Do not attempt to connect, wait for user input
    }

    const botOptions = {
        host: config.host,
        port: config.port,
        username: username,
        auth: config.auth,
        version: config.version === false ? undefined : config.version,
        hideErrors: true,
        loadInternalPlugins: false // Disable default plugins to avoid inventory crash
    };

    bot = mineflayer.createBot(botOptions);

    // Manually load essential plugins (Excluding inventory/simple_inventory)
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
        registry.pathfinder // if installed
        // registry.simple_inventory - EXCLUDED
        // registry.inventory - EXCLUDED
    ];

    safePlugins.forEach(plugin => {
        if (plugin) bot.loadPlugin(plugin);
    });

    bot.on('login', () => {
        log(`Logged in as ${bot.username} (Version: ${config.version})`);
        startGenericAFK();
    });

    bot.on('chat', (username, message) => {
        if (username === bot.username) return;

        log(`${username}: ${message}`, 'chat');

        // Send to Discord
        if (discordChannel) {
            discordChannel.send(`**${username}**: ${message}`);
        }

        // Auto-Reply Triggers
        if (config.triggers && Array.isArray(config.triggers)) {
            config.triggers.forEach(rule => {
                if (message.includes(rule.trigger)) {
                    setTimeout(() => {
                        bot.chat(rule.reply);
                    }, 500);
                }
            });
        }

        // Handle In-Game Commands
        if (message.startsWith('!')) {
            handleCommand(username, message, (reply) => {
                bot.chat(reply);
            });
        }
    });

    bot.on('error', (err) => log(err.message, 'error'));

    bot.on('kicked', (reason) => {
        log(`Kicked: ${reason}`, 'error');
        if (discordChannel) discordChannel.send(`⚠️ Bot was kicked: ${reason}`);
    });

    bot.on('end', () => {
        log("Disconnected. Reconnecting in 10 seconds...");
        if (discordChannel) discordChannel.send(`⚠️ Bot disconnected. Reconnecting...`);
        if (afkInterval) clearInterval(afkInterval);
        setTimeout(createBot, 10000);
    });

    bot.on('spawn', () => {
        log("Bot spawned/respawned.");
    });
}

function startGenericAFK() {
    if (afkInterval) clearInterval(afkInterval);

    log("Anti-AFK loop started.", "info");

    afkInterval = setInterval(() => {
        if (!bot || !afkEnabled) return;

        const action = Math.floor(Math.random() * 3);

        try {
            switch (action) {
                case 0:
                    bot.setControlState('jump', true);
                    setTimeout(() => bot.setControlState('jump', false), 500);
                    break;
                case 1:
                    const yaw = Math.random() * Math.PI - (Math.PI / 2);
                    const pitch = Math.random() * Math.PI - (Math.PI / 2);
                    bot.look(yaw, pitch);
                    break;
                case 2:
                    bot.swingArm();
                    break;
            }
        } catch (err) { }

    }, 5000 + Math.random() * 5000);
}

function stopAFK() {
    if (afkInterval) clearInterval(afkInterval);
}

// Global Error Handlers to prevent crashes from library bugs
process.on('uncaughtException', (err) => {
    log(`Uncaught Exception: ${err.message}`, 'error');
    // console.error(err); // Optional: print full stack trace
});

process.on('unhandledRejection', (reason, promise) => {
    log(`Unhandled Rejection: ${reason}`, 'error');
});

// Start the bot
createBot();
