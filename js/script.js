// =============================================================================
//  SYSTEM CONFIGURATION & STATE (系统配置与状态机)
// =============================================================================

const CONFIG = {
    DATA_URL: '/contents/data.json',  
    CRT_SCROLL_PADDING: 40,
    // 统一管理渲染速度配置
    SPEED: {
        NORMAL: {
            TEXT_DELAY: 8,       // 普通文本打字延迟(ms)
            TEXT_STEP: 1,        // 普通文本每次输出字符数
            HTML_DELAY: 8,       // HTML文本打字延迟(ms)
            HTML_STEP: 1,        // HTML文本每次输出字符数
			LINE_DELAY: 220,     // 模拟物理打字机换行时的停顿(ms)
            IMG_SCAN_SPEED: 240, // 图片扫描速度 (像素/秒)
            IMG_MIN_TIME: 0.8,   // 图片最少扫描时间(秒)
            CODE_CHAR: 5,        // 代码逐字延迟(ms)
            CODE_LINE: 10,       // 代码逐行延迟(ms)
            PAUSE_MULT: 1        // [[PAUSE:xx]] 指令的时间倍率
        },
        FAST: {
            TEXT_DELAY: 0,
            TEXT_STEP: 8,
            HTML_DELAY: 0,
            HTML_STEP: 8,
			LINE_DELAY: 0,       // <--- 快速模式无需换行停顿
            IMG_SCAN_SPEED: 600,
            IMG_MIN_TIME: 0.4,
            CODE_CHAR: 0,
            CODE_LINE: 0,
            PAUSE_MULT: 0.25
        }
    }
};

let fileSystem = null;

let state = {
    isBooting: true,
    mode: 'NONE',
    speedMode: 'NORMAL',              // 新增：当前系统的运行速度模式
    menuIndex: 0,
    currentMenuOptions: [],
    menuStack: [],
    lastMenuContext: null
};

const outputDiv = document.getElementById('terminal-output');
const interactiveDiv = document.getElementById('interactive-area');
const globalCursor = document.getElementById('global-cursor');

// 获取当前速度配置的快捷方法
const getSpeed = () => CONFIG.SPEED[state.speedMode];

// =============================================================================
//  CORE ENGINE (核心渲染引擎)
// =============================================================================

const sleep = ms => new Promise(r => setTimeout(r, ms));

function scrollToBottom() {
    const screen = document.querySelector('.screen');
    if (screen) screen.scrollTop = screen.scrollHeight;
}

async function typeText(text, customDelay = null, className = '') {
    if (!text) return;
    const lineDiv = document.createElement('div');
    lineDiv.className = `output-line ${className}`; 
    outputDiv.appendChild(lineDiv);

    const speed = getSpeed();
    // 就算你要很快，这里的 delay 可以设成 5 甚至 2
    const delay = customDelay !== null ? customDelay : speed.TEXT_DELAY; 
    const step = speed.TEXT_STEP; // 依然必须是 1
    let i = 0;
    
    // --- 新增：突发控制变量 ---
    let burstCount = 0;
    // 每次随机决定一口气吐出几个字符 (比如 2 到 5 个)
    let currentBurstTarget = Math.floor(Math.random() * 4) + 2; 

    while (i < text.length) {
        const chunk = text.substring(i, i + step);
        lineDiv.textContent += chunk;
        i += step;
        burstCount++;

        // 判断：是否达到了这次突发的配额？或者是否遇到了标点/空格？
        const isPunctuation = /[.!?。！？]/.test(chunk);
        const isSpace = /\s/.test(chunk);
        
        if (burstCount >= currentBurstTarget || isPunctuation || isSpace) {
            scrollToBottom();
            
            if (delay > 0) {
                let baseDelay = delay;
                if (isPunctuation) baseDelay = delay * 5;
                else if (isSpace) baseDelay = delay * 1.5;
                
                // 将积累的字符延迟合并，并加入机械抖动
                // 比如攒了 4 个字，delay是 5ms，那就一次性停顿 20ms + 随机抖动
                let totalDelay = (baseDelay * burstCount) + (Math.random() - 0.5) * (delay * 3);
                
                await sleep(totalDelay);
            } else {
                await new Promise(r => setTimeout(r, 0));
            }
            
            // 这一波吐完了，重置计数器，生成下一次突发的随机目标
            burstCount = 0;
            currentBurstTarget = Math.floor(Math.random() * 5) + 1; // 下一次吐 1~5 个字
        }
        // 如果没达到突发配额，什么都不 await！
        // 让 JS 在同一帧内以光速把下一个字也塞进 DOM。
    }

    if (speed.LINE_DELAY > 0) await sleep(speed.LINE_DELAY);
}

async function typeError(text) { await typeText(text, 30, 'text-error'); }
async function typeDebug(text) { await typeText(text, 10, 'text-debug'); }

async function typeTextHTML(htmlContent) {
    const lineDiv = document.createElement('div');
    lineDiv.className = 'output-line typing'; 
    outputDiv.appendChild(lineDiv);

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const speed = getSpeed();

    // --- 新增：跨节点的突发控制状态 ---
    // 把它放在 transferNodes 外面，这样即使跨越 <span> 等标签，机械节奏也不会被打断
    let burstCount = 0;
    // 随机决定一口气吐出 1~4 个字符
    let currentBurstTarget = Math.floor(Math.random() * 4) + 1; 

    async function transferNodes(source, target) {
        const nodes = Array.from(source.childNodes);
        for (const node of nodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const textNode = document.createTextNode('');
                target.appendChild(textNode);
                const text = node.textContent;
                let i = 0;
                
                // 为了最佳顿挫感，这里的步长必须是 1
                const step = speed.HTML_STEP; 

                while (i < text.length) {
                    const chunk = text.substring(i, i + step);
                    textNode.textContent += chunk;
                    i += step;
                    burstCount++;

                    // 检查标点和空格
                    const isPunctuation = /[.!?。！？]/.test(chunk);
                    const isSpace = /\s/.test(chunk);

                    // 触发条件：达到突发配额，或者遇到标点/空格
                    if (burstCount >= currentBurstTarget || isPunctuation || isSpace) {
                        scrollToBottom();
                        
                        if (speed.HTML_DELAY > 0) {
                            let baseDelay = speed.HTML_DELAY;
                            if (isPunctuation) baseDelay = speed.HTML_DELAY * 5;
                            else if (isSpace) baseDelay = speed.HTML_DELAY * 1.5;
                            
                            // 累积延迟 + 机械抖动
                            let totalDelay = (baseDelay * burstCount) + (Math.random() - 0.5) * (speed.HTML_DELAY * 3);
                            
                            await sleep(totalDelay);
                        } else {
                            await new Promise(r => setTimeout(r, 0));
                        }
                        
                        // 重置计数器并生成下一个随机配额
                        burstCount = 0;
                        currentBurstTarget = Math.floor(Math.random() * 4) + 1; 
                    }
                }
            } 
            else if (node.nodeType === Node.ELEMENT_NODE) {
                const newElement = document.createElement(node.tagName);
                Array.from(node.attributes).forEach(attr => newElement.setAttribute(attr.name, attr.value));
                target.appendChild(newElement);
                // 递归处理子节点
                await transferNodes(node, newElement);
            }
        }
    }

    await transferNodes(tempDiv, lineDiv);
    
    // HTML 渲染完毕，移除当前行的光标
    lineDiv.classList.remove('typing');
    
    // 原有的微小停顿与行末停顿
    if (speed.HTML_DELAY > 0) await sleep(20); 
    if (speed.LINE_DELAY > 0) await sleep(speed.LINE_DELAY);
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
    const speed = getSpeed();

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

        const rect = img.getBoundingClientRect();
        const screenRect = screen.getBoundingClientRect();
        const imgHeight = img.offsetHeight;

        let safeVisibleHeight = (screenRect.bottom - CONFIG.CRT_SCROLL_PADDING) - rect.top;
        const clampedSafeHeight = Math.max(0, Math.min(safeVisibleHeight, imgHeight));

        const targetScroll = screen.scrollHeight - screen.clientHeight;
        const maxScrollDistance = targetScroll - startScroll;

        // 根据配置计算扫描时间
        let durationSec = imgHeight / speed.IMG_SCAN_SPEED;
        if (durationSec < speed.IMG_MIN_TIME) durationSec = speed.IMG_MIN_TIME;
        const durationMs = durationSec * 1000;

        img.style.transition = `clip-path ${durationSec}s linear`;
        img.classList.add('loaded');

        if (maxScrollDistance > 0) {
            const stepTime = state.speedMode === 'FAST' ? 20 : 40;
            const steps = Math.ceil(durationMs / stepTime);
            
            for (let i = 1; i <= steps; i++) {
                const currentScanY = imgHeight * (i / steps);
                if (currentScanY > clampedSafeHeight) {
                    let pushDown = currentScanY - clampedSafeHeight;
                    screen.scrollTop = startScroll + Math.min(pushDown, maxScrollDistance);
                }
                await sleep(stepTime); 
            }
        } else {
            await sleep(durationMs); 
        }

        scrollToBottom();

    } catch (error) {
        const errDiv = document.createElement('div');
        errDiv.className = 'error-msg';
        errDiv.textContent = `>> [ERROR: LOAD FAILED - ${src}]`;
        outputDiv.appendChild(errDiv);
    }
}

function parsePythonLine(line) {
    const tokens = [];
    if (line.trim().startsWith('#')) return [{ text: line, type: 'comment' }];
    const parts = line.split(/('.*?'|".*?"|#.*|\b(?:def|class|import|from|return|if|else|elif|while|for|in|try|except|print|True|False|None|self)\b|[():,.=])/g);
    for (let part of parts) {
        if (!part) continue;
        let type = 'normal';
        if (part.startsWith('#')) type = 'comment';
        else if (part.startsWith("'") || part.startsWith('"')) type = 'string';
        else if (/^(def|class|import|from|return|if|else|elif|while|for|in|try|except|print|True|False|None|self)$/.test(part)) type = 'keyword';
        else if (/^\d+$/.test(part)) type = 'number';
        tokens.push({ text: part, type: type });
    }
    return tokens;
}

async function renderCodeBox(filename, codeLines) {
    const speed = getSpeed();
    const isFast = state.speedMode === 'FAST';

    const panel = document.createElement('div');
    panel.className = 'code-panel';
    const header = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = `<span>SRC: ${filename}</span><span>${isFast ? 'BURST_READ' : 'PYTHON'}</span>`;
    panel.appendChild(header);
    
    const body = document.createElement('div');
    body.className = 'code-body';
    panel.appendChild(body);
    outputDiv.appendChild(panel);
    scrollToBottom();

    for (let i = 0; i < codeLines.length; i++) {
        const line = codeLines[i];
        const lineDiv = document.createElement('div');
        body.appendChild(lineDiv);
        const tokens = parsePythonLine(line);
        
        for (let token of tokens) {
            const span = document.createElement('span');
            if (token.type !== 'normal') span.className = `token-${token.type}`;
            
            if (speed.CODE_CHAR > 0) {
                lineDiv.appendChild(span);
                for (let char of token.text) { span.textContent += char; await sleep(speed.CODE_CHAR); }
            } else {
                span.textContent = token.text;
                lineDiv.appendChild(span);
            }
        }
        lineDiv.appendChild(document.createTextNode('\n'));
        
        if (speed.CODE_LINE > 0) {
            scrollToBottom();
            await sleep(speed.CODE_LINE);
        } else if (i % 2 === 0) {
            // Fast mode: prevents browser lockup
            scrollToBottom();
            await new Promise(r => setTimeout(r, 0));
        }
    }
    
    if (isFast) {
        header.innerHTML = `<span>SRC: ${filename}</span><span>PYTHON</span>`;
    }
    await sleep(isFast ? 50 : 100);
}

// 核心渲染入口：统一处理Normal和Fast模式
async function renderContent(contentString, isFastMode = false) {
    state.mode = 'RenderContent';
    state.speedMode = isFastMode ? 'FAST' : 'NORMAL'; // 根据传入模式设定全局渲染速度
    
    if (isFastMode) document.body.classList.add('system-overclock');

    interactiveDiv.innerHTML = '';
    globalCursor.style.display = 'inline-block';

    const speed = getSpeed();

    if (isFastMode) {
        await typeDebug(">> WARNING: HIGH-SPEED DATA STREAM INITIATED...", 8);
        await sleep(500);
    } else {
        await typeText(">> READING DATA STREAM...", 5);
        await sleep(200);
    }

    const lines = contentString.split('\n');
    let inCodeBlock = false, codeBuffer = [], codeFilename = "script.py";

    try {
        for (let line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('[[CODE:')) { 
                inCodeBlock = true; 
                codeFilename = trimmed.replace(/\[\[CODE:|\]\]/g, '').trim(); 
                codeBuffer = []; 
                continue; 
            }
            if (trimmed === '[[ENDCODE]]') { 
                inCodeBlock = false; 
                await renderCodeBox(codeFilename, codeBuffer); 
                continue; 
            }
            if (inCodeBlock) { 
                codeBuffer.push(line); 
                continue; 
            }
            if (trimmed.startsWith('[[IMG:')) {
                const rawContent = trimmed.replace(/\[\[IMG:|\]\]/g, '');
                const parts = rawContent.split('|').map(p => p.trim());
                const src = parts[0]; 
                const alt = parts[1] || "IMAGE";
                const extraClasses = parts.slice(2).join(' ');
                await renderImage(src, alt, extraClasses); 
                continue;
            }
            if (trimmed.startsWith('[[PAUSE:')) { 
                const baseTime = parseInt(trimmed.replace(/\D/g, ''));
                await sleep(baseTime * speed.PAUSE_MULT); 
                continue; 
            }
            if (line.includes('<') && line.includes('>')) {
                await typeTextHTML(line);
            } else if (line.length > 0) {
                await typeText(line, null);
            }
        }
    } finally {
        if (isFastMode) {
            document.body.classList.remove('system-overclock');
            await sleep(200);
            await typeDebug("\n>> [STREAM COMPLETE. SYSTEMS STABILIZED.]", 5);
        } else {
            await typeText("\n>> [EOF]");
        }
        // 重置回普通速度
        state.speedMode = 'NORMAL'; 
    }
    
    const hasMath = contentString.includes('$') || contentString.includes('$$');
    if (hasMath && window.MathJax && typeof window.MathJax.typeset === 'function') {
        await typeText(">> RENDERING MATH EQUATIONS...", 5);
        try {
            window.MathJax.typesetClear([outputDiv]);
            window.MathJax.typeset([outputDiv]);
            await typeText(">> MATH ENGINE: [DONE]", 2, 'crt-blue');
        } catch (err) {
            if (typeof window.MathJax.typesetPromise === 'function') {
                window.MathJax.typesetPromise([outputDiv]).catch(e => console.warn("MathJax Async:", e));
                await sleep(100);
                await typeText(">> MATH ENGINE: [ASYNC DONE]", 2, 'crt-amber');
            } else {
                await typeError(`>> [MATH ERROR] ${err.message}`);
            }
        }
    }
    
    await typeText("Press [ENTER] to return...");
    waitForEnter();
}

function renderMenuFromData(title, menuItems, animate = false) {
    state.mode = 'MENU';
    state.menuIndex = 0;
    
    const displayOptions = [...menuItems];
    if (state.menuStack.length > 0) {
        displayOptions.push({ label: "<< RETURN", type: "back" });
    }

    state.currentMenuOptions = displayOptions;
    interactiveDiv.innerHTML = '';
    globalCursor.style.display = 'none';

    const menuContainer = document.createElement('div');
    menuContainer.className = 'menu-container';
    
    if (animate) {
        menuContainer.classList.add('menu-fade-in');
    }

    menuContainer.innerHTML = `<div style="margin-bottom:10px; border-bottom:1px solid #33ff33">${title}</div>`;

    displayOptions.forEach((opt, index) => {
        const item = document.createElement('div');
        item.className = 'menu-item';
        item.id = `menu-${index}`;
        item.innerHTML = `[ ${index + 1} ] ${opt.label}`;
        item.onclick = () => { state.menuIndex = index; updateMenuVisuals(); handleSelection(opt); };
        item.onmouseenter = () => { state.menuIndex = index; updateMenuVisuals(); };
        menuContainer.appendChild(item);
    });

    menuContainer.insertAdjacentHTML('beforeend', '<div style="margin-top:10px;font-size:0.8em;opacity:0.7">USE ARROW KEYS, NUM KEYS OR MOUSE</div>');
    interactiveDiv.appendChild(menuContainer);
    updateMenuVisuals();
    scrollToBottom();
}

function updateMenuVisuals() {
    state.currentMenuOptions.forEach((_, idx) => {
        const el = document.getElementById(`menu-${idx}`);
        if (el) el.classList.toggle('active', idx === state.menuIndex);
    });
}

async function handleSelection(option) {
    const titleEl = document.querySelector('.menu-container div:first-child');
    const currentTitle = titleEl ? titleEl.textContent : "MAIN MENU"; 
    const currentItems = state.currentMenuOptions.filter(i => i.type !== 'back');

    if (option.type === 'menu') {
        state.menuStack.push({ 
            title: currentTitle, 
            items: currentItems 
        });
        renderMenuFromData(`SUBMENU // ${option.label}`, option.items, true);
    } 
    else if (option.type === 'file') {
        state.lastMenuContext = {
            title: currentTitle,
            items: currentItems
        };
        // 这里根据 option.mode 决定是否开启快读模式
        const isFast = option.mode === 'fast';
        await renderContent(option.content, isFast);
    } 
    else if (option.type === 'back') {
        const parent = state.menuStack.pop();
        if (parent) {
            renderMenuFromData(parent.title, parent.items, true);
        } else {
            renderMenuFromData("MAIN MENU // DOMD-TOOLKIT", fileSystem.root, true);
        }
    } 
    else if (option.type === 'action') {
        if (option.func === 'clear') await clearTerminal();
        if (option.func === 'shutdown') await performShutdown();
    }
}

function waitForEnter() {
    state.mode = 'WAIT';
    const handler = (e) => {
        if (e.type === 'click' || e.key === 'Enter') {
            document.removeEventListener('keydown', handler);
            document.removeEventListener('click', handler); 
            
            if (state.lastMenuContext) {
                renderMenuFromData(state.lastMenuContext.title, state.lastMenuContext.items, true);
            } else {
                renderMenuFromData("MAIN MENU // DOMD-TOOLKIT", fileSystem.root, true);
            }
        }
    };
    document.addEventListener('keydown', handler);
    document.addEventListener('click', handler); 
}

async function displaySystemHeader() {
    if (!fileSystem || !fileSystem.sys) return;

    if (fileSystem.sys.boot_msg) {
        await typeText(`${fileSystem.sys.boot_msg}`, 5);
        await sleep(100);
    }
    
    const newsList = fileSystem.sys.news;
    if (newsList && newsList.length > 0) {
        await typeText(">> CHECKING SYSTEM NOTICES...", 5);
        await sleep(200);
        await typeText("--------------------------------------------------", 0);
        for (const news of newsList) {
            await typeTextHTML(` * ${news}`); 
            await sleep(50);
        }
        await typeText("--------------------------------------------------", 0);
        await sleep(300);
    }
}

async function clearTerminal() {
    state.mode = 'BUSY';
    interactiveDiv.innerHTML = '';
    
    outputDiv.innerHTML = ''; 
    state.menuStack = []; 
    
    await displaySystemHeader();
    renderMenuFromData("MAIN MENU // DOMD-TOOLKIT", fileSystem.root, true);
}

async function performShutdown() {
    state.mode = 'SHUTDOWN';
    interactiveDiv.innerHTML = '';
    await typeText("System halting...", 20);
    document.body.classList.add('shutdown-active');
    await sleep(1000);
    try { window.close(); } catch(e){}
}

document.addEventListener('keydown', (e) => {
    if (state.mode !== 'MENU') return;
    const keyNum = parseInt(e.key); 
    if (keyNum > 0 && keyNum <= state.currentMenuOptions.length) {
        e.preventDefault();
        handleSelection(state.currentMenuOptions[keyNum - 1]);
        return; 
    }
    if (e.key === 'ArrowUp') { e.preventDefault(); state.menuIndex = (state.menuIndex > 0) ? state.menuIndex - 1 : state.currentMenuOptions.length - 1; updateMenuVisuals(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); state.menuIndex = (state.menuIndex < state.currentMenuOptions.length - 1) ? state.menuIndex + 1 : 0; updateMenuVisuals(); }
    else if (e.key === 'Enter') { e.preventDefault(); document.getElementById(`menu-${state.menuIndex}`).click(); }
});

async function bootSequence() {
    state.isBooting = true;
    
    await typeText(`BIOS CHECK: OK`, 5);
    await typeText(`INITIALIZING NETWORK...`, 5);
    await sleep(200);

    try {
        await typeText(">> FETCHING DATA ...", 5);
        const response = await fetch(CONFIG.DATA_URL); 
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        fileSystem = await response.json();
        await sleep(300);
        await typeTextHTML(">> DATA INTEGRITY CHECK: <span class='crt-blue'>PASS</span>");
    } catch (error) {
        await typeError(`[FATAL ERROR] FAILED TO LOAD SYSTEM DATA.`);
        await typeDebug(`DEBUG INFO: ${error.message}`);
        await typeDebug(`Please check server connection.`);
        const errDiv = document.createElement('div');
        errDiv.className = 'error-msg';
        errDiv.textContent = "SYSTEM HALTED";
        outputDiv.appendChild(errDiv);
        return; 
    }

    const staticHeader = document.getElementById('static-header');
    if (staticHeader) staticHeader.style.opacity = '1';
    await sleep(500);

    await displaySystemHeader();

    state.isBooting = false;
    renderMenuFromData("MAIN MENU // DOMD-TOOLKIT", fileSystem.root, true);
}

window.onload = bootSequence;