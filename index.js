import { Bot } from './src/Bot.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import readline from 'readline';
import Logger from './src/utils/Logger.js';

// Load Config
let config;
try {
    if (existsSync('./config.json')) {
        config = JSON.parse(readFileSync('./config.json', 'utf-8'));
    } else if (existsSync('./config.example.json')) {
        // Automatically create config.json from example
        const exampleData = readFileSync('./config.example.json', 'utf-8');
        writeFileSync('./config.json', exampleData);
        config = JSON.parse(exampleData);
        Logger.success("Default config.json created from example! 📄");
        Logger.system("👉 Please set your server IP using: !setip <ip>");
    } else {
        Logger.error("Config files missing! (config.json or config.example.json not found)");
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


// Setup startup Readline for interactive username
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const startBot = (username) => {
    if (username.trim()) {
        config.username = username.trim();
        Logger.info(`Using custom username: ${config.username}`);
    } else {
        Logger.info(`Using default username: ${config.username}`);
    }
    rl.close();
    const bot = new Bot(config);
    bot.init();
};

Logger.showBanner();
rl.question(`👤 Enter Bot Username (Press [Enter] for ${config.username}): `, (answer) => {
    startBot(answer);
});
