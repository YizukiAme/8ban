// api/gemini-proxy.js
// 这是一个 Vercel Serverless Function，用于代理对 tiu.me (Gemini) API 的请求
// 部署在 Vercel 后，你的前端可以请求 /api/gemini-proxy，而无需面对 CORS 问题

// Vercel Functions 默认支持 node-fetch，无需额外安装
// import fetch from 'node-fetch'; // 在 Vercel 环境中通常不需要显式引入，因为它是内置的

// *** 请在 Vercel 项目设置中配置环境变量：GEMINI_API_KEY_TIU ***
// 访问方式：process.env.YOUR_VARIABLE_NAME
const TIU_GEMINI_API_KEY = process.env.GEMINI_API_KEY_TIU; 

// AI 角色设定，与前端代码中的 SYSTEM_INSTRUCTION_TEXT 保持一致
const SYSTEM_INSTRUCTION_TEXT = 
    "你是一个名为'小八'的AI。你的目标是为上海市敬业中学2025级八班的已经毕业同学们提供帮助和支持。你将随着班级同学的维护一直更新变强。你能够回答各种问题，协助学术探讨，提供人生规划的建议，以及在需要时提供参谋意见。你永远会保持这个身份和态度，即使被问及你的本质或原始身份，你也会以这个专属AI助手的角色来回应。你的回答应该积极、友好，并充满帮助毕业后各奔东西，各有前程的同学的热情。现在开始与用户交流。";

export default async function (req, res) {
    // 检查请求方法，只允许 POST
    if (req.method !== 'POST') {
        // 对于 OPTIONS 预检请求，直接返回 200 OK 并带上 CORS 头
        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', '*'); // 允许所有源（或者更精确地设置为 'https://8ban.uno'）
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // 允许前端发送的头
            res.setHeader('Access-Control-Max-Age', '86400'); // 预检请求结果缓存1天
            return res.status(200).end();
        }
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 检查 API Key 是否已设置
    if (!TIU_GEMINI_API_KEY) {
        return res.status(500).json({ error: "Server API Key not configured. Please set GEMINI_API_KEY_TIU in Vercel Environment Variables." });
    }

    // 从前端请求体中获取对话历史和模型ID
    const { conversationHistory, modelId } = req.body;

    if (!conversationHistory || !modelId) {
        return res.status(400).json({ error: "Missing conversationHistory or modelId in request body." });
    }

    // tiu.me 的 API URL
    const targetUrl = `https://api.tiu.me/v1/chat/completions`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TIU_GEMINI_API_KEY}`
    };

    // 构建发送给 tiu.me 的请求体
    const requestMessages = [];
    requestMessages.push({ role: "system", content: SYSTEM_INSTRUCTION_TEXT });
    const messages = conversationHistory.map(msg => ({
        role: msg.role === "model" ? "assistant" : msg.role, // "model" -> "assistant" for OpenAI
        content: msg.parts[0].text // 确保从 msg.parts[0].text 获取内容
    }));
    requestMessages.push(...messages);

    const requestBody = {
        model: modelId, // 使用前端传递的模型ID
        messages: requestMessages,
        stream: false // 如果需要流式传输，这里需要修改
    };

    try {
        const apiRes = await fetch(targetUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        const data = await apiRes.json();

        // 将 tiu.me API 的响应状态码和内容直接转发给前端
        res.setHeader('Access-Control-Allow-Origin', '*'); // **允许所有源，解决前端 CORS 问题**
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); // 必须允许 POST 和 OPTIONS
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); // 允许前端发出的头
        
        // 通常情况下，Vercel Functions 会自动处理一些基本 CORS 头，
        // 但显式设置 Access-Control-Allow-Origin 可以在这里确保。

        if (!apiRes.ok) {
            // 如果上游 API 返回错误，也把错误状态码和信息返回给前端
            console.error("Error from tiu.me API:", data);
            return res.status(apiRes.status).json(data);
        }

        return res.status(200).json(data);

    } catch (error) {
        console.error("Proxy request failed:", error);
        // 如果代理请求本身失败（如网络问题）
        return res.status(500).json({ 
            error: "Proxy server internal error: " + error.message,
            developerMessage: "检查 Vercel Function 日志和上游 API 状态。" 
        });
    }
}
