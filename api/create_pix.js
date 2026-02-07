export default async function handler(req, res) {
    // Configuração de CORS padrão
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { email, name, cpf, value } = req.body;
        const apiKey = process.env.ASAAS_API_KEY;

        if (!apiKey) {
            console.error("API Key do Asaas não encontrada");
            return res.status(500).json({ error: 'Configuração de servidor inválida (API Key ausente).' });
        }

        // 1. Limpeza e Validação
        const cleanCpf = cpf.replace(/\D/g, ''); // Remove tudo que não for número
        if (cleanCpf.length !== 11) {
            return res.status(400).json({ error: 'CPF inválido. Envie apenas números.' });
        }

        // 2. Buscar se o cliente já existe no Asaas (Evita erro de duplicidade)
        let customerId = null;

        const searchResponse = await fetch(`https://api.asaas.com/v3/customers?cpfCnpj=${cleanCpf}`, {
            method: 'GET',
            headers: { 'access_token': apiKey }
        });
        
        const searchData = await searchResponse.json();
        
        if (searchData.data && searchData.data.length > 0) {
            // Cliente já existe, usa o ID dele
            customerId = searchData.data[0].id;
        } else {
            // 3. Cliente não existe, cria um novo
            const createCustomerResponse = await fetch('https://api.asaas.com/v3/customers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'access_token': apiKey
                },
                body: JSON.stringify({
                    name: name || "Apoiador OrganizaEdu",
                    email: email || "anonimo@organizaedu.com",
                    cpfCnpj: cleanCpf
                })
            });

            const newCustomerData = await createCustomerResponse.json();
            
            if (!newCustomerData.id) {
                // Se der erro ao criar, pega a mensagem
                const errorMsg = newCustomerData.errors ? newCustomerData.errors[0].description : 'Erro desconhecido ao cadastrar cliente';
                throw new Error(`Asaas Cliente: ${errorMsg}`);
            }
            customerId = newCustomerData.id;
        }

        // 4. Criar a Cobrança
        const paymentValue = parseFloat(value) || 6.00;

        const paymentResponse = await fetch('https://api.asaas.com/v3/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'access_token': apiKey
            },
            body: JSON.stringify({
                customer: customerId,
                billingType: "PIX",
                value: paymentValue,
                dueDate: new Date().toISOString().split('T')[0], // Vence hoje
                description: "Apoio ao Projeto OrganizaEdu"
            })
        });

        const paymentData = await paymentResponse.json();

        if (!paymentData.id) {
            const errorMsg = paymentData.errors ? paymentData.errors[0].description : 'Erro ao criar cobrança';
            throw new Error(`Asaas Pagamento: ${errorMsg}`);
        }

        // 5. Obter o QR Code e o Payload (Copia e Cola)
        const qrResponse = await fetch(`https://api.asaas.com/v3/payments/${paymentData.id}/pixQrCode`, {
            method: 'GET',
            headers: { 'access_token': apiKey }
        });

        const qrData = await qrResponse.json();

        if (!qrData.encodedImage) {
            throw new Error("Não foi possível gerar o QR Code Pix no momento.");
        }

        res.status(200).json({
            id: paymentData.id,
            payload: qrData.payload,
            encodedImage: qrData.encodedImage
        });

    } catch (error) {
        console.error("Erro Backend Pix:", error);
        res.status(500).json({ error: error.message });
    }
}