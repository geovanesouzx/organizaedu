import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, signInWithCredential } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, addDoc, query, orderBy, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { OrganizaIA } from "./organizaedu.js";

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

// Variáveis Globais
let userProfileData = {};
let scheduleData = [];
let tasksData = [];
let financeData = [];
let gradesData = [];
let notesData = [];
let monthlyBudget = 0;
let widgetStyle = 'modern';
let selectedColor = 'indigo';
let activeNoteId = null;
let noteSaveTimeout = null;
let classToDeleteId = null;
let selectedTaskCategory = 'estudo';
let currentTaskTab = 'pending';

// IA Vars
let currentAIProvider = 'gemini';
let activeChatId = null;
let chatUnsubscribe = null;
let currentChatHistory = []; // Memória local do chat para limitar o contexto enviado
let organizaIA = null;

// Doação
let selectedDonationAmount = 6.00;
let currentPaymentId = null;
let paymentCheckInterval = null;

// --- FUNÇÕES HELPER PARA A IA (20 FUNÇÕES) ---
const AI_Actions = {
    // 1. Criar Aula
    create_class: (data) => {
        const newClass = {
            id: Date.now().toString(),
            name: data.name || "Nova Aula",
            day: data.day || "seg",
            start: data.start || "08:00",
            end: data.end || "09:00",
            room: data.room || "EAD",
            prof: data.prof || "",
            color: 'indigo'
        };
        scheduleData.push(newClass);
        saveData();
        window.renderSchedule();
        window.updateNextClassWidget();
    },
    // 2. Deletar Aula
    delete_class: (data) => {
        const term = (data.name_or_id || "").toLowerCase();
        const target = scheduleData.find(c => c.id === term || c.name.toLowerCase().includes(term));
        if (target) {
            scheduleData = scheduleData.filter(c => c.id !== target.id);
            saveData();
            window.renderSchedule();
            window.updateNextClassWidget();
        }
    },
    // 3. Criar Tarefa
    create_task: (data) => {
        tasksData.unshift({
            id: Date.now(),
            text: data.text || "Tarefa",
            category: data.category || "estudo",
            date: "",
            done: false
        });
        saveData();
        window.renderTasks();
    },
    // 4. Deletar Tarefa
    delete_task: (data) => {
        const term = (data.text_or_id || "").toLowerCase();
        const target = tasksData.find(t => t.id == term || t.text.toLowerCase().includes(term));
        if (target) {
            tasksData = tasksData.filter(t => t.id !== target.id);
            saveData();
            window.renderTasks();
        }
    },
    // 5. Criar Transação
    create_transaction: (data) => {
        financeData.unshift({
            id: Date.now(),
            desc: data.desc || "Gasto",
            val: parseFloat(data.val) || 0,
            date: new Date().toISOString()
        });
        saveData();
        window.renderFinance();
    },
    // 6. Deletar Transação
    delete_transaction: (data) => {
        const term = (data.desc_or_id || "").toLowerCase();
        const target = financeData.find(f => f.id == term || f.desc.toLowerCase().includes(term));
        if (target) {
            financeData = financeData.filter(f => f.id !== target.id);
            saveData();
            window.renderFinance();
        }
    },
    // 7. Criar Nota
    create_note: (data) => {
        notesData.unshift({
            id: Date.now().toString(),
            title: data.title || "Nota IA",
            content: data.content || "",
            updatedAt: Date.now(),
            color: 'blue',
            pinned: false
        });
        saveData();
        if (window.renderNotes) window.renderNotes();
    },
    // 8. Deletar Nota
    delete_note: (data) => {
        const term = (data.title_or_id || "").toLowerCase();
        const target = notesData.find(n => n.id === term || n.title.toLowerCase().includes(term));
        if (target) {
            notesData = notesData.filter(n => n.id !== target.id);
            if (activeNoteId === target.id) activeNoteId = null;
            saveData();
            if (window.renderNotes) window.renderNotes();
        }
    },
    // 9. Fixar Nota
    pin_note: (data) => {
        const term = (data.title_or_id || "").toLowerCase();
        const target = notesData.find(n => n.id === term || n.title.toLowerCase().includes(term));
        if (target) {
            target.pinned = !target.pinned;
            saveData();
            if (window.renderNotes) window.renderNotes();
        }
    },
    // 10. Timer
    control_timer: (data) => {
        if (data.mode && window.setTimerMode) window.setTimerMode(data.mode);
        if (data.action === 'start' && window.toggleTimer) {
            const btn = document.getElementById('btn-timer-start');
            if (btn && !btn.innerHTML.includes('pause')) window.toggleTimer();
        } else if (data.action === 'stop' && window.toggleTimer) {
            const btn = document.getElementById('btn-timer-start');
            if (btn && btn.innerHTML.includes('pause')) window.toggleTimer();
        } else if (data.action === 'reset' && window.resetTimer) {
            window.resetTimer();
        }
        window.navigateTo('pomo');
    },
    // 11. Nota Escolar
    add_grade: (data) => {
        gradesData.push({
            id: Date.now(),
            subject: data.subject || "Geral",
            value: parseFloat(data.value),
            date: Date.now()
        });
        saveData();
    },
    // 12. Tema
    change_theme: (data) => {
        const isDark = document.documentElement.classList.contains('dark');
        if (data.mode === 'dark' || (data.mode === 'toggle' && !isDark)) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    },
    // 13. Widget
    set_style: (data) => {
        if (window.setWidgetStyle) window.setWidgetStyle(data.style);
    },
    // 14. Navegação
    navigate_to: (data) => {
        if (window.navigateTo) window.navigateTo(data.page);
    },
    // 15. Orçamento
    set_budget: (data) => {
        monthlyBudget = parseFloat(data.value) || 0;
        saveData();
        if (window.renderFinance) window.renderFinance();
    },
    // 16. Limpar Completas
    clear_completed_tasks: () => {
        tasksData = tasksData.filter(t => !t.done);
        saveData();
        if (window.renderTasks) window.renderTasks();
    },
    // 17. Filtrar Tarefas (Visual apenas)
    filter_tasks: (data) => {
        if (window.navigateTo) window.navigateTo('tarefas');
        if (data.category && document.getElementById('cat-' + data.category)) {
            selectedTaskCategory = data.category;
            // Força a UI a atualizar se possível, ou apenas define para a próxima tarefa
        }
    },
    // 18. Privacidade (Blur)
    toggle_privacy: () => {
        const el = document.getElementById('fin-budget-display');
        if (el) el.classList.toggle('blur-sm');
        const el2 = document.getElementById('fin-total-spent');
        if (el2) el2.classList.toggle('blur-sm');
    },
    // 19. Reset Financeiro
    reset_finance: () => {
        if (confirm("IA: Deseja apagar todos os gastos?")) {
            financeData = [];
            saveData();
            if (window.renderFinance) window.renderFinance();
        }
    },
    // 20. Abrir Modal
    open_modal: (data) => {
        if (data.modal === 'donation' && window.openDonationModal) window.openDonationModal();
        if (data.modal === 'profile' && window.navigateTo) window.navigateTo('edit-profile');
    }
};

organizaIA = new OrganizaIA(AI_Actions);

// PALETA DE CORES
const colorPalettes = {
    indigo: { bg: 'bg-indigo-100 dark:bg-indigo-900', text: 'text-indigo-700 dark:text-indigo-200', border: 'border-l-indigo-500', badge: 'bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200' },
    emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900', text: 'text-emerald-700 dark:text-emerald-200', border: 'border-l-emerald-500', badge: 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200' },
    orange: { bg: 'bg-orange-100 dark:bg-orange-900', text: 'text-orange-700 dark:text-orange-200', border: 'border-l-orange-500', badge: 'bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200' },
    rose: { bg: 'bg-rose-100 dark:bg-rose-900', text: 'text-rose-700 dark:text-rose-200', border: 'border-l-rose-500', badge: 'bg-rose-200 dark:bg-rose-800 text-rose-800 dark:text-rose-200' },
    blue: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-200', border: 'border-l-blue-500', badge: 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200' }
};

// --- UTILS IMGUR (CORRIGIDO COM O CLIENT ID FORNECIDO) ---
async function uploadToImgur(file) {
    const clientId = "513bb727cecf9ac";
    const formData = new FormData();
    formData.append("image", file);

    try {
        const response = await fetch("https://api.imgur.com/3/image", {
            method: "POST",
            headers: { Authorization: `Client-ID ${clientId}` },
            body: formData,
        });

        if (!response.ok) throw new Error("Falha no upload para o Imgur");
        const data = await response.json();
        // O Imgur retorna o link dentro de data.data.link
        return data.data.link;
    } catch (error) {
        console.error("Erro Imgur:", error);
        throw error;
    }
}

// --- AUTH & BOOT ---
onAuthStateChanged(auth, async (user) => {
    const loadingScreen = document.getElementById('loading-screen');
    const loginScreen = document.getElementById('login-screen');
    const setupScreen = document.getElementById('setup-screen');
    const appContent = document.getElementById('app-content');

    if (user) {
        currentUser = user;

        const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'data', 'profile');
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists() && profileSnap.data().username) {
            initDataSync();
            initChatSystem();

            if (loadingScreen) {
                loadingScreen.style.opacity = '0';
                setTimeout(() => {
                    loadingScreen.classList.add('hidden');
                    if (loginScreen) loginScreen.classList.add('hidden');
                    if (setupScreen) setupScreen.classList.add('hidden');
                    if (appContent) {
                        appContent.classList.remove('hidden');
                        setTimeout(() => appContent.style.opacity = '1', 50);
                    }
                }, 500);
            }
        } else {
            if (document.getElementById('setup-name')) document.getElementById('setup-name').value = user.displayName || "";
            if (user.photoURL && document.getElementById('setup-profile-preview')) document.getElementById('setup-profile-preview').src = user.photoURL;

            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
                loginScreen.classList.add('hidden');
                setupScreen.classList.remove('hidden');
            }, 500);
        }

    } else {
        currentUser = null;
        if (loadingScreen) loadingScreen.style.opacity = '0';
        setTimeout(() => {
            if (loadingScreen) loadingScreen.classList.add('hidden');
            if (appContent) appContent.classList.add('hidden');
            if (setupScreen) setupScreen.classList.add('hidden');
            if (loginScreen) loginScreen.classList.remove('hidden');
        }, 500);
    }
});

// --- FUNÇÃO QUE O ANDROID CHAMA (A PONTE) ---
window.handleNativeLogin = (idToken) => {
    const credential = GoogleAuthProvider.credential(idToken);
    signInWithCredential(auth, credential)
        .then((result) => {
            console.log("Login Nativo via Android realizado com sucesso!");
            // O onAuthStateChanged lá em cima vai detectar o login e redirecionar
        })
        .catch((error) => {
            console.error("Erro no login nativo:", error);
            alert("Erro ao logar pelo Android: " + error.message);
        });
};

document.addEventListener('DOMContentLoaded', () => {

    // 👇 --- CÓDIGO NOVO: DETECTOR AUTOMÁTICO DE VISUAL --- 👇
    // Verifica se a "Ponte" existe. Se sim, adiciona a classe 'is-android' no corpo do site.
    if (window.AndroidInterface) {
        console.log("📱 App Android detectado: Ativando 'Dimensão Aplicativo' (Padding Extra)");
        document.body.classList.add('is-android');
    } else {
        console.log("💻 Navegador/PC detectado: Ativando 'Dimensão Site' (Padrão)");
        document.body.classList.remove('is-android');
    }
    // 👆 --------------------------------------------------- 👆

    const btnLogin = document.getElementById('btn-login-google');

    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            // 1. Verifica se está rodando dentro do App Android (Ponte existe?)
            if (window.AndroidInterface) {
                console.log("Detectado App Android. Chamando login nativo...");
                window.AndroidInterface.triggerGoogleLogin();
            }
            // 2. Se não, usa o login normal de site (PC/iOS/Navegador)
            else {
                console.log("Ambiente Web detectado. Usando Popup...");
                const provider = new GoogleAuthProvider();
                signInWithPopup(auth, provider).catch((error) => alert("Erro: " + error.message));
            }
        });
    }

    // Resto do código de navegação e ícones...
    window.addEventListener('popstate', (event) => {
        const page = event.state ? event.state.page : (window.location.hash.replace('#', '') || 'home');
        switchView(page, false);
    });

    const checkModern = document.getElementById('check-modern');
    if (checkModern) {
        checkModern.innerHTML = '<i data-lucide="check" class="w-3 h-3 text-white"></i>';
        checkModern.classList.add('bg-indigo-600', 'border-transparent');
    }

    if (window.lucide) lucide.createIcons();
});

window.logout = function () {
    signOut(auth).then(() => window.location.reload());
}

// --- SETUP ---
window.uploadToImgurSetup = async (input) => {
    const file = input.files[0];
    if (!file) return;
    const status = document.getElementById('setup-upload-status');
    status.innerText = "Enviando...";
    try {
        const url = await uploadToImgur(file);
        document.getElementById('setup-profile-preview').src = url;
        status.innerText = "Sucesso!";
        window.tempSetupAvatarUrl = url;
    } catch (e) {
        status.innerText = "Erro.";
        console.log(e);
    }
};

window.finishSetup = async () => {
    const name = document.getElementById('setup-name').value;
    const username = document.getElementById('setup-username').value;
    const course = document.getElementById('setup-course').value;
    const semester = document.getElementById('setup-semester').value;
    let avatarUrl = window.tempSetupAvatarUrl || document.getElementById('setup-profile-preview').src;

    if (!name || !username) return alert("Preencha os campos obrigatórios.");

    if (currentUser) {
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'data', 'profile'), {
            name, username, course, semester, avatarUrl, joinedAt: Date.now()
        }, { merge: true });
        window.location.reload();
    }
};

// --- DATA SYNC ---
function initDataSync() {
    if (!currentUser) return;

    onSnapshot(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'data', 'profile'), (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            userProfileData = data;

            const elName = document.getElementById('profile-name');
            if (elName) elName.innerText = data.name || "Usuário";
            const elUser = document.getElementById('profile-username');
            if (elUser) elUser.innerText = '@' + (data.username || "...");
            const elCourse = document.getElementById('profile-course');
            if (elCourse) elCourse.innerText = `${data.course || ""} • ${data.semester || ""}`;

            const avatarUrl = data.avatarUrl || currentUser.photoURL;
            if (document.getElementById('profile-img')) document.getElementById('profile-img').src = avatarUrl;
            if (document.getElementById('header-img')) document.getElementById('header-img').src = avatarUrl;
            if (document.getElementById('edit-profile-preview')) document.getElementById('edit-profile-preview').src = avatarUrl;
        }
    });

    onSnapshot(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'data', 'settings'), (doc) => {
        const data = doc.exists() ? doc.data() : {};

        scheduleData = data.schedule || [];
        tasksData = data.tasks || [];
        financeData = data.finance || [];
        monthlyBudget = data.monthlyBudget || 0;
        notesData = data.notes || [];
        gradesData = data.grades || [];

        if (data.widgetStyle) {
            widgetStyle = data.widgetStyle;
            updateWidgetStyleUI();
        }

        if (typeof window.renderSchedule === 'function') window.renderSchedule();
        if (typeof window.updateNextClassWidget === 'function') window.updateNextClassWidget();
        if (typeof window.renderTasks === 'function') window.renderTasks();
        if (typeof window.renderFinance === 'function') window.renderFinance();
        // Renderiza notas em segundo plano se não tiver nota ativa, para garantir que esteja pronto ao trocar de aba
        if (typeof window.renderNotes === 'function' && !activeNoteId) {
            window.renderNotes();
        }
    });
}

function updateWidgetStyleUI() {
    document.querySelectorAll('.widget-check').forEach(el => { el.innerHTML = ''; el.classList.remove('bg-indigo-600', 'border-transparent'); });
    const check = document.getElementById('check-' + widgetStyle);
    if (check) { check.innerHTML = '<i data-lucide="check" class="w-3 h-3 text-white"></i>'; check.classList.add('bg-indigo-600', 'border-transparent'); }
    if (window.lucide) lucide.createIcons();
}

// --- NAVEGAÇÃO ---
function switchView(pageId, pushToHistory = true) {
    document.querySelectorAll('.page-view').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('view-' + pageId);
    if (target) {
        target.classList.remove('hidden');
        window.scrollTo(0, 0);
    }

    const mobileNav = document.querySelector('.glass-nav');
    if (mobileNav) {
        if (pageId === 'ia') {
            mobileNav.classList.add('hidden-nav');
        } else {
            mobileNav.classList.remove('hidden-nav');
        }
    }

    // PREENCHE DADOS AO ABRIR EDIÇÃO
    if (pageId === 'edit-profile') {
        populateEditProfile();
    }

    // CORREÇÃO: Renderizar componentes ao entrar na aba para garantir que apareçam
    if (pageId === 'notas') window.renderNotes();
    if (pageId === 'tarefas') window.renderTasks();
    if (pageId === 'financeiro') window.renderFinance();
    if (pageId === 'aulas') window.renderSchedule();
    if (pageId === 'onibus') window.updateBusWidget();

    if (pushToHistory) {
        history.pushState({ page: pageId }, null, `#${pageId}`);
    }

    const titles = { 'home': 'Visão Geral', 'aulas': 'Grade', 'ia': 'Organiza IA', 'ferramentas': 'Ferramentas', 'onibus': 'Circular', 'perfil': 'Perfil', 'financeiro': 'Financeiro', 'tarefas': 'Tarefas', 'notas': 'Anotações', 'calculadora': 'Calculadora', 'pomo': 'Foco', 'sounds': 'Sons', 'edit-profile': 'Editar Perfil', 'config': 'Ajustes' };
    const elTitle = document.getElementById('header-title');
    if (elTitle) elTitle.innerText = titles[pageId] || 'OrganizaEdu';

    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        if (pageId === 'home') backBtn.classList.add('hidden');
        else backBtn.classList.remove('hidden');
    }

    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'dark:text-indigo-400');
        btn.classList.add('text-gray-400');
    });

    let activeNav = pageId;
    if (['tarefas', 'calculadora', 'financeiro', 'notas', 'pomo', 'sounds'].includes(pageId)) activeNav = 'ferramentas';
    if (pageId === 'edit-profile' || pageId === 'config') activeNav = 'home';

    const navBtn = document.getElementById('mob-nav-' + activeNav);
    if (navBtn) {
        navBtn.classList.remove('text-gray-400');
        navBtn.classList.add('text-indigo-600', 'dark:text-indigo-400');
    }

    if (window.lucide) lucide.createIcons();
}

window.navigateTo = (pageId) => {
    switchView(pageId, true);
};

// --- PERFIL E UPLOAD ---
window.populateEditProfile = function () {
    if (userProfileData) {
        document.getElementById('edit-name').value = userProfileData.name || '';
        document.getElementById('edit-username').value = userProfileData.username || '';
        document.getElementById('edit-course').value = userProfileData.course || '';
        document.getElementById('edit-semester').value = userProfileData.semester || '';

        const avatarUrl = userProfileData.avatarUrl || currentUser?.photoURL;
        if (avatarUrl) document.getElementById('edit-profile-preview').src = avatarUrl;
    }
}

// UPLOAD PARA IMGUR DENTRO DO APP
window.uploadToImgur = async (input) => {
    const file = input.files[0];
    if (!file) return;
    const status = document.getElementById('upload-status');
    if (status) status.innerText = "Enviando...";

    try {
        const url = await uploadToImgur(file); // Chama a função helper
        document.getElementById('edit-profile-preview').src = url;
        if (status) status.innerText = "Sucesso!";
        // Guarda temporariamente para salvar depois
        window.tempEditAvatarUrl = url;
    } catch (e) {
        if (status) status.innerText = "Erro no upload.";
        console.error(e);
        alert("Erro ao enviar imagem. Verifique sua conexão.");
    }
};

window.saveProfileChanges = async function () {
    const name = document.getElementById('edit-name').value;
    const username = document.getElementById('edit-username').value;
    const course = document.getElementById('edit-course').value;
    const semester = document.getElementById('edit-semester').value;
    // Usa a URL nova se houve upload, ou mantém a antiga
    const avatarUrl = window.tempEditAvatarUrl || userProfileData.avatarUrl || currentUser?.photoURL;

    if (!name || !username) return alert("Nome e usuário são obrigatórios.");

    if (currentUser) {
        try {
            await setDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'data', 'profile'), {
                name, username, course, semester, avatarUrl, updatedAt: Date.now()
            }, { merge: true });

            alert("Perfil atualizado com sucesso!");
            window.navigateTo('perfil');
        } catch (e) {
            console.error(e);
            alert("Erro ao salvar perfil.");
        }
    }
};

// --- CHAT IA & HISTÓRICO ---
function initChatSystem() {
    if (!currentUser) return;

    // 1. Carregar lista de chats (Histórico)
    const chatsRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'threads');
    const q = query(chatsRef, orderBy('updatedAt', 'desc'), limit(20));

    onSnapshot(q, (snapshot) => {
        const historyList = document.getElementById('history-list');
        if (!historyList) return;
        historyList.innerHTML = '';

        if (snapshot.empty) {
            historyList.innerHTML = '<p class="text-xs text-gray-500 text-center py-4">Nenhum histórico.</p>';
        }

        snapshot.forEach((doc) => {
            const chat = doc.data();
            const isActive = doc.id === activeChatId;
            const dateStr = chat.updatedAt ? new Date(chat.updatedAt).toLocaleDateString() : '';

            historyList.innerHTML += `
                <div class="group flex items-center gap-1 p-1">
                    <div onclick="loadChatSession('${doc.id}')" class="flex-1 p-3 rounded-xl cursor-pointer transition hover:bg-black/5 dark:hover:bg-white/10 ${isActive ? 'bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800' : 'border border-transparent'}">
                        <p class="text-sm font-bold text-slate-800 dark:text-white truncate">${chat.title || 'Nova Conversa'}</p>
                        <p class="text-[10px] text-gray-400 mt-1">${dateStr}</p>
                    </div>
                    <button onclick="deleteChatThread('${doc.id}', event)" class="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition" title="Excluir">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            `;
        });
        if (window.lucide) lucide.createIcons();
    });
}

window.startNewChat = async function () {
    if (!currentUser) return;
    activeChatId = Date.now().toString();
    const container = document.getElementById('chat-messages');
    if (container) container.innerHTML = '';
    addWelcomeMessage();
    currentChatHistory = [];
    window.toggleHistory(false);
    await setDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'threads', activeChatId), {
        title: 'Nova Conversa',
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
    listenToActiveChat();
}

window.loadChatSession = function (chatId) {
    if (activeChatId === chatId) {
        window.toggleHistory(false);
        return;
    }
    activeChatId = chatId;
    currentChatHistory = [];
    listenToActiveChat();
    window.toggleHistory(false);
}

window.deleteChatThread = async function (threadId, event) {
    if (event) event.stopPropagation();
    if (!currentUser) return;
    if (confirm("Excluir esta conversa?")) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'threads', threadId));
        if (activeChatId === threadId) {
            activeChatId = null;
            const container = document.getElementById('chat-messages');
            if (container) container.innerHTML = '';
            addWelcomeMessage();
        }
    }
}

window.toggleHistory = function (show) {
    const drawer = document.getElementById('history-drawer');
    if (show) {
        drawer.classList.remove('translate-x-full');
    } else {
        drawer.classList.add('translate-x-full');
    }
}

function addWelcomeMessage() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    container.innerHTML = `
        <div class="flex gap-3 max-w-[90%] animate-message-pop">
            <div class="w-8 h-8 rounded-full glass-inner flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-auto border border-white/20">
                <i data-lucide="sparkles" class="w-4 h-4"></i>
            </div>
            <div class="chat-bubble-ai p-4 rounded-2xl rounded-bl-sm text-sm leading-relaxed">
                Olá! Eu sou a <strong>OrganizaEdu</strong>. 🧠<br><br>
                Posso <strong>criar notas</strong>, <strong>iniciar o timer</strong>, adicionar aulas e muito mais. Como posso ajudar?
            </div>
        </div>`;
}

function listenToActiveChat() {
    if (chatUnsubscribe) chatUnsubscribe(); // Para de ouvir o chat anterior
    if (!currentUser || !activeChatId) return;

    const messagesRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'threads', activeChatId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'), limit(50));

    chatUnsubscribe = onSnapshot(q, (snapshot) => {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        if (snapshot.empty && container.innerHTML.trim() === '') {
            addWelcomeMessage();
            return;
        }

        if (!snapshot.empty) container.innerHTML = '';
        currentChatHistory = [];

        snapshot.forEach((doc) => {
            const msg = doc.data();
            currentChatHistory.push({ role: msg.role, text: msg.text }); // Guarda para contexto

            const content = msg.type === 'image' ? `<img src="${msg.text}" class="rounded-lg max-h-48 border border-white/20">` : msg.text;

            if (msg.role === 'user') {
                container.innerHTML += `
                    <div class="flex gap-3 max-w-[85%] ml-auto animate-message-pop justify-end mb-4">
                        <div class="chat-bubble-user p-3.5 rounded-2xl rounded-br-sm text-sm leading-relaxed shadow-sm break-words">${content}</div>
                        <div class="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white shrink-0 mt-auto"><i data-lucide="user" class="w-4 h-4"></i></div>
                    </div>`;
            } else {
                const formattedContent = organizaIA ? organizaIA.formatResponse(content) : content;
                container.innerHTML += `
                    <div class="flex gap-3 max-w-[85%] animate-message-pop mb-4">
                        <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-auto border border-white/20"><i data-lucide="sparkles" class="w-4 h-4"></i></div>
                        <div class="chat-bubble-ai p-3.5 rounded-2xl rounded-bl-sm text-sm leading-relaxed shadow-sm break-words">${formattedContent}</div>
                    </div>`;
            }
        });

        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        if (window.lucide) lucide.createIcons();
    });
}

window.setAIProvider = function (provider) {
    currentAIProvider = provider;
    const btnGemini = document.getElementById('btn-ai-gemini');
    const btnGroq = document.getElementById('btn-ai-groq');

    if (provider === 'gemini') {
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

window.sendMessage = async function (textOverride = null, type = 'text') {
    if (!currentUser) return;

    if (!activeChatId) {
        await startNewChat();
        await new Promise(r => setTimeout(r, 100));
    }

    const input = document.getElementById('chat-input');
    const msgText = textOverride || input.value.trim();
    if (!msgText) return;
    if (!textOverride) input.value = '';

    if (organizaIA) {
        // 1. Salva a mensagem do usuário no Firebase
        await addDoc(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'threads', activeChatId, 'messages'), {
            text: msgText, role: 'user', type: type, timestamp: Date.now()
        });

        // 2. Atualiza o título do chat se for o início da conversa
        const threadRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'threads', activeChatId);
        if (currentChatHistory.length < 2) {
            await setDoc(threadRef, { title: msgText.substring(0, 30), updatedAt: Date.now() }, { merge: true });
        } else {
            await setDoc(threadRef, { updatedAt: Date.now() }, { merge: true });
        }

        // --- OTIMIZAÇÃO CRÍTICA PARA MOBILE ---
        // Evita erro de "Sobrecarregada" enviando apenas dados essenciais

        // Pega apenas as 5 últimas notas e corta textos muito longos (max 150 caracteres)
        const optimizedNotes = notesData.slice(0, 5).map(n => ({
            title: n.title,
            content: n.content ? (n.content.length > 150 ? n.content.substring(0, 150) + "..." : n.content) : "",
            date: new Date(n.updatedAt).toLocaleDateString()
        }));

        // Envia apenas tarefas pendentes + 3 últimas concluídas
        const pendingTasks = tasksData.filter(t => !t.done);
        const doneTasks = tasksData.filter(t => t.done).slice(0, 3);
        const optimizedTasks = [...pendingTasks, ...doneTasks];

        // Verifica status do ônibus com segurança
        const nextBusInfo = typeof getNextBusForContext === 'function' ? getNextBusForContext() : "Verificar app";

        // Monta o contexto leve
        const userContext = {
            profile: userProfileData,
            schedule: scheduleData, // Vê todas as aulas
            tasks: tasksData,       // Vê todas as tarefas
            finance: financeData,   // Vê as finanças
            notes: notesData,       // Vê as notas
            grades: gradesData,
            busStatus: typeof getNextBusForContext === 'function' ? getNextBusForContext() : "N/A",
            currentTime: new Date().toLocaleString('pt-BR'),
            currentBudget: monthlyBudget
        };
        // Limita o histórico enviado para a IA (últimas 6 mensagens)
        const limitedHistory = currentChatHistory.slice(-6);

        // 3. Chama a IA
        const result = await organizaIA.processMessage(msgText, userContext, currentAIProvider, limitedHistory);

        // 4. Salva a resposta da IA no Firebase
        await addDoc(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'threads', activeChatId, 'messages'), {
            text: result.text, role: 'ai', type: 'text', timestamp: Date.now() + 100
        });
    }
}
// HELPER: Extrai dados do ônibus para o contexto da IA
function getNextBusForContext() {
    const now = new Date();
    const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    // Busca na lista global busSchedule (definida lá embaixo)
    if (typeof busSchedule === 'undefined') return "Horários indisponíveis";

    const nextTrip = busSchedule.find(b => {
        const [h, m] = b.start.split(':').map(Number);
        return (h * 3600 + m * 60) > currentSeconds;
    });

    if (nextTrip) {
        return `Próximo ônibus sai da ${nextTrip.origin} às ${nextTrip.start} com destino a ${nextTrip.dest} (Rota: ${nextTrip.route})`;
    }
    return "Não há mais ônibus hoje.";
}

// ... existing code (RESTANTE DAS FUNÇÕES DO UI - Manter tudo igual abaixo) ...

window.uploadChatImage = async (input) => {
    const file = input.files[0];
    if (!file) return;
    const status = document.getElementById('chat-upload-status');
    status.classList.remove('hidden');
    try {
        const url = await uploadToImgur(file); // Usa a função helper corrigida
        await sendMessage(url, 'image');
    } catch (error) {
        console.error(error);
        alert('Erro no upload da imagem.');
    } finally {
        status.classList.add('hidden');
        input.value = '';
    }
};

window.openDonationModal = function () {
    const modal = document.getElementById('donation-value-modal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.firstElementChild.classList.remove('scale-95');
        modal.firstElementChild.classList.add('scale-100');
    }, 10);
}

window.closeDonationModal = function () {
    const modal = document.getElementById('donation-value-modal');
    modal.classList.add('opacity-0');
    modal.firstElementChild.classList.remove('scale-100');
    modal.firstElementChild.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

window.selectDonationValue = function (val) {
    selectedDonationAmount = val;
    document.getElementById('custom-donation-input').value = '';
}

window.checkCustomValue = function () {
    const input = document.getElementById('custom-donation-input');
    const val = parseFloat(input.value);
    if (!isNaN(val) && val > 0) {
        selectedDonationAmount = val;
    }
}

window.proceedToCpf = function () {
    const customInput = document.getElementById('custom-donation-input').value;
    if (customInput) selectedDonationAmount = parseFloat(customInput);

    if (selectedDonationAmount < 1) return alert("Valor mínimo de R$ 1,00.");

    window.closeDonationModal();

    window.openCustomInputModal(
        "CPF para o PIX",
        "Apenas números",
        "",
        (cpfValue) => {
            const cleanCpf = cpfValue.replace(/\D/g, '');
            if (cleanCpf.length !== 11) return alert("CPF inválido.");
            processPaymentWithCpf(cleanCpf);
        }
    );
}

async function processPaymentWithCpf(cpf) {
    const modal = document.getElementById('payment-modal');
    const qrImg = document.getElementById('pix-qr-image');
    const loader = document.getElementById('pix-loading');
    const copyInput = document.getElementById('pix-copy-paste');

    if (modal) {
        modal.classList.remove('hidden');
        qrImg.classList.add('opacity-50');
        loader.classList.remove('hidden');
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
                name: userProfileData?.name || "Apoiador",
                email: currentUser?.email,
                cpf: cpf,
                value: selectedDonationAmount
            })
        });

        const data = await response.json();

        if (data.error) throw new Error(data.error);

        currentPaymentId = data.id;

        if (qrImg && data.encodedImage) {
            qrImg.src = `data:image/png;base64,${data.encodedImage}`;
            qrImg.onload = () => {
                qrImg.classList.remove('opacity-50');
                loader.classList.add('hidden');
            };
        }

        if (copyInput) copyInput.value = data.payload;

        if (paymentCheckInterval) clearInterval(paymentCheckInterval);
        paymentCheckInterval = setInterval(checkPaymentStatus, 3000);

    } catch (error) {
        console.error("Erro Pagamento:", error);
        window.closePaymentModal();
        alert("Erro ao gerar PIX: " + error.message);
    }
}

window.closePaymentModal = function () {
    const modal = document.getElementById('payment-modal');
    modal.classList.add('opacity-0');
    modal.firstElementChild.classList.remove('scale-100');
    modal.firstElementChild.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
    if (paymentCheckInterval) clearInterval(paymentCheckInterval);
}

// Função moderna de Copiar
window.copyPixCode = function () {
    const input = document.getElementById('pix-copy-paste');
    const textToCopy = input.value;
    const btnMain = document.getElementById('btn-copy-main');

    // Usa a API Clipboard (mais moderna e segura que execCommand)
    navigator.clipboard.writeText(textToCopy).then(() => {
        // Feedback visual de sucesso
        const originalText = btnMain.innerHTML;

        // Muda o botão para verde
        btnMain.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
        btnMain.classList.add('bg-emerald-500', 'hover:bg-emerald-600');
        btnMain.innerHTML = `<i data-lucide="check" class="w-5 h-5"></i> <span>Copiado com Sucesso!</span>`;

        // Dispara um toast/alerta flutuante
        if (window.showModal) window.showModal("Sucesso", "Código Pix copiado para a área de transferência!");
        else alert("Código Pix Copiado!");

        // Volta ao normal depois de 3 segundos
        setTimeout(() => {
            btnMain.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
            btnMain.classList.remove('bg-emerald-500', 'hover:bg-emerald-600');
            btnMain.innerHTML = originalText;
            if (window.lucide) lucide.createIcons();
        }, 3000);

    }).catch(err => {
        console.error('Erro ao copiar:', err);
        alert("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
    });
}

window.openCustomInputModal = function (title, placeholder, initialValue, onConfirm) {
    const modal = document.getElementById('custom-input-modal');
    if (!modal) return;
    document.getElementById('custom-modal-title').innerText = title;
    const input = document.getElementById('custom-modal-input');
    input.placeholder = placeholder;
    input.value = initialValue;

    const btnConfirm = document.getElementById('custom-modal-confirm');
    const newBtn = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);

    newBtn.onclick = () => {
        const val = input.value;
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
        if (onConfirm) onConfirm(val);
    };

    const btnCancel = document.getElementById('custom-modal-cancel');
    btnCancel.onclick = () => {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    };

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.firstElementChild.classList.remove('scale-95');
        modal.firstElementChild.classList.add('scale-100');
        input.focus();
    }, 10);
}

window.showModal = function (title, message) {
    const m = document.getElementById('generic-modal');
    document.getElementById('generic-modal-title').innerText = title;
    document.getElementById('generic-modal-message').innerText = message;
    m.classList.remove('hidden');
    setTimeout(() => { m.classList.remove('opacity-0'); m.firstElementChild.classList.remove('scale-95'); m.firstElementChild.classList.add('scale-100'); }, 10);
}
window.closeGenericModal = function () {
    const m = document.getElementById('generic-modal');
    m.classList.add('opacity-0'); m.firstElementChild.classList.remove('scale-100'); m.firstElementChild.classList.add('scale-95');
    setTimeout(() => m.classList.add('hidden'), 300);
}

async function saveData() {
    if (currentUser) {
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

window.setWidgetStyle = function (style, save = true) {
    widgetStyle = style;
    if (save) saveData();
    updateWidgetStyleUI();
    if (window.updateNextClassWidget) window.updateNextClassWidget();
};

window.renderSchedule = function () {
    const container = document.getElementById('schedule-container');
    if (!container) return;
    container.innerHTML = '';

    const dayMap = { 'seg': 'Segunda', 'ter': 'Terça', 'qua': 'Quarta', 'qui': 'Quinta', 'sex': 'Sexta', 'sab': 'Sábado' };
    const daysOrder = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

    if (scheduleData.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-400">Nenhuma aula cadastrada.</div>`;
        return;
    }

    daysOrder.forEach(dayKey => {
        const dayClasses = scheduleData.filter(c => c.day === dayKey).sort((a, b) => parseInt(a.start.replace(':', '')) - parseInt(b.start.replace(':', '')));
        if (dayClasses.length > 0) {
            let html = `<div class="mb-4"><h3 class="text-sm font-bold text-indigo-500 uppercase mb-2 ml-1">${dayMap[dayKey]}</h3><div class="space-y-3">`;
            dayClasses.forEach(c => {
                const palette = colorPalettes[c.color] || colorPalettes.indigo;
                html += `
                    <div class="glass-inner p-4 rounded-xl border-l-4 ${palette.border} relative group cursor-pointer" onclick="openEditClassModal('${c.id}')">
                        <div class="flex justify-between">
                            <h4 class="font-bold text-gray-800 dark:text-white">${c.name}</h4>
                            <span class="text-xs font-bold ${palette.badge} px-2 py-1 rounded">${c.start} - ${c.end}</span>
                        </div>
                        <p class="text-xs text-gray-500 mt-1">${c.room} • ${c.prof}</p>
                    </div>`;
            });
            html += `</div></div>`;
            container.innerHTML += html;
        }
    });
};

window.updateNextClassWidget = function () {
    const container = document.getElementById('widget-next-class');
    if (!container) return;

    const now = new Date();
    const daysArr = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    const currentDay = daysArr[now.getDay()];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const todayClasses = scheduleData.filter(c => c.day === currentDay).sort((a, b) => parseInt(a.start.replace(':', '')) - parseInt(b.start.replace(':', '')));

    let nextClass = null;
    let status = "";

    for (let c of todayClasses) {
        const [h, m] = c.start.split(':').map(Number);
        const startMins = h * 60 + m;
        let endMins = startMins + 60;
        if (c.end) { const [hE, mE] = c.end.split(':').map(Number); endMins = hE * 60 + mE; }

        if (currentMinutes < startMins) { nextClass = c; status = 'future'; break; }
        else if (currentMinutes >= startMins && currentMinutes < endMins) { nextClass = c; status = 'now'; break; }
    }

    if (nextClass) {
        const [hS, mS] = nextClass.start.split(':').map(Number);
        const startMins = hS * 60 + mS;
        let endMins = startMins + 60;
        if (nextClass.end) { const [hE, mE] = nextClass.end.split(':').map(Number); endMins = hE * 60 + mE; }

        let timeText = "";
        let progressPercentage = 0;

        if (status === 'future') {
            const diff = startMins - currentMinutes;
            const dh = Math.floor(diff / 60);
            const dm = diff % 60;
            timeText = dh > 0 ? `Em ${dh}h ${dm}m` : `Em ${dm} min`;
        } else {
            timeText = "Agora";
            const totalDuration = endMins - startMins;
            const elapsed = currentMinutes - startMins;
            progressPercentage = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
        }

        container.className = "glass-panel p-4 rounded-[2rem] min-h-[9rem] flex flex-col justify-center text-center active:scale-95 transition hover:shadow-lg group cursor-pointer relative overflow-hidden";

        if (widgetStyle === 'classic') {
            container.className = "glass-panel p-4 rounded-[2rem] min-h-[9rem] flex flex-col justify-between text-left cursor-pointer transition hover:shadow-lg relative overflow-hidden group";
            container.innerHTML = `
                <div class="flex justify-between items-start w-full">
                    <div class="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                        <i data-lucide="graduation-cap" class="w-4 h-4"></i>
                        <span class="text-[10px] font-bold uppercase tracking-wider">${status === 'now' ? 'Em Aula' : 'Próxima'}</span>
                    </div>
                    <span class="text-[9px] font-bold ${status === 'now' ? 'text-green-600 bg-green-100/50 dark:bg-green-900/40' : 'text-orange-600 bg-orange-100/50 dark:bg-orange-900/40'} px-2 py-0.5 rounded-full whitespace-nowrap">${timeText}</span>
                </div>
                <div class="mt-2 text-left w-full">
                    <h4 class="font-bold text-sm text-gray-900 dark:text-white leading-tight mb-0.5 line-clamp-2">${nextClass.name}</h4>
                    <p class="text-[10px] text-gray-500 dark:text-gray-300 truncate flex items-center gap-1"><i data-lucide="user" class="w-3 h-3 inline"></i> ${nextClass.prof || 'Prof.'}</p>
                </div>
                <div class="w-full mt-auto">
                    <div class="flex justify-between text-[9px] text-gray-500 dark:text-gray-400 mb-1 font-medium"><span><i data-lucide="map-pin" class="w-3 h-3 inline mr-0.5"></i>${nextClass.room}</span></div>
                    ${status === 'now' ? `<div class="h-1 w-full bg-gray-200/50 dark:bg-white/10 rounded-full overflow-hidden"><div class="h-full bg-green-500 rounded-full transition-all duration-1000" style="width: ${progressPercentage}%"></div></div>` : `<div class="h-1 w-full bg-indigo-100/50 dark:bg-indigo-900/30 rounded-full"></div>`}
                </div>
            `;
        } else {
            // Estilo Moderno
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-center">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center mb-2 ${status === 'now' ? 'bg-green-100 text-green-600 animate-pulse' : 'bg-blue-100 text-blue-600'}">
                        <i data-lucide="${status === 'now' ? 'play' : 'clock'}" class="w-5 h-5"></i>
                    </div>
                    <h4 class="font-bold text-sm text-gray-800 dark:text-white line-clamp-1">${nextClass.name}</h4>
                    <p class="text-xs text-gray-500">${status === 'now' ? 'Acontecendo agora' : timeText}</p>
                </div>
            `;
        }
    } else {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-center opacity-60">
                <i data-lucide="coffee" class="w-6 h-6 mb-2 text-gray-400"></i>
                <p class="text-xs font-bold text-gray-500">Sem aulas</p>
            </div>
        `;
    }
    if (window.lucide) lucide.createIcons();
}

const timeSlots = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30"];

window.openAddClassModal = function () {
    document.getElementById('modal-title').innerText = "Adicionar Aula";
    document.getElementById('class-id').value = "";
    document.getElementById('class-name').value = "";
    document.getElementById('class-prof').value = "";
    document.getElementById('class-room').value = "";
    document.getElementById('btn-delete-class').classList.add('hidden');

    const startSel = document.getElementById('class-start');
    const endSel = document.getElementById('class-end');
    const opts = timeSlots.map(t => `<option value="${t}">${t}</option>`).join('');
    startSel.innerHTML = opts;
    endSel.innerHTML = opts;
    startSel.value = "07:00";
    autoSetEndTime();
    renderColorPicker();

    toggleModal(true);
}

window.openEditClassModal = function (id) {
    const c = scheduleData.find(x => x.id === id);
    if (!c) return;
    document.getElementById('modal-title').innerText = "Editar Aula";
    document.getElementById('class-id').value = c.id;
    document.getElementById('class-name').value = c.name;
    document.getElementById('class-prof').value = c.prof || "";
    document.getElementById('class-room').value = c.room;
    document.getElementById('class-day').value = c.day;
    const startSel = document.getElementById('class-start');
    const endSel = document.getElementById('class-end');
    startSel.innerHTML = timeSlots.map(t => `<option value="${t}" ${t === c.start ? 'selected' : ''}>${t}</option>`).join('');
    endSel.innerHTML = timeSlots.map(t => `<option value="${t}" ${t === c.end ? 'selected' : ''}>${t}</option>`).join('');
    selectedColor = c.color;
    renderColorPicker();
    document.getElementById('btn-delete-class').classList.remove('hidden');
    toggleModal(true);
}

window.saveClass = function () {
    const id = document.getElementById('class-id').value;
    const name = document.getElementById('class-name').value;
    const prof = document.getElementById('class-prof').value;
    const room = document.getElementById('class-room').value;
    const day = document.getElementById('class-day').value;
    const start = document.getElementById('class-start').value;
    const end = document.getElementById('class-end').value;

    if (!name) return alert("Nome da matéria é obrigatório");

    const newClass = { id: id || Date.now().toString(), name, prof, room, day, start, end, color: selectedColor };

    if (id) {
        const idx = scheduleData.findIndex(x => x.id === id);
        if (idx !== -1) scheduleData[idx] = newClass;
    } else {
        scheduleData.push(newClass);
    }

    saveData();
    toggleModal(false);
    renderSchedule();
}

window.toggleModal = function (show) {
    const modal = document.getElementById('class-modal');
    if (show) {
        modal.classList.remove('hidden');
        setTimeout(() => { modal.classList.remove('opacity-0'); modal.firstElementChild.classList.remove('scale-95'); modal.firstElementChild.classList.add('scale-100'); }, 10);
    } else {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

window.autoSetEndTime = function () {
    const start = document.getElementById('class-start').value;
    const endSel = document.getElementById('class-end');
    const idx = timeSlots.indexOf(start);
    if (idx !== -1 && idx + 2 < timeSlots.length) endSel.value = timeSlots[idx + 2];
}

function renderColorPicker() {
    const container = document.getElementById('color-picker-container');
    container.innerHTML = Object.keys(colorPalettes).map(color => {
        const style = colorPalettes[color];
        const active = selectedColor === color ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-slate-900 scale-110' : '';
        return `<button onclick="window.setColor('${color}')" class="w-8 h-8 rounded-full ${style.bg.split(' ')[0]} border border-gray-200 ${active} transition hover:scale-105"></button>`;
    }).join('');
}

window.setColor = (c) => { selectedColor = c; renderColorPicker(); }

window.requestDeleteClass = () => { classToDeleteId = document.getElementById('class-id').value; toggleModal(false); const modal = document.getElementById('delete-confirm-modal'); modal.classList.remove('hidden'); setTimeout(() => { modal.classList.remove('opacity-0'); modal.firstElementChild.classList.remove('scale-95'); modal.firstElementChild.classList.add('scale-100'); }, 10); }
window.confirmDeleteClass = function () { if (!classToDeleteId) return; scheduleData = scheduleData.filter(x => x.id !== classToDeleteId); saveData(); closeDeleteModal(); }
window.closeDeleteModal = () => { const modal = document.getElementById('delete-confirm-modal'); modal.classList.add('opacity-0'); modal.firstElementChild.classList.remove('scale-100'); modal.firstElementChild.classList.add('scale-95'); setTimeout(() => modal.classList.add('hidden'), 300); classToDeleteId = null; }
window.deleteClass = window.requestDeleteClass;

window.openAddTaskModal = function () {
    const modal = document.getElementById('task-modal');
    modal.classList.remove('hidden');
    setTimeout(() => { modal.classList.remove('opacity-0'); modal.firstElementChild.classList.remove('scale-95'); modal.firstElementChild.classList.add('scale-100'); }, 10);
    document.getElementById('new-task-title').value = '';
    document.getElementById('new-task-date').value = '';
    selectTaskCategory('estudo');
}

window.closeTaskModal = function () {
    const modal = document.getElementById('task-modal');
    modal.classList.add('opacity-0'); modal.firstElementChild.classList.remove('scale-100'); modal.firstElementChild.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

window.selectTaskCategory = function (cat) {
    selectedTaskCategory = cat;
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.classList.add('opacity-50', 'scale-95');
        btn.classList.remove('ring-2', 'ring-offset-1', 'ring-indigo-400');
    });
    const btn = document.getElementById('cat-' + cat);
    btn.classList.remove('opacity-50', 'scale-95');
    btn.classList.add('ring-2', 'ring-offset-1', 'ring-indigo-400');
}

window.confirmAddTask = function () {
    const title = document.getElementById('new-task-title').value;
    const date = document.getElementById('new-task-date').value;
    if (!title.trim()) return alert("Digite o título da tarefa");
    tasksData.unshift({ id: Date.now(), text: title, category: selectedTaskCategory, date: date, done: false });
    saveData();
    closeTaskModal();
}

window.toggleTask = function (id) { const t = tasksData.find(x => x.id === id); if (t) { t.done = !t.done; saveData(); } }
window.deleteTask = function (id) { tasksData = tasksData.filter(x => x.id !== id); saveData(); }

window.setTaskTab = function (tab) {
    currentTaskTab = tab;
    const pendingBtn = document.getElementById('tab-pending');
    const completedBtn = document.getElementById('tab-completed');
    if (tab === 'pending') { pendingBtn.classList.add('tab-active'); pendingBtn.classList.remove('hover:bg-white/10'); completedBtn.classList.remove('tab-active'); completedBtn.classList.add('hover:bg-white/10'); }
    else { completedBtn.classList.add('tab-active'); completedBtn.classList.remove('hover:bg-white/10'); pendingBtn.classList.remove('tab-active'); pendingBtn.classList.add('hover:bg-white/10'); }
    if (window.renderTasks) window.renderTasks();
}

window.renderTasks = function () {
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
        const dateStr = t.date ? new Date(t.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
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

let currentInput = '0';
let isResult = false;
let isRadians = true;

window.appendNumber = function (number) {
    if (isResult) { currentInput = number; isResult = false; }
    else { if (currentInput === '0' && number !== '.') currentInput = number; else currentInput += number; }
    updateDisplay();
}
window.appendOperator = function (op) { isResult = false; currentInput += op; updateDisplay(); }
window.appendConstant = function (c) {
    if (isResult) { currentInput = ''; isResult = false; }
    if (currentInput !== '0' && currentInput !== '') { const last = currentInput.slice(-1); if (!isNaN(last) || last === ')') currentInput += '*'; }
    if (c === 'pi') currentInput += 'π'; if (c === 'e') currentInput += 'e';
    updateDisplay();
}
window.appendFunction = function (fn) {
    if (isResult) { currentInput = ''; isResult = false; }
    if (currentInput === '0') currentInput = '';
    if (currentInput.length > 0) { const last = currentInput.slice(-1); if (!isNaN(last) || last === 'π' || last === 'e' || last === ')') currentInput += '*'; }
    currentInput += fn + '(';
    updateDisplay();
}
window.clearDisplay = function () { currentInput = '0'; document.getElementById('calc-history').textContent = ''; isResult = false; updateDisplay(); }
window.deleteLast = function () {
    if (isResult) { clearDisplay(); return; }
    if (currentInput.length <= 1 || currentInput === 'Error') { currentInput = '0'; } else { currentInput = currentInput.slice(0, -1); }
    updateDisplay();
}
window.factorial = function (n) { if (n < 0 || !Number.isInteger(n)) return NaN; if (n === 0 || n === 1) return 1; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }

window.calculate = function () {
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
    if (display) { display.textContent = currentInput; display.scrollLeft = display.scrollWidth; }
}
window.toggleCalcMode = function () {
    isRadians = !isRadians;
    const btn = document.getElementById('toggleMode');
    if (btn) { btn.textContent = isRadians ? 'RAD' : 'DEG'; btn.classList.toggle('mode-active'); }
}
window.copyToClipboard = function () {
    navigator.clipboard.writeText(currentInput).then(() => {
        const tt = document.getElementById('copyTooltip');
        if (tt) { tt.style.opacity = '1'; setTimeout(() => tt.style.opacity = '0', 1500); }
    });
}

window.openAddTransactionModal = function () {
    const modal = document.getElementById('finance-modal');
    modal.classList.remove('hidden');
    setTimeout(() => { modal.classList.remove('opacity-0'); modal.firstElementChild.classList.remove('scale-95'); modal.firstElementChild.classList.add('scale-100'); }, 10);
}
window.closeFinanceModal = function () {
    const modal = document.getElementById('finance-modal');
    modal.classList.add('opacity-0'); modal.firstElementChild.classList.remove('scale-100'); modal.firstElementChild.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}
window.addTransaction = function () {
    const desc = document.getElementById('fin-desc').value;
    const val = parseFloat(document.getElementById('fin-val').value);
    if (desc && val) {
        financeData.unshift({ id: Date.now(), desc, val, date: new Date().toISOString() });
        saveData();
        closeFinanceModal();
        document.getElementById('fin-desc').value = ''; document.getElementById('fin-val').value = '';
    }
}
window.deleteTransaction = function (id) {
    financeData = financeData.filter(x => x.id !== id);
    saveData();
}

window.setMonthlyBudget = function () {
    window.openCustomInputModal("Definir Orçamento Mensal", "Ex: 800.00", monthlyBudget.toString(), (val) => {
        const budget = parseFloat(val.replace(',', '.'));
        if (!isNaN(budget)) {
            monthlyBudget = budget;
            saveData();
            window.showModal("Sucesso", "Orçamento atualizado!");
        }
    });
}

window.renderFinance = function () {
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

    if (percent > 90) progressBar.className = "h-full bg-red-500 transition-all duration-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]";
    else if (percent > 70) progressBar.className = "h-full bg-yellow-400 transition-all duration-500 shadow-[0_0_10px_rgba(250,204,21,0.5)]";
    else progressBar.className = "h-full bg-white transition-all duration-500 shadow-[0_0_10px_rgba(255,255,255,0.5)]";

    if (financeData.length === 0) {
        list.innerHTML = '<div class="text-center text-gray-400 text-xs py-4 bg-white/20 dark:bg-white/5 rounded-xl border border-white/10">Nenhum gasto registrado.</div>';
    } else {
        financeData.forEach(t => {
            const dateObj = new Date(t.date);
            const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
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

const noteColors = {
    yellow: 'bg-yellow-500/10 dark:bg-yellow-500/5 border-yellow-500/20 text-yellow-700 dark:text-yellow-200 glass-inner',
    green: 'bg-green-500/10 dark:bg-green-500/5 border-green-500/20 text-green-700 dark:text-green-200 glass-inner',
    blue: 'bg-blue-500/10 dark:bg-blue-500/5 border-blue-500/20 text-blue-700 dark:text-blue-200 glass-inner',
    purple: 'bg-purple-500/10 dark:bg-purple-500/5 border-purple-500/20 text-purple-700 dark:text-purple-200 glass-inner',
    pink: 'bg-pink-500/10 dark:bg-pink-500/5 border-pink-500/20 text-pink-700 dark:text-pink-200 glass-inner',
    gray: 'bg-white/10 dark:bg-white/5 border-white/20 text-gray-700 dark:text-gray-300 glass-inner'
};

window.renderNotes = function () {
    const container = document.getElementById('view-notas');
    if (!container) return;

    if (activeNoteId) {
        const note = notesData.find(n => n.id === activeNoteId);
        if (note) {
            const currentColor = note.color || 'gray';
            container.innerHTML = `
                <div class="flex flex-col h-full animate-fade-in p-4">
                    <div class="glass-panel p-6 rounded-[2rem] flex-1 flex flex-col relative shadow-xl overflow-hidden transition-colors duration-500">
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
                        <input type="text" id="note-title-input" value="${note.title}" placeholder="Título da Nota" class="w-full bg-transparent text-3xl font-black outline-none placeholder-gray-400 dark:text-white mb-2" oninput="updateNoteTitle('${note.id}', this.value)">
                        <span class="text-[10px] text-gray-400 font-medium mb-6 flex items-center gap-1">
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
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4 pb-20">
    `;

    if (notesData.length === 0) {
        html += `<div class="col-span-full text-center py-10 text-gray-400"><p>Nenhuma nota criada.</p></div>`;
    } else {
        const sortedNotes = [...notesData].sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return b.updatedAt - a.updatedAt;
        });

        sortedNotes.forEach(note => {
            const date = new Date(note.updatedAt).toLocaleDateString('pt-BR');
            const colorStyle = noteColors[note.color || 'gray'];

            html += `
                <div onclick="openNote('${note.id}')" class="h-full rounded-[1.5rem] p-5 cursor-pointer hover:scale-[1.02] transition shadow-sm border backdrop-blur-md ${colorStyle} relative group flex flex-col justify-between min-h-[140px]">
                    <div>
                        ${note.pinned ? '<div class="absolute top-4 right-4 text-amber-500"><i data-lucide="pin" class="w-4 h-4 fill-current"></i></div>' : ''}
                        <h3 class="font-bold text-lg mb-2 truncate pr-6 leading-tight">${note.title || 'Sem Título'}</h3>
                        <p class="text-xs opacity-70 line-clamp-3 leading-relaxed mb-3 font-medium">${note.content || 'Nova nota...'}</p>
                    </div>
                    <span class="text-[10px] opacity-50 font-bold uppercase tracking-wider block mt-auto">${date}</span>
                </div>
            `;
        });
    }
    html += `</div></div>`;
    container.innerHTML = html;
    lucide.createIcons();
}

window.createNote = function () {
    const id = Date.now().toString();
    notesData.unshift({ id, title: '', content: '', updatedAt: Date.now(), color: 'gray', pinned: false });
    activeNoteId = id;
    saveData();
    window.renderNotes();
}

window.openNote = function (id) {
    activeNoteId = id;
    window.renderNotes();
}

window.closeNote = function () {
    activeNoteId = null;
    saveData();
    window.renderNotes();
}

window.setNoteColor = function (id, color) {
    const note = notesData.find(n => n.id === id);
    if (note) {
        note.color = color;
        saveData();
        window.renderNotes();
    }
}

window.togglePinNote = function (id) {
    const note = notesData.find(n => n.id === id);
    if (note) {
        note.pinned = !note.pinned;
        saveData();
        window.renderNotes();
    }
}

window.updateNoteTitle = function (id, val) {
    const note = notesData.find(n => n.id === id);
    if (note) {
        note.title = val;
        note.updatedAt = Date.now();
        debouncedSave();
    }
}

window.updateNoteContent = function (id, val) {
    const note = notesData.find(n => n.id === id);
    if (note) {
        note.content = val;
        note.updatedAt = Date.now();
        debouncedSave();
    }
}

window.deleteNote = function (id) {
    if (confirm('Excluir esta nota permanentemente?')) {
        notesData = notesData.filter(n => n.id !== id);
        if (activeNoteId === id) activeNoteId = null;
        saveData();
        window.renderNotes();
    }
}

function debouncedSave() {
    const status = document.getElementById('save-status');
    if (status) status.classList.remove('opacity-0');

    clearTimeout(noteSaveTimeout);
    noteSaveTimeout = setTimeout(() => {
        saveData();
        if (status) {
            status.innerText = "• Salvo";
            setTimeout(() => status.classList.add('opacity-0'), 2000);
        }
    }, 1000);
}

let timerInterval, timeLeft = 1500, isRunning = false, timerMode = 'pomodoro';
const modes = { pomodoro: 1500, short: 300, long: 900 };

window.toggleTimer = function () {
    const btn = document.getElementById('btn-timer-start');
    if (isRunning) {
        clearInterval(timerInterval);
        isRunning = false;
        if (btn) {
            btn.classList.remove('bg-red-500', 'hover:bg-red-600');
            btn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
            btn.innerHTML = `<i data-lucide="play" class="w-8 h-8 fill-current"></i>`;
        }
    } else {
        isRunning = true;
        if (btn) {
            btn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
            btn.classList.add('bg-red-500', 'hover:bg-red-600');
            btn.innerHTML = `<i data-lucide="pause" class="w-8 h-8 fill-current"></i>`;
        }

        timerInterval = setInterval(() => {
            if (timeLeft > 0) {
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

window.resetTimer = function () {
    clearInterval(timerInterval);
    isRunning = false;
    timeLeft = modes[timerMode];
    updateTimerDisplay();
    resetTimerUI();
}

function resetTimerUI() {
    const btn = document.getElementById('btn-timer-start');
    if (btn) {
        btn.classList.remove('bg-red-500', 'hover:bg-red-600');
        btn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
        btn.innerHTML = `<i data-lucide="play" class="w-8 h-8 fill-current"></i>`;
        lucide.createIcons();
    }
}

window.setTimerMode = function (mode) {
    timerMode = mode;
    resetTimer();
    const label = document.getElementById('timer-label');
    if (label) label.innerText = mode === 'pomodoro' ? 'Foco' : (mode === 'short' ? 'Curta' : 'Longa');
}

function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    const display = document.getElementById('timer-display');
    const circle = document.getElementById('timer-circle');
    if (display) display.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    if (circle) {
        const total = modes[timerMode];
        const offset = 816 - (timeLeft / total) * 816;
        circle.style.strokeDashoffset = offset;
    }
}

let currentSound = null;
window.toggleSound = function (type) {
    const audio = document.getElementById(`audio-${type}`);
    const card = document.getElementById(`card-${type}`);
    if (!audio) return;

    if (currentSound === type) {
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

function addTime(baseTime, minutesToAdd) { const [h, m] = baseTime.split(':').map(Number); const date = new Date(); date.setHours(h); date.setMinutes(m + minutesToAdd); return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
function createTrip(startTime, endTime, routeType, speed = 'normal') { let stops = []; const factor = speed === 'fast' ? 0.7 : 1.0; if (routeType === 'saida-garagem') stops = [{ loc: 'Garagem', t: 0 }, { loc: 'RU', t: 2 }, { loc: 'Fitotecnia', t: 4 }, { loc: 'Solos', t: 6 }, { loc: 'Pav I', t: 8 }, { loc: 'Biblioteca', t: 10 }, { loc: 'Pav II', t: 12 }, { loc: 'Engenharia', t: 13 }, { loc: 'Portão II', t: 15 }, { loc: 'RU', t: 24 }]; else if (routeType === 'volta-campus') stops = [{ loc: 'RU', t: 0 }, { loc: 'Fitotecnia', t: 2 }, { loc: 'Solos', t: 4 }, { loc: 'Pav I', t: 6 }, { loc: 'Biblioteca', t: 8 }, { loc: 'Pav II', t: 10 }, { loc: 'Engenharia', t: 11 }, { loc: 'Portão II', t: 13 }, { loc: 'RU', t: 22 }]; else if (routeType === 'recolhe') stops = [{ loc: 'RU', t: 0 }, { loc: 'Fitotecnia', t: 2 }, { loc: 'Solos', t: 4 }, { loc: 'Garagem', t: 15 }]; else if (routeType === 'volta-e-recolhe') stops = [{ loc: 'RU', t: 0 }, { loc: 'Pav I', t: 5 }, { loc: 'Biblioteca', t: 6 }, { loc: 'Pav II', t: 8 }, { loc: 'Garagem', t: 25 }]; return { start: startTime, end: endTime, origin: routeType.includes('garagem') ? 'Garagem' : 'Campus', dest: routeType.includes('recolhe') ? 'Garagem' : 'Campus', route: routeType, stops: stops.map(s => ({ loc: s.loc, time: addTime(startTime, Math.round(s.t * factor)) })) }; }
const busSchedule = [createTrip('06:25', '06:50', 'saida-garagem'), createTrip('06:50', '07:10', 'volta-campus', 'fast'), createTrip('07:10', '07:25', 'volta-campus', 'fast'), createTrip('07:25', '07:40', 'volta-campus', 'fast'), createTrip('07:40', '07:55', 'volta-campus', 'fast'), createTrip('07:55', '08:20', 'volta-e-recolhe'), createTrip('09:35', '10:00', 'saida-garagem'), createTrip('10:00', '10:25', 'volta-e-recolhe'), createTrip('11:30', '11:55', 'saida-garagem'), createTrip('11:55', '12:20', 'volta-campus'), createTrip('12:20', '12:45', 'volta-e-recolhe'), createTrip('13:00', '13:25', 'saida-garagem'), createTrip('13:25', '13:45', 'volta-campus'), createTrip('13:45', '14:00', 'volta-campus'), createTrip('14:00', '14:25', 'volta-e-recolhe'), createTrip('15:35', '16:00', 'saida-garagem'), createTrip('16:00', '16:25', 'volta-e-recolhe'), createTrip('17:30', '17:55', 'saida-garagem'), createTrip('17:55', '18:15', 'volta-campus'), createTrip('18:15', '18:40', 'volta-e-recolhe'), createTrip('20:00', '20:20', 'volta-e-recolhe', 'fast'), createTrip('20:40', '21:00', 'volta-e-recolhe', 'fast'), createTrip('21:40', '22:00', 'volta-e-recolhe', 'fast'), createTrip('22:30', '22:50', 'volta-e-recolhe', 'fast')];

function updateBusWidget() {
    const now = new Date();
    const day = now.getDay();
    const timelineContainer = document.getElementById('bus-timeline');

    if (day === 0 || day === 6) {
        if (document.getElementById('bus-next-time')) document.getElementById('bus-next-time').innerText = "OFF";
        if (document.getElementById('bus-status-text')) document.getElementById('bus-status-text').innerText = "FIM DE SEMANA";
        if (document.getElementById('bus-status-dot')) document.getElementById('bus-status-dot').className = "w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm";
        if (document.getElementById('bus-route-desc')) document.getElementById('bus-route-desc').innerHTML = '<i data-lucide="moon" class="w-3 h-3"></i> Bom descanso!';
        if (document.getElementById('bus-progress-bar')) document.getElementById('bus-progress-bar').style.width = "0%";
        if (document.getElementById('bus-eta')) document.getElementById('bus-eta').innerText = "Retorna segunda-feira";
        if (timelineContainer) timelineContainer.innerHTML = '';
        if (window.lucide) lucide.createIcons();
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

    if (!statusText) return;

    if (activeBus) {
        statusText.innerText = "EM TRÂNSITO";
        timeDisplay.innerText = activeBus.end;
        descDisplay.innerHTML = `<i data-lucide="map-pin" class="w-3 h-3 text-indigo-500"></i> Destino: ${activeBus.dest}`;
        const totalDuration = activeBus.endSeconds - activeBus.startSeconds;
        const elapsed = currentTotalSeconds - activeBus.startSeconds;
        const percent = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
        progressBar.style.width = `${percent}%`;
        etaDisplay.innerText = `Chega em aprox. ${Math.ceil((activeBus.endSeconds - currentTotalSeconds) / 60)} min`;

        if (timelineContainer) {
            let html = '<div class="absolute left-[19px] top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-700 z-0"></div>';
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
        etaDisplay.innerText = `Faltam ${hours > 0 ? hours + 'h ' : ''}${minutes}m para sair`;
        if (timelineContainer) timelineContainer.innerHTML = `<div class="text-center text-xs text-gray-400 py-2">Itinerário: ${nextBus.route}</div>`;
    } else {
        statusText.innerText = "ENCERRADO";
        timeDisplay.innerText = "--:--";
        descDisplay.innerText = "Sem mais viagens hoje";
        progressBar.style.width = "0%";
        etaDisplay.innerText = "Volta amanhã às 06:25";
        if (timelineContainer) timelineContainer.innerHTML = '';
    }
    if (window.lucide) lucide.createIcons();
}

function renderBusTable() {
    const tbody = document.getElementById('bus-table-body');
    if (!tbody) return;
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

    if (window.lucide) lucide.createIcons();

    const hash = window.location.hash.replace('#', '') || 'home';
    if (window.navigateTo) window.navigateTo(hash);
});

// --- COLE ISSO NO FINAL DO SEU SCRIPT.JS ---

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
            // Toca um som de sucesso ou exibe mensagem
            if (window.showModal) window.showModal("Pagamento Recebido!", "Muito obrigado pelo seu apoio! ❤️");
            else alert("Pagamento Recebido! Muito obrigado ❤️");
        }
    } catch (e) {
        console.log("Aguardando pagamento...", e);
    }
}

// ============================================================
// --- PWA & SISTEMA OFFLINE ---
// ============================================================

// 1. Gerar Manifesto Dinâmico
const manifest = {
    "name": "OrganizaEdu",
    "short_name": "OrganizaEdu",
    "start_url": ".",
    "display": "standalone",
    "background_color": "#0f172a",
    "theme_color": "#6366f1",
    "orientation": "portrait",
    "icons": [
        { "src": "https://files.catbox.moe/614u86.png", "sizes": "192x192", "type": "image/png" },
        { "src": "https://files.catbox.moe/614u86.png", "sizes": "512x512", "type": "image/png" }
    ]
};
const stringManifest = JSON.stringify(manifest);
const blobManifest = new Blob([stringManifest], { type: 'application/json' });
const manifestURL = URL.createObjectURL(blobManifest);
const pwaManifestLink = document.querySelector('#pwa-manifest');
if (pwaManifestLink) {
    pwaManifestLink.setAttribute('href', manifestURL);
}

// 2. Registrar Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW Registrado!'))
            .catch(err => console.log('SW Falhou:', err));
    });

    // 3. Botão de Instalar (Prompt)
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        const installBtn = document.getElementById('btn-install-pwa');
        if (installBtn) {
            installBtn.classList.remove('hidden'); // Mostra o botão

            installBtn.addEventListener('click', () => {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('Usuário aceitou instalar');
                    }
                    deferredPrompt = null;
                    installBtn.classList.add('hidden');
                });
            });
        }
    });

    // 4. Detecção Online/Offline
    function updateNetworkStatus() {
        const toast = document.getElementById('network-toast');
        if (!toast) return;

        if (navigator.onLine) {
            toast.classList.remove('translate-y-0');
            toast.classList.add('-translate-y-20'); // Esconde

            // Sincroniza dados ao voltar online
            if (typeof initDataSync === 'function' && currentUser) {
                // Pequeno delay para garantir conexão estável
                setTimeout(() => initDataSync(), 1000);
            }
        } else {
            toast.classList.remove('-translate-y-20');
            toast.classList.add('translate-y-0'); // Mostra
        }
    }

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
}