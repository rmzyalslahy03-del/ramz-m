require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ramz-x-default-secret';
const DB_PATH = path.join(__dirname, 'db.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// إنشاء مجلد الرفع إذا لم يكن موجوداً
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ---------- Middleware ----------
// الأمان
app.use(helmet({ contentSecurityPolicy: false })); // تعطيل CSP مؤقتاً للتوافق مع الواجهة
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// تحسين الأداء
app.use(compression());

// تسجيل الطلبات
app.use(morgan('dev'));

// الحد من الطلبات
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // حد أقصى 100 طلب لكل IP
    message: { error: 'طلبات كثيرة جداً، يرجى المحاولة لاحقاً' }
});
app.use('/api/', limiter);

// زيادة حجم الجسم للملفات
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));

// إعداد multer لتخزين الملفات
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ---------- Database helpers ----------
function readDB() {
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
    catch { return initDB(); }
}
function writeDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8'); }

function initDB() {
    const initial = {
        users: [],
        posts: [],
        likes: [],
        favorites: [],
        reposts: [],
        comments: [],
        comment_likes: [],
        follows: [],
        notifications: [],
        stories: [],
        story_replies: [],
        conversations: [],
        conversation_participants: [],
        messages: [],
        polls: [],
        votes: [],
        events: [],
        groups: [],
        group_members: [],
        scheduled_posts: []
    };
    writeDB(initial);
    return initial;
}

// ---------- Auth middleware ----------
function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });
    const token = header.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) { return res.status(401).json({ error: 'جلسة غير صالحة' }); }
}

// ---------- Helper: notify ----------
function addNotification(db, userId, type, actorId, referenceId = null) {
    db.notifications.unshift({
        id: uuidv4(),
        user_id: userId,
        actor_id: actorId,
        type,
        reference_id: referenceId,
        is_read: false,
        created_at: new Date().toISOString()
    });
}

// ---------- Auth Routes ----------
app.post('/api/auth/signup', async (req, res) => {
    const { email, password, username } = req.body;
    const db = readDB();
    if (db.users.find(u => u.email === email || u.username === username)) return res.status(400).json({ error: 'البريد أو اسم المستخدم موجود مسبقاً' });
    const hashed = await bcrypt.hash(password, 10);
    const newUser = {
        id: uuidv4(),
        email,
        password: hashed,
        username,
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=ff0050&color=fff&size=200`,
        bio: `مرحباً! أنا ${username} في Ramz-X 🚀`,
        verified: false,
        top_contributor: false,
        created_at: new Date().toISOString()
    };
    db.users.push(newUser);
    writeDB(db);
    const token = jwt.sign({ userId: newUser.id }, JWT_SECRET);
    const { password: _, ...safeUser } = newUser;
    res.status(201).json({ user: safeUser, token });
});

app.post('/api/auth/signin', async (req, res) => {
    const { email, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.email === email);
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'بيانات غير صحيحة' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser, token });
});

// ---------- Profile Routes ----------
app.get('/api/profiles/:id', (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const { password, ...safe } = user;
    const followersCount = db.follows.filter(f => f.following_id === user.id).length;
    const followingCount = db.follows.filter(f => f.follower_id === user.id).length;
    const postsCount = db.posts.filter(p => p.author_id === user.id && !p.is_hidden).length;
    res.json({ ...safe, followersCount, followingCount, postsCount });
});

app.put('/api/profiles/:id', authMiddleware, (req, res) => {
    if (req.userId !== req.params.id) return res.status(403).json({ error: 'غير مصرح' });
    const db = readDB();
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'غير موجود' });
    const { username, bio, avatar_url } = req.body;
    if (username) user.username = username;
    if (bio !== undefined) user.bio = bio;
    if (avatar_url) user.avatar_url = avatar_url;
    writeDB(db);
    const { password, ...safe } = user;
    res.json(safe);
});

// ---------- Follows ----------
app.post('/api/follows', authMiddleware, (req, res) => {
    const { following_id } = req.body;
    const db = readDB();
    if (req.userId === following_id) return res.status(400).json({ error: 'لا يمكن متابعة نفسك' });
    const existing = db.follows.find(f => f.follower_id === req.userId && f.following_id === following_id);
    if (existing) {
        db.follows = db.follows.filter(f => f.id !== existing.id);
        writeDB(db);
        return res.json({ following: false });
    } else {
        db.follows.push({ id: uuidv4(), follower_id: req.userId, following_id, created_at: new Date().toISOString() });
        addNotification(db, following_id, 'follow', req.userId);
        writeDB(db);
        return res.json({ following: true });
    }
});

app.get('/api/follows/status/:targetId', authMiddleware, (req, res) => {
    const db = readDB();
    const following = db.follows.some(f => f.follower_id === req.userId && f.following_id === req.params.targetId);
    res.json({ following });
});

// ---------- Posts ----------
app.get('/api/posts', (req, res) => {
    const db = readDB();
    const { limit = 10, cursor } = req.query;
    let posts = db.posts.filter(p => !p.is_hidden).sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
    if (cursor) posts = posts.filter(p => p.created_at < cursor);
    posts = posts.slice(0, parseInt(limit));
    const enriched = posts.map(p => {
        const author = db.users.find(u => u.id === p.author_id);
        return {
            ...p,
            author: author ? { username: author.username, avatar_url: author.avatar_url, verified: author.verified, top_contributor: author.top_contributor } : null
        };
    });
    res.json({ data: enriched, nextCursor: posts.length ? posts[posts.length-1].created_at : null });
});

app.post('/api/posts', authMiddleware, upload.fields([{name:'image'}, {name:'video'}, {name:'audio'}]), (req, res) => {
    const db = readDB();
    const { title, content, category, hashtag, location, scheduled_at } = req.body;
    const image_url = req.files?.image?.[0] ? `/uploads/${req.files.image[0].filename}` : null;
    const video_url = req.files?.video?.[0] ? `/uploads/${req.files.video[0].filename}` : null;
    const audio_url = req.files?.audio?.[0] ? `/uploads/${req.files.audio[0].filename}` : null;
    const post = {
        id: uuidv4(),
        author_id: req.userId,
        title, content, category, hashtag, location,
        image_url, video_url, audio_url,
        likes_count: 0, comments_count: 0, views_count: 0, reposts_count: 0, favorites_count: 0,
        is_hidden: false, is_pinned: false,
        scheduled_at: scheduled_at || null,
        created_at: new Date().toISOString()
    };
    if (scheduled_at) db.scheduled_posts.push(post);
    else db.posts.push(post);
    writeDB(db);
    res.status(201).json(post);
});

// Like/Unlike
app.post('/api/posts/:id/like', authMiddleware, (req, res) => {
    const db = readDB();
    const post = db.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'منشور غير موجود' });
    const existing = db.likes.find(l => l.post_id === post.id && l.user_id === req.userId);
    if (existing) {
        db.likes = db.likes.filter(l => l.id !== existing.id);
        post.likes_count = Math.max(0, post.likes_count - 1);
        writeDB(db);
        res.json({ liked: false, likes_count: post.likes_count });
    } else {
        db.likes.push({ id: uuidv4(), post_id: post.id, user_id: req.userId, created_at: new Date().toISOString() });
        post.likes_count++;
        if (post.author_id !== req.userId) addNotification(db, post.author_id, 'like', req.userId, post.id);
        writeDB(db);
        res.json({ liked: true, likes_count: post.likes_count });
    }
});

// Save/unsave
app.post('/api/posts/:id/save', authMiddleware, (req, res) => {
    const db = readDB();
    const post = db.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'منشور غير موجود' });
    const existing = db.favorites.find(f => f.post_id === post.id && f.user_id === req.userId);
    if (existing) {
        db.favorites = db.favorites.filter(f => f.id !== existing.id);
        post.favorites_count = Math.max(0, post.favorites_count - 1);
        writeDB(db);
        res.json({ saved: false, favorites_count: post.favorites_count });
    } else {
        db.favorites.push({ id: uuidv4(), post_id: post.id, user_id: req.userId, created_at: new Date().toISOString() });
        post.favorites_count++;
        writeDB(db);
        res.json({ saved: true, favorites_count: post.favorites_count });
    }
});

// Repost
app.post('/api/posts/:id/repost', authMiddleware, (req, res) => {
    const db = readDB();
    const original = db.posts.find(p => p.id === req.params.id);
    if (!original) return res.status(404).json({ error: 'منشور غير موجود' });
    const existing = db.reposts.find(r => r.original_post_id === original.id && r.user_id === req.userId);
    if (existing) {
        db.posts = db.posts.filter(p => p.id !== existing.new_post_id);
        db.reposts = db.reposts.filter(r => r.id !== existing.id);
        original.reposts_count = Math.max(0, original.reposts_count - 1);
        writeDB(db);
        res.json({ reposted: false, reposts_count: original.reposts_count });
    } else {
        const user = db.users.find(u => u.id === req.userId);
        const newPost = {
            id: uuidv4(),
            author_id: req.userId,
            title: original.title,
            content: `🔄 أعاد ${user.username} نشر منشور @${original.author_id}\n\n${original.content}`,
            image_url: original.image_url,
            category: original.category,
            hashtag: original.hashtag,
            likes_count: 0, comments_count: 0, views_count: 0, reposts_count: 0, favorites_count: 0,
            is_hidden: false, is_pinned: false,
            created_at: new Date().toISOString()
        };
        db.posts.push(newPost);
        db.reposts.push({ id: uuidv4(), user_id: req.userId, original_post_id: original.id, new_post_id: newPost.id });
        original.reposts_count++;
        if (original.author_id !== req.userId) addNotification(db, original.author_id, 'repost', req.userId, original.id);
        writeDB(db);
        res.json({ reposted: true, reposts_count: original.reposts_count });
    }
});

// Toggle Pin
app.post('/api/posts/:id/pin', authMiddleware, (req, res) => {
    const db = readDB();
    const post = db.posts.find(p => p.id === req.params.id);
    if (!post || post.author_id !== req.userId) return res.status(403).json({ error: 'غير مصرح' });
    post.is_pinned = !post.is_pinned;
    writeDB(db);
    res.json({ is_pinned: post.is_pinned });
});

// View increment
app.post('/api/posts/:id/view', (req, res) => {
    const db = readDB();
    const post = db.posts.find(p => p.id === req.params.id);
    if (post) { post.views_count++; writeDB(db); }
    res.json({ views_count: post?.views_count || 0 });
});

// ---------- Comments ----------
app.get('/api/posts/:id/comments', (req, res) => {
    const db = readDB();
    const comments = db.comments.filter(c => c.post_id === req.params.id && !c.parent_id)
        .sort((a,b) => new Date(a.created_at) - new Date(b.created_at))
        .map(c => {
            const user = db.users.find(u => u.id === c.user_id);
            return { ...c, user: user ? { username: user.username, avatar_url: user.avatar_url } : null };
        });
    res.json({ data: comments });
});

app.post('/api/posts/:id/comments', authMiddleware, upload.single('image'), (req, res) => {
    const db = readDB();
    const { text, parent_id } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;
    const comment = {
        id: uuidv4(),
        post_id: req.params.id,
        user_id: req.userId,
        text, image_url,
        parent_id: parent_id || null,
        likes_count: 0,
        created_at: new Date().toISOString()
    };
    db.comments.push(comment);
    const post = db.posts.find(p => p.id === req.params.id);
    if (post) {
        post.comments_count++;
        if (post.author_id !== req.userId) addNotification(db, post.author_id, 'comment', req.userId, post.id);
    }
    writeDB(db);
    res.status(201).json(comment);
});

// Toggle comment like
app.post('/api/comments/:id/like', authMiddleware, (req, res) => {
    const db = readDB();
    const comment = db.comments.find(c => c.id === req.params.id);
    if (!comment) return res.status(404).json({ error: 'غير موجود' });
    const existing = db.comment_likes.find(l => l.comment_id === comment.id && l.user_id === req.userId);
    if (existing) {
        db.comment_likes = db.comment_likes.filter(l => l.id !== existing.id);
        comment.likes_count = Math.max(0, comment.likes_count - 1);
        writeDB(db);
        res.json({ liked: false, likes_count: comment.likes_count });
    } else {
        db.comment_likes.push({ id: uuidv4(), comment_id: comment.id, user_id: req.userId });
        comment.likes_count++;
        writeDB(db);
        res.json({ liked: true, likes_count: comment.likes_count });
    }
});

// ---------- Stories ----------
app.get('/api/stories', (req, res) => {
    const db = readDB();
    const valid = db.stories.filter(s => new Date(s.expires_at) > new Date());
    const enriched = valid.map(s => {
        const user = db.users.find(u => u.id === s.user_id);
        return { ...s, user: user ? { username: user.username, avatar_url: user.avatar_url } : null };
    });
    res.json({ data: enriched });
});

app.post('/api/stories', authMiddleware, upload.single('media'), (req, res) => {
    const db = readDB();
    const media_url = req.file ? `/uploads/${req.file.filename}` : null;
    const story = {
        id: uuidv4(),
        user_id: req.userId,
        media_url,
        expires_at: new Date(Date.now() + 24*60*60*1000).toISOString(),
        created_at: new Date().toISOString()
    };
    db.stories.push(story);
    writeDB(db);
    res.status(201).json(story);
});

// Story reply
app.post('/api/stories/:id/reply', authMiddleware, (req, res) => {
    const db = readDB();
    db.story_replies.push({
        id: uuidv4(),
        story_id: req.params.id,
        user_id: req.userId,
        text: req.body.text,
        created_at: new Date().toISOString()
    });
    writeDB(db);
    res.json({ success: true });
});

// ---------- Conversations & Messages ----------
app.get('/api/conversations', authMiddleware, (req, res) => {
    const db = readDB();
    const partIds = db.conversation_participants.filter(p => p.user_id === req.userId).map(p => p.conversation_id);
    const convs = db.conversations.filter(c => partIds.includes(c.id));
    const result = convs.map(c => {
        const otherUserId = db.conversation_participants.find(p => p.conversation_id === c.id && p.user_id !== req.userId)?.user_id;
        const otherUser = db.users.find(u => u.id === otherUserId);
        const lastMessage = db.messages.filter(m => m.conversation_id === c.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];
        const unread = db.messages.filter(m => m.conversation_id === c.id && m.sender_id !== req.userId && !m.is_read).length;
        return {
            id: c.id,
            otherUser: otherUser ? { id: otherUser.id, username: otherUser.username, avatar_url: otherUser.avatar_url, is_following: db.follows.some(f=>f.follower_id===req.userId && f.following_id===otherUser.id) } : null,
            lastMessage: lastMessage?.text || 'بدون رسائل',
            lastTime: lastMessage?.created_at || c.created_at,
            unread
        };
    });
    res.json(result);
});

app.post('/api/conversations', authMiddleware, (req, res) => {
    const { participantId } = req.body;
    const db = readDB();
    const conv = { id: uuidv4(), created_at: new Date().toISOString() };
    db.conversations.push(conv);
    db.conversation_participants.push({ conversation_id: conv.id, user_id: req.userId });
    db.conversation_participants.push({ conversation_id: conv.id, user_id: participantId });
    writeDB(db);
    res.status(201).json(conv);
});

app.get('/api/conversations/:id/messages', authMiddleware, (req, res) => {
    const db = readDB();
    const msgs = db.messages.filter(m => m.conversation_id === req.params.id).sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));
    res.json(msgs);
});

app.post('/api/conversations/:id/messages', authMiddleware, upload.single('image'), (req, res) => {
    const db = readDB();
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;
    const msg = {
        id: uuidv4(),
        conversation_id: req.params.id,
        sender_id: req.userId,
        text: req.body.text || '',
        image_url,
        is_read: false,
        created_at: new Date().toISOString()
    };
    db.messages.push(msg);
    writeDB(db);
    res.status(201).json(msg);
});

// Mark read
app.put('/api/conversations/:id/read', authMiddleware, (req, res) => {
    const db = readDB();
    db.messages.forEach(m => { if (m.conversation_id === req.params.id && m.sender_id !== req.userId) m.is_read = true; });
    writeDB(db);
    res.json({ success: true });
});

// ---------- Notifications ----------
app.get('/api/notifications', authMiddleware, (req, res) => {
    const db = readDB();
    const notifs = db.notifications.filter(n => n.user_id === req.userId).sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
    const enriched = notifs.map(n => {
        const actor = db.users.find(u => u.id === n.actor_id);
        return { ...n, actor: actor ? { username: actor.username, avatar_url: actor.avatar_url } : null };
    });
    res.json(enriched);
});

app.put('/api/notifications/read', authMiddleware, (req, res) => {
    const db = readDB();
    db.notifications.forEach(n => { if (n.user_id === req.userId) n.is_read = true; });
    writeDB(db);
    res.json({ success: true });
});

// ---------- Search ----------
app.get('/api/search', (req, res) => {
    const { q } = req.query;
    const db = readDB();
    const lower = q.toLowerCase();
    const users = db.users.filter(u => u.username.includes(lower)).map(({password,...u})=>u);
    const posts = db.posts.filter(p => p.title?.includes(lower) || p.content?.includes(lower) || p.hashtag?.includes(lower));
    res.json({ users, posts });
});

// ---------- Groups, Polls, Events (basic) ----------
app.get('/api/groups', (req, res) => { res.json(readDB().groups); });
app.post('/api/groups', authMiddleware, (req, res) => {
    const db = readDB();
    const group = { id: uuidv4(), name: req.body.name, creator_id: req.userId, created_at: new Date().toISOString() };
    db.groups.push(group);
    db.group_members.push({ group_id: group.id, user_id: req.userId, role: 'admin' });
    writeDB(db);
    res.status(201).json(group);
});

// ---------- Serve frontend ----------
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------- Start ----------
app.listen(PORT, () => console.log(`🚀 Ramz-X Production server running on port ${PORT}`));
