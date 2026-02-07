export default async function handler(req, res) {
    // Configuração de CORS para permitir acesso do seu frontend
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

    const { provider, message, history, context } = req.body;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const GROQ_KEY = process.env.GROQ_API_KEY;

    try {
        let result = {};

        // --- SISTEMA DE TOOLS (AÇÕES) ---
        // Instrução para a IA retornar JSON quando precisar agir
        const toolsInstruction = `
            FERRAMENTAS DISPONÍVEIS:
            Para executar uma ação, responda APENAS um JSON no seguinte formato (sem markdown):
            {
              "action": {
                "type": "NOME_DA_ACAO",
                "data": { ...dados }
              },
              "response": "Texto de confirmação para o usuário"
            }

            AÇÕES SUPORTADAS:
            1. create_class (Adicionar Aula)
               - data: { name (obrigatório), day (seg,ter,qua,qui,sex,sab), start (HH:MM), end (HH:MM), room, prof }
            2. delete_class (Excluir Aula)
               - data: { id (se souber) ou nome aproximado }
            3. create_task (Criar Tarefa)
               - data: { text (obrigatório), category (estudo, prova, trabalho, pessoal), date (YYYY-MM-DDTHH:MM) }
            4. delete_task (Excluir Tarefa)
               - data: { id }
            5. create_transaction (Adicionar Gasto)
               - data: { desc, val }

            Se não for ação, responda apenas o texto normalmente (JSON com campo "response" ou texto puro).
        `;

        const systemProfile = `
            Você é a OrganizaEdu, assistente pessoal integrada.
            Identidade: OrganizaEdu (nunca Llama/GPT).
            Tom: Prestativa, Otimista.
            
            DADOS ATUAIS DO USUÁRIO:
            ${JSON.stringify(context)}
        `;

        // --- GEMINI (GOOGLE) ---
        if (provider === 'gemini') {
            if (!GEMINI_KEY) throw new Error("Chave API Gemini não configurada.");
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_KEY}`;
            
            const fullSystemPrompt = systemProfile + "\n\n" + toolsInstruction;
            
            let contents = [];
            if (history && Array.isArray(history)) {
                history.forEach(msg => contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] }));
            }
            contents.push({ role: "user", parts: [{ text: message }] });

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: contents,
                    systemInstruction: { parts: [{ text: fullSystemPrompt }] },
                    generationConfig: { 
                        temperature: 0.4, // Menor temperatura para seguir instruções JSON
                        responseMimeType: "application/json" // Força JSON no Gemini
                    }
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(`Erro Gemini: ${data.error.message}`);
            
            const rawText = data.candidates[0].content.parts[0].text;
            try {
                result = JSON.parse(rawText);
            } catch (e) {
                // Se não vier JSON válido, assume que é texto
                result = { response: rawText };
            }

        // --- GROQ (LLAMA) ---
        } else {
            // ... (implementação similar para Groq se necessário, focando no Gemini agora)
             if (!GROQ_KEY) throw new Error("Chave API Groq não configurada.");
             const url = "https://api.groq.com/openai/v1/chat/completions";
             
             const messages = [
                 { role: "system", content: systemProfile + "\n\n" + toolsInstruction + "\nIMPORTANTE: Responda SEMPRE em JSON válido." },
                 ...history.map(m => ({ role: m.role, content: m.text })),
                 { role: "user", content: message }
             ];

             const response = await fetch(url, {
                method: "POST",
                headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: messages, temperature: 0.4, response_format: { type: "json_object" } })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            result = JSON.parse(data.choices[0].message.content);
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error("API Chat Error:", error);
        return res.status(500).json({ response: "Erro ao processar sua solicitação. Tente novamente.", error: error.message });
    }
}