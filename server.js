const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const app = express();

// ==========================================
// 【データベース保存先の設定】
// Renderの永続ディスク(/var/data/)があればそこを使い、無ければローカルで起動します
// ==========================================
const dbDir = '/var/data';
const dbPath = fs.existsSync(dbDir) ? path.join(dbDir, 'sapyonov.db') : './sapyonov.db';
const db = new sqlite3.Database(dbPath);

// ==========================================
// 【環境変数の読み込み】
// トークンなどの重要情報はRenderの管理画面（Environment Variables）から読み込みます
// ==========================================
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CALLBACK_URL = process.env.DISCORD_CALLBACK_URL; // 例: https://onrender.com
const ALWAYS_ADMIN_ID = '1434872648101396511';       // 常時管理者のDiscordユーザーID

// --- データベース初期化 ---
db.serialize(() => {
    // 記事テーブル (status: 0=承認待ち, 1=承認済み)
    db.run(`CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        tags TEXT,
        author_id TEXT,
        author_name TEXT,
        status INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    // 管理者ユーザーテーブル
    db.run(`CREATE TABLE IF NOT EXISTS admins (
        user_id TEXT PRIMARY KEY
    )`);
    // 通知チャンネル設定保存テーブル
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);
});

// ==========================================
// 【🤖 DISCORD BOT 機能の部分】
// ==========================================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// スラッシュコマンド（/setchannel）の登録設定
const commands = [
    new SlashCommandBuilder()
        .setName('setchannel')
        .setDescription('記事が承認された際、自動通知するチャンネルをこの場所に設定します。')
].map(command => command.toJSON());

// トークンが設定されている場合のみBotとコマンドを起動
if (BOT_TOKEN && CLIENT_ID) {
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    (async () => {
        try {
            console.log('スラッシュコマンドを登録中...');
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
            console.log('スラッシュコマンドの登録に成功しました。');
        } catch (error) {
            console.error('コマンド登録エラー:', error);
        }
    })();

    // スラッシュコマンドを受け取ったときの処理
    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === 'setchannel') {
            const userId = interaction.user.id;

            // コマンド実行者が常時管理者か、登録された管理者かチェック
            if (userId !== ALWAYS_ADMIN_ID) {
                const row = await new Promise((resolve) => {
                    db.get('SELECT user_id FROM admins WHERE user_id = ?', [userId], (err, r) => resolve(r));
                });
                if (!row) {
                    return interaction.reply({ content: '❌ このコマンドを実行する権限がありません。', ephemeral: true });
                }
            }

            // チャンネルIDをデータベースに保存
            const channelId = interaction.channelId;
            db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['notify_channel_id', channelId], (err) => {
                if (err) return interaction.reply({ content: '❌ 設定の保存に失敗しました。', ephemeral: true });
                interaction.reply({ content: `✅ 記事の通知先をこのチャンネル（<#${channelId}>）に設定しました！` });
            });
        }
    });

    client.login(BOT_TOKEN).catch(console.error);
}

// ==========================================
// 【🌐 WEBサイト (Express) 機能の部分】
// ==========================================
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'sapyonov-secret', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// 各種設定がある場合のみPassport（ログイン戦略）を有効化
if (CLIENT_ID && CLIENT_SECRET && CALLBACK_URL) {
    passport.use(new DiscordStrategy({
        clientID: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        callbackURL: CALLBACK_URL,
        scope: ['identify']
    }, (accessToken, refreshToken, profile, done) => {
        return done(null, profile);
    }));
}

// 権限チェック関数
function checkAdmin(userId, callback) {
    if (userId === ALWAYS_ADMIN_ID) return callback(true);
    db.get('SELECT user_id FROM admins WHERE user_id = ?', [userId], (err, row) => {
        callback(!!row);
    });
}

// 共通変数をテンプレートに渡すミドルウェア
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    res.locals.isAdmin = false;
    res.locals.serverLink = 'https://discord.gg';
    
    if (req.user) {
        checkAdmin(req.user.id, (isAdmin) => {
            res.locals.isAdmin = isAdmin;
            next();
        });
    } else {
        next();
    }
});

// --- ルートハンドラー ---

// トップページ（承認済みの記事一覧）
app.get('/', (req, res) => {
    const tagQuery = req.query.tag;
    let query = 'SELECT * FROM posts WHERE status = 1 ORDER BY created_at DESC';
    let params = [];

    if (tagQuery) {
        query = 'SELECT * FROM posts WHERE status = 1 AND tags LIKE ? ORDER BY created_at DESC';
        params = [`%#${tagQuery}%`];
    }

    db.all(query, params, (err, posts) => {
        res.render('index', { posts, currentTag: tagQuery || '' });
    });
});

// 記事投稿ページ
app.get('/post', (req, res) => {
    if (!req.user) return res.redirect('/auth/discord');
    res.render('post');
});

// 記事投稿処理
app.post('/post', (req, res) => {
    if (!req.user) return res.status(401).send('ログインが必要です');
    const { title, content, tags } = req.body;
    
    // スペース区切りのタグを #タグ 形式に自動整形
    const formattedTags = tags.split(' ')
        .map(t => t.startsWith('#') ? t : `#${t}`)
        .filter(t => t !== '#')
        .join(' ');

    db.run(
        'INSERT INTO posts (title, content, tags, author_id, author_name, status) VALUES (?, ?, ?, ?, ?, ?)',
        [title, content, formattedTags, req.user.id, req.user.username, 0],
        () => res.redirect('/?msg=pending')
    );
});

// 管理画面
app.get('/admin', (req, res) => {
    if (!res.locals.isAdmin) return res.status(403).send('権限がありません');
    
    db.all('SELECT * FROM posts WHERE status = 0', [], (err, pendingPosts) => {
        db.all('SELECT * FROM admins', [], (err, adminUsers) => {
            res.render('admin', { pendingPosts, adminUsers, alwaysAdmin: ALWAYS_ADMIN_ID });
        });
    });
});

// 記事の承認・却下 ＆ Discord Botへの自動通知（合体連携）
app.post('/admin/post/:id/:action', (req, res) => {
    if (!res.locals.isAdmin) return res.status(403).send('権限がありません');
    const { id, action } = req.params;

    if (action === 'approve') {
        db.get('SELECT * FROM posts WHERE id = ?', [id], (err, post) => {
            if (post) {
                db.run('UPDATE posts SET status = 1 WHERE id = ?', [id], () => {
                    
                    // データベースから保存されている通知先チャンネルIDを取得してBotからメッセージ送信
                    db.get("SELECT value FROM settings WHERE key = 'notify_channel_id'", [], (err, row) => {
                        if (row && row.value && BOT_TOKEN) {
                            const channelId = row.value;
                            const channel = client.channels.cache.get(channelId);
                            
                            if (channel) {
                                const embed = new EmbedBuilder()
                                    .setTitle(`📢 新着記事が公開されました！: ${post.title}`)
                                    .setDescription(post.content)
                                    .setColor(0x57F287)
                                    .addFields(
                                        { name: 'タグ', value: post.tags || 'なし', inline: true },
                                        { name: '投稿者', value: post.author_name, inline: true }
                                    )
                                    .setTimestamp();

                                channel.send({ embeds: [embed] }).catch(console.error);
                            }
                        }
                    });

                    res.redirect('/admin');
                });
            } else {
                res.redirect('/admin');
            }
        });
    } else {
        db.run('DELETE FROM posts WHERE id = ?', [id], () => res.redirect('/admin'));
    }
});

// 管理者権限の付与（ユーザーID入力）
app.post('/admin/grant', (req, res) => {
    if (!res.locals.isAdmin) return res.status(403).send('権限がありません');
    const { target_id } = req.body;
    if (!target_id) return res.redirect('/admin');

    db.run('INSERT OR IGNORE INTO admins (user_id) VALUES (?)', [target_id], () => {
        res.redirect('/admin');
    });
});

// Discord認証ルート
app.get('/auth/discord', passport.authenticate('passport-discord'));
app.get('/auth/discord/callback', passport.authenticate('passport-discord', {
    failureRedirect: '/'
}), (req, res) => res.redirect('/'));

app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/');
    });
});

// ==========================================
// 【HTML/EJS 画面ファイルの自動生成機能】
// ==========================================
const viewsDir = path.join(__dirname, 'views');
if (!fs.existsSync(viewsDir)) fs.mkdirSync(viewsDir);

const headerHtml = `
    <header style="background:#23272a; padding:15px; display:flex; justify-content:space-between; align-items:center; color:white;">
        <h1 style="margin:0;"><a href="/" style="color:white; text-decoration:none;">SAPYONOV</a></h1>
        <div>
            <a href="<%= serverLink %>" target="_blank" style="background:#5865F2; color:white; padding:8px 15px; border-radius:5px; text-decoration:none; margin-right:10px; font-weight:bold;">管理サーバー</a>
            <% if (user) { %>
                <span>ようこそ <%= user.username %> さん</span>
                <a href="/post" style="color:white; margin-left:15px;">記事投稿</a>
                <% if (isAdmin) { %>
                    <a href="/admin" style="color:gold; margin-left:15px; font-weight:bold;">管理画面</a>
                <% } %>
                <a href="/logout" style="color:#ccc; margin-left:15px;">ログアウト</a>
            <% } else { %>
                <a href="/auth/discord" style="background:#5865F2; color:white; padding:8px 15px; border-radius:5px; text-decoration:none;">Discordでログイン</a>
            <% } %>
        </div>
    </header>
`;

fs.writeFileSync(path.join(viewsDir, 'index.ejs'), `
<!DOCTYPE html>
<html>
<head><title>SAPYONOV</title></head>
<body style="font-family:sans-serif; margin:0; background:#f4f4f4;">
    <%- include('header') %>
    <main style="max-width:800px; margin:20px auto; padding:20px; background:white; border-radius:8px;">
        <h2>記事一覧 <%= currentTag ? '（タグ: ' + currentTag + '）' : '' %></h2>
        <% if (currentTag) { %><a href="/">すべての記事を表示</a><% } %>
        <% posts.forEach(post => { %>
            <div style="border-bottom:1px solid #eee; padding:15px 0;">
                <h3><%= post.title %></h3>
                <p style="white-space:pre-wrap;"><%= post.content %></p>
                <div>
                    <% post.tags.split(' ').forEach(tag => { if(tag) { %>
                        <a href="/?tag=<%= tag.replace('#','') %>" style="background:#e1e1e1; padding:3px 8px; border-radius:3px; text-decoration:none; color:#333; font-size:12px; margin-right:5px;"><%= tag %></a>
                    <% } }) %>
                </div>
                <small style="color:#666;">投稿者: <%= post.author_name %> (<%= post.created_at %>)</small>
            </div>
        <% }) %>
    </main>
</body>
</html>
`);

fs.writeFileSync(path.join(viewsDir, 'post.ejs'), `
<!DOCTYPE html>
<html>
<head><title>記事投稿 - SAPYONOV</title></head>
<body style="font-family:sans-serif; margin:0; background:#f4f4f4;">
    <%- include('header') %>
    <main style="max-width:600px; margin:20px auto; padding:20px; background:white; border-radius:8px;">
        <h2>新しい記事を投稿（管理者の承認後に公開されます）</h2>
        <form action="/post" method="POST">
            <div style="margin-bottom:15px;">
                <label>タイトル</label><br>
                <input type="text" name="title" required style="width:100%; padding:8px; box-sizing:border-box;">
            </div>
            <div style="margin-bottom:15px;">
                <label>内容</label><br>
                <textarea name="content" rows="10" required style="width:100%; padding:8px; box-sizing:border-box;"></textarea>
            </div>
            <div style="margin-bottom:15px;">
                <label>タグ（スペース区切りで複数入力可。例: ゲーム 攻略）</label><br>
                <input type="text" name="tags" style="width:100%; padding:8px; box-sizing:border-box;">
            </div>
            <button type="submit" style="background:#2ea44f; color:white; padding:10px 20px; border:none; border-radius:5px; cursor:pointer;">投稿申請</button>
        </form>
    </main>
</body>
</html>
`);

fs.writeFileSync(path.join(viewsDir, 'admin.ejs'), `
<!DOCTYPE html>
<html>
<head><title>管理画面 - SAPYONOV</title></head>
<body style="font-family:sans-serif; margin:0; background:#f4f4f4;">
    <%- include('header') %>
    <main style="max-width:800px; margin:20px auto; padding:20px; background:white; border-radius:8px;">
        <h2>管理権限の付与</h2>
        <form action="/admin/grant" method="POST" style="margin-bottom:30px;">
            <input type="text" name="target_id" placeholder="ユーザーIDを入力" required style="padding:8px; width:250px;">
            <button type="submit" style="padding:8px 15px;">管理者権限を与える</button>
        </form>

        <h2>未承認の記事一覧</h2>
        <% if (pendingPosts.length === 0) { %><p>承認待ちの記事はありません。</p><% } %>
        <% pendingPosts.forEach(post => { %>
            <div style="border:1px solid #ccc; padding:15px; margin-bottom:15px; border-radius:5px;">
                <h3><%= post.title %></h3>
                <p style="white-space:pre-wrap;"><%= post.content %></p>
                <p>タグ: <%= post.tags %></p>
                <small>申請者: <%= post.author_name %> (ID: <%= post.author_id %>)</small>
                <div style="margin-top:10px;">
                    <form action="/admin/post/<%= post.id %>/approve" method="POST" style="display:inline;">
                        <button type="submit" style="background:#2ea44f; color:white; border:none; padding:5px 10px; cursor:pointer;">承認する</button>
                    </form>
                    <form action="/admin/post/<%= post.id %>/reject" method="POST" style="display:inline; margin-left:10px;">
                        <button type="submit" style="background:#cf222e; color:white; border:none; padding:5px 10px; cursor:pointer;">却下・削除</button>
                    </form>
                </div>
            </div>
        <% }) %>
    </main>
</body>
</html>
`);

fs.writeFileSync(path.join(viewsDir, 'header.ejs'), headerHtml);

// --- ポート設定 (Renderなどの外部サーバー環境に対応) ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
