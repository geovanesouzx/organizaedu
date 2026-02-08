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
            // Cria um controlador de tempo limite (30 segundos) para o mobile não ficar travado
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal, // Liga o timeout
                body: JSON.stringify({
                    provider: provider,
                    message: userText,
                    context: contextData,
                    history: history
                })
            });

            clearTimeout(timeoutId); // Limpa o timer se respondeu a tempo

            // SE DER ERRO NA RESPOSTA
            if (!response.ok) {
                const errText = await response.text();
                console.error("Erro Bruto:", errText);

                // Tenta ler se é um JSON de erro
                try {
                    const errJson = JSON.parse(errText);
                    return { text: `⚠️ Erro da IA: ${errJson.error || 'Desconhecido'}` };
                } catch (e) {
                    // Se não for JSON, é erro de servidor (HTML)
                    return { text: `⚠️ Erro Técnico (${response.status}): A conexão caiu ou os dados são muito pesados para o mobile.` };
                }
            }

            const data = await response.json();

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
                return { text: "⏱️ A IA demorou muito. Sua internet móvel pode estar lenta para enviar todo o contexto." };
            }
            return { text: `🚫 Erro de Conexão: ${error.message}.` };
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