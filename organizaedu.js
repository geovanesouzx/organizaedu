export class OrganizaIA {
    constructor(callbacks) {
        this.callbacks = callbacks; // Funções do script.js que a IA pode chamar
    }

    // Formata o texto para ficar bonito no chat (Markdown simples)
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
                    history: [] // Pode expandir depois
                })
            });

            const data = await response.json();
            
            // Verifica se a IA mandou executar uma ação
            if (data.action) {
                console.log("IA solicitou ação:", data.action);
                await this.executeAction(data.action);
            }

            return {
                text: this.formatResponse(data.response || data.text),
                raw: data
            };

        } catch (error) {
            console.error("Erro na OrganizaIA:", error);
            return { text: "Desculpe, tive um erro de conexão. Tente novamente." };
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