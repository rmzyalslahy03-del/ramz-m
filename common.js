// ==================== Ramz-X Common.js (Standalone API Version) ====================
const API_BASE = window.location.origin;

// ---------- API Helper ----------
function apiFetch(url, options = {}) {
    const token = localStorage.getItem('ramz_token');
    const headers = { ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    return fetch(`${API_BASE}${url}`, { ...options, headers })
        .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'خطأ في الخادم');
            return data;
        });
}

// ---------- Utility Functions ----------
function showToast(msg, duration = 2500) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function formatNumberShort(num) {
    if (!num || num === 0) return '0';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'الآن';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' دقائق';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' ساعات';
    if (seconds < 604800) return Math.floor(seconds / 86400) + ' أيام';
    return new Date(date).toLocaleDateString('ar');
}

function addRipple(e, element) {
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
    element.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
}

// ---------- Global State ----------
let currentUser = JSON.parse(localStorage.getItem('ramz_user'));
let currentProfileId = null;
let feedPosts = [];
let hasMore = true;
let isLoading = false;
let lastCursor = null;
let currentCommentPostId = null;
let replyingToCommentId = null;
let tempImage = null;
let currentSharePostId = null;
let currentScreen = 'feed';
let isAuthMode = 'login';
let searchTimeout = null;
let currentConversation = null;
let conversationsAll = [];
let currentInboxTab = 'all';
let pinnedConversations = JSON.parse(localStorage.getItem('pinnedConvs') || '[]');
let unreadNotifications = 0;
let notifications = [];
let activeFeedTab = 'all';
let currentStoryIndex = 0;
let stories = [];
let storyTimer = null;

// ---------- Auth ----------
async function signUp(email, password, username) {
    const data = await apiFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, username }) });
    localStorage.setItem('ramz_token', data.token);
    currentUser = data.user;
    localStorage.setItem('ramz_user', JSON.stringify(data.user));
    return data.user;
}

async function signIn(email, password) {
    const data = await apiFetch('/api/auth/signin', { method: 'POST', body: JSON.stringify({ email, password }) });
    localStorage.setItem('ramz_token', data.token);
    currentUser = data.user;
    localStorage.setItem('ramz_user', JSON.stringify(data.user));
    return data.user;
}

async function signOut() {
    localStorage.removeItem('ramz_token');
    localStorage.removeItem('ramz_user');
    currentUser = null;
    updateProfileUI();
    refreshFeed();
    showToast('👋 تم تسجيل الخروج');
}

async function loadUserProfile(userId) {
    const data = await apiFetch(`/api/profiles/${userId}`);
    return data;
}

function openAuthModal() { document.getElementById('authModal').classList.add('open'); updateAuthModalUI(); }
function closeAuthModal() { document.getElementById('authModal').classList.remove('open'); }

function updateAuthModalUI() {
    const title = document.getElementById('authModalTitle');
    const submitBtn = document.getElementById('authSubmitBtn');
    const switchEl = document.getElementById('authSwitch');
    const emailInput = document.getElementById('authEmail');
    const usernameInput = document.getElementById('authUsername');
    if (isAuthMode === 'login') {
        title.textContent = '👋 تسجيل الدخول';
        submitBtn.textContent = 'تسجيل الدخول';
        switchEl.innerHTML = 'ليس لديك حساب؟ <span>سجل الآن</span>';
        emailInput.style.display = 'block';
        usernameInput.style.display = 'none';
    } else {
        title.textContent = '🚀 إنشاء حساب جديد';
        submitBtn.textContent = 'إنشاء حساب';
        switchEl.innerHTML = 'لديك حساب بالفعل؟ <span>تسجيل الدخول</span>';
        emailInput.style.display = 'block';
        usernameInput.style.display = 'block';
    }
}

async function handleAuth() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value.trim();
    const username = document.getElementById('authUsername').value.trim();
    if (!email || !password) { showToast('⚠️ يرجى إدخال البريد وكلمة المرور'); return; }
    let user;
    try {
        if (isAuthMode === 'login') {
            user = await signIn(email, password);
        } else {
            if (!username) { showToast('⚠️ اسم المستخدم مطلوب'); return; }
            user = await signUp(email, password, username);
        }
        if (user) {
            updateProfileUI();
            refreshFeed();
            closeAuthModal();
            loadNotifications();
            loadConversations();
        }
    } catch (err) { showToast('❌ ' + err.message); }
}

function updateProfileUI() {
    if (currentUser) {
        document.getElementById('profileName').textContent = currentUser.username;
        document.getElementById('profileBio').textContent = currentUser.bio || '';
        document.getElementById('profileAvatar').src = currentUser.avatar_url || 'https://via.placeholder.com/200';
        const badgesContainer = document.getElementById('profileBadges');
        badgesContainer.innerHTML = '';
        if (currentUser.verified) badgesContainer.innerHTML += '<span class="badge-item" title="موثق">✅</span>';
        if (currentUser.top_contributor) badgesContainer.innerHTML += '<span class="badge-item" title="مساهم مميز">🏆</span>';
        const followBtn = document.getElementById('followBtn');
        if (currentProfileId && currentProfileId !== currentUser.id) {
            followBtn.style.display = 'inline-block';
            checkFollowStatus(currentProfileId);
        } else {
            followBtn.style.display = 'none';
        }
    }
}

// ---------- Navigation ----------
function navigateTo(screen, profileId = null) {
    document.querySelectorAll('#feedScreen, #searchScreen, #profileScreen, #createScreen, #inboxScreen, #notificationsScreen').forEach(s => {
        s.style.display = 'none';
        s.classList.remove('active-screen', 'active');
    });
    const map = { feed: 'feedScreen', search: 'searchScreen', profile: 'profileScreen', create: 'createScreen', inbox: 'inboxScreen', notifications: 'notificationsScreen' };
    const activeId = map[screen];
    if (activeId) {
        const el = document.getElementById(activeId);
        if (el) { el.style.display = 'block'; el.classList.add(screen === 'feed' ? 'active-screen' : 'active'); }
    }
    currentScreen = screen;
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.screen === screen) item.classList.add('active');
    });
    if (screen === 'search') document.getElementById('searchInput').focus();
    if (screen === 'profile') {
        if (!currentUser) { openAuthModal(); return; }
        if (profileId) {
            currentProfileId = profileId;
            loadUserProfile(profileId).then(profile => {
                currentUser = profile;
                updateProfileUI();
                loadUserPosts(profileId);
            });
        } else {
            currentProfileId = currentUser.id;
            updateProfileUI();
            loadUserPosts(currentUser.id);
        }
    }
    if (screen === 'create' && !currentUser) { openAuthModal(); return; }
    if (screen === 'inbox' && !currentUser) { openAuthModal(); return; }
    if (screen === 'inbox') { showInboxList(); loadConversations(); }
    if (screen === 'notifications') loadNotifications();
    if (screen === 'feed') loadStories();
}

// ---------- Stories ----------
async function loadStories() {
    try {
        const data = await apiFetch('/api/stories');
        stories = data.data || [];
        renderStoriesRow();
    } catch (e) {}
}

function renderStoriesRow() {
    const row = document.getElementById('storiesRow');
    let html = `<div class="story-item story-add" onclick="createStory()"><div class="story-ring"><span>+</span></div><div class="story-username">أضف قصة</div></div>`;
    stories.forEach(story => {
        html += `<div class="story-item" onclick="openStoryViewer('${story.id}')">
            <div class="story-ring"><img class="story-avatar" src="${story.user?.avatar_url || 'https://via.placeholder.com/200'}" alt="${story.user?.username}"></div>
            <div class="story-username">${story.user?.username}</div>
        </div>`;
    });
    row.innerHTML = html;
}

async function createStory() {
    if (!currentUser) { openAuthModal(); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('media', file);
        await apiFetch('/api/stories', { method: 'POST', body: formData, headers: {} });
        showToast('✅ تم نشر القصة');
        loadStories();
    };
    input.click();
}

function openStoryViewer(storyId) {
    const story = stories.find(s => s.id === storyId);
    if (!story) return;
    currentStoryIndex = stories.indexOf(story);
    const viewer = document.getElementById('storiesViewer');
    viewer.style.display = 'flex';
    const progressBar = document.getElementById('storyProgressBarInner');
    progressBar.style.animation = 'none';
    progressBar.offsetHeight;
    progressBar.style.animation = 'storyProgress 5s linear forwards';
    document.getElementById('storyContent').innerHTML = story.media_url.match(/\.(mp4|mov)/i)
        ? `<video src="${story.media_url}" autoplay muted playsinline onended="nextStory()"></video>`
        : `<img src="${story.media_url}" alt="قصة">`;
    document.getElementById('storyReplyInput').value = '';
    clearTimeout(storyTimer);
    storyTimer = setTimeout(() => nextStory(), 5000);
}

function closeStoryViewer() {
    document.getElementById('storiesViewer').style.display = 'none';
    clearTimeout(storyTimer);
}

function nextStory() {
    if (currentStoryIndex < stories.length - 1) {
        currentStoryIndex++;
        openStoryViewer(stories[currentStoryIndex].id);
    } else {
        closeStoryViewer();
    }
}

async function sendStoryReply() {
    if (!currentUser) { openAuthModal(); return; }
    const text = document.getElementById('storyReplyInput').value.trim();
    if (!text) return;
    const story = stories[currentStoryIndex];
    await apiFetch(`/api/stories/${story.id}/reply`, { method: 'POST', body: JSON.stringify({ text }) });
    showToast('✅ تم إرسال الرد');
    document.getElementById('storyReplyInput').value = '';
}

// ---------- Feed ----------
function setActiveFeedTab(tab) {
    activeFeedTab = tab;
    document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.feed-tab[data-feed="${tab}"]`).classList.add('active');
    refreshFeed();
}

async function fetchFeedPage(limit = 10) {
    const query = new URLSearchParams();
    query.set('limit', limit);
    if (activeFeedTab === 'following') query.set('feed', 'following');
    if (lastCursor) query.set('cursor', lastCursor);
    const data = await apiFetch(`/api/posts?${query.toString()}`);
    if (!data.data || data.data.length < limit) hasMore = false;
    if (data.data && data.data.length) lastCursor = data.nextCursor;
    return data.data || [];
}

async function refreshFeed() {
    lastCursor = null;
    hasMore = true;
    feedPosts = [];
    const posts = await fetchFeedPage(10);
    feedPosts = posts;
    renderFeedPage(posts, false);
    document.getElementById('infiniteLoader').style.display = hasMore ? 'flex' : 'none';
}

async function loadMore() {
    if (isLoading || !hasMore) return;
    isLoading = true;
    document.getElementById('infiniteLoader').style.display = 'flex';
    const newPosts = await fetchFeedPage(10);
    if (newPosts.length) { feedPosts.push(...newPosts); renderFeedPage(newPosts, true); }
    isLoading = false;
    document.getElementById('infiniteLoader').style.display = hasMore ? 'flex' : 'none';
}

function renderFeedPage(posts, append = false) {
    const container = document.getElementById('feedContainer');
    if (!posts.length && !append) {
        container.innerHTML = '<div class="empty-state"><i class="far fa-newspaper"></i><p>لا توجد منشورات</p></div>';
        return;
    }
    let html = '';
    for (let p of posts) {
        html += `<div class="post-card ${p.is_pinned ? 'pinned' : ''}" data-id="${p.id}">
            ${p.is_pinned ? '<div class="pin-badge"><i class="fas fa-thumbtack"></i> مثبت</div>' : ''}
            <div class="post-header" onclick="navigateTo('profile', '${p.author_id}')">
                <img class="author-avatar" src="${p.author?.avatar_url || 'https://via.placeholder.com/200'}" alt="${escapeHtml(p.author?.username)}" loading="lazy" onload="this.classList.add('loaded')">
                <div class="author-info">
                    <span class="author-name">${escapeHtml(p.author?.username)}</span>
                    ${p.author?.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : ''}
                    ${p.author?.top_contributor ? '<i class="fas fa-star" style="color:gold;"></i>' : ''}
                </div>
                <button class="post-menu-btn" onclick="event.stopPropagation();showPostMenu('${p.id}')"><i class="fas fa-ellipsis-h"></i></button>
            </div>
            ${p.image_url ? `<img class="post-image" src="${p.image_url}" loading="lazy" onload="this.classList.add('loaded')" ondblclick="doubleTapLike('${p.id}', this)" onclick="openFullscreen('${p.id}')">` : ''}
            ${p.video_url ? `<video class="post-video" src="${p.video_url}" controls preload="metadata"></video>` : ''}
            ${p.audio_url ? `<audio class="post-audio" src="${p.audio_url}" controls></audio>` : ''}
            <div class="post-content">
                <div class="post-title">${escapeHtml(p.title)} <span class="category-badge">${escapeHtml(p.category)}</span></div>
                <div class="post-text" id="post-text-${p.id}">${escapeHtml(p.content || '').substring(0, 150)}</div>
                ${(p.content || '').length > 150 ? `<span class="more-btn" onclick="toggleFullText('${p.id}')">...عرض المزيد</span>` : ''}
                ${p.hashtag ? `<div class="hashtag" onclick="searchByHashtag('${escapeHtml(p.hashtag)}')">#${escapeHtml(p.hashtag)}</div>` : ''}
                ${p.location ? `<div class="location"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(p.location)}</div>` : ''}
            </div>
            <div class="actions-bar">
                <button class="action-btn like-btn" data-id="${p.id}" onclick="handleLike(this, event)"><span class="number">${formatNumberShort(p.likes_count)}</span><i class="far fa-heart"></i></button>
                <button class="action-btn comment-btn" data-id="${p.id}" onclick="openComments('${p.id}')"><span class="number">${formatNumberShort(p.comments_count)}</span><i class="far fa-comment"></i></button>
                <button class="action-btn share-btn" data-id="${p.id}" onclick="handleRepost(this, event)"><span class="number">${formatNumberShort(p.reposts_count)}</span><i class="far fa-share-square"></i></button>
                <button class="action-btn save-btn" data-id="${p.id}" onclick="handleSave(this, event)"><span class="number">${formatNumberShort(p.favorites_count)}</span><i class="far fa-bookmark"></i></button>
                <button class="action-btn pin-btn" data-id="${p.id}" onclick="togglePinPost('${p.id}')"><i class="fas fa-thumbtack"></i></button>
            </div>
        </div>`;
    }
    if (append) container.insertAdjacentHTML('beforeend', html);
    else container.innerHTML = html;
    if (!append) setupIntersectionObserver();
}

function setupIntersectionObserver() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const postId = entry.target.dataset.id;
                if (postId && !entry.target.dataset.viewed) {
                    entry.target.dataset.viewed = 'true';
                    apiFetch(`/api/posts/${postId}/view`, { method: 'POST' });
                }
            }
        });
    }, { threshold: 0.5 });
    document.querySelectorAll('.post-card').forEach(card => observer.observe(card));
}

async function togglePinPost(postId) {
    if (!currentUser) { openAuthModal(); return; }
    const res = await apiFetch(`/api/posts/${postId}/pin`, { method: 'POST' });
    showToast(res.is_pinned ? '📌 تم تثبيت المنشور' : '📌 تم إلغاء التثبيت');
    refreshFeed();
}

// ---------- Actions ----------
async function handleLike(btn, event) {
    if (!currentUser) { openAuthModal(); return; }
    if (event) addRipple(event, btn);
    const postId = btn.dataset.id;
    const res = await apiFetch(`/api/posts/${postId}/like`, { method: 'POST' });
    const countSpan = btn.querySelector('.number');
    const icon = btn.querySelector('i');
    btn.classList.toggle('liked', res.liked);
    icon.className = res.liked ? 'fas fa-heart' : 'far fa-heart';
    countSpan.textContent = formatNumberShort(res.likes_count);
}

function doubleTapLike(postId, imgElement) {
    if (!currentUser) { openAuthModal(); return; }
    const heart = document.createElement('div');
    heart.className = 'double-tap-heart';
    heart.innerHTML = '❤️';
    const card = imgElement.closest('.post-card');
    card.appendChild(heart);
    setTimeout(() => heart.remove(), 800);
    const btn = card.querySelector('.like-btn');
    if (btn && !btn.classList.contains('liked')) handleLike(btn, null);
}

async function handleSave(btn, event) {
    if (!currentUser) { openAuthModal(); return; }
    if (event) addRipple(event, btn);
    const postId = btn.dataset.id;
    const res = await apiFetch(`/api/posts/${postId}/save`, { method: 'POST' });
    const countSpan = btn.querySelector('.number');
    const icon = btn.querySelector('i');
    btn.classList.toggle('saved', res.saved);
    icon.className = res.saved ? 'fas fa-bookmark' : 'far fa-bookmark';
    countSpan.textContent = formatNumberShort(res.favorites_count);
}

async function handleRepost(btn, event) {
    if (!currentUser) { openAuthModal(); return; }
    if (event) addRipple(event, btn);
    const postId = btn.dataset.id;
    const res = await apiFetch(`/api/posts/${postId}/repost`, { method: 'POST' });
    const countSpan = btn.querySelector('.number');
    const icon = btn.querySelector('i');
    btn.classList.toggle('reposted', res.reposted);
    icon.className = res.reposted ? 'fas fa-share-square' : 'far fa-share-square';
    countSpan.textContent = formatNumberShort(res.reposts_count);
    showToast(res.reposted ? '🔁 تمت إعادة النشر' : '↩️ تم إلغاء إعادة النشر');
}

function toggleFullText(postId) {
    const textEl = document.getElementById(`post-text-${postId}`);
    if (textEl) textEl.style.maxHeight = textEl.style.maxHeight === 'none' ? '80px' : 'none';
}

// ---------- Comments ----------
async function openComments(postId) {
    if (!currentUser) { openAuthModal(); return; }
    currentCommentPostId = postId;
    replyingToCommentId = null;
    document.getElementById('newCommentInput').placeholder = 'اكتب تعليقاً...';
    await renderCommentsForPost(postId);
    document.getElementById('commentsSheet').classList.add('open');
}

async function renderCommentsForPost(postId) {
    const container = document.getElementById('sheetCommentsList');
    container.innerHTML = '<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-pulse"></i></div>';
    const data = await apiFetch(`/api/posts/${postId}/comments`);
    const comments = data.data || [];
    document.getElementById('sheetCommentsCount').innerText = comments.length;
    if (!comments.length) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">💬 كن أول من يعلق!</div>';
        return;
    }
    let html = '';
    for (let c of comments) {
        html += `<div class="comment-item" data-comment-id="${c.id}">
            <div class="comment-main">
                <img src="${c.user?.avatar_url || 'https://via.placeholder.com/36'}" class="comment-avatar" loading="lazy">
                <div class="comment-content">
                    <div class="comment-author">${escapeHtml(c.user?.username || 'مستخدم')}</div>
                    <div class="comment-text">${escapeHtml(c.text || '')}</div>
                    ${c.image_url ? `<img src="${c.image_url}" class="comment-image-preview" loading="lazy">` : ''}
                    <div class="comment-time">${timeAgo(c.created_at)}</div>
                </div>
            </div>
            <div class="comment-actions">
                <span class="comment-action like-comment" data-id="${c.id}" onclick="toggleCommentLike('${c.id}', this)"><i class="far fa-heart"></i> ${c.likes_count || 0}</span>
                <span class="comment-action" onclick="replyToComment('${c.id}')"><i class="far fa-comment"></i> رد</span>
            </div>
        </div>`;
    }
    container.innerHTML = html;
}

function replyToComment(commentId) {
    replyingToCommentId = commentId;
    const input = document.getElementById('newCommentInput');
    input.placeholder = 'كتابة رد...';
    input.focus();
}

async function toggleCommentLike(commentId, el) {
    if (!currentUser) { openAuthModal(); return; }
    const res = await apiFetch(`/api/comments/${commentId}/like`, { method: 'POST' });
    el.classList.toggle('liked', res.liked);
    el.innerHTML = `<i class="${res.liked ? 'fas' : 'far'} fa-heart"></i> ${res.likes_count}`;
}

async function addComment() {
    if (!currentUser) { openAuthModal(); return; }
    const text = document.getElementById('newCommentInput').value.trim();
    if (!text && !tempImage) { showToast('⚠️ اكتب تعليقاً'); return; }
    const sendBtn = document.getElementById('sendCommentBtn');
    sendBtn.disabled = true; sendBtn.textContent = '...';
    let imageUrl = null;
    if (tempImage) {
        const formData = new FormData();
        const blob = await (await fetch(tempImage)).blob();
        formData.append('image', blob);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData, headers: { 'Authorization': `Bearer ${localStorage.getItem('ramz_token')}` } });
        const uploadData = await uploadRes.json();
        imageUrl = uploadData.url;
    }
    await apiFetch(`/api/posts/${currentCommentPostId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text, parent_id: replyingToCommentId, image_url: imageUrl })
    });
    document.getElementById('newCommentInput').value = '';
    tempImage = null;
    replyingToCommentId = null;
    sendBtn.disabled = false; sendBtn.textContent = 'إرسال';
    showToast('💬 تم إضافة التعليق');
    await renderCommentsForPost(currentCommentPostId);
}

// ---------- Share & Download ----------
function openShareAdvanced(postId) {
    currentSharePostId = postId;
    document.getElementById('shareAdvancedSheet').classList.add('open');
}

function closeShareSheet() { document.getElementById('shareAdvancedSheet').classList.remove('open'); }

function shareOnPlatform(platform) {
    const url = `https://ramz-x.com/post/${currentSharePostId}`;
    const post = feedPosts.find(p => p.id === currentSharePostId);
    const text = post ? post.title : 'منشور رائع على Ramz-X';
    const urls = {
        whatsapp: `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
        twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
        telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
    };
    if (platform === 'copy') navigator.clipboard.writeText(url).then(() => showToast('🔗 تم نسخ الرابط'));
    else if (platform === 'email') window.location.href = `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`;
    else if (urls[platform]) window.open(urls[platform], '_blank');
    closeShareSheet();
}

async function downloadPostImage() {
    const post = feedPosts.find(p => p.id === currentSharePostId);
    if (!post || !post.image_url) { showToast('⚠️ لا توجد صورة'); return; }
    const a = document.createElement('a');
    a.href = post.image_url;
    a.download = 'post.jpg';
    a.click();
}

// ---------- Follow ----------
async function toggleFollow(userId) {
    if (!currentUser) { openAuthModal(); return; }
    await apiFetch('/api/follows', { method: 'POST', body: JSON.stringify({ following_id: userId }) });
    if (currentProfileId === userId) checkFollowStatus(userId);
    loadUserProfile(currentProfileId).then(updateProfileUI);
}

async function checkFollowStatus(userId) {
    const res = await apiFetch(`/api/follows/status/${userId}`);
    const btn = document.getElementById('followBtn');
    if (res.following) {
        btn.textContent = '✓ تمت المتابعة';
        btn.classList.add('following');
    } else {
        btn.textContent = '+ متابعة';
        btn.classList.remove('following');
    }
}

// ---------- Inbox / Chat ----------
function filterConversations() {
    let filtered = conversationsAll;
    if (currentInboxTab === 'following') filtered = conversationsAll.filter(c => c.otherUser?.is_following);
    else if (currentInboxTab === 'requests') filtered = conversationsAll.filter(c => !c.otherUser?.is_following);
    filtered.sort((a, b) => {
        const aPinned = pinnedConversations.includes(a.id);
        const bPinned = pinnedConversations.includes(b.id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return new Date(b.lastTime) - new Date(a.lastTime);
    });
    return filtered;
}

function renderInboxList() {
    const list = document.getElementById('inboxList');
    const emptyState = document.getElementById('inboxEmptyState');
    const conversations = filterConversations();
    if (conversations.length === 0) { list.innerHTML = ''; emptyState.style.display = 'block'; return; }
    emptyState.style.display = 'none';
    list.innerHTML = conversations.map(c => `
        <li class="inbox-item" onclick="openConversation('${c.id}')">
            <img src="${c.otherUser?.avatar_url || 'https://via.placeholder.com/56'}" class="inbox-avatar" alt="">
            <div class="inbox-info">
                <div class="inbox-name">${c.otherUser?.username || 'مستخدم'} ${pinnedConversations.includes(c.id) ? '<span class="inbox-pin"><i class="fas fa-thumbtack"></i></span>' : ''}</div>
                <div class="inbox-preview">${c.lastMessage}</div>
            </div>
            <div class="inbox-meta">
                <div class="inbox-time">${timeAgo(c.lastTime)}</div>
                ${c.unread > 0 ? `<span class="inbox-badge">${c.unread}</span>` : ''}
            </div>
        </li>`).join('');
}

async function loadConversations() {
    if (!currentUser) return;
    conversationsAll = await apiFetch('/api/conversations');
    renderInboxList();
}

function togglePinConversation() {
    if (!currentConversation) return;
    const convId = currentConversation.id;
    if (pinnedConversations.includes(convId)) {
        pinnedConversations = pinnedConversations.filter(id => id !== convId);
        showToast('📌 تم إلغاء التثبيت');
    } else {
        pinnedConversations.push(convId);
        showToast('📌 تم تثبيت المحادثة');
    }
    localStorage.setItem('pinnedConvs', JSON.stringify(pinnedConversations));
    renderInboxList();
}

async function deleteConversation() {
    if (!currentConversation) return;
    if (!confirm('هل أنت متأكد من حذف هذه المحادثة؟')) return;
    // حذف عبر API غير مطبق هنا، يمكن إضافته لاحقاً
    showToast('🗑️ محذوف');
    showInboxList();
}

async function openConversation(convId) {
    const messages = await apiFetch(`/api/conversations/${convId}/messages`);
    const conv = conversationsAll.find(c => c.id === convId);
    currentConversation = { id: convId, messages, otherUser: conv?.otherUser };
    document.getElementById('convAvatar').src = conv?.otherUser?.avatar_url || '';
    document.getElementById('convName').textContent = conv?.otherUser?.username || '';
    document.getElementById('inboxListView').style.display = 'none';
    document.getElementById('conversationView').style.display = 'flex';
    renderMessages();
    apiFetch(`/api/conversations/${convId}/read`, { method: 'PUT' });
    loadConversations();
}

function renderMessages() {
    if (!currentConversation) return;
    const container = document.getElementById('messagesContainer');
    container.innerHTML = currentConversation.messages.map(m => {
        const isSent = m.sender_id === currentUser.id;
        return `<div class="message-bubble ${isSent ? 'sent' : 'received'}">
            ${m.image_url ? `<img src="${m.image_url}" style="max-width:200px;border-radius:12px;margin-bottom:4px;">` : ''}
            ${m.text ? escapeHtml(m.text) : ''}
            <div class="message-status ${m.is_read ? 'read' : ''}">${isSent ? (m.is_read ? '✓✓ تمت القراءة' : '✓ تم التسليم') : ''}</div>
        </div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
}

async function sendMessageText() {
    const text = document.getElementById('messageInput').value.trim();
    if (!text || !currentConversation) return;
    await apiFetch(`/api/conversations/${currentConversation.id}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
    document.getElementById('messageInput').value = '';
    openConversation(currentConversation.id);
}

async function startNewConversation() {
    const username = prompt('أدخل اسم المستخدم للبدء بمحادثة:');
    if (!username) return;
    const res = await apiFetch(`/api/search?q=${encodeURIComponent(username)}`);
    const user = res.users?.[0];
    if (!user) { showToast('❌ المستخدم غير موجود'); return; }
    const conv = await apiFetch('/api/conversations', { method: 'POST', body: JSON.stringify({ participantId: user.id }) });
    loadConversations();
    openConversation(conv.id);
}

function showInboxList() {
    document.getElementById('inboxListView').style.display = 'block';
    document.getElementById('conversationView').style.display = 'none';
    currentConversation = null;
}

// ---------- Notifications ----------
async function loadNotifications() {
    if (!currentUser) return;
    notifications = await apiFetch('/api/notifications');
    unreadNotifications = notifications.filter(n => !n.is_read).length;
    updateNotificationBadge();
    renderNotifications();
}

function renderNotifications() {
    const container = document.getElementById('notificationsList');
    container.innerHTML = notifications.map(n => `
        <div class="notification-item" onclick="markNotificationRead('${n.id}')">
            <img src="${n.actor?.avatar_url || 'https://via.placeholder.com/44'}" class="notification-avatar">
            <div class="notification-text">${getNotificationText(n)}</div>
            <div class="notification-time">${timeAgo(n.created_at)}</div>
            ${!n.is_read ? '<div class="notification-dot"></div>' : ''}
        </div>`).join('');
}

function getNotificationText(notif) {
    const actorName = notif.actor?.username || 'شخص';
    switch (notif.type) {
        case 'like': return `${actorName} أعجب بمنشورك`;
        case 'comment': return `${actorName} علق على منشورك`;
        case 'follow': return `${actorName} بدأ بمتابعتك`;
        case 'repost': return `${actorName} أعاد نشر منشورك`;
        default: return 'إشعار جديد';
    }
}

async function markNotificationRead(id) {
    await apiFetch('/api/notifications/read', { method: 'PUT' });
    unreadNotifications = Math.max(0, unreadNotifications - 1);
    updateNotificationBadge();
    const notif = notifications.find(n => n.id === id);
    if (notif) { notif.is_read = true; renderNotifications(); }
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (unreadNotifications > 0) {
        badge.style.display = 'flex';
        badge.textContent = unreadNotifications > 99 ? '99+' : unreadNotifications;
    } else {
        badge.style.display = 'none';
    }
}

// ---------- Create Post ----------
async function publishPost() {
    if (!currentUser) { openAuthModal(); return; }
    const title = document.getElementById('postTitle').value.trim();
    const content = document.getElementById('postContent').value.trim();
    if (!title || !content) { showToast('⚠️ يرجى إدخال العنوان والمحتوى'); return; }
    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', content);
    formData.append('category', document.getElementById('postCategory').value);
    formData.append('hashtag', document.getElementById('postHashtag').value.trim());
    formData.append('location', document.getElementById('postLocation').value.trim());
    const imageFile = document.getElementById('postImageInput').files[0];
    const videoFile = document.getElementById('postVideoInput').files[0];
    const audioFile = document.getElementById('postAudioInput').files[0];
    if (imageFile) formData.append('image', imageFile);
    if (videoFile) formData.append('video', videoFile);
    if (audioFile) formData.append('audio', audioFile);
    const schedule = document.getElementById('postSchedule').value;
    if (schedule) formData.append('scheduled_at', schedule);

    try {
        await apiFetch('/api/posts', { method: 'POST', body: formData, headers: {} });
        showToast('🎉 تم النشر بنجاح');
        resetCreateForm();
        navigateTo('feed');
        refreshFeed();
    } catch (err) { showToast('❌ ' + err.message); }
}

function resetCreateForm() {
    ['postTitle','postContent','postHashtag','postLocation','postSchedule'].forEach(id => document.getElementById(id).value = '');
    ['postImageInput','postVideoInput','postAudioInput'].forEach(id => document.getElementById(id).value = '');
    ['postImagePreview','postVideoPreview','postAudioPreview'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
}

// ---------- Search ----------
async function performSearch(query) {
    const container = document.getElementById('searchResults');
    container.innerHTML = '<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-pulse"></i> جاري البحث...</div>';
    const data = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
    const posts = data.posts || [];
    const users = data.users || [];
    if (!posts.length && !users.length) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>لا توجد نتائج</p></div>`;
        return;
    }
    let html = '';
    posts.forEach(p => html += `<div class="post-card" style="animation:none;opacity:1;">...</div>`); // simplified
    container.innerHTML = html;
}

// ---------- Profile Posts ----------
async function loadUserPosts(userId) {
    const container = document.getElementById('profilePostsContainer');
    container.innerHTML = '<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-pulse"></i></div>';
    try {
        const data = await apiFetch(`/api/posts?author_id=${userId}`);
        document.getElementById('profilePostsCount').textContent = data.total || 0;
        if (!data.data?.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-camera"></i><p>لا توجد منشورات بعد</p></div>';
            return;
        }
        container.innerHTML = data.data.map(p => `<div class="post-card" style="animation:none;opacity:1;">...</div>`).join('');
    } catch (e) { container.innerHTML = '<div class="empty-state"><i class="fas fa-camera"></i><p>لا توجد منشورات بعد</p></div>'; }
}

// ---------- Init ----------
async function init() {
    const token = localStorage.getItem('ramz_token');
    if (token) {
        try {
            currentUser = JSON.parse(localStorage.getItem('ramz_user'));
            if (currentUser) {
                updateProfileUI();
                loadNotifications();
                loadConversations();
            }
        } catch (e) {}
    }
    await refreshFeed();
    loadStories();

    window.addEventListener('scroll', () => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 300) loadMore();
    });

    document.getElementById('darkModeToggle').addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const icon = document.querySelector('#darkModeToggle i');
        if (document.body.classList.contains('light-theme')) {
            icon.className = 'fas fa-sun';
            localStorage.setItem('ramz_theme', 'light');
        } else {
            icon.className = 'fas fa-moon';
            localStorage.setItem('ramz_theme', 'dark');
        }
    });

    if (localStorage.getItem('ramz_theme') === 'light') {
        document.body.classList.add('light-theme');
        document.querySelector('#darkModeToggle i').className = 'fas fa-sun';
    }

    // Event listeners for modals, search, etc.
    document.getElementById('authSubmitBtn')?.addEventListener('click', handleAuth);
    document.getElementById('authSwitch')?.addEventListener('click', () => { isAuthMode = isAuthMode === 'login' ? 'register' : 'login'; updateAuthModalUI(); });
    document.getElementById('authModal')?.addEventListener('click', function(e) { if (e.target === this) closeAuthModal(); });
    document.getElementById('publishBtn')?.addEventListener('click', publishPost);
    document.getElementById('closeSheetBtn')?.addEventListener('click', () => document.getElementById('commentsSheet').classList.remove('open'));
    document.getElementById('closeShareSheetBtn')?.addEventListener('click', closeShareSheet);
    document.getElementById('sendCommentBtn')?.addEventListener('click', addComment);
    document.getElementById('newCommentInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') addComment(); });
    document.getElementById('messageSendBtn')?.addEventListener('click', sendMessageText);
    document.getElementById('messageInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessageText(); });
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const q = e.target.value.trim();
        if (q.length < 2) return;
        searchTimeout = setTimeout(() => performSearch(q), 400);
    });

    console.log('🚀 Ramz-X initialized (API version)');
}

document.addEventListener('DOMContentLoaded', init);

// ==================== Font Awesome Fallback (تحميل احتياطي) ====================
(function loadFallbackFontAwesome() {
    const TIMEOUT = 3000; // انتظار 3 ثوانٍ لتحميل CDN
    const FALLBACK_URL = '/css/fontawesome.min.css'; // المسار المحلي للنسخة الاحتياطية

    setTimeout(() => {
        // فحص ما إذا كان Font Awesome محملاً فعلاً
        const testIcon = document.createElement('i');
        testIcon.className = 'fas fa-heart';
        testIcon.style.cssText = 'position:absolute;visibility:hidden;font-size:0;';
        document.body.appendChild(testIcon);
        
        const style = window.getComputedStyle(testIcon);
        const fontFamily = style.getPropertyValue('font-family');
        document.body.removeChild(testIcon);

        // إذا لم يتم تحميل الخط (لا يحتوي "Font Awesome")
        if (!fontFamily.includes('Font Awesome')) {
            // 1. إضافة الكلاس الذي طلبته
            document.body.classList.add('no-fontawesome');
            
            // 2. تحميل النسخة المحلية الاحتياطية
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = FALLBACK_URL;
            link.onerror = function() {
                console.error('لم يتم العثور على الملف الاحتياطي لـ Font Awesome.');
            };
            document.head.appendChild(link);
            
            console.warn('⚠️ فشل تحميل Font Awesome من CDN، تم التبديل إلى النسخة المحلية.');
        }
    }, TIMEOUT);
})();
