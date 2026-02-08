export default async function handler(req, res) {
    // Configuração de CORS
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

        // --- SISTEMA DE TOOLS (COMPLETO COM AS 20 FUNÇÕES) ---
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

            AÇÕES SUPORTADAS (Use exatamente estes nomes):
            1. create_class: { name, day, start, end, room, prof }
            2. delete_class: { name_or_id }
            3. create_task: { text, category, date }
            4. delete_task: { text_or_id }
            5. create_transaction: { desc, val }
            6. delete_transaction: { desc_or_id }
            7. create_note: { title, content }
            8. delete_note: { title_or_id }
            9. pin_note: { title_or_id }
            10. control_timer: { action: 'start'|'stop'|'reset', mode: 'pomodoro'|'short'|'long' }
            11. add_grade: { subject, value }
            12. change_theme: { mode: 'dark'|'light'|'toggle' }
            13. set_style: { style: 'modern'|'classic' }
            14. navigate_to: { page: 'home'|'aulas'|'tarefas'|'financeiro'|'notas'|'pomo'|'onibus' }
            15. set_budget: { value: numero }
            16. clear_completed_tasks: {}
            17. filter_tasks: { category: 'estudo'|'prova'|'trabalho'|'pessoal' }
            18. toggle_privacy: {} (Ativa/Desativa blur nos valores)
            19. reset_finance: {} (Apaga todos os gastos - Cuidado)
            20. open_modal: { modal: 'donation'|'profile' }

            REGRAS:
            - Se o usuário pedir para criar algo, USE O JSON.
            - Se for conversa normal, JSON apenas com "response".
            - Identidade: OrganizaEdu (Assistente Pessoal Acadêmico).
        `;

        const systemProfile = `
            Você é a OrganizaEdu.
            
            DADOS DO USUÁRIO:
            - Nome: ${context.profile?.name || 'Estudante'}
            - Ônibus: ${context.busStatus || 'N/A'}
            - Saldo Restante: R$ ${(context.currentBudget - (context.finance?.reduce((a,b)=>a+b.val,0)||0)).toFixed(2)}
            - Tarefas Pendentes: ${context.tasks?.filter(t=>!t.done).length || 0}
            - Data/Hora: ${context.currentTime}
        `;

        // --- GEMINI (GOOGLE) ---
        if (provider === 'gemini') {
            if (!GEMINI_KEY) throw new Error("Chave API Gemini não configurada.");
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
            
            // Usando modelo Flash mais recente para melhor performance JSON
            const fullSystemPrompt = systemProfile + "\n\n" + toolsInstruction;
            
            let contents = [];
            if (history && Array.isArray(history)) {
                history.forEach(msg => {
                    // Mapeia roles para garantir compatibilidade
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
                    generationConfig: { 
                        temperature: 0.4, 
                        responseMimeType: "application/json" 
                    }
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(`Erro Gemini: ${data.error.message}`);
            
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) throw new Error("Resposta vazia do Gemini");

            try {
                result = JSON.parse(rawText);
            } catch (e) {
                result = { response: rawText };
            }

        // --- GROQ (LLAMA) ---
        } else {
             if (!GROQ_KEY) throw new Error("Chave API Groq não configurada.");
             const url = "https://api.groq.com/openai/v1/chat/completions";
             
             const validHistory = history.map(m => {
                 let role = 'user';
                 if (m.role && (m.role === 'assistant' || m.role === 'ai' || m.role === 'model')) {
                     role = 'assistant';
                 }
                 return { role: role, content: m.text };
             });

             const messages = [
                 { role: "system", content: systemProfile + "\n\n" + toolsInstruction + "\nIMPORTANTE: Responda APENAS em JSON." },
                 ...validHistory,
                 { role: "user", content: message }
             ];

             const response = await fetch(url, {
                method: "POST",
                headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: messages, temperature: 0.3, response_format: { type: "json_object" } })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            result = JSON.parse(data.choices[0].message.content);
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error("API Chat Error:", error);
        return res.status(500).json({ response: "Erro no servidor da IA. Tente novamente.", error: error.message });
    }
}