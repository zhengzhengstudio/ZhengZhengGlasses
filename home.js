function readUserFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('user');
    if (!raw) return null;
    try {
        return JSON.parse(decodeURIComponent(raw));
    } catch (error) {
        console.warn('Parse user from URL failed:', error);
        return null;
    }
}

function readCurrentUser() {
    const urlUser = readUserFromUrl();
    if (urlUser?.uid) {
        if (urlUser.temporary) {
            sessionStorage.setItem('zz_glasses_temp_user', JSON.stringify(urlUser));
        } else {
            localStorage.setItem('zz_passport_user', JSON.stringify(urlUser));
        }
        return urlUser;
    }
    const tempUser = safeParseSessionUser();
    if (tempUser?.uid) return tempUser;
    try {
        return JSON.parse(localStorage.getItem('zz_passport_user') || 'null');
    } catch (error) {
        console.warn('Parse saved user failed:', error);
        return null;
    }
}

function safeParseSessionUser() {
    try {
        const user = JSON.parse(sessionStorage.getItem('zz_glasses_temp_user') || 'null');
        return user?.temporary ? user : null;
    } catch (error) {
        return null;
    }
}

function readHomeState(user = readCurrentUser()) {
    try {
        const uid = user?.uid || 'anonymous';
        const scoped = localStorage.getItem(`zz_glasses_home_state_${uid}`);
        if (user?.uid) return JSON.parse(scoped || 'null');
        return JSON.parse(scoped || localStorage.getItem('zz_glasses_home_state') || 'null');
    } catch (error) {
        console.warn('Parse glasses state failed:', error);
        return null;
    }
}

function readLocalArray(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(value) ? value : [];
    } catch (error) {
        return [];
    }
}

function carryUserToInternalLinks(user) {
    const rawUser = new URLSearchParams(window.location.search).get('user');
    const userParam = rawUser || (user?.uid ? JSON.stringify(user) : '');
    if (!userParam) return;

    document.querySelectorAll('.carry-user-link').forEach(link => {
        const url = new URL(link.getAttribute('href'), window.location.href);
        url.searchParams.set('user', userParam);
        link.href = url.href;
    });
}

function buildPassportUrl(page) {
    const redirect = new URL(window.location.href);
    redirect.searchParams.delete('passport_uid');
    const url = new URL(`https://zhengzhengstudio.cn/passport/${page}.html`);
    url.searchParams.set('redirect', redirect.href);
    url.searchParams.set('from', 'glasses');
    return url.href;
}

function updateAuthLinks() {
    const login = document.getElementById('home-login-link');
    const register = document.getElementById('home-register-link');
    if (login) login.href = buildPassportUrl('login');
    if (register) register.href = buildPassportUrl('register');
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderHomeState(user) {
    const state = readHomeState(user);
    const analysis = state?.analysis;
    const frame = state?.selectedFrame;
    const uid = user?.uid || 'anonymous';
    const wishlist = readLocalArray(`zz_glasses_wishlist_${uid}`);
    const orders = readLocalArray(`zz_glasses_customer_orders_${uid}`);

    if (analysis) {
        setText('home-data-title', '这是你上次采集到的配镜数据');
        setText('home-face-shape', analysis.faceShape || '-');
        setText('home-face-width', analysis.faceWidth ? `${analysis.faceWidth} mm` : '-');
        setText('home-pd', analysis.pd ? `${analysis.pd} mm` : '-');
        setText('home-lens-width', analysis.recommendedLensWidth ? `${analysis.recommendedLensWidth} mm` : '-');
        setText('home-decentration', Number.isFinite(Number(analysis.decentration)) ? `${analysis.decentration} mm` : '-');
        setText('home-fit-score', analysis.fitScore ? `${analysis.fitScore}/100` : '-');
        setText('home-save-state', '已有采集记录');
        setText('home-next-step', '查看/继续试戴');
    }

    if (frame) {
        const image = document.getElementById('home-current-frame');
        if (image && frame.image) {
            image.src = new URL(frame.image, window.location.href).href;
            image.alt = frame.imageAlt || frame.name || '当前试戴镜框';
        }
        setText('home-frame-caption', `${frame.name || '当前镜框'}，${frame.merchantName || 'CHATGPT'} · ${frame.type || '镜框'}`);
        setText('home-frame-name', frame.name || '已选择镜框');
        setText('home-frame-note', `镜圈 ${frame.lensWidth || '-'} mm / 鼻梁 ${frame.bridgeSize || '-'} mm / 镜腿 ${frame.templeLength || '-'} mm`);
    }

    setText('home-status-user', user?.uid ? (user.temporary ? '临时配镜用户' : '通行证账号') : '匿名体验');
    setText('home-status-record', analysis ? `${analysis.fitScore || '-'} 分 · ${analysis.faceShape || '-'}` : '未采集');
    setText('home-status-wishlist', `${wishlist.length} 款`);
    setText('home-status-chat', orders.length ? `${orders.length} 个意向单` : '未发送');
}

function renderHomeUser() {
    updateAuthLinks();
    const user = readCurrentUser();
    carryUserToInternalLinks(user);
    renderHomeState(user);

    if (!user?.uid) {
        setText('home-user-name', '匿名用户');
        setText('home-status-user', '匿名体验');
        return;
    }

    const isTemporary = Boolean(user.temporary);
    const name = user.nickname || user.username || (isTemporary ? '临时配镜用户' : '已登录用户');
    const profileTitle = document.getElementById('home-profile-title');
    const profileDesc = document.getElementById('home-profile-desc');
    const userName = document.getElementById('home-user-name');
    const saveState = document.getElementById('home-save-state');
    const nextStep = document.getElementById('home-next-step');
    const actions = document.getElementById('home-user-actions');

    profileTitle.textContent = `${name}，可以继续上次的试戴流程`;
    profileDesc.textContent = isTemporary
        ? '这是当前浏览器会话里的临时配镜用户。可以继续录入、试戴和导出，正式保存再登录通行证账号。'
        : '你的登录状态已识别，进入客户流程后可以继续录入、查看参数和发送给商家。';
    userName.textContent = name;
    saveState.textContent = readHomeState(user)?.analysis ? '已有采集记录' : (isTemporary ? '会话内保存' : '可保存');
    nextStep.textContent = readHomeState(user)?.analysis ? '查看/继续试戴' : '继续试戴';
    actions.innerHTML = `
        <span class="home-user-pill">${name}${isTemporary ? ' · 临时' : ''}</span>
        <button class="btn btn-secondary" type="button" id="home-logout">${isTemporary ? '清除临时用户' : '退出'}</button>
    `;
    document.getElementById('home-logout').addEventListener('click', () => {
        localStorage.removeItem('zz_passport_user');
        sessionStorage.removeItem('zz_glasses_temp_user');
        sessionStorage.setItem('zz_glasses_ignore_user_param', '1');
        const clean = new URL(window.location.href);
        clean.searchParams.delete('user');
        window.location.replace(`${clean.pathname}${clean.search}${clean.hash}`);
    });
}

document.addEventListener('DOMContentLoaded', renderHomeUser);
