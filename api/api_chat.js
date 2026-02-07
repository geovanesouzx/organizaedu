// api/chat.js
export default async function handler(req, res) {
    // Permite CORS (acesso de qualquer origem ou configure seu domínio)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { provider, message, history } = req.body;

    // As chaves devem estar configuradas nas Variáveis de Ambiente da Vercel
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const GROQ_KEY = process.env.GROQ_API_KEY;

    try {
        let resultText = "";

        // --- GEMINI (GOOGLE) ---
        if (provider === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
            
            let contents = [];
            if (history) {
                history.forEach(msg => {
                    contents.push({ 
                        role: msg.role === 'user' ? 'user' : 'model', 
                        parts: [{ text: msg.text }] 
                    });
                });
            }
            contents.push({ role: "user", parts: [{ text: message }] });

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: contents,
                    generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            resultText = data.candidates[0].content.parts[0].text;

        // --- GROQ (LLAMA) ---
        } else {
            const url = "https://api.groq.com/openai/v1/chat/completions";
            
            let messages = [];
            if (history) {
                history.forEach(msg => {
                    messages.push({ role: msg.role, content: msg.text });
                });
            }
            messages.push({ role: "user", content: message });

            const response = await fetch(url, {
                method: "POST",
                headers: { 
                    "Authorization": `Bearer ${GROQ_KEY}`, 
                    "Content-Type": "application/json" 
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: messages,
                    temperature: 0.6,
                    response_format: { type: "json_object" }
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            resultText = data.choices[0].message.content;
        }

        return res.status(200).json({ text: resultText });

    } catch (error) {
        console.error("Erro na API Vercel:", error);
        return res.status(500).json({ error: error.message });
    }
}