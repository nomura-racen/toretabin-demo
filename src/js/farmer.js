// 農家の画面
window.Farmer = (function () {
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  var root = null;
  var filter = 'すべて'; // 予約の一覧の絞り込み

  // ---- 小さな道具 ----
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function day(s) { return new Date(s.slice(0, 10) + 'T00:00:00'); }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function fmtDate(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WEEK[d.getDay()] + '）'; }
  function fmtDateTime(s) {
    var d = new Date(s);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function badge(text) { return '<span class="badge" data-state="' + esc(text) + '">' + esc(text) + '</span>'; }

  // ---- 探す・数える ----
  function item(h) {
    return Store.get().items.find(function (i) { return i.id === h.item_id; });
  }
  function unitWord(h) { return item(h).unit.replace(/（.*）/, ''); } // 「箱（5本入り）」→「箱」
  function title(h) { return item(h).name + ' ' + h.name; }
  function customer(id) {
    return Store.get().customers.find(function (c) { return c.id === id; });
  }
  function reservationsOf(h) {
    return Store.get().reservations
      .filter(function (r) { return r.harvest_id === h.id; })
      .sort(function (a, b) { return a.reserved_at < b.reserved_at ? -1 : 1; });
  }
  function sum(list, fn) { return list.reduce(function (a, r) { return a + fn(r); }, 0); }
  function paidCount(list) {
    return sum(list.filter(function (r) { return r.status === '支払い済み'; }), function (r) {
      return r.allocated != null ? r.allocated : r.quantity;
    });
  }
  function harvestsByDate() {
    return Store.get().harvests.slice().sort(function (a, b) { return a.harvest_date < b.harvest_date ? -1 : 1; });
  }

  // ---- 農家の画面の中の切り替え（ホーム／お客さんへの連絡） ----
  function subnav(current) {
    var tabs = [['home', 'ホーム'], ['messages', 'お客さんへの連絡']];
    return '<div class="filters subnav">' + tabs.map(function (t) {
      return '<button type="button" class="filter-button' + (t[0] === current ? ' is-current' : '') +
        '" data-sub="' + t[0] + '" aria-pressed="' + (t[0] === current) + '">' + t[1] + '</button>';
    }).join('') + '</div>';
  }
  function bindSubnav() {
    root.querySelectorAll('[data-sub]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.getAttribute('data-sub') === 'messages') renderMessages();
        else renderHome();
      });
    });
  }

  // ---- ホーム ----
  function renderHome() {
    var now = Clock.now();
    var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var harvests = harvestsByDate();

    var confirmToday = harvests.filter(function (h) { return Rules.isConfirmDay(h, now); });
    var nearCount = Store.get().reservations.filter(function (r) { return Rules.isDeadlineNear(r, now); }).length;
    var harvestSoon = harvests.filter(function (h) {
      var d = day(h.harvest_date);
      return sameDay(d, now) || sameDay(d, tomorrow);
    });

    var names = function (list, extra) {
      if (!list.length) return '<span class="none">ありません</span>';
      return list.map(function (h) { return esc(title(h)) + extra(h); }).join('<br>');
    };

    var html = subnav('home');
    html += '<h2>今日やること</h2>';
    html += '<div class="todo">';
    html += '<div class="todo-card"><p class="todo-label">確定日が今日の収穫回</p><p class="todo-body">' +
      names(confirmToday, function (h) { return '（' + fmtDateTime(h.confirm_at).split(' ')[1] + ' 確定）'; }) + '</p></div>';
    html += '<div class="todo-card"><p class="todo-label">支払い期限が近い予約</p><p class="todo-num">' +
      nearCount + '<small>件</small></p></div>';
    html += '<div class="todo-card"><p class="todo-label">今日と明日の収穫予定</p><p class="todo-body">' +
      names(harvestSoon, function (h) { return '（' + fmtDate(day(h.harvest_date)) + '）'; }) + '</p></div>';
    html += '</div>';

    html += '<h2>収穫回の一覧</h2>';
    html += '<div class="table-wrap"><table class="list"><thead><tr>' +
      '<th>収穫回</th><th>収穫予定日</th><th>状態</th><th class="num">予約件数</th><th class="num">合計数</th><th class="num">支払い済み</th>' +
      '</tr></thead><tbody>';
    harvests.forEach(function (h) {
      var list = reservationsOf(h);
      var u = unitWord(h);
      html += '<tr>' +
        '<td><button type="button" class="link-button" data-harvest="' + esc(h.id) + '">' + esc(title(h)) + '</button></td>' +
        '<td>' + fmtDate(day(h.harvest_date)) + '</td>' +
        '<td>' + badge(h.stage) + '</td>' +
        '<td class="num"><b>' + list.length + '</b>件</td>' +
        '<td class="num"><b>' + sum(list, function (r) { return r.quantity; }) + '</b>' + esc(u) + '</td>' +
        '<td class="num"><b>' + paidCount(list) + '</b>' + esc(u) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';

    root.innerHTML = html;
    bindSubnav();
    root.querySelectorAll('[data-harvest]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filter = 'すべて';
        renderHarvest(btn.getAttribute('data-harvest'));
      });
    });
  }

  // ---- 収穫回の詳細（予約の一覧） ----
  function renderHarvest(id, notice) {
    var h = Store.get().harvests.find(function (x) { return x.id === id; });
    var u = unitWord(h);
    var all = reservationsOf(h);

    // 絞り込みのボタン：すべて＋この収穫回にある状態
    var states = [];
    all.forEach(function (r) { if (states.indexOf(r.status) < 0) states.push(r.status); });
    var shown = filter === 'すべて' ? all : all.filter(function (r) { return r.status === filter; });

    var html = '';
    html += '<button type="button" class="back-button" data-back>← ホームへ</button>';
    html += '<h2>' + esc(title(h)) + ' ' + badge(h.stage) + '</h2>';
    html += '<p class="harvest-meta">収穫予定日 ' + fmtDate(day(h.harvest_date)) +
      '　確定 ' + fmtDate(day(h.confirm_at)) + ' ' + fmtDateTime(h.confirm_at).split(' ')[1] +
      '　予約 <b>' + all.length + '</b>件・<b>' + sum(all, function (r) { return r.quantity; }) + '</b>' + esc(u) +
      '　支払い済み <b>' + paidCount(all) + '</b>' + esc(u) +
      (h.extra != null ? '　追加で受け付けられる数 <b>' + h.extra + '</b>' + esc(u) : '') + '</p>';

    if (notice) html += '<p class="notice">' + esc(notice) + '</p>';

    // 確定日なら、見込み量の入力と振り分け
    var confirmable = Rules.isConfirmDay(h, Clock.now());
    if (confirmable) {
      html += '<div class="allocate">' +
        '<h3>見込み量の入力と振り分け</h3>' +
        '<label class="allocate-input">見込み量 <input type="number" id="expected" min="0" step="1" inputmode="numeric"> ' + esc(u) + '</label>' +
        '<div id="allocate-preview"><p class="none">見込み量を入れると、振り分けの結果が出ます（まだ確定しません）。</p></div>' +
        '</div>';
    }

    html += '<h3>予約の一覧</h3>';
    html += '<div class="filters" role="group" aria-label="状態で絞り込む">';
    ['すべて'].concat(states).forEach(function (s) {
      var n = s === 'すべて' ? all.length : all.filter(function (r) { return r.status === s; }).length;
      html += '<button type="button" class="filter-button' + (s === filter ? ' is-current' : '') +
        '" data-filter="' + esc(s) + '" aria-pressed="' + (s === filter) + '">' + esc(s) + '（' + n + '）</button>';
    });
    html += '</div>';

    html += '<div class="table-wrap"><table class="list"><thead><tr>' +
      '<th>予約日時</th><th>お客さん</th><th class="num">数</th><th>一部しか用意できないとき</th><th>受け取り</th><th>支払い</th><th>状態</th>' +
      '</tr></thead><tbody>';
    shown.forEach(function (r) {
      var c = customer(r.customer_id);
      var qty = '<b>' + r.quantity + '</b>' + esc(u);
      if (r.allocated != null && r.allocated !== r.quantity) {
        qty += '<br><small>割り当て ' + r.allocated + esc(u) + '</small>';
      }
      var pay = esc(r.payment) + (c.card_fails ? '<br><small>カードが使えない</small>' : '');
      html += '<tr>' +
        '<td>' + fmtDateTime(r.reserved_at) + '</td>' +
        '<td>' + esc(c.name) + '</td>' +
        '<td class="num">' + qty + '</td>' +
        '<td>' + esc(r.when_short) + '</td>' +
        '<td>' + esc(r.receive) + '</td>' +
        '<td>' + pay + '</td>' +
        '<td>' + badge(r.status) + '</td>' +
        '</tr>';
    });
    if (!shown.length) html += '<tr><td colspan="7" class="none">この状態の予約はありません</td></tr>';
    html += '</tbody></table></div>';

    root.innerHTML = html;
    root.querySelector('[data-back]').addEventListener('click', renderHome);
    root.querySelectorAll('[data-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filter = btn.getAttribute('data-filter');
        renderHarvest(id);
      });
    });
    if (confirmable) bindAllocate(h);
  }

  // 見込み量を変えるたびに、振り分けの結果を出す（まだ確定しない）
  function bindAllocate(h) {
    var input = root.querySelector('#expected');
    var box = root.querySelector('#allocate-preview');
    var u = unitWord(h);

    input.addEventListener('input', function () {
      var v = input.value.trim();
      if (v === '') {
        box.innerHTML = '<p class="none">見込み量を入れると、振り分けの結果が出ます（まだ確定しません）。</p>';
        return;
      }
      var expected = Number(v);
      if (!Number.isInteger(expected) || expected < 0) {
        box.innerHTML = '<p class="warn">0以上の整数を入れてください。</p>';
        return;
      }
      var p = Rules.plan(Store.get(), h, expected);
      var shortWord = p.next ? '繰り越し' : 'ご用意できない';

      var html = '<div class="plan-nums">' +
        '<div><span>割り当てる数</span><b>' + p.total + '</b>' + esc(u) + '</div>' +
        '<div><span>届ける</span><b>' + p.deliverCount + '</b>件（' + p.deliverQty + esc(u) + '）</div>' +
        '<div><span>' + shortWord + '</span><b>' + p.shortCount + '</b>件（' + p.shortQty + esc(u) + '）</div>' +
        '<div><span>追加で受け付けられる数</span><b>' + p.extra + '</b>' + esc(u) + '</div>' +
        '</div>';
      html += '<p class="plan-note">足りない分は ' +
        (p.next ? esc(title(p.next)) + ' へ優先で繰り越します。' : '次の収穫回がないため、「今回はご用意できませんでした」としてキャンセルになります。') + '</p>';

      html += '<div class="table-wrap"><table class="list"><thead><tr>' +
        '<th>順番</th><th>お客さん</th><th class="num">予約数</th><th class="num">割り当て</th><th>一部しか用意できないとき</th><th>結果</th>' +
        '</tr></thead><tbody>';
      p.results.forEach(function (x, i) {
        var r = x.reservation;
        var kind = !p.next && x.kind === '繰り越し' ? 'ご用意できない' : x.kind;
        html += '<tr>' +
          '<td>' + (i + 1) + (r.priority ? ' <small>優先</small>' : '') + '</td>' +
          '<td>' + esc(customer(r.customer_id).name) + '</td>' +
          '<td class="num"><b>' + r.quantity + '</b>' + esc(u) + '</td>' +
          '<td class="num"><b>' + x.allocated + '</b>' + esc(u) + '</td>' +
          '<td>' + esc(r.when_short) + '</td>' +
          '<td><span class="badge" data-result="' + esc(kind) + '">' + esc(kind) + '</span></td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
      html += '<button type="button" class="big-button farmer confirm-button" id="confirm">この内容で確定する</button>';
      box.innerHTML = html;

      box.querySelector('#confirm').addEventListener('click', function () {
        if (!window.confirm(title(h) + ' を、見込み量 ' + expected + u + ' で確定します。よろしいですか？')) return;
        Rules.confirm(Store.get(), h, expected, Clock.now());
        Store.save();
        filter = 'すべて';
        renderHarvest(h.id, '確定しました。お客さんへの連絡を作りました。');
      });
    });
  }

  // ---- お客さんへの連絡の履歴（新しい順） ----
  function renderMessages() {
    var list = Store.get().messages.slice().sort(function (a, b) {
      if (a.sent_at !== b.sent_at) return a.sent_at < b.sent_at ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });
    var html = subnav('messages');
    html += '<h2>お客さんへの連絡 <small class="count">' + list.length + '件</small></h2>';
    if (!list.length) html += '<p class="none">まだ連絡はありません。</p>';
    html += '<ul class="messages">';
    list.forEach(function (m) {
      var h = Store.get().harvests.find(function (x) { return x.id === m.harvest_id; });
      html += '<li class="message">' +
        '<div class="message-head">' +
        '<span class="badge" data-kind="' + esc(m.kind) + '">' + esc(m.kind) + '</span>' +
        '<b>' + esc(customer(m.customer_id).name) + ' さん</b>' +
        '<span class="message-meta">' + esc(title(h)) + '・' + fmtDateTime(m.sent_at) + '</span>' +
        '</div>' +
        '<p>' + esc(m.body) + '</p>' +
        '</li>';
    });
    html += '</ul>';
    root.innerHTML = html;
    bindSubnav();
  }

  // 農家の画面を開く（いつもホームから）
  function open(container) {
    root = container;
    renderHome();
  }

  return { open: open };
})();
