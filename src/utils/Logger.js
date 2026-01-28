import chalk from 'chalk';
import figlet from 'figlet';
import readline from 'readline';

const primaryColor = chalk.hex('#00ffea'); // Cyan/Aqua theme
const infoColor = chalk.cyan;
const errorColor = chalk.red;
const successColor = chalk.green;
const chatColor = chalk.white;
const discordColor = chalk.hex('#5865F2'); // Discord Blurple

class Logger {
    constructor() {
        this.rl = null;
    }

    setReadline(rl) {
        this.rl = rl;
    }

    // Print preventing input line overwrites
    print(text) {
        if (this.rl && !this.rl.closed) {
            try {
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);
                console.log(text);
                this.rl.prompt(true);
            } catch (e) {
                console.log(text);
            }
        } else {
            console.log(text);
        }
    }

    showBanner() {
        console.clear();
        console.log(primaryColor(figlet.textSync('AFK BOT 2.0', { horizontalLayout: 'fitted' })));
        console.log(primaryColor('=================================================='));
        console.log(primaryColor('  🚀 Professional AFK & Chat Bot'));
        console.log(primaryColor('=================================================='));
        console.log('');
    }

    log(message, type = 'INFO') {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        const prefix = `[${timestamp}] [${type}]`;

        let coloredPrefix;
        switch (type) {
            case 'INFO': coloredPrefix = infoColor(prefix); break;
            case 'ERROR': coloredPrefix = errorColor(prefix); break;
            case 'SUCCESS': coloredPrefix = successColor(prefix); break;
            case 'CHAT': coloredPrefix = primaryColor(prefix); break;
            case 'DISCORD': coloredPrefix = discordColor(prefix); break;
            default: coloredPrefix = chalk.gray(prefix);
        }

        this.print(`${coloredPrefix} ${message}`);
    }

    info(msg) { this.log(msg, 'INFO'); }
    error(msg) { this.log(msg, 'ERROR'); }
    success(msg) { this.log(msg, 'SUCCESS'); }
    chat(sender, msg) { this.print(`${primaryColor(`[${new Date().toLocaleTimeString('en-US', { hour12: false })}] [CHAT] <${sender}>`)} ${msg}`); }
    discord(user, msg) { this.print(`${discordColor(`[DISCORD] <${user}>`)} ${msg}`); }
    system(msg) { this.print(`${primaryColor('[🤖]')} ${msg}`); }
}

export default new Logger();
