const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Database helpers ----------
const DB_PATH = path.join(__dirname, 'db.json');

function readDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch {
        return {
            users: [],
            posts: [],
            likes: [],
            comments: [],
            bookmarks: [],
            follows: [],
            notifications: [],
            stories: [],
            conversations: [],
            messages: [],
            gifts: [],
            views: []
        };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function addNotification(db, userId, type, message, relatedId = null) {
    const user = db.users.find(u => u.id == userId);
    if (user && user.preferences?.notifications?.[type] === false) return;

    db.notifications.unshift({
        id: Date.now(),
        user_id: userId,
        type,
        message,
        related_id: relatedId,
        read: false,
        created_at: new Date().toISOString()
    });
}

// ---------- Initialize database ----------
function initDB() {
    const db = readDB();

    if (db.users.length === 0) {
        db.users.push(
            {
                id: 1,
                username: 'زائر',
                password: '123',
                name: 'زائر المنصة',
                bio: 'مرحباً بكم في منشوراتي',
                avatar: '',
                coins: 500,
                preferences: {
                    theme: 'light',
                    language: 'ar',
                    privacy: 'public',
                    notifications: {
                        likes: true,
                        comments: true,
                        follows: true,
                        retweets: true,
                        gifts: true
                    }
                },
                created_at: new Date().toISOString()
            },
            {
                id: 2,
                username: 'احمد',
                password: '123',
                name: 'أحمد',
                bio: 'مطور محتوى',
                avatar: '',
                coins: 200,
                preferences: {
                    theme: 'light',
                    language: 'ar',
                    privacy: 'public',
                    notifications: {
                        likes: true,
                        comments: true,
                        follows: true,
                        retweets: true,
                        gifts: true
                    }
                },
                created_at: new Date().toISOString()
            }
        );
    }

    if (db.posts.length === 0) {
        db.posts.push(
            {
                id: 1,
                author_id: 1,
                author: 'زائر',
                title: 'مرحباً بكم في منشوراتي',
                content: 'هذا أول منشور تجريبي في المنصة الجديدة.',
                tags: 'ترحيب',
                image_url: '',
                video_url: null,
                likes_count: 2,
                comments_count: 1,
                retweet_count: 0,
                view_count: 5,
                is_retweet: false,
                retweet_of: null,
                quote_text: null,
                created_at: new Date().toISOString()
            },
            {
                id: 2,
                author_id: 2,
                author: 'احمد',
                title: 'تجربة تقنية',
                content: 'منشور من أحمد حول التقنية.',
                tags: 'تقنية',
                image_url: '',
                video_url: null,
                likes_count: 1,
                comments_count: 0,
                retweet_count: 0,
                view_count: 3,
                is_retweet: false,
                retweet_of: null,
                quote_text: null,
                created_at: new Date().toISOString()
            }
        );
    }

    if (!db.follows) db.follows = [];
    if (!db.notifications) db.notifications = [];
    if (!db.stories) db.stories = [];
    if (!db.conversations) db.conversations = [];
    if (!db.messages) db.messages = [];
    if (!db.gifts) db.gifts = [];
    if (!db.views) db.views = [];

    writeDB(db);
    return db;
}

// ---------- Clean expired stories ----------
function cleanExpiredStories() {
    const db = readDB();
    const now = Date.now();
    db.stories = db.stories.filter(s => now - new Date(s.created_at).getTime() < 24 * 60 * 60 * 1000);
    writeDB(db);
}

// ---------- Auth Routes ----------
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(401).json({ error: 'بيانات غير صحيحة' });
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
});

app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    if (db.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
    }
    const newUser = {
        id: db.users.length ? Math.max(...db.users.map(u => u.id)) + 1 : 3,
        username,
        password,
        name: username,
        bio: '',
        avatar: '',
        coins: 100,
        preferences: {
            theme: 'light',
            language: 'ar',
            privacy: 'public',
            notifications: { likes: true, comments: true, follows: true, retweets: true, gifts: true }
        },
        created_at: new Date().toISOString()
    };
    db.users.push(newUser);
    writeDB(db);
    const { password: _, ...safeUser } = newUser;
    res.status(201).json(safeUser);
});

// ---------- User & Profile Routes ----------
app.get('/api/users/:id', (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id == req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const { password, ...safe } = user;
    safe.followersCount = db.follows.filter(f => f.following_id == user.id).length;
    safe.followingCount = db.follows.filter(f => f.follower_id == user.id).length;
    safe.postsCount = db.posts.filter(p => p.author_id == user.id).length;
    res.json(safe);
});

app.put('/api/users/:id', (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id == req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const { name, bio, avatar, password } = req.body;
    if (name !== undefined) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;
    if (password) user.password = password;
    writeDB(db);
    const { password: _, ...safe } = user;
    res.json(safe);
});

// ---------- Follow Routes ----------
app.post('/api/follows', (req, res) => {
    const { follower_id, following_id } = req.body;
    if (follower_id == following_id) return res.status(400).json({ error: 'لا يمكن متابعة نفسك' });
    const db = readDB();
    const existing = db.follows.find(f => f.follower_id == follower_id && f.following_id == following_id);
    if (existing) {
        db.follows = db.follows.filter(f => !(f.follower_id == follower_id && f.following_id == following_id));
        writeDB(db);
        return res.json({ following: false });
    } else {
        db.follows.push({ id: Date.now(), follower_id, following_id, created_at: new Date().toISOString() });
        const follower = db.users.find(u => u.id == follower_id);
        addNotification(db, following_id, 'follows', `${follower?.username || 'مستخدم'} بدأ بمتابعتك`);
        writeDB(db);
        return res.json({ following: true });
    }
});

app.get('/api/follows/:userId/status', (req, res) => {
    const { targetId } = req.query;
    const db = readDB();
    const following = db.follows.some(f => f.follower_id == req.params.userId && f.following_id == targetId);
    res.json({ following });
});

app.get('/api/follows/:userId/followers', (req, res) => {
    const db = readDB();
    const followerIds = db.follows.filter(f => f.following_id == req.params.userId).map(f => f.follower_id);
    const users = db.users.filter(u => followerIds.includes(u.id)).map(({ password, ...u }) => u);
    res.json(users);
});

app.get('/api/follows/:userId/following', (req, res) => {
    const db = readDB();
    const followingIds = db.follows.filter(f => f.follower_id == req.params.userId).map(f => f.following_id);
    const users = db.users.filter(u => followingIds.includes(u.id)).map(({ password, ...u }) => u);
    res.json(users);
});

// ---------- Post Routes ----------
app.get('/api/posts', (req, res) => {
    const { q, limit, offset, author_id, type } = req.query;
    const db = readDB();
    let posts = [...db.posts];

    if (type === 'reels') posts = posts.filter(p => p.video_url);
    posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (q) {
        const query = q.toLowerCase();
        posts = posts.filter(p => p.title.toLowerCase().includes(query) || p.content.toLowerCase().includes(query) || p.author.toLowerCase().includes(query));
    }
    if (author_id) {
        posts = posts.filter(p => p.author_id == author_id);
    }

    const total = posts.length;
    const start = parseInt(offset) || 0;
    const limitNum = parseInt(limit) || 10;
    posts = posts.slice(start, start + limitNum);

    const enriched = posts.map(p => {
        if (p.is_retweet && p.retweet_of) {
            const orig = db.posts.find(po => po.id == p.retweet_of);
            return { ...p, original_post: orig || null };
        }
        return { ...p, original_post: null };
    });

    res.json({ posts: enriched, total });
});

app.post('/api/posts', (req, res) => {
    const { author_id, author, title, content, tags, image_url, video_url, is_retweet, retweet_of, quote_text } = req.body;
    if (!author_id || !author) return res.status(400).json({ error: 'المؤلف مطلوب' });
    if (!is_retweet && (!title || !content)) return res.status(400).json({ error: 'العنوان والمحتوى مطلوبان' });

    const db = readDB();
    const newPost = {
        id: Date.now(),
        author_id,
        author,
        title: title || '',
        content: content || '',
        tags: tags || null,
        image_url: image_url || '',
        video_url: video_url || null,
        likes_count: 0,
        comments_count: 0,
        retweet_count: 0,
        view_count: 0,
        is_retweet: is_retweet || false,
        retweet_of: retweet_of || null,
        quote_text: quote_text || null,
        created_at: new Date().toISOString()
    };

    if (is_retweet && retweet_of) {
        const orig = db.posts.find(p => p.id == retweet_of);
        if (orig) {
            orig.retweet_count = (orig.retweet_count || 0) + 1;
            addNotification(db, orig.author_id, 'retweets', `${author} أعاد تغريد منشورك`, newPost.id);
        }
    }

    db.posts.unshift(newPost);
    writeDB(db);
    res.status(201).json(newPost);
});

app.post('/api/posts/:id/view', (req, res) => {
    const db = readDB();
    const post = db.posts.find(p => p.id == req.params.id);
    if (post) {
        post.view_count = (post.view_count || 0) + 1;
        writeDB(db);
    }
    res.json({ view_count: post?.view_count || 0 });
});

// ---------- Like Routes ----------
app.get('/api/likes/:postId/:userId', (req, res) => {
    const db = readDB();
    const liked = db.likes.some(l => l.post_id == req.params.postId && l.user_id == req.params.userId);
    res.json({ liked });
});

app.post('/api/likes', (req, res) => {
    const { post_id, user_id } = req.body;
    const db = readDB();
    const post = db.posts.find(p => p.id == post_id);
    if (!post) return res.status(404).json({ error: 'المنشور غير موجود' });

    const existingIndex = db.likes.findIndex(l => l.post_id == post_id && l.user_id == user_id);
    if (existingIndex !== -1) {
        db.likes.splice(existingIndex, 1);
        post.likes_count = Math.max(0, post.likes_count - 1);
        writeDB(db);
        res.json({ liked: false, likes_count: post.likes_count });
    } else {
        db.likes.push({ post_id, user_id, created_at: new Date().toISOString() });
        post.likes_count = (post.likes_count || 0) + 1;
        if (post.author_id !== user_id) {
            const liker = db.users.find(u => u.id == user_id);
            addNotification(db, post.author_id, 'likes', `${liker?.username || 'مستخدم'} أعجب بمنشورك`, post_id);
        }
        writeDB(db);
        res.json({ liked: true, likes_count: post.likes_count });
    }
});

// ---------- Comment Routes ----------
app.get('/api/comments/:postId', (req, res) => {
    const db = readDB();
    const comments = db.comments
        .filter(c => c.post_id == req.params.postId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const enriched = comments.map(c => {
        const user = db.users.find(u => u.id == c.user_id);
        return { ...c, username: user?.username || 'مستخدم' };
    });
    res.json(enriched);
});

app.post('/api/comments', (req, res) => {
    const { post_id, user_id, body } = req.body;
    if (!body) return res.status(400).json({ error: 'نص التعليق مطلوب' });
    const db = readDB();
    const newComment = {
        id: Date.now(),
        post_id,
        user_id,
        body,
        created_at: new Date().toISOString()
    };
    db.comments.push(newComment);
    const post = db.posts.find(p => p.id == post_id);
    if (post) {
        post.comments_count = (post.comments_count || 0) + 1;
        if (post.author_id !== user_id) {
            const commenter = db.users.find(u => u.id == user_id);
            addNotification(db, post.author_id, 'comments', `${commenter?.username || 'مستخدم'} علّق على منشورك`, post_id);
        }
    }
    writeDB(db);
    res.status(201).json(newComment);
});

// ---------- Bookmark Routes ----------
app.get('/api/bookmarks/:postId/:userId', (req, res) => {
    const db = readDB();
    const bookmarked = db.bookmarks.some(b => b.post_id == req.params.postId && b.user_id == req.params.userId);
    res.json({ bookmarked });
});

app.post('/api/bookmarks', (req, res) => {
    const { post_id, user_id } = req.body;
    const db = readDB();
    const existingIndex = db.bookmarks.findIndex(b => b.post_id == post_id && b.user_id == user_id);
    if (existingIndex !== -1) {
        db.bookmarks.splice(existingIndex, 1);
        writeDB(db);
        res.json({ bookmarked: false });
    } else {
        db.bookmarks.push({ post_id, user_id, created_at: new Date().toISOString() });
        writeDB(db);
        res.json({ bookmarked: true });
    }
});

app.get('/api/bookmarks/:userId', (req, res) => {
    const db = readDB();
    const postIds = db.bookmarks.filter(b => b.user_id == req.params.userId).map(b => b.post_id);
    const posts = db.posts.filter(p => postIds.includes(p.id));
    res.json(posts);
});

// ---------- Notification Routes ----------
app.get('/api/notifications/:userId', (req, res) => {
    const db = readDB();
    const notifs = db.notifications
        .filter(n => n.user_id == req.params.userId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(notifs);
});

app.put('/api/notifications/:userId/read', (req, res) => {
    const db = readDB();
    db.notifications.forEach(n => {
        if (n.user_id == req.params.userId) n.read = true;
    });
    writeDB(db);
    res.json({ success: true });
});

// ---------- Story Routes ----------
app.get('/api/stories', (req, res) => {
    cleanExpiredStories();
    const db = readDB();
    res.json(db.stories);
});

app.post('/api/stories', (req, res) => {
    const { user_id, username, avatar, image_url } = req.body;
    const db = readDB();
    const story = {
        id: Date.now(),
        user_id,
        username,
        avatar: avatar || '',
        image_url,
        views: 0,
        created_at: new Date().toISOString()
    };
    db.stories.push(story);
    writeDB(db);
    res.status(201).json(story);
});

// ---------- Reels Routes ----------
app.get('/api/reels', (req, res) => {
    const db = readDB();
    const reels = db.posts.filter(p => p.video_url).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(reels);
});

// ---------- Recommendation Routes ----------
app.get('/api/recommendations/:userId', (req, res) => {
    const db = readDB();
    const userId = parseInt(req.params.userId);
    const followingIds = db.follows.filter(f => f.follower_id == userId).map(f => f.following_id);
    const candidates = db.posts.filter(p => !followingIds.includes(p.author_id) && p.author_id !== userId);
    candidates.sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
    res.json(candidates.slice(0, 10));
});

// ---------- Conversation Routes ----------
app.post('/api/conversations', (req, res) => {
    const { user1_id, user2_id } = req.body;
    const db = readDB();
    let conv = db.conversations.find(c =>
        (c.user1_id == user1_id && c.user2_id == user2_id) ||
        (c.user1_id == user2_id && c.user2_id == user1_id)
    );
    if (!conv) {
        conv = {
            id: Date.now(),
            user1_id,
            user2_id,
            last_message: '',
            last_time: new Date().toISOString(),
            created_at: new Date().toISOString()
        };
        db.conversations.push(conv);
        writeDB(db);
    }
    res.json(conv);
});

app.get('/api/conversations/:userId', (req, res) => {
    const db = readDB();
    const convs = db.conversations
        .filter(c => c.user1_id == req.params.userId || c.user2_id == req.params.userId)
        .map(c => {
            const otherId = c.user1_id == req.params.userId ? c.user2_id : c.user1_id;
            const otherUser = db.users.find(u => u.id == otherId);
            return {
                ...c,
                otherUser: otherUser ? { id: otherUser.id, username: otherUser.username, avatar: otherUser.avatar } : null
            };
        })
        .sort((a, b) => new Date(b.last_time) - new Date(a.last_time));
    res.json(convs);
});

app.get('/api/messages/:convId', (req, res) => {
    const db = readDB();
    const messages = db.messages
        .filter(m => m.conversation_id == req.params.convId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    res.json(messages);
});

app.post('/api/messages', (req, res) => {
    const { conversation_id, sender_id, body } = req.body;
    if (!body) return res.status(400).json({ error: 'نص الرسالة مطلوب' });
    const db = readDB();
    const msg = {
        id: Date.now(),
        conversation_id,
        sender_id,
        body,
        created_at: new Date().toISOString()
    };
    db.messages.push(msg);
    const conv = db.conversations.find(c => c.id == conversation_id);
    if (conv) {
        conv.last_message = body.substring(0, 50);
        conv.last_time = msg.created_at;
    }
    writeDB(db);
    res.status(201).json(msg);
});

// ---------- Settings Routes ----------
app.get('/api/users/:id/settings', (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id == req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({
        name: user.name,
        bio: user.bio,
        avatar: user.avatar,
        coins: user.coins,
        preferences: user.preferences
    });
});

app.put('/api/users/:id/settings', (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id == req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const { name, bio, avatar, password, preferences } = req.body;
    if (name !== undefined) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;
    if (password) user.password = password;
    if (preferences) user.preferences = { ...user.preferences, ...preferences };

    writeDB(db);
    res.json({ success: true });
});

// ---------- Gift Routes ----------
const GIFT_OPTIONS = [
    { id: 'rose', name: '🌹 وردة', cost: 10 },
    { id: 'heart', name: '❤️ قلب', cost: 20 },
    { id: 'star', name: '⭐ نجمة', cost: 30 },
    { id: 'crown', name: '👑 تاج', cost: 50 },
    { id: 'diamond', name: '💎 ماسة', cost: 100 },
    { id: 'rocket', name: '🚀 صاروخ', cost: 200 }
];

app.get('/api/gifts/options', (req, res) => res.json(GIFT_OPTIONS));

app.post('/api/gifts/send', (req, res) => {
    const { sender_id, post_id, gift_type } = req.body;
    const db = readDB();
    const sender = db.users.find(u => u.id == sender_id);
    const post = db.posts.find(p => p.id == post_id);
    if (!sender || !post) return res.status(404).json({ error: 'غير موجود' });

    const giftOption = GIFT_OPTIONS.find(g => g.id === gift_type);
    if (!giftOption) return res.status(400).json({ error: 'هدية غير معروفة' });
    if (sender.coins < giftOption.cost) return res.status(400).json({ error: 'رصيد غير كافٍ' });

    sender.coins -= giftOption.cost;
    const receiver = db.users.find(u => u.id == post.author_id);
    if (receiver) receiver.coins = (receiver.coins || 0) + giftOption.cost;

    const gift = {
        id: Date.now(),
        sender_id,
        receiver_id: post.author_id,
        post_id,
        gift_type,
        gift_name: giftOption.name,
        cost: giftOption.cost,
        created_at: new Date().toISOString()
    };
    db.gifts.push(gift);

    addNotification(db, post.author_id, 'gifts', `${sender.username} أرسل ${giftOption.name} لمنشورك`, post_id);
    writeDB(db);
    res.json({ success: true, sender_coins: sender.coins, gift });
});

app.get('/api/gifts/post/:postId', (req, res) => {
    const db = readDB();
    const gifts = db.gifts.filter(g => g.post_id == req.params.postId);
    res.json(gifts);
});

// ---------- Serve frontend (SPA) ----------
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- Start server ----------
initDB();
cleanExpiredStories();
setInterval(cleanExpiredStories, 60 * 60 * 1000); // كل ساعة

app.listen(PORT, () => {
    console.log(`🚀 Manshoraty server running on http://localhost:${PORT}`);
});

module.exports = app;
