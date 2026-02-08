export class OrganizaIA {
    constructor(callbacks) {
        this.callbacks = callbacks; // Funções do script.js que a IA pode chamar
    }

    // Formata o texto para HTML (Markdown simples)
    formatResponse(text) {
        if (!text) return "";
        let formatted = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Negrito
            .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Itálico
            .replace(/\n/g, '<br>');                           // Quebra de linha
        return formatted;
    }

    async processMessage(userText, contextData, provider, history) {
        try {
            // Tenta enviar com um timeout de segurança no client-side (30s)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    provider: provider,
                    message: userText,
                    context: contextData,
                    history: history
                })
            });

            clearTimeout(timeoutId);

            // SE DER ERRO NA RESPOSTA (NÃO FOI 200 OK)
            if (!response.ok) {
                const errText = await response.text();
                console.error("Erro Bruto:", errText); // Mostra no console

                // Tenta ler se é um JSON de erro da nossa API
                try {
                    const errJson = JSON.parse(errText);
                    return { text: `⚠️ Erro da IA: ${errJson.error || 'Desconhecido'}` };
                } catch (e) {
                    // Se não for JSON (ex: Erro HTML 504 do Vercel/Firebase por demora)
                    return { text: `⚠️ Erro de Servidor (${response.status}): A conexão caiu ou demorou muito. Tente uma mensagem mais curta.` };
                }
            }

            const data = await response.json();

            // Verifica se a IA mandou executar uma ação
            if (data.action) {
                console.log("IA solicitou ação:", data.action);
                await this.executeAction(data.action);

                if (data.response) {
                    return { text: this.formatResponse(data.response) };
                }
                return { text: "Feito! ✅" };
            }

            return {
                text: this.formatResponse(data.response || data.text),
                raw: data
            };

        } catch (error) {
            console.error("Erro na OrganizaIA:", error);
            if (error.name === 'AbortError') {
                return { text: "⏱️ A IA demorou muito para responder (Timeout). Sua internet pode estar lenta no celular." };
            }
            return { text: `🚫 Erro de Conexão: ${error.message}. Verifique sua internet.` };
        }
    }

    async executeAction(action) {
        const { type, data } = action;

        // Mapeia os comandos da IA para as funções do site
        switch (type) {
            case 'create_class':
                if (this.callbacks.addClass) this.callbacks.addClass(data);
                break;
            case 'delete_class':
                if (this.callbacks.deleteClass) this.callbacks.deleteClass(data.id);
                break;
            case 'create_task':
                if (this.callbacks.addTask) this.callbacks.addTask(data);
                break;
            case 'delete_task':
                if (this.callbacks.deleteTask) this.callbacks.deleteTask(data.id);
                break;
            case 'create_transaction':
                if (this.callbacks.addTransaction) this.callbacks.addTransaction(data);
                break;
            // NOVOS COMANDOS
            case 'create_note':
                if (this.callbacks.createNote) this.callbacks.createNote(data);
                break;
            case 'control_timer':
                if (this.callbacks.controlTimer) this.callbacks.controlTimer(data);
                break;
            case 'add_grade':
                if (this.callbacks.addGrade) this.callbacks.addGrade(data);
                break;
            case 'change_theme':
                if (this.callbacks.changeTheme) this.callbacks.changeTheme(data);
                break;
            case 'set_style':
                if (this.callbacks.setWidgetStyle) this.callbacks.setWidgetStyle(data);
                break;
            default:
                console.warn("Ação desconhecida da IA:", type);
        }
    }
}