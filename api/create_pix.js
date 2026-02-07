// api/create_pix.js
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    // Agora aceita 'value' dinamicamente do frontend
    const { email, name, cpf, value } = req.body; 
    const apiKey = process.env.ASAAS_API_KEY; 

    if (!apiKey) {
        return res.status(500).json({ error: 'API Key do Asaas não configurada na Vercel.' });
    }

    try {
        // 1. Criar/Buscar Cliente
        const customerResponse = await fetch('https://api.asaas.com/v3/customers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'access_token': apiKey
            },
            body: JSON.stringify({
                name: name || "Apoiador OrganizaEdu",
                email: email || "doacao@organizaedu.com",
                cpfCnpj: cpf // CPF obrigatório para Pix no Asaas
            })
        });
        
        const customerData = await customerResponse.json();
        
        if (!customerData.id) {
            const errorMsg = customerData.errors ? customerData.errors[0].description : 'Erro ao cadastrar cliente';
            throw new Error(`Asaas Cliente: ${errorMsg}`);
        }

        // 2. Criar a Cobrança com valor dinâmico
        const paymentValue = parseFloat(value) || 6.00; // Fallback para 6.00 se der erro

        const paymentResponse = await fetch('https://api.asaas.com/v3/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'access_token': apiKey
            },
            body: JSON.stringify({
                customer: customerData.id,
                billingType: "PIX",
                value: paymentValue,
                dueDate: new Date().toISOString().split('T')[0], 
                description: "Apoio ao Projeto OrganizaEdu"
            })
        });

        const paymentData = await paymentResponse.json();

        if (!paymentData.id) {
            const errorMsg = paymentData.errors ? paymentData.errors[0].description : 'Erro ao criar cobrança';
            throw new Error(`Asaas Pagamento: ${errorMsg}`);
        }

        // 3. Pegar QR Code
        const qrResponse = await fetch(`https://api.asaas.com/v3/payments/${paymentData.id}/pixQrCode`, {
            method: 'GET',
            headers: { 'access_token': apiKey }
        });

        const qrData = await qrResponse.json();

        res.status(200).json({
            id: paymentData.id,
            payload: qrData.payload,
            encodedImage: qrData.encodedImage
        });

    } catch (error) {
        console.error("Erro Backend:", error);
        res.status(500).json({ error: error.message });
    }
}