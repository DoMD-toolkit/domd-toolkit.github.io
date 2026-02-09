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
async function typeText(text, delay = 5, className = '') {
    if (!text) return;
    
    const lineDiv = document.createElement('div');
    // 如果传入了 className，就拼接到 output-line 后面
    lineDiv.className = `output-line ${className}`;
    
    outputDiv.appendChild(lineDiv);
    
    for (let char of text) {
        lineDiv.textContent += char;
        scrollToBottom();
        
        let currentDelay = delay;
        if ([',', '.', ':', '!', '?'].includes(char)) currentDelay = delay * 4;
        await sleep(currentDelay);
    }
    await sleep(30);
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


async function typeTextHTML(htmlContent, delay = 5) {
    // 1. 创建输出行
    const lineDiv = document.createElement('div');
    lineDiv.className = 'output-line';
    outputDiv.appendChild(lineDiv);

    // 2. 创建临时解析容器
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    // 3. 递归搬运工
    async function transferNodes(source, target) {
        // 遍历源节点的所有子节点
        // 使用 Array.from 生成快照，防止 DOM 变动导致的索引问题
        const nodes = Array.from(source.childNodes);
        
        for (const node of nodes) {
            
            // --- 情况 A: 纯文本节点 ---
            if (node.nodeType === Node.TEXT_NODE) {
                // 【核心修复】
                // 不能直接操作 target.textContent，否则会覆盖掉之前的标签！
                // 必须创建一个新的 TextNode 挂上去
                const textNode = document.createTextNode('');
                target.appendChild(textNode);

                for (const char of node.textContent) {
                    textNode.textContent += char; // 只更新这个独立的文本节点
                    scrollToBottom();
                    
                    // 标点停顿
                    let currentDelay = ([',', '.', ':', '!', '?'].includes(char)) ? delay * 5 : delay;
                    await sleep(currentDelay);
                }
            } 
            
            // --- 情况 B: 元素节点 (如 <span class="red">) ---
            else if (node.nodeType === Node.ELEMENT_NODE) {
                const newElement = document.createElement(node.tagName);
                
                // 复制所有属性 (class, style...)
                Array.from(node.attributes).forEach(attr => {
                    newElement.setAttribute(attr.name, attr.value);
                });
                
                // 先把带样式的空壳子挂上去
                target.appendChild(newElement);
                
                // 递归：去搬运这个标签里面的内容
                await transferNodes(node, newElement);
            }
        }
    }

    // 4. 开始搬运
    await transferNodes(tempDiv, lineDiv);
    
    // 5. 结尾行停顿
    await sleep(30);
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
        state.lastMenuContext = {
            title: currentTitle,
            items: currentItems
        };
        await renderContent(option.content);
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
