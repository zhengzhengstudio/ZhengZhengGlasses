(function initSavePage() {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    const title = document.getElementById('save-page-title');
    const hint = document.getElementById('save-page-hint');
    const stage = document.getElementById('save-page-stage');
    const download = document.getElementById('save-page-download');
    const openButton = document.getElementById('save-page-open');
    const shareButton = document.getElementById('save-page-share');
    const wechatButton = document.getElementById('save-page-wechat');

    function readPayload() {
        if (!key) return null;
        const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (error) {
            console.warn('Invalid save payload:', error);
            return null;
        }
    }

    function renderMissing() {
        title.textContent = '图片已过期';
        hint.textContent = '保存页只保留本次会话生成的图片。请回到试戴流程重新生成。';
        stage.innerHTML = '<p class="save-page-empty">没有读取到图片。</p>';
        download.setAttribute('aria-disabled', 'true');
        download.removeAttribute('href');
        openButton.disabled = true;
        shareButton.disabled = true;
        wechatButton.disabled = true;
    }

    const payload = readPayload();
    if (!payload?.dataUrl || (payload.expiresAt && payload.expiresAt < Date.now())) {
        renderMissing();
        return;
    }

    title.textContent = payload.title || '铮铮眼镜图片';
    hint.textContent = navigator.maxTouchPoints > 0
        ? '可用系统分享，也可在微信内点“微信内分享”。不支持时可长按图片保存。'
        : '右键图片可以另存；也可以使用下面的下载按钮。';
    stage.innerHTML = '';
    const image = document.createElement('img');
    image.src = payload.dataUrl;
    image.alt = payload.title || '铮铮眼镜图片';
    stage.appendChild(image);

    download.href = payload.dataUrl;
    download.download = payload.filename || `glasses-image-${Date.now()}.png`;
    openButton.addEventListener('click', () => {
        const win = window.open(payload.dataUrl, '_blank', 'noopener');
        if (!win) window.location.href = payload.dataUrl;
    });
    shareButton.addEventListener('click', async () => {
        const filename = payload.filename || `glasses-image-${Date.now()}.png`;
        const blob = dataUrlToBlob(payload.dataUrl);
        const file = new File([blob], filename, { type: blob.type || 'image/png' });
        try {
            if (navigator.canShare?.({ files: [file] }) && navigator.share) {
                await navigator.share({
                    title: payload.title || '铮铮眼镜图片',
                    text: '来自铮铮眼镜的试戴或配镜报告图片，可分享到微信。',
                    files: [file]
                });
                return;
            }
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.warn('Share image failed:', error);
        }
        download.click();
        if (/MicroMessenger/i.test(navigator.userAgent || '')) {
            hint.textContent = '微信内浏览器不支持直接发图片时，请长按图片保存，或点右上角分享。';
        } else {
            hint.textContent = '当前浏览器不能直接调起微信，已改为下载图片。';
        }
    });
    wechatButton.addEventListener('click', () => {
        if (!/MicroMessenger/i.test(navigator.userAgent || '')) {
            hint.textContent = '当前不在微信浏览器内，已为你打开系统分享。';
            shareButton.click();
            return;
        }
        const bridge = window.WeixinJSBridge;
        if (!bridge?.invoke) {
            hint.textContent = '微信分享组件还没准备好，请稍等一秒再点。';
            document.addEventListener('WeixinJSBridgeReady', () => wechatButton.click(), { once: true });
            return;
        }
        try {
            bridge.invoke('sendAppMessage', {
                appid: '',
                img_url: payload.dataUrl,
                img_width: '640',
                img_height: '640',
                link: window.location.href.split('#')[0],
                title: payload.title || '铮铮眼镜图片',
                desc: '来自铮铮眼镜的试戴或配镜报告图片'
            }, result => {
                const message = String(result?.err_msg || '');
                hint.textContent = /ok|confirm/i.test(message)
                    ? '已打开微信分享。'
                    : '微信限制直接发图片时，请点右上角“...”分享，或长按图片保存后发给好友。';
            });
        } catch (error) {
            console.warn('Wechat direct share failed:', error);
            hint.textContent = '微信限制直接发图片时，请点右上角“...”分享，或长按图片保存后发给好友。';
        }
    });

    if (key) {
        setTimeout(() => {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.warn('Clear save payload failed:', error);
            }
        }, 5000);
    }

    function dataUrlToBlob(dataUrl) {
        const [header, data] = dataUrl.split(',');
        const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    }
}());
