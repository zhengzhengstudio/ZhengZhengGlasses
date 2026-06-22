let currentUser = null;
let selectedGlassesImage = null;
const API_BASE = 'https://zhengzhengstudio.cn';
const REMOTE_SHOP_API_ENABLED = localStorage.getItem('zz_glasses_remote_shop_api') !== '0';
let merchantProfile = null;
const MERCHANT_AUTH_RETURN_PARAMS = ['user', 'passport_user', 'account', 'passport_uid', 'uid', 'user_id', 'username', 'nickname', 'name', 'avatar'];

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

function readMerchantUserFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const jsonUser = parseMaybeEncodedJson(params.get('user'))
        || parseMaybeEncodedJson(params.get('passport_user'))
        || parseMaybeEncodedJson(params.get('account'));
    const user = jsonUser?.uid || jsonUser?.id
        ? {
            ...jsonUser,
            uid: jsonUser.uid || jsonUser.id,
            username: jsonUser.username || jsonUser.nickname || jsonUser.name || '商家用户',
            nickname: jsonUser.nickname || jsonUser.username || jsonUser.name || '商家用户'
        }
        : {
            uid: params.get('passport_uid') || params.get('uid') || params.get('user_id') || '',
            username: params.get('username') || params.get('nickname') || params.get('name') || '商家用户',
            nickname: params.get('nickname') || params.get('username') || params.get('name') || '商家用户',
            avatar: params.get('avatar') || '',
            source: 'passport'
        };
    if (!user.uid) return null;
    localStorage.setItem('zz_passport_user', JSON.stringify(user));
    const clean = new URL(window.location.href);
    MERCHANT_AUTH_RETURN_PARAMS.forEach(param => clean.searchParams.delete(param));
    window.history.replaceState({}, document.title, `${clean.pathname}${clean.search}${clean.hash}`);
    return user;
}

async function init() {
    const urlUser = readMerchantUserFromUrl();
    const saved = localStorage.getItem('zz_passport_user');
    if (!urlUser && !saved) {
        alert('请先登录');
        window.location.href = buildPassportUrl('login');
        return;
    }

    try {
        currentUser = urlUser || JSON.parse(saved);
        if (!currentUser || !currentUser.uid) {
            throw new Error('Invalid user');
        }
    } catch (e) {
        alert('请先登录');
        window.location.href = buildPassportUrl('login');
        return;
    }

    const displayName = currentUser.nickname || currentUser.username || '商家用户';
    setText('store-name', displayName);
    await loadMerchantData();
}

function buildPassportUrl(page) {
    const redirect = new URL(window.location.href);
    MERCHANT_AUTH_RETURN_PARAMS.forEach(param => redirect.searchParams.delete(param));
    const url = new URL(`https://zhengzhengstudio.cn/passport/${page}.html`);
    url.searchParams.set('redirect', redirect.href);
    url.searchParams.set('from', 'glasses');
    url.searchParams.set('scope', 'glasses');
    url.searchParams.set('returnUser', '1');
    return url.href;
}

async function loadMerchantData() {
    await Promise.all([loadMerchantProfile(), loadMerchantGlasses(), loadOrders()]);
}

async function loadMerchantProfile() {
    merchantProfile = getLocalMerchantProfile() || getMerchantProfile();
    setText('store-name', merchantProfile.storeName);

    if (REMOTE_SHOP_API_ENABLED) {
        try {
            const data = await fetchJson(`${API_BASE}/api/glasses/merchant-shop/${currentUser.uid}`);
            merchantProfile = data.merchant || merchantProfile;
            saveLocalMerchantProfile(merchantProfile);
            setText('store-name', merchantProfile.storeName);
        } catch (error) {
            console.warn('Remote merchant profile unavailable, using local profile:', error.message);
        }
    }
}

async function loadMerchantGlasses() {
    const container = document.getElementById('my-glasses');
    if (!container) return;

    let glasses = getLocalGlasses();
    if (REMOTE_SHOP_API_ENABLED) {
        try {
            const data = await fetchJson(`${API_BASE}/api/glasses/merchant-shop/${currentUser.uid}`);
            merchantProfile = data.merchant || merchantProfile;
            if (merchantProfile) saveLocalMerchantProfile(merchantProfile);
            glasses = mergeGlasses(data.glasses || [], glasses);
            saveLocalGlasses(glasses);
        } catch (error) {
            try {
                const data = await fetchJson(`${API_BASE}/api/shop/glasses/catalog`);
                const remoteFrames = Array.isArray(data.frames) ? data.frames : [];
                const mine = remoteFrames.filter(frame => frame.merchantId === currentUser.uid);
                glasses = mergeGlasses(mine, glasses);
                saveLocalGlasses(glasses);
            } catch (shopError) {
                console.warn('Remote merchant glasses unavailable, using local glasses:', shopError.message || error.message);
            }
        }
    }

    if (!merchantProfile && !glasses.length) {
        container.innerHTML = `
            <div class="empty-state">
                <p class="text-center text-dim">先注册商家身份，再上传镜框样板。当前会保存到本机镜框库，后端接通后可再同步到主站商店。</p>
                <button class="btn btn-primary" onclick="registerShopMerchant()">注册眼镜商家</button>
            </div>
        `;
        setText('hero-total-glasses', 0);
        return;
    }
    setText('hero-total-glasses', glasses.length);

    if (glasses.length === 0) {
        container.innerHTML = '<p class="text-center text-dim">还没有镜框样板，先上传一款主推镜框吧。</p>';
        return;
    }

    container.innerHTML = glasses.map(g => `
        <div class="glasses-item">
            <div class="preview">
                <img src="${safeImageSrc(g.image || fallbackFrameImage())}" alt="${escapeHtml(g.name || '镜框样板')}">
            </div>
            <div class="name">${escapeHtml(g.name || '未命名镜框')}</div>
            <div class="meta">${escapeHtml(g.merchantName || merchantProfile?.storeName || '眼镜商家')} · ${escapeHtml(g.type || '镜框')} · ¥${escapeHtml(g.price || '-')}</div>
            <div class="meta">镜圈 ${escapeHtml(g.lensWidth || '-')} mm · 鼻梁 ${escapeHtml(g.bridgeSize || '-')} mm · 镜腿 ${escapeHtml(g.templeLength || '-')} mm</div>
        </div>
    `).join('');
}

async function loadOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    let orders = getLocalOrders();
    if (REMOTE_SHOP_API_ENABLED) {
        try {
            const data = await fetchJson(`${API_BASE}/api/glasses/orders-shop/${currentUser.uid}`);
            orders = data.orders || orders;
            saveLocalOrders(orders);
        } catch (error) {
            try {
                const data = await fetchJson(`${API_BASE}/api/shop/glasses/orders/${currentUser.uid}`);
                orders = data.orders || orders;
                saveLocalOrders(orders);
            } catch (shopError) {
                console.warn('Remote orders unavailable, using local orders:', shopError.message || error.message);
            }
        }
    }
    const filter = document.getElementById('order-filter')?.value || 'all';
    const visibleOrders = filter === 'all' ? orders : orders.filter(o => o.status === filter);
    const stats = {
        total: orders.length,
        pending: orders.filter(o => o.status === 'pending').length,
        processing: orders.filter(o => o.status === 'processing').length,
        completed: orders.filter(o => o.status === 'completed').length
    };

    setText('total-orders', stats.total);
    setText('pending-orders', stats.pending);
    setText('processing-orders', stats.processing);
    setText('completed-orders', stats.completed);
    setText('hero-pending-orders', stats.pending);
    renderOrders(visibleOrders);
}

function renderOrders(orders) {
    const container = document.getElementById('orders-container');
    if (orders.length === 0) {
        container.innerHTML = '<p class="text-center text-dim">当前筛选下暂无订单。</p>';
        return;
    }

    container.innerHTML = orders.map(o => {
        const orderId = String(o.id || '');
        const status = normalizeOrderStatus(o.status);
        return `
        <div class="order-item">
            <div class="order-header">
                <span class="order-id">${escapeHtml(orderId)}</span>
                <span class="status-badge status-${status}">${escapeHtml(getStatusText(status))}</span>
            </div>
            <div class="order-details">
                <p><strong>商品:</strong> ${escapeHtml(o.glassesName || '定制镜框')}</p>
                <p><strong>客户:</strong> ${escapeHtml(o.contact || o.customerId || '未知客户')}</p>
                <p><strong>客户参数:</strong> ${escapeHtml(o.customParams || '待补充参数')}</p>
                ${o.adjustment ? `<p><strong>微调说明:</strong> ${escapeHtml(o.adjustment)}</p>` : '<p><strong>微调说明:</strong> 暂无</p>'}
            </div>
            <div class="order-actions">
                <button class="btn btn-secondary" onclick="openMerchantChat(${jsArg(orderId)})">沟通</button>
                ${status === 'pending' ? `<button class="btn btn-primary" onclick="updateOrderStatus(${jsArg(orderId)}, 'processing')">接单</button>` : ''}
                ${status !== 'completed' ? `<button class="btn btn-secondary" onclick="openAdjustModal(${jsArg(orderId)})">微调</button>` : ''}
                ${status !== 'completed' ? `<button class="btn btn-success" onclick="updateOrderStatus(${jsArg(orderId)}, 'completed')">完成</button>` : ''}
            </div>
        </div>
    `;
    }).join('');
}

function openMerchantChat(orderId = '') {
    const url = new URL('merchant-chat.html', window.location.href);
    if (orderId) url.searchParams.set('orderId', orderId);
    if (currentUser?.uid) url.searchParams.set('user', JSON.stringify(currentUser));
    window.location.href = url.href;
}

function openUploadModal() {
    if (!merchantProfile) {
        showToast('请先保存商家入驻信息');
        openMerchantProfileModal();
        return;
    }
    selectedGlassesImage = null;
    document.getElementById('glasses-name').value = '';
    document.getElementById('glasses-price').value = '';
    document.getElementById('glasses-type').value = '全框';
    document.getElementById('glasses-lens-width').value = '';
    document.getElementById('glasses-bridge-size').value = '';
    document.getElementById('glasses-temple-length').value = '';
    document.getElementById('glasses-overlay-scale').value = '';
    document.getElementById('glasses-image').value = '';
    document.getElementById('glasses-image-preview').innerHTML = `
        <div class="upload-preview-inner">
            <div class="icon">🖼️</div>
            <p>点击选择正面透明 PNG 镜框图</p>
        </div>
    `;
    document.getElementById('upload-modal').classList.add('active');
}

function openMerchantProfileModal() {
    const profile = merchantProfile || getLocalMerchantProfile() || getMerchantProfile();
    document.getElementById('merchant-store-name').value = profile.storeName || currentUser.nickname || currentUser.username || '';
    document.getElementById('merchant-contact').value = profile.contact || currentUser.social?.wechat || currentUser.username || '';
    document.getElementById('merchant-style').value = profile.style || '日常百搭';
    document.getElementById('merchant-service-type').value = profile.serviceType || '试戴推荐与普通配镜';
    document.getElementById('merchant-description').value = profile.description || profile.serviceNote || '';
    document.getElementById('merchant-profile-modal').classList.add('active');
}

function previewGlassesImage(input) {
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type || '')) {
        showToast('请上传 PNG、JPG 或 WebP 镜框图片');
        input.value = '';
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('图片大小不能超过 5MB');
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = e => {
        selectedGlassesImage = e.target.result;
        document.getElementById('glasses-image-preview').innerHTML = `
            <img src="${selectedGlassesImage}" alt="镜框图片预览" class="modal-preview-image">
        `;
    };
    reader.readAsDataURL(file);
}

async function submitGlasses() {
    const name = document.getElementById('glasses-name').value.trim();
    const type = document.getElementById('glasses-type').value;
    const price = document.getElementById('glasses-price').value;
    const lensWidth = Number(document.getElementById('glasses-lens-width').value || 51);
    const bridgeSize = Number(document.getElementById('glasses-bridge-size').value || 18);
    const templeLength = Number(document.getElementById('glasses-temple-length').value || 145);
    const overlayScale = Number(document.getElementById('glasses-overlay-scale').value || 1);

    if (!name || !price) {
        showToast('请填写镜框名称和价格');
        return;
    }
    if (!selectedGlassesImage) {
        showToast('请上传一张正面镜框图片');
        return;
    }

    const localFrame = {
        id: `shop_${currentUser.uid}_${Date.now()}`,
        name,
        merchantId: currentUser.uid,
        merchantName: merchantProfile?.storeName || currentUser.nickname || currentUser.username || '眼镜商家',
        category: '眼镜商家',
        type,
        price: Number(price),
        image: selectedGlassesImage,
        lensWidth,
        bridgeSize,
        templeLength,
        overlayScale,
        description: '商家上传镜框样板，可直接用于摄像头试戴预览',
        source: 'merchant-local'
    };

    if (!merchantProfile) {
        merchantProfile = getLocalMerchantProfile() || getMerchantProfile();
        saveLocalMerchantProfile(merchantProfile);
    }

    if (REMOTE_SHOP_API_ENABLED) {
        try {
            const data = await fetchJson(`${API_BASE}/api/glasses/glasses/upload-shop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: currentUser.uid,
                    name,
                    type,
                    price,
                    image: selectedGlassesImage,
                    lensWidth,
                    bridgeSize,
                    templeLength,
                    overlayScale,
                    description: '商家上传镜框样板，可用于在线试戴'
                })
            });
            saveLocalGlasses(mergeGlasses([data.glasses || localFrame], getLocalGlasses()));
            showToast(`已上传到 ${data.glasses?.merchantName || '主站商家库'}`);
            closeModal('upload-modal');
            await loadMerchantGlasses();
            return;
        } catch (error) {
            console.warn('Remote glasses upload unavailable, saving locally:', error.message);
        }
    }

    saveLocalGlasses(mergeGlasses([localFrame], getLocalGlasses()));
    showToast('已保存到本机镜框库，客户页可立即试戴');
    closeModal('upload-modal');
    await loadMerchantGlasses();
}

function getStatusText(status) {
    const texts = {
        pending: '待处理',
        processing: '处理中',
        completed: '已完成',
        cancelled: '已取消'
    };
    return texts[status] || status;
}

function normalizeOrderStatus(status) {
    return ['pending', 'processing', 'completed', 'cancelled'].includes(status) ? status : 'pending';
}

async function updateOrderStatus(orderId, status) {
    if (REMOTE_SHOP_API_ENABLED) {
        try {
            await fetchJson(`${API_BASE}/api/glasses/order/update-shop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId, status, uid: currentUser.uid })
            });
            showToast('订单状态已更新');
            await loadOrders();
            return;
        } catch (error) {
            console.warn('Remote order update unavailable, updating locally:', error.message);
        }
    }

    const orders = getLocalOrders().map(order => order.id === orderId ? { ...order, status, updatedAt: new Date().toISOString() } : order);
    saveLocalOrders(orders);
    showToast('订单状态已更新');
    await loadOrders();
}

function openAdjustModal(orderId) {
    document.getElementById('adjust-order-id').value = orderId;
    document.getElementById('adjust-reason').value = '';
    document.getElementById('adjust-modal').classList.add('active');
}

async function submitAdjustment() {
    const orderId = document.getElementById('adjust-order-id').value;
    const reason = document.getElementById('adjust-reason').value.trim();

    if (!reason) {
        showToast('请输入微调说明');
        return;
    }

    if (REMOTE_SHOP_API_ENABLED) {
        try {
            await fetchJson(`${API_BASE}/api/glasses/order/adjust-shop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, adjustment: reason, adjustedBy: currentUser.uid })
            });
            showToast('已提交微调说明');
            closeModal('adjust-modal');
            await loadOrders();
            return;
        } catch (error) {
            console.warn('Remote adjustment unavailable, updating locally:', error.message);
        }
    }

    const orders = getLocalOrders().map(order => order.id === orderId
        ? { ...order, adjustment: reason, adjustedBy: currentUser.uid, updatedAt: new Date().toISOString() }
        : order);
    saveLocalOrders(orders);
    showToast('已提交微调说明');
    closeModal('adjust-modal');
    await loadOrders();
}

async function registerShopMerchant() {
    openMerchantProfileModal();
}

async function saveShopMerchantProfile() {
    const storeName = document.getElementById('merchant-store-name').value.trim();
    const contact = document.getElementById('merchant-contact').value.trim();
    const style = document.getElementById('merchant-style').value;
    const serviceType = document.getElementById('merchant-service-type').value;
    const description = document.getElementById('merchant-description').value.trim();

    if (!storeName) {
        showToast('请填写店铺名称');
        return;
    }

    const profile = {
        uid: currentUser.uid,
        storeName,
        merchantName: storeName,
        contact,
        style,
        serviceType,
        description: description || `${style} · ${serviceType}`,
        serviceNote: description || `${style} · ${serviceType}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'local'
    };

    saveLocalMerchantProfile(profile);
    merchantProfile = profile;
    setText('store-name', storeName);
    closeModal('merchant-profile-modal');

    if (REMOTE_SHOP_API_ENABLED) {
        try {
            await fetchJson(`${API_BASE}/api/glasses/merchant/register-shop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profile)
            });
            showToast('商家注册成功，可以上传镜框了');
            await loadMerchantData();
            return;
        } catch (error) {
            console.warn('Remote merchant register unavailable, saved locally:', error.message);
        }
    }

    showToast('商家信息已保存，可以先上传镜框');
    await loadMerchantData();
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
        throw new Error(data.error || `请求失败 ${response.status}`);
    }
    return data;
}

function resetOrderStats() {
    ['total-orders', 'pending-orders', 'processing-orders', 'completed-orders', 'hero-pending-orders'].forEach(id => setText(id, 0));
}

function getMerchantProfile() {
    return {
        uid: currentUser.uid,
        storeName: currentUser.nickname || currentUser.username || '商家用户',
        contact: currentUser.social?.wechat || currentUser.username || '',
        description: '本机商家资料'
    };
}

function getLocalMerchantProfile() {
    try {
        return JSON.parse(localStorage.getItem(`zz_glasses_merchant_profile_${currentUser.uid}`) || 'null');
    } catch (e) {
        return null;
    }
}

function saveLocalMerchantProfile(profile) {
    localStorage.setItem(`zz_glasses_merchant_profile_${currentUser.uid}`, JSON.stringify(profile));
}

function getLocalGlasses() {
    return readLocalArray(`zz_glasses_merchant_frames_${currentUser.uid}`);
}

function saveLocalGlasses(glasses) {
    localStorage.setItem(`zz_glasses_merchant_frames_${currentUser.uid}`, JSON.stringify(glasses));
}

function mergeGlasses(primary, secondary) {
    const seen = new Set();
    return [...primary, ...secondary].filter(item => {
        const key = item?.id || item?.image || item?.name;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function getLocalOrders() {
    return readLocalArray(`zz_glasses_merchant_orders_${currentUser.uid}`);
}

function saveLocalOrders(orders) {
    localStorage.setItem(`zz_glasses_merchant_orders_${currentUser.uid}`, JSON.stringify(orders));
}

function readLocalArray(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(value) ? value : [];
    } catch (e) {
        return [];
    }
}

function fallbackFrameImage() {
    return 'assets/glasses-frame-black-rectangle-v1.png';
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function jsArg(value) {
    return JSON.stringify(String(value ?? '')).replace(/</g, '\\u003c');
}

function safeImageSrc(value) {
    const src = String(value || '').trim();
    if (!src) return fallbackFrameImage();
    if (/^data:image\/(png|jpe?g|webp);base64,/i.test(src)) return escapeHtml(src);
    if (/^(https?:\/\/|\.{0,2}\/|assets\/|uploads\/)/i.test(src)) return escapeHtml(src);
    return fallbackFrameImage();
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

window.onclick = function(e) {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
