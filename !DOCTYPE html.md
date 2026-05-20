**<!DOCTYPE html>**

**<html lang="ja">**

**<head>**

&#x20;   **<meta charset="UTF-8">**

&#x20;   **<meta name="viewport" content="width=device-width, initial-scale=1.0">**

&#x20;   **<title>SAPYONOVUS - Wiki</title>**

&#x20;   **<style>**

&#x20;       **body { font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa; color: #333; margin: 0; padding: 20px; }**

&#x20;       **.container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }**

&#x20;       **header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 20px; }**

&#x20;       **h1 { margin: 0; color: #222; }**

&#x20;       **.btn { background: #0070f3; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; text-decoration: none; font-size: 14px; }**

&#x20;       **.btn:hover { background: #0051b3; }**

&#x20;       **.auth-box { background: #f0f0f0; padding: 15px; border-radius: 5px; margin-bottom: 20px; }**

&#x20;       **.auth-box input { margin: 5px 0; padding: 8px; width: 95%; border: 1px solid #ccc; border-radius: 4px; }**

&#x20;       **.article { border-left: 4px solid #0070f3; padding-left: 15px; margin-bottom: 30px; }**

&#x20;       **.tag { display: inline-block; background: #e1ecf4; color: #39739d; padding: 2px 6px; border-radius: 3px; font-size: 12px; margin-right: 5px; margin-top: 5px; }**

&#x20;       **.nav-links { margin-top: 15px; display: flex; gap: 10px; }**

&#x20;   **</style>**

**</head>**

**<body>**



**<div class="container">**

&#x20;   **<header>**

&#x20;       **<h1>SAPYONOVUS</h1>**

&#x20;       **<div id="user-status">読み込み中...</div>**

&#x20;   **</header>**



&#x20;   **<!-- ログイン・会員登録エリア -->**

&#x20;   **<div id="auth-area" class="auth-box" style="display: none;">**

&#x20;       **<h3>アカウント作成 / ログイン</h3>**

&#x20;       **<input type="email" id="email" placeholder="メールアドレス">**

&#x20;       **<input type="password" id="password" placeholder="パスワード">**

&#x20;       **<div style="margin-top: 10px;">**

&#x20;           **<button class="btn" onclick="signUp()">新規登録</button>**

&#x20;           **<button class="btn" onclick="signIn()" style="background:#222;">ログイン</button>**

&#x20;       **</div>**

&#x20;   **</div>**



&#x20;   **<!-- ログイン後に表示されるナビゲーション -->**

&#x20;   **<div id="menu-area" class="nav-links" style="display: none;">**

&#x20;       **<a href="post.html" class="btn">✏️ 記事を投稿する</a>**

&#x20;       **<a href="admin.html" id="admin-link" class="btn" style="background:#eee; color:#333; display:none;">⚙️ 管理者画面</a>**

&#x20;       **<button class="btn" onclick="signOut()" style="background:#ff4d4d;">ログアウト</button>**

&#x20;   **</div>**



&#x20;   **<!-- 記事一覧表示エリア -->**

&#x20;   **<h2>📖 公開中の記事一覧</h2>**

&#x20;   **<div id="articles-list">**

&#x20;       **<p>記事を読み込んでいます...</p>**

&#x20;   **</div>**

**</div>**



**<!-- Supabaseのプログラムを読み込む -->**

**<script src="https://jsdelivr.net"></script>**

**<script>**

&#x20;   **// ⚠️ 後ほどここにSupabaseの接続キーを貼り付けます**

&#x20;   **const SUPABASE\_URL = "YOUR\_SUPABASE\_URL";**

&#x20;   **const SUPABASE\_ANON\_KEY = "YOUR\_SUPABASE\_ANON\_KEY";**

&#x20;   **const supabase = supabase.createClient(SUPABASE\_URL, SUPABASE\_ANON\_KEY);**



&#x20;   **// ユーザーの状態を監視**

&#x20;   **supabase.auth.onAuthStateChange((event, session) => {**

&#x20;       **const statusDiv = document.getElementById('user-status');**

&#x20;       **const authArea = document.getElementById('auth-area');**

&#x20;       **const menuArea = document.getElementById('menu-area');**

&#x20;       **const adminLink = document.getElementById('admin-link');**



&#x20;       **if (session) {**

&#x20;           **const userEmail = session.user.email;**

&#x20;           **statusDiv.innerHTML = `ログイン中: <b>${userEmail}</b>`;**

&#x20;           **authArea.style.display = 'none';**

&#x20;           **menuArea.style.display = 'block';**



&#x20;           **// 管理者（kakawawa310@gmail.com）だけに管理者画面リンクを見せる**

&#x20;           **if (userEmail === 'kakawawa310@gmail.com') {**

&#x20;               **adminLink.style.display = 'inline-block';**

&#x20;           **}**

&#x20;       **} else {**

&#x20;           **statusDiv.innerHTML = 'ゲスト（閲覧のみ）';**

&#x20;           **authArea.style.display = 'block';**

&#x20;           **menuArea.style.display = 'none';**

&#x20;           **adminLink.style.display = 'none';**

&#x20;       **}**

&#x20;   **});**



&#x20;   **// 新規登録機能**

&#x20;   **async function signUp() {**

&#x20;       **const email = document.getElementById('email').value;**

&#x20;       **const password = document.getElementById('password').value;**

&#x20;       **const { error } = await supabase.auth.signUp({ email, password });**

&#x20;       **if (error) alert('エラー: ' + error.message);**

&#x20;       **else alert('確認メールを送信しました。メール内のリンクをクリックして登録を完了してください。');**

&#x20;   **}**



&#x20;   **// ログイン機能**

&#x20;   **async function signIn() {**

&#x20;       **const email = document.getElementById('email').value;**

&#x20;       **const password = document.getElementById('password').value;**

&#x20;       **const { error } = await supabase.auth.signInWithPassword({ email, password });**

&#x20;       **if (error) alert('ログイン失敗: ' + error.message);**

&#x20;   **}**



&#x20;   **// ログアウト機能**

&#x20;   **async function signOut() {**

&#x20;       **await supabase.auth.signOut();**

&#x20;   **}**



&#x20;   **// 公開記事の取得機能（※データベース連携後に動きます）**

&#x20;   **async function loadArticles() {**

&#x20;       **const listDiv = document.getElementById('articles-list');**

&#x20;       **// statusが 'approved' (承認済み) の記事だけを取得**

&#x20;       **const { data, error } = await supabase.from('articles').select('\*').eq('status', 'approved');**

&#x20;       

&#x20;       **if (error || !data || data.length === 0) {**

&#x20;           **listDiv.innerHTML = '<p>公開された記事はまだありません。</p>';**

&#x20;           **return;**

&#x20;       **}**



&#x20;       **listDiv.innerHTML = '';**

&#x20;       **data.forEach(art => {**

&#x20;           **const tagsHTML = art.tags ? art.tags.map(t => `<span class="tag">#${t}</span>`).join('') : '';**

&#x20;           **listDiv.innerHTML += `**

&#x20;               **<div class="article">**

&#x20;                   **<h3>${art.title}</h3>**

&#x20;                   **<p>${art.content}</p>**

&#x20;                   **<div>${tagsHTML}</div>**

&#x20;               **</div>**

&#x20;           **`;**

&#x20;       **});**

&#x20;   **}**

&#x20;   

&#x20;   **// ページ読み込み時に記事を表示**

&#x20;   **loadArticles();**

**</script>**

**</body>**

**</html>**



