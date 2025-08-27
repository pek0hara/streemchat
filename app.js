class StreemChat {
    constructor() {
        console.log('StreemChat constructor called');
        this.currentUser = null;
        this.currentUserId = null;
        this.currentDisplayName = null;
        this.currentNodeId = null;
        this.nodes = new Map();
        this.connections = new Map();
        this.messages = new Map(); // 全メッセージをnodeId別に保存
        this.readCounts = new Map(); // ノード別既読数をローカル保存
        this.messageUnsubscribes = new Map();
        this.allMessagesUnsubscribe = null; // 全メッセージの監視用
        this.usedPositions = []; // 使用済み位置を記録
        this.selectedNodeId = null; // 選択されたノードID
        
        this.initializeElements();
        this.setupEventListeners();
        // this.initializeRootNode(); // コンストラクタでは呼ばない
        this.setupViewportFix();
        console.log('StreemChat initialization complete');
    }
    
    initializeElements() {
        console.log('Initializing elements...');
        this.elements = {
            username: document.getElementById('username'),
            connectBtn: document.getElementById('connectBtn'),
            mindmapCanvas: document.getElementById('mindmap-canvas'),
            chatPanel: document.getElementById('chat-panel'),
            chatTopic: document.getElementById('chat-topic'),
            closeChatBtn: document.getElementById('closeChatBtn'),
            chatMessages: document.getElementById('chat-messages'),
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            branchBtn: document.getElementById('branchBtn'),
            nodeSelector: document.getElementById('nodeSelector')
        };
        
        console.log('Username element found:', this.elements.username);
        this.loadSavedUsername();
        this.loadReadCounts();
    }
    
    generateUserId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    loadSavedUsername() {
        const savedUsername = localStorage.getItem('streemchat-username');
        const savedUserId = localStorage.getItem('streemchat-userid');
        
        console.log('Loading saved username:', savedUsername);
        console.log('Loading saved user ID:', savedUserId);
        
        if (savedUsername) {
            this.elements.username.value = savedUsername;
            console.log('Username loaded successfully:', savedUsername);
            
            // キャッシュに名前がある場合は自動接続
            setTimeout(() => {
                console.log('Auto-connecting with cached username:', savedUsername);
                this.connect();
            }, 500);
        } else {
            console.log('No saved username found');
        }
        
        if (savedUserId) {
            this.currentUserId = savedUserId;
            console.log('User ID loaded successfully:', savedUserId);
        } else {
            this.currentUserId = this.generateUserId();
            localStorage.setItem('streemchat-userid', this.currentUserId);
            console.log('New user ID generated and saved:', this.currentUserId);
        }
    }
    
    saveUsername(username) {
        console.log('Saving username:', username);
        localStorage.setItem('streemchat-username', username);
        console.log('Username saved to localStorage');
        
        // 確認のため読み取りテスト
        const verification = localStorage.getItem('streemchat-username');
        console.log('Verification read:', verification);
    }
    
    loadReadCounts() {
        const savedReadCounts = localStorage.getItem('streemchat-readcounts');
        if (savedReadCounts) {
            try {
                const readCountsData = JSON.parse(savedReadCounts);
                this.readCounts = new Map(Object.entries(readCountsData));
                console.log('Read counts loaded:', this.readCounts);
            } catch (error) {
                console.error('Error loading read counts:', error);
                this.readCounts = new Map();
            }
        } else {
            this.readCounts = new Map();
            console.log('No saved read counts found');
        }
    }
    
    saveReadCounts() {
        const readCountsData = Object.fromEntries(this.readCounts);
        localStorage.setItem('streemchat-readcounts', JSON.stringify(readCountsData));
        console.log('Read counts saved:', readCountsData);
    }
    
    setupEventListeners() {
        this.elements.connectBtn.addEventListener('click', () => this.connect());
        this.elements.closeChatBtn.addEventListener('click', () => this.closeChat());
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.branchBtn.addEventListener('click', () => this.createBranch());
        
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
        
        this.elements.username.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.connect();
            }
        });
        
        this.elements.nodeSelector.addEventListener('change', (e) => {
            this.selectedNodeId = e.target.value || null;
            this.refreshListDisplay();
        });
    }
    
    connect() {
        const username = this.elements.username.value.trim();
        if (!username) {
            alert('ユーザー名を入力してください');
            return;
        }
        
        // 特別なユーザー名による全削除機能
        if (username === 'delete_all') {
            if (confirm('全てのノードとメッセージを削除しますか？この操作は取り消せません。')) {
                this.deleteAllData();
                return;
            } else {
                this.elements.username.value = '';
                return;
            }
        }
        
        this.currentUser = username;
        this.currentDisplayName = `${username}#${this.currentUserId}`;
        this.saveUsername(username);
        this.elements.connectBtn.textContent = '接続中...';
        this.elements.connectBtn.disabled = true;
        
        this.cleanupOldNodes();
        this.initializeRootNode(); // 有効化
        this.loadAllMessages(); // 先にメッセージを読み込む
        this.loadNodes(); // その後ノードを読み込む
        
        setTimeout(() => {
            this.elements.connectBtn.textContent = '接続済み';
            this.elements.connectBtn.style.background = '#28a745';
        }, 1000);
    }
    
    async initializeRootNode() {
        console.log('initializeRootNode called');
        const db = getDB();
        
        try {
            // 既存のルートノードをチェック（orderByを削除してシンプルに）
            const existingRootNodes = await db.collection('nodes')
                .where('isRoot', '==', true)
                .get();
            
            if (!existingRootNodes.empty) {
                console.log(`Found ${existingRootNodes.size} root nodes`);
                
                // 複数ある場合は古いものを削除（createdAtで並び替え）
                const docs = existingRootNodes.docs.sort((a, b) => {
                    const aTime = a.data().createdAt?.toDate?.() || new Date(a.data().createdAt);
                    const bTime = b.data().createdAt?.toDate?.() || new Date(b.data().createdAt);
                    return bTime - aTime; // 降順
                });
                
                for (let i = 1; i < docs.length; i++) {
                    const oldNodeId = docs[i].id;
                    console.log(`Deleting duplicate root node: ${oldNodeId}`);
                    
                    // 古いルートノードのメッセージも削除
                    const messagesSnapshot = await db.collection('messages')
                        .where('nodeId', '==', oldNodeId)
                        .get();
                    
                    messagesSnapshot.forEach(messageDoc => {
                        messageDoc.ref.delete();
                    });
                    
                    // 古いノード削除
                    docs[i].ref.delete();
                }
                
                console.log('Root node cleanup completed, kept the latest one');
                return;
            }
            
            // ルートノードが存在しない場合は作成
            console.log('No root node found, creating new one...');
            
            // スマホ対応：画面サイズに応じた初期位置
            const containerWidth = window.innerWidth;
            const containerHeight = window.innerHeight * 0.6;
            const centerX = Math.max(50, (containerWidth - 200) / 2);
            const centerY = Math.max(50, (containerHeight - 100) / 2);
            
            console.log('Creating root node at:', {centerX, centerY, containerWidth, containerHeight});
            
            const rootNodeData = {
                title: 'メインチャット',
                x: centerX,
                y: centerY,
                isRoot: true,
                parentId: null,
                hierarchyLevel: 0,
                createdAt: new Date(),
                lastActivity: new Date()
            };
            
            const docRef = await db.collection('nodes').add(rootNodeData);
            console.log('Root node created with ID:', docRef.id);
        } catch (error) {
            console.log('Error initializing root node:', error);
        }
    }
    
    loadNodes() {
        const db = getDB();
        
        db.collection('nodes').onSnapshot((snapshot) => {
            const allNodes = new Map();
            
            // まず全ノードデータを収集
            snapshot.forEach((doc) => {
                const nodeData = doc.data();
                const nodeId = doc.id;
                allNodes.set(nodeId, nodeData);
            });
            
            // ノードセレクタを更新
            this.updateNodeSelector(allNodes);
            
            // 表示をクリア
            this.elements.mindmapCanvas.innerHTML = '';
            this.nodes.clear();
            this.usedPositions = [];
            
            // 一覧表示のみ
            this.elements.mindmapCanvas.classList.add('chronological-view');
            this.createListDisplay(allNodes);
        });
    }
    
    loadAllMessages() {
        const db = getDB();
        
        console.log('Starting to load all messages...');
        
        // 既存の監視を停止
        if (this.allMessagesUnsubscribe) {
            this.allMessagesUnsubscribe();
        }
        
        // 全メッセージをリアルタイム監視
        this.allMessagesUnsubscribe = db.collection('messages')
            .orderBy('createdAt', 'asc')
            .onSnapshot((snapshot) => {
                console.log(`Messages snapshot received: ${snapshot.size} messages`);
                
                // 変更を効率的に処理
                snapshot.docChanges().forEach((change) => {
                    const messageData = change.doc.data();
                    const messageId = change.doc.id;
                    const nodeId = messageData.nodeId;
                    
                    if (!this.messages.has(nodeId)) {
                        this.messages.set(nodeId, new Map());
                    }
                    
                    const nodeMessages = this.messages.get(nodeId);
                    
                    if (change.type === 'added') {
                        nodeMessages.set(messageId, messageData);
                        console.log(`Message added to node ${nodeId}: ${messageData.content}`);
                        
                        // 現在開いているチャットなら即座に表示
                        if (this.currentNodeId === nodeId) {
                            this.displayMessage(messageData);
                            this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
                        }
                        
                        // メッセージカウントを更新（全ノードに対して）
                        this.updateAllMessageCounts();
                    } else if (change.type === 'modified') {
                        nodeMessages.set(messageId, messageData);
                        console.log(`Message modified in node ${nodeId}`);
                        
                        // 現在開いているチャットなら再描画
                        if (this.currentNodeId === nodeId) {
                            this.refreshCurrentChat();
                        }
                    } else if (change.type === 'removed') {
                        nodeMessages.delete(messageId);
                        console.log(`Message removed from node ${nodeId}`);
                        
                        // 現在開いているチャットなら再描画
                        if (this.currentNodeId === nodeId) {
                            this.refreshCurrentChat();
                        }
                    }
                });
                
                const totalMessages = Array.from(this.messages.values()).reduce((total, nodeMessages) => total + nodeMessages.size, 0);
                console.log(`Total messages cached: ${totalMessages}`);
                
                // メッセージ読み込み完了後、選択中のノードがあれば表示を更新
                console.log('Checking if should refresh display, selectedNodeId:', this.selectedNodeId);
                if (this.selectedNodeId) {
                    console.log('Refreshing list display after messages loaded');
                    // 少し遅延させて確実に更新
                    setTimeout(() => {
                        this.refreshListDisplay();
                    }, 100);
                } else {
                    console.log('No selectedNodeId, skipping refresh');
                }
            });
    }
    
    
    
    
    
    
    openChat(nodeId, title) {
        this.currentNodeId = nodeId;
        this.elements.chatTopic.textContent = title;
        this.elements.chatPanel.classList.remove('hidden');
        
        document.querySelectorAll('.mindmap-node').forEach(node => {
            node.classList.remove('active');
        });
        
        const activeNode = this.nodes.get(nodeId);
        if (activeNode) {
            activeNode.element.classList.add('active');
        }
        
        // チャット表示時に既読マーク
        this.markAsRead(nodeId);
        
        // ローカルキャッシュからメッセージを表示
        this.loadMessagesFromCache(nodeId);
    }
    
    loadMessagesFromCache(nodeId) {
        console.log(`Loading messages from cache for node: ${nodeId}`);
        
        this.elements.chatMessages.innerHTML = '';
        
        // ローカルキャッシュからメッセージを取得
        const nodeMessages = this.messages.get(nodeId);
        if (nodeMessages) {
            // 時系列順にソート
            const sortedMessages = Array.from(nodeMessages.values()).sort((a, b) => {
                const timeA = a.createdAt?.toDate?.() || new Date(a.createdAt);
                const timeB = b.createdAt?.toDate?.() || new Date(b.createdAt);
                return timeA - timeB;
            });
            
            sortedMessages.forEach(messageData => {
                this.displayMessage(messageData);
            });
            
            console.log(`Displayed ${sortedMessages.length} cached messages for node ${nodeId}`);
        } else {
            console.log(`No cached messages found for node ${nodeId}`);
        }
        
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }
    
    refreshCurrentChat() {
        if (this.currentNodeId) {
            this.loadMessagesFromCache(this.currentNodeId);
        }
    }
    
    closeChat() {
        this.elements.chatPanel.classList.add('hidden');
        this.currentNodeId = null;
        
        document.querySelectorAll('.mindmap-node').forEach(node => {
            node.classList.remove('active');
        });
        
        // 個別メッセージ監視は不要（全体監視に統合済み）
    }
    
    
    displayMessage(messageData) {
        const messageElement = document.createElement('div');
        const isOwnMessage = messageData.username === this.currentUser || messageData.displayName === this.currentDisplayName;
        messageElement.className = `message ${isOwnMessage ? 'own' : 'other'}`;
        
        const timestamp = messageData.createdAt ? 
            new Date(messageData.createdAt.toDate ? messageData.createdAt.toDate() : messageData.createdAt).toLocaleTimeString() : 
            new Date().toLocaleTimeString();
        
        const displayName = messageData.displayName || messageData.username;
        
        messageElement.innerHTML = `
            <div class="username">${displayName}</div>
            <div class="content">${messageData.content}</div>
            <div class="timestamp">${timestamp}</div>
        `;
        
        this.elements.chatMessages.appendChild(messageElement);
    }
    
    async sendMessage() {
        const content = this.elements.messageInput.value.trim();
        if (!content || !this.currentUser || !this.currentNodeId) return;
        
        const db = getDB();
        
        try {
            await db.collection('messages').add({
                nodeId: this.currentNodeId,
                username: this.currentUser,
                displayName: this.currentDisplayName,
                content: content,
                createdAt: new Date()
            });
            
            await this.updateNodeActivity(this.currentNodeId);
            
            this.elements.messageInput.value = '';
            // メッセージカウントは全体監視のloadAllMessages()で自動更新される
            
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }
    
    updateMessageCount(nodeId) {
        const nodeData = this.nodes.get(nodeId);
        if (nodeData) {
            // ローカルキャッシュから実際のメッセージ数を取得
            const nodeMessages = this.messages.get(nodeId);
            const totalCount = nodeMessages ? nodeMessages.size : 0;
            
            // 既読数を取得
            const readCount = this.readCounts.get(nodeId) || 0;
            const unreadCount = Math.max(0, totalCount - readCount);
            
            nodeData.data.messageCount = totalCount;
            const countElement = nodeData.element.querySelector('.message-count');
            if (countElement) {
                if (unreadCount > 0) {
                    countElement.textContent = `${totalCount} メッセージ (${unreadCount}件未読)`;
                    countElement.style.color = '#dc3545'; // 赤色で未読を強調
                    countElement.style.fontWeight = 'bold';
                } else {
                    countElement.textContent = `${totalCount} メッセージ`;
                    countElement.style.color = '#6c757d'; // 通常色
                    countElement.style.fontWeight = 'normal';
                }
            }
            console.log(`Message count updated for ${nodeData.data.title}: ${totalCount} total, ${unreadCount} unread`);
        }
    }
    
    markAsRead(nodeId) {
        // チャット開設時に既読数を現在のメッセージ数に更新
        const nodeMessages = this.messages.get(nodeId);
        const totalCount = nodeMessages ? nodeMessages.size : 0;
        
        this.readCounts.set(nodeId, totalCount);
        this.saveReadCounts();
        
        // UI更新
        this.updateMessageCount(nodeId);
        
        console.log(`Marked ${totalCount} messages as read for node ${nodeId}`);
    }
    
    updateAllMessageCounts() {
        // 全ノードのメッセージカウントを更新
        this.nodes.forEach((nodeData, nodeId) => {
            this.updateMessageCount(nodeId);
        });
    }
    
    async createBranch() {
        if (!this.currentUser || !this.currentNodeId) return;
        
        const branchTitle = prompt('新しい話題のタイトルを入力してください:');
        if (!branchTitle) return;
        
        const parentNode = this.nodes.get(this.currentNodeId);
        if (!parentNode) return;
        
        // 親の階層レベルを取得して+1
        const parentHierarchyLevel = parentNode.data.hierarchyLevel || 0;
        const newHierarchyLevel = parentHierarchyLevel + 1;
        
        const angle = Math.random() * 2 * Math.PI;
        const distance = 200;
        const newX = parentNode.data.x + Math.cos(angle) * distance;
        const newY = parentNode.data.y + Math.sin(angle) * distance;
        
        const db = getDB();
        
        try {
            const branchData = {
                title: branchTitle,
                x: Math.max(50, Math.min(newX, window.innerWidth - 250)),
                y: Math.max(50, Math.min(newY, window.innerHeight - 150)),
                parentId: this.currentNodeId,
                hierarchyLevel: newHierarchyLevel,
                isRoot: false,
                createdAt: new Date(),
                lastActivity: new Date()
            };
            
            console.log(`Creating branch: "${branchTitle}" at hierarchy level ${newHierarchyLevel} (parent level: ${parentHierarchyLevel})`);;
            
            await db.collection('messages').add({
                nodeId: this.currentNodeId,
                username: this.currentUser,
                displayName: this.currentDisplayName,
                content: `🌿 新しい話題「${branchTitle}」を作成しました`,
                createdAt: new Date(),
                isBranchMessage: true
            });
            
            const docRef = await db.collection('nodes').add(branchData);
            console.log('Branch created with ID:', docRef.id);
            
        } catch (error) {
            console.error('Error creating branch:', error);
        }
    }
    
    async updateNodeActivity(nodeId) {
        const db = getDB();
        try {
            await db.collection('nodes').doc(nodeId).update({
                lastActivity: new Date()
            });
        } catch (error) {
            console.error('Error updating node activity:', error);
        }
    }
    
    
    async cleanupOldNodes() {
        // Firestoreインデックスエラーを避けるため、cleanup処理を無効化
        console.log('Cleanup skipped to avoid Firestore index issues');
        return;
        
        const db = getDB();
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        try {
            db.collection('nodes').where('isRoot', '==', false)
                .where('lastActivity', '<', twentyFourHoursAgo)
                .get()
                .then(snapshot => {
                    snapshot.forEach(async (doc) => {
                        const nodeId = doc.id;
                        console.log(`Deleting inactive node: ${nodeId}`);
                        
                        const messagesSnapshot = await db.collection('messages')
                            .where('nodeId', '==', nodeId)
                            .get();
                        
                        messagesSnapshot.forEach(messageDoc => {
                            messageDoc.ref.delete();
                        });
                        
                        doc.ref.delete();
                    });
                });
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    findNonOverlappingPosition(containerWidth, containerHeight) {
        const nodeWidth = 180;
        const nodeHeight = 120;
        const margin = 20;
        
        let attempts = 0;
        const maxAttempts = 50;
        
        while (attempts < maxAttempts) {
            const x = Math.floor(Math.random() * (containerWidth - nodeWidth - margin * 2)) + margin;
            const y = Math.floor(Math.random() * (containerHeight - nodeHeight - margin * 2)) + margin;
            
            // 既存の位置と重ならないかチェック
            let overlapping = false;
            for (const usedPos of this.usedPositions) {
                const dx = Math.abs(x - usedPos.x);
                const dy = Math.abs(y - usedPos.y);
                
                if (dx < nodeWidth + margin && dy < nodeHeight + margin) {
                    overlapping = true;
                    break;
                }
            }
            
            if (!overlapping) {
                return { x, y };
            }
            
            attempts++;
        }
        
        // 重ならない位置が見つからない場合はグリッド配置
        const gridSize = Math.ceil(Math.sqrt(this.usedPositions.length + 1));
        const gridX = (this.usedPositions.length % gridSize) * (nodeWidth + margin) + margin;
        const gridY = Math.floor(this.usedPositions.length / gridSize) * (nodeHeight + margin) + margin;
        
        return { x: gridX, y: gridY };
    }

    
    
    createListDisplay(allNodes) {
        if (!this.selectedNodeId) {
            // ノードが選択されていない場合はメッセージを表示
            this.elements.mindmapCanvas.innerHTML = '<div style="text-align: center; padding: 50px; color: #6c757d; font-size: 1.1rem;">ノードを選択してください</div>';
            return;
        }
        
        // 選択されたノードとその配下のノードを取得
        const descendantNodeIds = this.getDescendantNodes(this.selectedNodeId, allNodes);
        console.log(`Selected node descendants: ${descendantNodeIds.length} nodes`);
        
        // 配下のノードのメッセージを時系列順で表示
        const filteredMessages = [];
        
        descendantNodeIds.forEach(nodeId => {
            const nodeMessages = this.messages.get(nodeId);
            if (nodeMessages) {
                nodeMessages.forEach((messageData, messageId) => {
                    filteredMessages.push({
                        type: 'message',
                        id: messageId,
                        data: messageData,
                        createdAt: messageData.createdAt?.toDate?.() || new Date(messageData.createdAt),
                        nodeId: nodeId
                    });
                });
            }
        });
        
        // 時系列順でソート
        filteredMessages.sort((a, b) => a.createdAt - b.createdAt);
        
        const selectedNodeData = allNodes.get(this.selectedNodeId);
        const selectedNodeTitle = selectedNodeData ? selectedNodeData.title : 'Unknown';
        
        console.log(`Creating list display for "${selectedNodeTitle}" with ${filteredMessages.length} messages from ${descendantNodeIds.length} descendant nodes`);
        
        if (filteredMessages.length === 0) {
            this.elements.mindmapCanvas.innerHTML = `<div style="text-align: center; padding: 50px; color: #6c757d; font-size: 1.1rem;">"${selectedNodeTitle}"とその配下にはメッセージがありません</div>`;
            return;
        }
        
        // 選択されたノードの情報を表示
        const headerElement = document.createElement('div');
        headerElement.style.cssText = `
            background: linear-gradient(135deg, #007bff 0%, #6c5ce7 100%);
            color: white;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0, 123, 255, 0.3);
        `;
        headerElement.innerHTML = `
            <h3 style="margin: 0; font-size: 1.3rem;">📁 ${selectedNodeTitle}</h3>
            <div style="margin-top: 8px; opacity: 0.9; font-size: 0.95rem;">
                配下 ${descendantNodeIds.length} ノードから ${filteredMessages.length} メッセージを表示
            </div>
        `;
        this.elements.mindmapCanvas.appendChild(headerElement);
        
        // 時系列順でメッセージのみを表示
        filteredMessages.forEach((message, index) => {
            this.createListMessageElement(message.id, message.data, message.nodeId, index, allNodes);
        });
    }
    
    
    createListNodeElement(nodeId, nodeData, index) {
        const nodeElement = document.createElement('div');
        nodeElement.className = 'chronological-node';
        nodeElement.dataset.nodeId = nodeId;
        nodeElement.dataset.index = index;
        
        // 時系列表示用のスタイル
        nodeElement.style.marginBottom = '10px';
        nodeElement.style.padding = '15px';
        nodeElement.style.background = nodeData.isRoot 
            ? 'linear-gradient(135deg, #28a745 0%, #20c997 100%)'
            : 'linear-gradient(135deg, #007bff 0%, #6c5ce7 100%)';
        nodeElement.style.color = 'white';
        nodeElement.style.borderRadius = '10px';
        nodeElement.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
        nodeElement.style.cursor = 'pointer';
        
        const timestamp = nodeData.createdAt?.toDate?.() 
            ? new Date(nodeData.createdAt.toDate()).toLocaleString()
            : new Date(nodeData.createdAt).toLocaleString();
            
        nodeElement.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h4 style="margin: 0; font-size: 1.1rem;">📁 ${nodeData.title}</h4>
                <small style="opacity: 0.8;">${timestamp}</small>
            </div>
            <div style="margin-top: 5px; font-size: 0.9rem; opacity: 0.9;">
                ${nodeData.messageCount || 0} メッセージ | スレッド作成
            </div>
        `;
        
        nodeElement.addEventListener('click', () => this.openChat(nodeId, nodeData.title));
        
        this.elements.mindmapCanvas.appendChild(nodeElement);
        this.nodes.set(nodeId, { element: nodeElement, data: nodeData });
        
        console.log(`✓ List node created: "${nodeData.title}" at position ${index}`);
    }
    
    createListMessageElement(messageId, messageData, nodeId, index, allNodes) {
        const messageElement = document.createElement('div');
        messageElement.className = 'chronological-message';
        messageElement.dataset.messageId = messageId;
        messageElement.dataset.nodeId = nodeId;
        messageElement.dataset.index = index;
        
        // 時系列表示用のメッセージスタイル
        messageElement.style.marginBottom = '10px';
        messageElement.style.marginLeft = '0px';
        messageElement.style.padding = '15px';
        messageElement.style.background = '#ffffff';
        messageElement.style.border = '1px solid #e9ecef';
        messageElement.style.borderRadius = '10px';
        messageElement.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
        
        const timestamp = messageData.createdAt?.toDate?.() 
            ? new Date(messageData.createdAt.toDate()).toLocaleString()
            : new Date(messageData.createdAt).toLocaleString();
            
        // 親ノードの情報を取得
        const parentNodeEntry = Array.from(allNodes.entries()).find(([id, data]) => id === nodeId);
        const parentTitle = parentNodeEntry ? parentNodeEntry[1].title : 'Unknown';
        
        const displayName = messageData.displayName || messageData.username;
        
        messageElement.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <div style="display: flex; flex-direction: column;">
                    <strong style="color: #495057; font-size: 0.9rem;">${displayName}</strong>
                    <small style="color: #6c757d; font-size: 0.8rem;">📁 ${parentTitle}</small>
                </div>
                <small style="color: #6c757d;">${timestamp}</small>
            </div>
            <div style="color: #333; line-height: 1.4;">${messageData.content}</div>
        `;
        
        // メッセージクリックで該当ノードのチャットを開く
        messageElement.addEventListener('click', () => {
            this.openChat(nodeId, parentTitle);
        });
        
        this.elements.mindmapCanvas.appendChild(messageElement);
        
        console.log(`✓ List message created: "${messageData.content.substring(0, 30)}..." in node "${parentTitle}"`);
    }
    
    updateNodeSelector(allNodes) {
        // セレクタのオプションをクリア
        this.elements.nodeSelector.innerHTML = '';
        
        // 階層順でソートしてオプションを追加
        const sortedNodes = Array.from(allNodes.entries()).sort((a, b) => {
            const levelA = a[1].hierarchyLevel || 0;
            const levelB = b[1].hierarchyLevel || 0;
            if (levelA !== levelB) {
                return levelA - levelB;
            }
            const timeA = a[1].createdAt?.toDate?.() || new Date(a[1].createdAt);
            const timeB = b[1].createdAt?.toDate?.() || new Date(b[1].createdAt);
            return timeA - timeB;
        });
        
        let rootNodeId = null;
        sortedNodes.forEach(([nodeId, nodeData]) => {
            const option = document.createElement('option');
            option.value = nodeId;
            const indent = '　'.repeat(nodeData.hierarchyLevel || 0);
            option.textContent = `${indent}${nodeData.title}`;
            this.elements.nodeSelector.appendChild(option);
            
            // ルートノードを記録
            if (nodeData.isRoot) {
                rootNodeId = nodeId;
            }
        });
        
        // デフォルトでメインチャット（ルートノード）を選択
        if (rootNodeId && !this.selectedNodeId) {
            this.elements.nodeSelector.value = rootNodeId;
            this.selectedNodeId = rootNodeId;
        }
    }
    
    getDescendantNodes(parentId, allNodes) {
        const descendants = [];
        const stack = [parentId];
        
        while (stack.length > 0) {
            const currentId = stack.pop();
            descendants.push(currentId);
            
            // 現在のノードの子ノードを見つけて追加
            Array.from(allNodes.entries()).forEach(([nodeId, nodeData]) => {
                if (nodeData.parentId === currentId) {
                    stack.push(nodeId);
                }
            });
        }
        
        return descendants;
    }
    
    refreshListDisplay() {
        // 既存の表示をクリア
        this.elements.mindmapCanvas.innerHTML = '';
        this.nodes.clear();
        
        // ノード情報を再取得して表示を更新
        const db = getDB();
        db.collection('nodes').get().then((snapshot) => {
            const allNodes = new Map();
            snapshot.forEach((doc) => {
                const nodeData = doc.data();
                const nodeId = doc.id;
                allNodes.set(nodeId, nodeData);
            });
            this.createListDisplay(allNodes);
        });
    }


    setupViewportFix() {
        // スマホのキーボード表示/非表示による画面リサイズ対応
        if (window.innerWidth <= 768) {
            // 初期のビューポート高さを記録
            let vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
            
            // ヘッダー高さに基づく位置調整
            const adjustContainerPosition = () => {
                const header = document.querySelector('header');
                const container = document.getElementById('mindmap-container');
                if (header && container) {
                    const headerHeight = header.offsetHeight;
                    container.style.top = `${headerHeight}px`;
                    console.log(`Container positioned at: ${headerHeight}px`);
                }
            };
            
            // 初期設定
            setTimeout(adjustContainerPosition, 100);
            
            // リサイズ時の処理
            window.addEventListener('resize', () => {
                let vh = window.innerHeight * 0.01;
                document.documentElement.style.setProperty('--vh', `${vh}px`);
                setTimeout(adjustContainerPosition, 100);
            });
            
            // iOS Safari対応
            window.addEventListener('orientationchange', () => {
                setTimeout(() => {
                    let vh = window.innerHeight * 0.01;
                    document.documentElement.style.setProperty('--vh', `${vh}px`);
                    adjustContainerPosition();
                }, 500);
            });
        }
    }

    async deleteAllData() {
        const db = getDB();
        
        try {
            // まずメッセージをバッチで削除
            console.log('Deleting all messages...');
            let messagesDeleted = 0;
            let messagesSnapshot;
            
            do {
                messagesSnapshot = await db.collection('messages').limit(500).get();
                if (messagesSnapshot.empty) break;
                
                const batch = db.batch();
                messagesSnapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
                messagesDeleted += messagesSnapshot.size;
                console.log(`Deleted ${messagesSnapshot.size} messages (total: ${messagesDeleted})`);
            } while (!messagesSnapshot.empty);
            
            // 次にノードをバッチで削除
            console.log('Deleting all nodes...');
            let nodesDeleted = 0;
            let nodesSnapshot;
            
            do {
                nodesSnapshot = await db.collection('nodes').limit(500).get();
                if (nodesSnapshot.empty) break;
                
                const batch = db.batch();
                nodesSnapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
                nodesDeleted += nodesSnapshot.size;
                console.log(`Deleted ${nodesSnapshot.size} nodes (total: ${nodesDeleted})`);
            } while (!nodesSnapshot.empty);
            
            console.log(`All data deleted: ${messagesDeleted} messages, ${nodesDeleted} nodes`);
            alert(`全てのデータを削除しました\nメッセージ: ${messagesDeleted}件\nノード: ${nodesDeleted}件`);
            this.elements.username.value = '';
            location.reload();
            
        } catch (error) {
            console.error('Error deleting all data:', error);
            alert('削除中にエラーが発生しました: ' + error.message);
        }
    }
}

console.log('Script loaded');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded event fired');
    console.log('Creating StreemChat instance...');
    new StreemChat();
});

// フォールバック：DOMが既に読み込まれている場合
if (document.readyState === 'loading') {
    console.log('DOM is still loading, waiting for DOMContentLoaded');
} else {
    console.log('DOM already loaded, creating StreemChat immediately');
    new StreemChat();
}