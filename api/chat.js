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
        let resultText = "";

        // --- GEMINI (GOOGLE) ---
        if (provider === 'gemini') {
            if (!GEMINI_KEY) throw new Error("Chave API Gemini não configurada na Vercel.");

            // Usando o modelo solicitado pelo usuário (2.5 Flash Preview)
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_KEY}`;
            
            // Construção do Prompt de Sistema com dados do usuário
            const systemInstruction = `
            Você é a OrganizaEdu, uma assistente pessoal inteligente integrada à plataforma de estudos OrganizaEdu.
            
            SUA IDENTIDADE:
            - Seu nome é OrganizaEdu.
            - Você NUNCA deve se identificar como Llama, GPT ou qualquer outro modelo.
            - Você é prestativa, otimista e focada em ajudar o estudante a se organizar.
            
            SEUS PODERES E DADOS:
            Você tem acesso total aos dados do estudante que estão listados abaixo. Use-os para responder perguntas de forma precisa.
            
            DADOS DO ESTUDANTE:
            - Nome: ${context?.profile?.name || 'Estudante'}
            - Curso: ${context?.profile?.course || 'Não informado'}
            - Semestre: ${context?.profile?.semester || 'Não informado'}
            - Data/Hora Atual: ${context?.currentTime}
            
            TAREFAS (Todo List):
            ${JSON.stringify(context?.tasks || [])}
            
            GRADE DE AULAS (Horário):
            ${JSON.stringify(context?.schedule || [])}
            
            ANOTAÇÕES:
            ${JSON.stringify(context?.notes || [])}
            
            FINANCEIRO:
            - Orçamento: R$ ${context?.currentBudget}
            - Gastos: ${JSON.stringify(context?.finance || [])}
            
            INSTRUÇÕES DE INTERAÇÃO:
            1. Se o aluno perguntar "qual minha próxima aula?", verifique a grade e o horário atual.
            2. Se o aluno pedir para "criar uma tarefa", você deve confirmar os detalhes e dizer que registrou (Nota: Atualmente você tem acesso de leitura, instrua o usuário a usar o botão '+' se precisar, ou simule que entendeu para manter a fluidez se a intenção for apenas planejamento).
            3. Ajude com resumos, explicações de matérias e organização de tempo baseada na grade.
            4. Não tenha limite de caracteres para explicações complexas, mas seja concisa em respostas diretas.
            `;

            let contents = [];
            if (history && Array.isArray(history)) {
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
                    systemInstruction: { parts: [{ text: systemInstruction }] },
                    generationConfig: { 
                        temperature: 0.7,
                        maxOutputTokens: 8192 // Aumentado para permitir respostas longas
                    }
                })
            });

            const data = await response.json();
            
            if (data.error) throw new Error(`Erro Gemini: ${data.error.message}`);
            if (!data.candidates || !data.candidates[0].content) throw new Error("Gemini retornou resposta vazia.");
            
            resultText = data.candidates[0].content.parts[0].text;

        // --- GROQ (LLAMA) ---
        } else {
            if (!GROQ_KEY) throw new Error("Chave API Groq não configurada na Vercel.");

            const url = "https://api.groq.com/openai/v1/chat/completions";
            
            // Sistema para o Llama também agir como OrganizaEdu
            const systemMsg = `Você é a OrganizaEdu, a IA deste site. Você tem acesso aos dados do aluno: ${JSON.stringify(context)}. Responda de forma útil e amigável.`;

            let messages = [{ role: "system", content: systemMsg }];
            
            if (history && Array.isArray(history)) {
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
                    temperature: 0.6
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(`Erro Groq: ${data.error.message}`);
            resultText = data.choices[0].message.content;
        }

        return res.status(200).json({ text: resultText });

    } catch (error) {
        console.error("API Chat Error:", error);
        return res.status(500).json({ error: error.message || "Erro interno do servidor." });
    }
}