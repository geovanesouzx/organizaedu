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

    const { id } = req.body;
    const apiKey = process.env.ASAAS_API_KEY;

    try {
        const response = await fetch(`https://api.asaas.com/v3/payments/${id}`, {
            method: 'GET',
            headers: { 'access_token': apiKey }
        });

        const data = await response.json();

        // Verifica se foi pago
        const isPaid = data.status === 'RECEIVED' || data.status === 'CONFIRMED';

        res.status(200).json({ 
            paid: isPaid, 
            status: data.status 
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}