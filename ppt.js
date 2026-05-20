const PPT_SLIDES = [
    '封面',
    '真实问题',
    '产品四步走',
    '线上首页截图',
    '引导流程截图',
    '试戴页截图',
    '报告页截图',
    '商家沟通截图',
    '技术路线',
    '字体与视觉',
    '隐私与边界',
    '完成度与下一步',
    'Kimi 接入',
    '结尾'
];

const PPT_ASSET_VERSION = '20260520-private2';
let pptIndex = 0;
let pptTimer = null;

function padSlide(index) {
    return String(index + 1).padStart(2, '0');
}

function slidePath(index) {
    return `assets/ppt/preview-private-v2/slide-${padSlide(index)}.png?v=${PPT_ASSET_VERSION}`;
}

function renderPpt() {
    const image = document.getElementById('ppt-slide');
    const title = document.getElementById('ppt-title');
    const counter = document.getElementById('ppt-counter');
    const bar = document.getElementById('ppt-progress-bar');

    image.src = slidePath(pptIndex);
    image.alt = `铮铮眼镜 PPT 第 ${pptIndex + 1} 页：${PPT_SLIDES[pptIndex]}`;
    title.textContent = PPT_SLIDES[pptIndex];
    counter.textContent = `${pptIndex + 1} / ${PPT_SLIDES.length}`;
    bar.style.width = `${((pptIndex + 1) / PPT_SLIDES.length) * 100}%`;

    document.querySelectorAll('.ppt-thumb').forEach((thumb, index) => {
        thumb.classList.toggle('active', index === pptIndex);
        thumb.setAttribute('aria-current', index === pptIndex ? 'true' : 'false');
    });
}

function goPpt(delta) {
    pptIndex = (pptIndex + delta + PPT_SLIDES.length) % PPT_SLIDES.length;
    renderPpt();
}

function setPpt(index) {
    pptIndex = Math.max(0, Math.min(PPT_SLIDES.length - 1, index));
    renderPpt();
}

function stopPpt() {
    if (pptTimer) clearInterval(pptTimer);
    pptTimer = null;
    const play = document.getElementById('ppt-play');
    if (play) play.textContent = '播放';
}

function togglePptPlay() {
    if (pptTimer) {
        stopPpt();
        return;
    }
    const play = document.getElementById('ppt-play');
    if (play) play.textContent = '暂停';
    pptTimer = setInterval(() => goPpt(1), 3200);
}

function buildThumbs() {
    const box = document.getElementById('ppt-thumbs');
    if (!box) return;
    box.innerHTML = PPT_SLIDES.map((name, index) => `
        <button class="ppt-thumb" type="button" data-index="${index}" aria-label="查看第 ${index + 1} 页：${name}">
            <img src="${slidePath(index)}" alt="">
            <span>${padSlide(index)}</span>
        </button>
    `).join('');
    box.querySelectorAll('.ppt-thumb').forEach(button => {
        button.addEventListener('click', () => {
            stopPpt();
            setPpt(Number(button.dataset.index));
        });
    });
}

function carryUserToPptLinks() {
    const rawUser = new URLSearchParams(window.location.search).get('user');
    if (!rawUser) return;
    document.querySelectorAll('.carry-user-link').forEach(link => {
        const url = new URL(link.getAttribute('href'), window.location.href);
        url.searchParams.set('user', rawUser);
        link.href = url.href;
    });
}

function initPpt() {
    carryUserToPptLinks();
    buildThumbs();
    renderPpt();

    document.getElementById('ppt-prev')?.addEventListener('click', () => {
        stopPpt();
        goPpt(-1);
    });
    document.getElementById('ppt-next')?.addEventListener('click', () => {
        stopPpt();
        goPpt(1);
    });
    document.getElementById('ppt-play')?.addEventListener('click', togglePptPlay);
    document.getElementById('ppt-fullscreen')?.addEventListener('click', () => {
        const stage = document.getElementById('ppt-stage');
        if (stage?.requestFullscreen) stage.requestFullscreen();
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'ArrowRight' || event.key === ' ') {
            event.preventDefault();
            stopPpt();
            goPpt(1);
        }
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            stopPpt();
            goPpt(-1);
        }
        if (event.key === 'Escape') stopPpt();
    });
}

document.addEventListener('DOMContentLoaded', initPpt);
