export class OrganizaIA {
    constructor(callbacks) {
        this.callbacks = callbacks; // Funções do script.js que a IA pode chamar
    }

    // Formata o texto para HTML (Markdown simples)
    formatResponse(text) {
        if (!text) return "";
        let formatted = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Negrito
            .replace(/\*(.*?)\*/g, '<em>$1</em>')             // Itálico
            .replace(/\n/g, '<br>');                           // Quebra de linha
        return formatted;
    }

    async processMessage(userText, contextData, provider) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: provider,
                    message: userText,
                    context: contextData,
                    history: [] 
                })
            });

            // Se der erro 429 ou 500, tratamos como texto
            if (!response.ok) {
                const errText = await response.text();
                try {
                    const errJson = JSON.parse(errText);
                    return { text: `Erro da IA: ${errJson.error || 'Desconhecido'}` };
                } catch (e) {
                    return { text: "A IA está sobrecarregada ou indisponível no momento. Tente novamente em alguns segundos." };
                }
            }

            const data = await response.json();
            
            // Verifica se a IA mandou executar uma ação (JSON estruturado)
            if (data.action) {
                console.log("IA solicitou ação:", data.action);
                await this.executeAction(data.action);
                
                // Se a IA também mandou uma resposta de texto junto com a ação
                if (data.response) {
                    return { text: this.formatResponse(data.response) };
                }
                return { text: "Feito! ✅" };
            }

            // Se for resposta normal de texto
            return {
                text: this.formatResponse(data.response || data.text),
                raw: data
            };

        } catch (error) {
            console.error("Erro na OrganizaIA:", error);
            return { text: "Tive um problema de conexão. Verifique sua internet." };
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
            default:
                console.warn("Ação desconhecida da IA:", type);
        }
    }
}