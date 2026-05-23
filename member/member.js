// =============================================================================
//  MEMBER PROFILE ENGINE // DOMD-TOOLKIT 
// =============================================================================

const CONFIG = {
    DATA_URL: '../contents/data.json', 
    CRT_SCROLL_PADDING: 40,
    SPEED: {
        NORMAL: { TEXT_DELAY: 8, TEXT_STEP: 1, HTML_DELAY: 8, HTML_STEP: 1, LINE_DELAY: 220, IMG_SCAN_SPEED: 240, IMG_MIN_TIME: 0.8, CODE_CHAR: 5, CODE_LINE: 10, PAUSE_MULT: 1 },
        FAST: { TEXT_DELAY: 0, TEXT_STEP: 8, HTML_DELAY: 0, HTML_STEP: 8, LINE_DELAY: 0, IMG_SCAN_SPEED: 600, IMG_MIN_TIME: 0.4, CODE_CHAR: 0, CODE_LINE: 0, PAUSE_MULT: 0.25 }
    }
};

let fileSystem = null;
let state = {
    isBooting: true, mode: 'NONE', speedMode: 'NORMAL', skipRender: false
};

const outputDiv = document.getElementById('terminal-output');
const globalCursor = document.getElementById('global-cursor');

const getSpeed = () => CONFIG.SPEED[state.speedMode];
const sleep = ms => new Promise(r => setTimeout(r, state.skipRender ? 0 : ms));

function scrollToBottom() {
    const screen = document.querySelector('.screen');
    if (screen) screen.scrollTop = screen.scrollHeight;
}

// =============================================================================
//  URL 解析与降维寻址器
// =============================================================================

function getMemberIdFromUrl() {
    let id = null;
    if (window.location.hash) {
        id = window.location.hash.substring(1);
    } else {
        const params = new URLSearchParams(window.location.search);
        if (params.get('id')) id = params.get('id');
        else {
            const pathParts = window.location.pathname.split('/').filter(p => p.length > 0);
            const lastPart = pathParts[pathParts.length - 1];
            if (lastPart && lastPart !== 'members' && !lastPart.includes('.html')) id = lastPart;
        }
    }
    return id;
}

function findMemberData(fileSystem, memberId) {
    if (!memberId || !fileSystem.root) return null;
    
    const normalizedTarget = memberId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const teamMenu = fileSystem.root.find(node => node.label === "TEAM & CVs" && node.type === "menu");
    if (!teamMenu || !teamMenu.items) return null;

    return teamMenu.items.find(member => {
        const normalizedLabel = member.label.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normalizedLabel === normalizedTarget;
    });
}

// =============================================================================
//  核心渲染物理引擎
// =============================================================================

async function typeText(text, customDelay = null, className = '') {
    if (!text) return;
    const lineDiv = document.createElement('div');
    lineDiv.className = `output-line ${className}`; 
    outputDiv.appendChild(lineDiv);

    const speed = getSpeed();
    const delay = customDelay !== null ? customDelay : speed.TEXT_DELAY; 
    let i = 0, burstCount = 0;
    let currentBurstTarget = Math.floor(Math.random() * 4) + 2; 

    while (i < text.length) {
        let currentStep = state.skipRender ? 30 : speed.TEXT_STEP;
        const chunk = text.substring(i, i + currentStep);
        lineDiv.textContent += chunk;
        i += currentStep;
        burstCount++;

        if (state.skipRender) {
            scrollToBottom();
            await new Promise(r => setTimeout(r, 5)); 
            continue; 
        }

        const isPunctuation = /[.!?。！？]/.test(chunk);
        const isSpace = /\s/.test(chunk);
        
        if (burstCount >= currentBurstTarget || isPunctuation || isSpace) {
            scrollToBottom();
            if (delay > 0) {
                let baseDelay = delay;
                if (isPunctuation) baseDelay = delay * 5;
                else if (isSpace) baseDelay = delay * 1.5;
                await sleep((baseDelay * burstCount) + (Math.random() - 0.5) * (delay * 3));
            } else {
                await new Promise(r => setTimeout(r, 0));
            }
            burstCount = 0;
            currentBurstTarget = Math.floor(Math.random() * 5) + 1; 
        }
    }
    if (speed.LINE_DELAY > 0 && !state.skipRender) await sleep(speed.LINE_DELAY);
}

async function typeTextHTML(htmlContent) {
    const lineDiv = document.createElement('div');
    lineDiv.className = 'output-line'; 
    outputDiv.appendChild(lineDiv);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const speed = getSpeed();

    let burstCount = 0;
    let currentBurstTarget = Math.floor(Math.random() * 4) + 1; 

    async function transferNodes(source, target) {
        for (const node of Array.from(source.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                const textNode = document.createTextNode('');
                target.appendChild(textNode);
                const text = node.textContent;
                let i = 0;

                while (i < text.length) {
                    let currentStep = state.skipRender ? 30 : speed.HTML_STEP;
                    textNode.textContent += text.substring(i, i + currentStep);
                    i += currentStep;
                    burstCount++;

                    if (state.skipRender) {
                        scrollToBottom();
                        await new Promise(r => setTimeout(r, 5));
                        continue;
                    }

                    if (burstCount >= currentBurstTarget || /[.!?\s]/.test(text.substring(i-currentStep, i))) {
                        scrollToBottom();
                        if (speed.HTML_DELAY > 0) await sleep(speed.HTML_DELAY * burstCount);
                        else await new Promise(r => setTimeout(r, 0));
                        burstCount = 0;
                        currentBurstTarget = Math.floor(Math.random() * 4) + 1; 
                    }
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const newElement = document.createElement(node.tagName);
                Array.from(node.attributes).forEach(attr => newElement.setAttribute(attr.name, attr.value));
                target.appendChild(newElement);
                await transferNodes(node, newElement);
            }
        }
    }
    await transferNodes(tempDiv, lineDiv);
    if (speed.LINE_DELAY > 0 && !state.skipRender) await sleep(speed.LINE_DELAY);
}

function preloadImage(src, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const timer = setTimeout(() => { img.src = ""; reject(new Error("TIMEOUT")); }, timeout);
        img.onload = () => { clearTimeout(timer); resolve(img); };
        img.onerror = () => { clearTimeout(timer); reject(new Error("LOAD_ERROR")); };
        img.src = src;
    });
}

async function renderImage(src, altText = "IMAGE", extraClasses = "") {
    await typeText(`>> DOWNLOADING: ${altText}...`, 5);
    try {
        await preloadImage(src);
        const container = document.createElement('div');
        container.className = `img-container ${extraClasses}`;
        const img = document.createElement('img');
        img.src = src;
        img.className = 'scan-effect';
        container.appendChild(img);

        const screen = document.querySelector('.screen');
        const startScroll = screen.scrollTop;
        outputDiv.appendChild(container);
        void img.offsetWidth;

        const imgHeight = container.offsetHeight;
        let safeHeight = (screen.getBoundingClientRect().bottom - CONFIG.CRT_SCROLL_PADDING) - container.getBoundingClientRect().top;
        safeHeight = Math.max(0, Math.min(safeHeight, imgHeight));

        const maxScroll = screen.scrollHeight - screen.clientHeight - startScroll;

        if (state.skipRender) {
            container.style.transition = 'none';
            container.classList.add('loaded');
            if (maxScroll > 0) screen.scrollTop = startScroll + maxScroll;
            scrollToBottom();
            return; 
        }

        let durationSec = Math.max(imgHeight / getSpeed().IMG_SCAN_SPEED, getSpeed().IMG_MIN_TIME);
        container.style.transition = `clip-path ${durationSec}s linear`;
        container.classList.add('loaded');

        if (maxScroll > 0) {
            const steps = Math.ceil(durationSec * 1000 / 40);
            for (let i = 1; i <= steps; i++) {
                if (state.skipRender) {
                    container.style.transition = 'clip-path 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)';
                    screen.scrollTop = startScroll + maxScroll;
                    await sleep(150); 
                    break;
                }
                const scanY = imgHeight * (i / steps);
                if (scanY > safeHeight) screen.scrollTop = startScroll + Math.min(scanY - safeHeight, maxScroll);
                await sleep(40); 
            }
        } else {
            let waited = 0;
            while(waited < durationSec * 1000) {
                if (state.skipRender) {
                    container.style.transition = 'clip-path 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)';
                    await sleep(150);
                    break;
                }
                await sleep(50);
                waited += 50;
            }
        }
        scrollToBottom();
    } catch (e) {
        await typeText(`>> [ERROR: LOAD FAILED - ${src}]`, 10, 'text-error');
    }
}

// =============================================================================
//  404 故障页面渲染
// =============================================================================

async function render404(memberId) {
    const queryName = memberId ? memberId.toUpperCase() : "UNDEFINED";
    
const ascii404 = `
    __ __  ___   __ __  
   / // / / _ \\ / // /   
  / // /_/ // // // /_ 
 /__  __/ // //__  __/
   /_/  \\___/   /_/ 
    `;


    // 渲染代码
    await typeTextHTML(`<pre class="text-error" style="margin: 0; line-height: 1.2; font-family: inherit;">${ascii404}</pre>`);
    await sleep(300);
    
    await typeText(`>> EXCEPTION CAUGHT IN SECTOR 7G`, 20, 'text-error');
    await typeText(`>> ERR_TARGET_NOT_FOUND: Profile '${queryName}' does not exist in registry.`, 20);
    await typeText(`>> UNAUTHORIZED ACCESS DETECTED.`, 20, 'text-error');
    
    await sleep(500);
    await typeText(`\nTracing origin...`, 30);
    await sleep(400);
    await typeText(`Connection terminated.`, 10);
    
    document.body.classList.add('system-overclock');
    await sleep(150);
    document.body.classList.remove('system-overclock');
    
    await typeText(`\n[ Press ENTER to return to MAIN_DB ]`);
    waitForReturn();
}

function waitForReturn() {
    state.mode = 'WAIT';
    setTimeout(() => {
        const handler = (e) => {
            if (e.type === 'click' || e.key === 'Enter') {
                document.removeEventListener('keydown', handler);
                document.removeEventListener('click', handler); 
                window.location.href = '../'; 
            }
        };
        document.addEventListener('keydown', handler);
        document.addEventListener('click', handler); 
    }, 150);
}

// =============================================================================
//  主渲染器
// =============================================================================

async function renderProfileContent(memberData, memberId) {
    await typeText(`>> ACCESS GRANTED. DECRYPTING PROFILE: ${memberId.toUpperCase()}`, 10, 'crt-blue');
    await typeText("--------------------------------------------------", 2);
    await sleep(300);

    const lines = memberData.content.split('\n');
    for (let line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('[[IMG:')) {
            const parts = trimmed.replace(/\[\[IMG:|\]\]/g, '').split('|').map(p => p.trim());
            await renderImage(parts[0], parts[1] || "IMAGE", parts.slice(2).join(' ')); 
            continue;
        }
        if (trimmed.startsWith('[[PAUSE:')) { 
            if (!state.skipRender) await sleep(parseInt(trimmed.replace(/\D/g, ''))); 
            continue; 
        }
        if (line.includes('<') && line.includes('>')) {
            await typeTextHTML(line);
        } else if (line.length > 0) {
            await typeText(line, null);
        }
    }

    await typeText("--------------------------------------------------", 2);
    await typeText("\n>> [END OF RECORD]");
    
    if (memberData.content.includes('$') && window.MathJax && typeof window.MathJax.typeset === 'function') {
        try { window.MathJax.typesetClear([outputDiv]); window.MathJax.typeset([outputDiv]); } catch(e){}
    }
}

// =============================================================================
//  系统启动序列
// =============================================================================

async function bootSequence() {
    state.isBooting = true;
    state.skipRender = false;
    
    // 【核心修复】：强行唤醒处于 display: none 的全宇宙光标！
    if (globalCursor) {
        globalCursor.style.display = 'inline-block';
    }
    
    const skipHandler = (e) => {
        if (e.type === 'click' || (e.type === 'keydown' && e.key === 'Enter')) {
            state.skipRender = true;
        }
    };
    document.addEventListener('keydown', skipHandler);
    document.addEventListener('click', skipHandler);

    await typeText(`BIOS CHECK: OK`, 5);
    await typeText(`QUERYING SECURE REGISTRY...`, 5);
    await sleep(200);

    try {
        const response = await fetch(CONFIG.DATA_URL); 
        if (!response.ok) throw new Error("HTTP_ERROR");
        fileSystem = await response.json();
    } catch (error) {
        await typeText(`[FATAL ERROR] FAILED TO LOAD REGISTRY DATA.`, 20, 'text-error');
        return; 
    }

    const staticHeader = document.getElementById('static-header');
    if (staticHeader && !state.skipRender) {
        staticHeader.style.opacity = '1';
        await sleep(500);
    } else if (staticHeader) {
        staticHeader.style.opacity = '1';
    }

    const memberId = getMemberIdFromUrl();
    const memberData = findMemberData(fileSystem, memberId);

    if (!memberData) {
        await render404(memberId);
    } else {
        await renderProfileContent(memberData, memberId);
    }
    
    document.removeEventListener('keydown', skipHandler);
    document.removeEventListener('click', skipHandler);
    state.skipRender = false;
    state.isBooting = false;
}

window.onload = bootSequence;