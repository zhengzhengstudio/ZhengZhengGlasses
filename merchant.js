let currentUser = null;
let selectedGlassesImage = null;
const API_BASE = 'https://zhengzhengstudio.cn';
const REMOTE_SHOP_API_ENABLED = localStorage.getItem('zz_glasses_remote_shop_api') === '1';
let merchantProfile = null;

async function init() {
    const saved = localStorage.getItem('zz_passport_user');
    if (!saved) {
        alert('请先登录');
        window.location.href = buildPassportUrl('login');
        return;
    }

    try {
        currentUser = JSON.parse(saved);
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
    redirect.searchParams.delete('passport_uid');
    const url = new URL(`https://zhengzhengstudio.cn/passport/${page}.html`);
    url.searchParams.set('redirect', redirect.href);
    url.searchParams.set('from', 'glasses');
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
            console.warn('Remote merchant glasses unavailable, using local glasses:', error.message);
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
                <img src="${g.image || fallbackFrameImage(g.name || 'eyeglasses frame')}" alt="${escapeHtml(g.name || '镜框样板')}">
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
            console.warn('Remote orders unavailable, using local orders:', error.message);
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

    container.innerHTML = orders.map(o => `
        <div class="order-item">
            <div class="order-header">
                <span class="order-id">${o.id}</span>
                <span class="status-badge status-${o.status}">${getStatusText(o.status)}</span>
            </div>
            <div class="order-details">
                <p><strong>商品:</strong> ${escapeHtml(o.glassesName || '定制镜框')}</p>
                <p><strong>客户:</strong> ${escapeHtml(o.contact || o.customerId || '未知客户')}</p>
                <p><strong>客户参数:</strong> ${o.customParams || '待补充参数'}</p>
                ${o.adjustment ? `<p><strong>微调说明:</strong> ${o.adjustment}</p>` : '<p><strong>微调说明:</strong> 暂无</p>'}
            </div>
            <div class="order-actions">
                <button class="btn btn-secondary" onclick="openMerchantChat('${o.id}')">沟通</button>
                ${o.status === 'pending' ? `<button class="btn btn-primary" onclick="updateOrderStatus('${o.id}', 'processing')">接单</button>` : ''}
                ${o.status !== 'completed' ? `<button class="btn btn-secondary" onclick="openAdjustModal('${o.id}')">微调</button>` : ''}
                ${o.status !== 'completed' ? `<button class="btn btn-success" onclick="updateOrderStatus('${o.id}', 'completed')">完成</button>` : ''}
            </div>
        </div>
    `).join('');
}

function openMerchantChat(orderId = '') {
    const url = new URL('merchant-chat.html', window.location.href);
    if (orderId) url.searchParams.set('orderId', orderId);
    window.location.href = url.href;
}

function openUploadModal() {
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

function previewGlassesImage(input) {
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
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

async function updateOrderStatus(orderId, status) {
    if (REMOTE_SHOP_API_ENABLED) {
        try {
            await fetchJson(`${API_BASE}/api/glasses/order/update-shop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, status })
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
    const defaultName = currentUser.nickname || currentUser.username || '我的眼镜店';
    const storeName = prompt('请输入商家名称', defaultName);
    if (!storeName) return;

    const profile = {
        uid: currentUser.uid,
        storeName,
        contact: currentUser.social?.wechat || currentUser.username || '',
        description: '铮铮眼镜入驻商家',
        createdAt: new Date().toISOString(),
        source: 'local'
    };

    saveLocalMerchantProfile(profile);
    merchantProfile = profile;
    setText('store-name', storeName);

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

    showToast('商家信息已保存到本机，可以先上传镜框');
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

function fallbackFrameImage(name) {
    return `https://neeko-copilot.bytedance.net/api/text_to_image?prompt=${encodeURIComponent(name + ' eyeglasses frame product photo white background')}&image_size=square`;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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
