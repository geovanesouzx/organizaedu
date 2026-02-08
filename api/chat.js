export default async function handler(req, res) {
    // Configuração de CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

    const { provider, message, history, context } = req.body;
    
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const GROQ_KEY = process.env.GROQ_API_KEY;

    try {
        let result = {};

        // --- 1. PREPARAÇÃO DO CONTEXTO (O SEGREDO PARA A IA "VER") ---
        // Transformamos os arrays em texto formatado para a IA entender o que existe.
        
        // Aulas (Incluindo ID para permitir exclusão)
        const scheduleText = context.schedule && context.schedule.length > 0
            ? context.schedule.map(c => `- ${c.name} (${c.day}, ${c.start}-${c.end}) | Prof: ${c.prof} | Sala: ${c.room} [ID: ${c.id}]`).join('\n')
            : "Nenhuma aula cadastrada.";

        // Tarefas (Apenas pendentes ou recentes)
        const tasksText = context.tasks && context.tasks.length > 0
            ? context.tasks.slice(0, 15).map(t => `- [${t.done ? 'X' : ' '}] ${t.text} (${t.category}) [ID: ${t.id}]`).join('\n')
            : "Nenhuma tarefa.";

        // Notas (Resumidas)
        const notesText = context.notes && context.notes.length > 0
            ? context.notes.slice(0, 5).map(n => `- ${n.title} (Conteúdo: ${n.content.substring(0, 50)}...) [ID: ${n.id}]`).join('\n')
            : "Nenhuma nota.";

        // Finanças
        const financeText = context.finance && context.finance.length > 0
            ? context.finance.slice(0, 10).map(f => `- ${f.desc}: R$ ${f.val} [ID: ${f.id}]`).join('\n')
            : "Nenhum gasto registrado.";

        const fullDataPrompt = `
            DADOS ATUAIS DO USUÁRIO (Use estes dados para responder e executar ações):
            
            📅 GRADE DE AULAS:
            ${scheduleText}

            ✅ TAREFAS:
            ${tasksText}

            📝 NOTAS:
            ${notesText}

            💰 FINANÇAS (Orçamento: R$ ${context.currentBudget}):
            ${financeText}

            🚌 ÔNIBUS: ${context.busStatus || 'N/A'}
            ⌚ DATA/HORA ATUAL: ${context.currentTime}
        `;

        // --- 2. INSTRUÇÕES DE FERRAMENTAS ---
        const toolsInstruction = `
            FERRAMENTAS DISPONÍVEIS:
            Para executar uma ação, responda APENAS um JSON (sem markdown).
            Formato: { "action": { "type": "NOME", "data": { ... } }, "response": "Texto curto" }

            AÇÕES (Use os IDs listados acima para deletar/editar):
            1. create_class: { name, day, start, end, room, prof }
            2. delete_class: { id } (Se usuário pedir p/ apagar pelo nome, procure o ID na lista acima)
            3. create_task: { text, category }
            4. delete_task: { id }
            5. create_transaction: { desc, val }
            6. delete_transaction: { id }
            7. create_note: { title, content }
            8. delete_note: { id }
            9. control_timer: { action: 'start'|'stop', mode: 'pomodoro' }
            10. navigate_to: { page: 'home'|'aulas'|'tarefas'|'financeiro' }
            
            REGRAS:
            - Se o usuário pedir para apagar algo, USE O ID que está nos dados acima.
            - Responda de forma curta e amigável.
        `;

        const fullSystemPrompt = `Você é a OrganizaEdu.\n\n${fullDataPrompt}\n\n${toolsInstruction}`;

        // --- 3. CHAMADA ÀS APIs ---

        // GEMINI
        if (provider === 'gemini') {
            if (!GEMINI_KEY) throw new Error("Chave Gemini ausente.");
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash:generateContent?key=${GEMINI_KEY}`;
            
            let contents = [];
            if (history && Array.isArray(history)) {
                history.forEach(msg => {
                    const role = (msg.role === 'user') ? 'user' : 'model';
                    contents.push({ role: role, parts: [{ text: msg.text }] });
                });
            }
            contents.push({ role: "user", parts: [{ text: message }] });

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: contents,
                    systemInstruction: { parts: [{ text: fullSystemPrompt }] },
                    generationConfig: { temperature: 0.4, responseMimeType: "application/json" }
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            
            // LIMPEZA DE JSON (Remove ```json ... ```)
            const cleanJson = rawText.replace(/```json|```/g, '').trim();
            result = JSON.parse(cleanJson);

        // GROQ
        } else {
             if (!GROQ_KEY) throw new Error("Chave Groq ausente.");
             const url = "https://api.groq.com/openai/v1/chat/completions";
             
             const validHistory = history.map(m => ({
                 role: (m.role === 'user' ? 'user' : 'assistant'),
                 content: m.text
             }));

             const messages = [
                 { role: "system", content: fullSystemPrompt },
                 ...validHistory,
                 { role: "user", content: message }
             ];

             const response = await fetch(url, {
                method: "POST",
                headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: messages, temperature: 0.3, response_format: { type: "json_object" } })
            });

            const data = await response.json();
            result = JSON.parse(data.choices[0].message.content);
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ response: "Erro interno na IA.", error: error.message });
    }
}