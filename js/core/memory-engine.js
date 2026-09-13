/**
 * NEXUSAI V5 — 3-Tier Memory System (Semantic Long-Term Store)
 */

export class MemoryEngine {
    constructor() {
        this.dbName = "NexusAI_Memory_DB";
        this.dbVersion = 2;
        this.db = null;
    }

    async init() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = () => reject("IndexedDB open failed");
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("memories")) {
                    const store = db.createObjectStore("memories", { keyPath: "id", autoIncrement: true });
                    store.createIndex("type", "type", { unique: false });
                    store.createIndex("key", "key", { unique: false });
                }
            };
        });
    }

    async store(type, key, value, importance = 1, conversationId = "default") {
        await this.init();
        const existing = await this.findByKey(key);

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["memories"], "readwrite");
            const store = tx.objectStore("memories");
            
            const record = {
                type,
                key,
                value,
                importance,
                timestamp: new Date().toISOString(),
                lastAccessed: new Date().toISOString(),
                accessCount: existing ? (existing.accessCount || 1) + 1 : 1,
                conversationId
            };

            let req;
            if (existing) {
                record.id = existing.id;
                req = store.put(record);
            } else {
                req = store.add(record);
            }

            req.onsuccess = () => resolve(record);
            req.onerror = () => reject("Failed to store/update memory record");
        });
    }

    async findByKey(key) {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(["memories"], "readonly");
            const store = tx.objectStore("memories");
            const index = store.index("key");
            const req = index.get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    async getAll() {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(["memories"], "readonly");
            const store = tx.objectStore("memories");
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    async delete(id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["memories"], "readwrite");
            const store = tx.objectStore("memories");
            const req = store.delete(Number(id));
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject("Failed to delete memory");
        });
    }

    async clearAll() {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(["memories"], "readwrite");
            const store = tx.objectStore("memories");
            const req = store.clear();
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
    }
}

export class MemoryRetriever {
    constructor(memoryEngine) {
        this.memoryEngine = memoryEngine;
    }

    async retrieveRelevant(query, limit = 4) {
        const allMemories = await this.memoryEngine.getAll();
        if (!allMemories || allMemories.length === 0) return [];

        const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);

        const scored = allMemories.map(mem => {
            let score = 0;
            const textContent = `${mem.key} ${JSON.stringify(mem.value)} ${mem.type}`.toLowerCase();
            
            tokens.forEach(token => {
                if (textContent.includes(token)) score += 2;
            });

            if (mem.key && query.toLowerCase().includes(mem.key.toLowerCase())) {
                score += 5;
            }

            // Recency & Frequency Scoring
            const hoursSinceAccess = (Date.now() - new Date(mem.lastAccessed).getTime()) / (1000 * 3600);
            const recencyBonus = Math.max(0, 2 - hoursSinceAccess * 0.1);

            score += (mem.importance || 1) * 0.5 + recencyBonus + Math.min(3, (mem.accessCount || 1) * 0.2);

            return { mem, score };
        });

        return scored
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(item => item.mem);
    }
}
