import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, addDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyA3g9gmFn-Uc_SoLHsVhH7eIwgzMOYmIAQ",
    authDomain: "organizaedu.firebaseapp.com",
    projectId: "organizaedu",
    storageBucket: "organizaedu.firebasestorage.app",
    messagingSenderId: "300213242364",
    appId: "1:300213242364:web:76019e1dc63cb89f034a79",
    measurementId: "G-N1GS8DXP4Q"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;
const appId = "organiza_edu_v1"; 

// Variável global para armazenar dados do perfil em memória
let userProfileData = null;

// IA Provider e Histórico
let currentAIProvider = 'gemini';
let chatHistory = []; // Para manter o contexto da conversa

// Donation
let selectedDonationAmount = 6.00;
let currentPaymentId = null;
let paymentCheckInterval = null;


// --- IMGUR UPLOAD FUNCTION ---
async function uploadToImgur(file) {
    const clientId = "513bb727cecf9ac"; // Client ID fornecido
    const formData = new FormData();
    formData.append("image", file);

    try {
        const response = await fetch("https://api.imgur.com/3/image", {
            method: "POST",
            headers: {
                Authorization: `Client-ID ${clientId}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.data.error || "Falha no upload para o Imgur");
        }

        const data = await response.json();
        return data.data.link;
    } catch (error) {
        console.error("Erro Imgur:", error);
        throw error;
    }
}

// --- AUTH & SETUP FLOW ---
onAuthStateChanged(auth, async (user) => {
    const loadingScreen = document.getElementById('loading-screen');
    const loginScreen = document.getElementById('login-screen');
    const setupScreen = document.getElementById('setup-screen');
    const appContent = document.getElementById('app-content');

    if (user) {
        currentUser = user;
        console.log("Usuário logado:", user.email);
        
        // Verifica se o usuário já tem perfil configurado
        const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'data', 'profile');
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists() && profileSnap.data().username) {
            // PERFIL EXISTE -> VAI PRO APP
            initDataSync();
            loadChatMessages();
            
            // Transição UI
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
                loginScreen.classList.add('hidden');
                setupScreen.classList.add('hidden');
                appContent.classList.remove('hidden');
                setTimeout(() => appContent.style.opacity = '1', 10);
            }, 500);
        } else {
            // PERFIL NÃO EXISTE -> VAI PRA TELA DE SETUP
            document.getElementById('setup-name').value = user.displayName || "";
            if(user.photoURL) document.getElementById('setup-profile-preview').src = user.photoURL;

            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
                loginScreen.classList.add('hidden');
                setupScreen.classList.remove('hidden');
            }, 500);
        }

    } else {
        currentUser = null;
        // Transição para Login
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.classList.add('hidden');
            appContent.classList.add('hidden');
            setupScreen.classList.add('hidden');
            loginScreen.classList.remove('hidden');
        }, 500);
    }
});

// Listener do botão de login
document.addEventListener('DOMContentLoaded', () => {
    const btnLogin = document.getElementById('btn-login-google');
    if(btnLogin) {
        btnLogin.addEventListener('click', () => {
             const provider = new GoogleAuthProvider();
             signInWithPopup(auth, provider).catch((error) => {
                console.error(error);
                alert("Erro ao fazer login: " + error.message);
            });
        });
    }
});

window.logout = function() {
    signOut(auth).then(() => {
        window.location.reload();
    }).catch((error) => console.error(error));
}

// --- SETUP SCREEN LOGIC (IMGUR) ---
window.uploadToImgurSetup = async (input) => {
    const file = input.files[0];
    if (!file) return;

    const status = document.getElementById('setup-upload-status');
    status.innerText = "Enviando imagem...";
    status.className = "text-xs text-indigo-500 mt-1 font-bold animate-pulse";

    try {
        const url = await uploadToImgur(file);
        document.getElementById('setup-profile-preview').src = url;
        status.innerText = "Imagem carregada com sucesso!";
        status.className = "text-xs text-green-500 mt-1 font-bold";
        window.tempSetupAvatarUrl = url;
    } catch (error) {
        console.error(error);
        status.innerText = "Erro no upload. Tente novamente.";
        status.className = "text-xs text-red-500 mt-1 font-bold";
        const localUrl = URL.createObjectURL(file);
        document.getElementById('setup-profile-preview').src = localUrl;
        window.tempSetupAvatarUrl = localUrl;
    }
};

window.finishSetup = async () => {
    const name = document.getElementById('setup-name').value;
    const username = document.getElementById('setup-username').value;
    const course = document.getElementById('setup-course').value;
    const semester = document.getElementById('setup-semester').value;
    
    let avatarUrl = window.tempSetupAvatarUrl || document.getElementById('setup-profile-preview').src;

    if(!name || !username) return alert("Por favor, preencha seu nome e escolha um usuário.");

    if(currentUser) {
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'data', 'profile'), {
            name,
            username,
            course: course || "Curso não informado",
            semester,
            avatarUrl: avatarUrl,
            joinedAt: Date.now()
        }, { merge: true });

        window.location.reload();
    }
};

// SYNC AGORA TUDO DO FIRESTORE
function initDataSync() {
    if (!currentUser) return;
    
    // 1. Perfil
    onSnapshot(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'data', 'profile'), (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            userProfileData = data; // Salva em variável global

            if(data.name) document.getElementById('profile-name').innerText = data.name;
            if(data.username) document.getElementById('profile-username').innerText = '@' + data.username;
            if(data.course && data.semester) document.getElementById('profile-course').innerText = `${data.course} • ${data.semester}`;
            
            let avatarUrl = data.avatarUrl || currentUser.photoURL || `https://ui-avatars.com/api/?name=${data.name || 'User'}&background=6366f1&color=fff&bold=true`;
            
            const profileImg = document.getElementById('profile-img');
            const headerImg = document.getElementById('header-img');
            const editPreview = document.getElementById('edit-profile-preview');
            
            if(profileImg) profileImg.src = avatarUrl;
            if(headerImg) headerImg.src = avatarUrl;
            if(editPreview) editPreview.src = avatarUrl;
        }
    });

    // 2. Settings (Grade, Tasks, Finance, Notes, etc.)
    onSnapshot(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'data', 'settings'), (doc) => {
        if(doc.exists()) {
            const data = doc.data();
            if(data.schedule) scheduleData = data.schedule;
            if(data.tasks) tasksData = data.tasks;
            if(data.finance) financeData = data.finance;
            if(data.widgetStyle) setWidgetStyle(data.widgetStyle, false);
            if(data.grades) gradesData = data.grades; 
            if(data.monthlyBudget) monthlyBudget = data.monthlyBudget;
            if(data.notes) notesData = data.notes; 

            if (window.renderSchedule) window.renderSchedule();
            if (window.updateNextClassWidget) window.updateNextClassWidget();
            if (window.renderTasks) window.renderTasks();
            if (window.renderFinance) window.renderFinance();
            
            if (window.renderNotes && !activeNoteId && document.getElementById('view-notas') && !document.getElementById('view-notas').classList.contains('hidden')) {
                window.renderNotes();
            }
        } 
    });
}

// --- SISTEMA DE NAVEGAÇÃO ---
function switchView(pageId) {
    document.querySelectorAll('.page-view').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('view-' + pageId);
    if (target) {
        target.classList.remove('hidden');
    }
    
    const titles = { 'home': 'Visão Geral', 'aulas': 'Grade', 'ia': 'Organiza IA', 'ferramentas': 'Ferramentas', 'onibus': 'Circular', 'perfil': 'Meu Perfil', 'config': 'Configurações', 'edit-profile': 'Editar Perfil', 'tarefas': 'Tarefas', 'calculadora': 'Calculadora', 'financeiro': 'Financeiro', 'notas': 'Anotações', 'pomo': 'Modo Foco', 'sounds': 'Estúdio de Foco' };
    document.getElementById('header-title').innerText = titles[pageId] || 'OrganizaEdu';
    
    const backBtn = document.getElementById('back-btn');
    if (pageId === 'home') {
        backBtn.classList.add('hidden');
    } else {
        backBtn.classList.remove('hidden');
    }

    const mobileNav = document.querySelector('.glass-nav');
    if (pageId === 'ia') {
        mobileNav.classList.add('hidden-nav');
    } else {
        mobileNav.classList.remove('hidden-nav');
    }

    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        if(!btn.id.includes('ia')) { btn.classList.remove('text-indigo-600', 'dark:text-indigo-400'); btn.classList.add('text-gray-400'); }
    });

    let navId = pageId;
    if(['tarefas','calculadora','financeiro','notas','pomo','sounds'].includes(pageId)) navId = 'ferramentas';
    if(pageId === 'edit-profile' || pageId === 'config') navId = 'home'; 

    const btn = document.getElementById('mob-nav-' + navId);
    if(btn && navId !== 'ia') { btn.classList.remove('text-gray-400'); btn.classList.add('text-indigo-600', 'dark:text-indigo-400'); }
    
    // Se abrir a página de notas, renderiza a lista
    if (pageId === 'notas') {
        activeNoteId = null; // Reseta para a lista ao abrir a aba
        window.renderNotes();
    }
    
    lucide.createIcons();
}

window.navigateTo = (pageId) => {
    history.pushState({ page: pageId }, null, `#${pageId}`);
    switchView(pageId);
};

window.addEventListener('popstate', (event) => {
    const page = event.state ? event.state.page : 'home';
    switchView(page);
});

// --- CHAT SYSTEM (COM INTEGRAÇÃO REAL) ---
window.setAIProvider = function(provider) {
    currentAIProvider = provider;
    const btnGemini = document.getElementById('btn-ai-gemini');
    const btnGroq = document.getElementById('btn-ai-groq');
    
    if(provider === 'gemini') {
        btnGemini.classList.add('bg-indigo-600', 'text-white');
        btnGemini.classList.remove('bg-white', 'dark:bg-slate-700', 'text-indigo-600');
        btnGroq.classList.remove('bg-indigo-600', 'text-white');
        btnGroq.classList.add('text-gray-500', 'dark:text-gray-400');
    } else {
        btnGroq.classList.add('bg-indigo-600', 'text-white');
        btnGroq.classList.remove('text-gray-500', 'dark:text-gray-400');
        btnGemini.classList.remove('bg-indigo-600', 'text-white');
        btnGemini.classList.add('bg-white', 'dark:bg-slate-700', 'text-indigo-600');
    }
}

window.loadChatMessages = function() {
    if(!currentUser) return;
    const q = query(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'messages'), orderBy('timestamp', 'asc'), limit(50));
    onSnapshot(q, (snapshot) => {
        const chatContainer = document.getElementById('chat-messages');
        chatContainer.innerHTML = ''; 
        chatContainer.innerHTML += `
            <div class="flex gap-3 max-w-[90%] animate-message-pop">
                <div class="w-8 h-8 rounded-full glass-inner flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-auto border border-white/20">
                    <i data-lucide="sparkles" class="w-4 h-4"></i>
                </div>
                <div class="chat-bubble-ai p-4 rounded-2xl rounded-bl-sm text-sm leading-relaxed">
                    Olá! Eu sou a <strong>Organiza IA</strong>. 🧠<br><br>
                    Posso te ajudar com dúvidas sobre a UFRB, horários de ônibus, ou organizar sua rotina. Escolha o modelo acima e vamos conversar!
                </div>
           </div>
        `;
        snapshot.forEach((doc) => {
            const msg = doc.data();
            renderMessage(msg, chatContainer);
        });
        lucide.createIcons();
        chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
    });
}

function renderMessage(msg, container) {
    if (msg.role === 'user') {
        let content = msg.text;
        if(msg.type === 'image') content = `<img src="${msg.text}" class="rounded-lg max-h-48 border border-white/20">`;
        container.innerHTML += `
            <div class="flex gap-3 max-w-[85%] ml-auto animate-message-pop justify-end">
                <div class="chat-bubble-user p-3.5 rounded-2xl rounded-br-sm text-sm leading-relaxed shadow-sm break-words">
                    ${content}
                </div>
                <div class="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white shrink-0 mt-auto">
                    <i data-lucide="user" class="w-4 h-4"></i>
                </div>
            </div>
        `;
    } else {
        container.innerHTML += `
            <div class="flex gap-3 max-w-[85%] animate-message-pop">
                <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-auto border border-white/20">
                    <i data-lucide="sparkles" class="w-4 h-4"></i>
                </div>
                <div class="chat-bubble-ai p-3.5 rounded-2xl rounded-bl-sm text-sm leading-relaxed shadow-sm break-words">
                    ${msg.text}
                </div>
            </div>
        `;
    }
}

// --- CÉREBRO DA IA: ENVIO E EXECUÇÃO DE COMANDOS ---
window.sendMessage = async function(textOverride = null, type = 'text') {
    const input = document.getElementById('chat-input');
    const msgText = textOverride || input.value.trim();
    if (!msgText) return;
    if (!textOverride) input.value = '';

    if(currentUser) {
        // 1. Salva mensagem do usuário no Firestore
        await addDoc(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'messages'), {
            text: msgText, role: 'user', type: type, timestamp: Date.now()
        });

        // Adiciona ao histórico local
        chatHistory.push({ role: 'user', text: msgText });
        if (chatHistory.length > 10) chatHistory.shift();

        // 2. Chama API Real na Vercel
        try {
            // Prepara contexto para a IA
            const now = new Date();
            const dataHora = now.toLocaleString('pt-BR');
            const tasksList = tasksData.map(t => `- "${t.text}"`).join('\n') || "Nenhuma tarefa.";
            const notesList = notesData.map(n => `- "${n.title}"`).join('\n') || "Nenhuma nota.";
            
            const systemInstructionText = `
                VOCÊ É A "SALVE-SE IA" (OrganizaEdu). Responda APENAS com JSON.
                Você tem controle sobre a interface.
                Agora: ${dataHora}
                Tarefas: ${tasksList}
                Notas: ${notesList}
                
                --- COMANDOS DISPONÍVEIS ---
                1. TAREFAS: "create_task": { "text": "...", "priority": "normal" }, "delete_task": { "text": "..." }
                2. NOTAS: "create_note": { "title": "...", "content": "..." }
                3. AULAS: "create_class": { "name": "...", "day": "seg", "start": "08:00", "end": "10:00", "room": "..." }
                4. NAVEGAÇÃO: "navigate": { "page": "home/aulas/todo/notas/financeiro" }
                5. TIMER: "timer_set": { "mode": "pomodoro/short" }

                --- RESPOSTA OBRIGATÓRIA (JSON) ---
                {
                  "message": "Texto de resposta para o usuário (use markdown simples, sem JSON).",
                  "commands": [ { "action": "...", "params": { ... } } ]
                }
            `;

            let historyPayload = [{ role: 'system', text: systemInstructionText }];
            chatHistory.forEach(msg => { historyPayload.push({ role: msg.role, text: msg.text }); });

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: currentAIProvider,
                    message: msgText,
                    history: historyPayload
                })
            });

            const data = await response.json();
            
            if (data.text) {
                // Limpa markdown de JSON se houver
                let cleanText = data.text.replace(/```json/g, '').replace(/```/g, '').trim();
                const responseJson = JSON.parse(cleanText);

                // 3. Salva resposta da IA no Firestore
                if (responseJson.message) {
                    await addDoc(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'messages'), {
                        text: responseJson.message, role: 'ai', type: 'text', timestamp: Date.now() + 100
                    });
                    chatHistory.push({ role: 'assistant', text: responseJson.message });
                }

                // 4. Executa comandos
                if (responseJson.commands && Array.isArray(responseJson.commands)) {
                    for (const cmd of responseJson.commands) {
                        executeAICommand(cmd);
                    }
                }
            } else {
                throw new Error("Resposta vazia da IA");
            }

        } catch (error) {
            console.error("Erro IA:", error);
            await addDoc(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'messages'), {
                text: "Desculpe, tive um problema técnico ao conectar com o cérebro da IA. Tente novamente.", role: 'ai', type: 'text', timestamp: Date.now() + 100
            });
        }
    }
}

// Executor de Comandos da IA
function executeAICommand(cmd) {
    console.log("🤖 Comando IA:", cmd.action, cmd.params);
    const p = cmd.params || {};

    switch (cmd.action) {
        case 'create_task':
            tasksData.push({
                id: Date.now().toString(),
                text: p.text,
                done: false,
                priority: p.priority || 'normal',
                category: 'geral',
                createdAt: Date.now()
            });
            saveData();
            if (document.getElementById('view-todo')) window.renderTasks();
            break;

        case 'create_note':
            const nid = Date.now().toString();
            notesData.push({ id: nid, title: p.title || "Nota IA", content: p.content || "", updatedAt: Date.now(), pinned: false });
            saveData();
            navigateTo('notas');
            setTimeout(() => openNote(nid), 500);
            break;

        case 'navigate':
            if (p.page) navigateTo(p.page);
            break;
            
        case 'timer_set':
            if(p.mode) {
                setTimerMode(p.mode);
                navigateTo('pomo');
            }
            break;
            
        case 'create_class':
             scheduleData.push({
                id: Date.now().toString(),
                name: p.name,
                prof: p.prof || 'N/A',
                room: p.room || 'N/A',
                day: p.day || 'seg',
                start: p.start || '08:00',
                end: p.end || '10:00',
                color: 'indigo'
            });
            saveData();
            navigateTo('aulas');
            break;
    }
}

window.uploadChatImage = async (input) => {
    const file = input.files[0];
    if (!file) return;
    const status = document.getElementById('chat-upload-status');
    status.classList.remove('hidden');
    try {
        const url = await uploadToImgur(file);
        await sendMessage(url, 'image'); 
    } catch (error) {
        console.error(error);
        alert('Erro no upload da imagem.');
    } finally {
        status.classList.add('hidden');
        input.value = '';
    }
};

// --- SISTEMA DE DOAÇÃO (ASAAS PIX) ---

window.openDonationModal = function() {
    const modal = document.getElementById('donation-value-modal');
    modal.classList.remove('hidden');
    setTimeout(() => { 
        modal.classList.remove('opacity-0'); 
        modal.firstElementChild.classList.remove('scale-95'); 
        modal.firstElementChild.classList.add('scale-100'); 
    }, 10);
    selectDonationValue(6); // Valor padrão inicial
}

window.closeDonationModal = function() {
    const modal = document.getElementById('donation-value-modal');
    modal.classList.add('opacity-0'); 
    modal.firstElementChild.classList.remove('scale-100'); 
    modal.firstElementChild.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

window.selectDonationValue = function(val) {
    selectedDonationAmount = val;
    document.getElementById('custom-donation-input').value = ''; // Limpa custom
    
    // Visual feedback
    // (Poderia adicionar classes de seleção aqui se necessário)
}

window.checkCustomValue = function() {
    const input = document.getElementById('custom-donation-input');
    const val = parseFloat(input.value);
    if (!isNaN(val) && val > 0) {
        selectedDonationAmount = val;
    }
}

window.proceedToCpf = function() {
    closeDonationModal();
    if (selectedDonationAmount < 1) return alert("Valor mínimo de R$ 1,00.");

    openCustomInputModal(
        "CPF para o PIX",
        "Apenas números (obrigatório pelo Banco Central)",
        "",
        (cpfValue) => {
            const cleanCpf = cpfValue.replace(/\D/g, '');
            if (cleanCpf.length !== 11) {
                return window.showModal("CPF Inválido", "Digite um CPF válido com 11 dígitos.");
            }
            processPaymentWithCpf(cleanCpf);
        }
    );
}

async function processPaymentWithCpf(cpf) {
    const modal = document.getElementById('payment-modal');
    const qrImg = document.getElementById('pix-qr-image');
    const loader = document.getElementById('pix-loading');

    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.firstElementChild.classList.remove('scale-95');
            modal.firstElementChild.classList.add('scale-100');
        }, 10);
    }

    try {
        const response = await fetch('/api/create_pix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: userProfileData?.displayName || "Apoiador OrganizaEdu",
                email: currentUser?.email || "anonimo@organizaedu.com",
                cpf: cpf,
                value: selectedDonationAmount // Passando o valor dinâmico se a API suportar, senão edite a API
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        currentPaymentId = data.id;

        if (qrImg) {
            qrImg.src = `data:image/png;base64,${data.encodedImage}`;
            qrImg.classList.remove('opacity-50');
        }
        if (loader) loader.classList.add('hidden');

        const copyInput = document.getElementById('pix-copy-paste');
        if (copyInput) copyInput.value = data.payload;

        if (paymentCheckInterval) clearInterval(paymentCheckInterval);
        paymentCheckInterval = setInterval(checkPaymentStatus, 3000);

    } catch (error) {
        console.error("Erro Pagamento:", error);
        window.closePaymentModal();
        window.showModal("Erro", error.message);
    }
}

window.closePaymentModal = function() {
    const modal = document.getElementById('payment-modal');
    modal.classList.add('opacity-0'); 
    modal.firstElementChild.classList.remove('scale-100'); 
    modal.firstElementChild.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
    if (paymentCheckInterval) clearInterval(paymentCheckInterval);
}

window.copyPixCode = function() {
    const input = document.getElementById('pix-copy-paste');
    input.select();
    document.execCommand('copy');
    alert("Código PIX copiado!");
}

async function checkPaymentStatus() {
    if (!currentPaymentId) return;

    try {
        const response = await fetch('/api/check_status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currentPaymentId })
        });

        const data = await response.json();

        if (data.paid) {
            clearInterval(paymentCheckInterval);
            window.closePaymentModal();
            window.showModal("Pagamento Recebido! 🎉", "Muito obrigado pelo seu apoio! Você ajuda a manter o OrganizaEdu no ar.");
        }
    } catch (e) {
        console.log("Verificando...", e);
    }
}

// --- EDITAR PERFIL (CORRIGIDO PARA CARREGAR DADOS SALVOS) ---
window.openEditProfileView = () => {
    // Tenta usar os dados globais carregados do Firestore, se não, usa o DOM como fallback
    const data = userProfileData || {};
    
    // Valores padrão ou do DOM se o objeto estiver vazio
    const currentName = data.name || document.getElementById('profile-name').innerText;
    const currentUsername = data.username || document.getElementById('profile-username').innerText.replace('@', '');
    const currentCourse = data.course || "Curso não informado";
    const currentSemester = data.semester || "1º Semestre";
    const currentImg = data.avatarUrl || document.getElementById('profile-img').src;
    
    document.getElementById('edit-name').value = currentName;
    document.getElementById('edit-username').value = currentUsername !== '@estudante' ? currentUsername : '';
    document.getElementById('edit-course').value = currentCourse;
    document.getElementById('edit-semester').value = currentSemester;
    document.getElementById('edit-profile-preview').src = currentImg;

    navigateTo('edit-profile');
}
window.editProfile = window.openEditProfileView;

window.uploadToImgur = async (input) => {
    const file = input.files[0];
    if (!file) return;
    const status = document.getElementById('upload-status');
    status.innerText = "Enviando...";
    status.className = "text-xs text-indigo-500 mt-1 font-bold animate-pulse";
    try {
        const url = await uploadToImgur(file);
        document.getElementById('edit-profile-preview').src = url;
        status.innerText = "Upload concluído!";
        status.className = "text-xs text-green-500 mt-1 font-bold";
        window.tempAvatarUrl = url;
    } catch (error) {
        console.error(error);
        status.innerText = "Erro no upload (Tente novamente).";
        status.className = "text-xs text-red-500 mt-1 font-bold";
        const local = URL.createObjectURL(file);
        document.getElementById('edit-profile-preview').src = local;
        window.tempAvatarUrl = local;
    }
};

window.saveProfileChanges = async () => {
    const name = document.getElementById('edit-name').value;
    const username = document.getElementById('edit-username').value;
    const course = document.getElementById('edit-course').value;
    const semester = document.getElementById('edit-semester').value;

    if(!name || !username) return alert("Nome e Usuário são obrigatórios.");

    let currentSrc = document.getElementById('edit-profile-preview').src;
    let avatarUrl = window.tempAvatarUrl || currentSrc;
    
    // Atualização Otimista
    document.getElementById('profile-name').innerText = name;
    document.getElementById('profile-username').innerText = '@' + username;
    document.getElementById('profile-course').innerText = `${course || "Curso não informado"} • ${semester || "1º Semestre"}`;
    document.getElementById('profile-img').src = avatarUrl;
    document.getElementById('header-img').src = avatarUrl;

    if (currentUser) {
        const newData = { name, username, course, semester, avatarUrl };
        userProfileData = { ...userProfileData, ...newData }; // Atualiza localmente
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'data', 'profile'), newData, { merge: true });
        window.history.back(); 
    }
};

// GLOBALS
let scheduleData = [];
let tasksData = [];
let financeData = [];
let gradesData = []; 
let notesData = []; 
let monthlyBudget = 0;
let widgetStyle = 'modern';
let selectedColor = 'indigo';
let classToDeleteId = null;
let selectedTaskCategory = 'estudo';
let currentTaskTab = 'pending';
let activeNoteId = null;
let noteSaveTimeout = null;

const timeSlots = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30"];

const colorPalettes = {
    indigo: { bg: 'bg-indigo-100/60 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200/50 dark:border-indigo-800' },
    emerald: { bg: 'bg-emerald-100/60 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200/50 dark:border-emerald-800' },
    orange: { bg: 'bg-orange-100/60 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200/50 dark:border-orange-800' },
    rose: { bg: 'bg-rose-100/60 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200/50 dark:border-rose-800' },
    blue: { bg: 'bg-blue-100/60 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200/50 dark:border-blue-800' }
};

// SAVE DATA TO FIRESTORE
async function saveData() {
    if(currentUser) {
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'data', 'settings'), {
            schedule: scheduleData,
            widgetStyle: widgetStyle,
            tasks: tasksData,
            finance: financeData,
            grades: gradesData,
            monthlyBudget: monthlyBudget,
            notes: notesData
        }, { merge: true });
    }
}

window.setWidgetStyle = function(style, save = true) {
    widgetStyle = style;
    if(save) saveData();
    
    document.querySelectorAll('.widget-check').forEach(el => { el.innerHTML = ''; el.classList.remove('bg-indigo-600', 'border-transparent'); });
    const check = document.getElementById('check-' + style);
    if(check) { check.innerHTML = '<i data-lucide="check" class="w-3 h-3 text-white"></i>'; check.classList.add('bg-indigo-600', 'border-transparent'); }
    lucide.createIcons();
    if (window.updateNextClassWidget) window.updateNextClassWidget();
};

// --- SISTEMA DE NOTAS 2.0 ---
const noteColors = {
    yellow: 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-900 dark:text-yellow-100',
    green: 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-900 dark:text-green-100',
    blue: 'bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100',
    purple: 'bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-100',
    pink: 'bg-pink-100 dark:bg-pink-900/30 border-pink-200 dark:border-pink-800 text-pink-900 dark:text-pink-100',
    gray: 'bg-white/40 dark:bg-white/10 border-white/20 dark:border-white/10 text-gray-800 dark:text-white'
};

window.renderNotes = function() {
    const container = document.getElementById('view-notas');
    if(!container) return;
    
    if(activeNoteId) {
        const note = notesData.find(n => n.id === activeNoteId);
        if(note) {
            const currentColor = note.color || 'gray';
            
            container.innerHTML = `
                <div class="flex flex-col h-[calc(100vh-6rem)] animate-fade-in">
                    <div class="glass-panel p-4 rounded-[1.5rem] flex-1 flex flex-col relative shadow-xl overflow-hidden transition-colors duration-500">
                        <div class="flex items-center justify-between mb-4 pb-2 border-b border-gray-200/30 dark:border-white/10">
                            <button onclick="closeNote()" class="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>
                            
                            <div class="flex gap-2">
                                <button onclick="togglePinNote('${note.id}')" class="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition ${note.pinned ? 'text-amber-500' : 'text-gray-400'}">
                                    <i data-lucide="pin" class="w-5 h-5 ${note.pinned ? 'fill-current' : ''}"></i>
                                </button>
                                <div class="relative group">
                                    <button class="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition"><i data-lucide="palette" class="w-5 h-5"></i></button>
                                    <div class="absolute right-0 top-10 bg-white dark:bg-slate-800 p-2 rounded-xl shadow-xl flex gap-1 hidden group-hover:flex z-50 border border-gray-200 dark:border-gray-700">
                                        <div onclick="setNoteColor('${note.id}', 'yellow')" class="w-6 h-6 rounded-full bg-yellow-200 cursor-pointer border border-gray-300"></div>
                                        <div onclick="setNoteColor('${note.id}', 'green')" class="w-6 h-6 rounded-full bg-green-200 cursor-pointer border border-gray-300"></div>
                                        <div onclick="setNoteColor('${note.id}', 'blue')" class="w-6 h-6 rounded-full bg-blue-200 cursor-pointer border border-gray-300"></div>
                                        <div onclick="setNoteColor('${note.id}', 'purple')" class="w-6 h-6 rounded-full bg-purple-200 cursor-pointer border border-gray-300"></div>
                                        <div onclick="setNoteColor('${note.id}', 'pink')" class="w-6 h-6 rounded-full bg-pink-200 cursor-pointer border border-gray-300"></div>
                                        <div onclick="setNoteColor('${note.id}', 'gray')" class="w-6 h-6 rounded-full bg-gray-200 cursor-pointer border border-gray-300"></div>
                                    </div>
                                </div>
                                <button onclick="deleteNote('${note.id}')" class="p-2 rounded-full hover:bg-red-500/10 text-red-500 transition"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                            </div>
                        </div>

                        <input type="text" id="note-title-input" value="${note.title}" placeholder="Título da Nota" class="w-full bg-transparent text-2xl font-black outline-none placeholder-gray-400 dark:text-white mb-2" oninput="updateNoteTitle('${note.id}', this.value)">
                        <span class="text-[10px] text-gray-400 font-medium mb-4 flex items-center gap-1">
                            ${new Date(note.updatedAt).toLocaleString('pt-BR')} 
                            <span id="save-status" class="opacity-0 transition-opacity text-green-500">• Salvo</span>
                        </span>
                        <textarea id="note-content-input" class="flex-1 w-full bg-transparent resize-none outline-none text-base text-gray-700 dark:text-gray-300 leading-relaxed custom-scrollbar" placeholder="Comece a digitar..." oninput="updateNoteContent('${note.id}', this.value)">${note.content}</textarea>
                    </div>
                </div>
            `;
            lucide.createIcons();
            return;
        }
    }

    let html = `
        <div class="max-w-5xl mx-auto">
            <div class="glass-panel p-6 rounded-[2rem] mb-6 flex justify-between items-center shadow-lg">
                <div>
                    <h2 class="text-xl font-black text-indigo-900 dark:text-white">Minhas Notas</h2>
                    <p class="text-xs text-gray-500">${notesData.length} notas criadas</p>
                </div>
                <button onclick="createNote()" class="w-12 h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-lg flex items-center justify-center transition active:scale-95 group">
                    <i data-lucide="plus" class="w-6 h-6 group-hover:rotate-90 transition"></i>
                </button>
            </div>
            <div class="columns-2 md:columns-3 gap-4 pb-20 space-y-4">
    `;
    
    if(notesData.length === 0) {
        html += `<div class="col-span-full text-center py-10 text-gray-400 break-inside-avoid-column"><p>Nenhuma nota criada.</p></div>`;
    } else {
        const sortedNotes = [...notesData].sort((a,b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return b.updatedAt - a.updatedAt;
        });

        sortedNotes.forEach(note => {
            const date = new Date(note.updatedAt).toLocaleDateString('pt-BR');
            const colorStyle = noteColors[note.color || 'gray'];
            
            html += `
                <div onclick="openNote('${note.id}')" class="break-inside-avoid-column mb-4 rounded-2xl p-5 cursor-pointer hover:scale-[1.02] transition shadow-sm border ${colorStyle} relative group">
                    ${note.pinned ? '<div class="absolute top-3 right-3 text-amber-500"><i data-lucide="pin" class="w-3 h-3 fill-current"></i></div>' : ''}
                    <h3 class="font-bold text-lg mb-2 truncate pr-4 leading-tight">${note.title || 'Sem Título'}</h3>
                    <p class="text-xs opacity-80 line-clamp-4 leading-relaxed mb-3 font-medium">${note.content || 'Nova nota...'}</p>
                    <span class="text-[10px] opacity-60 font-bold uppercase tracking-wider">${date}</span>
                </div>
            `;
        });
    }
    html += `</div></div>`;
    container.innerHTML = html;
    lucide.createIcons();
}

window.createNote = function() {
    const id = Date.now().toString();
    notesData.unshift({ id, title: '', content: '', updatedAt: Date.now(), color: 'gray', pinned: false });
    activeNoteId = id;
    saveData();
    window.renderNotes();
}

window.openNote = function(id) {
    activeNoteId = id;
    window.renderNotes();
}

window.closeNote = function() {
    activeNoteId = null;
    saveData();
    window.renderNotes();
}

window.setNoteColor = function(id, color) {
    const note = notesData.find(n => n.id === id);
    if(note) {
        note.color = color;
        saveData();
        window.renderNotes(); 
    }
}

window.togglePinNote = function(id) {
    const note = notesData.find(n => n.id === id);
    if(note) {
        note.pinned = !note.pinned;
        saveData();
        window.renderNotes();
    }
}

window.updateNoteTitle = function(id, val) {
    const note = notesData.find(n => n.id === id);
    if(note) {
        note.title = val;
        note.updatedAt = Date.now();
        debouncedSave();
    }
}

window.updateNoteContent = function(id, val) {
    const note = notesData.find(n => n.id === id);
    if(note) {
        note.content = val;
        note.updatedAt = Date.now();
        debouncedSave();
    }
}

window.deleteNote = function(id) {
    if(confirm('Excluir esta nota permanentemente?')) {
        notesData = notesData.filter(n => n.id !== id);
        if(activeNoteId === id) activeNoteId = null;
        saveData();
        window.renderNotes();
    }
}

function debouncedSave() {
    const status = document.getElementById('save-status');
    if(status) status.classList.remove('opacity-0');
    
    clearTimeout(noteSaveTimeout);
    noteSaveTimeout = setTimeout(() => {
        saveData();
        if(status) {
            status.innerText = "• Salvo";
            setTimeout(() => status.classList.add('opacity-0'), 2000);
        }
    }, 1000);
}

// --- POMODORO ---
let timerInterval, timeLeft = 1500, isRunning = false, timerMode = 'pomodoro';
const modes = { pomodoro: 1500, short: 300, long: 900 };

window.toggleTimer = function() {
    const btn = document.getElementById('btn-timer-start');
    
    if(isRunning) {
        clearInterval(timerInterval);
        isRunning = false;
        btn.classList.remove('bg-red-500', 'hover:bg-red-600');
        btn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
        btn.innerHTML = `<i data-lucide="play" class="w-8 h-8 fill-current"></i>`;
    } else {
        isRunning = true;
        btn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
        btn.classList.add('bg-red-500', 'hover:bg-red-600');
        btn.innerHTML = `<i data-lucide="pause" class="w-8 h-8 fill-current"></i>`;
        
        timerInterval = setInterval(() => {
            if(timeLeft > 0) {
                timeLeft--;
                updateTimerDisplay();
            } else {
                clearInterval(timerInterval);
                isRunning = false;
                alert('Tempo Esgotado!');
                resetTimerUI();
            }
        }, 1000);
    }
    lucide.createIcons();
}

window.resetTimer = function() {
    clearInterval(timerInterval);
    isRunning = false;
    timeLeft = modes[timerMode];
    updateTimerDisplay();
    resetTimerUI();
}

function resetTimerUI() {
    const btn = document.getElementById('btn-timer-start');
    if(btn) {
        btn.classList.remove('bg-red-500', 'hover:bg-red-600');
        btn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
        btn.innerHTML = `<i data-lucide="play" class="w-8 h-8 fill-current"></i>`;
        lucide.createIcons();
    }
}

window.setTimerMode = function(mode) {
    timerMode = mode;
    resetTimer();
    const label = document.getElementById('timer-label');
    if(label) label.innerText = mode === 'pomodoro' ? 'Foco' : (mode === 'short' ? 'Curta' : 'Longa');
}

function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    const display = document.getElementById('timer-display');
    const circle = document.getElementById('timer-circle');
    if(display) display.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    
    if(circle) {
        const total = modes[timerMode];
        const offset = 816 - (timeLeft / total) * 816;
        circle.style.strokeDashoffset = offset;
    }
}

// --- SONS ---
let currentSound = null;
window.toggleSound = function(type) {
    const audio = document.getElementById(`audio-${type}`);
    const card = document.getElementById(`card-${type}`);
    if(!audio) return;

    if(currentSound === type) {
        audio.pause();
        card.classList.remove('playing');
        currentSound = null;
    } else {
        document.querySelectorAll('audio').forEach(a => { a.pause(); a.currentTime = 0; });
        document.querySelectorAll('[id^="card-"]').forEach(c => c.classList.remove('playing'));
        
        audio.play();
        card.classList.add('playing');
        currentSound = type;
    }
}

// --- GRADE DE AULAS ---
window.renderSchedule = function() {
    const container = document.getElementById('schedule-container');
    if(!container) return;
    container.innerHTML = '';

    const dayMap = {
        'seg': 'Segunda-feira',
        'ter': 'Terça-feira',
        'qua': 'Quarta-feira',
        'qui': 'Quinta-feira',
        'sex': 'Sexta-feira',
        'sab': 'Sábado'
    };
    const daysOrder = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

    if (scheduleData.length === 0) {
        container.innerHTML = `
            <div class="glass-inner rounded-[2rem] p-8 text-center flex flex-col items-center justify-center border-dashed border-2 border-indigo-200 dark:border-indigo-900/50 bg-white/10 dark:bg-black/10">
                <div class="w-16 h-16 bg-indigo-100/50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-4 text-indigo-500">
                    <i data-lucide="calendar-plus" class="w-8 h-8"></i>
                </div>
                <h3 class="text-lg font-bold text-gray-700 dark:text-gray-200">Grade Vazia</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-xs">Adicione suas matérias para organizar sua semana e receber notificações.</p>
                <button onclick="openAddClassModal()" class="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-indigo-700 transition">Adicionar Aula</button>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    daysOrder.forEach(dayKey => {
        const dayClasses = scheduleData.filter(c => c.day === dayKey).sort((a, b) => {
            return parseInt(a.start.replace(':', '')) - parseInt(b.start.replace(':', ''));
        });

        if (dayClasses.length > 0) {
            const daySection = document.createElement('div');
            daySection.className = "mb-2 animate-fade-in";
            
            const header = document.createElement('h3');
            header.className = "text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 ml-2 mt-4";
            header.innerText = dayMap[dayKey];
            daySection.appendChild(header);

            const grid = document.createElement('div');
            grid.className = "space-y-3";

            dayClasses.forEach(c => {
                const style = colorPalettes[c.color] || colorPalettes.indigo;
                const card = document.createElement('div');
                card.className = `glass-inner rounded-2xl p-4 border-l-4 ${style.border.replace('border', 'border-l-indigo-500')} hover:scale-[1.02] cursor-pointer relative overflow-hidden group`;
                card.onclick = () => window.openEditClassModal(c.id);
                
                card.innerHTML = `
                      <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-slate-800 dark:text-white text-base">${c.name}</h4>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="text-xs font-semibold px-2 py-0.5 rounded-md ${style.bg} ${style.text}">${c.start} - ${c.end}</span>
                            </div>
                        </div>
                        <div class="text-right">
                             <p class="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-end gap-1">
                                <i data-lucide="map-pin" class="w-3 h-3"></i> ${c.room}
                             </p>
                             <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${c.prof}</p>
                        </div>
                      </div>
                      <div class="absolute inset-0 bg-white/20 dark:bg-white/5 opacity-0 group-hover:opacity-100 transition duration-300 pointer-events-none"></div>
                `;
                grid.appendChild(card);
            });

            daySection.appendChild(grid);
            container.appendChild(daySection);
        }
    });
    lucide.createIcons();
};

window.toggleModal = function(show) { const modal = document.getElementById('class-modal'); const content = modal.querySelector('.modal-glass'); if(show) { modal.classList.remove('hidden'); setTimeout(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); content.classList.add('scale-100'); }, 10); } else { modal.classList.add('opacity-0'); content.classList.remove('scale-100'); content.classList.add('scale-95'); setTimeout(() => modal.classList.add('hidden'), 300); } }
window.autoSetEndTime = function() { const start = document.getElementById('class-start').value; const endSel = document.getElementById('class-end'); const idx = timeSlots.indexOf(start); if(idx !== -1 && idx + 2 < timeSlots.length) endSel.value = timeSlots[idx + 2]; }
window.openAddClassModal = function() { document.getElementById('modal-title').innerText = "Adicionar Aula"; document.getElementById('class-id').value = ""; document.getElementById('class-name').value = ""; document.getElementById('class-prof').value = ""; document.getElementById('class-room').value = ""; document.getElementById('btn-delete-class').classList.add('hidden'); const startSel = document.getElementById('class-start'); const endSel = document.getElementById('class-end'); startSel.innerHTML = timeSlots.map(t => `<option value="${t}">${t}</option>`).join(''); endSel.innerHTML = timeSlots.map(t => `<option value="${t}">${t}</option>`).join(''); startSel.value = "07:00"; autoSetEndTime(); renderColorPicker(); toggleModal(true); }
window.openEditClassModal = function(id) { const c = scheduleData.find(x => x.id === id); if(!c) return; document.getElementById('modal-title').innerText = "Editar Aula"; document.getElementById('class-id').value = c.id; document.getElementById('class-name').value = c.name; document.getElementById('class-prof').value = c.prof || ""; document.getElementById('class-room').value = c.room; document.getElementById('class-day').value = c.day; const startSel = document.getElementById('class-start'); const endSel = document.getElementById('class-end'); startSel.innerHTML = timeSlots.map(t => `<option value="${t}" ${t === c.start ? 'selected' : ''}>${t}</option>`).join(''); endSel.innerHTML = timeSlots.map(t => `<option value="${t}" ${t === c.end ? 'selected' : ''}>${t}</option>`).join(''); selectedColor = c.color; renderColorPicker(); document.getElementById('btn-delete-class').classList.remove('hidden'); toggleModal(true); }
function renderColorPicker() { const container = document.getElementById('color-picker-container'); container.innerHTML = Object.keys(colorPalettes).map(color => { const style = colorPalettes[color]; const active = selectedColor === color ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-slate-900 scale-110' : ''; return `<button onclick="window.setColor('${color}')" class="w-8 h-8 rounded-full ${style.bg} border ${style.border} ${active} transition hover:scale-105"></button>`; }).join(''); }
window.setColor = (c) => { selectedColor = c; renderColorPicker(); }
window.saveClass = function() { const id = document.getElementById('class-id').value; const name = document.getElementById('class-name').value; const prof = document.getElementById('class-prof').value; const room = document.getElementById('class-room').value; const day = document.getElementById('class-day').value; const start = document.getElementById('class-start').value; const end = document.getElementById('class-end').value; if(!name) return alert("Digite o nome da matéria"); const newClass = { id: id || Date.now().toString(), name, prof, room, day, start, end, color: selectedColor }; if(id) { const idx = scheduleData.findIndex(x => x.id === id); if(idx !== -1) scheduleData[idx] = newClass; } else { scheduleData.push(newClass); } saveData(); toggleModal(false); }
window.requestDeleteClass = () => { classToDeleteId = document.getElementById('class-id').value; toggleModal(false); const modal = document.getElementById('delete-confirm-modal'); modal.classList.remove('hidden'); setTimeout(() => { modal.classList.remove('opacity-0'); modal.firstElementChild.classList.remove('scale-95'); modal.firstElementChild.classList.add('scale-100'); }, 10); }
window.confirmDeleteClass = function() { if(!classToDeleteId) return; scheduleData = scheduleData.filter(x => x.id !== classToDeleteId); saveData(); closeDeleteModal(); }
window.closeDeleteModal = () => { const modal = document.getElementById('delete-confirm-modal'); modal.classList.add('opacity-0'); modal.firstElementChild.classList.remove('scale-100'); modal.firstElementChild.classList.add('scale-95'); setTimeout(() => modal.classList.add('hidden'), 300); classToDeleteId = null; }
window.deleteClass = window.requestDeleteClass;
function addTime(baseTime, minutesToAdd) { const [h, m] = baseTime.split(':').map(Number); const date = new Date(); date.setHours(h); date.setMinutes(m + minutesToAdd); return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
function createTrip(startTime, endTime, routeType, speed = 'normal') { let stops = []; const factor = speed === 'fast' ? 0.7 : 1.0; if (routeType === 'saida-garagem') stops = [{ loc: 'Garagem', t: 0 }, { loc: 'RU', t: 2 }, { loc: 'Fitotecnia', t: 4 }, { loc: 'Solos', t: 6 }, { loc: 'Pav I', t: 8 }, { loc: 'Biblioteca', t: 10 }, { loc: 'Pav II', t: 12 }, { loc: 'Engenharia', t: 13 }, { loc: 'Portão II', t: 15 }, { loc: 'RU', t: 24 }]; else if (routeType === 'volta-campus') stops = [{ loc: 'RU', t: 0 }, { loc: 'Fitotecnia', t: 2 }, { loc: 'Solos', t: 4 }, { loc: 'Pav I', t: 6 }, { loc: 'Biblioteca', t: 8 }, { loc: 'Pav II', t: 10 }, { loc: 'Engenharia', t: 11 }, { loc: 'Portão II', t: 13 }, { loc: 'RU', t: 22 }]; else if (routeType === 'recolhe') stops = [{ loc: 'RU', t: 0 }, { loc: 'Fitotecnia', t: 2 }, { loc: 'Solos', t: 4 }, { loc: 'Garagem', t: 15 }]; else if (routeType === 'volta-e-recolhe') stops = [{ loc: 'RU', t: 0 }, { loc: 'Pav I', t: 5 }, { loc: 'Biblioteca', t: 6 }, { loc: 'Pav II', t: 8 }, { loc: 'Garagem', t: 25 }]; return { start: startTime, end: endTime, origin: routeType.includes('garagem') ? 'Garagem' : 'Campus', dest: routeType.includes('recolhe') ? 'Garagem' : 'Campus', route: routeType, stops: stops.map(s => ({ loc: s.loc, time: addTime(startTime, Math.round(s.t * factor)) })) }; }
const busSchedule = [createTrip('06:25', '06:50', 'saida-garagem'), createTrip('06:50', '07:10', 'volta-campus', 'fast'), createTrip('07:10', '07:25', 'volta-campus', 'fast'), createTrip('07:25', '07:40', 'volta-campus', 'fast'), createTrip('07:40', '07:55', 'volta-campus', 'fast'), createTrip('07:55', '08:20', 'volta-e-recolhe'), createTrip('09:35', '10:00', 'saida-garagem'), createTrip('10:00', '10:25', 'volta-e-recolhe'), createTrip('11:30', '11:55', 'saida-garagem'), createTrip('11:55', '12:20', 'volta-campus'), createTrip('12:20', '12:45', 'volta-e-recolhe'), createTrip('13:00', '13:25', 'saida-garagem'), createTrip('13:25', '13:45', 'volta-campus'), createTrip('13:45', '14:00', 'volta-campus'), createTrip('14:00', '14:25', 'volta-e-recolhe'), createTrip('15:35', '16:00', 'saida-garagem'), createTrip('16:00', '16:25', 'volta-e-recolhe'), createTrip('17:30', '17:55', 'saida-garagem'), createTrip('17:55', '18:15', 'volta-campus'), createTrip('18:15', '18:40', 'volta-e-recolhe'), createTrip('20:00', '20:20', 'volta-e-recolhe', 'fast'), createTrip('20:40', '21:00', 'volta-e-recolhe', 'fast'), createTrip('21:40', '22:00', 'volta-e-recolhe', 'fast'), createTrip('22:30', '22:50', 'volta-e-recolhe', 'fast')];
function updateBusWidget() { 
    const now = new Date(); 
    const day = now.getDay(); 
    const timelineContainer = document.getElementById('bus-timeline');
    
    if (day === 0 || day === 6) { 
        document.getElementById('bus-next-time').innerText = "OFF"; 
        document.getElementById('bus-status-text').innerText = "FIM DE SEMANA"; 
        document.getElementById('bus-status-dot').className = "w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm"; 
        document.getElementById('bus-route-desc').innerHTML = '<i data-lucide="moon" class="w-3 h-3"></i> Bom descanso!'; 
        document.getElementById('bus-progress-bar').style.width = "0%"; 
        document.getElementById('bus-eta').innerText = "Retorna segunda-feira"; 
        if(timelineContainer) timelineContainer.innerHTML = ''; 
        lucide.createIcons(); 
        return; 
    } 
    const currentTotalSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds(); 
    let activeBus = null, nextBus = null, timeDiff = Infinity; 
    for (let bus of busSchedule) { 
        const [h1, m1] = bus.start.split(':').map(Number); 
        const [h2, m2] = bus.end.split(':').map(Number); 
        const startSeconds = h1 * 3600 + m1 * 60; 
        const endSeconds = h2 * 3600 + m2 * 60; 
        if (currentTotalSeconds >= startSeconds && currentTotalSeconds < endSeconds) { 
            activeBus = bus; activeBus.startSeconds = startSeconds; activeBus.endSeconds = endSeconds; break; 
        } 
        if (startSeconds > currentTotalSeconds) { 
            const diff = startSeconds - currentTotalSeconds; 
            if (diff < timeDiff) { timeDiff = diff; nextBus = bus; } 
        } 
    } 
    const statusText = document.getElementById('bus-status-text'), timeDisplay = document.getElementById('bus-next-time'), descDisplay = document.getElementById('bus-route-desc'), progressBar = document.getElementById('bus-progress-bar'), etaDisplay = document.getElementById('bus-eta'); 
    
    if (activeBus) { 
        statusText.innerText = "EM TRÂNSITO"; 
        timeDisplay.innerText = activeBus.end; 
        descDisplay.innerHTML = `<i data-lucide="map-pin" class="w-3 h-3 text-indigo-500"></i> Destino: ${activeBus.dest}`; 
        const totalDuration = activeBus.endSeconds - activeBus.startSeconds; 
        const elapsed = currentTotalSeconds - activeBus.startSeconds; 
        const percent = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100)); 
        progressBar.style.width = `${percent}%`; 
        etaDisplay.innerText = `Chega em aprox. ${Math.ceil((activeBus.endSeconds - currentTotalSeconds) / 60)} min`; 
        
        if(timelineContainer) { 
            let html = '<div class="absolute left-[19px] top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-700 z-0"></div>'; 
            // Safety check if stops exists
            if (activeBus.stops) {
                const upcomingStops = activeBus.stops.filter(s => { 
                    const [sh, sm] = s.time.split(':').map(Number); 
                    return (sh * 3600 + sm * 60) >= (currentTotalSeconds - 60); 
                }).slice(0, 3); 
                
                if (upcomingStops.length === 0) html += '<p class="text-xs text-gray-400 pl-8 py-2">Chegando...</p>'; 
                else upcomingStops.forEach((stop, idx) => { 
                    const isNext = idx === 0; 
                    html += `<div class="relative z-10 flex items-center gap-4 mb-3 last:mb-0"><div class="w-2.5 h-2.5 rounded-full ${isNext ? "bg-indigo-600 border-white dark:border-slate-800 scale-125" : "bg-gray-300 dark:bg-gray-600 border-white dark:border-slate-800"} border-2 ml-4 flex-shrink-0 transition-all duration-500 shadow-sm"></div><div class="flex justify-between w-full pr-2"><span class="text-xs ${isNext ? "text-indigo-700 dark:text-indigo-300 font-bold" : "text-gray-500 dark:text-gray-400"}">${stop.loc}</span><span class="text-xs font-mono font-bold text-gray-700 dark:text-gray-300">${stop.time}</span></div></div>`; 
                }); 
                timelineContainer.innerHTML = html; 
            } else {
                timelineContainer.innerHTML = '';
            }
        } 
    } else if (nextBus) { 
        statusText.innerText = "PRÓXIMA SAÍDA"; 
        timeDisplay.innerText = nextBus.start; 
        descDisplay.innerHTML = `<i data-lucide="clock" class="w-3 h-3"></i> Saída da ${nextBus.origin}`; 
        progressBar.style.width = "0%"; 
        const hours = Math.floor(timeDiff / 3600); 
        const minutes = Math.floor((timeDiff % 3600) / 60); 
        etaDisplay.innerText = `Faltam ${hours > 0 ? hours+'h ' : ''}${minutes}m para sair`; 
        if(timelineContainer) timelineContainer.innerHTML = `<div class="text-center text-xs text-gray-400 py-2">Itinerário: ${nextBus.route}</div>`; 
    } else { 
        statusText.innerText = "ENCERRADO"; 
        timeDisplay.innerText = "--:--"; 
        descDisplay.innerText = "Sem mais viagens hoje"; 
        progressBar.style.width = "0%"; 
        etaDisplay.innerText = "Volta amanhã às 06:25"; 
        if(timelineContainer) timelineContainer.innerHTML = ''; 
    } 
    lucide.createIcons(); 
}
function renderBusTable() { 
    const tbody = document.getElementById('bus-table-body'); 
    if(!tbody) return; 
    tbody.innerHTML = ''; 
    busSchedule.forEach(bus => { 
        const tr = document.createElement('tr'); 
        tr.className = "border-b border-white/20 dark:border-white/10 hover:bg-white/10 transition"; 
        tr.innerHTML = `<td class="px-4 py-3 font-bold text-slate-800 dark:text-white whitespace-nowrap">${bus.start}</td><td class="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">${bus.end}</td><td class="px-4 py-3 text-xs text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wide whitespace-nowrap">${bus.route}</td>`; 
        tbody.appendChild(tr); 
    }); 
}

window.addEventListener('DOMContentLoaded', () => {
    if (window.renderSchedule) window.renderSchedule();
    if (window.updateNextClassWidget) window.updateNextClassWidget();
    
    setInterval(updateBusWidget, 1000);
    
    setInterval(() => {
        if (window.updateNextClassWidget) window.updateNextClassWidget();
    }, 60000);
    
    updateBusWidget();
    renderBusTable();
    
    setTimeout(() => {
        if (window.setWidgetStyle) window.setWidgetStyle(widgetStyle, false);
    }, 200);
    
    lucide.createIcons();
    
    const hash = window.location.hash.replace('#', '') || 'home';
    if (window.navigateTo) window.navigateTo(hash);
});