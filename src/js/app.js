// 表紙（ログイン）、画面の切り替え、起動
(function () {
  var settings = window.APP_DATA.settings;

  // ---- 仮のログイン（デモ用。本物の守りにはならない） ----
  // お客さん：data.js のメールアドレスと、全員共通のパスワード
  var CUSTOMER_PASSWORD = 'demo1234';
  // 農家：このアカウントだけ
  var FARMER_EMAIL = 'morino@example.com';
  var FARMER_PASSWORD = 'farm1234';

  var current = 'cover';   // 今見ている画面
  var coverSide = 'customer'; // 表紙で見せているログイン（customer / farmer）

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function session() {
    var st = Store.get();
    if (!st.session) st.session = { customer: null, farmer: false };
    return st.session;
  }
  function loggedCustomer() {
    var id = session().customer;
    return id ? Store.get().customers.find(function (c) { return c.id === id; }) : null;
  }

  // ---- 表紙 ----
  function fillCover() {
    // タイトルは1文字ずつ札にする（読み上げでは1語として読む）
    var title = document.getElementById('cover-title');
    title.setAttribute('aria-label', settings.app_name);
    title.innerHTML = settings.app_name.split('').map(function (ch, i) {
      return '<span class="title-chip' + (i === settings.app_name.length - 1 ? ' last' : '') + '" aria-hidden="true">' + esc(ch) + '</span>';
    }).join('');
    document.getElementById('cover-catch').textContent = settings.catch;
    document.getElementById('cover-sub-farmer').textContent = settings.sub_farmer;
    document.getElementById('cover-sub-customer').textContent = settings.sub_customer;
  }

  function loginForm(side) {
    var isFarmer = side === 'farmer';
    var hint = isFarmer
      ? '<p>メールアドレス：' + FARMER_EMAIL + '<br>パスワード：' + FARMER_PASSWORD + '</p>' +
        '<button type="button" class="key-button" data-fill="' + FARMER_EMAIL + '">この内容を入れる</button>'
      : '<p>パスワードは全員 <b>' + CUSTOMER_PASSWORD + '</b> です。名前を押すと入ります。</p><div class="demo-list">' +
        Store.get().customers.map(function (c) {
          return '<button type="button" class="key-button" data-fill="' + esc(c.email) + '">' + esc(c.name) + '</button>';
        }).join('') + '</div>';
    return '<h2>' + (isFarmer ? '農家の方のログイン' : 'ログイン') + '</h2>' +
      '<form class="login-form" data-side="' + side + '">' +
      '<label>メールアドレス<input type="email" name="email" autocomplete="username" required></label>' +
      '<label>パスワード<input type="password" name="password" autocomplete="current-password" required></label>' +
      '<p class="warn" hidden></p>' +
      '<button type="submit" class="big-button ' + side + '">ログインする</button>' +
      '</form>' +
      '<details class="demo-accounts"><summary>デモ用のアカウント</summary>' + hint + '</details>';
  }

  function loggedInBox(side) {
    var who = side === 'farmer' ? '農家（' + Store.get().farm.name + '）' : loggedCustomer().name + ' さん';
    return '<h2>ログインしています</h2><p>' + esc(who) + 'でログインしています。</p>' +
      '<button type="button" class="big-button ' + side + '" data-go-inner="' + side + '">' +
      (side === 'farmer' ? '農家の画面へ' : '自分のページへ') + '</button>';
  }

  function renderCover() {
    var sides = ['customer', 'farmer'];
    sides.forEach(function (side) {
      var body = document.getElementById('login-' + side + '-body');
      var loggedIn = side === 'farmer' ? session().farmer : !!loggedCustomer();
      body.innerHTML = loggedIn ? loggedInBox(side) : loginForm(side);
      document.getElementById('login-' + side).hidden = side !== coverSide;
    });
    document.getElementById('login-switch').textContent = coverSide === 'customer' ? '農家の方はこちら' : 'お客さんのログインへ戻る';

    document.querySelectorAll('.login-form').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        login(form);
      });
    });
    document.querySelectorAll('[data-fill]').forEach(function (b) {
      b.addEventListener('click', function () {
        var form = b.closest('.login-card').querySelector('.login-form');
        var isFarmer = form.getAttribute('data-side') === 'farmer';
        form.email.value = b.getAttribute('data-fill');
        form.password.value = isFarmer ? FARMER_PASSWORD : CUSTOMER_PASSWORD;
        form.email.focus();
      });
    });
    document.querySelectorAll('[data-go-inner]').forEach(function (b) {
      b.addEventListener('click', function () { show(b.getAttribute('data-go-inner')); });
    });
  }

  // メールアドレスとパスワードを確かめて、ログインする
  function login(form) {
    var side = form.getAttribute('data-side');
    var email = form.email.value.trim().toLowerCase();
    var password = form.password.value;
    var warn = form.querySelector('.warn');
    if (side === 'farmer') {
      if (email === FARMER_EMAIL && password === FARMER_PASSWORD) {
        session().farmer = true;
        Store.save();
        show('farmer');
        return;
      }
    } else {
      var c = Store.get().customers.find(function (x) { return x.email.toLowerCase() === email; });
      if (c && password === CUSTOMER_PASSWORD) {
        session().customer = c.id;
        Store.save();
        show('customer');
        return;
      }
    }
    warn.textContent = 'メールアドレスかパスワードが違います。';
    warn.hidden = false;
  }

  function logout() {
    if (current === 'farmer') session().farmer = false;
    if (current === 'customer') session().customer = null;
    Store.save();
    show('cover');
  }

  // ---- 画面の切り替え ----
  function updateTopbar() {
    var farmerBtn = document.querySelector('.topbar-nav [data-go="farmer"]');
    var customerBtn = document.getElementById('nav-customer');
    var c = loggedCustomer();
    farmerBtn.hidden = !session().farmer;
    customerBtn.hidden = !c;
    customerBtn.textContent = c ? c.name + ' さん' : '自分のページ';
    document.getElementById('logout').hidden = current === 'cover';
    document.querySelectorAll('.topbar-nav [data-go]').forEach(function (btn) {
      btn.classList.toggle('is-current', btn.getAttribute('data-go') === current);
    });
  }

  // 画面を切り替える（name は cover / farmer / customer）。ログインしていなければ表紙のログインへ
  function show(name) {
    if (name === 'farmer' && !session().farmer) { coverSide = 'farmer'; name = 'cover'; }
    if (name === 'customer' && !loggedCustomer()) { coverSide = 'customer'; name = 'cover'; }
    current = name;
    document.querySelectorAll('.screen').forEach(function (el) {
      el.hidden = el.id !== 'screen-' + name;
    });
    if (name === 'cover') renderCover();
    if (name === 'farmer') window.Farmer.open(document.getElementById('farmer-root'));
    if (name === 'customer') window.Customer.open(document.getElementById('customer-root'), session().customer);
    updateTopbar();
    window.scrollTo(0, 0);
  }

  // 隅の時計に今の日時を出す
  function showClock() {
    document.getElementById('clock-now').textContent = window.Clock.format(window.Clock.now());
  }

  // 時計のボタン：時計を動かしたら、今見ている画面を描き直す
  function bindClock() {
    document.querySelectorAll('[data-clock]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var what = btn.getAttribute('data-clock');
        if (what === 'reset') window.Clock.reset();
        else window.Clock.advance(Number(what));
        showClock();
        if (current === 'farmer') window.Farmer.refresh();
        if (current === 'customer') window.Customer.refresh();
      });
    });
  }

  // 最初の状態に戻す：画面で変えたことをすべて消す（ログインも消える）
  function bindReset() {
    document.getElementById('reset-all').addEventListener('click', function () {
      if (!window.confirm('画面で変えたこと（予約・支払い・確定・時計・連絡の文・ログインなど）をすべて消して、最初の状態に戻します。よろしいですか？')) return;
      window.Store.reset();
      showClock();
      coverSide = 'customer';
      show('cover');
    });
  }

  // 起動
  fillCover();
  showClock();
  bindClock();
  bindReset();
  document.querySelectorAll('.topbar [data-go]').forEach(function (btn) {
    btn.addEventListener('click', function () { show(btn.getAttribute('data-go')); });
  });
  document.getElementById('logout').addEventListener('click', logout);
  document.getElementById('login-switch').addEventListener('click', function () {
    coverSide = coverSide === 'customer' ? 'farmer' : 'customer';
    renderCover();
  });
  show('cover');
})();
