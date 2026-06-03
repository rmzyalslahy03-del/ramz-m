// ===================== إعدادات API =====================
// استخدام الرابط النسبي /api (نفس الخادم)
const API_BASE_URL = '/api';

// دالة مساعدة لإرسال الطلبات إلى API
async function apiRequest(endpoint, method = 'GET', data = null) {
  const url = `${API_BASE_URL}/${endpoint}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (data) options.body = JSON.stringify(data);
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}

// ===================== دوال المستخدم =====================
async function loginUser(username, password) {
  const users = await apiRequest('users');
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    localStorage.setItem('currentUser', JSON.stringify({ id: user.id, username: user.username }));
    return user;
  }
  return null;
}

async function registerUser(username, password) {
  const users = await apiRequest('users');
  if (users.find(u => u.username === username)) throw new Error('اسم المستخدم موجود');
  const newId = users.length ? Math.max(...users.map(u => u.id)) + 1 : 1;
  const newUser = { id: newId, username, password, created_at: new Date().toISOString() };
  await apiRequest('users', 'POST', newUser);
  localStorage.setItem('currentUser', JSON.stringify({ id: newUser.id, username: newUser.username }));
  return newUser;
}

function getCurrentUser() {
  return JSON.parse(localStorage.getItem('currentUser'));
}

function logout() {
  localStorage.removeItem('currentUser');
  window.location.reload();
}

// ===================== دوال المنشورات =====================
async function getPosts() {
  return apiRequest('posts?_sort=created_at&_order=desc');
}

async function createPost(post) {
  return apiRequest('posts', 'POST', post);
}

async function updatePost(postId, updates) {
  return apiRequest(`posts/${postId}`, 'PATCH', updates);
}

// ===================== الإعجابات =====================
async function hasLiked(postId, userId) {
  const likes = await apiRequest(`likes?post_id=${postId}&user_id=${userId}`);
  return likes.length > 0;
}

async function toggleLike(postId, userId) {
  const existing = await hasLiked(postId, userId);
  if (existing) {
    const likes = await apiRequest(`likes?post_id=${postId}&user_id=${userId}`);
    const likeId = likes[0].id;
    await apiRequest(`likes/${likeId}`, 'DELETE');
    const post = await apiRequest(`posts/${postId}`);
    await updatePost(postId, { likes_count: (post.likes_count || 0) - 1 });
    return false;
  } else {
    await apiRequest('likes', 'POST', { post_id: postId, user_id: userId, created_at: new Date().toISOString() });
    const post = await apiRequest(`posts/${postId}`);
    await updatePost(postId, { likes_count: (post.likes_count || 0) + 1 });
    return true;
  }
}

// ===================== الإشارات المرجعية =====================
async function hasBookmarked(postId, userId) {
  const bookmarks = await apiRequest(`bookmarks?post_id=${postId}&user_id=${userId}`);
  return bookmarks.length > 0;
}

async function toggleBookmark(postId, userId) {
  const existing = await hasBookmarked(postId, userId);
  if (existing) {
    const bookmarks = await apiRequest(`bookmarks?post_id=${postId}&user_id=${userId}`);
    const bookmarkId = bookmarks[0].id;
    await apiRequest(`bookmarks/${bookmarkId}`, 'DELETE');
    return false;
  } else {
    await apiRequest('bookmarks', 'POST', { post_id: postId, user_id: userId, created_at: new Date().toISOString() });
    return true;
  }
}

// ===================== التعليقات =====================
async function getComments(postId) {
  return apiRequest(`comments?post_id=${postId}&_sort=created_at&_order=asc`);
}

async function addComment(postId, userId, body) {
  const newComment = { post_id: postId, user_id: userId, body, created_at: new Date().toISOString() };
  await apiRequest('comments', 'POST', newComment);
  const post = await apiRequest(`posts/${postId}`);
  await updatePost(postId, { comments_count: (post.comments_count || 0) + 1 });
}

// ===================== دوال مساعدة عامة =====================
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]);
}

function formatNumber(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n.toString();
}

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.background = isError ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #10b981, #059669)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// تصدير الدوال للاستخدام العالمي
window.apiRequest = apiRequest;
window.loginUser = loginUser;
window.registerUser = registerUser;
window.getCurrentUser = getCurrentUser;
window.logout = logout;
window.getPosts = getPosts;
window.createPost = createPost;
window.updatePost = updatePost;
window.hasLiked = hasLiked;
window.toggleLike = toggleLike;
window.hasBookmarked = hasBookmarked;
window.toggleBookmark = toggleBookmark;
window.getComments = getComments;
window.addComment = addComment;
window.escapeHtml = escapeHtml;
window.formatNumber = formatNumber;
window.showToast = showToast;
