// ============================================================
// منشوراتي - Manshoraty
// common.js - الكود الكامل للواجهة الأمامية (Vanilla JS)
// ============================================================

// ==================== الإعدادات العامة ====================
const API_BASE = window.location.origin;
const POSTS_PER_PAGE = 8;

// ==================== دوال مساعدة ====================

function apiFetch(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    return fetch(`${API_BASE}${url}`, { ...options, headers })
        .then(async (response) => {
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || 'خطأ في الخادم');
            }
            return data;
        });
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatNumber(n) {
    if (n == null) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('globalToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.background = isError ? '#dc2626' : '#1f1f1f';
    toast.style.opacity = '1';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
}

function showProgress(msg, duration = 1500) {
    const t = document.getElementById('progressToast');
    if (!t) return;
    const fill = document.getElementById('progressToastFill');
    document.getElementById('progressText').textContent = msg;
    t.style.opacity = '1';
    fill.style.width = '0%';
    const start = Date.now();
    const iv = setInterval(() => {
        const p = Math.min(100, ((Date.now() - start) / duration) * 100);
        fill.style.width = p + '%';
        if (p >= 100) {
            clearInterval(iv);
            setTimeout(() => { t.style.opacity = '0'; }, 200);
        }
    }, 20);
}

// ==================== حالة التطبيق العامة ====================
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
let currentScreen = 'home';
let allPosts = [];
let page = 0;
let hasMorePosts = true;
let isLoadingPosts = false;
let currentPostCommentsId = null;
let currentPostForDownload = null;
let currentRetweetTarget = null;
let currentProfileUserId = null;
let currentConversationId = null;
let currentChatPartner = null;
let savedPostsSet = new Set(JSON.parse(localStorage.getItem('savedPosts') || '[]'));
let uploadedImageURL = null;
let currentPoll = null;
let currentChallenge = null;
let currentEditingDraftId = null;

// ==================== تهيئة التطبيق ====================
async function initApp() {
    applyTheme();
    setupNavigation();
    setupAuthUI();
    setupGlobalListeners();
    if (currentUser) {
        await refreshCurrentUser();
        updateUserUI();
        loadNotificationsCount();
    }
    showScreen('home');
    loadStories();
    setInterval(loadNotificationsCount, 60000);
}

// ==================== الثيم ====================
function applyTheme() {
    const isDark = localStorage.getItem('darkMode') !== 'false';
    document.body.classList.toggle('light', !isDark);
    document.body.classList.toggle('dark', isDark);
    const btn = document.getElementById('darkModeToggle');
    if (btn) btn.querySelector('i').className = isDark ? 'fas fa-moon' : 'fas fa-sun';
}

function toggleTheme() {
    const isDark = !document.body.classList.contains('dark');
    localStorage.setItem('darkMode', isDark);
    applyTheme();
}

// ==================== التنقل بين الشاشات ====================
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const screen = item.dataset.screen || item.dataset.page;
            showScreen(screen);
        });
    });
}

function showScreen(screen) {
    currentScreen = screen;
    // إخفاء جميع الشاشات
    ['homeScreen', 'profileScreen', 'createScreen', 'messagesScreen', 'settingsScreen', 'reelsScreen', 'notificationsScreen'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    // إظهار الشاشة المطلوبة
    const target = document.getElementById(screen + 'Screen');
    if (target) target.style.display = 'block';

    // تحديث الشريط السفلي
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-screen="${screen}"]`);
    if (activeNav) activeNav.classList.add('active');

    // تحميل بيانات الشاشة
    if (screen === 'home') resetAndLoadFeed();
    else if (screen === 'profile') {
        if (currentUser) renderProfile(currentUser.id);
    }
    else if (screen === 'create') { /* فقط إظهار شاشة الإنشاء */ }
    else if (screen === 'messages') {
        if (currentUser) loadConversations();
        else showToast('سجل الدخول أولاً', true);
    }
    else if (screen === 'settings') {
        if (currentUser) loadSettings();
        else showToast('سجل الدخول أولاً', true);
    }
    else if (screen === 'reels') loadReels();
    else if (screen === 'notifications') {
        if (currentUser) loadNotifications();
        else showToast('سجل الدخول أولاً', true);
    }
}

// ==================== المصادقة و المستخدم ====================
async function refreshCurrentUser() {
    if (!currentUser) return;
    try {
        const user = await apiFetch(`/api/users/${currentUser.id}`);
        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
    } catch (e) { /* تجاهل */ }
}

function saveUser(user) {
    currentUser = user;
    localStorage.setItem('currentUser', JSON.stringify(user));
}

function clearUser() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    updateUserUI();
}

function setupAuthUI() {
    const authBtn = document.getElementById('authBtn');
    if (authBtn) authBtn.addEventListener('click', openAuthModal);
}

function updateUserUI() {
    const area = document.getElementById('userArea');
    if (!area) return;
    if (currentUser) {
        area.innerHTML = `
            <div class="user-menu" id="userMenu">
                <img class="user-avatar-mini" src="${currentUser.avatar || 'https://i.pravatar.cc/30?u=' + currentUser.username}" onerror="this.src='https://i.pravatar.cc/30'">
                <span>${escapeHtml(currentUser.name || currentUser.username)}</span>
                <div class="dropdown">
                    <a href="#" id="profileLink">الملف الشخصي</a>
                    <a href="#" id="settingsLink">الإعدادات</a>
                    <a href="#" id="logoutLink">تسجيل الخروج</a>
                </div>
            </div>`;
        document.getElementById('userMenu').addEventListener('click', function(e) {
            this.classList.toggle('active');
            e.stopPropagation();
        });
        document.getElementById('profileLink').addEventListener('click', e => { e.preventDefault(); showScreen('profile'); });
        document.getElementById('settingsLink').addEventListener('click', e => { e.preventDefault(); showScreen('settings'); });
        document.getElementById('logoutLink').addEventListener('click', e => { e.preventDefault(); clearUser(); showScreen('home'); });
    } else {
        area.innerHTML = `<button id="authBtn" class="btn">دخول</button>`;
        document.getElementById('authBtn').addEventListener('click', openAuthModal);
    }
}

function openAuthModal() {
    document.getElementById('authModal').style.display = 'flex';
    authMode = 'login';
    document.getElementById('authModalTitle').textContent = 'تسجيل الدخول';
    document.getElementById('authSubmitBtn').textContent = 'دخول';
    document.getElementById('switchAuthMode').textContent = 'إنشاء حساب جديد';
}

let authMode = 'login';
document.getElementById('switchAuthMode').addEventListener('click', e => {
    e.preventDefault();
    authMode = authMode === 'login' ? 'register' : 'login';
    document.getElementById('authModalTitle').textContent = authMode === 'register' ? 'إنشاء حساب' : 'تسجيل الدخول';
    document.getElementById('authSubmitBtn').textContent = authMode === 'register' ? 'تسجيل' : 'دخول';
    document.getElementById('switchAuthMode').textContent = authMode === 'register' ? 'تسجيل الدخول' : 'إنشاء حساب جديد';
});

document.getElementById('authSubmitBtn').addEventListener('click', async () => {
    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!username || !password) { showToast('يرجى ملء جميع الحقول', true); return; }
    try {
        if (authMode === 'register') {
            await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
        } else {
            await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        }
        // بعد النجاح، نجلب بيانات المستخدم
        const user = await apiFetch(`/api/users?username=${username}`); // نحتاج نقطة نهاية بديلة، لكننا نستخدم auth مباشرة
        // بما أن auth/login يُرجع user كامل، نستخدمه
        const res = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        saveUser(res);
        updateUserUI();
        document.getElementById('authModal').style.display = 'none';
        showScreen('home');
        showToast('مرحباً بك!');
    } catch (err) {
        showToast(err.message, true);
    }
});

// ==================== التغذية الرئيسية ====================
async function loadFeed(reset = false) {
    if (currentScreen !== 'home') return;
    if (reset) { page = 0; hasMorePosts = true; document.getElementById('feedContainer').innerHTML = ''; }
    if (!hasMorePosts || isLoadingPosts) return;
    isLoadingPosts = true;
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    try {
        const data = await apiFetch(`/api/posts?limit=${POSTS_PER_PAGE}&offset=${page * POSTS_PER_PAGE}`);
        if (data.posts.length === 0) { hasMorePosts = false; isLoadingPosts = false; return; }
        allPosts = reset ? data.posts : [...allPosts, ...data.posts];
        await renderPosts(data.posts, !reset);
        page++;
        hasMorePosts = data.total > page * POSTS_PER_PAGE;
        if (hasMorePosts && loadMoreBtn) loadMoreBtn.style.display = 'block';
        if (reset) loadRecommendations();
    } catch (e) { showToast(e.message, true); }
    isLoadingPosts = false;
}

async function resetAndLoadFeed() {
    page = 0; hasMorePosts = true;
    document.getElementById('feedContainer').innerHTML = '<div class="loading-spinner">جاري التحميل...</div>';
    await loadFeed(true);
}

// التحميل اللانهائي
window.addEventListener('scroll', () => {
    if (currentScreen === 'home' && (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 400) {
        loadFeed();
    }
});

// ==================== عرض المنشورات ====================
async function renderPosts(postsArr, append = false) {
    const container = document.getElementById('feedContainer');
    if (!append) container.innerHTML = '';
    for (const post of postsArr) {
        const liked = currentUser ? await checkLike(post.id) : false;
        const bookmarked = currentUser ? savedPostsSet.has(post.id) : false;
        const cardHTML = buildPostCard(post, liked, bookmarked);
        container.insertAdjacentHTML('beforeend', cardHTML);
    }
    attachPostEvents();
}

function buildPostCard(p, liked, bookmarked) {
    const shortContent = (p.content || '').length > 150 ? p.content.substring(0, 150) + '...' : p.content;
    const retweetIndicator = p.is_retweet ? `<div class="retweet-indicator"><i class="fas fa-retweet"></i> أعيد تغريدها</div>` : '';
    const originalPreview = p.is_retweet && p.original_post ? `
        <div class="original-post-preview">
            <strong>${escapeHtml(p.original_post.author)}</strong>
            <p>${escapeHtml(p.original_post.content?.substring(0, 100))}...</p>
        </div>` : '';
    return `
    <div class="post-card" data-id="${p.id}">
        ${retweetIndicator}
        <div class="post-header">
            <img class="author-avatar" src="${p.author_avatar || 'https://i.pravatar.cc/44?u=' + p.author_id}" onerror="this.src='https://i.pravatar.cc/44'">
            <div class="author-info">
                <span class="author-name">${escapeHtml(p.author)}</span>
                <div class="post-date">${new Date(p.created_at).toLocaleDateString('ar-SA')}</div>
            </div>
        </div>
        ${p.image_url ? `<img class="post-image" src="${p.image_url}" loading="lazy">` : ''}
        ${p.video_url ? `<video class="post-image" controls><source src="${p.video_url}"></video>` : ''}
        <div class="post-content">
            <div class="post-title">${escapeHtml(p.title)}</div>
            <div class="post-text-short">${escapeHtml(shortContent)}</div>
            ${(p.content || '').length > 150 ? `<div class="post-text-full" style="display:none;">${escapeHtml(p.content)}</div><span class="more-btn">أكثر</span>` : ''}
            ${p.tags ? `<div class="post-tags">${p.tags.split(',').map(t => `<span class="hashtag">#${escapeHtml(t.trim())}</span>`).join('')}</div>` : ''}
            ${originalPreview}
        </div>
        <div class="action-bar">
            <button class="action-btn like-btn ${liked ? 'liked' : ''}" data-id="${p.id}">
                <i class="${liked ? 'fas' : 'far'} fa-heart"></i> <span class="count">${formatNumber(p.likes_count)}</span>
            </button>
            <button class="action-btn comment-btn" data-id="${p.id}">
                <i class="far fa-comment"></i> <span>${p.comments_count || 0}</span>
            </button>
            <button class="action-btn retweet-btn" data-id="${p.id}">
                <i class="fas fa-retweet"></i> <span>${formatNumber(p.retweet_count || 0)}</span>
            </button>
            <button class="action-btn bookmark-btn ${bookmarked ? 'bookmarked' : ''}" data-id="${p.id}">
                <i class="${bookmarked ? 'fas' : 'far'} fa-bookmark"></i>
            </button>
            <button class="action-btn gift-btn" data-id="${p.id}">
                <i class="fas fa-gift"></i>
            </button>
            <span class="view-count"><i class="far fa-eye"></i> ${formatNumber(p.view_count)}</span>
        </div>
    </div>`;
}

function attachPostEvents() {
    document.querySelectorAll('.like-btn').forEach(b => b.addEventListener('click', handleLike));
    document.querySelectorAll('.comment-btn').forEach(b => b.addEventListener('click', openCommentsModal));
    document.querySelectorAll('.retweet-btn').forEach(b => b.addEventListener('click', openRetweetModal));
    document.querySelectorAll('.bookmark-btn').forEach(b => b.addEventListener('click', handleBookmark));
    document.querySelectorAll('.gift-btn').forEach(b => b.addEventListener('click', openGiftModalForPost));
    document.querySelectorAll('.more-btn').forEach(b => b.addEventListener('click', function(e) {
        const card = e.target.closest('.post-card');
        card.querySelector('.post-text-short').style.display = 'none';
        card.querySelector('.post-text-full').style.display = 'block';
        e.target.style.display = 'none';
    }));
    // عرض موسع عند الضغط المطول (للتنزيل)
    document.querySelectorAll('.post-card').forEach(card => {
        let timer;
        card.addEventListener('pointerdown', e => {
            if (!e.target.closest('.action-btn')) {
                timer = setTimeout(() => openDownloadOptions(parseInt(card.dataset.id)), 500);
            }
        });
        card.addEventListener('pointerup', () => clearTimeout(timer));
        card.addEventListener('pointerleave', () => clearTimeout(timer));
    });
    // النقر على الصورة/الفيديو لتسجيل مشاهدة
    document.querySelectorAll('.post-image').forEach(el => {
        el.addEventListener('click', e => {
            const postId = parseInt(e.target.closest('.post-card').dataset.id);
            trackView(postId);
        });
    });
}

// ==================== التفاعلات ====================
async function handleLike(e) {
    if (!currentUser) { showToast('سجل الدخول', true); return; }
    const btn = e.currentTarget;
    const postId = parseInt(btn.dataset.id);
    try {
        const res = await apiFetch('/api/likes', {
            method: 'POST',
            body: JSON.stringify({ post_id: postId, user_id: currentUser.id })
        });
        btn.classList.toggle('liked', res.liked);
        btn.querySelector('i').className = res.liked ? 'fas fa-heart' : 'far fa-heart';
        btn.querySelector('.count').textContent = formatNumber(res.likes_count);
    } catch (err) { showToast(err.message, true); }
}

async function handleBookmark(e) {
    if (!currentUser) { showToast('سجل الدخول', true); return; }
    const btn = e.currentTarget;
    const postId = parseInt(btn.dataset.id);
    try {
        const res = await apiFetch('/api/bookmarks', {
            method: 'POST',
            body: JSON.stringify({ post_id: postId, user_id: currentUser.id })
        });
        if (res.bookmarked) {
            savedPostsSet.add(postId);
            btn.classList.add('bookmarked');
            btn.querySelector('i').className = 'fas fa-bookmark';
        } else {
            savedPostsSet.delete(postId);
            btn.classList.remove('bookmarked');
            btn.querySelector('i').className = 'far fa-bookmark';
        }
        localStorage.setItem('savedPosts', JSON.stringify([...savedPostsSet]));
    } catch (err) { showToast(err.message, true); }
}

async function openCommentsModal(e) {
    if (!currentUser) { showToast('سجل الدخول', true); return; }
    const postId = parseInt(e.currentTarget.dataset.id);
    currentPostCommentsId = postId;
    const comments = await apiFetch(`/api/comments/${postId}`);
    const list = document.getElementById('commentsList');
    list.innerHTML = comments.length ? comments.map(c => `
        <div class="comment-item">
            <div class="comment-author">${escapeHtml(c.username)}</div>
            <div class="comment-text">${escapeHtml(c.body)}</div>
        </div>`).join('') : '<div class="empty-state">لا توجد تعليقات</div>';
    document.getElementById('commentSheet').classList.add('open');
    document.getElementById('commentOverlay').classList.add('show');
}

async function submitComment() {
    if (!currentUser || !currentPostCommentsId) return;
    const body = document.getElementById('newCommentText').value.trim();
    if (!body) { showToast('اكتب تعليقاً', true); return; }
    await apiFetch('/api/comments', {
        method: 'POST',
        body: JSON.stringify({ post_id: currentPostCommentsId, user_id: currentUser.id, body })
    });
    document.getElementById('newCommentText').value = '';
    // تحديث التعليقات
    const comments = await apiFetch(`/api/comments/${currentPostCommentsId}`);
    document.getElementById('commentsList').innerHTML = comments.map(c => `
        <div class="comment-item">
            <div class="comment-author">${escapeHtml(c.username)}</div>
            <div class="comment-text">${escapeHtml(c.body)}</div>
        </div>`).join('');
    // تحديث العداد في البطاقة
    const btn = document.querySelector(`.comment-btn[data-id="${currentPostCommentsId}"] span`);
    if (btn) btn.textContent = comments.length;
}

// ==================== إعادة التغريد ====================
function openRetweetModal(e) {
    if (!currentUser) { showToast('سجل الدخول', true); return; }
    const postId = parseInt(e.currentTarget.dataset.id);
    currentRetweetTarget = allPosts.find(p => p.id === postId);
    if (!currentRetweetTarget) return;
    document.getElementById('retweetOriginalPreview').innerHTML = `
        <strong>${escapeHtml(currentRetweetTarget.author)}</strong>
        <p>${escapeHtml(currentRetweetTarget.content?.substring(0, 100))}</p>`;
    document.getElementById('retweetModal').style.display = 'flex';
}

async function doRetweet(quoteText = null) {
    if (!currentUser || !currentRetweetTarget) return;
    try {
        await apiFetch('/api/posts', {
            method: 'POST',
            body: JSON.stringify({
                author_id: currentUser.id,
                author: currentUser.name || currentUser.username,
                title: currentRetweetTarget.title,
                content: quoteText || currentRetweetTarget.content,
                tags: currentRetweetTarget.tags,
                image_url: currentRetweetTarget.image_url,
                video_url: currentRetweetTarget.video_url,
                is_retweet: true,
                retweet_of: currentRetweetTarget.id,
                quote_text: quoteText || null
            })
        });
        document.getElementById('retweetModal').style.display = 'none';
        showToast('تمت إعادة التغريد');
        resetAndLoadFeed();
    } catch (err) { showToast(err.message, true); }
}

// ==================== الهدايا ====================
async function openGiftModalForPost(e) {
    if (!currentUser) { showToast('سجل الدخول', true); return; }
    const postId = parseInt(e.currentTarget.dataset.id);
    currentPostForDownload = { id: postId }; // استغلالاً للمتغير
    const options = await apiFetch('/api/gifts/options');
    const user = await apiFetch(`/api/users/${currentUser.id}`);
    document.getElementById('giftSenderCoins').textContent = user.coins;
    document.getElementById('giftsGrid').innerHTML = options.map(g => `
        <div class="gift-card" onclick="sendGift(${postId}, '${g.id}')">
            <span class="gift-emoji">${g.name}</span>
            <span class="gift-cost">${g.cost} عملة</span>
        </div>`).join('');
    document.getElementById('giftsModal').style.display = 'flex';
}

async function sendGift(postId, giftType) {
    if (!currentUser) return;
    try {
        const res = await apiFetch('/api/gifts/send', {
            method: 'POST',
            body: JSON.stringify({ sender_id: currentUser.id, post_id: postId, gift_type: giftType })
        });
        showToast(`تم إرسال الهدية! رصيدك: ${res.sender_coins}`);
        document.getElementById('giftsModal').style.display = 'none';
    } catch (err) { showToast(err.message, true); }
}

// ==================== المشاهدات ====================
async function trackView(postId) {
    try {
        await apiFetch(`/api/posts/${postId}/view`, { method: 'POST' });
        // تحديث العداد في الواجهة
        const el = document.querySelector(`.post-card[data-id="${postId}"] .view-count`);
        if (el) {
            const current = parseInt(el.textContent.replace(/[^0-9]/g, '')) || 0;
            el.innerHTML = `<i class="far fa-eye"></i> ${formatNumber(current + 1)}`;
        }
    } catch (e) { /* */ }
}

// ==================== القصص ====================
async function loadStories() {
    try {
        const stories = await apiFetch('/api/stories');
        const container = document.getElementById('storiesContainer');
        if (!container) return;
        container.innerHTML = stories.map(s => `
            <div class="story-item" onclick="viewStory('${s.image_url}')">
                <div class="story-ring"><img class="story-avatar" src="${s.avatar || 'https://i.pravatar.cc/54'}" loading="lazy"></div>
                <span class="story-username">${escapeHtml(s.username)}</span>
            </div>`).join('') + `
            <div class="story-item add-story" onclick="addStory()">
                <div class="story-ring add-story"><i class="fas fa-plus" style="color:#fff;"></i></div>
                <span class="story-username">قصتك</span>
            </div>`;
    } catch (e) { /* */ }
}

function viewStory(url) {
    const viewer = document.getElementById('storyViewer');
    const img = document.getElementById('storyImage');
    const progress = document.getElementById('storyProgressFill');
    img.src = url; img.style.display = 'block';
    document.getElementById('storyVideo').style.display = 'none';
    viewer.classList.add('open');
    progress.style.width = '0%';
    const dur = 5000, start = Date.now();
    const iv = setInterval(() => {
        const p = Math.min(100, ((Date.now() - start) / dur) * 100);
        progress.style.width = p + '%';
        if (p >= 100) { clearInterval(iv); viewer.classList.remove('open'); }
    }, 50);
}

async function addStory() {
    if (!currentUser) { showToast('سجل الدخول', true); return; }
    const imageUrl = prompt('أدخل رابط الصورة للقصة:');
    if (!imageUrl) return;
    await apiFetch('/api/stories', {
        method: 'POST',
        body: JSON.stringify({ user_id: currentUser.id, username: currentUser.name || currentUser.username, avatar: currentUser.avatar, image_url: imageUrl })
    });
    showToast('تمت إضافة القصة');
    loadStories();
}

// ==================== الريلز ====================
async function loadReels() {
    const reels = await apiFetch('/api/reels');
    const container = document.getElementById('reelsContainer');
    if (!container) return;
    container.innerHTML = reels.map(r => `
        <div class="reel-item">
            <video src="${r.video_url}" controls></video>
            <div class="reel-info">
                <strong>${escapeHtml(r.author)}</strong>
                <p>${escapeHtml(r.title)}</p>
            </div>
        </div>`).join('');
}

// ==================== الملف الشخصي ====================
async function renderProfile(userId) {
    currentProfileUserId = userId;
    showScreen('profileScreen');
    try {
        const user = await apiFetch(`/api/users/${userId}`);
        const isOwn = currentUser && currentUser.id === userId;
        const following = currentUser && !isOwn ? await checkFollowStatus(userId) : false;
        document.getElementById('profileHeader').innerHTML = `
            <div class="profile-cover"></div>
            <div class="profile-info">
                <img class="profile-avatar" src="${user.avatar || 'https://i.pravatar.cc/150?u=' + user.username}">
                <h2>${escapeHtml(user.name || user.username)}</h2>
                <p class="bio">${escapeHtml(user.bio || '')}</p>
                <div class="profile-stats">
                    <span><strong>${user.postsCount}</strong> منشور</span>
                    <span><strong>${user.followersCount}</strong> متابع</span>
                    <span><strong>${user.followingCount}</strong> يتابع</span>
                </div>
                <div class="profile-actions">
                    ${isOwn ? '<button class="btn" onclick="openEditProfileModal()">تعديل الملف</button>' : ''}
                    ${!isOwn && currentUser ? `<button class="btn follow-btn ${following ? 'following' : ''}" onclick="toggleFollowUser(${userId}, this)">${following ? 'متابَع' : 'متابعة'}</button>` : ''}
                </div>
            </div>`;
        loadUserPosts(userId);
    } catch (e) { showToast(e.message, true); }
}

async function loadUserPosts(userId) {
    const container = document.getElementById('profilePosts');
    if (!container) return;
    container.innerHTML = '<div class="loading-spinner">جاري التحميل...</div>';
    const data = await apiFetch(`/api/posts?author_id=${userId}&limit=20`);
    container.innerHTML = '';
    await renderPosts(data.posts, false, container);
}

async function toggleFollowUser(userId, btn) {
    if (!currentUser) return;
    const res = await apiFetch('/api/follows', {
        method: 'POST',
        body: JSON.stringify({ follower_id: currentUser.id, following_id: userId })
    });
    btn.textContent = res.following ? 'متابَع' : 'متابعة';
    btn.classList.toggle('following', res.following);
    renderProfile(userId); // تحديث الأرقام
}

async function checkFollowStatus(targetId) {
    const data = await apiFetch(`/api/follows/${currentUser.id}/status?targetId=${targetId}`);
    return data.following;
}

function openEditProfileModal() {
    // بسيطة عبر prompt أو يمكن استخدام مودال
    const newName = prompt('الاسم الجديد:', currentUser.name);
    if (newName !== null) {
        apiFetch(`/api/users/${currentUser.id}`, {
            method: 'PUT',
            body: JSON.stringify({ name: newName })
        }).then(user => {
            currentUser.name = user.name;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            renderProfile(currentUser.id);
        });
    }
}

// ==================== الإعدادات ====================
async function loadSettings() {
    if (!currentUser) return;
    const settings = await apiFetch(`/api/users/${currentUser.id}/settings`);
    document.getElementById('settingsName').value = settings.name || '';
    document.getElementById('settingsBio').value = settings.bio || '';
    document.getElementById('settingsTheme').value = settings.preferences?.theme || 'light';
    document.getElementById('settingsPrivacy').value = settings.preferences?.privacy || 'public';
    document.getElementById('notifLikes').checked = settings.preferences?.notifications?.likes !== false;
    document.getElementById('notifComments').checked = settings.preferences?.notifications?.comments !== false;
    document.getElementById('notifFollows').checked = settings.preferences?.notifications?.follows !== false;
    document.getElementById('notifRetweets').checked = settings.preferences?.notifications?.retweets !== false;
    document.getElementById('notifGifts').checked = settings.preferences?.notifications?.gifts !== false;
    document.getElementById('settingsCoins').textContent = settings.coins || 0;
}

async function saveSettings() {
    if (!currentUser) return;
    const preferences = {
        theme: document.getElementById('settingsTheme').value,
        privacy: document.getElementById('settingsPrivacy').value,
        notifications: {
            likes: document.getElementById('notifLikes').checked,
            comments: document.getElementById('notifComments').checked,
            follows: document.getElementById('notifFollows').checked,
            retweets: document.getElementById('notifRetweets').checked,
            gifts: document.getElementById('notifGifts').checked
        }
    };
    const body = {
        name: document.getElementById('settingsName').value,
        bio: document.getElementById('settingsBio').value,
        preferences
    };
    const newPassword = document.getElementById('settingsNewPassword').value;
    if (newPassword) body.password = newPassword;
    await apiFetch(`/api/users/${currentUser.id}/settings`, { method: 'PUT', body: JSON.stringify(body) });
    showToast('تم حفظ الإعدادات');
    if (preferences.theme) {
        localStorage.setItem('darkMode', preferences.theme === 'dark');
        applyTheme();
    }
}

// ==================== المحادثات ====================
async function loadConversations() {
    if (!currentUser) return;
    const convs = await apiFetch(`/api/conversations/${currentUser.id}`);
    const list = document.getElementById('conversationsList');
    if (!list) return;
    list.innerHTML = convs.length === 0 ? '<div class="empty-state">لا توجد محادثات</div>' :
        convs.map(c => `
        <div class="conversation-item" onclick="openChat(${c.id}, ${c.otherUser.id}, '${escapeHtml(c.otherUser.username)}')">
            <img class="conv-avatar" src="${c.otherUser.avatar || 'https://i.pravatar.cc/48'}">
            <div>
                <strong>${escapeHtml(c.otherUser.username)}</strong>
                <p>${escapeHtml(c.last_message || '')}</p>
            </div>
        </div>`).join('');
    document.getElementById('chatView').style.display = 'none';
}

async function openChat(convId, partnerId, partnerName) {
    if (!currentUser) return;
    currentConversationId = convId;
    currentChatPartner = { id: partnerId, name: partnerName };
    document.getElementById('conversationsList').style.display = 'none';
    document.getElementById('chatView').style.display = 'flex';
    document.getElementById('chatPartnerName').textContent = partnerName;
    await refreshMessages();
}

async function refreshMessages() {
    const messages = await apiFetch(`/api/messages/${currentConversationId}`);
    const container = document.getElementById('chatMessages');
    if (!container) return;
    container.innerHTML = messages.map(m => `
        <div class="message ${m.sender_id === currentUser.id ? 'sent' : 'received'}">
            <p>${escapeHtml(m.body)}</p>
            <span class="message-time">${new Date(m.created_at).toLocaleTimeString('ar')}</span>
        </div>`).join('');
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const body = input.value.trim();
    if (!body || !currentConversationId) return;
    await apiFetch('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ conversation_id: currentConversationId, sender_id: currentUser.id, body })
    });
    input.value = '';
    refreshMessages();
}

function backToConversations() {
    document.getElementById('chatView').style.display = 'none';
    document.getElementById('conversationsList').style.display = 'block';
}

// ==================== الإشعارات ====================
async function loadNotifications() {
    if (!currentUser) return;
    const notifs = await apiFetch(`/api/notifications/${currentUser.id}`);
    const list = document.getElementById('notificationsList');
    if (!list) return;
    list.innerHTML = notifs.length === 0 ? '<div class="empty-state">لا توجد إشعارات</div>' :
        notifs.map(n => `<div class="notif-item ${n.read ? '' : 'unread'}">${n.message}</div>`).join('');
    // تعليم الكل كمقروء
    await apiFetch(`/api/notifications/${currentUser.id}/read`, { method: 'PUT' });
    updateNotificationBadge(0);
}

async function loadNotificationsCount() {
    if (!currentUser) return;
    try {
        const notifs = await apiFetch(`/api/notifications/${currentUser.id}`);
        const unread = notifs.filter(n => !n.read).length;
        updateNotificationBadge(unread);
    } catch (e) { /* */ }
}

function updateNotificationBadge(count) {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    if (count > 0) {
        badge.style.display = 'block';
        badge.textContent = count;
    } else {
        badge.style.display = 'none';
    }
}

// ==================== التوصيات ====================
async function loadRecommendations() {
    if (!currentUser) return;
    try {
        const recs = await apiFetch(`/api/recommendations/${currentUser.id}`);
        const row = document.getElementById('recommendedRow');
        if (!row) return;
        row.innerHTML = recs.slice(0, 4).map(p => `
            <div class="rec-card" onclick="location.href='#'">
                <strong>${escapeHtml(p.title)}</strong>
                <small>${escapeHtml(p.author)}</small>
            </div>`).join('');
        document.getElementById('recommendedSection').style.display = recs.length ? 'block' : 'none';
    } catch (e) { /* */ }
}

// ==================== إنشاء منشور ====================
async function publishPost() {
    if (!currentUser) { showToast('سجل الدخول', true); return; }
    const title = document.getElementById('postTitle').value.trim();
    const content = document.getElementById('editorContent').innerText.trim();
    if (!title || !content) { showToast('العنوان والمحتوى مطلوبان', true); return; }
    const tags = document.getElementById('postTags')?.value || '';
    const category = document.getElementById('postCategory')?.value || 'أخرى';
    let image_url = uploadedImageURL || '';
    // رفع صورة إذا كانت blob
    if (document.getElementById('postImageFile').files[0]) {
        image_url = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(document.getElementById('postImageFile').files[0]);
        });
    }
    try {
        await apiFetch('/api/posts', {
            method: 'POST',
            body: JSON.stringify({
                author_id: currentUser.id,
                author: currentUser.name || currentUser.username,
                title, content, tags, image_url,
                category
            })
        });
        showToast('تم النشر!');
        resetCreateForm();
        showScreen('home');
    } catch (err) { showToast(err.message, true); }
}

function resetCreateForm() {
    document.getElementById('postTitle').value = '';
    document.getElementById('editorContent').innerText = '';
    uploadedImageURL = null;
    document.getElementById('imagePreview').style.display = 'none';
}

// ==================== تحميل الصور ====================
document.getElementById('postImageFile')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = ev => {
            uploadedImageURL = ev.target.result;
            document.getElementById('imagePreview').src = ev.target.result;
            document.getElementById('imagePreview').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

// ==================== مستمعي الأحداث العامة ====================
function setupGlobalListeners() {
    document.getElementById('darkModeToggle')?.addEventListener('click', toggleTheme);
    document.getElementById('publishBtn')?.addEventListener('click', publishPost);
    document.getElementById('draftBtn')?.addEventListener('click', saveAsDraft);
    document.getElementById('showDraftsBtn')?.addEventListener('click', showDrafts);
    document.getElementById('submitCommentBtn')?.addEventListener('click', submitComment);
    document.getElementById('retweetDirectBtn')?.addEventListener('click', () => doRetweet(null));
    document.getElementById('retweetQuoteBtn')?.addEventListener('click', () => {
        const quote = document.getElementById('retweetQuoteText').value.trim();
        if (!quote) { showToast('أضف تعليقاً', true); return; }
        doRetweet(quote);
    });
    document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);
    document.getElementById('sendMessageBtn')?.addEventListener('click', sendMessage);
    document.getElementById('messageInput')?.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });
    document.getElementById('backToConversations')?.addEventListener('click', backToConversations);
    document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', () => {
        btn.closest('.modal').style.display = 'none';
    }));
    window.addEventListener('click', e => { if (e.target.classList.contains('modal')) e.target.style.display = 'none'; });
}

// ==================== المسودات (محلية) ====================
function getDrafts() { return JSON.parse(localStorage.getItem('drafts') || '[]'); }
function saveDrafts(d) { localStorage.setItem('drafts', JSON.stringify(d)); }
function saveAsDraft() {
    const title = document.getElementById('postTitle').value;
    const content = document.getElementById('editorContent').innerText;
    if (!title && !content) { showToast('لا يوجد محتوى', true); return; }
    const drafts = getDrafts();
    drafts.push({ id: Date.now(), title, content, image: uploadedImageURL, updatedAt: new Date().toISOString() });
    saveDrafts(drafts);
    showToast('تم حفظ المسودة');
}
function showDrafts() {
    const drafts = getDrafts();
    const container = document.getElementById('draftsList');
    if (!container) return;
    container.innerHTML = drafts.length === 0 ? '<div class="empty-state">لا مسودات</div>' :
        drafts.map(d => `<div style="padding:10px;border-bottom:1px solid #333;" onclick="loadDraft(${d.id})">${escapeHtml(d.title || 'بدون عنوان')}</div>`).join('');
    document.getElementById('draftsSheet').classList.add('open');
    document.getElementById('draftsOverlay').classList.add('show');
}
function loadDraft(id) {
    const drafts = getDrafts();
    const draft = drafts.find(d => d.id === id);
    if (!draft) return;
    document.getElementById('postTitle').value = draft.title;
    document.getElementById('editorContent').innerText = draft.content;
    if (draft.image) {
        uploadedImageURL = draft.image;
        document.getElementById('imagePreview').src = draft.image;
        document.getElementById('imagePreview').style.display = 'block';
    }
    document.getElementById('draftsSheet').classList.remove('open');
    document.getElementById('draftsOverlay').classList.remove('show');
    showScreen('create');
}

// ==================== وظائف مساعدة للتحميل ====================
function openDownloadOptions(postId) {
    currentPostForDownload = allPosts.find(p => p.id === postId);
    if (!currentPostForDownload) return;
    document.getElementById('downloadSheet').classList.add('open');
    document.getElementById('downloadOverlay').classList.add('show');
}
document.getElementById('downloadImageOption')?.addEventListener('click', () => {
    if (currentPostForDownload?.image_url) {
        const a = document.createElement('a');
        a.href = currentPostForDownload.image_url;
        a.download = 'image.jpg';
        a.click();
    }
    closeDownload();
});
document.getElementById('downloadPdfOption')?.addEventListener('click', () => {
    if (!currentPostForDownload) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text(currentPostForDownload.title, 10, 10);
    doc.text(currentPostForDownload.content, 10, 20);
    doc.save('post.pdf');
    closeDownload();
});
function closeDownload() {
    document.getElementById('downloadSheet').classList.remove('open');
    document.getElementById('downloadOverlay').classList.remove('show');
}

// ==================== تهيئة نهائية ====================
document.addEventListener('DOMContentLoaded', initApp);
