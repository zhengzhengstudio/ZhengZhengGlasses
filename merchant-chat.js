const MERCHANT_CHAT_API_BASE = (localStorage.getItem('zz_glasses_api_base') || 'https://zhengzhengstudio.cn').replace(/\/$/, '');
const MERCHANT_CHAT_API = `${MERCHANT_CHAT_API_BASE}/api/glasses`;
const MERCHANT_CHAT_AUTH_PARAMS = ['user', 'passport_user', 'account', 'passport_uid', 'uid', 'user_id', 'username', 'nickname', 'name', 'avatar'];

let merchantCurrentUser = null;
let merchantConversations = [];
let merchantOrders = [];
let activeConversation = null;
let activeMessages = [];
let activeOrder = null;
let remoteMerchantChatAvailable = false;
let merchantChatPollBusy = false;
let merchantThreadPollBusy = false;
let merchantRemoteMutedUntil = 0;
let merchantThreadTimer = null;
let merchantDataTimer = null;

function safeParse(value, fallback = null) {
    try {
        return JSON.parse(value || 'null') || fallback;
    } catch (error) {
        return fallback;
    }
}

function parseMaybeEncodedJson(raw) {
    if (!raw) return null;
    const attempts = [];
    let value = String(raw);
    for (let i = 0; i < 3; i += 1) {
        attempts.push(value);
        try {
            const decoded = decodeURIComponent(value);
            if (decoded === value) break;
            value = decoded;
        } catch (error) {
            break;
        }
    }
    for (const candidate of [...new Set(attempts)]) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (error) {}
    }
    return null;
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

function safeImageSrc(value) {
    const src = String(value || '').trim();
    if (!src) return '';
    if (/^data:image\/(png|jpe?g|webp);base64,/i.test(src)) return escapeHtml(src);
    try {
        const url = new URL(src, window.location.href);
        return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.href) : '';
    } catch (error) {
        return /^(assets\/|uploads\/|\.{0,2}\/)/i.test(src) ? escapeHtml(src) : '';
    }
}

function normalizeMerchantUser(user, fallback = {}) {
    const normalized = {
        ...user,
        uid: user?.uid || user?.id || fallback.uid || fallback.id || '',
        username: user?.username || user?.nickname || user?.name || fallback.username || fallback.nickname || fallback.name || '',
        nickname: user?.nickname || user?.username || user?.name || fallback.nickname || fallback.username || fallback.name || '',
        avatar: user?.avatar || fallback.avatar || '',
        source: user?.source || fallback.source || 'passport'
    };
    return normalized.uid ? normalized : null;
}

function readMerchantUser() {
    const params = new URLSearchParams(window.location.search);
    const jsonUser = parseMaybeEncodedJson(params.get('user'))
        || parseMaybeEncodedJson(params.get('passport_user'))
        || parseMaybeEncodedJson(params.get('account'));
    const paramUser = (jsonUser?.uid || jsonUser?.id)
        ? normalizeMerchantUser(jsonUser)
        : normalizeMerchantUser({}, {
            uid: params.get('passport_uid') || params.get('uid') || params.get('user_id') || '',
            username: params.get('username') || params.get('nickname') || params.get('name') || '',
            avatar: params.get('avatar') || ''
        });
    if (paramUser?.uid) {
        localStorage.setItem('zz_passport_user', JSON.stringify(paramUser));
        cleanupMerchantAuthParams();
        return paramUser;
    }
    return safeParse(localStorage.getItem('zz_passport_user'), null);
}

function cleanupMerchantAuthParams() {
    const url = new URL(window.location.href);
    const hadAuthParam = MERCHANT_CHAT_AUTH_PARAMS.some(param => url.searchParams.has(param));
    if (!hadAuthParam) return;
    MERCHANT_CHAT_AUTH_PARAMS.forEach(param => url.searchParams.delete(param));
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function buildPassportUrl(page) {
    const redirect = new URL(window.location.href);
    MERCHANT_CHAT_AUTH_PARAMS.forEach(param => redirect.searchParams.delete(param));
    const url = new URL(`https://zhengzhengstudio.cn/passport/${page}.html`);
    url.searchParams.set('redirect', redirect.href);
    url.searchParams.set('from', 'glasses');
    url.searchParams.set('scope', 'glasses');
    url.searchParams.set('returnUser', '1');
    return url.href;
}

function getMerchantId() {
    return merchantCurrentUser?.uid || '';
}

function getMerchantName() {
    return merchantCurrentUser?.nickname || merchantCurrentUser?.username || '商家用户';
}

async function apiJson(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response;
    try {
        response = await fetch(`${MERCHANT_CHAT_API}${path}`, {
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
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
        const error = new Error(data.error || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
    }
    return data;
}

function canUseRemoteMerchantChat() {
    return Date.now() >= merchantRemoteMutedUntil;
}

function markRemoteUnavailable(error, label = '本地缓存') {
    if (error?.status === 404 || error?.name === 'AbortError' || /Failed to fetch|NetworkError|abort/i.test(error?.message || '')) {
        merchantRemoteMutedUntil = Date.now() + 45000;
    }
    remoteMerchantChatAvailable = false;
    setMerchantSyncState(label, false);
}

function setMerchantSyncState(text, online = remoteMerchantChatAvailable) {
    const el = document.getElementById('merchant-chat-sync');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('online', online);
}

function readLocalArray(key) {
    const value = safeParse(localStorage.getItem(key), []);
    return Array.isArray(value) ? value : [];
}

function writeLocalMessages(conversationId, messages) {
    if (!conversationId) return;
    try {
        const compact = JSON.parse(JSON.stringify(messages.slice(-80), (key, value) => {
            if (typeof value === 'string' && value.startsWith('data:image/') && value.length > 160_000) {
                return '';
            }
            return value;
        }));
        localStorage.setItem(`zz_glasses_merchant_chat_${conversationId}`, JSON.stringify(compact));
    } catch (error) {
        console.warn('Merchant chat cache unavailable:', error);
    }
}

function readLocalMessages(conversationId) {
    return readLocalArray(`zz_glasses_merchant_chat_${conversationId}`);
}

function localOrders() {
    return readLocalArray(`zz_glasses_merchant_orders_${getMerchantId()}`);
}

async function loadMerchantOrders() {
    merchantOrders = localOrders();
    if (!getMerchantId() || !canUseRemoteMerchantChat()) return;
    try {
        const data = await apiJson(`/orders-shop/${encodeURIComponent(getMerchantId())}`);
        merchantOrders = Array.isArray(data.orders) ? mergeById(data.orders, merchantOrders) : merchantOrders;
        localStorage.setItem(`zz_glasses_merchant_orders_${getMerchantId()}`, JSON.stringify(merchantOrders));
    } catch (error) {
        markRemoteUnavailable(error, '订单本地缓存');
    }
}

async function loadMerchantConversations() {
    if (merchantChatPollBusy || !getMerchantId() || !canUseRemoteMerchantChat()) return;
    merchantChatPollBusy = true;
    try {
        const data = await apiJson(`/chat/conversations/${encodeURIComponent(getMerchantId())}`);
        merchantConversations = Array.isArray(data.conversations) ? data.conversations : [];
        remoteMerchantChatAvailable = true;
        setMerchantSyncState('服务器已同步', true);
    } catch (error) {
        markRemoteUnavailable(error, '会话本地缓存');
    } finally {
        merchantChatPollBusy = false;
    }
}

function mergeById(primary, secondary) {
    const seen = new Set();
    return [...primary, ...secondary].filter(item => {
        const key = item?.id || item?.orderId;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function renderMerchantShell() {
    const userBox = document.getElementById('merchant-chat-user');
    if (!merchantCurrentUser?.uid) {
        userBox.innerHTML = `<button class="btn btn-primary" onclick="location.href=${jsArg(buildPassportUrl('login'))}">商家登录</button>`;
        document.getElementById('merchant-chat-orders').innerHTML = '<p class="text-dim">请先登录商家账号，再查看客户沟通。</p>';
        document.getElementById('merchant-chat-thread').innerHTML = '<div class="chat-bubble system">未登录，无法读取商家会话。</div>';
        return;
    }
    userBox.innerHTML = `<span>${escapeHtml(getMerchantName())}</span>`;
    renderMerchantOrderList();
    renderMerchantConversation();
}

function renderMerchantOrderList() {
    const list = document.getElementById('merchant-chat-orders');
    if (!list) return;
    const conversationItems = merchantConversations.map(item => ({
        kind: 'conversation',
        id: item.id,
        title: item.customerName || item.customerId || '顾客',
        subtitle: item.messages?.[0]?.text || item.frame?.name || '配镜沟通',
        status: item.orderId ? '关联订单' : '沟通中',
        time: item.updatedAt || item.createdAt || 0
    }));
    const orderItems = merchantOrders
        .filter(order => !conversationItems.some(item => item.id === order.conversationId || item.orderId === order.id))
        .map(order => ({
            kind: 'order',
            id: order.id,
            title: order.customerName || order.contact || order.customerId || '顾客',
            subtitle: order.glassesName || order.frame?.name || '定制镜框',
            status: normalizeOrderStatus(order.status),
            time: order.updatedAt || order.createdAt || 0
        }));
    const items = [...conversationItems, ...orderItems].sort((a, b) => Number(b.time || 0) - Number(a.time || 0));
    if (!items.length) {
        list.innerHTML = `
            <div class="empty-state">
                <p class="text-dim">还没有客户沟通。顾客从 chat 发消息、发送心愿单或定制需求后，会出现在这里。</p>
                <a class="btn btn-secondary" href="./merchant.html#frames">维护镜框库</a>
            </div>
        `;
        return;
    }
    list.innerHTML = items.map(item => `
        <button class="merchant-chat-order ${isActiveMerchantItem(item) ? 'selected' : ''}" type="button" onclick="selectMerchantItem(${jsArg(item.kind)}, ${jsArg(item.id)})">
            <span>${escapeHtml(item.title)}</span>
            <strong>${escapeHtml(item.subtitle)}</strong>
            <small>${escapeHtml(item.status)} · ${item.time ? new Date(item.time).toLocaleString('zh-CN') : '本地'}</small>
        </button>
    `).join('');
}

function isActiveMerchantItem(item) {
    return (item.kind === 'conversation' && activeConversation?.id === item.id)
        || (item.kind === 'order' && activeOrder?.id === item.id);
}

async function selectMerchantItem(kind, id) {
    if (kind === 'conversation') {
        activeOrder = null;
        activeConversation = merchantConversations.find(item => item.id === id) || null;
        await loadActiveConversationMessages();
    } else {
        activeConversation = null;
        activeOrder = merchantOrders.find(item => item.id === id) || null;
        activeMessages = buildOrderDraftMessages(activeOrder);
    }
    renderMerchantShell();
}

async function loadActiveConversationMessages() {
    if (!activeConversation?.id) return;
    activeMessages = readLocalMessages(activeConversation.id);
    if (!canUseRemoteMerchantChat()) return;
    try {
        const data = await apiJson(`/chat/messages/${encodeURIComponent(activeConversation.id)}?uid=${encodeURIComponent(getMerchantId())}`);
        activeConversation = data.conversation || activeConversation;
        activeMessages = Array.isArray(data.messages) ? data.messages : activeMessages;
        writeLocalMessages(activeConversation.id, activeMessages);
        remoteMerchantChatAvailable = true;
        setMerchantSyncState('服务器已同步', true);
    } catch (error) {
        markRemoteUnavailable(error, '消息本地缓存');
    }
}

function buildOrderDraftMessages(order = {}) {
    if (!order?.id) return [];
    const local = readLocalMessages(order.id);
    if (local.length) return local;
    return [
        { role: 'system', text: `顾客提交了「${order.glassesName || '定制镜框'}」相关需求。`, createdAt: new Date().toISOString() },
        { role: 'customer', text: order.note || order.customParams || '我想确认这副镜框是否合适，以及是否需要调整鼻托、镜腿或材料。', createdAt: new Date().toISOString() }
    ];
}

function renderMerchantConversation() {
    const summary = document.getElementById('merchant-order-summary');
    const thread = document.getElementById('merchant-chat-thread');
    if (!summary || !thread) return;
    const item = activeConversation || activeOrder;
    if (!item) {
        summary.innerHTML = '<p class="text-dim">选择左侧客户沟通后，会显示顾客参数、镜框、心愿单和验光单。</p>';
        thread.innerHTML = '<div class="chat-bubble system">等待选择会话。</div>';
        return;
    }
    const analysis = item.analysis || item.payload?.analysis || {};
    const frame = item.frame || item.payload?.frame || {};
    summary.innerHTML = `
        <div class="merchant-summary-head">
            <div>
                <p class="eyebrow">${activeConversation ? '客户会话' : '本地订单'}</p>
                <h2>${escapeHtml(item.customerName || item.contact || item.customerId || '顾客')}</h2>
            </div>
            <span>${escapeHtml(item.status || (activeConversation ? '沟通中' : 'pending'))}</span>
        </div>
        <div class="home-data-grid compact-chat-data">
            <div><span>镜框</span><strong>${escapeHtml(frame.name || item.glassesName || '-')}</strong></div>
            <div><span>脸型</span><strong>${escapeHtml(analysis.faceShape || '-')}</strong></div>
            <div><span>瞳距</span><strong>${analysis.pd ? `${escapeHtml(analysis.pd)} mm` : '-'}</strong></div>
            <div><span>建议镜圈</span><strong>${analysis.recommendedLensWidth ? `${escapeHtml(analysis.recommendedLensWidth)} mm` : '-'}</strong></div>
            <div><span>移心量</span><strong>${Number.isFinite(Number(analysis.decentration)) ? `${escapeHtml(analysis.decentration)} mm` : '-'}</strong></div>
            <div><span>订单</span><strong>${escapeHtml(item.orderId || item.id || '-')}</strong></div>
        </div>
        ${frame.image && safeImageSrc(frame.image) ? `<img class="merchant-summary-frame" src="${safeImageSrc(frame.image)}" alt="${escapeHtml(frame.name || '镜框')}">` : ''}
    `;
    thread.innerHTML = activeMessages.map(renderMerchantMessage).join('');
    thread.scrollTop = thread.scrollHeight;
}

function renderMerchantMessage(message) {
    const role = message.role === 'customer' || message.role === 'user' ? 'merchant' : message.role === 'system' ? 'system' : 'user';
    const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    const attachments = normalizeAttachments(message.attachments || message.payload?.attachments);
    const attachmentHtml = attachments.map(item => `
        <button class="chat-image-thumb" type="button" onclick="openMerchantChatImage(${jsArg(item.dataUrl)}, ${jsArg(item.name || '聊天图片')})">
            <img src="${safeImageSrc(item.dataUrl)}" alt="${escapeHtml(item.name || '聊天图片')}">
        </button>
    `).join('');
    return `
        <div class="chat-message-row ${role}">
            <div class="chat-bubble ${role}">
                ${message.text ? `<span>${escapeHtml(message.text)}</span>` : ''}
                ${attachmentHtml}
                ${time ? `<small>${escapeHtml(time)}</small>` : ''}
            </div>
        </div>
    `;
}

function normalizeAttachments(value) {
    return (Array.isArray(value) ? value : [])
        .filter(item => item?.type === 'image' && typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:image/'))
        .slice(0, 4);
}

async function sendMerchantMessage(event) {
    event.preventDefault();
    const input = document.getElementById('merchant-chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await appendMerchantMessage(text);
}

async function appendMerchantMessage(text, payload = {}) {
    const localMessage = {
        localId: `merchant_local_${Date.now()}`,
        role: 'merchant',
        text,
        attachments: normalizeAttachments(payload.attachments),
        payload,
        createdAt: new Date().toISOString(),
        status: 'sending'
    };
    activeMessages.push(localMessage);
    writeLocalMessages(activeConversation?.id || activeOrder?.id, activeMessages);
    renderMerchantConversation();

    if (!canUseRemoteMerchantChat()) {
        localMessage.status = 'local';
        writeLocalMessages(activeConversation?.id || activeOrder?.id, activeMessages);
        setMerchantSyncState('已本地保存', false);
        return;
    }

    try {
        const order = activeOrder || {};
        const conversation = activeConversation || {};
        const data = await apiJson('/chat/message', {
            method: 'POST',
            body: JSON.stringify({
                conversationId: conversation.id || '',
                uid: getMerchantId(),
                role: 'merchant',
                text,
                merchantId: getMerchantId(),
                merchantName: getMerchantName(),
                customerName: conversation.customerName || order.customerName || order.contact || '',
                orderId: conversation.orderId || order.id || '',
                frame: conversation.frame || order.frame || { name: order.glassesName || '' },
                analysis: conversation.analysis || order.analysis || {},
                attachments: normalizeAttachments(payload.attachments),
                payload: {
                    ...payload,
                    customerId: conversation.customerId || order.customerId || order.uid || '',
                    customerName: conversation.customerName || order.customerName || order.contact || ''
                }
            })
        });
        activeConversation = data.conversation || activeConversation;
        activeOrder = null;
        activeMessages = Array.isArray(data.messages) ? data.messages : activeMessages;
        writeLocalMessages(activeConversation?.id, activeMessages);
        remoteMerchantChatAvailable = true;
        setMerchantSyncState('服务器已同步', true);
        await refreshMerchantData(false);
    } catch (error) {
        localMessage.status = 'local';
        markRemoteUnavailable(error, '回复已本地保存');
        writeLocalMessages(activeConversation?.id || activeOrder?.id, activeMessages);
    }
    renderMerchantShell();
}

function sendMerchantQuick(text) {
    appendMerchantMessage(text, { type: 'quick_reply' });
}

function openMerchantImagePicker() {
    document.getElementById('merchant-chat-image-input')?.click();
}

async function sendMerchantChatImage(input) {
    const file = input?.files?.[0];
    if (!file) return;
    try {
        const attachment = await compressMerchantChatImage(file);
        await appendMerchantMessage('发送了一张镜框或沟通图片', { type: 'image', attachments: [attachment] });
    } catch (error) {
        alert('图片发送失败，请换一张较小的图片。');
    } finally {
        if (input) input.value = '';
    }
}

function compressMerchantChatImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error('图片解析失败'));
            image.onload = () => {
                const maxSide = 1280;
                const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve({
                    type: 'image',
                    dataUrl: canvas.toDataURL('image/jpeg', 0.82),
                    name: file.name || '商家图片.jpg',
                    size: file.size || 0,
                    width: canvas.width,
                    height: canvas.height
                });
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function openMerchantChatImage(src, alt = '聊天图片') {
    const viewer = document.getElementById('merchant-chat-image-viewer');
    const image = document.getElementById('merchant-chat-image-viewer-img');
    if (!viewer || !image) return;
    image.src = src;
    image.alt = alt;
    viewer.classList.add('active');
    viewer.setAttribute('aria-hidden', 'false');
}

function closeMerchantChatImage() {
    const viewer = document.getElementById('merchant-chat-image-viewer');
    const image = document.getElementById('merchant-chat-image-viewer-img');
    if (!viewer || !image) return;
    viewer.classList.remove('active');
    viewer.setAttribute('aria-hidden', 'true');
    image.removeAttribute('src');
}

async function pollActiveMerchantThread() {
    if (merchantThreadPollBusy || document.hidden || !activeConversation?.id || !canUseRemoteMerchantChat()) return;
    merchantThreadPollBusy = true;
    try {
        const data = await apiJson(`/chat/messages/${encodeURIComponent(activeConversation.id)}?uid=${encodeURIComponent(getMerchantId())}`);
        activeConversation = data.conversation || activeConversation;
        activeMessages = Array.isArray(data.messages) ? data.messages : activeMessages;
        writeLocalMessages(activeConversation.id, activeMessages);
        renderMerchantConversation();
    } catch (error) {
        markRemoteUnavailable(error, '消息本地缓存');
    } finally {
        merchantThreadPollBusy = false;
    }
}

async function refreshMerchantData(shouldRender = true) {
    await Promise.all([loadMerchantOrders(), loadMerchantConversations()]);
    if (!activeConversation && !activeOrder) {
        const params = new URLSearchParams(window.location.search);
        const orderId = params.get('orderId');
        activeOrder = merchantOrders.find(item => item.id === orderId) || null;
        activeConversation = merchantConversations.find(item => item.orderId === orderId) || merchantConversations[0] || null;
        if (activeConversation) {
            activeOrder = null;
            await loadActiveConversationMessages();
        } else if (activeOrder) {
            activeMessages = buildOrderDraftMessages(activeOrder);
        }
    } else if (activeConversation) {
        await loadActiveConversationMessages();
    }
    if (shouldRender) renderMerchantShell();
}

function scheduleMerchantPolling() {
    clearTimeout(merchantThreadTimer);
    clearTimeout(merchantDataTimer);
    if (document.hidden) return;

    merchantThreadTimer = setTimeout(async () => {
        await pollActiveMerchantThread();
        scheduleMerchantThreadPolling();
    }, activeConversation?.id ? 3000 : 9000);
    merchantDataTimer = setTimeout(async () => {
        await refreshMerchantData(false);
        renderMerchantOrderList();
        scheduleMerchantDataPolling();
    }, 18000);
}

function scheduleMerchantThreadPolling() {
    clearTimeout(merchantThreadTimer);
    if (document.hidden) return;
    merchantThreadTimer = setTimeout(async () => {
        await pollActiveMerchantThread();
        scheduleMerchantThreadPolling();
    }, activeConversation?.id ? 3000 : 9000);
}

function scheduleMerchantDataPolling() {
    clearTimeout(merchantDataTimer);
    if (document.hidden) return;
    merchantDataTimer = setTimeout(async () => {
        await refreshMerchantData(false);
        renderMerchantOrderList();
        scheduleMerchantDataPolling();
    }, 18000);
}

function normalizeOrderStatus(status) {
    const map = {
        pending: '待处理',
        processing: '处理中',
        completed: '已完成',
        cancelled: '已取消'
    };
    return map[status] || status || '待处理';
}

async function initMerchantChat() {
    merchantCurrentUser = readMerchantUser();
    renderMerchantShell();
    if (!merchantCurrentUser?.uid) return;
    await refreshMerchantData(true);
    scheduleMerchantPolling();
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            refreshMerchantData(true);
            pollActiveMerchantThread();
            scheduleMerchantPolling();
        } else {
            clearTimeout(merchantThreadTimer);
            clearTimeout(merchantDataTimer);
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMerchantChat);
} else {
    initMerchantChat();
}

Object.assign(window, {
    selectMerchantItem,
    sendMerchantMessage,
    sendMerchantQuick,
    openMerchantImagePicker,
    sendMerchantChatImage,
    openMerchantChatImage,
    closeMerchantChatImage,
    refreshMerchantData
});
