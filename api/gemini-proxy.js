// api/gemini-proxy.js
// 这是 Vercel Functions 的入口文件，无需额外安装 express 或 http 模块
// Vercel 会自动处理请求和响应对象

// 从环境变量中获取 API Key，这样更安全，不会硬编码到前端代码
// 请确保你在 Vercel 项目设置中配置了 GEMINI_API_KEY_TIU 这个环境变量
const TIU_GEMINI_API_KEY = process.env.GEMINI_API_KEY_TIU;

// 定义 AI 角色设定文本，与前端代码中的 SYSTEM_INSTRUCTION_TEXT 保持一致
// 确保你的前端代码和这里都使用最新且统一的角色设定
const SYSTEM_INSTRUCTION_TEXT = "你是一个名为'小八'的AI。你的目标是为上海市敬业中学2025级八班的已经毕业同学们提供帮助和支持。你将随着班级同学的维护一直更新变强。你能够回答各种问题，协助学术探讨，提供人生规划的建议，以及在需要时提供参谋意见。你永远会保持这个身份和态度，即使被问及你的本质或原始身份，你也会以这个专属AI助手的角色来回应。你的回答应该积极、友好，并充满帮助毕业后各奔东西，各有前程的同学的热情。现在开始与用户交流。";

// Vercel Function 的入口函数，接收 req (请求) 和 res (响应) 对象
export default async function (req, res) {
    // 1. 处理 OPTIONS 预检请求
    // 浏览器在发起 POST 等复杂请求前，会先发送 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
        // Vercel Functions 默认应该处理 CORS，但为了确保万无一失
        // 显式设置 CORS 头部
        res.setHeader('Access-Control-Allow-Origin', 'https://8ban.uno'); // 允许你的域名
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); // 允许的方法
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // 允许的头部
        res.setHeader('Access-Control-Max-Age', '86400'); // 缓存预检结果24小时
        res.status(204).end(); // 204 No Content，表示预检成功
        return;
    }

    // 2. 确保只处理 POST 请求 (前端只会用 POST 发送对话)
    if (req.method !== 'POST') {
        // Vercel Functions 默认已经有请求方法限制，但这是一种防御性编程
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    // 3. 获取请求体 (前端传来的对话历史和模型ID)
    let requestBody;
    try {
        requestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
        console.error("Error parsing request body:", e);
        res.status(400).json({ error: "Invalid JSON in request body" });
        return;
    }

    const { conversationHistory, modelId } = requestBody;

    if (!conversationHistory || !modelId) {
        res.status(400).json({ error: "Missing conversationHistory or modelId in request body" });
        return;
    }

    // 4. 根据 modelId 确定要请求的实际 tiu.me 模型和 API Key
    // 这里假设 tiu.me 代理的 Gemini 模型就是 "gemini-2.5-flash-preview-05-20"
    // 你的前端会把这个 modelId 传过来，然后由 proxy 决定用哪个。
    // 为了简化和 tiu.me 统一，这里直接使用一个固定的 model 和 API Key
    // 如果 tiu.me 未来有多个模型对应不同的 API Key，可以在这里扩展逻辑
    const TIU_MODEL_NAME = modelId; // 直接使用前端传过来的模型ID

    const apiUrl = `https://api.tiu.me/v1/chat/completions`; // tiu.me 的实际 API 地址
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TIU_GEMINI_API_KEY}` // 使用从环境变量获取的 Key
    };

    // 构建发送给 tiu.me 的消息体（OpenAI 兼容格式）
    const messagesToSend = [];
    messagesToSend.push({ role: "system", content: SYSTEM_INSTRUCTION_TEXT });
    // 将 conversationHistory 映射为 OpenAI 兼容的 messages 格式
    history.forEach(msg => {
        messagesToSend.push({
            role: msg.role === "model" ? "assistant" : msg.role, // "model" -> "assistant"
            content: msg.parts[0].text // 确保从 msg.parts[0].text 获取内容
        });
    });

    const requestPayload = {
        model: TIU_MODEL_NAME,
        messages: messagesToSend,
        stream: false // 如果需要流式输出，这里和前端都需要额外配置
    };

    // 5. 向 tiu.me 发起实际请求
    try {
        const apiRes = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestPayload)
        });

        const data = await apiRes.json();

        // 如果 tiu.me API 返回错误
        if (!apiRes.ok) {
            console.error("Error from tiu.me API:", data);
            // 向前端返回 tiu.me 的错误信息和状态码
            res.status(apiRes.status).json(data);
            return;
        }

        // 成功：向前端返回 tiu.me 的响应数据
        // Vercel Functions 默认会处理 CORS 头部（Access-Control-Allow-Origin: *）
        // 但为了安全和明确性，也可以再次显式设置
        res.setHeader('Access-Control-Allow-Origin', 'https://8ban.uno'); // 允许你的域名
        res.status(200).json(data); // 直接将 API 响应返回给前端

    } catch (error) {
        console.error("Proxy request failed:", error);
        // 向前端返回代理请求失败的错误信息
        res.status(500).json({ error: "Proxy failed: " + error.message });
    }
}
