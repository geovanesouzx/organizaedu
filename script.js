import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// FIREBASE CONFIG (Usando as chaves fornecidas)
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

// --- AUTH & LOADING STATE ---
onAuthStateChanged(auth, (user) => {
    const loadingScreen = document.getElementById('loading-screen');
    const loginScreen = document.getElementById('login-screen');
    const appContent = document.getElementById('app-content');

    if (user) {
        currentUser = user;
        console.log("Usuário logado:", user.email);
        
        // Inicializa dados
        initDataSync();
        loadChatMessages();

        // UI Transition
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
                loginScreen.classList.add('hidden');
                appContent.classList.remove('hidden');
                setTimeout(() => appContent.style.opacity = '1', 10);
            }, 500);
        }, 1500); // Fake loading delay for beauty

    } else {
        currentUser = null;
        console.log("Nenhum usuário logado.");
        
        // UI Transition
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
                appContent.classList.add('hidden');
                loginScreen.classList.remove('hidden');
            }, 500);
        }, 1000);
    }
});

// Listener do botão de login (precisa ser adicionado após o DOM estar pronto)
document.addEventListener('DOMContentLoaded', () => {
    const btnLogin = document.getElementById('btn-login-google');
    if(btnLogin) {
        btnLogin.addEventListener('click', () => {
             const provider = new GoogleAuthProvider();
             signInWithPopup(auth, provider)
                .then((result) => {
                    // Login bem sucedido
                }).catch((error) => {
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

// SYNC AGORA TUDO DO FIRESTORE
function initDataSync() {
    if (!currentUser) return;
    
    // 1. Perfil
    onSnapshot(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'data', 'profile'), (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            if(data.name) document.getElementById('profile-name').innerText = data.name;
            if(data.username) document.getElementById('profile-username').innerText = '@' + data.username;
            if(data.course && data.semester) document.getElementById('profile-course').innerText = `${data.course} • ${data.semester}`;
            
            // Prioridade: Salvo > Google Photo > UI Avatar
            let avatarUrl = data.avatarUrl || currentUser.photoURL || `https://ui-avatars.com/api/?name=${data.name || 'User'}&background=6366f1&color=fff&bold=true`;
            
            document.getElementById('profile-img').src = avatarUrl;
            document.getElementById('header-img').src = avatarUrl;
            document.getElementById('edit-profile-preview').src = avatarUrl;
        } else {
            // Se não tiver perfil, usa dados do Google
            const googlePhoto = currentUser.photoURL;
            if(googlePhoto) {
                 document.getElementById('profile-img').src = googlePhoto;
                 document.getElementById('header-img').src = googlePhoto;
            }
            document.getElementById('profile-name').innerText = currentUser.displayName || "Estudante";
        }
    });

    // 2. Settings (Grade, Tasks, Finance, Widget Style, GradesData, Budget, Notes)
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
            if (window.renderNotes && document.getElementById('view-notas') && !document.getElementById('view-notas').classList.contains('hidden')) window.renderNotes();
        } 
    });
}

// --- SISTEMA DE NAVEGAÇÃO NATIVO (HISTORY API) ---
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

    // Lógica para esconder a barra de navegação no Chat IA
    const mobileNav = document.querySelector('.glass-nav');
    if (pageId === 'ia') {
        mobileNav.classList.add('hidden-nav'); // Esconde a barra
    } else {
        mobileNav.classList.remove('hidden-nav'); // Mostra a barra
    }

    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        if(!btn.id.includes('ia')) { btn.classList.remove('text-indigo-600', 'dark:text-indigo-400'); btn.classList.add('text-gray-400'); }
    });

    let navId = pageId;
    if(['tarefas','calculadora','financeiro','notas','pomo','sounds'].includes(pageId)) navId = 'ferramentas';
    if(pageId === 'edit-profile' || pageId === 'config') navId = 'home'; 

    const btn = document.getElementById('mob-nav-' + navId);
    if(btn && navId !== 'ia') { btn.classList.remove('text-gray-400'); btn.classList.add('text-indigo-600', 'dark:text-indigo-400'); }
    
    if (pageId === 'notas' && window.renderNotes) window.renderNotes();
    
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

// --- CHAT SYSTEM (COM CATBOX & FIRESTORE) ---
window.loadChatMessages = function() {
    if(!currentUser) return;
    
    // Escuta mensagens em tempo real
    const q = query(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'messages'), orderBy('timestamp', 'asc'), limit(50));
    
    onSnapshot(q, (snapshot) => {
        const chatContainer = document.getElementById('chat-messages');
        chatContainer.innerHTML = ''; // Limpa e redesenha (poderia ser otimizado, mas ok para MVP)
        
        // Mensagem de boas vindas padrão
        chatContainer.innerHTML += `
            <div class="flex gap-3 max-w-[90%] animate-message-pop">
                <div class="w-8 h-8 rounded-full glass-inner flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-auto border border-white/20">
                    <i data-lucide="sparkles" class="w-4 h-4"></i>
                </div>
                <div class="chat-bubble-ai p-4 rounded-2xl rounded-bl-sm text-sm leading-relaxed">
                    Olá! Eu sou a <strong>Organiza IA</strong>. 🧠<br><br>
                    Posso te ajudar com dúvidas sobre a UFRB, horários de ônibus, ou organizar sua rotina. O que você precisa?
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
        if(msg.type === 'image') {
            content = `<img src="${msg.text}" class="rounded-lg max-h-48 border border-white/20">`;
        }
        
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

window.sendMessage = async function(textOverride = null, type = 'text') {
    const input = document.getElementById('chat-input');
    const msgText = textOverride || input.value.trim();
    if (!msgText) return;

    if (!textOverride) input.value = '';

    if(currentUser) {
        // Salva no Firestore (o onSnapshot vai desenhar na tela)
        await addDoc(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'messages'), {
            text: msgText,
            role: 'user',
            type: type,
            timestamp: Date.now()
        });

        // Simula resposta da IA (Mock)
        setTimeout(async () => {
             let response = "Desculpe, ainda estou aprendendo.";
             const lowerMsg = msgText.toLowerCase();
             
             if (type === 'image') response = "Recebi sua imagem! Ainda não consigo enxergar, mas guardei aqui.";
             else if (lowerMsg.includes('olá') || lowerMsg.includes('oi')) response = `Olá! Como posso ajudar você hoje?`;
             else if (lowerMsg.includes('ônibus') || lowerMsg.includes('circular')) response = `O próximo circular deve sair em breve. Verifique a aba **Circular** para horários exatos!`;
             else if (lowerMsg.includes('horas') || lowerMsg.includes('que horas')) response = `Agora são **${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}**.`;
             else if (lowerMsg.includes('ajuda')) response = "Posso te ajudar com horários, anotações ou apenas conversar!";
             else response = "Entendi. Vou anotar isso para você.";

             await addDoc(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'messages'), {
                text: response,
                role: 'ai',
                type: 'text',
                timestamp: Date.now() + 100 // Garante que vem depois
            });
        }, 1000);
    }
}

// UPLOAD PARA O CHAT COM PROXY
window.uploadChatImage = async (input) => {
    const file = input.files[0];
    if (!file) return;

    const status = document.getElementById('chat-upload-status');
    status.classList.remove('hidden');

    // Usando corsproxy.io para evitar erro de CORS
    const corsProxy = 'https://corsproxy.io/?';
    const catboxUrl = 'https://catbox.moe/user/api.php';
    
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('userhash', '307daba6918600198381c9952'); 
    formData.append('fileToUpload', file);

    try {
        const response = await fetch(corsProxy + encodeURIComponent(catboxUrl), {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const url = await response.text();
            await sendMessage(url, 'image'); // Envia como mensagem do tipo imagem
        } else {
            alert('Falha no upload da imagem.');
        }
    } catch (error) {
        console.error(error);
        alert('Erro no upload. O servidor proxy pode estar ocupado.');
    } finally {
        status.classList.add('hidden');
        input.value = ''; // Reset input
    }
};

// --- EDITAR PERFIL & CATBOX UPLOAD (PERFIL) ---
window.openEditProfileView = () => {
    const currentName = document.getElementById('profile-name').innerText;
    const currentUsername = document.getElementById('profile-username').innerText.replace('@', '');
    const currentDesc = document.getElementById('profile-course').innerText.split(' • ');
    const currentImg = document.getElementById('profile-img').src;
    
    document.getElementById('edit-name').value = currentName;
    document.getElementById('edit-username').value = currentUsername !== '@estudante' ? currentUsername : '';
    document.getElementById('edit-course').value = currentDesc[0] !== 'Curso não informado' ? currentDesc[0] : '';
    document.getElementById('edit-semester').value = currentDesc[1] !== '1º Semestre' ? currentDesc[1] : '';
    document.getElementById('edit-profile-preview').src = currentImg;

    navigateTo('edit-profile');
}
window.editProfile = window.openEditProfileView;

// UPLOAD CATBOX (PERFIL) COM PROXY
window.uploadToCatbox = async (input) => {
    const file = input.files[0];
    if (!file) return;

    const status = document.getElementById('upload-status');
    status.innerText = "Enviando (Proxy)...";
    status.className = "text-xs text-indigo-500 mt-1 font-bold animate-pulse";

    const corsProxy = 'https://corsproxy.io/?';
    const catboxUrl = 'https://catbox.moe/user/api.php';

    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('userhash', '307daba6918600198381c9952'); 
    formData.append('fileToUpload', file);

    try {
        const response = await fetch(corsProxy + encodeURIComponent(catboxUrl), {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const url = await response.text();
            document.getElementById('edit-profile-preview').src = url;
            status.innerText = "Upload concluído!";
            status.className = "text-xs text-green-500 mt-1 font-bold";
            window.tempAvatarUrl = url;
        } else {
            throw new Error('Falha no upload');
        }
    } catch (error) {
        console.error(error);
        status.innerText = "Erro no upload (Tente novamente).";
        status.className = "text-xs text-red-500 mt-1 font-bold";
    }
};

window.saveProfileChanges = async () => {
    const name = document.getElementById('edit-name').value;
    const username = document.getElementById('edit-username').value;
    const course = document.getElementById('edit-course').value;
    const semester = document.getElementById('edit-semester').value;

    if(!name || !username) return alert("Nome e Usuário são obrigatórios.");

    // Usa URL do Catbox se houver, senão mantém a atual ou gera nova
    let currentSrc = document.getElementById('edit-profile-preview').src;
    let avatarUrl = window.tempAvatarUrl || currentSrc;
    
    document.getElementById('profile-name').innerText = name;
    document.getElementById('profile-username').innerText = '@' + username;
    document.getElementById('profile-course').innerText = `${course || "Curso não informado"} • ${semester || "1º Semestre"}`;
    document.getElementById('profile-img').src = avatarUrl;
    document.getElementById('header-img').src = avatarUrl;

    if (currentUser) {
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'data', 'profile'), { 
            name, 
            username,
            course: course || "Curso não informado",
            semester: semester || "1º Semestre",
            avatarUrl: avatarUrl
        }, { merge: true });
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
    if (window.renderSchedule) window.renderSchedule();
    if (window.updateNextClassWidget) window.updateNextClassWidget();
    if (window.renderTasks) window.renderTasks();
    if (window.renderFinance) window.renderFinance();
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

// --- SISTEMA DE NOTAS ---
window.renderNotes = function() {
    const container = document.getElementById('view-notas');
    if(!container) return;
    
    if(activeNoteId) {
        const note = notesData.find(n => n.id === activeNoteId);
        if(note) {
            container.innerHTML = `
                <div class="glass-panel p-6 rounded-[2rem] h-full flex flex-col relative animate-fade-in">
                    <div class="flex items-center gap-3 mb-4 pb-4 border-b border-gray-200/50 dark:border-white/10">
                        <button onclick="closeNote()" class="p-2 rounded-xl hover:bg-white/40 dark:hover:bg-white/10 transition"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>
                        <input type="text" id="note-title-input" value="${note.title}" placeholder="Título da Nota" class="flex-1 bg-transparent text-xl font-bold outline-none placeholder-gray-400 dark:text-white" oninput="updateNoteTitle('${note.id}', this.value)">
                        <span class="text-xs text-gray-400" id="save-status">Salvo</span>
                    </div>
                    <textarea id="note-content-input" class="flex-1 bg-transparent resize-none outline-none text-gray-700 dark:text-gray-300 leading-relaxed custom-scrollbar" placeholder="Escreva aqui..." oninput="updateNoteContent('${note.id}', this.value)">${note.content}</textarea>
                </div>
            `;
            lucide.createIcons();
            return;
        }
    }

    let html = `
        <div class="glass-panel p-6 rounded-[2rem] mb-6 flex justify-between items-center shadow-lg">
            <h2 class="text-xl font-black text-indigo-900 dark:text-white">Anotações</h2>
            <button onclick="createNote()" class="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg flex items-center justify-center transition active:scale-95">
                <i data-lucide="plus" class="w-5 h-5"></i>
            </button>
        </div>
        <div class="grid grid-cols-2 gap-4 pb-20">
    `;
    
    if(notesData.length === 0) {
        html += `<div class="col-span-2 text-center py-10 text-gray-400"><p>Nenhuma nota criada.</p></div>`;
    } else {
        notesData.sort((a,b) => b.updatedAt - a.updatedAt).forEach(note => {
            const date = new Date(note.updatedAt).toLocaleDateString('pt-BR');
            html += `
                <div onclick="openNote('${note.id}')" class="glass-inner p-4 rounded-2xl cursor-pointer hover:bg-white/40 dark:hover:bg-white/10 transition group relative h-40 flex flex-col">
                    <h3 class="font-bold text-gray-800 dark:text-white mb-2 truncate">${note.title || 'Sem Título'}</h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-4 flex-1 overflow-hidden">${note.content || '...'}</p>
                    <div class="flex justify-between items-end mt-2">
                        <span class="text-[10px] text-gray-400">${date}</span>
                        <button onclick="event.stopPropagation(); deleteNote('${note.id}')" class="text-gray-400 hover:text-red-500 transition p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                </div>
            `;
        });
    }
    html += `</div>`;
    container.innerHTML = html;
    lucide.createIcons();
}

window.createNote = function() {
    const id = Date.now().toString();
    notesData.unshift({ id, title: '', content: '', updatedAt: Date.now() });
    activeNoteId = id;
    saveData();
    renderNotes();
}

window.openNote = function(id) {
    activeNoteId = id;
    renderNotes();
}

window.closeNote = function() {
    activeNoteId = null;
    saveData();
    renderNotes();
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
    if(confirm('Excluir nota?')) {
        notesData = notesData.filter(n => n.id !== id);
        if(activeNoteId === id) activeNoteId = null;
        saveData();
        renderNotes();
    }
}

function debouncedSave() {
    const status = document.getElementById('save-status');
    if(status) status.innerText = "Salvando...";
    clearTimeout(noteSaveTimeout);
    noteSaveTimeout = setTimeout(() => {
        saveData();
        if(status) status.innerText = "Salvo";
    }, 1000);
}

// --- POMODORO ---
let timerInterval, timeLeft = 1500, isRunning = false, timerMode = 'pomodoro';
const modes = { pomodoro: 1500, short: 300, long: 900 };

window.toggleTimer = function() {
    const btn = document.getElementById('btn-timer-start');
    const icon = btn.querySelector('svg');
    
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


// --- TAREFAS ---
window.openAddTaskModal = function() {
     const modal = document.getElementById('task-modal');
     modal.classList.remove('hidden');
     setTimeout(() => { modal.classList.remove('opacity-0'); modal.firstElementChild.classList.remove('scale-95'); modal.firstElementChild.classList.add('scale-100'); }, 10);
     document.getElementById('new-task-title').value = '';
     document.getElementById('new-task-date').value = '';
     selectTaskCategory('estudo');
 }

 window.closeTaskModal = function() {
     const modal = document.getElementById('task-modal');
     modal.classList.add('opacity-0'); modal.firstElementChild.classList.remove('scale-100'); modal.firstElementChild.classList.add('scale-95');
     setTimeout(() => modal.classList.add('hidden'), 300);
 }

 window.selectTaskCategory = function(cat) {
     selectedTaskCategory = cat;
     document.querySelectorAll('.cat-btn').forEach(btn => {
         btn.classList.add('opacity-50', 'scale-95');
         btn.classList.remove('ring-2', 'ring-offset-1', 'ring-indigo-400');
    });
     const btn = document.getElementById('cat-' + cat);
     btn.classList.remove('opacity-50', 'scale-95');
     btn.classList.add('ring-2', 'ring-offset-1', 'ring-indigo-400');
 }

 window.confirmAddTask = function() {
     const title = document.getElementById('new-task-title').value;
     const date = document.getElementById('new-task-date').value;
     if(!title.trim()) return alert("Digite o título da tarefa");
     tasksData.unshift({ id: Date.now(), text: title, category: selectedTaskCategory, date: date, done: false });
     saveData();
     closeTaskModal();
 }

window.toggleTask = function(id) { const t = tasksData.find(x => x.id === id); if(t) { t.done = !t.done; saveData(); } }
window.deleteTask = function(id) { tasksData = tasksData.filter(x => x.id !== id); saveData(); }

window.setTaskTab = function(tab) {
    currentTaskTab = tab;
    const pendingBtn = document.getElementById('tab-pending');
    const completedBtn = document.getElementById('tab-completed');
    if(tab === 'pending') { pendingBtn.classList.add('tab-active'); pendingBtn.classList.remove('hover:bg-white/10'); completedBtn.classList.remove('tab-active'); completedBtn.classList.add('hover:bg-white/10'); } 
    else { completedBtn.classList.add('tab-active'); completedBtn.classList.remove('hover:bg-white/10'); pendingBtn.classList.remove('tab-active'); pendingBtn.classList.add('hover:bg-white/10'); }
    if (window.renderTasks) window.renderTasks();
}

window.renderTasks = function() {
    const list = document.getElementById('todo-list');
    list.innerHTML = '';
    const total = tasksData.length;
    const completed = tasksData.filter(t => t.done).length;
    const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
    document.getElementById('task-progress-bar').style.width = `${progress}%`;
    document.getElementById('task-progress-text').innerText = `${progress}%`;
    const filteredTasks = tasksData.filter(t => currentTaskTab === 'pending' ? !t.done : t.done);

    if (filteredTasks.length === 0) { list.innerHTML = `<div class="text-center text-gray-400 py-8 text-xs font-medium bg-white/20 dark:bg-white/5 rounded-xl border border-white/10">Nenhuma tarefa ${currentTaskTab === 'pending' ? 'pendente' : 'concluída'}.</div>`; }

    const catColors = { estudo: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800', prova: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800', trabalho: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800', pessoal: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800' };

    filteredTasks.forEach(t => {
        const item = document.createElement('div');
        item.className = `flex flex-col gap-2 p-4 glass-inner rounded-2xl ${t.done ? 'opacity-60' : ''}`;
        const dateStr = t.date ? new Date(t.date).toLocaleDateString('pt-BR', {day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit'}) : '';
        const badgeClass = catColors[t.category] || catColors['estudo'];
        item.innerHTML = `
            <div class="flex items-start gap-3">
                <button onclick="toggleTask(${t.id})" class="mt-0.5 w-6 h-6 rounded-full border-2 ${t.done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-400 dark:border-gray-500'} flex items-center justify-center transition flex-shrink-0">
                    ${t.done ? '<i data-lucide="check" class="w-3 h-3 text-white"></i>' : ''}
                </button>
                <div class="flex-1 min-w-0">
                    <span class="text-sm font-semibold ${t.done ? 'line-through text-gray-400' : 'text-gray-800 dark:text-white'} block truncate">${t.text}</span>
                    <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${badgeClass}">${t.category}</span>
                        ${dateStr ? `<span class="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 font-medium"><i data-lucide="calendar-clock" class="w-3 h-3"></i> ${dateStr}</span>` : ''}
                    </div>
                </div>
                <button onclick="deleteTask(${t.id})" class="text-gray-400 hover:text-red-500 transition p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        `;
        list.appendChild(item);
    });
    lucide.createIcons();
}

// --- CALCULADORA CIENTÍFICA ---
let currentInput = '0';
let isResult = false;
let isRadians = true;

window.appendNumber = function(number) {
    if (isResult) { currentInput = number; isResult = false; }
    else { if (currentInput === '0' && number !== '.') currentInput = number; else currentInput += number; }
    updateDisplay();
}
window.appendOperator = function(op) { isResult = false; currentInput += op; updateDisplay(); }
window.appendConstant = function(c) {
    if (isResult) { currentInput = ''; isResult = false; }
    if (currentInput !== '0' && currentInput !== '') { const last = currentInput.slice(-1); if (!isNaN(last) || last === ')') currentInput += '*'; }
    if (c === 'pi') currentInput += 'π'; if (c === 'e') currentInput += 'e';
    updateDisplay();
}
window.appendFunction = function(fn) {
     if (isResult) { currentInput = ''; isResult = false; }
     if (currentInput === '0') currentInput = '';
     if (currentInput.length > 0) { const last = currentInput.slice(-1); if (!isNaN(last) || last === 'π' || last === 'e' || last === ')') currentInput += '*'; }
     currentInput += fn + '(';
     updateDisplay();
}
window.clearDisplay = function() { currentInput = '0'; document.getElementById('calc-history').textContent = ''; isResult = false; updateDisplay(); }
window.deleteLast = function() {
     if (isResult) { clearDisplay(); return; }
     if (currentInput.length <= 1 || currentInput === 'Error') { currentInput = '0'; } else { currentInput = currentInput.slice(0, -1); }
     updateDisplay();
}
window.factorial = function(n) { if (n < 0 || !Number.isInteger(n)) return NaN; if (n === 0 || n === 1) return 1; let r = 1; for(let i=2; i<=n; i++) r *= i; return r; }

window.calculate = function() {
    try {
        const raw = currentInput;
        let expr = currentInput.replace(/×/g, '*').replace(/÷/g, '/').replace(/π/g, 'Math.PI').replace(/e/g, 'Math.E').replace(/\^/g, '**').replace(/sqrt\(/g, 'Math.sqrt(').replace(/log\(/g, 'Math.log10(').replace(/ln\(/g, 'Math.log(').replace(/%/g, '/100');
        const sin = (x) => isRadians ? Math.sin(x) : Math.sin(x * Math.PI / 180);
        const cos = (x) => isRadians ? Math.cos(x) : Math.cos(x * Math.PI / 180);
        const tan = (x) => isRadians ? Math.tan(x) : Math.tan(x * Math.PI / 180);
        const asin = (x) => isRadians ? Math.asin(x) : Math.asin(x) * 180 / Math.PI;
        const acos = (x) => isRadians ? Math.acos(x) : Math.acos(x) * 180 / Math.PI;
        const atan = (x) => isRadians ? Math.atan(x) : Math.atan(x) * 180 / Math.PI;
        const fact = window.factorial;
        const func = new Function('sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'fact', 'return ' + expr);
        let res = func(sin, cos, tan, asin, acos, atan, fact);
        if (!isFinite(res) || isNaN(res)) { currentInput = 'Erro'; } else { currentInput = String(parseFloat(res.toPrecision(10))); }
        document.getElementById('calc-history').textContent = raw + ' =';
        isResult = true;
        updateDisplay();
    } catch (e) { currentInput = 'Erro'; isResult = true; updateDisplay(); }
}
function updateDisplay() {
    const display = document.getElementById('calc-display');
    if(display) { display.textContent = currentInput; display.scrollLeft = display.scrollWidth; }
}
window.toggleCalcMode = function() {
    isRadians = !isRadians;
    const btn = document.getElementById('toggleMode');
    if(btn) { btn.textContent = isRadians ? 'RAD' : 'DEG'; btn.classList.toggle('mode-active'); }
}
window.copyToClipboard = function() {
    navigator.clipboard.writeText(currentInput).then(() => {
        const tt = document.getElementById('copyTooltip');
        if(tt) { tt.style.opacity = '1'; setTimeout(() => tt.style.opacity = '0', 1500); }
    });
}


// --- FINANCEIRO 2.0 ---
window.openAddTransactionModal = function() {
    const modal = document.getElementById('finance-modal');
    modal.classList.remove('hidden');
    setTimeout(() => { modal.classList.remove('opacity-0'); modal.firstElementChild.classList.remove('scale-95'); modal.firstElementChild.classList.add('scale-100'); }, 10);
}
window.closeFinanceModal = function() {
    const modal = document.getElementById('finance-modal');
    modal.classList.add('opacity-0'); modal.firstElementChild.classList.remove('scale-100'); modal.firstElementChild.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}
window.addTransaction = function() {
    const desc = document.getElementById('fin-desc').value;
    const val = parseFloat(document.getElementById('fin-val').value);
    if(desc && val) {
        financeData.unshift({ id: Date.now(), desc, val, date: new Date().toISOString() });
        saveData();
        closeFinanceModal();
        document.getElementById('fin-desc').value = ''; document.getElementById('fin-val').value = '';
    }
}
window.deleteTransaction = function(id) {
    financeData = financeData.filter(x => x.id !== id);
    saveData();
}

window.setMonthlyBudget = function() {
    window.openCustomInputModal("Definir Orçamento Mensal", "Ex: 800.00", monthlyBudget.toString(), (val) => {
        const budget = parseFloat(val.replace(',', '.'));
        if(!isNaN(budget)) {
            monthlyBudget = budget;
            saveData();
            window.showModal("Sucesso", "Orçamento atualizado!");
        }
    });
}

window.renderFinance = function() {
    const list = document.getElementById('finance-list');
    const budgetDisplay = document.getElementById('fin-budget-display');
    const totalSpentDisplay = document.getElementById('fin-total-spent');
    const remainingDisplay = document.getElementById('fin-remaining');
    const progressBar = document.getElementById('fin-progress-bar');
    
    if (!list) return;
    list.innerHTML = '';
    
    const totalSpent = financeData.reduce((acc, curr) => acc + curr.val, 0);
    const remaining = monthlyBudget - totalSpent;
    const percent = monthlyBudget > 0 ? Math.min(100, (totalSpent / monthlyBudget) * 100) : 0;

    budgetDisplay.innerText = `R$ ${monthlyBudget.toFixed(2)}`;
    totalSpentDisplay.innerText = `R$ ${totalSpent.toFixed(2)}`;
    remainingDisplay.innerText = `Restante: R$ ${remaining.toFixed(2)}`;
    progressBar.style.width = `${percent}%`;
    
    if(percent > 90) progressBar.className = "h-full bg-red-500 transition-all duration-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]";
    else if(percent > 70) progressBar.className = "h-full bg-yellow-400 transition-all duration-500 shadow-[0_0_10px_rgba(250,204,21,0.5)]";
    else progressBar.className = "h-full bg-white transition-all duration-500 shadow-[0_0_10px_rgba(255,255,255,0.5)]";

    if(financeData.length === 0) {
         list.innerHTML = '<div class="text-center text-gray-400 text-xs py-4 bg-white/20 dark:bg-white/5 rounded-xl border border-white/10">Nenhum gasto registrado.</div>';
    } else {
        financeData.forEach(t => {
            const dateObj = new Date(t.date);
            const dateStr = dateObj.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
            list.innerHTML += `
                <div class="flex justify-between items-center p-3 glass-inner rounded-xl">
                    <div>
                        <p class="text-sm font-bold text-gray-800 dark:text-white">${t.desc}</p>
                        <p class="text-[10px] text-gray-500">${dateStr}</p>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="font-bold text-red-500 text-sm">- R$ ${t.val.toFixed(2)}</span>
                        <button onclick="deleteTransaction(${t.id})" class="text-gray-400 hover:text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                </div>
            `;
        });
    }
    lucide.createIcons();
}

// --- UTILITÁRIOS (Modais) ---
window.showModal = function(title, message) {
    const m = document.getElementById('generic-modal');
    document.getElementById('generic-modal-title').innerText = title;
    document.getElementById('generic-modal-message').innerText = message;
    m.classList.remove('hidden');
    setTimeout(() => { m.classList.remove('opacity-0'); m.firstElementChild.classList.remove('scale-95'); m.firstElementChild.classList.add('scale-100'); }, 10);
}
window.closeGenericModal = function() {
     const m = document.getElementById('generic-modal');
     m.classList.add('opacity-0'); m.firstElementChild.classList.remove('scale-100'); m.firstElementChild.classList.add('scale-95');
     setTimeout(() => m.classList.add('hidden'), 300);
}

window.openCustomInputModal = function(title, placeholder, initialValue, onConfirm) {
    const modal = document.getElementById('custom-input-modal');
    document.getElementById('custom-modal-title').innerText = title;
    const input = document.getElementById('custom-modal-input');
    input.placeholder = placeholder;
    input.value = initialValue;
    
    const btnConfirm = document.getElementById('custom-modal-confirm');
    const btnCancel = document.getElementById('custom-modal-cancel');
    const newBtnConfirm = btnConfirm.cloneNode(true);
    const newBtnCancel = btnCancel.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);
    btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

    newBtnConfirm.onclick = () => {
        const val = input.value;
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
        if(onConfirm) onConfirm(val);
    };
    newBtnCancel.onclick = () => {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    };

    modal.classList.remove('hidden');
    setTimeout(() => { modal.classList.remove('opacity-0'); modal.firstElementChild.classList.remove('scale-95'); modal.firstElementChild.classList.add('scale-100'); input.focus(); }, 10);
}

// WIDGET AULA
window.updateNextClassWidget = function() {
    const container = document.getElementById('widget-next-class');
    if(!container) return;
    const now = new Date(); const daysArr = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']; const currentDay = daysArr[now.getDay()]; const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const todayClasses = scheduleData.filter(c => c.day === currentDay).sort((a, b) => parseInt(a.start.replace(':','')) - parseInt(b.start.replace(':','')));
    let nextClass = null; let status = ""; 
    for(let c of todayClasses) {
        const [h, m] = c.start.split(':').map(Number); const startMins = h * 60 + m; let endMins = startMins + 60; if(c.end) { const [hE, mE] = c.end.split(':').map(Number); endMins = hE * 60 + mE; }
        if (currentMinutes < startMins) { nextClass = c; status = 'future'; break; } else if (currentMinutes >= startMins && currentMinutes < endMins) { nextClass = c; status = 'now'; break; }
    }
    if(nextClass) {
        const [hS, mS] = nextClass.start.split(':').map(Number); const startMins = hS * 60 + mS; let endMins = startMins + 60; if(nextClass.end) { const [hE, mE] = nextClass.end.split(':').map(Number); endMins = hE * 60 + mE; }
        let timeText = ""; let progressPercentage = 0;
        if(status === 'future') { const diff = startMins - currentMinutes; const dh = Math.floor(diff/60); const dm = diff%60; timeText = dh > 0 ? `Em ${dh}h ${dm}m` : `Em ${dm} min`; } 
        else { timeText = "Agora"; const totalDuration = endMins - startMins; const elapsed = currentMinutes - startMins; progressPercentage = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100)); }

        if (widgetStyle === 'classic') {
            container.className = "glass-panel p-4 rounded-[2rem] h-36 flex flex-col justify-between text-left cursor-pointer transition hover:shadow-lg relative overflow-hidden group";
            container.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                        <i data-lucide="graduation-cap" class="w-4 h-4"></i>
                        <span class="text-[10px] font-bold uppercase tracking-wider">${status === 'now' ? 'Em Aula' : 'Próxima'}</span>
                    </div>
                    <span class="text-[9px] font-bold ${status === 'now' ? 'text-green-600 bg-green-100/50 dark:bg-green-900/40' : 'text-orange-600 bg-orange-100/50 dark:bg-orange-900/40'} px-2 py-0.5 rounded-full whitespace-nowrap">${timeText}</span>
                </div>
                <div class="mt-1">
                    <h4 class="font-bold text-sm text-gray-900 dark:text-white leading-tight mb-0.5 line-clamp-2">${nextClass.name}</h4>
                    <p class="text-[10px] text-gray-500 dark:text-gray-300 truncate flex items-center gap-1"><i data-lucide="user" class="w-3 h-3 inline"></i> ${nextClass.prof || 'Prof.'}</p>
                </div>
                <div class="w-full mt-auto">
                    <div class="flex justify-between text-[9px] text-gray-500 dark:text-gray-400 mb-1 font-medium"><span><i data-lucide="map-pin" class="w-3 h-3 inline mr-0.5"></i>${nextClass.room}</span></div>
                    ${status === 'now' ? `<div class="h-1 w-full bg-gray-200/50 dark:bg-white/10 rounded-full overflow-hidden"><div class="h-full bg-green-500 rounded-full transition-all duration-1000" style="width: ${progressPercentage}%"></div></div>` : `<div class="h-1 w-full bg-indigo-100/50 dark:bg-indigo-900/30 rounded-full"></div>`}
                </div>
            `;
        } else {
            let iconColor = "text-blue-600"; let bgIcon = "glass-inner bg-blue-100/30 dark:bg-blue-900/30";
            if (status === 'now') { iconColor = "text-green-600"; bgIcon = "glass-inner bg-green-100/30 dark:bg-green-900/30 animate-pulse"; }
            container.className = "glass-panel p-5 rounded-[2rem] h-36 flex flex-col justify-center text-center active:scale-95 transition hover:shadow-lg group cursor-pointer relative overflow-hidden";
            container.innerHTML = `<div class="flex flex-col items-center justify-center h-full"><div class="w-12 h-12 ${bgIcon} ${iconColor} rounded-full flex items-center justify-center mb-2 shadow-sm transition-all"><i data-lucide="${status === 'now' ? 'play-circle' : 'clock'}" class="w-6 h-6"></i></div><h4 class="font-bold text-gray-800 dark:text-white leading-tight truncate w-full px-2 text-sm">${nextClass.name}</h4><p class="text-[10px] text-gray-500 dark:text-gray-400 mt-1 font-medium">${timeText} • ${nextClass.room}</p></div>`;
        }
    } else {
        const msg = scheduleData.length === 0 ? "Adicionar Grade" : "Sem aulas hoje";
        container.className = "glass-panel p-5 rounded-[2rem] h-36 flex flex-col justify-center text-center active:scale-95 transition hover:shadow-lg group cursor-pointer relative overflow-hidden";
        container.innerHTML = `<div class="flex flex-col items-center justify-center h-full opacity-60"><div class="w-12 h-12 glass-inner rounded-full flex items-center justify-center mb-2 text-gray-400"><i data-lucide="coffee" class="w-6 h-6"></i></div><p class="font-bold text-xs text-gray-500 dark:text-gray-400">${msg}</p></div>`;
    }
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