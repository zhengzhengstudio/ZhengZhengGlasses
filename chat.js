const CHAT_API_BASE = (localStorage.getItem('zz_glasses_api_base') || 'https://zhengzhengstudio.cn').replace(/\/$/, '');
const CHAT_API = `${CHAT_API_BASE}/api/glasses`;

let chatUser = null;
let chatState = {};
let chatWishlist = [];
let chatConversations = [];
let chatMerchants = [];
let chatPrescription = {};
let activeMerchant = null;
let activeConversation = null;
let activeMessages = [];
let remoteChatAvailable = false;
let merchantSearchTimer = null;
let activeChatFilter = 'all';
const CHAT_TEMP_USER_KEY = 'zz_glasses_chat_temp_user';
const PRESCRIPTION_FIELDS = [
    ['od-sphere', '右眼球镜'],
    ['od-cylinder', '右眼散光'],
    ['od-axis', '右眼轴位'],
    ['os-sphere', '左眼球镜'],
    ['os-cylinder', '左眼散光'],
    ['os-axis', '左眼轴位'],
    ['rx-pd', '瞳距'],
    ['rx-height', '瞳高'],
    ['rx-lens-type', '镜片方案'],
    ['rx-note', '备注']
];

function safeParse(value, fallback = null) {
    try {
        return JSON.parse(value || 'null') || fallback;
    } catch (error) {
        return fallback;
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, s => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[s]));
}

function jsArg(value) {
    return JSON.stringify(String(value ?? '')).replace(/</g, '\\u003c');
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function readChatUser() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('user');
    if (raw) {
        try {
            const user = JSON.parse(decodeURIComponent(raw));
            if (user?.uid) {
                if (user.temporary) {
                    sessionStorage.setItem('zz_glasses_temp_user', JSON.stringify(user));
                } else {
                    localStorage.setItem('zz_passport_user', JSON.stringify(user));
                }
                return user;
            }
        } catch (error) {}
    }
    const temp = safeParse(sessionStorage.getItem('zz_glasses_temp_user'), null);
    if (temp?.temporary && temp?.uid) return temp;
    const passportUser = safeParse(localStorage.getItem('zz_passport_user'), null);
    if (passportUser?.uid) return passportUser;
    const chatTemp = safeParse(sessionStorage.getItem(CHAT_TEMP_USER_KEY), null);
    if (chatTemp?.uid) return chatTemp;
    const created = {
        uid: `temp_glasses_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        username: '临时配镜用户',
        temporary: true,
        createdAt: new Date().toISOString()
    };
    sessionStorage.setItem(CHAT_TEMP_USER_KEY, JSON.stringify(created));
    return created;
}

function getUserId() {
    return chatUser?.uid || 'anonymous';
}

function getUserName() {
    return chatUser?.nickname || chatUser?.username || '匿名用户';
}

function readState() {
    const uid = getUserId();
    const scoped = localStorage.getItem(`zz_glasses_home_state_${uid}`);
    return safeParse(scoped || localStorage.getItem('zz_glasses_home_state'), {});
}

function readWishlist() {
    const value = safeParse(
        localStorage.getItem(`zz_glasses_wishlist_${getUserId()}`)
            || localStorage.getItem('zz_glasses_wishlist_anonymous'),
        []
    );
    return Array.isArray(value) ? value : [];
}

function getPrescriptionKey(uid = getUserId()) {
    return `zz_glasses_prescription_${uid || 'anonymous'}`;
}

function readPrescription() {
    return safeParse(
        localStorage.getItem(getPrescriptionKey())
            || localStorage.getItem('zz_glasses_prescription_anonymous'),
        {}
    );
}

function hasPrescriptionData(data = chatPrescription) {
    return Object.entries(data || {}).some(([key, value]) => key !== 'updatedAt' && Boolean(value));
}

function normalizePrescription(data = {}) {
    const normalized = {};
    PRESCRIPTION_FIELDS.forEach(([id]) => {
        normalized[id] = data[id] || data[`chat-${id}`] || '';
    });
    normalized.updatedAt = data.updatedAt || new Date().toISOString();
    return normalized;
}

function collectChatPrescription() {
    const data = {};
    PRESCRIPTION_FIELDS.forEach(([id]) => {
        data[id] = document.getElementById(`chat-${id}`)?.value?.trim() || '';
    });
    data.updatedAt = new Date().toISOString();
    return data;
}

function buildPrescriptionSummary(data = chatPrescription) {
    const normalized = normalizePrescription(data);
    const right = [normalized['od-sphere'], normalized['od-cylinder'], normalized['od-axis'] ? `轴 ${normalized['od-axis']}` : ''].filter(Boolean).join(' / ');
    const left = [normalized['os-sphere'], normalized['os-cylinder'], normalized['os-axis'] ? `轴 ${normalized['os-axis']}` : ''].filter(Boolean).join(' / ');
    const meta = [
        normalized['rx-pd'] ? `瞳距 ${normalized['rx-pd']} mm` : '',
        normalized['rx-height'] ? `瞳高 ${normalized['rx-height']} mm` : '',
        normalized['rx-lens-type'] ? `镜片 ${normalized['rx-lens-type']}` : ''
    ].filter(Boolean).join('，');
    return [
        right ? `右眼 ${right}` : '',
        left ? `左眼 ${left}` : '',
        meta,
        normalized['rx-note'] || ''
    ].filter(Boolean).join('；') || '还没有填写验光数据。';
}

function applyChatPrescription() {
    chatPrescription = normalizePrescription(readPrescription());
    PRESCRIPTION_FIELDS.forEach(([id]) => {
        const input = document.getElementById(`chat-${id}`);
        if (input) input.value = chatPrescription[id] || '';
    });
    renderPrescriptionPanel();
}

function saveChatPrescription(show = true) {
    chatPrescription = collectChatPrescription();
    localStorage.setItem(getPrescriptionKey(), JSON.stringify(chatPrescription));
    renderPrescriptionPanel();
    if (show) {
        syncPrescriptionDraft();
        setSyncState(hasPrescriptionData(chatPrescription) ? '验光单已保存' : '验光单草稿为空', remoteChatAvailable);
    }
    return chatPrescription;
}

async function syncPrescriptionDraft() {
    try {
        await apiJson('/session/save', {
            method: 'POST',
            body: JSON.stringify({
                uid: getUserId(),
                type: 'prescription',
                payload: chatPrescription,
                createdAt: new Date().toISOString()
            })
        });
        remoteChatAvailable = true;
        setSyncState('验光单已同步', true);
    } catch (error) {
        setSyncState('本地缓存', false);
    }
}

function renderPrescriptionPanel() {
    const summary = document.getElementById('chat-prescription-summary');
    if (summary) summary.textContent = hasPrescriptionData(chatPrescription) ? buildPrescriptionSummary(chatPrescription) : '还没有填写验光数据。';
}

function currentFrame() {
    return chatState.selectedFrame || chatWishlist[0]?.frame || {};
}

function localConversationKey(merchantId = activeMerchant?.id || currentFrame().merchantId || 'chatgpt') {
    return `zz_glasses_chat_${merchantId}_${getUserId()}`;
}

function readLocalMessages(merchantId) {
    const value = safeParse(localStorage.getItem(localConversationKey(merchantId)), []);
    return Array.isArray(value) ? value : [];
}

function writeLocalMessages(messages, merchantId) {
    localStorage.setItem(localConversationKey(merchantId), JSON.stringify(messages.slice(-180)));
}

async function apiJson(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    let response;
    try {
        response = await fetch(`${CHAT_API}${path}`, {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
    } finally {
        clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data && data.success === false) throw new Error(data.error || 'request failed');
    return data;
}

function setSyncState(text, remote = remoteChatAvailable) {
    const el = document.getElementById('chat-sync-state');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('online', remote);
}

function setChatFilter(button, filter) {
    activeChatFilter = filter;
    document.querySelectorAll('.chat-filter-tabs button').forEach(item => item.classList.toggle('active', item === button));
    renderConversationList();
}

function startNewConversation() {
    activeConversation = null;
    activeMerchant = chatMerchants.find(item => item.id === 'chatgpt') || buildFallbackMerchants()[0] || null;
    activeMessages = defaultConversationMessages(activeMerchant);
    writeLocalMessages(activeMessages, activeMerchant?.id);
    renderChat();
}

async function loadRemoteConversations() {
    if (!chatUser?.uid) {
        chatConversations = [];
        remoteChatAvailable = false;
        return;
    }
    try {
        const data = await apiJson(`/chat/conversations/${encodeURIComponent(chatUser.uid)}`);
        chatConversations = Array.isArray(data.conversations) ? data.conversations : [];
        remoteChatAvailable = true;
        setSyncState('服务器已同步', true);
    } catch (error) {
        remoteChatAvailable = false;
        setSyncState('本地缓存', false);
    }
}

async function loadRemoteMessages() {
    if (!activeConversation?.id || !remoteChatAvailable) return;
    try {
        const data = await apiJson(`/chat/messages/${encodeURIComponent(activeConversation.id)}`);
        activeConversation = data.conversation || activeConversation;
        activeMessages = Array.isArray(data.messages) ? data.messages : activeMessages;
        renderThread(false);
        renderConversationList();
    } catch (error) {
        remoteChatAvailable = false;
        setSyncState('本地缓存', false);
    }
}

function buildFallbackMerchants() {
    const frame = currentFrame();
    const grouped = new Map();
    grouped.set('chatgpt', {
        id: 'chatgpt',
        storeName: 'Kimi 配镜顾问',
        merchantName: 'Kimi 配镜顾问',
        frameCount: 80,
        sampleFrames: [],
        score: 88,
        reason: '先整理参数、定制需求、验光单清单和给商家的沟通话术'
    });
    grouped.set('zhengzheng', {
        id: 'zhengzheng',
        storeName: '铮铮本人',
        merchantName: '铮铮本人',
        frameCount: 0,
        sampleFrames: [],
        score: 86,
        reason: '反馈试戴歪斜、镜框上传、定制流程和产品问题'
    });
    if (frame.merchantId) {
        grouped.set(frame.merchantId, {
            id: frame.merchantId,
            storeName: frame.merchantName || '当前镜框商家',
            merchantName: frame.merchantName || '当前镜框商家',
            frameCount: 1,
            sampleFrames: [frame],
            score: 96,
            reason: '与你当前选择的镜框匹配'
        });
    }
    for (const item of chatWishlist) {
        const wishFrame = item.frame || {};
        const id = wishFrame.merchantId || 'chatgpt';
        const merchant = grouped.get(id) || {
            id,
            storeName: wishFrame.merchantName || '镜框商家',
            merchantName: wishFrame.merchantName || '镜框商家',
            frameCount: 0,
            sampleFrames: [],
            score: 82,
            reason: '来自你的心愿单'
        };
        merchant.frameCount += 1;
        merchant.sampleFrames.push(wishFrame);
        grouped.set(id, merchant);
    }
    return Array.from(grouped.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
}

async function loadMerchantCandidates() {
    const frame = currentFrame();
    const q = document.getElementById('merchant-search')?.value.trim() || '';
    const params = new URLSearchParams({
        uid: getUserId(),
        q,
        frameId: frame.id || '',
        type: frame.type || '',
        merchantId: frame.merchantId || ''
    });
    try {
        const data = await apiJson(`/chat/merchants?${params.toString()}`);
        chatMerchants = Array.isArray(data.merchants) && data.merchants.length ? data.merchants : buildFallbackMerchants();
        remoteChatAvailable = true;
        setSyncState('服务器已同步', true);
    } catch (error) {
        chatMerchants = buildFallbackMerchants();
        remoteChatAvailable = false;
        setSyncState('本地缓存', false);
    }
    if (!activeMerchant) {
        const preferredId = frame.merchantId || 'chatgpt';
        activeMerchant = chatMerchants.find(item => item.id === preferredId) || chatMerchants[0] || null;
        loadConversationForMerchant(activeMerchant, false);
    }
    renderMerchantResults();
}

function handleMerchantSearch() {
    clearTimeout(merchantSearchTimer);
    merchantSearchTimer = setTimeout(loadMerchantCandidates, 220);
}

function renderMerchantResults() {
    const box = document.getElementById('chat-merchant-results');
    if (!box) return;
    if (!chatMerchants.length) {
        box.innerHTML = '<p class="text-dim">暂无匹配商家，可以先和 Kimi 配镜顾问沟通。</p>';
        return;
    }
    box.innerHTML = chatMerchants.map(merchant => {
        const isActive = activeMerchant?.id === merchant.id;
        const sample = merchant.sampleFrames?.find(frame => frame?.image);
        return `
            <button class="chat-merchant-card ${isActive ? 'active' : ''}" type="button" onclick="loadConversationForMerchantById(${jsArg(merchant.id)})">
                ${sample?.image ? `<img src="${escapeHtml(sample.image)}" alt="">` : `<span class="chat-avatar">${escapeHtml((merchant.storeName || '商').slice(0, 1))}</span>`}
                <span>
                    <strong>${escapeHtml(merchant.storeName || merchant.merchantName || '商家')}</strong>
                    <small>${escapeHtml(merchant.reason || '可咨询镜框适配')} · ${escapeHtml(merchant.frameCount || 0)} 款</small>
                </span>
                <em>${Math.round(merchant.score || 80)}%</em>
            </button>
        `;
    }).join('');
}

function renderConversationList() {
    const list = document.getElementById('chat-conversation-list');
    if (!list) return;
    const remoteItems = chatConversations.map(item => ({
        id: item.id,
        merchantId: item.merchantId,
        title: item.merchantName || '商家',
        subtitle: item.messages?.[0]?.text || item.frame?.name || '暂无新消息',
        time: item.updatedAt || item.createdAt || 0
    }));
    const fallback = chatMerchants.slice(0, 4).map(merchant => ({
        id: '',
        merchantId: merchant.id,
        title: merchant.storeName || merchant.merchantName,
        subtitle: merchant.reason || '点击开始咨询',
        time: 0
    }));
    let items = remoteItems.length ? remoteItems : fallback;
    if (activeChatFilter === 'merchant') {
        items = items.filter(item => item.merchantId && item.merchantId !== 'chatgpt');
    }
    if (activeChatFilter === 'wishlist') {
        const ids = new Set(chatWishlist.map(item => item.frame?.merchantId || 'chatgpt'));
        items = items.filter(item => ids.has(item.merchantId));
    }
    if (!items.length) {
        list.innerHTML = '<div class="chat-empty-mini">这个筛选下还没有会话。</div>';
        return;
    }
    list.innerHTML = items.map(item => `
        <button class="chat-contact ${activeMerchant?.id === item.merchantId ? 'active' : ''}" type="button" onclick="loadConversationForMerchantById(${jsArg(item.merchantId)}, ${jsArg(item.id || '')})">
            <span class="chat-avatar">${escapeHtml((item.title || '商').slice(0, 1))}</span>
            <span>
                <strong>${escapeHtml(item.title || '商家')}</strong>
                <small>${escapeHtml(item.subtitle || '点击开始咨询')}</small>
            </span>
        </button>
    `).join('');
}

function loadConversationForMerchantById(merchantId, conversationId = '') {
    const merchant = chatMerchants.find(item => item.id === merchantId)
        || chatConversations.find(item => item.merchantId === merchantId)
        || buildFallbackMerchants().find(item => item.id === merchantId);
    loadConversationForMerchant(merchant || { id: merchantId, storeName: '商家' }, true, conversationId);
}

async function loadConversationForMerchant(merchant, shouldRender = true, conversationId = '') {
    activeMerchant = merchant;
    activeConversation = chatConversations.find(item => item.id === conversationId)
        || chatConversations.find(item => item.merchantId === merchant?.id)
        || null;
    if (activeConversation?.id && remoteChatAvailable) {
        try {
            const data = await apiJson(`/chat/messages/${encodeURIComponent(activeConversation.id)}`);
            activeConversation = data.conversation || activeConversation;
            activeMessages = Array.isArray(data.messages) ? data.messages : [];
        } catch (error) {
            activeMessages = readLocalMessages(merchant?.id);
        }
    } else {
        activeMessages = readLocalMessages(merchant?.id);
    }
    if (!activeMessages.length) {
        activeMessages = defaultConversationMessages(merchant);
        writeLocalMessages(activeMessages, merchant?.id);
    }
    if (shouldRender) {
        renderChat();
    }
}

function defaultConversationMessages(merchant = activeMerchant) {
    const frame = currentFrame();
    const merchantName = merchant?.storeName || merchant?.merchantName || frame.merchantName || 'Kimi 配镜顾问';
    const intro = frame.name
        ? `你正在咨询「${frame.name}」相关问题。系统会把脸型、瞳距、建议镜圈宽度和心愿单一起带给商家。`
        : '还没有选择具体镜框，可以先把配镜数据发给商家，让对方推荐合适款式。';
    return [
        { role: 'system', text: intro, createdAt: new Date().toISOString() },
        { role: 'merchant', text: `${merchantName}：你好，可以直接问鼻托、夹头、镜圈宽度、镜腿长度、镜片厚度、验光单补项或 3D 打印定制。我会先帮你整理成商家看得懂的需求。`, createdAt: new Date().toISOString() }
    ];
}

async function appendMessage(role, text, payload = null) {
    const mergedPayload = {
        ...(payload || {}),
        prescription: hasPrescriptionData(chatPrescription) ? chatPrescription : (payload?.prescription || null)
    };
    const message = {
        role,
        text,
        payload: mergedPayload,
        createdAt: new Date().toISOString()
    };
    activeMessages.push(message);
    writeLocalMessages(activeMessages, activeMerchant?.id);
    renderThread();

    if (getUserId()) {
        try {
            const data = await apiJson('/chat/message', {
                method: 'POST',
                body: JSON.stringify({
                    conversationId: activeConversation?.id || '',
                    uid: getUserId(),
                    role: role === 'user' ? 'customer' : role,
                    text,
                    merchantId: activeMerchant?.id || currentFrame().merchantId || 'chatgpt',
                    merchantName: activeMerchant?.storeName || activeMerchant?.merchantName || currentFrame().merchantName || 'Kimi 配镜顾问',
                    customerName: getUserName(),
                    frame: currentFrame(),
                    analysis: chatState.analysis || {},
                    payload: mergedPayload
                })
            });
            activeConversation = data.conversation || activeConversation;
            activeMessages = Array.isArray(data.messages) ? data.messages : activeMessages;
            remoteChatAvailable = true;
            setSyncState('服务器已同步', true);
            await loadRemoteConversations();
            renderConversationList();
            renderThread(false);
            renderInfoPanel();
        } catch (error) {
            remoteChatAvailable = false;
            setSyncState('本地缓存', false);
        }
    }
}

function renderThread(scroll = true) {
    const thread = document.getElementById('chat-thread');
    if (!thread) return;
    thread.innerHTML = activeMessages.map(message => {
        const role = message.role === 'customer' ? 'user' : message.role;
        const cls = role === 'user' ? 'user' : role === 'system' ? 'system' : 'merchant';
        const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
        return `
            <div class="chat-message-row ${cls}">
                <div class="chat-bubble ${cls}">
                    <span>${escapeHtml(message.text)}</span>
                    ${time ? `<small>${escapeHtml(time)}</small>` : ''}
                </div>
            </div>
        `;
    }).join('');
    if (scroll) thread.scrollTop = thread.scrollHeight;
}

function renderInfoPanel() {
    const analysis = chatState.analysis || {};
    const frame = currentFrame();
    const merchantName = activeMerchant?.storeName || activeMerchant?.merchantName || frame.merchantName || '未选择';
    setText('chat-user-name', getUserName());
    setText('chat-merchant-name', merchantName);
    setText('chat-face-shape', analysis.faceShape || '-');
    setText('chat-pd', analysis.pd ? `${analysis.pd} mm` : '-');
    setText('chat-lens-width', analysis.recommendedLensWidth ? `${analysis.recommendedLensWidth} mm` : '-');
    setText('chat-frame-name', frame.name || '未选择');
    setText('chat-product-user', getUserName());
    setText('chat-product-data', analysis.pd || analysis.recommendedLensWidth ? '已有采集' : '未采集');
    setText('chat-product-wishlist', `${chatWishlist.length} 款`);
    setText('chat-product-stage', activeConversation?.id ? '沟通中' : activeMerchant ? '已选商家' : '待选择商家');
    document.getElementById('chat-user-section').innerHTML = `<span>${escapeHtml(getUserName())}</span>`;
    setText('chat-conversation-title', merchantName);
    setText('chat-conversation-subtitle', frame.name ? `当前镜框：${frame.name}` : '可以搜索商家，或先让商家根据数据推荐镜框');
    const meta = document.getElementById('chat-header-meta');
    if (meta) {
        meta.innerHTML = [
            remoteChatAvailable ? '服务器同步' : '本地缓存',
            frame.name ? '已选镜框' : '未选镜框',
            analysis.pd ? `瞳距 ${escapeHtml(analysis.pd)} mm` : '待补瞳距'
        ].map(item => `<span>${item}</span>`).join('');
    }
    renderPrescriptionPanel();

    const card = document.getElementById('chat-frame-card');
    if (!card) return;
    if (!frame.name) {
        card.innerHTML = '<p class="text-dim">还没有选择镜框。回到试戴页加入心愿单后，这里会显示图片和尺寸。</p>';
        renderChecklist();
        return;
    }
    card.innerHTML = `
        ${frame.image ? `<img src="${escapeHtml(frame.image)}" alt="${escapeHtml(frame.name)}">` : ''}
        <strong>${escapeHtml(frame.name)}</strong>
        <span>${escapeHtml(frame.merchantName || 'CHATGPT')} · 镜圈 ${escapeHtml(frame.lensWidth || '-')} mm / 鼻梁 ${escapeHtml(frame.bridgeSize || '-')} mm</span>
        <button class="btn btn-secondary" type="button" onclick="sendWishlistPackage()">把心愿单发给商家</button>
    `;
    renderChecklist();
}

function renderChecklist() {
    const box = document.getElementById('chat-checklist');
    if (!box) return;
    const analysis = chatState.analysis || {};
    const frame = currentFrame();
    const hasReport = Boolean(analysis.pd || analysis.recommendedLensWidth || analysis.faceShape);
    const hasFrame = Boolean(frame.name);
    const hasWishlist = chatWishlist.length > 0;
    const hasMerchant = Boolean(activeMerchant?.id);
    const hasPrescription = hasPrescriptionData(chatPrescription)
        || activeMessages.some(message => /验光|球镜|散光|轴位|折射率|瞳高/.test(message.text || ''));
    const items = [
        ['选择商家', hasMerchant],
        ['发送采集数据', hasReport],
        ['确认镜框或心愿单', hasFrame || hasWishlist],
        ['补充验光单内容', hasPrescription],
        ['确认定制或下单方式', activeMessages.some(message => /定制|下单|报价|材料/.test(message.text || ''))]
    ];
    box.innerHTML = items.map(([label, done]) => `
        <div class="${done ? 'done' : ''}">
            <span>${done ? '✓' : ''}</span>
            <strong>${escapeHtml(label)}</strong>
        </div>
    `).join('');
}

function renderChat() {
    renderInfoPanel();
    renderMerchantResults();
    renderConversationList();
    renderThread();
}

function sendChatMessage(event) {
    event.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    appendMessage('user', text);
}

function sendQuickQuestion(text) {
    appendMessage('user', text, { type: 'quick_question' });
}

function sendReportPackage() {
    const analysis = chatState.analysis || {};
    const frame = currentFrame();
    appendMessage('user', `最近采集数据：脸型 ${analysis.faceShape || '-'}，脸宽 ${analysis.faceWidth || '-'} mm，瞳距 ${analysis.pd || '-'} mm，建议镜圈 ${analysis.recommendedLensWidth || '-'} mm，鼻梁 ${analysis.recommendedBridgeWidth || '-'} mm，移心量 ${analysis.decentration ?? '-'} mm。当前镜框：${frame.name || '未选择'}。`, { type: 'report', analysis, frame, prescription: chatPrescription });
}

function sendCustomRequest() {
    appendMessage('user', '我想发起定制镜框沟通。请确认需要补充哪些验光数据，并判断镜圈宽度、鼻梁、鼻托和镜腿长度是否要定制。', {
        type: 'custom_request',
        wishlist: chatWishlist,
        analysis: chatState.analysis || {},
        prescription: chatPrescription
    });
}

function sendWishlistPackage() {
    if (!chatWishlist.length) {
        appendMessage('user', '我还没有加入心愿单。请先回到试戴页选择几副镜框，再统一发送。');
        return;
    }
    const summary = chatWishlist.map(item => {
        const frame = item.frame || {};
        return `${frame.name || '未命名镜框'}（${frame.merchantName || 'CHATGPT'}，镜圈 ${frame.lensWidth || '-'} mm，鼻梁 ${frame.bridgeSize || '-'} mm）`;
    }).join('；');
    appendMessage('user', `我的心愿单：${summary}。请结合我的最近采集数据判断哪些适合试戴或定制。`, {
        type: 'wishlist',
        wishlist: chatWishlist,
        prescription: chatPrescription,
        analysis: chatState.analysis || {}
    });
}

function sendPrescriptionChecklist() {
    appendMessage('user', '验光单待补充：左右眼球镜度数、左右眼散光度数、散光轴位、单眼/总瞳距、瞳高、镜片类型、折射率、是否需要防蓝光/变色/渐进镜片。', {
        type: 'prescription_checklist'
    });
}

function sendPrescriptionPackage() {
    saveChatPrescription(false);
    if (!hasPrescriptionData(chatPrescription)) {
        appendMessage('user', '我还没有拿到完整验光单。请先告诉我正式配镜前必须补哪些医院或门店数据。', {
            type: 'prescription_missing'
        });
        return;
    }
    appendMessage('user', `我的验光单：${buildPrescriptionSummary(chatPrescription)}。请结合当前镜框和采集数据判断镜片厚度、移心量、瞳高以及是否适合定制。`, {
        type: 'prescription',
        prescription: chatPrescription,
        analysis: chatState.analysis || {},
        frame: currentFrame()
    });
}

async function initChat() {
    chatUser = readChatUser();
    chatState = readState();
    chatWishlist = readWishlist();
    chatPrescription = normalizePrescription(readPrescription());
    chatMerchants = buildFallbackMerchants();
    activeMerchant = chatMerchants.find(item => item.id === (currentFrame().merchantId || 'chatgpt')) || chatMerchants[0] || null;
    await loadConversationForMerchant(activeMerchant, false);
    renderChat();
    await loadRemoteConversations();
    await loadMerchantCandidates();
    applyChatPrescription();
    renderChat();
    setInterval(loadRemoteMessages, 1200);
    setInterval(loadRemoteConversations, 4000);
}

initChat();

Object.assign(window, {
    startNewConversation,
    setChatFilter,
    handleMerchantSearch,
    loadMerchantCandidates,
    loadConversationForMerchantById,
    sendChatMessage,
    sendQuickQuestion,
    sendReportPackage,
    sendCustomRequest,
    sendWishlistPackage,
    sendPrescriptionChecklist,
    saveChatPrescription,
    sendPrescriptionPackage
});
