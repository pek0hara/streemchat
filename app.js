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
            renameChatBtn: document.getElementById('renameChatBtn'),
            chatMessages: document.getElementById('chat-messages'),
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            nodeSelector: document.getElementById('nodeSelector'),
            charCounter: document.getElementById('charCounter')
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
        this.elements.renameChatBtn.addEventListener('click', () => this.renameChat());
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // 文字数カウンターのイベントリスナー
        this.elements.messageInput.addEventListener('input', () => {
            this.updateCharCounter();
        });
        
        this.elements.username.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.connect();
            }
        });
        
        this.elements.nodeSelector.addEventListener('change', (e) => {
            const nodeId = e.target.value;

            // If create new option is selected
            if (nodeId === 'CREATE_NEW') {
                this.showCreateNodeDialog();
                // Reset selector to previous selection
                e.target.value = '';
                return;
            }

            // If a real node is selected
            if (nodeId) {
                this.selectedNodeId = nodeId;
                const node = this.nodes.get(nodeId);
                if (node && node.data) {
                    this.openChat(nodeId, node.data.title);
                    this.refreshListDisplay();
                }
            }
            // If the blank '---' option is selected
            else {
                // Find the root node to display its list
                let rootNodeId = null;
                for (const [id, node] of this.nodes.entries()) {
                    if (node.data.isRoot) {
                        rootNodeId = id;
                        break;
                    }
                }

                // Set the selected ID to the root node for the list display
                this.selectedNodeId = rootNodeId;
                
                this.closeChat();
                this.refreshListDisplay();
            }
        });
    }

    showCreateNodeDialog() {
        this.showCustomDialog('新しい話題のタイトルを入力してください:')
            .then(nodeTitle => {
                if (!nodeTitle) return;

                // 現在選択されているノードを親として使用、なければルートノードを使用
                let parentNodeId = this.selectedNodeId;
                if (!parentNodeId) {
                    // ルートノードを見つける
                    for (const [id, node] of this.nodes.entries()) {
                        if (node.data.isRoot) {
                            parentNodeId = id;
                            break;
                        }
                    }
                }

                if (!parentNodeId) {
                    alert('親ノードが見つかりません');
                    return;
                }

                this.createNewNode(nodeTitle, parentNodeId);
            })
            .catch(() => {
                // キャンセル時は何もしない
            });
    }

    showCustomDialog(placeholder = '') {
        return new Promise((resolve, reject) => {
            const overlay = document.getElementById('customDialog');
            const input = document.getElementById('dialogInput');
            const cancelBtn = document.getElementById('dialogCancel');
            const okBtn = document.getElementById('dialogOk');

            // 入力欄の設定
            input.value = '';
            input.placeholder = placeholder;
            
            // ダイアログを表示
            overlay.style.display = 'flex';
            
            // 入力欄にフォーカス
            setTimeout(() => input.focus(), 100);

            // ボタンの状態管理
            const updateOkButton = () => {
                const hasValue = input.value.trim().length > 0;
                okBtn.disabled = !hasValue;
            };

            input.addEventListener('input', updateOkButton);
            updateOkButton(); // 初期状態

            // イベントリスナー
            const cleanup = () => {
                overlay.style.display = 'none';
                input.removeEventListener('input', updateOkButton);
                cancelBtn.removeEventListener('click', onCancel);
                okBtn.removeEventListener('click', onOk);
                input.removeEventListener('keypress', onKeyPress);
                overlay.removeEventListener('click', onOverlayClick);
            };

            const onCancel = () => {
                cleanup();
                reject();
            };

            const onOk = () => {
                const value = input.value.trim();
                if (value) {
                    cleanup();
                    resolve(value);
                }
            };

            const onKeyPress = (e) => {
                if (e.key === 'Enter' && input.value.trim()) {
                    onOk();
                } else if (e.key === 'Escape') {
                    onCancel();
                }
            };

            const onOverlayClick = (e) => {
                if (e.target === overlay) {
                    onCancel();
                }
            };

            cancelBtn.addEventListener('click', onCancel);
            okBtn.addEventListener('click', onOk);
            input.addEventListener('keypress', onKeyPress);
            overlay.addEventListener('click', onOverlayClick);
        });
    }

    async createNewNode(title, parentNodeId) {
        if (!this.currentUser) {
            alert('ユーザーが接続されていません');
            return;
        }

        const parentNode = this.nodes.get(parentNodeId);
        if (!parentNode) {
            alert('親ノードが見つかりません');
            return;
        }

        // 親の階層レベルを取得して+1
        const parentHierarchyLevel = parentNode.data.hierarchyLevel || 0;
        const newHierarchyLevel = parentHierarchyLevel + 1;
        
        const newNodeData = {
            title: title,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: this.currentUser,
            messageCount: 1,
            parentId: parentNodeId,
            hierarchyLevel: newHierarchyLevel,
            isRoot: false
        };
        
        try {
            const db = getDB();
            console.log('Creating new node with data:', newNodeData);
            const docRef = await db.collection('nodes').add(newNodeData);
            const newNodeId = docRef.id;
            
            // 新しいnodeに初期メッセージを追加
            await db.collection('messages').add({
                content: `新しい話題「${title}」を作成しました`,
                username: this.currentUser,
                displayName: this.currentDisplayName,
                nodeId: newNodeId,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log('New node created with ID:', newNodeId);
            
            // 作成したノードを選択してチャットを開く
            setTimeout(() => {
                this.selectedNodeId = newNodeId;
                this.elements.nodeSelector.value = newNodeId;
                this.openChat(newNodeId, title);
                this.refreshListDisplay();
            }, 1000);
            
        } catch (error) {
            console.error('Error creating node:', error);
            alert('ノード作成に失敗しました');
        }
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
                console.log('Root node already exists, skipping creation');
                return;
            }
            
            // ルートノードが存在しない場合は作成
            console.log('No root node found, creating new one...');
            
            const rootNodeData = {
                title: 'メインチャット',
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

            // デフォルトの表示ノードを設定（初期ロード時）
            if (!this.selectedNodeId) {
                let rootNodeId = null;
                allNodes.forEach((nodeData, nodeId) => {
                    if (nodeData.isRoot) {
                        rootNodeId = nodeId;
                    }
                });
                this.selectedNodeId = rootNodeId;
            }
            
            // ノードデータを保持（分岐機能のため）
            this.nodes.clear();
            allNodes.forEach((nodeData, nodeId) => {
                this.nodes.set(nodeId, { data: nodeData, element: null });
            });
            
            // 表示をクリア
            this.elements.mindmapCanvas.innerHTML = '';
            
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
                        // メッセージデータにIDを追加
                        messageData.id = messageId;
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
    
    
    
    
    
    
    async openChat(nodeId, title) {
        this.currentNodeId = nodeId;
        this.elements.chatTopic.textContent = title;
        this.elements.chatPanel.classList.remove('hidden');
        
        // リネームボタンの表示制御（メインチャット以外のみ表示）
        const nodeData = this.nodes.get(nodeId);
        const isRootNode = nodeData && nodeData.data && nodeData.data.isRoot;
        this.elements.renameChatBtn.style.display = isRootNode ? 'none' : 'inline-block';
        
        document.querySelectorAll('.mindmap-node').forEach(node => {
            node.classList.remove('active');
        });
        
        const activeNode = this.nodes.get(nodeId);
        if (activeNode && activeNode.element) {
            activeNode.element.classList.add('active');
        }
        
        // チャット表示時に既読マーク
        this.markAsRead(nodeId);
        
        // ローカルキャッシュからメッセージを表示
        this.loadMessagesFromCache(nodeId);
    }
    
    loadMessagesFromCache(nodeId) {
        console.log(`Loading messages from cache for node: ${nodeId}`);
        
        // チャットメッセージをクリア
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
        
        // 表示名を分割（username#IDの形式）
        const parts = displayName.split('#');
        const username = parts[0];
        const userId = parts.length > 1 ? parts[1] : '';
        
        const usernameHtml = userId ? 
            `${username}<span class="user-id">#${userId}</span>` : 
            username;
        
        // メッセージ全体のコンテナを作成
        const messageContainer = document.createElement('div');
        messageContainer.className = `message-container ${isOwnMessage ? 'own' : ''}`;
        
        // メッセージ内のURLをリンクに変換
        const linkedContent = this.linkifyUrls(messageData.content);
        
        messageElement.innerHTML = `
            <div class="username">${usernameHtml}</div>
            <div class="content">${linkedContent}</div>
        `;
        
        // 時刻表示を外側に配置
        const timestampElement = document.createElement('div');
        timestampElement.className = 'message-timestamp';
        timestampElement.textContent = timestamp;
        
        // シンプルな表示：メッセージと時刻のみ
        messageContainer.appendChild(messageElement);
        messageContainer.appendChild(timestampElement);
        
        this.elements.chatMessages.appendChild(messageContainer);
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    linkifyUrls(text) {
        // まずHTMLエスケープ
        const escapedText = this.escapeHtml(text);
        
        // URL正規表現（http/https、www付き、一般的なドメインをサポート）
        const urlRegex = /(https?:\/\/[^\s<>&"']+|www\.[^\s<>&"']+|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}[^\s<>&"']*)/g;
        
        return escapedText.replace(urlRegex, (url) => {
            let href = url;
            
            // プロトコルがない場合はhttpsを追加
            if (!url.match(/^https?:\/\//)) {
                href = 'https://' + url;
            }
            
            // URLもエスケープして安全にする
            const safeHref = this.escapeHtml(href);
            const safeUrl = this.escapeHtml(url);
            
            return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="message-link">${safeUrl}</a>`;
        });
    }

    updateCharCounter() {
        const currentLength = this.elements.messageInput.value.length;
        this.elements.charCounter.textContent = `${currentLength}/100`;
        
        if (currentLength > 100) {
            this.elements.charCounter.classList.add('over-limit');
        } else {
            this.elements.charCounter.classList.remove('over-limit');
        }
    }




    
    async sendMessage() {
        const content = this.elements.messageInput.value.trim();
        if (!content || !this.currentUser) return;
        
        // 文字数制限チェック（日本語で100文字まで）
        if (content.length > 100) {
            alert(`メッセージは100文字以内で入力してください。現在：${content.length}文字`);
            return;
        }
        
        // メッセージ送信
        if (!this.currentNodeId) return;
        
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
        if (nodeData && nodeData.element) {
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
        } else if (nodeData) {
            // 要素がない場合はメッセージカウントのみ更新
            const nodeMessages = this.messages.get(nodeId);
            const totalCount = nodeMessages ? nodeMessages.size : 0;
            nodeData.data.messageCount = totalCount;
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
        console.log('createBranch called');
        console.log('currentUser:', this.currentUser);
        console.log('currentNodeId:', this.currentNodeId);
        
        if (!this.currentUser || !this.currentNodeId) {
            console.log('createBranch: Missing currentUser or currentNodeId, returning');
            return;
        }
        
        const branchTitle = prompt('新しい話題のタイトルを入力してください:');
        console.log('branchTitle:', branchTitle);
        if (!branchTitle) {
            console.log('createBranch: No branch title provided, returning');
            return;
        }
        
        const parentNode = this.nodes.get(this.currentNodeId);
        console.log('parentNode:', parentNode);
        if (!parentNode) {
            console.log('createBranch: Parent node not found, returning');
            return;
        }
        
        // 親の階層レベルを取得して+1
        const parentHierarchyLevel = parentNode.data.hierarchyLevel || 0;
        const newHierarchyLevel = parentHierarchyLevel + 1;
        
        const db = getDB();
        
        try {
            const branchData = {
                title: branchTitle,
                parentId: this.currentNodeId,
                hierarchyLevel: newHierarchyLevel,
                isRoot: false,
                createdAt: new Date(),
                lastActivity: new Date()
            };
            
            console.log(`Creating branch: "${branchTitle}" at hierarchy level ${newHierarchyLevel} (parent level: ${parentHierarchyLevel})`);
            console.log('Branch data:', branchData);
            
            console.log('Adding new node to database...');
            const docRef = await db.collection('nodes').add(branchData);
            console.log('Branch created with ID:', docRef.id);
            
            console.log('Adding initial message to new branch node...');
            await db.collection('messages').add({
                nodeId: docRef.id,
                username: this.currentUser,
                displayName: this.currentDisplayName,
                content: `🌿 「${parentNode.data.title}」から新しい話題として分岐しました`,
                createdAt: new Date(),
                isBranchMessage: true
            });
            console.log('Initial branch message added successfully');
            
        } catch (error) {
            console.error('Error creating branch:', error);
        }
    }
    
    async renameChat() {
        if (!this.currentNodeId) return;
        
        const nodeData = this.nodes.get(this.currentNodeId);
        if (!nodeData) return;
        
        // メインチャットは変更不可
        if (nodeData.data.isRoot) {
            alert('メインチャットの名前は変更できません。');
            return;
        }
        
        const currentTitle = nodeData.data.title;
        const newTitle = prompt('新しいチャット名を入力してください:', currentTitle);
        
        if (!newTitle || newTitle.trim() === '' || newTitle === currentTitle) return;
        
        const trimmedTitle = newTitle.trim();
        
        try {
            const db = getDB();
            console.log(`Renaming node ${this.currentNodeId} from "${currentTitle}" to "${trimmedTitle}"`);
            
            await db.collection('nodes').doc(this.currentNodeId).update({
                title: trimmedTitle,
                lastActivity: new Date()
            });
            
            console.log('Node renamed successfully');
            
            // UI即座に更新
            this.elements.chatTopic.textContent = trimmedTitle;
            
        } catch (error) {
            console.error('Error renaming chat:', error);
            alert('チャット名の変更に失敗しました。');
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
        filteredMessages.sort((a, b) => b.createdAt - a.createdAt);
        
        const selectedNodeData = allNodes.get(this.selectedNodeId);
        const selectedNodeTitle = selectedNodeData ? selectedNodeData.title : 'Unknown';
        
        console.log(`Creating list display for "${selectedNodeTitle}" with ${filteredMessages.length} messages from ${descendantNodeIds.length} descendant nodes`);
        
        if (filteredMessages.length === 0) {
            this.elements.mindmapCanvas.innerHTML = `<div style="text-align: center; padding: 50px; color: #6c757d; font-size: 1.1rem;">"${selectedNodeTitle}"とその配下にはメッセージがありません</div>`;
            return;
        }
        
        // ヘッダー表示は削除（ノード選択で確認できるため不要）
        
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
        
        // 表示名を分割（username#IDの形式）
        const parts = displayName.split('#');
        const username = parts[0];
        const userId = parts.length > 1 ? parts[1] : '';
        
        const usernameHtml = userId ? 
            `${username}<span class="user-id">#${userId}</span>` : 
            username;
        
        messageElement.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <div style="display: flex; flex-direction: column;">
                    <strong style="color: #495057; font-size: 0.9rem;">${usernameHtml}</strong>
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

        // デフォルトの選択肢（空白）を追加
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '---';
        placeholder.selected = true;
        this.elements.nodeSelector.appendChild(placeholder);
        
        // 新規node作成オプションを追加
        const createOption = document.createElement('option');
        createOption.value = 'CREATE_NEW';
        createOption.textContent = '＋ 新しい話題を作成';
        createOption.style.fontWeight = 'bold';
        createOption.style.color = '#28a745';
        this.elements.nodeSelector.appendChild(createOption);
        
        // 階層構造順でソートしてオプションを追加（階層0と1のみ）
        const hierarchicalNodes = this.buildHierarchicalNodeList(allNodes);
        
        hierarchicalNodes.forEach(({ nodeId, nodeData, depth }) => {
            // 階層0と1のみ表示
            if (depth <= 1) {
                const option = document.createElement('option');
                option.value = nodeId;
                const indent = '　'.repeat(depth);
                option.textContent = `${indent}${nodeData.title}`;
                this.elements.nodeSelector.appendChild(option);
            }
        });
    }
    
    buildHierarchicalNodeList(allNodes) {
        const result = [];
        const visited = new Set();
        
        // ルートノードから開始
        const rootNodes = Array.from(allNodes.entries()).filter(([_, nodeData]) => nodeData.isRoot);
        
        const addNodeAndChildren = (nodeId, nodeData, depth = 0) => {
            if (visited.has(nodeId)) return;
            visited.add(nodeId);
            
            result.push({ nodeId, nodeData, depth });
            
            // 子ノードを最終活動日時順でソートして追加（最近活動があったものが上）
            const children = Array.from(allNodes.entries())
                .filter(([_, childData]) => childData.parentId === nodeId)
                .sort((a, b) => {
                    const timeA = a[1].lastActivity?.toDate?.() || new Date(a[1].lastActivity || a[1].createdAt?.toDate?.() || a[1].createdAt);
                    const timeB = b[1].lastActivity?.toDate?.() || new Date(b[1].lastActivity || b[1].createdAt?.toDate?.() || b[1].createdAt);
                    return timeB - timeA; // 降順（最近活動があったものが上）
                });
            
            children.forEach(([childId, childData]) => {
                addNodeAndChildren(childId, childData, depth + 1);
            });
        };
        
        // ルートノードから階層構造を構築
        rootNodes.forEach(([nodeId, nodeData]) => {
            addNodeAndChildren(nodeId, nodeData, 0);
        });
        
        return result;
    }
    
    getDescendantNodes(parentId, allNodes) {
        const descendants = [parentId]; // 選択されたノード自体を含む
        
        // 直接の子ノードのみを追加
        Array.from(allNodes.entries()).forEach(([nodeId, nodeData]) => {
            if (nodeData.parentId === parentId) {
                descendants.push(nodeId);
            }
        });
        
        return descendants;
    }
    
    refreshListDisplay() {
        // 既存の表示をクリア
        this.elements.mindmapCanvas.innerHTML = '';
        
        // ノード情報を再取得して表示を更新
        const db = getDB();
        db.collection('nodes').get().then((snapshot) => {
            const allNodes = new Map();
            snapshot.forEach((doc) => {
                const nodeData = doc.data();
                const nodeId = doc.id;
                allNodes.set(nodeId, nodeData);
            });
            
            // ノードデータを保持（分岐機能のため）
            this.nodes.clear();
            allNodes.forEach((nodeData, nodeId) => {
                this.nodes.set(nodeId, { data: nodeData, element: null });
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
            
            // メインチャットの再作成
            console.log('Creating new root node...');
            const rootNodeData = {
                title: 'メインチャット',
                isRoot: true,
                parentId: null,
                hierarchyLevel: 0,
                createdAt: new Date(),
                lastActivity: new Date()
            };
            
            const rootDocRef = await db.collection('nodes').add(rootNodeData);
            console.log('Root node created with ID:', rootDocRef.id);
            
            // 初期メッセージをメインチャットに追加
            console.log('Adding initial message to main chat...');
            await db.collection('messages').add({
                nodeId: rootDocRef.id,
                username: 'システム',
                displayName: 'システム',
                content: '🚀 StreemChatへようこそ！チャットを始めましょう。',
                createdAt: new Date(),
                isSystemMessage: true
            });
            
            alert(`全てのデータを削除しました\nメッセージ: ${messagesDeleted}件\nノード: ${nodesDeleted}件\n\n新しいメインチャットを作成しました。`);
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