const API_BASE = 'https://zhengzhengstudio.cn';
const REMOTE_SHOP_API_ENABLED = localStorage.getItem('zz_glasses_remote_shop_api') === '1';
let currentUser = null;
let currentMode = 'customer';
let isLoggedIn = false;
let isTemporaryUser = false;
let latestAnalysis = null;
let currentFaceFile = null;
let modelAnimationFrame = null;
let freeFaceLandmarkerPromise = null;
let mediapipeApiPromise = null;
let mediapipeCameraController = null;
let latestCameraResult = null;
let latestCameraSamples = [];
let latestPreviewMeshPoints = [];
let lastCameraUiUpdateAt = 0;
const isMobileDevice = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches;
let cameraMeshEnabled = !isMobileDevice;
let cameraGlassesEnabled = true;
let cameraFacingMode = 'user';
let preloadedVideoLandmarker = null;
let previewKeypointsEnabled = true;
let previewGlassesEnabled = true;
let previewGlassesScale = 1;
let previewGlassesOffsetX = 0;
let previewGlassesOffsetY = 0;
let previewGlassesRotation = 0;
let appTextScale = Number(localStorage.getItem('zz_glasses_text_scale') || 1);
let latestTryOnSnapshotDataUrl = null;
let latestCameraFrameDataUrl = null;
let cameraGlassesStyle = 'https://glasses.zhengzhengstudio.cn/assets/glasses-frame-ai-01.png?v=20260517-ai80';
let selectedFrameId = null;
let selectedFrameImage = null;
const selectedFrameImageCache = new Map();
let currentRecommendations = [];
let recommendationPage = 0;
const RECOMMENDATIONS_PER_PAGE = 4;
const FRAME_INDEX_URL = './frame-index.json?v=20260517-ai80';
const faceActionSteps = [
    { id: 'front', label: '看镜头', hint: '看向屏幕中央，保持一小会儿' },
    { id: 'left', label: '左转', hint: '慢慢向左转头，不要移出画面' },
    { id: 'right', label: '右转', hint: '慢慢向右转头，不要移出画面' },
    { id: 'up', label: '抬头', hint: '轻轻抬头，让鼻梁和镜腿角度更清楚' },
    { id: 'down', label: '低头', hint: '轻轻低头，补充鼻托和镜框高度判断' },
    { id: 'mouth', label: '张嘴', hint: '自然张嘴一下，用来确认是真人动作' },
    { id: 'blink', label: '眨眼', hint: '自然眨一下眼，补充活体动作' }
];
const ACTION_HOLD_FRAMES = {
    front: 8,
    left: 6,
    right: 6,
    up: 5,
    down: 5,
    mouth: 4,
    blink: 2
};
const ACTION_MIN_STEP_MS = {
    front: 600,
    left: 500,
    right: 500,
    up: 450,
    down: 450,
    mouth: 300,
    blink: 150
};
const CAMERA_SAMPLE_LIMIT = 18;
const TEMP_USER_KEY = 'zz_glasses_temp_user';
const SERVER_SYNC_QUEUE_KEY = 'zz_glasses_server_sync_queue';
const CHATGPT_MERCHANT = {
    id: 'chatgpt',
    name: 'CHATGPT'
};
const BUILTIN_FRAME_SERIES = [
    ['01', '晨雾金属圆框', '圆框', 299, 'round', 'metal'], ['02', '静黑矩形框', '矩形', 269, 'square', 'acetate'],
    ['03', '冰透方框', '方框', 329, 'clear', 'acetate'], ['04', '咖色方圆框', '方圆', 359, 'tortoise', 'acetate'],
    ['05', '银灰半框钛架', '半框', 399, 'halfRim', 'titanium'], ['06', '森林猫眼框', '猫眼', 349, 'fashion', 'acetate'],
    ['07', '海军蓝运动框', '运动矩形', 259, 'sport', 'tr90'], ['08', '胡桃飞行员框', '飞行员', 369, 'aviator', 'metal'],
    ['09', '酒红金属圆框', '圆框', 319, 'round', 'metal'], ['10', '烟紫矩形框', '矩形', 289, 'square', 'acetate'],
    ['11', '湖蓝透明方框', '方框', 329, 'clear', 'acetate'], ['12', '赤陶方圆框', '方圆', 339, 'tortoise', 'acetate'],
    ['13', '橄榄半框钛架', '半框', 409, 'halfRim', 'titanium'], ['14', '香槟猫眼框', '猫眼', 379, 'fashion', 'acetate'],
    ['15', '深棕 TR90 框', '运动矩形', 269, 'sport', 'tr90'], ['16', '青绿飞行员框', '飞行员', 389, 'aviator', 'metal'],
    ['17', '炭黑细圆框', '圆框', 299, 'round', 'metal'], ['18', '雾白矩形框', '矩形', 289, 'square', 'acetate'],
    ['19', '木纹透明方框', '方框', 349, 'clear', 'acetate'], ['20', '午夜方圆框', '方圆', 349, 'tortoise', 'acetate'],
    ['21', '莓红半框钛架', '半框', 419, 'halfRim', 'titanium'], ['22', '苔绿猫眼框', '猫眼', 359, 'fashion', 'acetate'],
    ['23', '古铜运动框', '运动矩形', 279, 'sport', 'tr90'], ['24', '紫砂飞行员框', '飞行员', 399, 'aviator', 'metal'],
    ['25', '孔雀蓝圆框', '圆框', 319, 'round', 'metal'], ['26', '焦糖矩形框', '矩形', 299, 'square', 'acetate'],
    ['27', '墨青透明方框', '方框', 329, 'clear', 'acetate'], ['28', '冷银方圆框', '方圆', 359, 'tortoise', 'acetate'],
    ['29', '深木半框钛架', '半框', 429, 'halfRim', 'titanium'], ['30', '薄荷猫眼框', '猫眼', 369, 'fashion', 'acetate'],
    ['31', '深海 TR90 框', '运动矩形', 269, 'sport', 'tr90'], ['32', '烟棕飞行员框', '飞行员', 389, 'aviator', 'metal'],
    ['33', '奶茶金属圆框', '圆框', 309, 'round', 'metal'], ['34', '雅黑矩形框', '矩形', 279, 'square', 'acetate'],
    ['35', '松绿透明方框', '方框', 339, 'clear', 'acetate'], ['36', '玫瑰方圆框', '方圆', 349, 'tortoise', 'acetate'],
    ['37', '烟紫半框钛架', '半框', 419, 'halfRim', 'titanium'], ['38', '水蓝猫眼框', '猫眼', 359, 'fashion', 'acetate'],
    ['39', '琥珀运动框', '运动矩形', 279, 'sport', 'tr90'], ['40', '岩灰飞行员框', '飞行员', 379, 'aviator', 'metal']
];
const BUILTIN_FRAME_CATALOG = BUILTIN_FRAME_SERIES.map(([number, name, type, price, style, material]) => ({
    id: `chatgpt-v40-${number}`,
    name,
    merchantId: CHATGPT_MERCHANT.id,
    merchantName: CHATGPT_MERCHANT.name,
    category: 'CHATGPT',
    type,
    price,
    image: `assets/glasses-frame-v40-${number}.png`,
    imageAlt: `${name}镜框`,
    style,
    material,
    lensWidth: getCatalogLensWidth(style, Number(number)),
    bridgeSize: getCatalogBridgeSize(style, Number(number)),
    templeLength: Number(number) % 3 === 0 ? 150 : 145
}));
let indexedFrameCatalog = [];
let shopFrameCatalog = [];
let faceActionCapture = {
    active: false,
    currentIndex: 0,
    frames: [],
    holdCount: 0,
    lastMatchedStep: null,
    matchedSince: 0
};
let onboardStepIndex = 1;

async function init() {
    applyTextScale(appTextScale);
    await loadFrameIndexCatalog();
    await loadShopFrameCatalog();
    ensureSelectedFrame();
    renderFrameSelect();
    renderDefaultRecommendations();
    applySavedPrescription();
    preloadMediapipe();

    const saved = localStorage.getItem('zz_passport_user');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            if (currentUser && currentUser.uid) {
                isLoggedIn = true;
                isTemporaryUser = false;
                showUserDashboard();
            }
        } catch (e) {
            console.error('Parse user failed:', e);
        }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const userParam = urlParams.get('user');
    const ignoreUserParam = sessionStorage.getItem('zz_glasses_ignore_user_param') === '1';
    if (userParam && !isLoggedIn && !ignoreUserParam) {
        try {
            currentUser = JSON.parse(decodeURIComponent(userParam));
            if (currentUser && currentUser.uid) {
                isTemporaryUser = Boolean(currentUser.temporary);
                isLoggedIn = !isTemporaryUser;
                if (isTemporaryUser) {
                    sessionStorage.setItem('zz_glasses_temp_user', JSON.stringify(currentUser));
                } else {
                    localStorage.setItem('zz_passport_user', JSON.stringify(currentUser));
                }
                sessionStorage.removeItem('zz_glasses_ignore_user_param');
                showUserDashboard();
            }
        } catch (e) {
            console.error('Parse user from URL failed:', e);
        }
    }

    if (!currentUser?.uid) {
        const tempUser = readTemporaryFittingUser();
        if (tempUser?.uid) {
            currentUser = tempUser;
            isTemporaryUser = true;
            isLoggedIn = false;
            showUserDashboard();
        }
    }

    if (!currentUser?.uid) {
        showAnonymousUser();
    }

    updateExportButtons();
    initOnboardFlow();
    carryUserToLinks();
}

function carryUserToLinks() {
    const rawUser = new URLSearchParams(window.location.search).get('user');
    const userPayload = rawUser || (currentUser?.uid ? encodeURIComponent(JSON.stringify(currentUser)) : '');
    if (!userPayload) return;
    document.querySelectorAll('.carry-user-link').forEach(link => {
        const url = new URL(link.getAttribute('href'), window.location.href);
        url.searchParams.set('user', userPayload);
        link.href = url.href;
    });
}

function initOnboardFlow() {
    if (!document.body.classList.contains('onboard-page')) return;
    renderOnboardStep();
}

function setOnboardStep(delta) {
    if (!document.body.classList.contains('onboard-page')) return;
    onboardStepIndex = Math.max(1, Math.min(4, onboardStepIndex + delta));
    renderOnboardStep();
    document.getElementById('onboard-flow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderOnboardStep() {
    const isOnboard = document.body.classList.contains('onboard-page');
    if (!isOnboard) return;
    document.body.dataset.onboardStep = String(onboardStepIndex);
    document.querySelectorAll('.onboard-step').forEach((step, index) => {
        const n = index + 1;
        step.classList.toggle('active', n === onboardStepIndex);
        step.classList.toggle('done', n < onboardStepIndex);
    });
    setText('onboard-step-label', `第 ${onboardStepIndex} 步 / 共 4 步`);

    const loginPrompt = document.getElementById('login-prompt');
    const dashboard = document.getElementById('user-dashboard');
    if (loginPrompt) loginPrompt.style.display = onboardStepIndex === 1 ? 'grid' : 'none';
    if (dashboard) dashboard.style.display = onboardStepIndex === 1 ? 'none' : 'block';
    renderOnboardLoginPrompt();
    renderOnboardStepCopy();

    const show = (selector, visible, display = 'block') => {
        document.querySelectorAll(selector).forEach(el => {
            el.style.display = visible ? display : 'none';
        });
    };
    show('.tryon-panel', onboardStepIndex === 2 || onboardStepIndex === 3);
    show('.analysis-card', onboardStepIndex === 4, 'grid');
    show('.preference-card', onboardStepIndex === 3);
    show('.recommendations-card', onboardStepIndex === 3);
    show('.analysis-report-card', onboardStepIndex === 4);

    if (onboardStepIndex === 2) {
        cameraGlassesEnabled = false;
        if (mediapipeCameraController) mediapipeCameraController.setDrawGlasses(false);
    }
    if (onboardStepIndex === 3) {
        cameraGlassesEnabled = true;
        if (mediapipeCameraController) {
            mediapipeCameraController.setDrawGlasses(true);
            mediapipeCameraController.setGlassesStyle(getCameraGlassesPayload(getSelectedFrame()));
        }
    }
    if (onboardStepIndex === 4) {
        captureLatestCameraSnapshot();
        stopMediapipeCamera();
        renderAnalysisReport(latestAnalysis || buildAnalysis({ source: 'manual' }));
        renderWishlistPanel();
    }
}

function renderOnboardStepCopy() {
    if (!document.body.classList.contains('onboard-page')) return;
    const copy = {
        2: {
            eyebrow: '第 2 步',
            title: '多角度采集：只记录脸部关键帧，不试戴镜框。',
            cardEyebrow: '用于校准尺寸',
            cardTitle: '多角度人脸采集',
            cameraEyebrow: '多角度采集',
            cameraTitle: '按提示完成正脸、左右、上下、张嘴和眨眼'
        },
        3: {
            eyebrow: '第 3 步',
            title: '摄像头试戴：实时切换一副镜框，看位置和大小。',
            cardEyebrow: '实时试戴',
            cardTitle: '摄像头镜框预览',
            cameraEyebrow: '摄像头试戴',
            cameraTitle: '打开摄像头后，可实时切换镜框并保存试戴图'
        },
        4: {
            eyebrow: '第 4 步',
            title: '报告与沟通：核对参数、心愿单和要发给商家的内容。',
            cardEyebrow: '采集完成',
            cardTitle: '配镜报告'
        }
    }[onboardStepIndex];
    if (!copy) return;
    const headingEyebrow = document.querySelector('.dashboard-heading .eyebrow');
    const headingTitle = document.querySelector('.dashboard-heading h2');
    const cardEyebrow = document.querySelector('.tryon-panel .card-heading .eyebrow');
    const cardTitle = document.querySelector('.tryon-panel .card-heading h3');
    const cameraEyebrow = document.querySelector('.camera-toolbar .eyebrow');
    const cameraTitle = document.querySelector('.camera-toolbar h4');
    if (headingEyebrow) headingEyebrow.textContent = copy.eyebrow;
    if (headingTitle) headingTitle.textContent = copy.title;
    if (cardEyebrow && copy.cardEyebrow) cardEyebrow.textContent = copy.cardEyebrow;
    if (cardTitle && copy.cardTitle) cardTitle.textContent = copy.cardTitle;
    if (cameraEyebrow && copy.cameraEyebrow) cameraEyebrow.textContent = copy.cameraEyebrow;
    if (cameraTitle && copy.cameraTitle) cameraTitle.textContent = copy.cameraTitle;
}

function renderOnboardLoginPrompt() {
    const prompt = document.getElementById('login-prompt');
    if (!prompt || !document.body.classList.contains('onboard-page')) return;
    if (currentUser?.uid) {
        const title = isTemporaryUser ? '临时配镜用户已启用' : '账号已连接';
        const actionText = isTemporaryUser ? '临时用户只保留在当前浏览器会话，可继续采集和试戴。登录后再保存到通行证账号。' : '后续采集、心愿单和报告会先缓存到本机；主站接口可用时再同步到服务器。';
        prompt.innerHTML = `
            <div>
                <p class="eyebrow">${title}</p>
                <h2>${escapeHtml(getDisplayUserName())}</h2>
                <p>${escapeHtml(actionText)}</p>
            </div>
            <div class="login-buttons">
                <button class="btn btn-secondary btn-large" onclick="${isTemporaryUser ? 'clearTemporaryFittingUser()' : 'logout()'}">${isTemporaryUser ? '清除临时用户' : '退出登录'}</button>
                <button class="btn btn-primary btn-large" onclick="setOnboardStep(1)">继续采集</button>
            </div>
        `;
        return;
    }

    prompt.innerHTML = `
        <div>
            <p class="eyebrow">第 1 步</p>
            <h2>登录、注册，或者先建一个临时配镜用户。</h2>
            <p>临时配镜用户只需要用户名，适合先试流程；正式保存、跨设备同步和商家长期沟通再登录通行证。</p>
        </div>
        <div class="login-buttons auth-choice-panel">
            <button class="btn btn-primary btn-large" onclick="goToLogin()">登录</button>
            <button class="btn btn-secondary btn-large" onclick="goToRegister()">注册</button>
            <form class="temp-user-form" onsubmit="createTemporaryFittingUser(event)">
                <label for="temp-fitting-name">临时配镜用户名</label>
                <div>
                    <input id="temp-fitting-name" type="text" maxlength="24" placeholder="如 小郑试戴">
                    <button class="btn btn-primary" type="submit">创建临时用户</button>
                </div>
            </form>
        </div>
    `;
}

async function loadFrameIndexCatalog() {
    try {
        const response = await fetch(FRAME_INDEX_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`frame index ${response.status}`);
        const data = await response.json();
        indexedFrameCatalog = Array.isArray(data.frames)
            ? data.frames.map(normalizeIndexedFrame).filter(Boolean)
            : [];
    } catch (error) {
        console.warn('Load frame index failed:', error);
        indexedFrameCatalog = [];
    }
}

function normalizeIndexedFrame(item) {
    if (!item?.id || !item?.image) return null;
    return {
        id: item.id,
        name: item.name || '未命名镜框',
        merchantId: item.merchantId || CHATGPT_MERCHANT.id,
        merchantName: item.merchantName || CHATGPT_MERCHANT.name,
        category: item.category || 'CHATGPT',
        type: item.type || '镜框',
        price: Number(item.price || 0),
        image: item.image,
        imageAlt: item.imageAlt || `${item.name || '镜框'}图片`,
        style: item.style || inferFrameStyle(item.name || item.type || ''),
        material: item.material || 'mixed',
        lensWidth: clampNumber(item.lensWidth || item.eyeSize || 51, 45, 58),
        bridgeSize: clampNumber(item.bridgeSize || item.bridgeWidth || 18, 14, 24),
        templeLength: clampNumber(item.templeLength || 145, 135, 155),
        overlayScale: clampNumber(item.overlayScale || 1, 0.72, 1.45),
        description: item.description || '',
        source: item.source || 'index'
    };
}

async function loadShopFrameCatalog() {
    const storedFrames = readAllLocalMerchantFrames();
    const localFrames = Array.isArray(window.ZZ_GLASSES_SHOP_CATALOG)
        ? window.ZZ_GLASSES_SHOP_CATALOG
        : [];
    shopFrameCatalog = [...localFrames, ...storedFrames].map(normalizeShopFrame).filter(Boolean);
}

function normalizeShopFrame(item) {
    if (!item) return null;
    const image = item.image || item.imageUrl || item.cover || '';
    return {
        id: item.id || `shop_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: item.name || '未命名镜框',
        merchantId: item.merchantId || item.sellerId || item.ownerUid || 'shop',
        merchantName: item.merchantName || item.storeName || item.sellerName || item.category || '铮铮商家',
        category: item.category || '眼镜商家',
        type: item.type || item.frameType || '镜框',
        price: Number(item.price || 0),
        image,
        imageAlt: item.imageAlt || `${item.name || '镜框'}图片`,
        style: item.style || item.frameStyle || inferFrameStyle(item.name || item.type || item.category),
        material: item.material || item.materialPreference || 'mixed',
        lensWidth: clampNumber(item.lensWidth || item.eyeSize || item.frameSize || 51, 45, 58),
        bridgeSize: clampNumber(item.bridgeSize || item.bridgeWidth || 18, 14, 24),
        templeLength: clampNumber(item.templeLength || 145, 135, 155),
        overlayScale: clampNumber(item.overlayScale || 1, 0.72, 1.45),
        description: item.description || item.reason || ''
    };
}

function readAllLocalMerchantFrames() {
    const frames = [];
    try {
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('zz_glasses_merchant_frames_')) continue;
            const value = JSON.parse(localStorage.getItem(key) || '[]');
            if (Array.isArray(value)) frames.push(...value);
        }
    } catch (error) {
        console.warn('Read local merchant frames failed:', error);
    }
    return frames;
}

function getFrameCatalog() {
    const builtin = indexedFrameCatalog.length ? indexedFrameCatalog : BUILTIN_FRAME_CATALOG;
    const catalog = [...builtin, ...shopFrameCatalog];
    const seen = new Set();
    return catalog.filter(frame => {
        const key = frame.id || frame.image || frame.name;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function ensureSelectedFrame() {
    const frame = getSelectedFrame();
    if (!selectedFrameId && frame) {
        selectedFrameId = frame.id;
        cameraGlassesStyle = getCameraGlassesPayload(frame);
        preloadSelectedFrameImage(frame);
    }
    return frame;
}

function getSelectedFrame() {
    const catalog = getFrameCatalog();
    return catalog.find(frame => frame.id === selectedFrameId) || catalog[0] || null;
}

function toAbsoluteAssetUrl(src = '') {
    if (!src) return '';
    try {
        return new URL(src, window.location.href).href;
    } catch (e) {
        return src;
    }
}

function withoutVersion(src = '') {
    return String(src).split('?')[0];
}

function preloadSelectedFrameImage(frame = getSelectedFrame()) {
    if (!frame?.image) return;
    const src = toAbsoluteAssetUrl(frame.image);
    const cached = selectedFrameImageCache.get(src);
    if (cached?.complete) {
        selectedFrameImage = cached;
        drawModelPreview(latestAnalysis);
        drawFaceOverlay();
        return;
    }
    const image = new Image();
    image.onload = () => {
        selectedFrameImageCache.set(src, image);
        if (frame.id === selectedFrameId) {
            selectedFrameImage = image;
            drawModelPreview(latestAnalysis);
            drawFaceOverlay();
        }
    };
    image.onerror = () => {
        const fallback = withoutVersion(toAbsoluteAssetUrl(frame.image));
        if (fallback && fallback !== image.src) image.src = fallback;
    };
    image.src = src;
}

function getCameraGlassesPayload(frame = getSelectedFrame()) {
    if (!frame) return cameraGlassesStyle;
    return {
        src: toAbsoluteAssetUrl(frame.image),
        scale: Number(frame.overlayScale || 1) * previewGlassesScale,
        offsetX: previewGlassesOffsetX,
        offsetY: previewGlassesOffsetY,
        rotation: previewGlassesRotation
    };
}

function renderFrameSelect() {
    const select = document.getElementById('mediapipe-glasses-style');
    if (!select) return;

    const selected = ensureSelectedFrame();
    select.innerHTML = getFrameCatalog().map(frame => (
        `<option value="${escapeHtml(frame.id)}">${escapeHtml(frame.name)}</option>`
    )).join('');
    if (selected) select.value = selected.id;
    renderTryOnStrip();
    updateWishlistControls();
}

function inferFrameStyle(text = '') {
    if (/猫眼|fashion/i.test(text)) return 'fashion';
    if (/飞行员|aviator/i.test(text)) return 'aviator';
    if (/透明|clear/i.test(text)) return 'clear';
    if (/玳瑁|tortoise/i.test(text)) return 'tortoise';
    if (/半框|钛|titanium/i.test(text)) return 'halfRim';
    if (/运动|TR90|sport/i.test(text)) return 'sport';
    if (/方|矩形|square|rectangle/i.test(text)) return 'square';
    return 'round';
}

function getCatalogLensWidth(style, serial = 1) {
    const base = {
        round: 48,
        square: 52,
        clear: 51,
        tortoise: 52,
        halfRim: 53,
        fashion: 50,
        sport: 54,
        aviator: 55
    }[style] || 51;
    return clampNumber(base + (serial % 3) - 1, 45, 56);
}

function getCatalogBridgeSize(style, serial = 1) {
    const base = {
        round: 19,
        square: 18,
        clear: 17,
        tortoise: 18,
        halfRim: 18,
        fashion: 17,
        sport: 16,
        aviator: 18
    }[style] || 18;
    return clampNumber(base + (serial % 2), 15, 22);
}

function showUserDashboard() {
    const loginPrompt = document.getElementById('login-prompt');
    const modeToggle = document.getElementById('mode-toggle');
    const dashboard = document.getElementById('user-dashboard');
    if (loginPrompt && !document.body.classList.contains('onboard-page')) loginPrompt.style.display = 'none';
    if (modeToggle) modeToggle.style.display = 'none';
    if (dashboard) dashboard.style.display = 'block';
    const heroLoginAction = document.getElementById('hero-login-action');
    if (heroLoginAction) {
        heroLoginAction.textContent = '已登录，开始保存';
        heroLoginAction.onclick = () => {
            document.getElementById('user-dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            showToast('已登录，完成识别后可保存或发送给商家');
        };
    }

    const userSection = document.getElementById('user-section');
    const nickname = currentUser?.nickname || currentUser?.username || '用户';
    const avatar = currentUser?.avatar || '👤';
    if (userSection) {
        userSection.innerHTML = `
            <span>${escapeHtml(nickname)}${isTemporaryUser ? ' · 临时' : ''}</span>
            <div class="user-avatar">${avatar.length <= 2 ? avatar : '👤'}</div>
            <button class="btn btn-secondary" onclick="${isTemporaryUser ? 'clearTemporaryFittingUser()' : 'logout()'}">${isTemporaryUser ? '清除' : '退出'}</button>
        `;
    }

    requestAnimationFrame(() => drawModelPreview(latestAnalysis));
}

function showAnonymousUser() {
    const userSection = document.getElementById('user-section');
    if (!userSection) return;
    userSection.innerHTML = `
        <span>匿名用户</span>
        <button class="btn btn-secondary" onclick="goToLogin()">登录</button>
        <button class="btn btn-primary" onclick="goToRegister()">注册</button>
    `;
}

function buildPassportUrl(page) {
    const redirect = new URL(window.location.href);
    redirect.searchParams.delete('passport_uid');
    const url = new URL(`https://zhengzhengstudio.cn/passport/${page}.html`);
    url.searchParams.set('redirect', redirect.href);
    url.searchParams.set('from', 'glasses');
    return url.href;
}

function goToLogin() {
    if (isLoggedIn) {
        document.getElementById('user-dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast('你已经登录了，可以直接试戴和保存结果');
        return;
    }
    window.location.href = buildPassportUrl('login');
}

function goToRegister() {
    if (isLoggedIn) {
        document.getElementById('user-dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast('你已经登录了');
        return;
    }
    window.location.href = buildPassportUrl('register');
}

function logout() {
    currentUser = null;
    isLoggedIn = false;
    isTemporaryUser = false;
    localStorage.removeItem('zz_passport_user');
    sessionStorage.removeItem(TEMP_USER_KEY);
    sessionStorage.setItem('zz_glasses_ignore_user_param', '1');
    const url = new URL(window.location.href);
    url.searchParams.delete('user');
    window.location.replace(url.pathname + url.search + url.hash);
}

function readTemporaryFittingUser() {
    try {
        const user = JSON.parse(sessionStorage.getItem(TEMP_USER_KEY) || 'null');
        return user?.temporary && user?.uid ? user : null;
    } catch (error) {
        console.warn('Parse temporary fitting user failed:', error);
        return null;
    }
}

function createTemporaryFittingUser(event) {
    event?.preventDefault();
    const input = document.getElementById('temp-fitting-name');
    const username = (input?.value || '').trim() || '临时配镜用户';
    const user = {
        uid: `temp_glasses_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        username,
        nickname: username,
        temporary: true,
        createdAt: new Date().toISOString(),
        source: 'glasses'
    };
    sessionStorage.setItem(TEMP_USER_KEY, JSON.stringify(user));
    sessionStorage.removeItem('zz_glasses_ignore_user_param');
    currentUser = user;
    isTemporaryUser = true;
    isLoggedIn = false;
    showUserDashboard();
    carryUserToLinks();
    renderOnboardStep();
    saveGlassesHomeState();
    showToast(`已创建临时配镜用户：${username}`);
}

function clearTemporaryFittingUser() {
    sessionStorage.removeItem(TEMP_USER_KEY);
    currentUser = null;
    isTemporaryUser = false;
    isLoggedIn = false;
    sessionStorage.setItem('zz_glasses_ignore_user_param', '1');
    const url = new URL(window.location.href);
    url.searchParams.delete('user');
    window.location.replace(url.pathname + url.search + url.hash);
}

function switchMode(mode) {
    if (mode === 'merchant') {
        window.location.href = 'merchant.html';
        return;
    }

    currentMode = mode;
    document.querySelectorAll('.mode-card').forEach(card => {
        card.classList.remove('active');
    });
    document.querySelector(`.${mode}-mode`).classList.add('active');

    document.querySelectorAll('.customer-section').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    document.querySelectorAll('.merchant-section').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });

    if (mode === 'customer') {
        document.querySelectorAll('.customer-section').forEach(el => {
            el.style.display = 'block';
            el.classList.add('active');
        });
    }
}

function startFaceModeling() {
    document.getElementById('modeling-modal').classList.add('active');
}

function rerunAnalysis() {
    if (latestCameraResult?.landmarks) {
        updateRecognition('正在从摄像头重新识别', 55, 70);
        captureMediapipeModel();
        return;
    }

    if (currentFaceFile) {
        updateRecognition('重新识别中', 42, 18);
        autoAnalyzeFace(currentFaceFile);
        return;
    }

    const manual = getManualInputs();
    if (manual.faceWidth || manual.pd) {
        updateRecognition('使用手动参数', 70, 55);
        applyModelResult({
            faceWidth: manual.faceWidth || 140,
            pd: manual.pd || 63,
            faceHeight: manual.faceHeight,
            bridgeWidth: manual.bridgeWidth,
            templeLength: manual.templeLength,
            source: 'manual'
        });
        updateRecognition('手动分析完成', latestAnalysis?.fitScore || 82, 100);
    } else {
        showToast('请先上传正面照片，或打开摄像头采集，或在手动参数里输入脸宽和瞳距');
    }
}

async function submitModeling() {
    const faceWidthInput = document.getElementById('face-width-input');
    const pdInput = document.getElementById('pd-input');
    const photoInput = document.getElementById('face-photo');

    let faceWidth = faceWidthInput.value;
    let pd = pdInput.value;

    if (photoInput.files && photoInput.files[0]) {
        try {
            const model = await analyzeWithFreeFaceModel(photoInput.files[0]);
            applyModelResult(model, buildLocalRecommendations(buildAnalysis(model)));
            showToast(getAnalysisSourceLabel(model.source));
            closeModal('modeling-modal');
            return;
        } catch (error) {
            console.warn('Modal MediaPipe analysis failed:', error);
            updateRecognition('MediaPipe 测算失败', 0, 0);
            showToast('MediaPipe 没有识别到清晰人脸，请换正脸照片或打开摄像头采集');
            return;
        }
    }

    if (faceWidth || pd) {
        applyModelResult({
            faceWidth: parseInt(faceWidth, 10) || undefined,
            pd: parseInt(pd, 10) || undefined,
            source: 'manual',
            calibrationNote: '当前只使用你输入的手动参数；如果要 MediaPipe 测算，请上传正脸照片或启动摄像头。'
        });
        showToast('已按手动参数校准');
        closeModal('modeling-modal');
        return;
    }

    showToast('请上传正脸照片，或先输入真实瞳距/脸宽作为标定');
}

function retakeFacePhoto() {
    currentFaceFile = null;
    latestTryOnSnapshotDataUrl = null;
    latestPreviewMeshPoints = [];
    const image = document.getElementById('face-preview-image');
    const overlay = document.getElementById('face-overlay-canvas');
    const placeholder = document.getElementById('face-preview-placeholder');
    const resultLayout = document.getElementById('face-result-layout');
    if (image) {
        image.removeAttribute('src');
        image.dataset.mirrored = '';
    }
    if (overlay) overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
    if (placeholder) placeholder.style.display = '';
    if (resultLayout) resultLayout.style.display = 'none';
    updateRecognition('等待重新拍摄', 0, 0);
    document.getElementById('face-photo-input')?.click();
}

function recalibrateCurrentFace() {
    rerunAnalysis();
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function applyModelResult(model = {}, recs = null) {
    const analysis = buildAnalysis(model);
    latestAnalysis = analysis;
    latestPreviewMeshPoints = Array.isArray(model.previewMeshPoints) && model.previewMeshPoints.length
        ? model.previewMeshPoints
        : analysis.meshPoints;

    setText('face-shape', analysis.faceShape);
    setText('face-width', `${analysis.faceWidth} mm`);
    setText('pd', `${analysis.pd} mm`);
    setText('rec-width', `${analysis.recommendedLensWidth} mm`);
    setText('bridge-fit', analysis.bridgeLabel);
    setText('temple-fit', analysis.templeLabel);
    setText('fit-score', `${analysis.fitScore}/100`);
    setText('preview-face-shape', analysis.faceShape);
    setText('preview-pd', `${analysis.pd} mm`);
    setText('preview-lens-width', `${analysis.recommendedLensWidth} mm`);

    const faceWidthInput = document.getElementById('face-width-input');
    const pdInput = document.getElementById('pd-input');
    const faceHeightInput = document.getElementById('face-height-input');
    const bridgeWidthInput = document.getElementById('bridge-width-input');
    const templeLengthInput = document.getElementById('temple-length-input');
    const quickFaceWidthInput = document.getElementById('quick-face-width-input');
    const quickPdInput = document.getElementById('quick-pd-input');
    const quickBridgeWidthInput = document.getElementById('quick-bridge-width-input');
    if (faceWidthInput) faceWidthInput.value = analysis.faceWidth;
    if (pdInput) pdInput.value = analysis.pd;
    if (faceHeightInput && !faceHeightInput.value) faceHeightInput.value = analysis.faceHeight;
    if (bridgeWidthInput && !bridgeWidthInput.value) bridgeWidthInput.value = analysis.bridgeWidth;
    if (templeLengthInput && !templeLengthInput.value) templeLengthInput.value = analysis.templeLength;
    if (quickFaceWidthInput && !quickFaceWidthInput.value) quickFaceWidthInput.value = analysis.faceWidth;
    if (quickPdInput && !quickPdInput.value) quickPdInput.value = analysis.pd;
    if (quickBridgeWidthInput && !quickBridgeWidthInput.value) quickBridgeWidthInput.value = analysis.bridgeWidth;

    renderAnalysisReport(analysis);
    updateExportButtons();
    recommendationPage = 0;
    renderRecommendations(recs && recs.length ? recs : buildLocalRecommendations(analysis));
    showFaceResultPanel();
    drawFaceOverlay();
    updateRecognition(getAnalysisSourceLabel(analysis.source), analysis.confidence || analysis.fitScore, 100);
    saveGlassesHomeState();
    getTryOnSnapshotDataUrl().then(dataUrl => {
        if (dataUrl && latestAnalysis === analysis) renderAnalysisReport(analysis);
    }).catch(error => console.warn('Build try-on snapshot failed:', error));
}

function buildAnalysis(model = {}) {
    const manual = getManualInputs();
    const preferences = getPreferences();
    const faceWidth = clampNumber(model.faceWidth || manual.faceWidth || 140, 118, 170);
    const pd = clampNumber(model.pd || manual.pd || Math.round(faceWidth * 0.45), 54, 76);
    const faceHeight = clampNumber(model.faceHeight || manual.faceHeight || Math.round(faceWidth * 1.32), 155, 230);
    const bridgeWidth = clampNumber(model.bridgeWidth || manual.bridgeWidth || Math.round(faceWidth * 0.13), 14, 25);
    const templeLength = clampNumber(model.templeLength || manual.templeLength || (faceWidth > 150 ? 150 : 145), 135, 155);
    const faceShape = model.faceShape || inferFaceShape(faceWidth, faceHeight);
    const recommendedBridgeWidth = clampNumber(model.recommendedBridgeWidth || bridgeWidth, 15, 22);
    const recommendedLensWidth = getRecommendedLensWidth(pd, recommendedBridgeWidth);
    const recommendedWidth = clampNumber(model.recommendedWidth || Math.round(recommendedLensWidth * 2 + recommendedBridgeWidth + 8), 118, 178);
    const framePd = recommendedLensWidth + recommendedBridgeWidth;
    const decentration = Number(((framePd - pd) / 2).toFixed(1));
    const decentrationLabel = Math.abs(decentration) <= 3 ? '理想范围' : Math.abs(decentration) <= 4 ? '可复核' : '不建议';
    const frameSizeLabel = recommendedLensWidth <= 50 ? '小框' : recommendedLensWidth <= 52 ? '中框' : '大框';
    const lensHeight = clampNumber(Math.round(faceHeight * 0.22), 34, 48);
    const bridgeLabel = bridgeWidth <= 16 ? '窄鼻梁：优先可调鼻托' : bridgeWidth >= 22 ? '宽鼻梁：桥位需放宽' : '标准鼻梁：常规鼻托可用';
    const templeLabel = faceWidth >= 150 ? `${templeLength} mm，注意防夹头` : `${templeLength} mm，建议轻量镜腿`;
    const frameDelta = Math.abs(decentration);
    const pdBalance = Math.abs(pd - faceWidth * 0.45);
    const comfortPenalty = preferences.comfort === 'none' ? 0 : 3;
    const fitScore = clampNumber(Math.round(94 - frameDelta * 4 - pdBalance * 0.7 - comfortPenalty), 72, 98);
    const riskLevel = fitScore >= 90 ? '低风险' : fitScore >= 82 ? '需确认' : '建议定制';
    const confidence = model.confidence ? clampNumber(model.confidence, 0, 100) : null;

    return {
        ...preferences,
        faceShape,
        faceWidth,
        pd,
        faceHeight,
        bridgeWidth,
        templeLength,
        recommendedWidth,
        recommendedLensWidth,
        recommendedBridgeWidth,
        framePd,
        decentration,
        decentrationLabel,
        frameSizeLabel,
        lensHeight,
        bridgeLabel,
        templeLabel,
        fitScore,
        riskLevel,
        source: model.source || 'local',
        confidence,
        customizationScale: model.customizationScale || 1,
        customizationNote: model.customizationNote || '',
        calibrationNote: model.calibrationNote || '',
        qualityIssues: Array.isArray(model.qualityIssues) ? model.qualityIssues : [],
        meshPoints: Array.isArray(model.meshPoints) ? model.meshPoints : [],
        previewMeshPoints: Array.isArray(model.previewMeshPoints) ? model.previewMeshPoints : []
    };
}

function getRecommendedLensWidth(pd, bridgeSize) {
    const ideal = Math.round(pd - bridgeSize + 6);
    if (pd <= 60) return clampNumber(ideal, 45, 50);
    if (pd <= 63) return clampNumber(ideal, 49, 52);
    return clampNumber(ideal, 52, 56);
}

function getManualInputs() {
    return {
        faceWidth: getNumberValue('quick-face-width-input') || getNumberValue('face-width-input'),
        pd: getNumberValue('quick-pd-input') || getNumberValue('pd-input'),
        faceHeight: getNumberValue('face-height-input'),
        bridgeWidth: getNumberValue('quick-bridge-width-input') || getNumberValue('bridge-width-input'),
        templeLength: getNumberValue('temple-length-input')
    };
}

function getPreferences() {
    return {
        style: document.getElementById('style-preference')?.value || 'daily',
        material: document.getElementById('material-preference')?.value || 'mixed',
        usage: document.getElementById('usage-preference')?.value || 'screen',
        comfort: document.getElementById('comfort-preference')?.value || 'nose'
    };
}

function getPrescriptionKey(uid = getCurrentUserId()) {
    return `zz_glasses_prescription_${uid || 'anonymous'}`;
}

function getPrescriptionData() {
    const fields = [
        'od-sphere', 'od-cylinder', 'od-axis',
        'os-sphere', 'os-cylinder', 'os-axis',
        'rx-pd', 'rx-height', 'rx-lens-type', 'rx-note'
    ];
    const data = {};
    fields.forEach(id => {
        data[id] = document.getElementById(id)?.value?.trim() || '';
    });
    data.updatedAt = new Date().toISOString();
    return data;
}

function hasPrescriptionData(data = getPrescriptionData()) {
    return Object.entries(data).some(([key, value]) => key !== 'updatedAt' && Boolean(value));
}

function getSavedPrescriptionData() {
    try {
        return JSON.parse(localStorage.getItem(getPrescriptionKey()) || '{}') || {};
    } catch (error) {
        return {};
    }
}

function applySavedPrescription() {
    const data = getSavedPrescriptionData();
    Object.entries(data).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input && id !== 'updatedAt') input.value = value || '';
    });
    updatePrescriptionSummary(data);
}

function savePrescriptionData(show = true) {
    const data = getPrescriptionData();
    localStorage.setItem(getPrescriptionKey(), JSON.stringify(data));
    updatePrescriptionSummary(data);
    saveGlassesHomeState();
    if (show) queueServerSync('prescription', data);
    if (show) showToast(hasPrescriptionData(data) ? '验光单已保存' : '验光单已清空');
    return data;
}

function clearPrescriptionData() {
    localStorage.removeItem(getPrescriptionKey());
    ['od-sphere', 'od-cylinder', 'od-axis', 'os-sphere', 'os-cylinder', 'os-axis', 'rx-pd', 'rx-height', 'rx-lens-type', 'rx-note'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
    updatePrescriptionSummary({});
    saveGlassesHomeState();
    showToast('已清空验光单');
}

function updatePrescriptionSummary(data = getSavedPrescriptionData()) {
    const summary = document.getElementById('prescription-summary');
    if (!summary) return;
    summary.textContent = hasPrescriptionData(data)
        ? buildPrescriptionSummary(data)
        : '选填。可以先不填，正式下单前再把医院验光数据补给商家。';
}

function buildPrescriptionSummary(data = getSavedPrescriptionData()) {
    const right = [data['od-sphere'], data['od-cylinder'], data['od-axis'] ? `轴 ${data['od-axis']}` : ''].filter(Boolean).join(' / ');
    const left = [data['os-sphere'], data['os-cylinder'], data['os-axis'] ? `轴 ${data['os-axis']}` : ''].filter(Boolean).join(' / ');
    const meta = [
        data['rx-pd'] ? `瞳距 ${data['rx-pd']} mm` : '',
        data['rx-height'] ? `瞳高 ${data['rx-height']} mm` : '',
        data['rx-lens-type'] ? `镜片 ${data['rx-lens-type']}` : ''
    ].filter(Boolean).join('，');
    return [
        right ? `右眼 ${right}` : '',
        left ? `左眼 ${left}` : '',
        meta,
        data['rx-note'] || ''
    ].filter(Boolean).join('；') || '已保存验光单草稿';
}

function getNumberValue(id) {
    const value = parseInt(document.getElementById(id)?.value, 10);
    return Number.isFinite(value) ? value : null;
}

function clampNumber(value, min, max) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

function inferFaceShape(faceWidth, faceHeight) {
    const ratio = faceHeight / faceWidth;
    if (ratio > 1.45) return '长方形';
    if (ratio < 1.22) return '圆形';
    if (faceWidth > 150) return '方形';
    return '椭圆形';
}

function renderAnalysisReport(analysis) {
    const report = document.getElementById('analysis-report');
    if (!report) return;

    const materialText = {
        mixed: '板材或金属均可',
        titanium: '优先钛/β钛，减轻鼻梁压力',
        acetate: '优先板材，造型更稳定',
        tr90: '优先 TR90，轻量抗压'
    }[analysis.material];
    const usageText = {
        screen: '长时间看屏幕：建议轻量框和防滑鼻托',
        outdoor: '户外通勤：建议稳定鼻托和耐磨材质',
        reading: '阅读学习：建议视野更大的镜片高度',
        sports: '轻运动：建议防滑镜腿和弹性材质'
    }[analysis.usage];
    const comfortText = {
        nose: '鼻梁敏感：优先可调鼻托，避免重板材',
        temple: '太阳穴敏感：镜框总宽宁可略宽，不要夹头',
        slide: '容易下滑：鼻托、防滑脚套和重量要重点确认',
        none: '暂无明显敏感点：按风格和材质偏好筛选即可'
    }[analysis.comfort];
    const sourceText = getAnalysisSourceLabel(analysis.source);
    const calibrationText = analysis.calibrationNote || (analysis.source === 'openai_vision'
        ? 'AI 已完成照片几何估算；若要做定制镜框，建议用真实瞳距或参考尺再校准一次。'
        : analysis.source === 'mediapipe_free'
            ? 'MediaPipe 已完成 468 点关键点测算；如要做定制镜框，建议补充真实瞳距或参考尺做比例校准。'
        : '当前为非 OpenAI 视觉识别结果；正式下单前建议补充正脸照片或人工复核。');
    const issueText = analysis.qualityIssues.length
        ? analysis.qualityIssues.map(escapeHtml).join('、')
        : '照片质量可用';

    report.innerHTML = `
        <div class="report-score">
            <strong>${analysis.fitScore}</strong>
            <span>综合适配评分</span>
            <em>${analysis.riskLevel}</em>
        </div>
        ${latestTryOnSnapshotDataUrl ? `
            <div class="report-photo">
                <img src="${latestTryOnSnapshotDataUrl}" alt="本次真实试戴图">
                <span>本次真实试戴图会一起进入报告和长按保存图片。</span>
            </div>
        ` : ''}
        <div class="report-grid">
            <div><span>当前用户</span><strong>${escapeHtml(getDisplayUserName())}</strong></div>
            <div><span>建议镜圈宽度</span><strong>${analysis.recommendedLensWidth} mm · ${analysis.frameSizeLabel}</strong></div>
            <div><span>推荐鼻梁宽</span><strong>${analysis.recommendedBridgeWidth} mm</strong></div>
            <div><span>移心量</span><strong>${analysis.decentration} mm · ${analysis.decentrationLabel}</strong></div>
            <div><span>建议镜片高</span><strong>${analysis.lensHeight}-${analysis.lensHeight + 4} mm</strong></div>
            <div><span>鼻梁策略</span><strong>${analysis.bridgeLabel}</strong></div>
            <div><span>镜腿策略</span><strong>${analysis.templeLabel}</strong></div>
            <div><span>识别来源</span><strong>${sourceText}</strong></div>
            <div><span>视觉置信度</span><strong>${analysis.confidence ? `${analysis.confidence}%` : '待校准'}</strong></div>
            <div><span>定制校准</span><strong>${analysis.customizationScale && analysis.customizationScale !== 1 ? `多角度系数 ${analysis.customizationScale}` : '等待多角度采集'}</strong></div>
        </div>
        <div class="report-notes">
            <p>${materialText}</p>
            <p>${usageText}</p>
            <p>${comfortText}</p>
            ${analysis.customizationNote ? `<p>${escapeHtml(analysis.customizationNote)}</p>` : ''}
            <p>${escapeHtml(calibrationText)}</p>
            <p>照片检测：${issueText}</p>
        </div>
    `;
}

function buildLocalRecommendations(analysis) {
    const frames = getFrameCatalog();
    const preferred = frames
        .map(frame => ({ frame, score: scoreFrameForAnalysis(frame, analysis) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);

    return preferred.map(({ frame, score }, index) => ({
        ...frame,
        score: Math.max(80, Math.min(98, score - index)),
        specs: `镜圈 ${frame.lensWidth || analysis.recommendedLensWidth} mm / 鼻梁 ${frame.bridgeSize || analysis.recommendedBridgeWidth} mm / 移心 ${getFrameDecentration(frame, analysis)} mm`,
        reason: buildRecommendationReason(frame.name, analysis, index, frame)
    }));
}

function scoreFrameForAnalysis(frame, analysis) {
    let score = analysis.fitScore || 84;
    const decentration = Math.abs(getFrameDecentration(frame, analysis));
    score -= decentration > 3 ? (decentration - 3) * 7 : decentration;
    score -= Math.abs((frame.lensWidth || analysis.recommendedLensWidth) - analysis.recommendedLensWidth) * 2;
    if (analysis.material === 'titanium' && frame.material === 'titanium') score += 7;
    if (analysis.material === 'tr90' && frame.material === 'tr90') score += 7;
    if (analysis.material === 'acetate' && frame.material === 'acetate') score += 5;
    if (analysis.style === 'fashion' && frame.style === 'fashion') score += 8;
    if (analysis.style === 'business' && ['square', 'halfRim'].includes(frame.style)) score += 6;
    if (analysis.style === 'light' && ['round', 'halfRim', 'sport'].includes(frame.style)) score += 6;
    if (analysis.faceShape === '圆形' && ['square', 'tortoise', 'sport'].includes(frame.style)) score += 6;
    if (analysis.faceShape === '方形' && ['round', 'aviator'].includes(frame.style)) score += 6;
    return score;
}

function getFrameDecentration(frame, analysis) {
    const lensWidth = frame.lensWidth || analysis.recommendedLensWidth || 51;
    const bridgeSize = frame.bridgeSize || analysis.recommendedBridgeWidth || 18;
    const pd = analysis.pd || 63;
    return Number(((lensWidth + bridgeSize - pd) / 2).toFixed(1));
}

function buildRecommendationReason(name, analysis, index, frame = {}) {
    const shapeReason = {
        '圆形': '建议用略有棱角的框型增强脸部线条',
        '方形': '建议用圆角或椭圆框柔化脸部轮廓',
        '椭圆形': '脸型兼容度高，可优先按风格选择',
        '心形': '建议下缘更轻的框型平衡额头宽度',
        '长方形': '建议镜片高度略大，缩短纵向视觉比例'
    }[analysis.faceShape] || '按当前参数匹配镜圈宽度与舒适度';
    const decentration = getFrameDecentration(frame, analysis);
    const comfort = Math.abs(decentration) <= 3 ? '移心量在理想范围内。' : '移心量需要验光师复核。';
    return `${shapeReason} ${name} 来自 ${frame.merchantName || 'CHATGPT'}，镜圈宽度 ${frame.lensWidth || analysis.recommendedLensWidth} mm，鼻梁 ${frame.bridgeSize || analysis.recommendedBridgeWidth} mm，${comfort}`;
}

function refreshLocalAnalysis() {
    if (!latestAnalysis) return;
    applyModelResult({
        faceShape: latestAnalysis.faceShape,
        faceWidth: latestAnalysis.faceWidth,
        pd: latestAnalysis.pd,
        recommendedWidth: latestAnalysis.recommendedWidth,
        faceHeight: latestAnalysis.faceHeight,
        bridgeWidth: latestAnalysis.bridgeWidth,
        templeLength: latestAnalysis.templeLength,
        source: 'preference_refresh'
    });
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setTextEverywhere(id, value) {
    document.querySelectorAll(`#${id}`).forEach(el => {
        el.textContent = value;
    });
}

function applyTextScale(value = appTextScale) {
    appTextScale = Math.max(0.9, Math.min(1.14, Number(value) || 1));
    document.documentElement.style.setProperty('--glasses-text-scale', appTextScale.toFixed(2));
    localStorage.setItem('zz_glasses_text_scale', String(appTextScale));
    setTextEverywhere('text-scale-value', `${Math.round(appTextScale * 100)}%`);
}

function changeTextScale(delta) {
    applyTextScale(appTextScale + delta);
}

function getAnalysisSourceLabel(source) {
    const labels = {
        openai_vision: 'OpenAI 视觉识别完成',
        mediapipe_free: 'MediaPipe 关键点测算完成',
        face_analysis_api: '本地 face-api 识别完成',
        face3d_api: '脸型识别完成',
        api: 'AI 分析完成',
        local_preview: '等待 MediaPipe 测算',
        local_estimate: '本地估算完成',
        manual: '手动参数完成',
        preference_refresh: '偏好已更新',
        fallback: '降级估算完成',
        local: '本地预估完成'
    };
    return labels[source] || '识别完成';
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function updateRecognition(status, confidence, progress) {
    setText('recognition-status', status);
    setText('recognition-confidence', confidence ? `${Math.round(confidence)}%` : '-');
    setText('recognition-progress', `${Math.max(0, Math.min(100, Math.round(progress || 0)))}%`);
    const state = document.getElementById('model-state');
    if (state) {
        state.textContent = status;
        state.dataset.state = progress >= 100 ? 'done' : progress > 0 ? 'running' : 'idle';
    }
}

async function loadMediapipeApi() {
    if (!mediapipeApiPromise) {
        mediapipeApiPromise = import('./mediapipe-camera.mjs?v=20260519-serverchat1');
    }
    return mediapipeApiPromise;
}

async function preloadMediapipe() {
    try {
        const api = await loadMediapipeApi();
        preloadedVideoLandmarker = await api.getFaceLandmarker('VIDEO');
    } catch (error) {
        console.warn('MediaPipe preload failed:', error);
        preloadedVideoLandmarker = null;
    }
}

async function loadFreeFaceLandmarker() {
    if (!freeFaceLandmarkerPromise) {
        freeFaceLandmarkerPromise = loadMediapipeApi().then(api => api.getFaceLandmarker('IMAGE'));
    }

    return freeFaceLandmarkerPromise;
}

async function analyzeWithFreeFaceModel(file) {
    updateRecognition('加载 MediaPipe 模型', 18, 18);
    const [api, imageData] = await Promise.all([loadMediapipeApi(), fileToBase64(file)]);
    const image = await loadImageElement(imageData);

    updateRecognition('关键点识别中', 56, 55);
    const result = await api.detectFaceFromImage(image);
    const landmarks = result.landmarks;
    if (!landmarks || landmarks.length < 50) {
        throw new Error('未识别到清晰正脸关键点');
    }

    return convertLandmarksToAnalysis(landmarks, image);
}

function loadImageElement(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
}

function convertLandmarksToAnalysis(landmarks, image) {
    const leftEye = getEyeCenter(landmarks, 'left');
    const rightEye = getEyeCenter(landmarks, 'right');
    const leftCheek = landmarks[234] || landmarks[93];
    const rightCheek = landmarks[454] || landmarks[323];
    const forehead = landmarks[10];
    const chin = landmarks[152];
    const noseLeft = landmarks[129] || landmarks[64];
    const noseRight = landmarks[358] || landmarks[294];
    const quality = getLandmarkQuality(landmarks, image, leftEye, rightEye);

    const pdPx = distance2d(leftEye, rightEye, image);
    const faceWidthPx = distance2d(leftCheek, rightCheek, image);
    const faceHeightPx = distance2d(forehead, chin, image);
    const nosePx = distance2d(noseLeft, noseRight, image);
    if (!pdPx || !faceWidthPx || !faceHeightPx) {
        throw new Error('关键点质量不足');
    }

    const manual = getManualInputs();
    const defaultPd = estimateDefaultPdFromGeometry(pdPx, faceWidthPx, faceHeightPx);
    let calibrationScale = defaultPd / pdPx;
    let calibrationNote = `未输入真实瞳距，系统按面部比例暂估瞳距 ${defaultPd} mm。这个尺寸只能用于试戴预览，配镜/定制前请用验光单瞳距校准。`;
    let confidence = quality.confidence;

    if (manual.pd) {
        calibrationScale = manual.pd / pdPx;
        calibrationNote = `已使用你输入的瞳距 ${manual.pd} mm 做比例校准，脸宽、鼻梁和镜圈建议会跟随这个标尺换算。`;
        confidence = Math.min(96, confidence + 14);
    } else if (manual.faceWidth) {
        calibrationScale = manual.faceWidth / faceWidthPx;
        calibrationNote = `已使用你输入的脸宽 ${manual.faceWidth} mm 做比例校准；建议再补充真实瞳距，让镜圈宽度和移心量更准确。`;
        confidence = Math.min(92, confidence + 8);
    }

    const faceWidth = clampNumber(Math.round(faceWidthPx * calibrationScale), 118, 170);
    const faceHeight = clampNumber(Math.round(faceHeightPx * calibrationScale), 155, 230);
    const pd = clampNumber(Math.round(pdPx * calibrationScale), 54, 76);
    const bridgeWidth = clampNumber(Math.round(nosePx * calibrationScale * 0.42), 14, 25);
    const templeLength = faceWidth >= 150 ? 150 : 145;
    const recommendedLensWidth = getRecommendedLensWidth(pd, clampNumber(bridgeWidth, 15, 22));
    const qualityIssues = [
        ...(manual.pd ? [] : ['未输入真实瞳距，毫米尺寸为估算值，镜圈宽度和移心量需复核']),
        ...quality.issues
    ];

    return {
        source: 'mediapipe_free',
        faceShape: inferFaceShape(faceWidth, faceHeight),
        faceWidth,
        pd,
        faceHeight,
        bridgeWidth,
        templeLength,
        recommendedWidth: clampNumber(recommendedLensWidth * 2 + bridgeWidth + 8, 118, 178),
        confidence: clampNumber(confidence, 0, 100),
        landmarks: {
            leftEye: toUnitPoint(leftEye),
            rightEye: toUnitPoint(rightEye),
            nose: toUnitPoint(landmarks[1] || landmarks[4]),
            chin: toUnitPoint(chin)
        },
        meshPoints: landmarks.map(point => ({
            x: Number(point.x.toFixed(4)),
            y: Number(point.y.toFixed(4)),
            z: Number((point.z || 0).toFixed(4))
        })),
        calibrationNote
    };
}

function estimateDefaultPdFromGeometry(pdPx, faceWidthPx, faceHeightPx) {
    const faceToPd = faceWidthPx / Math.max(pdPx, 1);
    const widthHeight = faceWidthPx / Math.max(faceHeightPx, 1);
    let pd = 62;
    if (faceToPd > 2.28) pd -= 2;
    if (faceToPd < 2.08) pd += 2;
    if (widthHeight > 0.78) pd -= 1;
    if (widthHeight < 0.68) pd += 1;
    return clampNumber(pd, 58, 66);
}

function getEyeCenter(landmarks, side) {
    const iris = side === 'left' ? [468, 469, 470, 471, 472] : [473, 474, 475, 476, 477];
    const irisPoints = iris.map(index => landmarks[index]).filter(Boolean);
    if (irisPoints.length >= 4) return averageRawLandmarks(irisPoints);
    return averageLandmarks(landmarks, side === 'left' ? [33, 133, 159, 145] : [362, 263, 386, 374]);
}

function getLandmarkQuality(landmarks, image, leftEye, rightEye) {
    const imageWidth = image?.naturalWidth || image?.videoWidth || image?.width || 1;
    const imageHeight = image?.naturalHeight || image?.videoHeight || image?.height || 1;
    const leftCheek = landmarks[234] || landmarks[93];
    const rightCheek = landmarks[454] || landmarks[323];
    const forehead = landmarks[10];
    const chin = landmarks[152];
    const nose = landmarks[1] || landmarks[4];
    const issues = [];
    let confidence = 84;

    const faceWidthPx = distance2d(leftCheek, rightCheek, image);
    const faceHeightPx = distance2d(forehead, chin, image);
    const pdPx = distance2d(leftEye, rightEye, image);
    const roll = Math.abs((rightEye.y - leftEye.y) / Math.max(0.001, rightEye.x - leftEye.x));
    const faceCenterX = ((leftCheek?.x || 0) + (rightCheek?.x || 0)) / 2;
    const yaw = Math.abs(((nose?.x || faceCenterX) - faceCenterX) / Math.max(0.001, Math.abs((rightCheek?.x || 0) - (leftCheek?.x || 0))));
    const faceRatio = faceWidthPx / Math.max(faceHeightPx, 1);

    if (faceWidthPx < imageWidth * 0.18) {
        issues.push('脸在画面里偏小，建议靠近一点再采集');
        confidence -= 10;
    }
    if (yaw > 0.075) {
        issues.push('正脸角度不够，建议看镜头重新采集');
        confidence -= 8;
    }
    if (roll > 0.055) {
        issues.push('头部有倾斜，建议保持双眼水平');
        confidence -= 6;
    }
    if (pdPx / Math.max(faceWidthPx, 1) < 0.38 || pdPx / Math.max(faceWidthPx, 1) > 0.52) {
        issues.push('眼距比例异常，可能受角度或遮挡影响');
        confidence -= 8;
    }
    if (faceRatio < 0.55 || faceRatio > 0.9) {
        issues.push('脸部框比例异常，建议换光线均匀的正脸画面');
        confidence -= 6;
    }

    return {
        confidence: clampNumber(confidence, 45, 96),
        issues,
        yaw,
        roll,
        faceWidthPx,
        pdPx
    };
}

function averageLandmarks(landmarks, indices) {
    const valid = indices.map(index => landmarks[index]).filter(Boolean);
    return averageRawLandmarks(valid);
}

function averageRawLandmarks(valid) {
    if (!valid.length) return { x: 0, y: 0, z: 0 };
    const total = valid.reduce((acc, point) => ({
        x: acc.x + point.x,
        y: acc.y + point.y,
        z: acc.z + (point.z || 0)
    }), { x: 0, y: 0, z: 0 });
    return {
        x: total.x / valid.length,
        y: total.y / valid.length,
        z: total.z / valid.length
    };
}

function distance2d(a, b, image) {
    if (!a || !b) return 0;
    const imageWidth = image.naturalWidth || image.videoWidth || image.width || 1;
    const imageHeight = image.naturalHeight || image.videoHeight || image.height || 1;
    const dx = (a.x - b.x) * imageWidth;
    const dy = (a.y - b.y) * imageHeight;
    return Math.sqrt(dx * dx + dy * dy);
}

function toUnitPoint(point) {
    return {
        x: Number((point?.x || 0).toFixed(4)),
        y: Number((point?.y || 0).toFixed(4))
    };
}

async function startMediapipeCamera() {
    const video = document.getElementById('mediapipe-video');
    const canvas = document.getElementById('mediapipe-overlay');
    if (!video || !canvas) return;

    try {
        if (mediapipeCameraController) {
            mediapipeCameraController.stop();
            mediapipeCameraController = null;
        }

        updateCameraStatus('加载模型');
        updateRecognition('摄像机启动中', 20, 18);
        const api = await loadMediapipeApi();
        const landmarker = preloadedVideoLandmarker || await api.getFaceLandmarker('VIDEO');
        mediapipeCameraController = await api.createMediapipeCamera({
            video,
            canvas,
            facingMode: cameraFacingMode,
            drawMesh: cameraMeshEnabled,
            drawGlasses: cameraGlassesEnabled,
            glassesStyle: cameraGlassesStyle,
            landmarker,
            onStatus(status) {
                updateCameraStatus({
                    loading: '加载模型',
                    running: '实时识别中',
                    stopped: '已停止'
                }[status] || status);
            },
            onResult(result) {
                latestCameraResult = result;
                const now = performance.now();
                const shouldUpdateUi = now - lastCameraUiUpdateAt > 160;
                if (result?.landmarks) {
                    const quality = trackCameraSample(result, video);
                    if (shouldUpdateUi) {
                        lastCameraUiUpdateAt = now;
                        updateRecognition('摄像机实时识别', quality.confidence, 72);
                        updateActionMetrics(result.action);
                    }
                    handleActionCaptureFrame(result);
                } else if (shouldUpdateUi) {
                    lastCameraUiUpdateAt = now;
                    updateRecognition('请把脸放入画面', 18, 28);
                    updateActionMetrics(null);
                }
            }
        });
        showToast('MediaPipe 摄像机已启动');
        updateCameraActionGuide('准备开始', '保持脸在画面中央', '点击“多角度采集”，按提示完成正脸、左右、上下、张嘴和眨眼。');
    } catch (error) {
        console.error('Mediapipe camera failed:', error);
        updateCameraStatus('摄像机不可用');
        updateRecognition('摄像机不可用', 0, 0);
        showToast('无法打开摄像头，请检查权限或浏览器支持');
    }
}

function stopMediapipeCamera() {
    captureLatestCameraSnapshot();
    if (mediapipeCameraController) {
        mediapipeCameraController.stop();
        mediapipeCameraController = null;
    }
    latestCameraResult = null;
    latestCameraSamples = [];
    updateCameraStatus('已停止');
}

function trackCameraSample(result, image) {
    const leftEye = getEyeCenter(result.landmarks, 'left');
    const rightEye = getEyeCenter(result.landmarks, 'right');
    const quality = getLandmarkQuality(result.landmarks, image, leftEye, rightEye);
    const isStableFront = quality.confidence >= 68 && Math.abs(result.action?.yaw || 0) < 0.06 && Math.abs(result.action?.pitch || 0.34) < 0.42;
    if (isStableFront) {
        latestCameraSamples.push({
            landmarks: cloneLandmarks(result.landmarks),
            quality,
            capturedAt: performance.now()
        });
        latestCameraSamples = latestCameraSamples.slice(-CAMERA_SAMPLE_LIMIT);
    }
    return quality;
}

function getStableCameraLandmarks() {
    const goodSamples = latestCameraSamples
        .filter(sample => sample.quality?.confidence >= 68)
        .slice(-8)
        .map(sample => sample.landmarks);
    if (goodSamples.length < 3) return null;
    return averageLandmarkFrames(goodSamples);
}

function cloneLandmarks(landmarks = []) {
    return landmarks.map(point => ({ x: point.x, y: point.y, z: point.z || 0 }));
}

function averageLandmarkFrames(frames = []) {
    const validFrames = frames.filter(frame => Array.isArray(frame) && frame.length);
    if (!validFrames.length) return null;
    const length = Math.min(...validFrames.map(frame => frame.length));
    return Array.from({ length }, (_, index) => {
        const total = validFrames.reduce((acc, frame) => {
            const point = frame[index] || {};
            acc.x += point.x || 0;
            acc.y += point.y || 0;
            acc.z += point.z || 0;
            return acc;
        }, { x: 0, y: 0, z: 0 });
        return {
            x: total.x / validFrames.length,
            y: total.y / validFrames.length,
            z: total.z / validFrames.length
        };
    });
}

function captureMediapipeModel() {
    if (!latestCameraResult?.landmarks) {
        showToast('还没有识别到清晰人脸');
        return;
    }

    const video = document.getElementById('mediapipe-video');
    const stableLandmarks = getStableCameraLandmarks() || latestCameraResult.landmarks;
    const frameLandmarks = latestCameraResult.landmarks;
    const sampleCount = latestCameraSamples.length;

    let model;
    try {
        model = convertLandmarksToAnalysis(stableLandmarks, video);
    } catch (error) {
        console.warn('convertLandmarksToAnalysis failed, using raw landmarks:', error);
        model = buildAnalysis({
            faceWidth: 140,
            faceHeight: 185,
            pd: 63,
            bridgeWidth: 18,
            templeLength: 145,
            confidence: 60,
            calibrationNote: '关键点质量不足，使用默认值。建议调整光线或靠近摄像头。'
        });
    }

    setPreviewFromCameraFrame(video);
    applyModelResult({
        ...model,
        source: 'mediapipe_free',
        previewMeshPoints: frameLandmarks,
        confidence: Math.min(98, (model.confidence || 80) + Math.min(sampleCount, 8)),
        calibrationNote: `${model.calibrationNote} 已从 ${sampleCount || 1} 帧实时画面取稳定正脸均值；如需更稳，可继续做一次多角度采集。`
    }, buildLocalRecommendations(buildAnalysis(model)));
    updateRecognition('单张生成完成', model.confidence, 100);
    showToast('已用摄像机画面生成配镜参数');
}

async function startActionCapture() {
    if (!mediapipeCameraController) {
        await startMediapipeCamera();
        if (!mediapipeCameraController) return;
    }
    cameraGlassesEnabled = false;
    if (mediapipeCameraController) mediapipeCameraController.setDrawGlasses(false);

    faceActionCapture = {
        active: true,
        currentIndex: 0,
        frames: [],
        holdCount: 0,
        lastMatchedStep: null,
        matchedSince: 0,
        candidateFrames: []
    };
    renderActionCapture();
    updateActionPrompt();
    updateRecognition('多角度采集中', 42, 8);
    showToast('按提示完成动作，系统会自动捕捉关键帧');
}

function resetActionCapture() {
    faceActionCapture = {
        active: false,
        currentIndex: 0,
        frames: [],
        holdCount: 0,
        lastMatchedStep: null,
        matchedSince: 0,
        candidateFrames: []
    };
    renderActionCapture();
    updateActionPrompt('等待开始多角度采集');
    updateCameraActionGuide('准备开始', '保持脸在画面中央', '点击“多角度采集”，按提示完成正脸、左右、上下、张嘴和眨眼。');
}

function handleActionCaptureFrame(result) {
    if (!faceActionCapture.active || !result?.landmarks || !result.action) return;

    const step = faceActionSteps[faceActionCapture.currentIndex];
    if (!step) return;

    const holdFrames = typeof ACTION_HOLD_FRAMES === 'object' ? (ACTION_HOLD_FRAMES[step.id] || 6) : ACTION_HOLD_FRAMES;
    const minStepMs = typeof ACTION_MIN_STEP_MS === 'object' ? (ACTION_MIN_STEP_MS[step.id] || 500) : ACTION_MIN_STEP_MS;

    if (result.action.matched?.[step.id]) {
        const now = performance.now();
        if (faceActionCapture.lastMatchedStep === step.id) {
            faceActionCapture.holdCount += 1;
        } else {
            faceActionCapture.lastMatchedStep = step.id;
            faceActionCapture.holdCount = 1;
            faceActionCapture.matchedSince = now;
        }
        faceActionCapture.candidateFrames = faceActionCapture.candidateFrames || [];
        faceActionCapture.candidateFrames.push(cloneLandmarks(result.landmarks));
        faceActionCapture.candidateFrames = faceActionCapture.candidateFrames.slice(-holdFrames);
        updateActionPrompt(null, faceActionCapture.holdCount, holdFrames);
        if (faceActionCapture.holdCount < holdFrames) return;
        if (now - (faceActionCapture.matchedSince || now) < minStepMs) return;

        const exists = faceActionCapture.frames.some(frame => frame.id === step.id);
        if (!exists) {
            faceActionCapture.frames.push({
                id: step.id,
                label: step.label,
                landmarks: averageLandmarkFrames(faceActionCapture.candidateFrames) || result.landmarks,
                action: result.action,
                capturedAt: Date.now()
            });
        }
        faceActionCapture.currentIndex += 1;
        faceActionCapture.holdCount = 0;
        faceActionCapture.lastMatchedStep = null;
        faceActionCapture.matchedSince = 0;
        faceActionCapture.candidateFrames = [];
        renderActionCapture();

        if (faceActionCapture.currentIndex >= faceActionSteps.length) {
            finishActionCapture();
        } else {
            updateActionPrompt();
            updateRecognition('多角度采集中', 62, Math.round(faceActionCapture.currentIndex / faceActionSteps.length * 100));
        }
    } else {
        faceActionCapture.holdCount = 0;
        faceActionCapture.lastMatchedStep = null;
        faceActionCapture.matchedSince = 0;
        faceActionCapture.candidateFrames = [];
        updateActionPrompt();
    }
}

function finishActionCapture() {
    faceActionCapture.active = false;
    const frontFrame = faceActionCapture.frames.find(frame => frame.id === 'front') || faceActionCapture.frames[0];
    if (!frontFrame?.landmarks) {
        showToast('多角度采集失败，请重试');
        resetActionCapture();
        return;
    }

    const video = document.getElementById('mediapipe-video');
    const model = convertLandmarksToAnalysis(frontFrame.landmarks, video);
    setPreviewFromCameraFrame(video);
    const currentFrameLandmarks = latestCameraResult?.landmarks || frontFrame.landmarks;
    const left = faceActionCapture.frames.find(frame => frame.id === 'left')?.action;
    const right = faceActionCapture.frames.find(frame => frame.id === 'right')?.action;
    const up = faceActionCapture.frames.find(frame => frame.id === 'up')?.action;
    const down = faceActionCapture.frames.find(frame => frame.id === 'down')?.action;
    const mouth = faceActionCapture.frames.find(frame => frame.id === 'mouth')?.action;
    const blink = faceActionCapture.frames.find(frame => frame.id === 'blink')?.action;
    const yawSpan = left && right ? Math.abs(left.yaw - right.yaw) : 0;
    const pitchSpan = up && down ? Math.abs(up.pitch - down.pitch) : 0;
    const customizationScale = Number((1 + Math.min(yawSpan, 0.24) * 0.32 + Math.min(pitchSpan, 0.18) * 0.18).toFixed(2));
    const customizationNote = '定制参考：本次多角度采集可作为镜框宽度、鼻托高度和镜腿角度的沟通依据；正式定制仍需补充验光单度数、散光、轴位、瞳高和镜片方案。';
    const confidence = clampNumber(Math.round((model.confidence || 74) + 10 + Math.min(yawSpan * 80, 8) + Math.min(pitchSpan * 80, 5) + (blink ? 2 : 0)), 0, 98);
    const actionQualityIssues = [];
    if (yawSpan < 0.12) actionQualityIssues.push('左右转头幅度偏小，镜圈宽度和镜腿建议需要人工复核');
    if (pitchSpan < 0.08) actionQualityIssues.push('上下动作幅度偏小，鼻托和镜框高度建议需要人工复核');
    if (!mouth || mouth.mouthOpen <= 0.045) actionQualityIssues.push('张嘴动作较弱，建议重新采集或人工复核');
    if (!blink || blink.eyeOpen >= 0.011) actionQualityIssues.push('眨眼动作未确认，活体动作完整度需要人工复核');

    applyModelResult({
        ...model,
        source: 'mediapipe_free',
        previewMeshPoints: currentFrameLandmarks,
        confidence,
        customizationScale,
        customizationNote,
        qualityIssues: [...(model.qualityIssues || []), ...actionQualityIssues],
        calibrationNote: `${model.calibrationNote} 已完成 ${faceActionCapture.frames.length} 个动作关键帧采集，并对每个动作取连续稳定帧平均：左右转头跨度 ${yawSpan.toFixed(2)}，上下动作跨度 ${pitchSpan.toFixed(2)}，并检查张嘴与眨眼动作。`
    }, buildLocalRecommendations(buildAnalysis(model)));

    updateActionPrompt('多角度采集完成');
    updateCameraActionGuide('完成', '已生成多角度配镜参数', '你可以换镜框继续试戴，也可以重新采集一次。', 'done');
    updateRecognition('多角度结果完成', confidence, 100);
    showToast('多角度采集完成，已生成更稳的配镜参数');
    if (document.body.classList.contains('onboard-page') && onboardStepIndex >= 3) {
        cameraGlassesEnabled = true;
        if (mediapipeCameraController) mediapipeCameraController.setDrawGlasses(true);
    }
}

function updateActionPrompt(text = null, holdCount = 0, maxFrames = 6) {
    const step = faceActionSteps[faceActionCapture.currentIndex];
    const progressText = holdCount > 0 ? ` · 保持 ${holdCount}/${maxFrames}` : '';
    const prompt = text || (step ? `${step.label}：${step.hint}${progressText}` : '多角度采集完成');
    setText('action-capture-prompt', prompt);
    if (step) {
        updateCameraActionGuide(
            `${faceActionCapture.currentIndex + 1}/${faceActionSteps.length}`,
            step.label,
            `${step.hint}${progressText}`,
            faceActionCapture.active ? 'capturing' : ''
        );
    }
}

function updateActionMetrics(action) {
    setText('action-yaw', action ? action.yaw.toFixed(2) : '-');
    setText('action-pitch', action ? action.pitch.toFixed(2) : '-');
    setText('action-mouth', action ? action.mouthOpen.toFixed(2) : '-');
    setText('action-blink', action ? action.eyeOpen.toFixed(2) : '-');
}

function renderActionCapture() {
    const list = document.getElementById('action-capture-steps');
    if (!list) return;

    list.innerHTML = faceActionSteps.map((step, index) => {
        const captured = faceActionCapture.frames.some(frame => frame.id === step.id);
        const active = faceActionCapture.active && index === faceActionCapture.currentIndex;
        return `<span class="${captured ? 'done' : active ? 'active' : ''}">${step.label}</span>`;
    }).join('');
}

function updateCameraActionGuide(stepText, title, detail, state = '') {
    setText('camera-action-step', stepText);
    setText('camera-action-title', title);
    setText('camera-action-detail', detail);
    const guide = document.getElementById('camera-action-guide');
    if (guide) {
        guide.classList.toggle('is-capturing', state === 'capturing');
        guide.classList.toggle('is-done', state === 'done');
    }
}

function toggleMediapipeMesh(button) {
    cameraMeshEnabled = !cameraMeshEnabled;
    button?.classList.toggle('active', cameraMeshEnabled);
    if (mediapipeCameraController) {
        mediapipeCameraController.setDrawMesh(cameraMeshEnabled);
    }
}

function toggleMediapipeGlasses(button) {
    cameraGlassesEnabled = !cameraGlassesEnabled;
    button?.classList.toggle('active', cameraGlassesEnabled);
    if (mediapipeCameraController) {
        mediapipeCameraController.setDrawGlasses(cameraGlassesEnabled);
    }
}

async function toggleCameraFacing(button) {
    const newMode = cameraFacingMode === 'user' ? 'environment' : 'user';
    cameraFacingMode = newMode;
    if (mediapipeCameraController) {
        try {
            await mediapipeCameraController.switchCamera(newMode);
            showToast(`已切换到${newMode === 'user' ? '前置' : '后置'}摄像头`);
        } catch (error) {
            console.error('Switch camera failed:', error);
            showToast('切换摄像头失败');
        }
    } else {
        showToast(`下次启动将使用${newMode === 'user' ? '前置' : '后置'}摄像头`);
    }
}

function setMediapipeGlasses(style) {
    const frame = getFrameCatalog().find(item => item.id === style) || getSelectedFrame();
    if (frame) {
        selectedFrameId = frame.id;
        cameraGlassesStyle = getCameraGlassesPayload(frame);
        preloadSelectedFrameImage(frame);
    } else {
        cameraGlassesStyle = style || cameraGlassesStyle;
    }
    if (mediapipeCameraController) {
        mediapipeCameraController.setGlassesStyle(cameraGlassesStyle);
    }
    updateSelectedFrameUI();
    drawFaceOverlay();
}

function refreshCameraGlassesPayload() {
    cameraGlassesStyle = getCameraGlassesPayload(getSelectedFrame());
    if (mediapipeCameraController) {
        mediapipeCameraController.setGlassesStyle(cameraGlassesStyle);
    }
}

function updatePreviewGlassesControl(type, value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    if (type === 'scale') {
        previewGlassesScale = Math.max(0.55, Math.min(1.75, numeric / 100));
    }
    if (type === 'x') {
        previewGlassesOffsetX = Math.max(-90, Math.min(90, numeric));
    }
    if (type === 'y') {
        previewGlassesOffsetY = Math.max(-90, Math.min(90, numeric));
    }
    if (type === 'rotation') {
        previewGlassesRotation = Math.max(-18, Math.min(18, numeric));
    }
    syncGlassesControlInputs();
    refreshCameraGlassesPayload();
    drawFaceOverlay();
}

function resetPreviewGlassesControls() {
    previewGlassesScale = 1;
    previewGlassesOffsetX = 0;
    previewGlassesOffsetY = 0;
    previewGlassesRotation = 0;
    syncGlassesControlInputs();
    refreshCameraGlassesPayload();
    drawFaceOverlay();
}

function syncGlassesControlInputs() {
    const scaleValue = Math.round(previewGlassesScale * 100);
    const xValue = Math.round(previewGlassesOffsetX);
    const yValue = Math.round(previewGlassesOffsetY);
    const rotationValue = Math.round(previewGlassesRotation);
    ['preview-glasses-scale', 'camera-glasses-scale'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = scaleValue;
    });
    ['preview-glasses-x', 'camera-glasses-x'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = xValue;
    });
    ['preview-glasses-y', 'camera-glasses-y'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = yValue;
    });
    ['preview-glasses-rotation', 'camera-glasses-rotation'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = rotationValue;
    });
    setTextEverywhere('preview-scale-value', `${scaleValue}%`);
    setTextEverywhere('camera-scale-value', `${scaleValue}%`);
    setTextEverywhere('preview-x-value', `${xValue}px`);
    setTextEverywhere('camera-x-value', `${xValue}px`);
    setTextEverywhere('preview-y-value', `${yValue}px`);
    setTextEverywhere('camera-y-value', `${yValue}px`);
    setTextEverywhere('preview-rotation-value', `${rotationValue}°`);
    setTextEverywhere('camera-rotation-value', `${rotationValue}°`);
}

function autoScaleSelectedGlasses() {
    const frame = getSelectedFrame();
    const analysis = latestAnalysis || buildAnalysis({});
    if (!frame || !analysis) {
        showToast('先选择镜框并完成一次识别');
        return;
    }
    const targetLens = Number(analysis.recommendedLensWidth || analysis.lensWidth || 51);
    const frameLens = Number(frame.lensWidth || targetLens);
    const pdFactor = analysis.pd ? Math.max(0.92, Math.min(1.08, analysis.pd / 63)) : 1;
    const baseScale = (targetLens / Math.max(frameLens, 1)) * pdFactor;
    previewGlassesScale = Math.max(0.85, Math.min(1.25, baseScale));
    syncGlassesControlInputs();
    refreshCameraGlassesPayload();
    drawFaceOverlay();
    showToast(`已按镜圈宽度自动缩放到 ${Math.round(previewGlassesScale * 100)}%`);
}

function getTryOnCorrectionMetrics() {
    const result = latestCameraResult;
    const points = result?.landmarks || latestPreviewMeshPoints || latestAnalysis?.previewMeshPoints || [];
    const left = points?.length ? getRawEyeCenter(points, 'left') : null;
    const right = points?.length ? getRawEyeCenter(points, 'right') : null;
    let eyeAngle = 0;
    let pdRatio = null;
    if (left && right) {
        eyeAngle = Math.atan2(right.y - left.y, right.x - left.x) * 180 / Math.PI;
        pdRatio = Math.hypot(right.x - left.x, right.y - left.y);
    }
    return {
        eyeAngle: Number(eyeAngle.toFixed(2)),
        pdRatio: pdRatio ? Number(pdRatio.toFixed(4)) : null,
        action: result?.action || null,
        adjustment: {
            scale: Number(previewGlassesScale.toFixed(3)),
            offsetX: Math.round(previewGlassesOffsetX),
            offsetY: Math.round(previewGlassesOffsetY),
            rotation: Math.round(previewGlassesRotation)
        }
    };
}

function getRawEyeCenter(points, side) {
    const iris = side === 'left' ? [468, 469, 470, 471, 472] : [473, 474, 475, 476, 477];
    const contour = side === 'left' ? [33, 133, 159, 145] : [362, 263, 386, 374];
    const indices = iris.every(index => points[index]) ? iris : contour;
    const valid = indices.map(index => points[index]).filter(Boolean);
    if (!valid.length) return null;
    return valid.reduce((acc, point) => ({
        x: acc.x + point.x / valid.length,
        y: acc.y + point.y / valid.length
    }), { x: 0, y: 0 });
}

async function requestKimiTryOnCorrection() {
    const frame = getSelectedFrame();
    if (!frame) {
        showToast('先选择一副镜框');
        return;
    }
    const metrics = getTryOnCorrectionMetrics();
    const fallback = () => {
        autoScaleSelectedGlasses();
        const eyeAngle = Number(metrics.eyeAngle || 0);
        previewGlassesRotation = Math.max(-12, Math.min(12, Math.round(previewGlassesRotation - eyeAngle * 0.15)));
        syncGlassesControlInputs();
        refreshCameraGlassesPayload();
        drawFaceOverlay();
        showToast('已用本地规则校正；Kimi 暂不可用');
    };

    try {
        const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer sk-kimi-kjQIak7vVuUkT7YmbtqSxGWn8Kxwn7vRzufCeQ6pTU00GjqIPb81BD4IKW2y2tdB'
            },
            body: JSON.stringify({
                model: 'moonshot-v1-8k',
                messages: [
                    {
                        role: 'system',
                        content: '你是一个眼镜试戴校正助手。根据用户提供的眼镜参数、脸型分析和当前试戴指标，返回 JSON 格式的校正建议。只返回 JSON，不要其他文字。格式：{"scale": number, "offsetX": number, "offsetY": number, "rotation": number}'
                    },
                    {
                        role: 'user',
                        content: `镜框：${frame.name}，镜圈宽度 ${frame.lensWidth}mm，鼻梁 ${frame.bridgeSize}mm，材质 ${frame.material}，类型 ${frame.type}。脸型分析：脸宽 ${latestAnalysis?.faceWidth || 140}mm，瞳距 ${latestAnalysis?.pd || 63}mm，建议镜圈 ${latestAnalysis?.recommendedLensWidth || 51}mm。当前试戴参数：缩放 ${metrics.adjustment.scale}，左右偏移 ${metrics.adjustment.offsetX}，上下偏移 ${metrics.adjustment.offsetY}，旋转 ${metrics.adjustment.rotation}，双眼角度 ${metrics.eyeAngle}。请给出校正建议。`
                    }
                ],
                temperature: 0.3
            })
        });
        const data = await response.json();
        if (!response.ok || !data.choices?.[0]?.message?.content) throw new Error(data.error?.message || 'Kimi 校正失败');
        const content = data.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const adjustment = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        if (!adjustment) throw new Error('无法解析 Kimi 返回的校正数据');
        applyTryOnAdjustment(adjustment);
        showToast('Kimi 已给出试戴校正');
    } catch (error) {
        console.warn('Kimi try-on correction unavailable:', error);
        fallback();
    }
}

function applyTryOnAdjustment(adjustment = {}) {
    if (Number.isFinite(Number(adjustment.scale))) {
        previewGlassesScale = Math.max(0.55, Math.min(1.75, Number(adjustment.scale)));
    }
    if (Number.isFinite(Number(adjustment.offsetX))) {
        previewGlassesOffsetX = Math.max(-90, Math.min(90, Number(adjustment.offsetX)));
    }
    if (Number.isFinite(Number(adjustment.offsetY))) {
        previewGlassesOffsetY = Math.max(-90, Math.min(90, Number(adjustment.offsetY)));
    }
    if (Number.isFinite(Number(adjustment.rotation))) {
        previewGlassesRotation = Math.max(-18, Math.min(18, Number(adjustment.rotation)));
    }
    syncGlassesControlInputs();
    refreshCameraGlassesPayload();
    drawFaceOverlay();
}

function togglePreviewKeypoints(button) {
    previewKeypointsEnabled = !previewKeypointsEnabled;
    button?.classList.toggle('active', previewKeypointsEnabled);
    drawFaceOverlay();
}

function togglePreviewGlasses(button) {
    previewGlassesEnabled = !previewGlassesEnabled;
    button?.classList.toggle('active', previewGlassesEnabled);
    drawFaceOverlay();
}

function updateCameraStatus(status) {
    setText('mediapipe-camera-status', status);
    const panel = document.querySelector('.mediapipe-camera-panel');
    if (panel) {
        panel.classList.toggle('camera-running', status === '实时识别中');
    }
}

function drawModelPreview(analysis = latestAnalysis) {
    const canvas = document.getElementById('model-preview-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const t = Date.now() / 1000;
    const faceWidth = analysis?.faceWidth || 140;
    const faceHeight = analysis?.faceHeight || 185;
    const pd = analysis?.pd || 63;
    const recommendedWidth = analysis?.recommendedWidth || faceWidth + 8;
    const score = analysis?.fitScore || 0;

    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#eef8f6');
    gradient.addColorStop(1, '#f8fbfb');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    if (analysis?.meshPoints?.length) {
        drawDetectedFaceMesh(ctx, width, height, analysis.meshPoints, t);
    }

    ctx.save();
    ctx.translate(width / 2, height / 2 + 12);
    ctx.rotate(Math.sin(t * 0.6) * 0.035);

    const headW = 150 + (faceWidth - 140) * 0.7;
    const headH = 220 + (faceHeight - 185) * 0.55;
    if (!analysis?.meshPoints?.length) {
        ctx.strokeStyle = 'rgba(15, 118, 110, 0.28)';
        ctx.lineWidth = 1.2;
        for (let i = -3; i <= 3; i++) {
            ctx.beginPath();
            ctx.ellipse(i * headW / 7, 0, headW / 8, headH / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        for (let i = -3; i <= 3; i++) {
            ctx.beginPath();
            ctx.ellipse(0, i * headH / 8, headW / 2, headH / 12, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    ctx.strokeStyle = '#0f766e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, headW / 2, headH / 2, 0, 0, Math.PI * 2);
    ctx.stroke();

    const eyeGap = pd * 1.45;
    const lensW = recommendedWidth * 0.43;
    const lensH = lensW * 0.58;
    const frameImage = selectedFrameImage?.complete ? selectedFrameImage : null;
    if (frameImage) {
        const frameW = Math.min(headW * 1.08, recommendedWidth * 1.72);
        const frameH = frameW * 0.38;
        ctx.drawImage(frameImage, -frameW / 2, -46, frameW, frameH);
    } else {
        ctx.strokeStyle = '#10202a';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.roundRect(-eyeGap / 2 - lensW / 2, -24, lensW, lensH, 18);
        ctx.roundRect(eyeGap / 2 - lensW / 2, -24, lensW, lensH, 18);
        ctx.moveTo(-eyeGap / 2 + lensW / 2, -4);
        ctx.lineTo(eyeGap / 2 - lensW / 2, -4);
        ctx.stroke();
    }

    ctx.strokeStyle = '#e66f51';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(-recommendedWidth * 0.8, -80);
    ctx.lineTo(recommendedWidth * 0.8, -80);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#10202a';
    ctx.font = '700 18px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`镜圈 ${analysis?.recommendedLensWidth || 51} mm`, 0, -96);
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = 'rgba(219,228,232,0.9)';
    ctx.lineWidth = 1;
    ctx.roundRect(24, 24, 156, 74, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5d6a73';
    ctx.font = '700 15px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.fillText('等待照片或摄像头', 48, 52);
    ctx.fillStyle = '#0f766e';
    ctx.font = '800 24px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.fillText(score ? `${score}/100` : '待分析', 48, 82);

    if (modelAnimationFrame) cancelAnimationFrame(modelAnimationFrame);
    modelAnimationFrame = requestAnimationFrame(() => drawModelPreview(latestAnalysis));
}

function drawDetectedFaceMesh(ctx, width, height, points, t) {
    const bounds = points.reduce((acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        maxX: Math.max(acc.maxX, point.x),
        minY: Math.min(acc.minY, point.y),
        maxY: Math.max(acc.maxY, point.y)
    }), { minX: 1, maxX: 0, minY: 1, maxY: 0 });
    const scale = Math.min(
        width * 0.36 / Math.max(bounds.maxX - bounds.minX, 0.1),
        height * 0.68 / Math.max(bounds.maxY - bounds.minY, 0.1)
    );
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const tilt = Math.sin(t * 0.6) * 55;

    const project = (point) => ({
        x: width / 2 + (point.x - centerX) * scale + (point.z || 0) * tilt,
        y: height / 2 + 14 + (point.y - centerY) * scale
    });

    const drawPath = (indices, color, lineWidth = 1.5) => {
        ctx.beginPath();
        indices.forEach((index, order) => {
            const point = points[index];
            if (!point) return;
            const p = project(point);
            if (order === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    };

    const faceOval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
    const leftEye = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7, 33];
    const rightEye = [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382, 362];
    const nose = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164];
    const mouth = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];

    drawPath(faceOval, 'rgba(15, 118, 110, 0.42)', 2.4);
    drawPath(leftEye, 'rgba(16, 32, 42, 0.38)', 1.5);
    drawPath(rightEye, 'rgba(16, 32, 42, 0.38)', 1.5);
    drawPath(nose, 'rgba(230, 111, 81, 0.4)', 1.4);
    drawPath(mouth, 'rgba(16, 32, 42, 0.22)', 1.2);

    ctx.fillStyle = 'rgba(15, 118, 110, 0.26)';
    points.forEach((point, index) => {
        if (index % 3 !== 0) return;
        const p = project(point);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
    });
}

function renderRecommendations(recs = currentRecommendations) {
    const container = document.getElementById('recommendations');
    if (!container) return;

    currentRecommendations = Array.isArray(recs) ? recs : [];
    const selected = ensureSelectedFrame();
    const pageCount = Math.max(1, Math.ceil(currentRecommendations.length / RECOMMENDATIONS_PER_PAGE));
    recommendationPage = Math.max(0, Math.min(recommendationPage, pageCount - 1));
    const start = recommendationPage * RECOMMENDATIONS_PER_PAGE;
    const pageItems = currentRecommendations.slice(start, start + RECOMMENDATIONS_PER_PAGE);

    if (!currentRecommendations.length || !selected) {
        container.innerHTML = '<p class="text-center text-dim">暂无可试戴镜框。</p>';
        renderTryOnStrip();
        return;
    }

    container.innerHTML = `
        <div class="recommendation-toolbar">
            <span>候选 ${start + 1}-${Math.min(start + RECOMMENDATIONS_PER_PAGE, currentRecommendations.length)} / ${currentRecommendations.length}，镜框库 ${getFrameCatalog().length} 款</span>
            <div>
                <button class="icon-toggle" type="button" onclick="changeRecommendationPage(-1)" ${recommendationPage === 0 ? 'disabled' : ''}>上一批</button>
                <button class="icon-toggle" type="button" onclick="changeRecommendationPage(1)" ${recommendationPage >= pageCount - 1 ? 'disabled' : ''}>下一批</button>
            </div>
        </div>
        <div class="recommendation-list">
            ${pageItems.map((r, i) => `
                <div class="rec-card ${r.id === selected.id ? 'selected' : ''}" data-frame-id="${escapeHtml(r.id || getFrameImage(i).id)}">
                    <button class="rec-image" type="button" onclick="openFrameImageViewer('${escapeHtml(r.id || getFrameImage(i).id)}')" aria-label="查看${escapeHtml(r.name)}全图">
                        <img src="${escapeHtml(toAbsoluteAssetUrl(r.image || getFrameImage(i).src))}" alt="${escapeHtml(r.imageAlt || r.name)}" loading="lazy" decoding="async" onerror="handleFrameImageError(this)">
                    </button>
                    <div class="rec-title-row">
                        <h4>${escapeHtml(r.name)}</h4>
                        ${r.score ? `<span>${r.score} 分</span>` : ''}
                    </div>
                    <p class="rec-merchant">${escapeHtml(r.merchantName || 'CHATGPT')} · ${escapeHtml(r.type || '镜框')} ${r.price ? `· ¥${escapeHtml(r.price)}` : ''}</p>
                    ${r.specs ? `<p class="rec-specs">${escapeHtml(r.specs)}</p>` : ''}
                    <p class="rec-reason">${escapeHtml(r.reason)}</p>
                    <div class="rec-actions">
                        <button class="btn btn-secondary" onclick="selectFrameForTryOn('${escapeHtml(r.id || getFrameImage(i).id)}')">试戴这副</button>
                        <button class="btn btn-secondary" onclick="openFrameImageViewer('${escapeHtml(r.id || getFrameImage(i).id)}')">看全图</button>
                        <button class="btn btn-primary" onclick="addFrameToWishlist('${escapeHtml(r.id || getFrameImage(i).id)}')">加入心愿单</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    renderTryOnStrip();
}

function renderTryOnStrip() {
    const strip = document.getElementById('tryon-strip');
    if (!strip) return;

    const selected = ensureSelectedFrame();
    const frames = getFrameCatalog();
    if (!frames.length || !selected) {
        strip.innerHTML = '<p class="text-dim">暂无可试戴镜框。</p>';
        return;
    }

    strip.innerHTML = `
        <div class="tryon-strip-head">
            <div>
                <span>当前试戴</span>
                <strong>${escapeHtml(selected.name)}</strong>
            </div>
            <small>${frames.length} 款，左右滑动选择</small>
        </div>
        <div class="tryon-strip-track">
            ${frames.map(frame => {
                const wished = isFrameInWishlist(frame.id);
                return `
                    <div class="tryon-pill ${frame.id === selected.id ? 'selected' : ''}" data-frame-id="${escapeHtml(frame.id)}">
                        <button class="tryon-pill-main" type="button" onclick="selectFrameForTryOn('${escapeHtml(frame.id)}')" aria-label="试戴${escapeHtml(frame.name)}">
                            <span class="tryon-pill-image">
                                <img src="${escapeHtml(toAbsoluteAssetUrl(frame.image))}" alt="${escapeHtml(frame.imageAlt || frame.name)}" loading="lazy" decoding="async" onerror="handleFrameImageError(this)">
                            </span>
                            <span>${escapeHtml(frame.name)}</span>
                        </button>
                        <button class="tryon-pill-wish" type="button" onclick="${wished ? `removeSelectedFrameFromWishlist('${escapeHtml(frame.id)}')` : `addSelectedFrameToWishlist('${escapeHtml(frame.id)}')`}">${wished ? '移出心愿单' : '加入心愿单'}</button>
                        <button class="tryon-pill-view" type="button" onclick="openFrameImageViewer('${escapeHtml(frame.id)}')">看全图</button>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    updateWishlistControls();
}

function updateSelectedFrameUI() {
    const selected = getSelectedFrame();
    if (!selected) return;
    const select = document.getElementById('mediapipe-glasses-style');
    if (select && select.value !== selected.id) select.value = selected.id;
    document.querySelectorAll('.tryon-strip-head strong').forEach(el => {
        el.textContent = selected.name;
    });
    document.querySelectorAll('.tryon-pill, .rec-card').forEach(el => {
        el.classList.toggle('selected', el.dataset.frameId === selected.id);
    });
    updateWishlistControls();
}

function handleFrameImageError(img) {
    if (!img || img.dataset.fallbackTried === 'blank') return;

    const fallback = withoutVersion(img.currentSrc || img.src || img.getAttribute('src'));
    if (img.dataset.fallbackTried !== 'noquery' && fallback && fallback !== img.src) {
        img.dataset.fallbackTried = 'noquery';
        img.src = fallback;
        return;
    }

    img.dataset.fallbackTried = 'blank';
    img.classList.add('image-broken');
    const holder = img.closest('.rec-image, .tryon-pill-image, .tryon-current-image, .wishlist-frame-image, .frame-viewer-image');
    if (holder) {
        holder.classList.add('image-missing');
        holder.dataset.label = '图片未加载';
    }
}

function openFrameImageViewer(frameId = selectedFrameId) {
    const frame = getFrameCatalog().find(item => item.id === frameId) || getSelectedFrame();
    if (!frame?.image) {
        showToast('这副镜框没有可查看图片');
        return;
    }
    let overlay = document.getElementById('frame-image-viewer');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'frame-image-viewer';
        overlay.className = 'frame-viewer-overlay';
        overlay.innerHTML = `
            <div class="frame-viewer-dialog" role="dialog" aria-modal="true" aria-label="镜框全图">
                <button class="frame-viewer-close" type="button" onclick="closeFrameImageViewer()" aria-label="关闭">×</button>
                <div class="frame-viewer-image">
                    <img id="frame-viewer-img" alt="镜框全图" onerror="handleFrameImageError(this)">
                </div>
                <div class="frame-viewer-info">
                    <div>
                        <strong id="frame-viewer-title"></strong>
                        <span id="frame-viewer-meta"></span>
                    </div>
                    <div class="frame-viewer-actions">
                        <button class="btn btn-secondary" type="button" id="frame-viewer-tryon">试戴这副</button>
                        <button class="btn btn-primary" type="button" id="frame-viewer-wish">加入心愿单</button>
                    </div>
                </div>
            </div>
        `;
        overlay.addEventListener('click', event => {
            if (event.target === overlay) closeFrameImageViewer();
        });
        document.body.appendChild(overlay);
    }
    const image = overlay.querySelector('#frame-viewer-img');
    const title = overlay.querySelector('#frame-viewer-title');
    const meta = overlay.querySelector('#frame-viewer-meta');
    const tryOn = overlay.querySelector('#frame-viewer-tryon');
    const wish = overlay.querySelector('#frame-viewer-wish');
    if (image) {
        image.classList.remove('image-broken');
        image.closest('.frame-viewer-image')?.classList.remove('image-missing');
        image.src = toAbsoluteAssetUrl(frame.image);
        image.alt = frame.imageAlt || frame.name || '镜框全图';
    }
    if (title) title.textContent = frame.name || '未命名镜框';
    if (meta) meta.textContent = `${frame.merchantName || 'CHATGPT'} · 镜圈 ${frame.lensWidth || '-'} mm / 鼻梁 ${frame.bridgeSize || '-'} mm / 镜腿 ${frame.templeLength || '-'} mm`;
    if (tryOn) tryOn.onclick = () => {
        selectFrameForTryOn(frame.id);
        closeFrameImageViewer();
    };
    if (wish) {
        const wished = isFrameInWishlist(frame.id);
        wish.textContent = wished ? '已在心愿单' : '加入心愿单';
        wish.disabled = wished;
        wish.onclick = () => {
            addSelectedFrameToWishlist(frame.id);
            openFrameImageViewer(frame.id);
        };
    }
    overlay.classList.add('active');
    document.body.classList.add('modal-open');
}

function closeFrameImageViewer() {
    document.getElementById('frame-image-viewer')?.classList.remove('active');
    document.body.classList.remove('modal-open');
}

function getFrameImage(index) {
    const frame = getFrameCatalog()[index % getFrameCatalog().length] || BUILTIN_FRAME_CATALOG[0];
    return {
        id: frame.id,
        src: frame.image,
        alt: frame.imageAlt || frame.name
    };
}

function renderDefaultRecommendations() {
    recommendationPage = 0;
    const frames = getFrameCatalog().slice(0, 12);
    renderRecommendations(frames.map((frame, index) => ({
        ...frame,
        score: index < 4 ? 88 - index : 82 - (index - 4),
        specs: `镜圈 ${frame.lensWidth} mm / 鼻梁 ${frame.bridgeSize} mm / 镜腿 ${frame.templeLength} mm`,
        reason: frame.description || `${frame.merchantName || 'CHATGPT'} 镜框库款式。先看镜圈宽度和鼻梁宽，识别后再计算移心量。`
    })));
}

function changeRecommendationPage(delta) {
    recommendationPage += delta;
    renderRecommendations(currentRecommendations);
}

function selectFrameForTryOn(frameId) {
    const frame = getFrameCatalog().find(item => item.id === frameId);
    if (!frame) {
        showToast('没有找到这款镜框');
        return;
    }

    selectedFrameId = frame.id;
    cameraGlassesStyle = getCameraGlassesPayload(frame);
    preloadSelectedFrameImage(frame);
    const select = document.getElementById('mediapipe-glasses-style');
    if (select) select.value = frame.id;
    if (mediapipeCameraController) {
        mediapipeCameraController.setGlassesStyle(cameraGlassesStyle);
    }
    updateSelectedFrameUI();
    drawModelPreview(latestAnalysis);
    drawFaceOverlay();
    saveGlassesHomeState();
    showToast(`已切换为 ${frame.name}`);
}

function saveGlassesHomeState() {
    try {
        const frame = getSelectedFrame();
        const uid = getCurrentUserId();
        const payload = {
            updatedAt: new Date().toISOString(),
            uid,
            analysis: latestAnalysis,
            selectedFrameId,
            selectedFrame: frame ? {
                id: frame.id,
                name: frame.name,
                image: frame.image,
                imageAlt: frame.imageAlt,
                merchantName: frame.merchantName,
                type: frame.type,
                price: frame.price,
                lensWidth: frame.lensWidth,
                bridgeSize: frame.bridgeSize,
                templeLength: frame.templeLength
            } : null,
            prescription: getSavedPrescriptionData()
        };
        localStorage.setItem(getHomeStateKey(uid), JSON.stringify(payload));
        localStorage.setItem('zz_glasses_home_state', JSON.stringify(payload));
        queueServerSync('home_state', payload);
    } catch (error) {
        console.warn('Save glasses home state failed:', error);
    }
}

function getHomeStateKey(uid = getCurrentUserId()) {
    return `zz_glasses_home_state_${uid || 'anonymous'}`;
}

function getDisplayUserName() {
    return currentUser?.nickname || currentUser?.username || '匿名用户';
}

async function getTryOnSnapshotDataUrl() {
    const image = document.getElementById('face-preview-image');
    const overlay = document.getElementById('face-overlay-canvas');
    const video = document.getElementById('mediapipe-video');
    if ((!image || !image.currentSrc) && video?.videoWidth) {
        captureLatestCameraSnapshot();
        await new Promise(resolve => setTimeout(resolve, 180));
    }
    if (!image?.currentSrc || !overlay) {
        if (latestCameraFrameDataUrl) return latestCameraFrameDataUrl;
        latestTryOnSnapshotDataUrl = null;
        return null;
    }
    drawFaceOverlay();
    const canvas = document.createElement('canvas');
    canvas.width = overlay.width || 1200;
    canvas.height = overlay.height || 800;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const rect = getObjectContainRect(canvas, image);
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
    latestTryOnSnapshotDataUrl = canvas.toDataURL('image/png', 0.95);
    return latestTryOnSnapshotDataUrl;
}

function getReportPayload() {
    const analysis = latestAnalysis || buildAnalysis({});
    const frame = getSelectedFrame();
    return {
        exportedAt: new Date().toISOString(),
        user: {
            uid: currentUser?.uid || 'anonymous',
            name: getDisplayUserName()
        },
        analysis,
        selectedFrame: frame ? {
            id: frame.id,
            name: frame.name,
            merchantName: frame.merchantName,
            type: frame.type,
            price: frame.price,
            lensWidth: frame.lensWidth,
            bridgeSize: frame.bridgeSize,
            templeLength: frame.templeLength
        } : null,
        tryOnImage: latestTryOnSnapshotDataUrl,
        prescription: getSavedPrescriptionData(),
        preferences: getPreferences()
    };
}

function updateExportButtons() {
    const disabled = !latestAnalysis;
    document.querySelectorAll('[data-export-action]').forEach(button => {
        button.disabled = disabled;
    });
}

async function exportGlassesReportJSON() {
    if (!latestAnalysis) {
        showToast('先完成一次识别或手动参数录入');
        return;
    }
    await getTryOnSnapshotDataUrl();
    const blob = new Blob([JSON.stringify(getReportPayload(), null, 2)], { type: 'application/json' });
    downloadBlob(blob, `glasses-report-${Date.now()}.json`);
}

async function exportGlassesFlowHTML() {
    await getTryOnSnapshotDataUrl();
const payload = getReportPayload();
const analysis = payload.analysis;
const frame = payload.selectedFrame;
const prescriptionText = buildPrescriptionSummary(payload.prescription || {});
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>铮铮眼镜流程导出</title>
<style>
body{margin:0;padding:32px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#eef6f4;color:#10202a}
main{max-width:920px;margin:0 auto;padding:32px;border-radius:12px;background:#fff}
h1{font-size:34px;margin:0 0 8px} h2{margin-top:28px}.head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.qr{width:128px;height:128px;border:1px solid #dbe6ea;border-radius:8px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.item{padding:14px;border:1px solid #dbe6ea;border-radius:8px;background:#f8fbfb}.item span{display:block;color:#6b7882;font-weight:800;font-size:13px}.item strong{display:block;margin-top:4px;font-size:20px}.tryon-photo{margin:18px 0 8px;padding:12px;border:1px solid #dbe6ea;border-radius:8px;background:#f8fbfb}.tryon-photo img{display:block;width:100%;max-height:420px;object-fit:contain;border-radius:8px;background:#fff}.tryon-photo span{display:block;margin-top:8px;color:#6b7882;font-weight:800}
p{line-height:1.7;color:#45535d}.steps{display:grid;gap:10px}.steps div{padding:14px;border-radius:8px;background:#eff8f6;font-weight:800}
@media(max-width:640px){body{padding:12px}.grid{grid-template-columns:1fr}main{padding:20px}}
</style>
</head>
<body>
<main>
<div class="head">
<div>
<h1>铮铮眼镜流程导出</h1>
<p>用户：${escapeHtml(payload.user.name)} · 导出时间：${new Date(payload.exportedAt).toLocaleString('zh-CN')}</p>
</div>
<img class="qr" src="https://quickchart.io/qr?text=${encodeURIComponent('https://glasses.zhengzhengstudio.cn')}&size=180" alt="glasses.zhengzhengstudio.cn 二维码">
</div>
${payload.tryOnImage ? `<section class="tryon-photo"><img src="${payload.tryOnImage}" alt="本次真实试戴图"><span>本次真实试戴图</span></section>` : ''}
<h2>采集参数</h2>
<section class="grid">
${[
    ['脸型', analysis.faceShape],
    ['脸宽', `${analysis.faceWidth} mm`],
    ['瞳距', `${analysis.pd} mm`],
    ['建议镜圈宽度', `${analysis.recommendedLensWidth} mm · ${analysis.frameSizeLabel}`],
    ['推荐鼻梁宽', `${analysis.recommendedBridgeWidth} mm`],
    ['移心量', `${analysis.decentration} mm · ${analysis.decentrationLabel}`],
    ['镜腿建议', analysis.templeLabel],
    ['适配评分', `${analysis.fitScore}/100 · ${analysis.riskLevel}`]
].map(([label, value]) => `<div class="item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '-')}</strong></div>`).join('')}
</section>
<h2>当前镜框</h2>
<p>${frame ? `${escapeHtml(frame.name)} / ${escapeHtml(frame.merchantName || 'CHATGPT')} / 镜圈 ${escapeHtml(frame.lensWidth || '-')} mm / 鼻梁 ${escapeHtml(frame.bridgeSize || '-')} mm` : '未选择镜框'}</p>
<h2>验光单</h2>
<p>${escapeHtml(hasPrescriptionData(payload.prescription || {}) ? prescriptionText : '未填写。正式下单前需补充医院或门店验光数据。')}</p>
<h2>流程记录</h2>
<section class="steps">
<div>1. 登录或匿名体验：${escapeHtml(payload.user.name)}</div>
<div>2. 采集：${escapeHtml(getAnalysisSourceLabel(analysis.source))}</div>
<div>3. 偏好：${escapeHtml(analysis.style)} / ${escapeHtml(analysis.material)} / ${escapeHtml(analysis.usage)} / ${escapeHtml(analysis.comfort)}</div>
<div>4. 结论：${escapeHtml(analysis.bridgeLabel)}；${escapeHtml(analysis.templeLabel)}</div>
</section>
<h2>复核说明</h2>
<p>${escapeHtml(analysis.calibrationNote || '正式配镜前建议用验光单瞳距或参考尺再次校准。')}</p>
<p>${escapeHtml((analysis.qualityIssues || []).length ? `需注意：${analysis.qualityIssues.join('、')}` : '照片质量可用。')}</p>
</main>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, `glasses-flow-${Date.now()}.html`);
}

async function buildReportImageBlob() {
    await getTryOnSnapshotDataUrl();
    const payload = getReportPayload();
    const analysis = payload.analysis;
    const frame = payload.selectedFrame;
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 2050;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4faf8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 56, 56, 1088, 1938, 28);
    ctx.fill();

    ctx.fillStyle = '#10202a';
    ctx.font = '800 54px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.fillText('铮铮眼镜配镜报告', 104, 150);
    ctx.font = '700 26px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.fillStyle = '#5d6a73';
    ctx.fillText(`用户：${payload.user.name}  ·  ${new Date(payload.exportedAt).toLocaleString('zh-CN')}`, 104, 198);
    await drawSiteQrCode(ctx, 912, 112, 150);

    ctx.fillStyle = '#0f766e';
    ctx.font = '800 32px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.fillText('本次实拍试戴', 104, 292);
    ctx.fillStyle = '#f8fbfb';
    roundRect(ctx, 104, 320, 992, 420, 18);
    ctx.fill();
    if (payload.tryOnImage) {
        try {
            const photo = await loadImageFromDataUrl(payload.tryOnImage);
            drawContainImage(ctx, photo, 128, 344, 944, 372);
        } catch (error) {
            drawReportPhotoPlaceholder(ctx, '实拍图读取失败', 128, 344, 944, 372);
        }
    } else {
        drawReportPhotoPlaceholder(ctx, '暂无实拍图，可先完成试戴再导出', 128, 344, 944, 372);
    }

    const rows = [
        ['脸型', analysis.faceShape],
        ['脸宽', `${analysis.faceWidth} mm`],
        ['瞳距', `${analysis.pd} mm`],
        ['建议镜圈宽度', `${analysis.recommendedLensWidth} mm · ${analysis.frameSizeLabel}`],
        ['推荐鼻梁宽', `${analysis.recommendedBridgeWidth} mm`],
        ['移心量', `${analysis.decentration} mm · ${analysis.decentrationLabel}`],
        ['镜腿建议', analysis.templeLabel],
        ['综合评分', `${analysis.fitScore}/100 · ${analysis.riskLevel}`],
        ['当前镜框', frame ? `${frame.name} / ${frame.merchantName}` : '未选择'],
        ['验光单', hasPrescriptionData(payload.prescription || {}) ? buildPrescriptionSummary(payload.prescription).slice(0, 34) : '未填写']
    ];

    ctx.font = '800 32px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.fillStyle = '#0f766e';
    ctx.fillText('参数', 104, 800);
    rows.forEach(([label, value], index) => {
        const y = 858 + index * 84;
        ctx.fillStyle = index % 2 ? '#f8fbfb' : '#eff8f6';
        roundRect(ctx, 104, y - 50, 992, 64, 14);
        ctx.fill();
        ctx.fillStyle = '#73808a';
        ctx.font = '700 24px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
        ctx.fillText(label, 136, y - 8);
        ctx.fillStyle = '#10202a';
        ctx.font = '800 28px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
        ctx.fillText(String(value || '-').slice(0, 38), 410, y - 8);
    });

    ctx.fillStyle = '#0f766e';
    ctx.font = '800 32px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.fillText('建议', 104, 1718);
    const notes = [
        analysis.bridgeLabel,
        analysis.templeLabel,
        analysis.calibrationNote || '正式配镜前建议用验光单瞳距或参考尺再次校准。',
        (analysis.qualityIssues || []).length ? `需注意：${analysis.qualityIssues.join('、')}` : '照片质量可用。'
    ];
    ctx.fillStyle = '#10202a';
    ctx.font = '700 26px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    wrapLines(ctx, notes.join(' '), 104, 1774, 992, 38);

    ctx.fillStyle = '#73808a';
    ctx.font = '700 22px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.fillText('长按图片可保存；JSON 可用于后续商家沟通。', 104, 1920);
    ctx.fillText('glasses.zhengzhengstudio.cn', 840, 286);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.95));
}

function drawReportPhotoPlaceholder(ctx, text, x, y, width, height) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x, y, width, height, 14);
    ctx.fill();
    ctx.fillStyle = '#73808a';
    ctx.font = '800 26px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, x + width / 2, y + height / 2);
    ctx.restore();
}

function drawContainImage(ctx, image, x, y, width, height) {
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

function loadImageFromDataUrl(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
}

async function drawSiteQrCode(ctx, x, y, size) {
    const url = 'https://glasses.zhengzhengstudio.cn';
    try {
        const qr = await loadImageFromFetchedBlob(`https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=${size}`);
        ctx.drawImage(qr, x, y, size, size);
    } catch (error) {
        ctx.save();
        ctx.fillStyle = '#fff';
        roundRect(ctx, x, y, size, size, 8);
        ctx.fill();
        ctx.strokeStyle = '#10202a';
        ctx.lineWidth = 4;
        ctx.strokeRect(x + 12, y + 12, 34, 34);
        ctx.strokeRect(x + size - 46, y + 12, 34, 34);
        ctx.strokeRect(x + 12, y + size - 46, 34, 34);
        ctx.fillStyle = '#10202a';
        for (let row = 0; row < 7; row += 1) {
            for (let col = 0; col < 7; col += 1) {
                if ((row * 3 + col * 5 + url.length) % 2 === 0) {
                    ctx.fillRect(x + 56 + col * 10, y + 56 + row * 10, 7, 7);
                }
            }
        }
        ctx.restore();
    }
}

async function loadImageFromFetchedBlob(src) {
    const response = await fetch(src, { mode: 'cors', cache: 'force-cache' });
    if (!response.ok) throw new Error(`qr ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = error => {
            URL.revokeObjectURL(objectUrl);
            reject(error);
        };
        image.src = objectUrl;
    });
}

function addSelectedFrameToWishlist(frameId = selectedFrameId) {
    const frame = getFrameCatalog().find(item => item.id === frameId) || getSelectedFrame();
    if (!frame) {
        showToast('先选择一副镜框');
        return;
    }
    addFrameToWishlist(frame.id);
}

function removeSelectedFrameFromWishlist(frameId = selectedFrameId) {
    const frame = getFrameCatalog().find(item => item.id === frameId) || getSelectedFrame();
    if (!frame) {
        showToast('先选择一副镜框');
        return;
    }
    const item = readWishlist().find(wish => wish.frame?.id === frame.id);
    if (!item) {
        showToast('这副镜框还不在心愿单');
        return;
    }
    removeWishlistItem(item.id);
}

function isFrameInWishlist(frameId) {
    return readWishlist().some(item => item.frame?.id === frameId);
}

function updateWishlistControls() {
    const frame = getSelectedFrame();
    const wished = frame ? isFrameInWishlist(frame.id) : false;
    document.querySelectorAll('[data-selected-wishlist-action]').forEach(button => {
        button.textContent = wished ? '已在心愿单' : '加入心愿单';
        button.disabled = !frame || wished;
    });
    document.querySelectorAll('[data-selected-wishlist-remove]').forEach(button => {
        button.disabled = !frame || !wished;
        button.textContent = wished ? '移出心愿单' : '未加入';
    });
}

function addFrameToWishlist(frameId) {
    const frame = getFrameCatalog().find(item => item.id === frameId);
    if (!frame) {
        showToast('没有找到这款镜框');
        return;
    }
    selectedFrameId = frame.id;
    preloadSelectedFrameImage(frame);
    const uid = currentUser?.uid || 'anonymous';
    const existing = readLocalArray(`zz_glasses_wishlist_${uid}`).find(item => item.frame?.id === frame.id);
    if (existing) {
        renderTryOnStrip();
        updateWishlistControls();
        showToast(`心愿单里已经有：${frame.name}`);
        return;
    }
    const analysis = latestAnalysis || buildAnalysis({});
    const item = {
        id: `wish_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        uid,
        customerName: getDisplayUserName(),
        merchantId: frame.merchantId || CHATGPT_MERCHANT.id,
        merchantName: frame.merchantName || CHATGPT_MERCHANT.name,
        frame,
        analysis,
        createdAt: new Date().toISOString(),
        status: 'wishlist'
    };
    writeLocalArray(`zz_glasses_wishlist_${uid}`, prependUnique(item, readLocalArray(`zz_glasses_wishlist_${uid}`)));
    saveGlassesHomeState();
    renderRecommendations(currentRecommendations);
    renderTryOnStrip();
    renderWishlistPanel();
    updateWishlistControls();
    showToast(`已加入心愿单：${frame.name}`);
}

function getCurrentUserId() {
    return currentUser?.uid || 'anonymous';
}

function getWishlistKey() {
    return `zz_glasses_wishlist_${getCurrentUserId()}`;
}

function readWishlist() {
    return readLocalArray(getWishlistKey());
}

function removeWishlistItem(id) {
    const next = readWishlist().filter(item => item.id !== id);
    writeLocalArray(getWishlistKey(), next);
    renderWishlistPanel();
    renderRecommendations(currentRecommendations);
    renderTryOnStrip();
    updateWishlistControls();
    showToast('已从心愿单移除');
}

function renderWishlistPanel() {
    const panel = document.getElementById('wishlist-panel');
    if (!panel) return;
    const wishlist = readWishlist();
    if (!wishlist.length) {
        panel.innerHTML = `
            <div class="wishlist-empty">
                <strong>心愿单为空</strong>
                <span>在第 3 步把合适的镜框加入心愿单，最后再统一发给商家或铮铮。</span>
            </div>
        `;
        return;
    }

    panel.innerHTML = `
        <div class="wishlist-head">
            <div>
                <p class="eyebrow">心愿单</p>
                <h4>准备发送给商家的镜框</h4>
            </div>
            <button class="btn btn-primary" type="button" onclick="sendWishlistToMerchant()">发送心愿单与采集包</button>
        </div>
        <div class="wishlist-list">
            ${wishlist.map(item => {
                const frame = item.frame || {};
                return `
                    <article class="wishlist-item">
                        <button class="wishlist-frame-image" type="button" onclick="openFrameImageViewer('${escapeHtml(frame.id || '')}')" aria-label="查看${escapeHtml(frame.name || '镜框')}全图">
                            <img src="${escapeHtml(toAbsoluteAssetUrl(frame.image || ''))}" alt="${escapeHtml(frame.imageAlt || frame.name || '镜框')}" onerror="handleFrameImageError(this)">
                        </button>
                        <div>
                            <strong>${escapeHtml(frame.name || '未命名镜框')}</strong>
                            <span>${escapeHtml(frame.merchantName || 'CHATGPT')} · 镜圈 ${escapeHtml(frame.lensWidth || '-')} mm / 鼻梁 ${escapeHtml(frame.bridgeSize || '-')} mm</span>
                        </div>
                        <div class="wishlist-actions">
                            <button class="icon-toggle" type="button" onclick="openFrameImageViewer('${escapeHtml(frame.id || '')}')">全图</button>
                            <button class="icon-toggle" type="button" onclick="removeWishlistItem('${escapeHtml(item.id)}')">移除</button>
                        </div>
                    </article>
                `;
            }).join('')}
        </div>
    `;
}

async function sendWishlistToMerchant() {
    const wishlist = readWishlist();
    if (!wishlist.length) {
        showToast('心愿单还没有镜框');
        return;
    }
    if (!currentUser?.uid) {
        showToast('请先登录，或在第 1 步创建临时配镜用户');
        renderOnboardStep();
        return;
    }

    const analysis = latestAnalysis || readWishlist()[0]?.analysis || buildAnalysis({});
    const prescription = savePrescriptionData(false);
    const prescriptionSummary = hasPrescriptionData(prescription)
        ? buildPrescriptionSummary(prescription)
        : '';
    const prescriptionChecklist = [
        '左右眼球镜度数',
        '左右眼柱镜/散光度数',
        '散光轴位',
        '单眼瞳距或总瞳距',
        '瞳高',
        '镜片类型与折射率'
    ];
    const createdOrders = wishlist.map(item => saveLocalGlassesOrder(item.frame, [
        `心愿单镜框：${item.frame?.name || '未命名镜框'}`,
        `脸宽 ${analysis.faceWidth}mm`,
        `瞳距 ${analysis.pd}mm`,
        `建议镜圈 ${analysis.recommendedLensWidth}mm`,
        `鼻梁 ${analysis.recommendedBridgeWidth}mm`,
        `移心量 ${analysis.decentration}mm`,
        prescriptionSummary ? `验光单：${prescriptionSummary}` : `需补充验光数据：${prescriptionChecklist.join('、')}`,
        analysis.customizationNote || '如需定制，可用最后一次采集数据继续沟通鼻托、镜腿和镜圈调整。'
    ].join(' / '), analysis));

    const messageText = prescriptionSummary
        ? `我发送了 ${wishlist.length} 款心愿单镜框、最后一次采集数据和验光单。请帮我确认适配、镜片厚度风险和是否需要定制。`
        : `我发送了 ${wishlist.length} 款心愿单镜框和最后一次采集数据。请帮我确认是否适合，并提醒我补充验光单：${prescriptionChecklist.join('、')}。`;
    const state = readLocalArray(`zz_glasses_chat_${createdOrders[0]?.merchantId || CHATGPT_MERCHANT.id}_${currentUser.uid}`);
    writeLocalArray(`zz_glasses_chat_${createdOrders[0]?.merchantId || CHATGPT_MERCHANT.id}_${currentUser.uid}`, prependUnique({
        id: `msg_${Date.now()}`,
        role: 'user',
        text: messageText,
        payload: {
            type: 'wishlist_package',
            wishlist,
            analysis,
            prescription,
            orders: createdOrders
        },
        createdAt: new Date().toISOString()
    }, state));
    try {
        const response = await fetch(`${API_BASE}/api/glasses/chat/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uid: currentUser.uid,
                role: 'customer',
                text: messageText,
                merchantId: createdOrders[0]?.merchantId || CHATGPT_MERCHANT.id,
                merchantName: createdOrders[0]?.merchantName || CHATGPT_MERCHANT.name,
                customerName: getDisplayUserName(),
                frame: wishlist[0]?.frame || null,
                analysis,
                orderId: createdOrders[0]?.id || '',
                payload: {
                    type: 'wishlist_package',
                    wishlist,
                    analysis,
                    prescription,
                    orders: createdOrders
                }
            })
        });
        if (!response.ok) throw new Error(`chat ${response.status}`);
        showToast(`已发送 ${createdOrders.length} 个意向单到服务器，聊天页可继续沟通`);
    } catch (error) {
        showToast(`已保存 ${createdOrders.length} 个本机意向单，网络恢复后可在聊天页继续发`);
    }
}

async function exportGlassesReportImage() {
    if (!latestAnalysis) {
        showToast('先完成一次识别或手动参数录入');
        return;
    }
    const blob = await buildReportImageBlob();
    downloadBlob(blob, `glasses-report-${Date.now()}.png`);
}

async function openGlassesReportImage() {
    if (!latestAnalysis) {
        showToast('先完成一次识别或手动参数录入');
        return;
    }
    const win = window.open('', '_blank');
    if (win) {
        win.document.write('<title>正在生成配镜报告</title><body style="margin:0;background:#eef5f3;display:grid;place-items:center;min-height:100vh;font:700 18px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#10202a;">正在生成配镜报告...</body>');
    }
    const blob = await buildReportImageBlob();
    const url = URL.createObjectURL(blob);
    if (!win) {
        downloadBlob(blob, `glasses-report-${Date.now()}.png`);
        return;
    }
    win.document.open();
    win.document.write(`<title>长按保存配镜报告</title><body style="margin:0;background:#eef5f3;display:grid;place-items:center;min-height:100vh;"><img src="${url}" alt="配镜报告" style="max-width:100%;height:auto;"></body>`);
    win.document.close();
}

async function exportTryOnSnapshot() {
    const dataUrl = await getTryOnSnapshotDataUrl();
    if (!dataUrl) {
        showToast('先完成单张生成或摄像头采集');
        return;
    }
    const blob = dataUrlToBlob(dataUrl);
    downloadBlob(blob, `glasses-tryon-${Date.now()}.png`);
}

async function openTryOnSnapshot() {
    const win = window.open('', '_blank');
    if (win) {
        win.document.write('<title>正在生成试戴图</title><body style="margin:0;background:#eef5f3;display:grid;place-items:center;min-height:100vh;font:700 18px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#10202a;">正在生成试戴图...</body>');
    }
    const dataUrl = await getTryOnSnapshotDataUrl();
    if (!dataUrl) {
        if (win) win.close();
        showToast('先完成单张生成或摄像头采集');
        return;
    }
    if (!win) {
        downloadBlob(dataUrlToBlob(dataUrl), `glasses-tryon-${Date.now()}.png`);
        return;
    }
    win.document.open();
    win.document.write(`<title>长按保存试戴图</title><body style="margin:0;background:#eef5f3;display:grid;place-items:center;min-height:100vh;"><img src="${dataUrl}" alt="试戴图" style="max-width:100%;height:auto;"></body>`);
    win.document.close();
}

function dataUrlToBlob(dataUrl) {
    const [header, data] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

function exportTryOnSnapshotLegacy() {
    const image = document.getElementById('face-preview-image');
    const overlay = document.getElementById('face-overlay-canvas');
    const video = document.getElementById('mediapipe-video');
    if ((!image || !image.currentSrc) && video?.videoWidth) {
        setPreviewFromCameraFrame(video);
        setTimeout(exportTryOnSnapshot, 180);
        return;
    }
    if (!image?.currentSrc || !overlay) {
        showToast('先完成单张生成或摄像头采集');
        return;
    }
    drawFaceOverlay();
    const canvas = document.createElement('canvas');
    canvas.width = overlay.width || 1200;
    canvas.height = overlay.height || 800;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const rect = getObjectContainRect(canvas, image);
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
        if (blob) downloadBlob(blob, `glasses-tryon-${Date.now()}.png`);
    }, 'image/png', 0.95);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

function wrapLines(ctx, text, x, y, maxWidth, lineHeight) {
    const chars = String(text || '').split('');
    let line = '';
    chars.forEach(char => {
        const test = line + char;
        if (ctx.measureText(test).width > maxWidth && line) {
            ctx.fillText(line, x, y);
            line = char;
            y += lineHeight;
        } else {
            line = test;
        }
    });
    if (line) ctx.fillText(line, x, y);
}

async function createGlassesOrder(frameId) {
    const frame = getFrameCatalog().find(item => item.id === frameId);
    if (!frame) {
        showToast('没有找到这款镜框');
        return;
    }
    if (!currentUser?.uid) {
        showToast('请先登录，登录后可把参数发送给商家');
        goToLogin();
        return;
    }

    const analysis = latestAnalysis || buildAnalysis({});
    const customParams = [
        `脸型 ${analysis.faceShape}`,
        `脸宽 ${analysis.faceWidth}mm`,
        `瞳距 ${analysis.pd}mm`,
        `建议镜圈宽度 ${analysis.recommendedLensWidth}mm`,
        `建议鼻梁宽 ${analysis.recommendedBridgeWidth}mm`,
        `移心量 ${analysis.decentration}mm`,
        analysis.bridgeLabel,
        analysis.templeLabel
    ].join(' / ');

    if (!REMOTE_SHOP_API_ENABLED) {
        const order = saveLocalGlassesOrder(frame, customParams, analysis);
        showToast(`已保存为本机意向单 ${order.id}，商家页可查看`);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/glasses/order/create-shop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uid: currentUser.uid,
                username: currentUser.nickname || currentUser.username || '戴镜用户',
                frame,
                customParams,
                analysis,
                note: '来自铮铮眼镜在线试戴页'
            })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || '订单提交失败');
        }
        showToast(`已发送给 ${frame.merchantName || '商家'}，订单号 ${data.orderId}`);
    } catch (error) {
        console.warn('Remote glasses order unavailable, saving locally:', error.message);
        const order = saveLocalGlassesOrder(frame, customParams, analysis);
        showToast(`已保存为本机意向单 ${order.id}，商家页可查看`);
    }
}

function saveLocalGlassesOrder(frame, customParams, analysis) {
    const merchantId = frame.merchantId || CHATGPT_MERCHANT.id;
    const order = {
        id: `local_order_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        uid: currentUser.uid,
        customerId: currentUser.uid,
        customerName: currentUser.nickname || currentUser.username || '戴镜用户',
        contact: currentUser.social?.wechat || currentUser.username || currentUser.uid,
        merchantId,
        merchantName: frame.merchantName || '眼镜商家',
        glassesId: frame.id,
        glassesName: frame.name,
        frame,
        customParams,
        analysis,
        status: 'pending',
        note: '来自铮铮眼镜在线试戴页，本机缓存订单',
        createdAt: new Date().toISOString(),
        source: 'local'
    };
    writeLocalArray(`zz_glasses_merchant_orders_${merchantId}`, prependUnique(order, readLocalArray(`zz_glasses_merchant_orders_${merchantId}`)));
    writeLocalArray(`zz_glasses_customer_orders_${currentUser.uid}`, prependUnique(order, readLocalArray(`zz_glasses_customer_orders_${currentUser.uid}`)));
    const existingMessages = readLocalArray(`zz_glasses_chat_${order.id}`);
    if (!existingMessages.length) {
        writeLocalArray(`zz_glasses_chat_${order.id}`, [
            {
                role: 'system',
                text: `已创建意向单 ${order.id}，商家可查看顾客采集参数、心愿镜框和定制说明。`,
                createdAt: order.createdAt
            },
            {
                role: 'customer',
                text: `我想咨询「${order.glassesName}」。${customParams}`,
                createdAt: order.createdAt
            }
        ]);
    }
    return order;
}

function prependUnique(item, list) {
    return [item, ...list.filter(existing => existing.id !== item.id)];
}

function readLocalArray(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(value) ? value : [];
    } catch (e) {
        return [];
    }
}

function writeLocalArray(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    queueServerSync(key, value);
}

function queueServerSync(type, payload) {
    const record = {
        id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type,
        uid: getCurrentUserId(),
        payload,
        createdAt: new Date().toISOString()
    };
    try {
        const queue = readLocalArray(SERVER_SYNC_QUEUE_KEY).slice(-30);
        localStorage.setItem(SERVER_SYNC_QUEUE_KEY, JSON.stringify([...queue, record]));
    } catch (error) {
        console.warn('Queue server sync failed:', error);
    }
    fetch(`${API_BASE}/api/glasses/session/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
    }).catch(error => console.warn('Remote session sync unavailable:', error.message));
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    const preview = e.currentTarget || document.getElementById('face-preview');
    if (preview) {
        preview.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const preview = e.currentTarget || document.getElementById('face-preview');
    if (preview) {
        preview.classList.remove('drag-over');
    }
}

function handlePhotoDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const preview = document.getElementById('face-preview');
    if (preview) {
        preview.classList.remove('drag-over');
    }
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        const fileInput = document.getElementById('face-photo-input');
        if (fileInput) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(files[0]);
            fileInput.files = dataTransfer.files;
            previewFacePhoto(fileInput);
        }
    }
}

function handleModalDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const modalPreview = document.getElementById('modal-photo-preview');
    if (modalPreview) {
        modalPreview.classList.remove('drag-over');
    }
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        const fileInput = document.getElementById('face-photo');
        if (fileInput) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(files[0]);
            fileInput.files = dataTransfer.files;
            handleModalPhotoUpload(fileInput);
        }
    }
}

function previewFacePhoto(input) {
    const previewImage = document.getElementById('face-preview-image');
    const placeholder = document.getElementById('face-preview-placeholder');
    const resultLayout = document.getElementById('face-result-layout');
    
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const fileType = file.type;
        
        if (!fileType.startsWith('image/')) {
            showToast('请上传图片文件');
            return;
        }

        currentFaceFile = file;
        updateRecognition('读取照片中', 24, 8);
        startModelingAnimation();
        
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                previewImage.dataset.mirrored = '0';
                previewImage.onload = () => drawFaceOverlay();
                previewImage.src = e.target.result;
                if (placeholder) placeholder.style.display = 'none';
                if (resultLayout) resultLayout.style.display = 'grid';
                
                const modalPhotoPreview = document.getElementById('modal-photo-preview');
                if (modalPhotoPreview) {
                    modalPhotoPreview.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; max-height: 200px; border-radius: 10px; object-fit: contain;" />`;
                }

                updateRecognition('等待 MediaPipe 测算', 48, 36);
                await autoAnalyzeFace(input.files[0]);
            } catch (err) {
                console.error('图片加载失败:', err);
                showToast('图片加载失败，请重试');
                updateRecognition('读取失败', 0, 0);
            }
        };
        reader.onerror = function() {
            showToast('图片读取失败');
            updateRecognition('读取失败', 0, 0);
        };
        reader.readAsDataURL(file);
    }
}

async function autoAnalyzeFace(file) {
    setText('face-shape', '识别中...');
    updateRecognition('正在识别人脸关键点', 76, 78);
    startModelingAnimation();

    try {
        const model = await analyzeWithFreeFaceModel(file);
        applyModelResult(model, buildLocalRecommendations(buildAnalysis(model)));

        setTimeout(() => {
            drawFaceOverlay();
        }, 100);
        showToast(getAnalysisSourceLabel(model.source));
        return;
    } catch (freeError) {
        console.warn('Free local face model failed:', freeError);
        setText('face-shape', '待重新采集');
        updateRecognition('MediaPipe 测算失败', 0, 0);
        showToast('MediaPipe 暂时没有测到清晰关键点，请换正脸照片或用摄像头采集');
    }
}

function handleModalPhotoUpload(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (!file.type.startsWith('image/')) {
            showToast('请上传图片文件');
            return;
        }

        currentFaceFile = file;
        
        const reader = new FileReader();
        reader.onload = async function(e) {
            const modalPhotoPreview = document.getElementById('modal-photo-preview');
            if (modalPhotoPreview) {
                modalPhotoPreview.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; max-height: 200px; border-radius: 10px; object-fit: contain;" />`;
            }
            
            const previewImage = document.getElementById('face-preview-image');
            const placeholder = document.getElementById('face-preview-placeholder');
            const resultLayout = document.getElementById('face-result-layout');
            if (previewImage && placeholder) {
                previewImage.dataset.mirrored = '0';
                previewImage.onload = () => drawFaceOverlay();
                previewImage.src = e.target.result;
                placeholder.style.display = 'none';
                if (resultLayout) resultLayout.style.display = 'grid';
            }

            await autoAnalyzeFace(input.files[0]);
        };
        reader.onerror = function() {
            showToast('图片读取失败');
        };
        reader.readAsDataURL(file);
    }
}

function startModelingAnimation() {
    const preview = document.getElementById('face-preview');
    if (!preview) return;
    
    preview.classList.add('scanning');
    
    setTimeout(() => {
        preview.classList.remove('scanning');
        preview.classList.add('modeling-complete');
    }, 2000);
}

function drawFaceOverlay() {
    const canvas = document.getElementById('face-overlay-canvas');
    const image = document.getElementById('face-preview-image');
    
    if (!canvas || !image || !image.currentSrc) return;
    
    const ctx = canvas.getContext('2d');
    const media = image.closest('.face-result-media') || image;
    const rect = media.getBoundingClientRect();
    
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const imageRect = getObjectContainRect(canvas, image);
    const mirrored = image.dataset.mirrored === '1';
    const points = latestPreviewMeshPoints?.length ? latestPreviewMeshPoints : (latestAnalysis?.previewMeshPoints?.length ? latestAnalysis.previewMeshPoints : latestAnalysis?.meshPoints || []);
    if (previewKeypointsEnabled && points.length) {
        drawPreviewKeypoints(ctx, imageRect, points, mirrored);
    }

    if (previewGlassesEnabled) {
        drawPreviewGlasses(ctx, imageRect, points, mirrored);
    }
}

function showFaceResultPanel() {
    const preview = document.getElementById('face-preview');
    const placeholder = document.getElementById('face-preview-placeholder');
    const resultLayout = document.getElementById('face-result-layout');
    if (preview) preview.classList.add('has-result');
    if (placeholder) placeholder.style.display = 'none';
    if (resultLayout) resultLayout.style.display = 'grid';
}

function setPreviewFromCameraFrame(video) {
    const previewImage = document.getElementById('face-preview-image');
    if (!previewImage || !video?.videoWidth || !video?.videoHeight) return;

    const dataUrl = captureCameraFrameDataUrl(video);
    if (!dataUrl) return;
    latestCameraFrameDataUrl = dataUrl;
    previewImage.dataset.mirrored = '1';
    previewImage.onload = () => drawFaceOverlay();
    previewImage.src = dataUrl;
    showFaceResultPanel();
}

function captureLatestCameraSnapshot() {
    const video = document.getElementById('mediapipe-video');
    if (!video?.videoWidth || !video?.videoHeight) return null;
    setPreviewFromCameraFrame(video);
    return latestCameraFrameDataUrl;
}

function captureCameraFrameDataUrl(video) {
    if (!video?.videoWidth || !video?.videoHeight) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
}

function getObjectContainRect(canvas, image) {
    const naturalWidth = image.naturalWidth || canvas.width;
    const naturalHeight = image.naturalHeight || canvas.height;
    const scale = Math.min(canvas.width / naturalWidth, canvas.height / naturalHeight);
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    return {
        x: (canvas.width - width) / 2,
        y: (canvas.height - height) / 2,
        width,
        height
    };
}

function mapPreviewPoint(rect, point, mirrored = false) {
    const x = mirrored ? 1 - point.x : point.x;
    return {
        x: rect.x + x * rect.width,
        y: rect.y + point.y * rect.height
    };
}

function drawPreviewKeypoints(ctx, rect, points, mirrored = false) {
    const drawPath = (indices, color, lineWidth = 2) => {
        ctx.beginPath();
        indices.forEach((index, order) => {
            const point = points[index];
            if (!point) return;
            const p = mapPreviewPoint(rect, point, mirrored);
            if (order === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    };

    drawPath([10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10], 'rgba(15, 118, 110, 0.72)', 2);
    drawPath([33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7, 33], 'rgba(255, 255, 255, 0.7)', 1.5);
    drawPath([362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382, 362], 'rgba(255, 255, 255, 0.7)', 1.5);

    ctx.fillStyle = 'rgba(15, 118, 110, 0.45)';
    for (let i = 0; i < points.length; i += 5) {
        const p = mapPreviewPoint(rect, points[i], mirrored);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawPreviewGlasses(ctx, rect, points, mirrored = false) {
    const frameImage = selectedFrameImage?.complete ? selectedFrameImage : null;
    if (!frameImage) return;
    const selectedFrame = getSelectedFrame();
    const overlayScale = Math.max(0.55, Math.min(1.75, Number(selectedFrame?.overlayScale || 1) * previewGlassesScale));

    if (points.length) {
        const leftEye = getPreviewEyeCenter(rect, points, 'left', mirrored);
        const rightEye = getPreviewEyeCenter(rect, points, 'right', mirrored);
        if (leftEye && rightEye) {
            const screenLeftEye = leftEye.x <= rightEye.x ? leftEye : rightEye;
            const screenRightEye = leftEye.x <= rightEye.x ? rightEye : leftEye;
            const pd = Math.max(40, Math.hypot(screenRightEye.x - screenLeftEye.x, screenRightEye.y - screenLeftEye.y));
            const angle = Math.atan2(screenRightEye.y - screenLeftEye.y, screenRightEye.x - screenLeftEye.x);
            const centerX = (screenLeftEye.x + screenRightEye.x) / 2 + previewGlassesOffsetX;
            const centerY = (screenLeftEye.y + screenRightEye.y) / 2 + pd * 0.12 + previewGlassesOffsetY;
            const frameW = pd * 3.55 * overlayScale;
            const frameH = frameW * (frameImage.naturalHeight / frameImage.naturalWidth);
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(angle + previewGlassesRotation * Math.PI / 180);
            ctx.globalAlpha = 0.96;
            ctx.drawImage(frameImage, -frameW / 2, -frameH / 2, frameW, frameH);
            ctx.restore();
            return;
        }
    }

    const frameW = rect.width * 0.42 * overlayScale;
    const frameH = frameW * (frameImage.naturalHeight / frameImage.naturalWidth);
    ctx.save();
    ctx.translate(rect.x + rect.width / 2 + previewGlassesOffsetX, rect.y + rect.height * 0.38 + previewGlassesOffsetY);
    ctx.rotate(previewGlassesRotation * Math.PI / 180);
    ctx.drawImage(frameImage, -frameW / 2, -frameH / 2, frameW, frameH);
    ctx.restore();
}

function getPreviewEyeCenter(rect, points, side, mirrored = false) {
    const irisIndices = side === 'left' ? [468, 469, 470, 471, 472] : [473, 474, 475, 476, 477];
    const contourIndices = side === 'left' ? [33, 133, 159, 145] : [362, 263, 386, 374];
    const hasIris = irisIndices.every(index => points[index]);
    return averagePreviewPoints(rect, points, hasIris ? irisIndices : contourIndices, mirrored);
}

function averagePreviewPoints(rect, points, indices, mirrored = false) {
    const valid = indices.map(index => points[index]).filter(Boolean).map(point => mapPreviewPoint(rect, point, mirrored));
    if (!valid.length) return null;
    return valid.reduce((acc, point) => ({
        x: acc.x + point.x / valid.length,
        y: acc.y + point.y / valid.length
    }), { x: 0, y: 0 });
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

Object.assign(window, {
    openFrameImageViewer,
    closeFrameImageViewer,
    selectFrameForTryOn,
    addSelectedFrameToWishlist,
    removeSelectedFrameFromWishlist,
    handleFrameImageError,
    retakeFacePhoto,
    recalibrateCurrentFace,
    requestKimiTryOnCorrection,
    savePrescriptionData,
    clearPrescriptionData,
    sendWishlistToMerchant
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        init();
        drawModelPreview();
    });
} else {
    init();
    drawModelPreview();
}
