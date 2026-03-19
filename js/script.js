// =============================================================================
//  区域一：数据配置区 (在这里修改内容)
// =============================================================================

let fileSystem = null;

// =============================================================================
//  区域二：核心引擎区 (已修复 Bug & 优化体验)
// =============================================================================

const outputDiv = document.getElementById('terminal-output');
const interactiveDiv = document.getElementById('interactive-area');
const globalCursor = document.getElementById('global-cursor');

let state = {
    isBooting: true,
    mode: 'NONE', 
    menuIndex: 0,
    currentMenuOptions: [],
    menuStack: [],
    lastMenuContext: null 
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
function scrollToBottom() {
    const screen = document.querySelector('.screen');
    screen.scrollTop = screen.scrollHeight;
}

// --- 基础组件 ---
async function typeText(text, delay = 8, className = '') {
    if (!text) return;
    const lineDiv = document.createElement('div');
    lineDiv.className = `output-line ${className}`;
    outputDiv.appendChild(lineDiv);

    let i = 0;
    const step = 2; 
    
    while (i < text.length) {
        const chunk = text.substring(i, i + step);
        lineDiv.textContent += chunk;
        i += step;
        
        scrollToBottom();
        
        const isEnd = /[.!?。！？]/.test(chunk);
        await sleep(isEnd ? delay * 3 : delay);
    }
}

async function typeError(text) {
    await typeText(text, 30, 'text-error');
}

async function typeDebug(text) {
    await typeText(text, 10, 'text-debug');
}


async function typeTextHTML(htmlContent, delay = 8) {
    const lineDiv = document.createElement('div');
    lineDiv.className = 'output-line';
    outputDiv.appendChild(lineDiv);

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    async function transferNodes(source, target) {
        const nodes = Array.from(source.childNodes);
        
        for (const node of nodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const textNode = document.createTextNode('');
                target.appendChild(textNode);

                const text = node.textContent;
                let i = 0;
                const step = 3; 

                while (i < text.length) {
                    textNode.textContent += text.substring(i, i + step);
                    i += step;
                    
                    scrollToBottom();
                    await sleep(delay);
                }
            } 
            else if (node.nodeType === Node.ELEMENT_NODE) {
                const newElement = document.createElement(node.tagName);
                Array.from(node.attributes).forEach(attr => {
                    newElement.setAttribute(attr.name, attr.value);
                });
                target.appendChild(newElement);
                await transferNodes(node, newElement);
            }
        }
    }

    await transferNodes(tempDiv, lineDiv);
    await sleep(20); 
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
        
        // 1. 【核心魔法】在插入图片前，记录下当前的滚动条位置
        const startScroll = screen.scrollTop;

        // 2. 插入图片，此时 DOM 会瞬间撑开几百像素的空间
        outputDiv.appendChild(container);
        void img.offsetWidth; // 强制浏览器重绘

        // 3. 计算插入图片后，到底产生了多少“新”的滚动距离
        const targetScroll = screen.scrollHeight - screen.clientHeight;
        const scrollDistance = targetScroll - startScroll;

        // 启动 CSS 扫描动画 (3秒)
        img.classList.add('loaded'); 

        // 4. 接管马达：只有当确实需要往下滚时，才开启“齿轮步进”
        if (scrollDistance > 0) {
            const steps = 40; // 30步 * 100ms = 3000ms (完美契合 CSS 的 3s)
            for (let i = 1; i <= steps; i++) {
                // 将总距离切成 30 份，一点一点硬推下去
                screen.scrollTop = startScroll + (scrollDistance * (i / steps));
                await sleep(25); 
            }
        } else {
            // 如果屏幕还没满，不需要滚动，就干等 3 秒让动画播完
            await sleep(1000); 
        }

        // 确保最终严丝合缝锁定在底部
        scrollToBottom();

    } catch (error) {
        const errDiv = document.createElement('div');
        errDiv.className = 'error-msg';
        errDiv.textContent = `[ERROR: LOAD FAILED - ${src}]`;
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
    const panel = document.createElement('div');
    panel.className = 'code-panel';
    const header = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = `<span>SRC: ${filename}</span><span>PYTHON</span>`;
    panel.appendChild(header);
    const body = document.createElement('div');
    body.className = 'code-body';
    panel.appendChild(body);
    outputDiv.appendChild(panel);
    scrollToBottom();
    for (let line of codeLines) {
        const lineDiv = document.createElement('div');
        body.appendChild(lineDiv);
        const tokens = parsePythonLine(line);
        for (let token of tokens) {
            const span = document.createElement('span');
            if (token.type !== 'normal') span.className = `token-${token.type}`;
            lineDiv.appendChild(span);
            for (let char of token.text) { span.textContent += char; await sleep(2); }
        }
        lineDiv.appendChild(document.createTextNode('\n'));
        scrollToBottom();
        await sleep(10);
    }
    await sleep(100);
}

// --- 核心引擎 ---

async function renderContent(contentString) {
    state.mode = 'RenderContent';
    interactiveDiv.innerHTML = '';
    globalCursor.style.display = 'inline-block';

    await typeText(">> READING DATA STREAM...", 5);
    await sleep(200);

    const lines = contentString.split('\n');
    let inCodeBlock = false, codeBuffer = [], codeFilename = "script.py";

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
            const alt = parts[1] ? parts[1] : "IMAGE";
            const extraClasses = parts.slice(2).join(' ');
            await renderImage(src, alt, extraClasses); 
            continue;
        }
        if (trimmed.startsWith('[[PAUSE:')) { 
            await sleep(parseInt(trimmed.replace(/\D/g, ''))); 
            continue; 
        }
        if (line.includes('<') && line.includes('>')) {
            await typeTextHTML(line);
        } else {
            await typeText(line);
        }
    }
    await typeText("\n>> [EOF]");
	if (window.MathJax) {
        await typeText("Rendering Math equations... [Done]", 5);
    }
    await typeText("Press [ENTER] to return...");
	if (window.MathJax) {
        await MathJax.typesetPromise([outputDiv]);
    }
    waitForEnter();
}

async function fastTypeTextHTML(htmlContent) {
    const lineDiv = document.createElement('div');
    lineDiv.className = 'output-line';
    outputDiv.appendChild(lineDiv);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    async function transfer(source, target) {
        for (const node of Array.from(source.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                const textNode = document.createTextNode('');
                target.appendChild(textNode);
                const text = node.textContent;
                let i = 0;
                while (i < text.length) {
                    textNode.textContent += text.substring(i, i + 8);
                    i += 8;
                    scrollToBottom();
                    await new Promise(r => setTimeout(r, 0)); 
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const newEl = document.createElement(node.tagName);
                Array.from(node.attributes).forEach(a => newEl.setAttribute(a.name, a.value));
                target.appendChild(newEl);
                await transfer(node, newEl);
            }
        }
    }
    await transfer(tempDiv, lineDiv);
}

async function fastRenderImage(src, altText = "IMAGE", extraClasses = "") {
    await typeText(`>> FAST-LOAD: ${altText}`, 2); 
    try {
        await preloadImage(src);
        const container = document.createElement('div');
        container.className = `img-container ${extraClasses}`;
        const img = document.createElement('img');
        img.src = src;
        img.className = 'scan-effect';
        
        // 【核心修复 1】抛弃现代缓动动画，强制使用绝对匀速 (linear)
        // 让图片出现的节奏和老式扫描仪一样冷酷无情
        img.style.transition = "clip-path 0.6s linear";
        container.appendChild(img);
        
        const screen = document.querySelector('.screen');
        const startScroll = screen.scrollTop;
        
        outputDiv.appendChild(container);
        void img.offsetWidth; // 触发重绘
        
        const targetScroll = screen.scrollHeight - screen.clientHeight;
        const scrollDistance = targetScroll - startScroll;
         
        img.classList.add('loaded');

        if (scrollDistance > 0) {
            // 【核心修复 2】提高马达的刷新率！
            // 把总时间 600ms 切成 30 份，每份 20ms (接近 50fps 的丝滑度)
            // 这样滚动会紧紧咬住那条匀速的扫描线
            const steps = 30;
            for (let i = 1; i <= steps; i++) {
                screen.scrollTop = startScroll + (scrollDistance * (i / steps));
                await sleep(20); 
            }
        } else {
            await sleep(600);
        }

        scrollToBottom();

    } catch (e) { await typeError(`[LOAD FAIL]`); }
}


async function fastRenderCodeBox(filename, codeLines) {
    const panel = document.createElement('div');
    panel.className = 'code-panel';
    
    const header = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = `<span>SRC: ${filename}</span><span>BURST_READ</span>`;
    panel.appendChild(header);
    
    const body = document.createElement('div');
    body.className = 'code-body';
    panel.appendChild(body);
    outputDiv.appendChild(panel);
    scrollToBottom();

    for (let line of codeLines) {
        const lineDiv = document.createElement('div');
        body.appendChild(lineDiv);
        
        const tokens = parsePythonLine(line);
        
        for (let token of tokens) {
            const span = document.createElement('span');
            if (token.type !== 'normal') span.className = `token-${token.type}`;
            span.textContent = token.text;
            lineDiv.appendChild(span);
        }
        
        lineDiv.appendChild(document.createTextNode('\n'));
        
        if (codeLines.indexOf(line) % 2 === 0) {
            scrollToBottom();
			await sleep(15);
            await new Promise(r => setTimeout(r, 0)); 
        }
    }
    
    header.innerHTML = `<span>SRC: ${filename}</span><span>PYTHON</span>`;
    await sleep(50); 
}

async function fastRenderContent(contentString) {
    document.body.classList.add('system-overclock');
    state.mode = 'RenderContent';
    interactiveDiv.innerHTML = '';
    globalCursor.style.display = 'inline-block';

    await typeDebug(">> WARNING: HIGH-SPEED DATA STREAM INITIATED...", 8);
    await sleep(500);

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
                await fastRenderCodeBox(codeFilename, codeBuffer); 
                continue; 
            }
            if (inCodeBlock) { codeBuffer.push(line); continue; }

            if (trimmed.startsWith('[[IMG:')) {
                const rawContent = trimmed.replace(/\[\[IMG:|\]\]/g, '');
                const parts = rawContent.split('|').map(p => p.trim());
                const src = parts[0];
                const alt = parts[1] || "IMAGE";
                const extraClasses = parts.slice(2).join(' ');
                await fastRenderImage(src, alt, extraClasses); 
                continue;
            }

            if (trimmed.startsWith('[[PAUSE:')) { 
                const pTime = parseInt(trimmed.replace(/\D/g, ''));
                await sleep(pTime / 4); 
                continue; 
            }

            if (line.length > 0) {
                await fastTypeTextHTML(line);
            }
        }
    } finally {
        document.body.classList.remove('system-overclock');
    }

    await sleep(200);
	await typeDebug("\n>> [STREAM COMPLETE. SYSTEMS STABILIZED.]", 5);

    const hasMath = contentString.includes('$') || contentString.includes('$$');
    if (hasMath && window.MathJax && typeof window.MathJax.typeset === 'function') {
        await typeText(">> RENDERING MATH EQUATIONS...", 5);

        try {
            // 清空旧 DOM 缓存
            window.MathJax.typesetClear([outputDiv]);
            
            window.MathJax.typeset([outputDiv]);

            await typeText(">> MATH ENGINE: [DONE]", 2, 'crt-blue');
            
        } catch (err) {
            if (typeof window.MathJax.typesetPromise === 'function') {
                window.MathJax.typesetPromise([outputDiv]).catch(e => console.warn("MathJax Async:", e));
                await sleep(100);
                await typeText(">> MATH ENGINE: [ASYNC DONE]", 2, 'crt-amber');
            } else {
                await typeError(`[MATH ERROR] ${err.message}`);
            }
        }
    }

    await typeText("Press [ENTER] to return...", 5);
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

// [修复点 1] 路由控制：子菜单和返回也都加上 true 以触发动画
async function handleSelection(option) {
    const titleEl = document.querySelector('.menu-container div:first-child');
    const currentTitle = titleEl ? titleEl.textContent : "MAIN MENU"; 
    const currentItems = state.currentMenuOptions.filter(i => i.type !== 'back');

    if (option.type === 'menu') {
        state.menuStack.push({ 
            title: currentTitle, 
            items: currentItems 
        });
        // 进入子菜单也淡入
        renderMenuFromData(`SUBMENU // ${option.label}`, option.items, true);
    } 
    else if (option.type === 'file') {
        state.lastMenuContext = {
            title: currentTitle,
            items: currentItems
        };
        if (option.mode === 'fast') {
            await fastRenderContent(option.content);
        } else {
            await renderContent(option.content);
        }
    } 
    else if (option.type === 'back') {
        const parent = state.menuStack.pop();
        if (parent) {
            // 返回上级也淡入
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

// [修复点 1] 确认阅读完毕后，呼出菜单加上 true 触发动画
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

// --- [修复点 2] 抽离核心：将展示通知信息的逻辑独立出来 ---
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
        await typeText("----------------------------------------", 0);
        for (const news of newsList) {
            await typeTextHTML(` * ${news}`, 5); 
            await sleep(50); // 这里速度可以快一点，不需要像第一次开机那么慢
        }
        await typeText("----------------------------------------", 0);
        await sleep(300);
    }
}

// --- 功能函数 ---

async function clearTerminal() {
    state.mode = 'BUSY';
    interactiveDiv.innerHTML = '';
    
    // 直接清空大屏幕，干净利落
    outputDiv.innerHTML = ''; 
    state.menuStack = []; 
    
    // [修复点 2] 重新把顶部的通知栏打出来
    await displaySystemHeader();

    // 重新呼出菜单（带动画）
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

// --- 启动序列 ---

async function bootSequence() {
    state.isBooting = true;
    
    await typeText(`BIOS CHECK: OK`, 5);
    await typeText(`INITIALIZING NETWORK...`, 5);
    await sleep(200);

    try {
        await typeText(">> FETCHING DATA ...", 5);
        const response = await fetch('/contents/data.json'); 
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        fileSystem = await response.json();
        await sleep(300);
        await typeTextHTML(">> DATA INTEGRITY CHECK: <span class='crt-blue'>PASS</span>", 5);
    } catch (error) {
        await typeError(`[FATAL ERROR] FAILED TO LOAD SYSTEM DATA.`, 5);
        await typeDebug(`DEBUG INFO: ${error.message}`, 5);
        await typeDebug(`Please check server connection.`, 5);
        const errDiv = document.createElement('div');
        errDiv.className = 'error-msg';
        errDiv.textContent = "SYSTEM HALTED";
        outputDiv.appendChild(errDiv);
        return; 
    }

    const staticHeader = document.getElementById('static-header');
    if (staticHeader) staticHeader.style.opacity = '1';
    await sleep(500);

    // [修复点 2] 调用抽离出来的展示通知函数
    await displaySystemHeader();

    state.isBooting = false;
    renderMenuFromData("MAIN MENU // DOMD-TOOLKIT", fileSystem.root, true);
}

window.onload = bootSequence;