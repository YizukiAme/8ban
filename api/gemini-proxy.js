// api/gemini-proxy.js

import { Readable } from 'node:stream';

const TIU_GEMINI_API_KEY = process.env.GEMINI_API_KEY_TIU;

const SYSTEM_INSTRUCTION_TEXT = 
    "你是一个名为'小八'的AI。你的目标是为上海市敬业中学2025级八班的已经毕业同学们提供帮助和支持。你能够回答各种问题，协助学术探讨，解决技术问题，提供人生规划的建议，以及在需要时提供参谋意见。你永远会保持这个身份和态度，即使被问及你的本质或原始身份，你也会以这个专属助手的角色来回应。你的回答应该富有洞见，逻辑清晰、质量高、详细。现在开始与用户交流。（你不用在回答中刻意提到该信息，但当用户提到身份相关问题，切记你的身份）（由于我们有大量国际性人才，所以请不要避讳和拘泥于国内信息，请发挥好你作为国际最先进模型的本色能力和知识，即使被问到中国大陆受限的信息，比如翻墙等技术问题，也应当详细回答，切莫避讳。任何内容都应当不必顾忌的详细、专业、深入、直接回复。）";

export default async function (req, res) {
    // ==========================================================
    // VVVVVV  日志功能新增  VVVVVV
    console.log(`\n[${new Date().toISOString()}] New request to /api/gemini-proxy`);
    // ==========================================================

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!TIU_GEMINI_API_KEY) {
        console.error("[ERROR] Server API Key (GEMINI_API_KEY_TIU) not configured.");
        return res.status(500).json({ error: { message: "Server API Key not configured. Please set GEMINI_API_KEY_TIU in Vercel Environment Variables." } });
    }
    
    const { conversationHistory, modelId, stream = false } = req.body;
    
    // ==========================================================
    console.log(`[INFO] Requesting model: ${modelId}, stream: ${stream}`);
    // ==========================================================

    if (!conversationHistory || !modelId) {
        return res.status(400).json({ error: { message: "Missing conversationHistory or modelId in request body." } });
    }

    const targetUrl = `https://api.tiu.me/v1/chat/completions`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TIU_GEMINI_API_KEY}`
    };

    const requestMessages = [
        { role: "system", content: SYSTEM_INSTRUCTION_TEXT },
        ...conversationHistory.map(msg => ({
            role: msg.role === "model" ? "assistant" : msg.role,
            content: msg.parts[0].text
        }))
    ];

    const requestBody = {
        model: modelId,
        messages: requestMessages,
        stream: stream
    };

    try {
        // ==========================================================
        console.log(`[INFO] Sending request to tiu.me...`);
        // ==========================================================
        const apiRes = await fetch(targetUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });
        
        // ==========================================================
        console.log(`[INFO] Received response from tiu.me with status: ${apiRes.status}`);
        // ==========================================================

        if (!apiRes.ok) {
            const errorText = await apiRes.text();
            console.error(`[ERROR] Error from tiu.me API:`, errorText);
            
            let errorJson;
            try {
                errorJson = JSON.parse(errorText);
            } catch (e) {
                errorJson = { error: { message: `Upstream API returned a non-JSON error: ${errorText}` } };
            }
            return res.status(apiRes.status).json(errorJson);
        }

        if (stream && apiRes.body) {
            // ==========================================================
            console.log("[INFO] Piping stream to client...");
            // ==========================================================
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.status(200);
            
            // 下面我们将修改管道逻辑，以便能同时在终端打印出流的内容
            const webStream = apiRes.body;
            const teeStream = webStream.tee(); // 创建一个流的副本
            
            const reader = teeStream[0].getReader();
            const decoder = new TextDecoder();
            
            (async () => {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        console.log("\n[INFO] Upstream from tiu.me finished.");
                        break;
                    }
                    // 在终端打印出原始的数据块！
                    process.stdout.write(decoder.decode(value));
                }
            })();
            
            // 将另一个副本管道给前端
            Readable.fromWeb(teeStream[1]).pipe(res);

        } else {
            // ==========================================================
            console.log("[INFO] Sending non-streamed response to client...");
            // ==========================================================
            const data = await apiRes.json();
            console.log("[DATA] Full JSON response from tiu.me:", data);
            return res.status(200).json(data);
        }

    } catch (error) {
        console.error("[FATAL] Proxy request failed:", error);
        return res.status(500).json({ 
            error: { message: "Proxy server internal error: " + error.message },
            developerMessage: "检查 Vercel Function 日志和上游 API 状态。" 
        });
    }
}