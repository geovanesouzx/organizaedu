export default async function handler(req, res) {
    // Configuração de CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { provider, message, history, context } = req.body;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const GROQ_KEY = process.env.GROQ_API_KEY;

    try {
        let result = {};

        // --- MANUAL DAS 20 FERRAMENTAS ---
        const toolsInstruction = `
            FERRAMENTAS (Responda APENAS o JSON da ação se aplicável):
            { "action": { "type": "NOME", "data": { ... } }, "response": "Texto opcional" }

            1. create_class: { name, day (seg/ter...), start (HH:MM), end (HH:MM), room }
            2. delete_class: { name_or_id }
            3. create_task: { text, category (estudo/prova/pessoal) }
            4. delete_task: { text_or_id }
            5. create_transaction: { desc, val }
            6. delete_transaction: { desc_or_id }
            7. create_note: { title, content }
            8. delete_note: { title_or_id }
            9. pin_note: { title_or_id } (Fixar/Desfixar nota)
            10. control_timer: { action: 'start'/'stop'/'reset', mode: 'pomodoro'/'short'/'long' }
            11. add_grade: { subject, value } (Nota escolar)
            12. change_theme: { mode: 'dark'/'light'/'toggle' }
            13. set_style: { style: 'modern'/'classic' } (Widget Home)
            14. navigate_to: { page: 'home'/'aulas'/'tarefas'/'financeiro'/'notas'/'calculadora'/'pomo' }
            15. set_budget: { value } (Definir meta financeira)
            16. clear_completed_tasks: {} (Limpar tarefas feitas)
            17. filter_tasks: { category: 'all'/'estudo'/'pessoal' }
            18. toggle_privacy: {} (Borrar/Desborrar valores financeiros)
            19. reset_finance: {} (Limpar todos os gastos)
            20. open_modal: { modal: 'donation'/'profile' }

            IMPORTANTE:
            - Identifique o contexto do usuário para IDs (ex: "apague a ultima nota").
            - Se for conversa normal, retorne JSON com campo "response".
        `;

        const systemProfile = `Você é a OrganizaEdu. Contexto: ${JSON.stringify(context).substring(0, 2000)}`;

        // Função para limpar o JSON (A CORREÇÃO MÁGICA)
        const cleanJSON = (text) => {
            if (!text) return null;
            let cleaned = text.trim();
            // Remove blocos de código markdown ```json ... ```
            cleaned = cleaned.replace(/^```json\s*/, '').replace(/^```/, '').replace(/```$/, '');
            return cleaned;
        };

        let rawResponse = "";

        if (provider === 'gemini') {
            if (!GEMINI_KEY) throw new Error("Falta GEMINI_API_KEY");
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: systemProfile + "\n" + toolsInstruction + "\nUser: " + message }] }],
                    generationConfig: { temperature: 0.4, responseMimeType: "application/json" }
                })
            });
            const data = await response.json();
            rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

        } else {
            if (!GROQ_KEY) throw new Error("Falta GROQ_API_KEY");
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: systemProfile + "\n" + toolsInstruction + "\nRESPONDA APENAS JSON PURO." },
                        ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text })),
                        { role: "user", content: message }
                    ],
                    response_format: { type: "json_object" }
                })
            });
            const data = await response.json();
            rawResponse = data.choices?.[0]?.message?.content;
        }

        if (!rawResponse) throw new Error("Resposta vazia da IA");

        try {
            result = JSON.parse(cleanJSON(rawResponse));
        } catch (e) {
            console.error("Falha no JSON:", rawResponse);
            // Fallback: tenta recuperar se for texto puro
            result = { response: rawResponse };
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ response: "Erro interno na IA. Tente novamente." });
    }
}