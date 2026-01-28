import { Bot } from './src/Bot.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import readline from 'readline';
import Logger from './src/utils/Logger.js';

// Load Config
let config;
try {
    if (existsSync('./config.json')) {
        config = JSON.parse(readFileSync('./config.json', 'utf-8'));
    } else {
        // Fallback or create default
        Logger.error("config.json not found!");
        process.exit(1);
    }
} catch (e) {
    Logger.error(`Config Error: ${e.message}`);
    process.exit(1);
}

// Global Exception Handlers
process.on('uncaughtException', (err) => {
    Logger.error(`Uncaught: ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
    Logger.error(`Unhandled Rejection: ${reason}`);
});


// Interactive Setup
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

Logger.showBanner();
console.log(`\x1b[36mCurrent Username: ${config.username}\x1b[0m`);
rl.question('Enter Username (Press ENTER to use current): ', (answer) => {
    rl.close();

    if (answer.trim()) {
        config.username = answer.trim();
        // Option: Save new username?
        // writeFileSync('./config.json', JSON.stringify(config, null, 2));
    }

    // Start Bot
    const bot = new Bot(config);
    bot.init();
});
