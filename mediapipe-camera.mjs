const TASKS_VERSION = '0.10.35';
const TASKS_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`;
const TASKS_MODULE_URLS = [
    `${TASKS_BASE}/vision_bundle.mjs`,
    `https://unpkg.com/@mediapipe/tasks-vision@${TASKS_VERSION}/vision_bundle.mjs`
];
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';

let visionTasksPromise = null;
const landmarkerPromises = new Map();

const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
const LEFT_EYE = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7, 33];
const RIGHT_EYE = [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382, 362];
const NOSE = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164];
const MOUTH = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
const GLASSES_ASSET_BASE = 'https://glasses.zhengzhengstudio.cn/assets/';
const GLASSES_IMAGE_SOURCES = {
    round: `${GLASSES_ASSET_BASE}glasses-frame-gold-round-v2.png`,
    square: `${GLASSES_ASSET_BASE}glasses-frame-black-rectangle-v1.png`,
    fashion: `${GLASSES_ASSET_BASE}glasses-frame-green-cateye-v2.png`,
    aviator: `${GLASSES_ASSET_BASE}glasses-frame-brown-aviator-v1.png`,
    clear: `${GLASSES_ASSET_BASE}glasses-frame-clear-square-v1.png`,
    tortoise: `${GLASSES_ASSET_BASE}glasses-frame-tortoise-squircle-v1.png`,
    halfRim: `${GLASSES_ASSET_BASE}glasses-frame-silver-half-rim-v1.png`,
    sport: `${GLASSES_ASSET_BASE}glasses-frame-navy-sport-v1.png`
};
const glassesImageCache = new Map();

export const ACTION_STEPS = [
    { id: 'front', label: '看镜头', hint: '看向屏幕中央，保持一小会儿' },
    { id: 'left', label: '左转', hint: '慢慢向左转头，不要移出画面' },
    { id: 'right', label: '右转', hint: '慢慢向右转头，不要移出画面' },
    { id: 'up', label: '抬头', hint: '轻轻抬头，让鼻梁和镜腿角度更清楚' },
    { id: 'down', label: '低头', hint: '轻轻低头，补充鼻托和镜框高度判断' },
    { id: 'mouth', label: '张嘴', hint: '自然张嘴一下，用来确认是真人动作' },
    { id: 'blink', label: '眨眼', hint: '自然眨一下眼，用来补充活体动作' }
];

async function loadVisionTasks() {
    if (!visionTasksPromise) {
        visionTasksPromise = importFirstAvailable(TASKS_MODULE_URLS).then(async mod => {
            const fileset = await mod.FilesetResolver.forVisionTasks(`${TASKS_BASE}/wasm`);
            return { mod, fileset };
        });
    }
    return visionTasksPromise;
}

async function importFirstAvailable(urls) {
    let lastError = null;

    for (const url of urls) {
        try {
            return await import(url);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('MediaPipe vision module unavailable');
}

export async function getFaceLandmarker(runningMode = 'IMAGE') {
    if (!landmarkerPromises.has(runningMode)) {
        landmarkerPromises.set(runningMode, (async () => {
            const { mod, fileset } = await loadVisionTasks();
            return mod.FaceLandmarker.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: MODEL_URL,
                    delegate: 'GPU'
                },
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: true,
                runningMode,
                numFaces: 1
            });
        })().catch(async () => {
            const { mod, fileset } = await loadVisionTasks();
            return mod.FaceLandmarker.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: MODEL_URL
                },
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: true,
                runningMode,
                numFaces: 1
            });
        }));
    }

    return landmarkerPromises.get(runningMode);
}

export async function detectFaceFromImage(image) {
    const landmarker = await getFaceLandmarker('IMAGE');
    const result = landmarker.detect(image);
    const landmarks = result.faceLandmarks?.[0] || null;
    return {
        landmarks,
        hasFace: Boolean(landmarks && landmarks.length),
        matrix: result.facialTransformationMatrixes?.[0] || null
    };
}

export async function createMediapipeCamera(options) {
    const {
        video,
        canvas,
        onResult = () => {},
        onStatus = () => {},
        facingMode = 'user',
        drawMesh = true,
        drawGlasses = true,
        glassesStyle = 'round',
        landmarker: externalLandmarker = null
    } = options;

    if (!video || !canvas) {
        throw new Error('video and canvas are required');
    }

    onStatus('loading');
    const landmarker = externalLandmarker || await getFaceLandmarker('VIDEO');
    const stream = await openCameraStream(facingMode);

    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    await video.play();

    let active = true;
    let lastVideoTime = -1;
    let lastResult = null;
    let lastDetectAt = 0;
    let currentDrawMesh = drawMesh;
    let currentDrawGlasses = drawGlasses;
    let currentGlassesStyle = glassesStyle;
    const ctx = canvas.getContext('2d');

    const isMobile = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches;
    const baseMinInterval = faceActionCaptureActive() ? 42 : (isMobile ? 100 : 58);

    function loop() {
        if (!active) return;
        const vw = video.videoWidth || 1;
        const vh = video.videoHeight || 1;
        if (canvas.width !== vw) canvas.width = vw;
        if (canvas.height !== vh) canvas.height = vh;

        const now = performance.now();
        const minDetectInterval = faceActionCaptureActive() ? 42 : baseMinInterval;
        if (video.currentTime !== lastVideoTime && now - lastDetectAt >= minDetectInterval) {
            lastVideoTime = video.currentTime;
            lastDetectAt = now;
            const result = landmarker.detectForVideo(video, now);
            const landmarks = result.faceLandmarks?.[0] || null;
            clearCanvas(ctx, canvas);

            if (landmarks) {
                if (currentDrawMesh) drawFaceMesh(ctx, canvas, landmarks);
                if (currentDrawGlasses) drawGlassesOverlay(ctx, canvas, landmarks, currentGlassesStyle);
                lastResult = {
                    landmarks,
                    width: vw,
                    height: vh,
                    matrix: result.facialTransformationMatrixes?.[0] || null,
                    action: analyzeFaceAction(landmarks)
                };
                onResult(lastResult);
            } else {
                onResult(null);
            }
        }

        requestAnimationFrame(loop);
    }

    onStatus('running');
    loop();

    return {
        stop() {
            active = false;
            clearCanvas(ctx, canvas);
            stream.getTracks().forEach(track => track.stop());
            video.srcObject = null;
            onStatus('stopped');
        },
        async switchCamera(newFacingMode) {
            if (!newFacingMode || newFacingMode === facingMode) return;
            onStatus('loading');
            stream.getTracks().forEach(track => track.stop());
            const newStream = await openCameraStream(newFacingMode);
            video.srcObject = newStream;
            await video.play();
            onStatus('running');
        },
        setDrawMesh(value) {
            currentDrawMesh = Boolean(value);
        },
        setDrawGlasses(value) {
            currentDrawGlasses = Boolean(value);
        },
        setGlassesStyle(value) {
            currentGlassesStyle = value || 'round';
        },
        getLastResult() {
            return lastResult;
        }
    };
}

function faceActionCaptureActive() {
    try {
        return Boolean(document.querySelector('.camera-action-guide.is-capturing'));
    } catch (error) {
        return false;
    }
}

async function openCameraStream(facingMode) {
    const video = preferredVideoConstraints(facingMode);

    try {
        return await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (error) {
        return navigator.mediaDevices.getUserMedia({
            video: {
                facingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
    }
}

function preferredVideoConstraints(facingMode) {
    const isPortraitViewport = typeof window !== 'undefined'
        && (window.innerHeight > window.innerWidth || window.matchMedia?.('(max-width: 720px)').matches);
    const isMobile = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches;

    if (isMobile) {
        return {
            facingMode,
            width: { ideal: 640 },
            height: { ideal: 480 },
            aspectRatio: { ideal: 1.333333 }
        };
    }

    if (isPortraitViewport) {
        return {
            facingMode,
            width: { ideal: 720 },
            height: { ideal: 1280 },
            aspectRatio: { ideal: 0.75 }
        };
    }

    return {
        facingMode,
        width: { ideal: 1280 },
        height: { ideal: 960 },
        aspectRatio: { ideal: 1.333333 }
    };
}

export function analyzeFaceAction(landmarks) {
    const leftCheek = landmarks[234] || landmarks[93];
    const rightCheek = landmarks[454] || landmarks[323];
    const nose = landmarks[1] || landmarks[4];
    const forehead = landmarks[10];
    const chin = landmarks[152];
    const upperLip = landmarks[13];
    const lowerLip = landmarks[14];
    const leftEye = averageRawPoints(landmarks, [33, 133, 159, 145]);
    const rightEye = averageRawPoints(landmarks, [362, 263, 386, 374]);
    const leftEyeOpen = normalizedDistance(landmarks[159], landmarks[145]);
    const rightEyeOpen = normalizedDistance(landmarks[386], landmarks[374]);

    const faceWidth = Math.max(0.001, Math.abs(rightCheek.x - leftCheek.x));
    const faceHeight = Math.max(0.001, Math.abs(chin.y - forehead.y));
    const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
    const eyeCenterY = (leftEye.y + rightEye.y) / 2;
    const yaw = (nose.x - faceCenterX) / faceWidth;
    const pitch = (nose.y - eyeCenterY) / faceHeight;
    const mouthOpen = normalizedDistance(upperLip, lowerLip) / faceHeight;
    const eyeOpen = ((leftEyeOpen + rightEyeOpen) / 2) / faceHeight;

    return {
        yaw: Number(yaw.toFixed(3)),
        pitch: Number(pitch.toFixed(3)),
        mouthOpen: Number(mouthOpen.toFixed(3)),
        eyeOpen: Number(eyeOpen.toFixed(3)),
        matched: {
            front: Math.abs(yaw) < 0.05 && mouthOpen < 0.04 && eyeOpen > 0.01,
            left: yaw > 0.05,
            right: yaw < -0.05,
            up: pitch < 0.3,
            down: pitch > 0.4,
            mouth: mouthOpen > 0.042,
            blink: eyeOpen < 0.015
        }
    };
}

function averageRawPoints(landmarks, indices) {
    const points = indices.map(index => landmarks[index]).filter(Boolean);
    const sum = points.reduce((acc, point) => ({
        x: acc.x + point.x,
        y: acc.y + point.y,
        z: acc.z + (point.z || 0)
    }), { x: 0, y: 0, z: 0 });
    return {
        x: sum.x / points.length,
        y: sum.y / points.length,
        z: sum.z / points.length
    };
}

function normalizedDistance(a, b) {
    if (!a || !b) return 0;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function clearCanvas(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function pointToCanvas(canvas, point) {
    return {
        x: point.x * canvas.width,
        y: point.y * canvas.height
    };
}

function drawPath(ctx, canvas, landmarks, indices, color, lineWidth = 2) {
    ctx.beginPath();
    indices.forEach((index, order) => {
        const point = landmarks[index];
        if (!point) return;
        const p = pointToCanvas(canvas, point);
        if (order === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}

function drawFaceMesh(ctx, canvas, landmarks) {
    drawPath(ctx, canvas, landmarks, FACE_OVAL, 'rgba(45, 128, 120, 0.95)', 3);
    drawPath(ctx, canvas, landmarks, LEFT_EYE, 'rgba(255, 255, 255, 0.75)', 2);
    drawPath(ctx, canvas, landmarks, RIGHT_EYE, 'rgba(255, 255, 255, 0.75)', 2);
    drawPath(ctx, canvas, landmarks, NOSE, 'rgba(234, 116, 83, 0.8)', 2);
    drawPath(ctx, canvas, landmarks, MOUTH, 'rgba(255, 255, 255, 0.45)', 1.5);

    ctx.fillStyle = 'rgba(45, 128, 120, 0.42)';
    for (let i = 0; i < landmarks.length; i += 4) {
        const p = pointToCanvas(canvas, landmarks[i]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawGlassesOverlay(ctx, canvas, landmarks, style) {
    const leftEye = getEyeCenter(canvas, landmarks, 'left');
    const rightEye = getEyeCenter(canvas, landmarks, 'right');
    if (!leftEye || !rightEye) return;

    const screenLeftEye = leftEye.x <= rightEye.x ? leftEye : rightEye;
    const screenRightEye = leftEye.x <= rightEye.x ? rightEye : leftEye;
    const pd = Math.max(40, distance(screenLeftEye, screenRightEye));
    const image = getGlassesImage(style);
    if (!image || !image.complete || !image.naturalWidth) return;

    ctx.save();
    const angle = Math.atan2(screenRightEye.y - screenLeftEye.y, screenRightEye.x - screenLeftEye.x);
    const centerX = (screenLeftEye.x + screenRightEye.x) / 2 + Number(style?.offsetX || 0);
    const centerY = (screenLeftEye.y + screenRightEye.y) / 2 + pd * 0.12 + Number(style?.offsetY || 0);
    const overlayScale = Number(style?.scale || style?.overlayScale || 1);
    const extraRotation = Number(style?.rotation || 0) * Math.PI / 180;
    const overlayWidth = pd * 3.55 * Math.max(0.72, Math.min(1.45, overlayScale));
    const overlayHeight = overlayWidth * (image.naturalHeight / image.naturalWidth);
    ctx.translate(centerX, centerY);
    ctx.rotate(angle + extraRotation);
    ctx.globalAlpha = 0.96;
    ctx.drawImage(image, -overlayWidth / 2, -overlayHeight / 2, overlayWidth, overlayHeight);
    ctx.restore();
}

function getEyeCenter(canvas, landmarks, side) {
    const iris = side === 'left' ? [468, 469, 470, 471, 472] : [473, 474, 475, 476, 477];
    const contour = side === 'left' ? [33, 133, 159, 145] : [362, 263, 386, 374];
    const hasIris = iris.every(index => landmarks[index]);
    return averagePoints(canvas, landmarks, hasIris ? iris : contour);
}

function getGlassesImage(style = 'round') {
    const src = resolveGlassesSource(style);
    if (!glassesImageCache.has(src)) {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.decoding = 'async';
        image.src = src;
        glassesImageCache.set(src, image);
    }
    return glassesImageCache.get(src);
}

function resolveGlassesSource(style = 'round') {
    if (style && typeof style === 'object') {
        return resolveGlassesSource(style.src || style.image || style.url || style.id || 'round');
    }
    if (typeof style === 'string' && /^(https?:|data:|blob:|\.?\/|assets\/)/i.test(style)) {
        return style;
    }
    return GLASSES_IMAGE_SOURCES[style] || GLASSES_IMAGE_SOURCES.round;
}

function averagePoints(canvas, landmarks, indices) {
    const points = indices.map(index => landmarks[index]).filter(Boolean);
    if (!points.length) return null;
    const sum = points.reduce((acc, point) => {
        const p = pointToCanvas(canvas, point);
        return { x: acc.x + p.x, y: acc.y + p.y };
    }, { x: 0, y: 0 });
    return {
        x: sum.x / points.length,
        y: sum.y / points.length
    };
}

function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}
