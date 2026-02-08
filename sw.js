const CACHE_NAME = 'organiza-edu-v1';
const URLS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './organizaedu.js', // Novo arquivo importante
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/lucide@latest',
    'https://files.catbox.moe/614u86.png', // Ícone do app
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Poppins:wght@200;400;500;600&display=swap'
];

// 1. Instalação (Cache inicial)
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.all(
                URLS_TO_CACHE.map(url => {
                    return fetch(url, { mode: 'no-cors' })
                        .then(response => {
                            if (response) return cache.put(url, response);
                        })
                        .catch(e => console.warn('Falha no pré-cache:', url));
                })
            );
        })
    );
});

// 2. Ativação (Limpeza)
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Interceptação (Offline Strategy)
self.addEventListener('fetch', event => {
    const url = event.request.url;

    // Ignora APIs (Firebase, Gemini, Imgur, etc) para não cachear dados dinâmicos
    if (url.includes('firestore.googleapis.com') || 
        url.includes('googleapis.com') || 
        url.includes('/api/') ||
        url.includes('imgur.com')) { 
        return; 
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // Retorna cache se tiver, mas busca atualização no fundo (Stale-While-Revalidate)
            const fetchPromise = fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {});

            return cachedResponse || fetchPromise;
        })
    );
});