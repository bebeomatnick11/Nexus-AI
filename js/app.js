import { AgentRuntime, CapabilityRegistry } from './agent-runtime.js';

class NexusApp {
    constructor() {
        this.runtime = new AgentRuntime();
        this.conversations = [];
        this.currentConvId = null;
        this.activeTab = 'chat'; // chat | skills | memory | tools | tasks | debug
        
        this.init();
    }

    async init() {
        this.loadConversations();
        this.bindEvents();
        this.renderConversations();
        this.renderCurrentChat();
        this.updateDiagnosticsUI();
        
        console.log("NexusAI Agent V2 Engine Initialized Successfully.");
    }

    // --- CONVERSATION STORAGE MANAGEMENT ---
    loadConversations() {
        const raw = localStorage.getItem('NexusAI_Conversations');
        if (raw) {
            try {
                this.conversations = JSON.parse(raw);
            } catch (e) {
                this.conversations = [];
            }
        }
        if (this.conversations.length === 0) {
            this.createNewChat();
        } else {
            this.currentConvId = this.conversations[0].id;
        }
    }

    saveConversations() {
        localStorage.setItem('NexusAI_Conversations', JSON.stringify(this.conversations));
    }

    getCurrentConversation() {
        return this.conversations.find(c => c.id === this.currentConvId);
    }

    createNewChat() {
        const newConv = {
            id: 'conv_' + Date.now(),
            title: 'Cuộc trò chuyện mới',
            createdAt: new Date().toISOString(),
            messages: [
                {
                    role: 'assistant',
                    content: 'Xin chào! Tôi là **NexusAI Agent V2**. Tôi có thể hỗ trợ bạn suy luận nhiều bước, tính toán, quản lý bộ nhớ cá nhân bền vững và truy xuất lịch sử cuộc trò chuyện. Hãy nhập yêu cầu của bạn!'
                }
            ]
        };
        this.conversations.unshift(newConv);
        this.currentConvId = newConv.id;
        this.saveConversations();
        this.renderConversations();
        this.renderCurrentChat();
        this.toggleSidebar(false);
    }

    switchConversation(id) {
        this.currentConvId = id;
        this.renderConversations();
        this.renderCurrentChat();
        this.toggleSidebar(false);
    }

    clearCurrentChat() {
        const conv = this.getCurrentConversation();
        if (conv) {
            conv.messages = [
                {
                    role: 'assistant',
                    content: 'Hội thoại đã được xóa sạch.'
                }
            ];
            this.saveConversations();
            this.renderCurrentChat();
        }
    }

    // --- UI RENDERING & EVENTS ---
    bindEvents() {
        const sendBtn = document.getElementById('send-btn');
        const chatInput = document.getElementById('chat-input');

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.handleSendMessage());
        }

        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });
        }
    }

    async handleSendMessage() {
        const chatInput = document.getElementById('chat-input');
        if (!chatInput) return;

        const text = chatInput.value.trim();
        if (!text) return;

        chatInput.value = '';

        const conv = this.getCurrentConversation();
        if (!conv) return;

        // Auto update title for new conversation
        if (conv.messages.length <= 1) {
            conv.title = text.length > 25 ? text.substring(0, 25) + '...' : text;
            this.renderConversations();
        }

        // Append User Message
        conv.messages.push({ role: 'user', content: text });
        this.saveConversations();
        this.renderCurrentChat();

        // Show Loading indicator
        this.showTypingIndicator(true);

        // Process through Agent Runtime
        const assistantResponse = await this.runtime.processUserMessage(text, conv.messages.slice(0, -1));

        this.showTypingIndicator(false);

        // Append Assistant Response
        conv.messages.push({ role: 'assistant', content: assistantResponse });
        this.saveConversations();
        this.renderCurrentChat();
    }

    renderConversations() {
        const listEl = document.getElementById('conversation-list');
        if (!listEl) return;

        listEl.innerHTML = this.conversations.map(c => `
            <div onclick="app.switchConversation('${c.id}')" class="p-2.5 rounded-lg text-sm cursor-pointer transition flex items-center justify-between ${c.id === this.currentConvId ? 'bg-indigo-600/20 text-indigo-300 font-medium border border-indigo-500/30' : 'text-gray-400 hover:bg-dark-700 hover:text-gray-200'}">
                <div class="flex items-center gap-2 truncate">
                    <i class="fa-regular fa-message text-xs"></i>
                    <span class="truncate">${c.title}</span>
                </div>
            </div>
        `).join('');
    }

    renderCurrentChat() {
        const chatContainer = document.getElementById('chat-messages-container');
        const titleEl = document.getElementById('current-chat-title');
        const conv = this.getCurrentConversation();

        if (titleEl && conv) {
            titleEl.textContent = conv.title;
        }

        if (!chatContainer || !conv) return;

        chatContainer.innerHTML = conv.messages.map((m, idx) => {
            const isUser = m.role === 'user';
            const parsedContent = typeof marked !== 'undefined' ? marked.parse(m.content) : m.content;

            return `
                <div class="flex gap-4 p-4 ${isUser ? 'bg-dark-800/40' : 'bg-dark-900'} rounded-xl border border-dark-700/50">
                    <div class="w-8 h-8 rounded-lg ${isUser ? 'bg-indigo-600' : 'bg-emerald-600'} flex items-center justify-center text-white text-xs font-bold shrink-0">
                        ${isUser ? 'U' : 'AI'}
                    </div>
                    <div class="flex-1 overflow-x-auto space-y-2 text-sm text-gray-200 leading-relaxed">
                        ${parsedContent}
                    </div>
                </div>
            `;
        }).join('');

        this.attachCodeCopyButtons();
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    attachCodeCopyButtons() {
        document.querySelectorAll('pre code').forEach((codeBlock) => {
            if (codeBlock.parentNode.querySelector('.copy-code-btn')) return;

            const btn = document.createElement('button');
            btn.className = 'copy-code-btn absolute top-2 right-2 bg-dark-700 hover:bg-dark-600 text-xs text-gray-300 px-2 py-1 rounded transition border border-dark-600';
            btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
            btn.onclick = () => {
                navigator.clipboard.writeText(codeBlock.innerText);
                btn.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i> Copied!';
                setTimeout(() => {
                    btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
                }, 2000);
            };

            const parent = codeBlock.parentNode;
            if (parent && parent.tagName === 'PRE') {
                parent.style.position = 'relative';
                parent.appendChild(btn);
            }
        });
    }

    showTypingIndicator(show) {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            if (show) indicator.classList.remove('hidden');
            else indicator.classList.add('hidden');
        }
    }

    toggleSidebar(show) {
        const sidebar = document.getElementById('app-sidebar');
        const overlay = document.getElementById('mobile-overlay');
        if (!sidebar) return;

        if (show) {
            sidebar.classList.remove('-translate-x-full');
            if (overlay) overlay.classList.remove('hidden');
        } else {
            sidebar.classList.add('-translate-x-full');
            if (overlay) overlay.classList.add('hidden');
        }
    }

    onDebugLog(logEntry) {
        const debugPanel = document.getElementById('debug-log-list');
        if (!debugPanel) return;

        const row = document.createElement('div');
        row.className = 'p-2 rounded bg-dark-800 border border-dark-700 text-xs font-mono flex items-start gap-2';
        row.innerHTML = `
            <span class="text-gray-500">[${logEntry.timestamp}]</span>
            <span class="font-bold text-indigo-400">${logEntry.type}</span>
            <span class="text-gray-300">${logEntry.source}:</span>
            <span class="text-emerald-400">${logEntry.status}</span>
            <span class="text-gray-400 truncate">${JSON.stringify(logEntry.data || {})}</span>
        `;
        debugPanel.appendChild(row);
        debugPanel.scrollTop = debugPanel.scrollHeight;
    }

    // --- TAB SWITCHER & VIEWS ---
    switchTab(tabName) {
        this.activeTab = tabName;
        const mainChat = document.getElementById('main-chat-view');
        const tabContainer = document.getElementById('tab-content-view');

        if (!mainChat || !tabContainer) return;

        if (tabName === 'chat') {
            mainChat.classList.remove('hidden');
            tabContainer.classList.add('hidden');
        } else {
            mainChat.classList.add('hidden');
            tabContainer.classList.remove('hidden');
            this.renderTabView(tabName);
        }
        this.toggleSidebar(false);
    }

    async renderTabView(tab) {
        const container = document.getElementById('tab-content-view');
        if (!container) return;

        if (tab === 'memory') {
            const memories = await this.runtime.memoryEngine.getAll();
            container.innerHTML = `
                <div class="p-6 space-y-4 max-w-4xl mx-auto">
                    <div class="flex items-center justify-between">
                        <h2 class="text-xl font-bold text-white flex items-center gap-2">
                            <i class="fa-solid fa-brain text-emerald-400"></i> Memory Inspector (IndexedDB)
                        </h2>
                        <button onclick="app.clearAllMemories()" class="bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs px-3 py-1.5 rounded-lg border border-rose-500/30 transition">Clear All Memory</button>
                    </div>
                    <div class="grid gap-3">
                        ${memories.length === 0 ? '<p class="text-gray-400 text-sm">Chưa có bộ nhớ lưu trữ trong IndexedDB.</p>' : memories.map(m => `
                            <div class="p-3 bg-dark-800 border border-dark-700 rounded-xl flex items-center justify-between">
                                <div>
                                    <span class="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">${m.type}</span>
                                    <span class="font-semibold text-gray-200 ml-2">${m.key}:</span>
                                    <span class="text-gray-300 text-sm ml-1">${m.value}</span>
                                </div>
                                <button onclick="app.deleteMemory(${m.id})" class="text-gray-500 hover:text-rose-400 text-xs p-1"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (tab === 'tools') {
            const tools = this.runtime.toolRegistry.getDefinitions();
            container.innerHTML = `
                <div class="p-6 space-y-4 max-w-4xl mx-auto">
                    <h2 class="text-xl font-bold text-white flex items-center gap-2">
                        <i class="fa-solid fa-toolbox text-amber-400"></i> Tool Registry (Real Capabilities)
                    </h2>
                    <div class="grid gap-3">
                        ${tools.map(t => `
                            <div class="p-4 bg-dark-800 border border-dark-700 rounded-xl space-y-1">
                                <div class="flex items-center gap-2">
                                    <span class="font-mono font-bold text-indigo-400">${t.name}</span>
                                    <span class="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">READY</span>
                                </div>
                                <p class="text-sm text-gray-300">${t.description}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (tab === 'debug') {
            container.innerHTML = `
                <div class="p-6 space-y-4 max-w-4xl mx-auto h-full flex flex-col">
                    <h2 class="text-xl font-bold text-white flex items-center gap-2">
                        <i class="fa-solid fa-terminal text-rose-400"></i> Real-time Debug Panel
                    </h2>
                    <div id="debug-log-list" class="flex-1 bg-dark-900 border border-dark-700 rounded-xl p-4 overflow-y-auto space-y-2 min-h-[400px]">
                        <p class="text-xs text-gray-500">Sự kiện từ Agent Runtime sẽ hiển thị tại đây...</p>
                    </div>
                </div>
            `;
        } else if (tab === 'skills') {
            container.innerHTML = `
                <div class="p-6 space-y-4 max-w-4xl mx-auto">
                    <h2 class="text-xl font-bold text-white flex items-center gap-2">
                        <i class="fa-solid fa-wand-magic-sparkles text-indigo-400"></i> Active Skills
                    </h2>
                    <div class="grid gap-3">
                        <div class="p-4 bg-dark-800 border border-dark-700 rounded-xl">
                            <span class="font-bold text-gray-200">conversation-recall</span>
                            <p class="text-sm text-gray-400">Tự động tìm kiếm và trích xuất ngữ cảnh từ các cuộc hội thoại quá khứ.</p>
                        </div>
                        <div class="p-4 bg-dark-800 border border-dark-700 rounded-xl">
                            <span class="font-bold text-gray-200">handles-long-code</span>
                            <p class="text-sm text-gray-400">Tự động cấu trúc và giữ vẹn toàn khối mã nguồn lớn không bị xé lẻ.</p>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    async deleteMemory(id) {
        await this.runtime.memoryEngine.delete(id);
        this.renderTabView('memory');
    }

    async clearAllMemories() {
        await this.runtime.memoryEngine.clearAll();
        this.renderTabView('memory');
    }

    // --- DATA IMPORT / EXPORT MANAGER ---
    exportData() {
        const data = {
            conversations: this.conversations,
            exportDate: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nexusai_backup_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (parsed.conversations && Array.isArray(parsed.conversations)) {
                    this.conversations = parsed.conversations;
                    this.saveConversations();
                    this.renderConversations();
                    this.renderCurrentChat();
                    alert("Đã nhập dữ liệu thành công!");
                }
            } catch (err) {
                alert("File sao lưu không hợp lệ.");
            }
        };
        reader.readAsText(file);
    }

    updateDiagnosticsUI() {
        console.log("Diagnostics Capability Status:", CapabilityRegistry);
    }
}

// Global App Instance Setup
window.app = new NexusApp();
