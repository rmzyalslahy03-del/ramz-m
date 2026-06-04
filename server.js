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
const JWT_SECRET = process.env.JWT_SECRET || 'ramz-x-secret-key-change-in-production';
const DB_PATH = path.join(__dirname, 'db.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// إنشاء مجلد الرفع إذا لم يكن موجوداً
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ---------- Middleware ----------
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(compression());
app.use(morgan('dev'));

// الحد من الطلبات
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 200,
    message: { error: 'طلبات كثيرة جداً، يرجى المحاولة لاحقاً' }
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname)); // يخدم الملفات من جذر المشروع (index.html, common.js, common.css)

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
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch {
        return initDB();
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

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
    seedDatabase(initial);
    writeDB(initial);
    return initial;
}

// ---------- Seed Data ----------
function seedDatabase(db) {
    if (db.users.length > 0) return;

    // ========== المستخدمين ==========
    const userNames = ['شعلان', 'ترف', 'زينة', 'رمزي', 'هيلان', 'أنور', 'حاميم', 'رؤية', 'نور'];
    const users = userNames.map((name, index) => ({
        id: uuidv4(),
        username: name,
        email: `${name.toLowerCase()}@ramz-x.com`,
        password: bcrypt.hashSync('123456', 10),
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=200`,
        bio: `أنا ${name}، سعيد بوجودي في Ramz-X ✨`,
        verified: index < 3,
        top_contributor: index % 2 === 0,
        coins: 500 + index * 100,
        created_at: new Date(Date.now() - index * 3600000).toISOString()
    }));
    db.users = users;

    // ========== المنشورات ==========
    const sampleTemplates = [
        { title: 'صباح الخير ☀️', content: 'أجمل ما في الصباح هو الأمل بولادة جديدة. #تفاؤل', hashtag: 'صباح_الخير', category: 'عام', image: 'https://picsum.photos/id/1015/800/600', video: '' },
        { title: 'تقنية البلوك تشين', content: 'البلوك تشين ليست فقط عملات رقمية، بل ثورة في حفظ البيانات. #تقنية', hashtag: 'بلوك_تشين', category: 'تقنية', image: 'https://picsum.photos/id/1/800/600', video: '' },
        { title: 'وصفة الشاورما', content: 'جربوا وصفتي للشاورما، السر في التتبيلة! #طبخ', hashtag: 'شاورما', category: 'طبخ', image: 'https://picsum.photos/id/1080/800/600', video: '' },
        { title: 'تصميم شعار', content: 'أتشوق لسماع آرائكم في تصميم الشعار الجديد. #تصميم', hashtag: 'تصميم', category: 'تصميم', image: 'https://picsum.photos/id/2/800/600', video: '' },
        { title: 'هدف عالمي', content: 'هدف رائع في الدوري الأوروبي الليلة! #رياضة', hashtag: 'كرة_القدم', category: 'رياضة', image: 'https://picsum.photos/id/3/800/600', video: '' },
        { title: 'ليلة هادئة', content: 'أحياناً نحتاج إلى ليلة هادئة مع كوب شاي وكتاب 📖', hashtag: 'مساء', category: 'فن', image: 'https://picsum.photos/id/1040/800/600', video: '' },
        { title: 'فيديو من الطبيعة', content: 'شاهدوا هذا المنظر الخلاب من رحلتي الأخيرة 🏞️', hashtag: 'طبيعة', category: 'سفر', image: '', video: 'https://www.w3schools.com/html/mov_bbb.mp4' },
        { title: 'نصيحة تقنية', content: 'استخدم مدير كلمات مرور، ولا تكرر كلمات المرور أبداً. #أمان', hashtag: 'أمان', category: 'تقنية', image: '', video: '' },
    ];

    const posts = [];
    for (let i = 0; i < 16; i++) {
        const tmpl = sampleTemplates[i % sampleTemplates.length];
        const author = users[i % users.length];
        posts.push({
            id: uuidv4(),
            author_id: author.id,
            title: tmpl.title,
            content: tmpl.content,
            category: tmpl.category,
            hashtag: tmpl.hashtag,
            image_url: tmpl.image || '',
            video_url: tmpl.video || '',
            likes_count: Math.floor(Math.random() * 30),
            comments_count: 0,
            views_count: Math.floor(Math.random() * 200),
            reposts_count: Math.floor(Math.random() * 10),
            favorites_count: Math.floor(Math.random() * 15),
            is_pinned: i === 0,
            is_hidden: false,
            created_at: new Date(Date.now() - i * 1800000).toISOString()
        });
    }
    db.posts = posts;

    // ========== إعجابات ==========
    posts.forEach(post => {
        const likers = users.sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 5) + 1);
        likers.forEach(u => {
            db.likes.push({
                id: uuidv4(),
                post_id: post.id,
                user_id: u.id,
                created_at: new Date().toISOString()
            });
        });
    });

    // ========== تعليقات ==========
    posts.slice(0, 8).forEach(post => {
        const commenter = users[Math.floor(Math.random() * users.length)];
        const comment = {
            id: uuidv4(),
            post_id: post.id,
            user_id: commenter.id,
            text: 'محتوى رائع! استمر في الإبداع ✨',
            image_url: '',
            parent_id: null,
            likes_count: Math.floor(Math.random() * 5),
            created_at: new Date().toISOString()
        };
        db.comments.push(comment);
        post.comments_count = 1;
    });

    // ========== متابعات ==========
    users.forEach(u => {
        const targets = users.filter(o => o.id !== u.id)
            .sort(() => 0.5 - Math.random())
            .slice(0, 3);
        targets.forEach(t => {
            db.follows.push({
                id: uuidv4(),
                follower_id: u.id,
                following_id: t.id,
                created_at: new Date().toISOString()
            });
        });
    });

    // ========== قصص ==========
    users.slice(0, 5).forEach(u => {
        db.stories.push({
            id: uuidv4(),
            user_id: u.id,
            media_url: `https://picsum.photos/id/${Math.floor(Math.random() * 100)}/600/1000`,
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            created_at: new Date().toISOString()
        });
    });

    // ========== محادثة ==========
    const convId = uuidv4();
    db.conversations.push({ id: convId, created_at: new Date().toISOString() });
    db.conversation_participants.push(
        { conversation_id: convId, user_id: users[0].id },
        { conversation_id: convId, user_id: users[1].id }
    );
    db.messages.push(
        { id: uuidv4(), conversation_id: convId, sender_id: users[0].id, text: 'مرحباً ترف، كيف حالك؟', image_url: '', is_read: true, created_at: new Date().toISOString() },
        { id: uuidv4(), conversation_id: convId, sender_id: users[1].id, text: 'أهلاً شعلان، الحمد لله، وأنت؟', image_url: '', is_read: false, created_at: new Date().toISOString() }
    );

    // ========== مجموعة ==========
    const groupId = uuidv4();
    db.groups.push({ id: groupId, name: 'عشاق التقنية', creator_id: users[0].id, created_at: new Date().toISOString() });
    db.group_members.push(
        { group_id: groupId, user_id: users[0].id, role: 'admin' },
        { group_id: groupId, user_id: users[2].id, role: 'member' }
    );

    // ========== استطلاع ==========
    const pollId = uuidv4();
    db.polls.push({
        id: pollId,
        question: 'ما أفضل لغة برمجة في رأيك؟',
        options: [
            { text: 'JavaScript', votes: 0 },
            { text: 'Python', votes: 0 },
            { text: 'Java', votes: 0 },
            { text: 'C++', votes: 0 }
        ],
        creator_id: users[0].id,
        created_at: new Date().toISOString()
    });

    // ========== حدث ==========
    const eventId = uuidv4();
    db.events.push({
        id: eventId,
        title: 'ملتقى Ramz-X السنوي',
        date: '2026-08-20',
        location: 'الرياض، مركز المؤتمرات',
        creator_id: users[0].id,
        attendees: [users[1].id, users[2].id],
        created_at: new Date().toISOString()
    });

    // ========== إشعارات ==========
    db.notifications.push(
        { id: uuidv4(), user_id: users[0].id, type: 'like', actor_id: users[1].id, reference_id: posts[0].id, is_read: false, created_at: new Date().toISOString() },
        { id: uuidv4(), user_id: users[1].id, type: 'follow', actor_id: users[0].id, reference_id: null, is_read: false, created_at: new Date().toISOString() },
        { id: uuidv4(), user_id: users[2].id, type: 'comment', actor_id: users[0].id, reference_id: posts[2].id, is_read: true, created_at: new Date().toISOString() }
    );
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

// ---------- Auth Middleware ----------
function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });
    }
    const token = header.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'جلسة غير صالحة' });
    }
}

// ========== API Routes ==========

// ---------- Auth ----------
app.post('/api/auth/signup', async (req, res) => {
    const { email, password, username } = req.body;
    const db = readDB();
    if (db.users.find(u => u.email === email || u.username === username)) {
        return res.status(400).json({ error: 'البريد أو اسم المستخدم موجود مسبقاً' });
    }
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
        coins: 100,
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
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'بيانات غير صحيحة' });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser, token });
});

// ---------- Profile ----------
app.get('/api/profiles/:id', (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const { password, ...safe } = user;
    safe.followersCount = db.follows.filter(f => f.following_id === user.id).length;
    safe.followingCount = db.follows.filter(f => f.follower_id === user.id).length;
    safe.postsCount = db.posts.filter(p => p.author_id === user.id && !p.is_hidden).length;
    res.json(safe);
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
    }
    db.follows.push({ id: uuidv4(), follower_id: req.userId, following_id, created_at: new Date().toISOString() });
    addNotification(db, following_id, 'follow', req.userId);
    writeDB(db);
    res.json({ following: true });
});

app.get('/api/follows/status/:targetId', authMiddleware, (req, res) => {
    const db = readDB();
    const following = db.follows.some(f => f.follower_id === req.userId && f.following_id === req.params.targetId);
    res.json({ following });
});

// ---------- Posts ----------
app.get('/api/posts', (req, res) => {
    const db = readDB();
    const { limit = 10, cursor, author_id } = req.query;
    let posts = db.posts.filter(p => !p.is_hidden).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (author_id) posts = posts.filter(p => p.author_id === author_id);
    if (cursor) posts = posts.filter(p => p.created_at < cursor);
    const total = posts.length;
    posts = posts.slice(0, parseInt(limit));
    const enriched = posts.map(p => {
        const author = db.users.find(u => u.id === p.author_id);
        return {
            ...p,
            author: author ? {
                username: author.username,
                avatar_url: author.avatar_url,
                verified: author.verified,
                top_contributor: author.top_contributor
            } : null
        };
    });
    res.json({ data: enriched, nextCursor: posts.length ? posts[posts.length - 1].created_at : null, total });
});

app.post('/api/posts', authMiddleware, upload.fields([{ name: 'image' }, { name: 'video' }, { name: 'audio' }]), (req, res) => {
    const db = readDB();
    const { title, content, category, hashtag, location, scheduled_at } = req.body;
    const image_url = req.files?.image?.[0] ? `/uploads/${req.files.image[0].filename}` : null;
    const video_url = req.files?.video?.[0] ? `/uploads/${req.files.video[0].filename}` : null;
    const audio_url = req.files?.audio?.[0] ? `/uploads/${req.files.audio[0].filename}` : null;
    const post = {
        id: uuidv4(),
        author_id: req.userId,
        title,
        content,
        category,
        hashtag,
        location,
        image_url,
        video_url,
        audio_url,
        likes_count: 0,
        comments_count: 0,
        views_count: 0,
        reposts_count: 0,
        favorites_count: 0,
        is_hidden: false,
        is_pinned: false,
        scheduled_at: scheduled_at || null,
        created_at: new Date().toISOString()
    };
    if (scheduled_at) {
        db.scheduled_posts.push(post);
    } else {
        db.posts.push(post);
    }
    writeDB(db);
    res.status(201).json(post);
});

app.post('/api/posts/:id/like', authMiddleware, (req, res) => {
    const db = readDB();
    const post = db.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'منشور غير موجود' });
    const existing = db.likes.find(l => l.post_id === post.id && l.user_id === req.userId);
    if (existing) {
        db.likes = db.likes.filter(l => l.id !== existing.id);
        post.likes_count = Math.max(0, post.likes_count - 1);
        writeDB(db);
        return res.json({ liked: false, likes_count: post.likes_count });
    }
    db.likes.push({ id: uuidv4(), post_id: post.id, user_id: req.userId, created_at: new Date().toISOString() });
    post.likes_count++;
    if (post.author_id !== req.userId) addNotification(db, post.author_id, 'like', req.userId, post.id);
    writeDB(db);
    res.json({ liked: true, likes_count: post.likes_count });
});

app.post('/api/posts/:id/save', authMiddleware, (req, res) => {
    const db = readDB();
    const post = db.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'منشور غير موجود' });
    const existing = db.favorites.find(f => f.post_id === post.id && f.user_id === req.userId);
    if (existing) {
        db.favorites = db.favorites.filter(f => f.id !== existing.id);
        post.favorites_count = Math.max(0, post.favorites_count - 1);
        writeDB(db);
        return res.json({ saved: false, favorites_count: post.favorites_count });
    }
    db.favorites.push({ id: uuidv4(), post_id: post.id, user_id: req.userId, created_at: new Date().toISOString() });
    post.favorites_count++;
    writeDB(db);
    res.json({ saved: true, favorites_count: post.favorites_count });
});

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
        return res.json({ reposted: false, reposts_count: original.reposts_count });
    }
    const user = db.users.find(u => u.id === req.userId);
    const newPost = {
        id: uuidv4(),
        author_id: req.userId,
        title: original.title,
        content: `🔄 أعاد ${user.username} نشر منشور @${original.author_id}\n\n${original.content}`,
        image_url: original.image_url,
        video_url: original.video_url,
        category: original.category,
        hashtag: original.hashtag,
        likes_count: 0,
        comments_count: 0,
        views_count: 0,
        reposts_count: 0,
        favorites_count: 0,
        is_hidden: false,
        is_pinned: false,
        created_at: new Date().toISOString()
    };
    db.posts.push(newPost);
    db.reposts.push({ id: uuidv4(), user_id: req.userId, original_post_id: original.id, new_post_id: newPost.id });
    original.reposts_count++;
    if (original.author_id !== req.userId) addNotification(db, original.author_id, 'repost', req.userId, original.id);
    writeDB(db);
    res.json({ reposted: true, reposts_count: original.reposts_count });
});

app.post('/api/posts/:id/pin', authMiddleware, (req, res) => {
    const db = readDB();
    const post = db.posts.find(p => p.id === req.params.id);
    if (!post || post.author_id !== req.userId) return res.status(403).json({ error: 'غير مصرح' });
    post.is_pinned = !post.is_pinned;
    writeDB(db);
    res.json({ is_pinned: post.is_pinned });
});

app.post('/api/posts/:id/view', (req, res) => {
    const db = readDB();
    const post = db.posts.find(p => p.id === req.params.id);
    if (post) {
        post.views_count++;
        writeDB(db);
    }
    res.json({ views_count: post?.views_count || 0 });
});

// ---------- Comments ----------
app.get('/api/posts/:id/comments', (req, res) => {
    const db = readDB();
    const comments = db.comments
        .filter(c => c.post_id === req.params.id && !c.parent_id)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
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
        text,
        image_url,
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

app.post('/api/comments/:id/like', authMiddleware, (req, res) => {
    const db = readDB();
    const comment = db.comments.find(c => c.id === req.params.id);
    if (!comment) return res.status(404).json({ error: 'تعليق غير موجود' });
    const existing = db.comment_likes.find(l => l.comment_id === comment.id && l.user_id === req.userId);
    if (existing) {
        db.comment_likes = db.comment_likes.filter(l => l.id !== existing.id);
        comment.likes_count = Math.max(0, comment.likes_count - 1);
        writeDB(db);
        return res.json({ liked: false, likes_count: comment.likes_count });
    }
    db.comment_likes.push({ id: uuidv4(), comment_id: comment.id, user_id: req.userId });
    comment.likes_count++;
    writeDB(db);
    res.json({ liked: true, likes_count: comment.likes_count });
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
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date().toISOString()
    };
    db.stories.push(story);
    writeDB(db);
    res.status(201).json(story);
});

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
        const messages = db.messages.filter(m => m.conversation_id === c.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const lastMessage = messages[0];
        const unread = messages.filter(m => m.sender_id !== req.userId && !m.is_read).length;
        return {
            id: c.id,
            otherUser: otherUser ? {
                id: otherUser.id,
                username: otherUser.username,
                avatar_url: otherUser.avatar_url,
                is_following: db.follows.some(f => f.follower_id === req.userId && f.following_id === otherUser.id)
            } : null,
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
    const msgs = db.messages
        .filter(m => m.conversation_id === req.params.id)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
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

app.put('/api/conversations/:id/read', authMiddleware, (req, res) => {
    const db = readDB();
    db.messages.forEach(m => {
        if (m.conversation_id === req.params.id && m.sender_id !== req.userId) m.is_read = true;
    });
    writeDB(db);
    res.json({ success: true });
});

// ---------- Notifications ----------
app.get('/api/notifications', authMiddleware, (req, res) => {
    const db = readDB();
    const notifs = db.notifications
        .filter(n => n.user_id === req.userId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const enriched = notifs.map(n => {
        const actor = db.users.find(u => u.id === n.actor_id);
        return {
            ...n,
            actor: actor ? { username: actor.username, avatar_url: actor.avatar_url } : null
        };
    });
    res.json(enriched);
});

app.put('/api/notifications/read', authMiddleware, (req, res) => {
    const db = readDB();
    db.notifications.forEach(n => {
        if (n.user_id === req.userId) n.is_read = true;
    });
    writeDB(db);
    res.json({ success: true });
});

// ---------- Search ----------
app.get('/api/search', (req, res) => {
    const { q } = req.query;
    if (!q) return res.json({ users: [], posts: [] });
    const db = readDB();
    const lower = q.toLowerCase();
    const users = db.users
        .filter(u => u.username.toLowerCase().includes(lower) || (u.bio || '').toLowerCase().includes(lower))
        .map(({ password, ...u }) => u);
    const posts = db.posts.filter(p =>
        (p.title || '').toLowerCase().includes(lower) ||
        (p.content || '').toLowerCase().includes(lower) ||
        (p.hashtag || '').toLowerCase().includes(lower)
    );
    res.json({ users, posts });
});

// ---------- Groups ----------
app.get('/api/groups', (req, res) => {
    res.json(readDB().groups);
});

app.post('/api/groups', authMiddleware, (req, res) => {
    const db = readDB();
    const group = {
        id: uuidv4(),
        name: req.body.name,
        creator_id: req.userId,
        created_at: new Date().toISOString()
    };
    db.groups.push(group);
    db.group_members.push({ group_id: group.id, user_id: req.userId, role: 'admin' });
    writeDB(db);
    res.status(201).json(group);
});

// ---------- Polls ----------
app.get('/api/polls', (req, res) => {
    res.json(readDB().polls);
});

app.post('/api/polls', authMiddleware, (req, res) => {
    const db = readDB();
    const poll = {
        id: uuidv4(),
        question: req.body.question,
        options: req.body.options.map(o => ({ text: o, votes: 0 })),
        creator_id: req.userId,
        created_at: new Date().toISOString()
    };
    db.polls.push(poll);
    writeDB(db);
    res.status(201).json(poll);
});

app.post('/api/polls/:id/vote', authMiddleware, (req, res) => {
    const db = readDB();
    const poll = db.polls.find(p => p.id === req.params.id);
    if (!poll) return res.status(404).json({ error: 'استطلاع غير موجود' });
    if (db.votes.find(v => v.poll_id === poll.id && v.user_id === req.userId)) {
        return res.status(400).json({ error: 'لقد قمت بالتصويت مسبقاً' });
    }
    const optionIndex = req.body.option_index;
    if (optionIndex < 0 || optionIndex >= poll.options.length) return res.status(400).json({ error: 'خيار غير صالح' });
    poll.options[optionIndex].votes++;
    db.votes.push({ id: uuidv4(), poll_id: poll.id, user_id: req.userId, option_index: optionIndex, created_at: new Date().toISOString() });
    writeDB(db);
    res.json(poll);
});

// ---------- Events ----------
app.get('/api/events', (req, res) => {
    res.json(readDB().events);
});

app.post('/api/events', authMiddleware, (req, res) => {
    const db = readDB();
    const event = {
        id: uuidv4(),
        title: req.body.title,
        date: req.body.date,
        location: req.body.location,
        creator_id: req.userId,
        attendees: [],
        created_at: new Date().toISOString()
    };
    db.events.push(event);
    writeDB(db);
    res.status(201).json(event);
});

app.post('/api/events/:id/attend', authMiddleware, (req, res) => {
    const db = readDB();
    const event = db.events.find(e => e.id === req.params.id);
    if (!event) return res.status(404).json({ error: 'حدث غير موجود' });
    if (!event.attendees.includes(req.userId)) event.attendees.push(req.userId);
    writeDB(db);
    res.json(event);
});

// ---------- Serve Frontend ----------
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------- Start Server ----------
app.listen(PORT, () => {
    console.log(`🚀 Ramz-X Production server running on http://localhost:${PORT}`);
});

module.exports = app;
