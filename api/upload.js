export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { image } = req.body;
        // Configurar IMGUR_CLIENT_ID nas Variáveis de Ambiente da Vercel
        // Valor padrão para teste local (mas use env vars na produção):
        const clientId = process.env.IMGUR_CLIENT_ID || "513bb727cecf9ac"; 

        // O Imgur aceita Base64 direto no corpo do JSON
        // Removemos o cabeçalho "data:image/png;base64," para enviar só o código
        const base64Image = image.replace(/^data:image\/\w+;base64,/, "");

        const formData = new URLSearchParams();
        formData.append('image', base64Image);
        formData.append('type', 'base64');

        const response = await fetch('https://api.imgur.com/3/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Client-ID ${clientId}`,
            },
            body: formData
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.data.error || 'Falha no Imgur');
        }

        return res.status(200).json(data);

    } catch (error) {
        console.error("Erro no upload:", error);
        return res.status(500).json({ error: error.message });
    }
}