// =============================================================================
//  区域一：数据配置区 (在这里修改内容)
// =============================================================================

let fileSystem = null;


// =============================================================================
//  区域二：核心引擎区 (已修复 Bug)
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
    // [修复点 1] 新增变量，用于记录"刚才我在哪个菜单"，防止清屏后忘掉
    lastMenuContext: null 
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
function scrollToBottom() {
    const screen = document.querySelector('.screen');
    screen.scrollTop = screen.scrollHeight;
}

// --- 基础组件 ---
// [修改版] 支持传入 className
async function typeText(text, delay = 8, className = '') {
    if (!text) return;
    const lineDiv = document.createElement('div');
    lineDiv.className = `output-line ${className}`;
    outputDiv.appendChild(lineDiv);

    // 优化点：采用步进式打印，每跳处理 2 个字符
    let i = 0;
    const step = 2; 
    
    while (i < text.length) {
        const chunk = text.substring(i, i + step);
        lineDiv.textContent += chunk;
        i += step;
        
        scrollToBottom();
        
        // 只有遇到结尾类标点才微顿，其余时间全速前进
        const isEnd = /[.!?。！？]/.test(chunk);
        await sleep(isEnd ? delay * 3 : delay);
    }
}

// --- [新增] 便捷封装函数 ---

async function typeError(text) {
    // 强制使用 'text-error' 样式，速度稍慢(30ms)让用户看清
    await typeText(text, 30, 'text-error');
}

async function typeDebug(text) {
    // 强制使用 'text-debug' 样式
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
                // 每次搬运 3 个字符，平衡流畅度与速度
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
                // 递归内部也要保持高速
                await transferNodes(node, newElement);
            }
        }
    }

    await transferNodes(tempDiv, lineDiv);
    await sleep(20); // 结尾稍作收放
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
        
        // [修改] 将基础类名和额外的修饰符类名拼接起来
        // 例如：'img-container' + ' ' + 'wide center'
        container.className = `img-container ${extraClasses}`;
        
        const img = document.createElement('img');
        img.src = src;
        img.className = 'scan-effect';
        container.appendChild(img);
        outputDiv.appendChild(container);
        scrollToBottom();
        void img.offsetWidth; 
        img.classList.add('loaded');
        await sleep(3000); 
    } catch (error) {
        // ... (错误处理保持不变)
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
		// [修改版] 图片指令解析逻辑
		if (trimmed.startsWith('[[IMG:')) {
			// 1. 去掉前后的中括号和 IMG: 标记
			const rawContent = trimmed.replace(/\[\[IMG:|\]\]/g, '');
			
			// 2. 用竖线分割，并去除每个部分的首尾空格
			// 例如: ["url", "alt text", "wide", "center"]
			const parts = rawContent.split('|').map(p => p.trim());

			const src = parts[0]; // 第一个必须是 URL
			// 第二个是 ALT，如果没写就用默认值
			const alt = parts[1] ? parts[1] : "IMAGE";
			
			// [新增] 提取剩下的部分作为修饰符类名
			// parts.slice(2) 拿到的是 ["wide", "center"]
			// join(' ') 把它变成字符串 "wide center"
			const extraClasses = parts.slice(2).join(' ');

			// 调用渲染函数，传入解析出的三个参数
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
    await typeText("Press [ENTER] to return...");
    waitForEnter();
}


// [零件A] 极速 HTML 打字机：分块打印，每帧输出 8 个字符
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
                    // 每次取 8 个字，大幅减少 DOM 更新次数
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

// [零件B] 极速图片渲染：缩短动画到 0.6s，等待仅 200ms
async function fastRenderImage(src, altText = "IMAGE", extraClasses = "") {
    await typeText(`>> FAST-LOAD: ${altText}`, 2); 
    try {
        await preloadImage(src);
        const container = document.createElement('div');
        container.className = `img-container ${extraClasses}`;
        const img = document.createElement('img');
        img.src = src;
        img.className = 'scan-effect';
        // 强制覆盖 CSS 的 3s 动画，改为极速扫描
        img.style.transition = "clip-path 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)";
        container.appendChild(img);
        outputDiv.appendChild(container);
        scrollToBottom();
        void img.offsetWidth; 
        img.classList.add('loaded');
        await sleep(200); // 极短停顿
    } catch (e) { await typeError(`[LOAD FAIL]`); }
}

// [修改版] 爆发模式渲染器 (带视觉特效)
async function fastRenderContent(contentString) {
    // 1. 【开启特效】激活超频状态
    document.body.classList.add('system-overclock');

    state.mode = 'RenderContent';
    interactiveDiv.innerHTML = '';
    globalCursor.style.display = 'inline-block';

    // 提示语也配合一下氛围
    await typeDebug(">> WARNING: HIGH-SPEED DATA STREAM INITIATED...", 2);
    await sleep(200);

    const lines = contentString.split('\n');
    let inCodeBlock = false, codeBuffer = [], codeFilename = "script.py";

    // 使用 try-finally 确保特效一定会被关闭
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
            if (inCodeBlock) { codeBuffer.push(line); continue; }

            if (trimmed.startsWith('[[IMG:')) {
                const rawContent = trimmed.replace(/\[\[IMG:|\]\]/g, '');
                const parts = rawContent.split('|').map(p => p.trim());
                const src = parts[0];
                const alt = parts[1] || "IMAGE";
                const extraClasses = parts.slice(2).join(' ');

                // 调用高速版图片渲染
                await fastRenderImage(src, alt, extraClasses); 
                continue;
            }

            if (trimmed.startsWith('[[PAUSE:')) { 
                const pTime = parseInt(trimmed.replace(/\D/g, ''));
                await sleep(pTime / 4); // 爆发模式下暂停时间大幅缩短
                continue; 
            }

            if (line.length > 0) {
                // 调用高速版 HTML 打字机
                await fastTypeTextHTML(line);
            }
        }
    } finally {
        // 2. 【关闭特效】渲染结束（无论成功失败），移除超频状态
        document.body.classList.remove('system-overclock');
    }

    await sleep(200);
    await typeDebug("\n>> [STREAM COMPLETE. SYSTEMS STABILIZED.]", 5);
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
    
    // [新增] 如果 animate 为 true，加上 CSS 动画类
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

    menuContainer.insertAdjacentHTML('beforeend', '<div style="margin-top:10px;font-size:0.8em;opacity:0.7">USE ARROW KEYS OR MOUSE</div>');
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

// [修复点 2] 路由控制逻辑增强
async function handleSelection(option) {
    // 1. 在清空界面之前，先获取当前的标题和菜单项
    // 这样如果进入文件查看模式，我们以后还能记得怎么回来
    const titleEl = document.querySelector('.menu-container div:first-child');
    const currentTitle = titleEl ? titleEl.textContent : "MAIN MENU"; 
    // 过滤掉 'back' 按钮，因为渲染函数会自动加
    const currentItems = state.currentMenuOptions.filter(i => i.type !== 'back');

    if (option.type === 'menu') {
        // 进入下一级：把"当前"存入栈中
        state.menuStack.push({ 
            title: currentTitle, 
            items: currentItems 
        });
        renderMenuFromData(`SUBMENU // ${option.label}`, option.items);
    } 
    else if (option.type === 'file') {
        // 进入文件：把"当前"存入 lastMenuContext
		console.log(option.mode);
        state.lastMenuContext = {
            title: currentTitle,
            items: currentItems
        };
        if (option.mode === 'fast') {
			console.log(option.content);
            await fastRenderContent(option.content);
        } else {
            await renderContent(option.content);
        }
    } 
    else if (option.type === 'back') {
        // 返回上一级：从栈中恢复
        const parent = state.menuStack.pop();
        if (parent) {
            renderMenuFromData(parent.title, parent.items);
        } else {
            renderMenuFromData("MAIN MENU // DOMD-TOOLKIT", fileSystem.root);
        }
    } 
    else if (option.type === 'action') {
        if (option.func === 'clear') await clearTerminal();
        if (option.func === 'shutdown') await performShutdown();
    }
}

// [修复点 3] 回车返回逻辑
function waitForEnter() {
    state.mode = 'WAIT';
    const handler = (e) => {
        if(e.key === 'Enter') {
            document.removeEventListener('keydown', handler);
            
            // 此时页面是空的，querySelector 会报错
            // 所以我们直接从 lastMenuContext 读取数据
            if (state.lastMenuContext) {
                renderMenuFromData(state.lastMenuContext.title, state.lastMenuContext.items);
            } else {
                // 如果没有历史记录，兜底回主菜单
                renderMenuFromData("MAIN MENU // DOMD-TOOLKIT", fileSystem.root);
            }
        }
    };
    document.addEventListener('keydown', handler);
}

// --- 功能函数 ---

async function clearTerminal() {
    state.mode = 'BUSY';
    interactiveDiv.innerHTML = '';
    await typeText(">> CLEARING BUFFER...", 5);
    outputDiv.innerHTML = ''; 
    state.menuStack = []; // 清屏重置层级
    renderMenuFromData("MAIN MENU // DOMD-TOOLKIT", fileSystem.root);
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

    // --- [新增] 异步加载 JSON 数据 ---
    try {
        await typeText(">> FETCHING DATA ...", 5);
        
        // 发起网络请求
        const response = await fetch('/contents/data.json'); 
        
        // 检查文件是否存在
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // 解析 JSON 并赋值给全局变量
        fileSystem = await response.json();
        
        await sleep(300);
        await typeText(">> DATA INTEGRITY CHECK: PASS", 5);

    } catch (error) {
        // 如果加载失败（比如 JSON 格式写错了，或者文件没找到）
        await typeError(`[FATAL ERROR] FAILED TO LOAD SYSTEM DATA.`, 5);
        await typeDebug(`DEBUG INFO: ${error.message}`, 5);
        await typeDebug(`Please check server connection.`, 5);
        // 停止启动，显示红色报错
        const errDiv = document.createElement('div');
        errDiv.className = 'error-msg';
        errDiv.textContent = "SYSTEM HALTED";
        outputDiv.appendChild(errDiv);
        return; // 终止程序
    }
    // ----------------------------------

    // 数据加载成功，继续原来的流程
    await typeText(`${fileSystem.sys.boot_msg}`, 5);
    await sleep(200);

    const staticHeader = document.getElementById('static-header');
    if (staticHeader) staticHeader.style.opacity = '1';
    await sleep(500);

    const newsList = fileSystem.sys.news;
    if (newsList && newsList.length > 0) {
        await typeText(">> CHECKING SYSTEM NOTICES...", 5);
        await sleep(300);
        await typeText("----------------------------------------", 0);
        for (const news of newsList) {
            await typeText(` * ${news}`, 5); 
            await sleep(100);
        }
        await typeText("----------------------------------------", 0);
        await sleep(500);
    }

    state.isBooting = false;
    // 启动主菜单
    renderMenuFromData("MAIN MENU // DOMD-TOOLKIT", fileSystem.root, true);
}

// 别忘了保留最后的 window.onload
window.onload = bootSequence;
