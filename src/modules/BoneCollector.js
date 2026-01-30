/**
 * ☠️ UNIFY9 - Bone Collector Module
 * Specialized pathfinding and interaction logic for Skeleton Farms.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
import Vec3 from 'vec3';
import Logger from '../utils/Logger.js';

export class BoneCollector {
    constructor(bot, config) {
        this.bot = bot; // This is the mcBot instance
        this.config = config.boneCollector || {};
        this.running = false;
        this.initialized = false;
        this.chestFull = false;
        this.mcData = null;
    }

    async init() {
        if (this.initialized) return;

        try {
            // Check if plugins are loaded, if not load them
            if (!this.bot.pathfinder) this.bot.loadPlugin(pathfinder);
        } catch (e) { }

        try {
            const mcDataModule = await import('minecraft-data');
            this.mcData = mcDataModule.default(this.bot.version);

            const movements = new Movements(this.bot, this.mcData);
            movements.canDig = false;
            movements.allowParkour = false;
            movements.allowSprinting = false;

            this.bot.pathfinder.setMovements(movements);
            this.initialized = true;
            Logger.system('☠️ Bone Collector: Initialized');
        } catch (err) {
            Logger.error(`BoneCollector Init Failed: ${err.message}`);
        }
    }

    async start() {
        if (this.running) return;
        if (!this.initialized) await this.init();

        this.running = true;
        this.chestFull = false;
        Logger.success('☠️ Bone Collector: STARTED');

        // Main Loop
        while (this.running && !this.chestFull) {
            try {
                if (!this.config.spawnerPos || !this.config.chestPos) {
                    Logger.error("Error: Spawner/Chest positions not set! Use !spawner and !chest");
                    this.stop();
                    return;
                }

                await this.collectCycle();
                if (this.running && !this.chestFull) {
                    Logger.info(`Waiting ${(this.config.cycleDelay || 5000) / 1000}s...`);
                    await this.sleep(this.config.cycleDelay || 5000);
                }
            } catch (err) {
                Logger.error(`BoneCollector Error: ${err.message}`);
                this.stopMovement();
                await this.sleep(3000);
            }
        }
    }

    stop() {
        this.running = false;
        this.stopMovement();
        Logger.warning('☠️ Bone Collector: STOPPED');
    }

    stopMovement() {
        try { if (this.bot.pathfinder) this.bot.pathfinder.stop(); } catch (e) { }
        this.bot.setControlState('forward', false);
        this.bot.setControlState('sprint', false);
        this.bot.setControlState('jump', false);
    }

    async collectCycle() {
        this.stopMovement();
        await this.sleep(200);

        // 1. Go to Spawner
        Logger.info('→ Walking to Spawner... 🚶');
        await this.walkToManual(this.config.spawnerPos);
        await this.sleep(500);

        // 2. Open Spawner GUI
        Logger.info('→ Opening Spawner... 🤏');
        await this.interactWithBlock(this.config.spawnerPos);
        await this.sleep(1000);

        // 3. Click Loot Slot
        if (!this.bot.currentWindow) {
            Logger.error('Spawner menu failed to open.');
            return;
        }
        const slot = this.config.collectSlot ?? 13;
        try { await this.bot.clickWindow(slot, 0, 0); } catch (e) { }
        await this.sleep(800);

        // 4. Collect Bones (Shift-Click)
        Logger.info('→ Collecting Bones... 🦴');
        const collected = await this.shiftClickAllBones();
        Logger.info(`Got ${collected} stacks.`);

        this.closeCurrentWindow();
        await this.sleep(500);

        // 5. Go to Chest
        Logger.info('→ Walking to Chest... 📦');
        await this.walkToManual(this.config.chestPos);
        await this.sleep(500);

        // 6. Deposit Loot
        Logger.info('→ Depositing Loot...');
        await this.depositViaShiftClick();
    }

    async walkToManual(pos) {
        if (!pos) return;

        const targetVec = new Vec3(pos.x, pos.y, pos.z);
        const startTime = Date.now();
        const timeout = 25000; // 25s limit

        if (this.bot.entity.position.distanceTo(targetVec) < 2.5) {
            return; // Already there
        }

        while (this.running && (Date.now() - startTime) < timeout) {
            const botPos = this.bot.entity.position;
            const dist = botPos.distanceTo(targetVec);

            if (dist < 2.5) {
                this.stopMovement();
                return;
            }

            // Look at target
            await this.bot.lookAt(targetVec);

            // Move
            this.bot.setControlState('forward', true);

            // Simple Jump if stuck
            if (dist > 3 && this.bot.entity.onGround) {
                const yaw = this.bot.entity.yaw;
                const frontX = botPos.x - Math.sin(yaw);
                const frontZ = botPos.z - Math.cos(yaw);
                const frontBlock = this.bot.blockAt(new Vec3(frontX, botPos.y, frontZ));

                if (frontBlock && frontBlock.boundingBox !== 'empty') {
                    this.bot.setControlState('jump', true);
                    await this.sleep(150);
                    this.bot.setControlState('jump', false);
                }
            }

            await this.sleep(50);
        }

        this.stopMovement();
    }

    async interactWithBlock(pos) {
        try {
            const block = this.bot.blockAt(new Vec3(pos.x, pos.y, pos.z));
            if (block && block.name !== 'air') {
                await this.bot.lookAt(block.position.offset(0.5, 0.5, 0.5));
                await this.bot.activateBlock(block);
            } else {
                Logger.error(`Target block is AIR at ${pos.x},${pos.y},${pos.z}`);
            }
        } catch (e) { Logger.error(`Interact Error: ${e.message}`); }
    }

    async shiftClickAllBones() {
        const window = this.bot.currentWindow;
        if (!window) return 0;

        let count = 0;
        for (let i = 0; i < window.slots.length && this.running; i++) {
            const item = window.slots[i];
            if (!item || !item.name) continue;
            if (item.name.includes('bone')) {
                try {
                    await this.bot.clickWindow(i, 0, 1); // Shift click
                    count++;
                    await this.sleep(100);
                } catch (e) { }
            }
        }
        return count;
    }

    async depositViaShiftClick() {
        const chestPos = this.config.chestPos;
        const chestBlock = this.bot.blockAt(new Vec3(chestPos.x, chestPos.y, chestPos.z));

        if (!chestBlock) return;

        await this.bot.activateBlock(chestBlock);
        await this.sleep(1000);

        const window = this.bot.currentWindow;
        if (!window) return;

        const chestSlots = window.slots.length - 36; // Inventory start

        for (let i = chestSlots; i < window.slots.length && this.running; i++) {
            const item = window.slots[i];
            if (!item || !item.name) continue;
            if (item.name.includes('bone')) {
                try {
                    await this.bot.clickWindow(i, 0, 1);
                    await this.sleep(100);
                } catch (e) { }
            }
        }
        this.closeCurrentWindow();
    }

    closeCurrentWindow() {
        if (this.bot.currentWindow) {
            this.bot.closeWindow(this.bot.currentWindow);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
