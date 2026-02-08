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

            // VERIFICA SE A IA PEDIU UMA AÇÃO
            if (data.action) {
                console.log("IA solicitou ação:", data.action);
                
                // Executa a ação e aguarda finalizar
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

    // --- CORREÇÃO APLICADA AQUI ---
    async executeAction(action) {
        const { type, data } = action;

        console.log(`🤖 IA solicitou execução da ação: [${type}]`, data);

        // Verifica se a função existe nas callbacks passadas pelo script.js
        // Isso conecta 'create_class' do JSON diretamente com 'create_class' do script.js
        if (this.callbacks && typeof this.callbacks[type] === 'function') {
            try {
                // Executa a função passando os dados
                await this.callbacks[type](data);
                console.log(`✅ Ação [${type}] executada com sucesso.`);
            } catch (error) {
                console.error(`❌ Erro ao executar a ação [${type}]:`, error);
                // Opcional: Retornar erro para o chat se necessário
            }
        } else {
            console.warn(`⚠️ Ação [${type}] não encontrada. Verifique se o nome no script.js (AI_Actions) é idêntico ao que a IA enviou.`);
        }
    }
}