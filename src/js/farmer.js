// 農家の画面
window.Farmer = (function () {
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  var root = null;
  var filter = 'すべて'; // 予約の一覧の絞り込み
  var view = { name: 'home' }; // 今見ている画面（時計を動かしたときに描き直すため）

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
  // 表の各欄に見出しの言葉を持たせる（スマホでは1件ずつのカードにして、見出しを横に出すため）
  function labelCells(el) {
    el.querySelectorAll('table.list').forEach(function (table) {
      var heads = Array.prototype.map.call(table.querySelectorAll('thead th'), function (th) { return th.textContent; });
      table.querySelectorAll('tbody tr').forEach(function (tr) {
        Array.prototype.forEach.call(tr.children, function (td, i) {
          if (!td.hasAttribute('colspan')) td.setAttribute('data-label', heads[i] || '');
        });
      });
    });
  }
  function badge(text) { return '<span class="badge" data-state="' + esc(text) + '">' + esc(text) + '</span>'; }

  // ---- 探す・数える ----
  function S() { return Store.get(); }
  function item(h) {
    return S().items.find(function (i) { return i.id === h.item_id; });
  }
  function unitWord(h) { return item(h).unit.replace(/（.*）/, ''); } // 「箱（5本入り）」→「箱」
  function title(h) { return item(h).name + ' ' + h.name; }
  function customer(id) {
    return S().customers.find(function (c) { return c.id === id; });
  }
  function reservationsOf(h) {
    return S().reservations
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
    return S().harvests.slice().sort(function (a, b) { return a.harvest_date < b.harvest_date ? -1 : 1; });
  }
  function confirmTime(h) { return fmtDate(day(h.confirm_at)) + ' ' + fmtDateTime(h.confirm_at).split(' ')[1]; }

  // ---- 農家の画面の中の切り替え（ホーム／お客さんへの連絡／連絡の文） ----
  function subnav(current) {
    var tabs = [['home', 'ホーム'], ['setup', '品目と収穫回'], ['messages', 'お客さんへの連絡'], ['templates', '連絡の文'], ['intro', 'お店の紹介']];
    return '<div class="filters subnav">' + tabs.map(function (t) {
      return '<button type="button" class="filter-button' + (t[0] === current ? ' is-current' : '') +
        '" data-sub="' + t[0] + '" aria-pressed="' + (t[0] === current) + '">' + t[1] + '</button>';
    }).join('') + '</div>';
  }
  function bindSubnav() {
    root.querySelectorAll('[data-sub]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var to = btn.getAttribute('data-sub');
        if (to === 'messages') renderMessages();
        else if (to === 'templates') renderTemplates();
        else if (to === 'intro') renderIntro();
        else if (to === 'setup') renderSetup();
        else renderHome();
      });
    });
  }

  // ---- ホーム ----
  function renderHome() {
    view = { name: 'home' };
    var now = Clock.now();
    var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var harvests = harvestsByDate();

    var confirmToday = harvests.filter(function (h) { return Rules.isConfirmDay(h, now); });
    var nearCount = S().reservations.filter(function (r) { return Rules.isDeadlineNear(r, now); }).length;
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
    // 次の回を待っている予約：同じ品目の収穫回を作ると、そこへ入る
    var waitingLines = S().items.map(function (i) {
      var w = Rules.waitingOf(S(), i.id);
      if (!w.length) return '';
      return esc(i.name) + ' ' + w.length + '件（' + sum(w, function (r) { return r.quantity; }) + esc(i.unit.replace(/（.*）/, '')) + '）';
    }).filter(Boolean);
    html += '<div class="todo-card"><p class="todo-label">次の回を待っている予約</p><p class="todo-body">' +
      (waitingLines.length
        ? waitingLines.join('<br>') + '<br><button type="button" class="link-button" data-sub="setup">次の収穫回を作る</button>'
        : '<span class="none">ありません</span>') + '</p></div>';
    html += '</div>';

    html += '<div class="section-head"><h2>収穫回の一覧</h2>' +
      '<button type="button" class="filter-button is-current" data-sub="setup">＋ 収穫回を作る</button></div>';
    html += '<div class="table-wrap"><table class="list"><thead><tr>' +
      '<th>収穫回</th><th>収穫予定日</th><th>状態</th><th class="num">予約件数</th><th class="num">合計数</th><th class="num">支払い済み</th>' +
      '</tr></thead><tbody>';
    harvests.forEach(function (h) {
      var list = reservationsOf(h);
      var u = unitWord(h);
      var planned = h.stage === '予約受付中' && h.planned_expected != null
        ? '<br><small>見込み量 ' + h.planned_expected + esc(u) + ' で自動で確定</small>' : '';
      html += '<tr>' +
        '<td><button type="button" class="link-button" data-harvest="' + esc(h.id) + '">' + esc(title(h)) + '</button></td>' +
        '<td>' + fmtDate(day(h.harvest_date)) + '</td>' +
        '<td>' + badge(Rules.harvestState(h)) + planned + '</td>' +
        '<td class="num"><b>' + list.length + '</b>件</td>' +
        '<td class="num"><b>' + sum(list, function (r) { return r.quantity; }) + '</b>' + esc(u) + '</td>' +
        '<td class="num"><b>' + paidCount(list) + '</b>' + esc(u) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';

    root.innerHTML = html;
    labelCells(root);
    bindSubnav();
    bindHarvestLinks();
  }

  function bindHarvestLinks() {
    root.querySelectorAll('[data-harvest]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filter = 'すべて';
        renderHarvest(btn.getAttribute('data-harvest'));
        window.scrollTo(0, 0);
      });
    });
  }

  // ---- 収穫回の詳細（予約の一覧） ----
  function renderHarvest(id, notice) {
    view = { name: 'harvest', id: id };
    var now = Clock.now();
    var h = S().harvests.find(function (x) { return x.id === id; });
    var u = unitWord(h);
    var all = reservationsOf(h);

    // 絞り込みのボタン：すべて＋この収穫回にある状態
    var states = [];
    all.forEach(function (r) { if (states.indexOf(r.status) < 0) states.push(r.status); });
    var shown = filter === 'すべて' ? all : all.filter(function (r) { return r.status === filter; });

    var html = '';
    html += '<button type="button" class="back-button" data-back>← ホームへ</button>';

    // ほかの収穫回へ、ホームに戻らずに移る
    html += '<div class="harvest-switch" role="group" aria-label="ほかの収穫回">' + harvestsByDate().map(function (x) {
      return '<button type="button" class="filter-button' + (x.id === id ? ' is-current' : '') + '" data-harvest="' + esc(x.id) +
        '" aria-pressed="' + (x.id === id) + '">' + esc(title(x)) + '</button>';
    }).join('') + '</div>';

    html += '<h2>' + esc(title(h)) + ' ' + badge(Rules.harvestState(h)) + '</h2>';
    html += '<p class="harvest-meta">収穫予定日 ' + fmtDate(day(h.harvest_date)) +
      '　確定 ' + confirmTime(h) +
      '　予約 <b>' + all.length + '</b>件・<b>' + sum(all, function (r) { return r.quantity; }) + '</b>' + esc(u) +
      '　支払い済み <b>' + paidCount(all) + '</b>' + esc(u) +
      (h.extra != null ? '　追加で受け付けられる数 <b>' + h.extra + '</b>' + esc(u) : '') + '</p>';
    if (h.auto_confirmed) html += '<p class="harvest-meta">見込み量 ' + h.expected + esc(u) + ' で、確定日時に自動で確定しました。</p>';

    if (notice) html += '<p class="notice">' + esc(notice) + '</p>';

    // 受付：確定前は「新しい予約」、確定後で余りがあれば「追加の予約」。やめる／再開するボタンつき
    var pool = Rules.extraPool(h);
    if (h.stage === '予約受付中' && Rules.isConfirmTimeReached(h, now)) {
      html += '<div class="accept-box"><p>確定日時を過ぎたため、新しい予約の受付を<b>終了しています</b>。確定して余りが出たら、追加の予約を受け付けます。</p></div>';
    } else if (h.stage === '予約受付中') {
      html += '<div class="accept-box">' + (h.closed
        ? '<p>新しい予約の受付を<b>やめています</b>。今ある予約と繰り越しは、確定日にそのまま振り分けます。</p>' +
          '<button type="button" class="filter-button" id="accept-toggle">受付を再開する</button>'
        : '<p>新しい予約を受け付けています（確定日時の ' + confirmTime(h) + ' まで）。</p>' +
          '<button type="button" class="filter-button" id="accept-toggle">受付をやめる</button>') + '</div>';
    } else if (h.stage === '割り当て済み' && pool > 0 && !Rules.isHarvestDayReached(h, now)) {
      html += '<div class="accept-box extra">' + (h.closed
        ? '<p>余りが <b>' + pool + '</b>' + esc(u) + ' ありますが、追加の予約を<b>やめています</b>。</p>' +
          '<button type="button" class="filter-button" id="accept-toggle">追加の予約を再開する</button>'
        : '<p><b>追加受付中</b>：あと <b>' + pool + '</b>' + esc(u) + '。先着順で、予約するとすぐにお届けが決まります（収穫予定日の前日まで）。</p>' +
          '<button type="button" class="filter-button" id="accept-toggle">追加の予約をやめる</button>') + '</div>';
    }

    // まだ確定していなければ、見込み量を入れて結果を見られる（確定できるのは確定日だけ）
    var confirmable = Rules.isConfirmDay(h, now);
    var plannable = Rules.canPlan(h, now);
    if (h.stage === '予約受付中') {
      html += '<div class="allocate">' +
        '<h3>見込み量の入力と振り分け</h3>' +
        (h.planned_expected != null
          ? '<p class="plan-set">' + confirmTime(h) + ' に、見込み量 <b>' + h.planned_expected + esc(u) + '</b> で自動で確定します。' +
            ' <button type="button" class="filter-button" id="plan-clear">自動の確定をやめる</button></p>'
          : '') +
        '<label class="allocate-input">見込み量 <input type="number" id="expected" min="0" step="1" inputmode="numeric"' +
        (h.planned_expected != null ? ' value="' + h.planned_expected + '"' : '') + '> ' + esc(u) + '</label>' +
        '<p class="plan-note">' + (confirmable
          ? '今日が確定日です。結果を見てから「この内容で確定する」を押してください。'
          : plannable
            ? '確定日は ' + confirmTime(h) + ' です。今は結果を見るだけです。「確定日に自動で確定する」を押すと、確定日時にこの見込み量で自動で確定します。'
            : '確定日を過ぎました。見込み量を入れて、結果を見ることはできます。') + '</p>' +
        '<div id="allocate-preview"><p class="none">見込み量を入れると、振り分けの結果が出ます（まだ確定しません）。</p></div>' +
        '</div>';
    }

    // 期限切れ・キャンセルで空いた数の行き先
    if (h.stage === '割り当て済み') html += vacancyHtml(h, now);

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
    labelCells(root);
    bindHarvestLinks();
    root.querySelector('[data-back]').addEventListener('click', renderHome);
    root.querySelectorAll('[data-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filter = btn.getAttribute('data-filter');
        renderHarvest(id);
      });
    });
    var toggle = root.querySelector('#accept-toggle');
    if (toggle) toggle.addEventListener('click', function () {
      var what = h.stage === '予約受付中' ? '新しい予約の受付' : '追加の予約';
      if (h.closed) {
        Rules.restartAccepting(h);
        Store.save();
        renderHarvest(h.id, what + 'を再開しました。お客さんの画面で、また予約できるようになりました。');
      } else {
        if (!window.confirm(title(h) + ' の' + what + 'をやめます。今ある予約はそのまま残ります。よろしいですか？')) return;
        Rules.stopAccepting(h);
        Store.save();
        renderHarvest(h.id, what + 'をやめました。お客さんの画面では「受付を終了しました」と出ます。');
      }
    });
    if (h.stage === '予約受付中') bindAllocate(h, confirmable, plannable);
  }

  // 空いた数の行き先：空いた数、案内の結果、まだ行き先が決まっていない数
  function vacancyHtml(h, now) {
    var v = Rules.vacancy(S(), h, now);
    if (!v.freed.length && !v.offers.length) return '';
    var u = unitWord(h);
    var html = '<div class="vacancy"><h3>空いた数の行き先</h3>';
    html += '<div class="plan-nums">' +
      '<div><span>空いた数（期限切れ・キャンセル）</span><b>' + v.freedQty + '</b>' + esc(u) + '（' + v.freed.length + '件）</div>' +
      '<div><span>補欠の方が受け取った数</span><b>' + sum(v.offers.filter(function (o) { return o.status === '受け取り'; }), function (o) { return o.quantity; }) + '</b>' + esc(u) + '</div>' +
      '<div><span>いま案内中の数</span><b>' + sum(v.offers.filter(function (o) { return o.status === '案内中'; }), function (o) { return o.quantity; }) + '</b>' + esc(u) + '</div>' +
      '<div><span>まだ行き先が決まっていない数</span><b>' + v.left + '</b>' + esc(u) + '</div>' +
      '</div>';
    if (v.reason) html += '<p class="plan-note">' + esc(v.reason) + '</p>';
    if (v.offers.length) {
      html += '<div class="table-wrap"><table class="list"><thead><tr>' +
        '<th>案内した日時</th><th>お客さん</th><th class="num">数</th><th>お返事の期限</th><th>結果</th>' +
        '</tr></thead><tbody>';
      v.offers.slice().sort(function (a, b) { return a.offered_at < b.offered_at ? -1 : 1; }).forEach(function (o) {
        html += '<tr>' +
          '<td>' + fmtDateTime(o.offered_at) + '</td>' +
          '<td>' + esc(customer(o.customer_id).name) + '</td>' +
          '<td class="num"><b>' + o.quantity + '</b>' + esc(u) + '</td>' +
          '<td>' + fmtDateTime(o.deadline) + '</td>' +
          '<td><span class="badge" data-offer="' + esc(o.status) + '">' + esc(o.status) + '</span></td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<p class="none">まだ案内した方はいません。</p>';
    }
    return html + '</div>';
  }

  // 見込み量を変えるたびに、振り分けの結果を出す（まだ確定しない）
  function bindAllocate(h, confirmable, plannable) {
    var input = root.querySelector('#expected');
    var box = root.querySelector('#allocate-preview');
    var u = unitWord(h);

    var clear = root.querySelector('#plan-clear');
    if (clear) clear.addEventListener('click', function () {
      Rules.clearPlan(h);
      Store.save();
      renderHarvest(h.id, '自動の確定をやめました。');
    });

    function update() {
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
      var p = Rules.plan(S(), h, expected);
      var shortWord = p.next ? '繰り越し' : '次の回待ち';

      var html = '<div class="plan-nums">' +
        '<div><span>割り当てる数</span><b>' + p.total + '</b>' + esc(u) + '</div>' +
        '<div><span>届ける</span><b>' + p.deliverCount + '</b>件（' + p.deliverQty + esc(u) + '）</div>' +
        '<div><span>' + shortWord + '</span><b>' + p.shortCount + '</b>件（' + p.shortQty + esc(u) + '）</div>' +
        '<div><span>追加で受け付けられる数</span><b>' + p.extra + '</b>' + esc(u) + '</div>' +
        '</div>';
      html += '<p class="plan-note">足りない分は ' +
        (p.next ? esc(title(p.next)) + ' へ優先で繰り越します。' : '次の収穫回がまだないため、「次の回待ち」になります（キャンセルにはなりません）。「品目と収穫回」で同じ品目の収穫回を作ると、そこへ優先で入ります。') + '</p>';
      if (plannable) html += '<p class="plan-note">※ 確定日までに予約が増えたり減ったりすると、結果も変わります。</p>';

      html += '<div class="table-wrap"><table class="list"><thead><tr>' +
        '<th>順番</th><th>お客さん</th><th class="num">予約数</th><th class="num">割り当て</th><th>一部しか用意できないとき</th><th>結果</th>' +
        '</tr></thead><tbody>';
      p.results.forEach(function (x, i) {
        var r = x.reservation;
        var kind = !p.next && x.kind === '繰り越し' ? '次の回待ち' : x.kind;
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
      if (confirmable) html += '<button type="button" class="big-button farmer confirm-button" id="confirm">この内容で確定する</button>';
      if (plannable) html += '<button type="button" class="big-button farmer confirm-button" id="plan-set">確定日に自動で確定する（' + expected + esc(u) + '）</button>';
      box.innerHTML = html;
      labelCells(box);

      var confirmBtn = box.querySelector('#confirm');
      if (confirmBtn) confirmBtn.addEventListener('click', function () {
        if (!window.confirm(title(h) + ' を、見込み量 ' + expected + u + ' で確定します。よろしいですか？')) return;
        Rules.confirm(S(), h, expected, Clock.now());
        Store.save();
        filter = 'すべて';
        renderHarvest(h.id, '確定しました。お客さんへの連絡を作りました。');
      });
      var planBtn = box.querySelector('#plan-set');
      if (planBtn) planBtn.addEventListener('click', function () {
        if (!Rules.setPlan(h, expected, Clock.now())) return;
        Store.save();
        renderHarvest(h.id); // 自動で確定する予定は、入力欄の上に出る
      });
    }

    input.addEventListener('input', update);
    if (input.value !== '') update();
  }

  // ---- お客さんへの連絡の履歴（新しい順） ----
  function renderMessages() {
    view = { name: 'messages' };
    var list = S().messages.slice().sort(function (a, b) {
      if (a.sent_at !== b.sent_at) return a.sent_at < b.sent_at ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });
    var html = subnav('messages');
    html += '<h2>お客さんへの連絡 <small class="count">' + list.length + '件</small></h2>';
    if (!list.length) html += '<p class="none">まだ連絡はありません。</p>';
    html += '<ul class="messages">';
    list.forEach(function (m) {
      var h = S().harvests.find(function (x) { return x.id === m.harvest_id; });
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

  // ---- 連絡の文（全員に共通のひな形） ----
  function renderTemplates(notice) {
    view = { name: 'templates' };
    var html = subnav('templates');
    html += '<h2>連絡の文</h2>';
    html += '<p class="plan-note">お客さんに送る連絡の、全員に共通の文です。{収穫回} のように { } で囲んだ所には、送るときにその方の中身が入ります。' +
      '変えた文は、これから送る連絡から使われます（もう送った連絡は変わりません）。</p>';
    if (notice) html += '<p class="notice">' + esc(notice) + '</p>';
    Rules.templateList().forEach(function (t) {
      var text = Rules.templateText(S(), t.kind);
      var changed = text !== t.text;
      html += '<section class="template" data-kind-box="' + esc(t.kind) + '">' +
        '<div class="message-head"><span class="badge" data-kind="' + esc(t.kind) + '">' + esc(t.kind) + '</span>' +
        '<span class="message-meta">' + esc(t.when) + '</span>' + (changed ? '<small class="changed">書き換え済み</small>' : '') + '</div>' +
        '<textarea rows="3" aria-label="' + esc(t.kind) + 'の文">' + esc(text) + '</textarea>' +
        '<p class="keys">使える差し込み：' + t.keys.map(function (k) {
          return '<button type="button" class="key-button" data-key="{' + esc(k) + '}">{' + esc(k) + '}</button>';
        }).join('') + '</p>' +
        '<p class="template-sample"><small>見本：</small><span>' + esc(Rules.sampleMessage(text)) + '</span></p>' +
        '<div class="template-buttons">' +
        '<button type="button" class="filter-button is-current" data-save>保存する</button>' +
        '<button type="button" class="filter-button" data-default>元の文に戻す</button>' +
        '</div></section>';
    });
    root.innerHTML = html;
    bindSubnav();

    root.querySelectorAll('[data-kind-box]').forEach(function (box) {
      var kind = box.getAttribute('data-kind-box');
      var area = box.querySelector('textarea');
      var sample = box.querySelector('.template-sample span');
      area.addEventListener('input', function () { sample.textContent = Rules.sampleMessage(area.value); });
      box.querySelectorAll('[data-key]').forEach(function (k) {
        k.addEventListener('click', function () {
          var at = area.selectionStart != null ? area.selectionStart : area.value.length;
          area.value = area.value.slice(0, at) + k.getAttribute('data-key') + area.value.slice(area.selectionEnd || at);
          area.focus();
          sample.textContent = Rules.sampleMessage(area.value);
        });
      });
      box.querySelector('[data-save]').addEventListener('click', function () {
        Rules.saveTemplate(S(), kind, area.value);
        Store.save();
        renderTemplates('「' + kind + '」の文を保存しました。');
      });
      box.querySelector('[data-default]').addEventListener('click', function () {
        if (!window.confirm('「' + kind + '」の文を、元の文に戻します。よろしいですか？')) return;
        Rules.resetTemplate(S(), kind);
        Store.save();
        renderTemplates('「' + kind + '」の文を、元の文に戻しました。');
      });
    });
  }

  // ---- 品目と収穫回（予約するものと、その収穫回を作る） ----
  function itemMark(i) { return Store.itemMark(i); }
  var MARKS = ['🌽', '🍈', '🌾', '🍅', '🥔', '🥕', '🥬', '🍓', '🍎', '🍑', '🍇', '🌱'];

  function renderSetup(notice, keep) {
    view = { name: 'setup' };
    keep = keep || {};
    var items = S().items;
    var html = subnav('setup');
    html += '<h2>品目と収穫回</h2>';
    html += '<p class="plan-note">品目は「予約するもの」です。同じ品目の収穫回どうしで、足りなかった分を次の回へ繰り越します。' +
      '新しい収穫回を作ると、その品目の前の回で足りなかった分の繰り越し先になります。</p>';
    if (notice) html += '<p class="notice">' + esc(notice) + '</p>';

    // 収穫回を作る
    var first = keep.item_id || (items[0] && items[0].id);
    html += '<section class="template setup-box"><h3>収穫回を作る</h3>' +
      '<form class="setup-form" id="harvest-form">' +
      '<label>品目<select name="item_id">' + items.map(function (i) {
        return '<option value="' + esc(i.id) + '"' + (i.id === first ? ' selected' : '') + '>' + esc(itemMark(i) + ' ' + i.name + '（' + i.unit + '・' + i.price.toLocaleString('ja-JP') + '円）') + '</option>';
      }).join('') + '</select></label>' +
      '<label>収穫予定日<input type="date" name="harvest_date" value="' + esc(keep.harvest_date || '') + '"></label>' +
      '<label>回の名前 <small>（日付から自動で入ります。変えてもかまいません）</small><input type="text" name="name" value="' + esc(keep.name || '') + '" placeholder="例：8月下旬"></label>' +
      '<div class="setup-row">' +
      '<label>予約上限<input type="number" name="reserve_limit" min="1" step="1" value="' + esc(keep.reserve_limit || '') + '"></label>' +
      '<label>1人あたりの上限<input type="number" name="per_person_limit" min="1" step="1" value="' + esc(keep.per_person_limit || '') + '"></label>' +
      '</div>' +
      '<p class="plan-note" id="confirm-auto">確定日は、収穫予定日の3日前の9時に自動で決まります。</p>' +
      '<p class="warn" id="harvest-warn" hidden></p>' +
      '<button type="submit" class="big-button farmer">収穫回を作る</button>' +
      '</form></section>';

    // 品目の一覧：品目ごとに、その収穫回をタグのように並べる
    html += '<h3>品目の一覧</h3><div class="item-list">';
    items.forEach(function (i) {
      var rounds = S().harvests.filter(function (h) { return h.item_id === i.id; })
        .sort(function (a, b) { return a.harvest_date < b.harvest_date ? -1 : 1; });
      html += '<section class="template item-card">' +
        '<div class="message-head"><span class="item-mark" aria-hidden="true">' + itemMark(i) + '</span><b>' + esc(i.name) + '</b>' +
        '<span class="message-meta">' + esc(i.unit) + '・' + i.price.toLocaleString('ja-JP') + '円・支払い期限' + i.pay_hours + '時間・1人' + i.per_person_limit + 'まで</span></div>' +
        '<p class="round-tags">' + (rounds.length ? rounds.map(function (h, n) {
          return (n ? '<span class="round-arrow" aria-hidden="true">→</span>' : '') +
            '<button type="button" class="round-tag" data-harvest="' + esc(h.id) + '">' + esc(h.name) + ' <small>' + esc(Rules.harvestState(h)) + '</small></button>';
        }).join('') : '<span class="none">まだ収穫回がありません</span>') +
        (function () {
          var w = Rules.waitingOf(S(), i.id);
          if (!w.length) return '</p>';
          return (rounds.length ? '<span class="round-arrow" aria-hidden="true">→</span>' : '') +
            '<span class="round-tag waiting">次の回待ち <small>' + w.length + '件・' + sum(w, function (r) { return r.quantity; }) + esc(i.unit.replace(/（.*）/, '')) + '</small></span></p>' +
            '<p class="plan-note">次の回を待っている予約があります。この品目の収穫回を作ると、そこへ優先で入ります。</p>';
        })() + '</section>';
    });
    html += '</div>';

    // 品目を作る
    html += '<section class="template setup-box"><h3>品目を作る</h3>' +
      '<form class="setup-form" id="item-form">' +
      '<label>品目の名前<input type="text" name="name" placeholder="例：ミニトマト"></label>' +
      '<div class="setup-row">' +
      '<label>単位<input type="text" name="unit" placeholder="例：袋（500g）"></label>' +
      '<label>値段（円）<input type="number" name="price" min="1" step="1"></label>' +
      '</div><div class="setup-row">' +
      '<label>支払い期限（時間）<input type="number" name="pay_hours" min="1" step="1" value="24"></label>' +
      '<label>1人あたりの上限<input type="number" name="per_person_limit" min="1" step="1" value="3"></label>' +
      '</div>' +
      '<fieldset class="mark-choices"><legend>マーク</legend>' + MARKS.map(function (m, n) {
        return '<label class="mark-choice"><input type="radio" name="mark" value="' + m + '"' + (n === MARKS.length - 1 ? ' checked' : '') + '><span>' + m + '</span></label>';
      }).join('') + '</fieldset>' +
      '<p class="warn" id="item-warn" hidden></p>' +
      '<button type="submit" class="big-button farmer">品目を作る</button>' +
      '</form></section>';

    root.innerHTML = html;
    bindSubnav();
    bindHarvestLinks();

    // 収穫回のフォーム：品目を選ぶと1人あたりの上限を、日付を入れると名前と確定日を入れる
    var hf = root.querySelector('#harvest-form');
    var autoName = !keep.name;
    function fillFromItem() {
      var it = items.find(function (i) { return i.id === hf.item_id.value; });
      if (it && !hf.per_person_limit.value) hf.per_person_limit.value = it.per_person_limit;
    }
    function fillFromDate() {
      var v = hf.harvest_date.value;
      var info = root.querySelector('#confirm-auto');
      if (!v) { info.textContent = '確定日は、収穫予定日の3日前の9時に自動で決まります。'; return; }
      if (autoName) hf.name.value = Rules.roundName(v);
      info.textContent = '確定日：' + fmtDate(Rules.confirmAtFor(v)) + ' 9:00（収穫予定日の3日前・自動）';
    }
    hf.name.addEventListener('input', function () { autoName = hf.name.value === ''; });
    hf.item_id.addEventListener('change', function () { hf.per_person_limit.value = ''; fillFromItem(); });
    hf.harvest_date.addEventListener('input', fillFromDate);
    fillFromItem();
    fillFromDate();
    hf.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = { item_id: hf.item_id.value, harvest_date: hf.harvest_date.value, name: hf.name.value,
        reserve_limit: hf.reserve_limit.value, per_person_limit: hf.per_person_limit.value };
      var res = Rules.createHarvest(S(), f, Clock.now());
      if (res.error) {
        var w = root.querySelector('#harvest-warn');
        w.textContent = res.error;
        w.hidden = false;
        return;
      }
      Store.save();
      renderSetup(title(res.harvest) + ' を作りました。お客さんの画面で予約を受け付けます。確定日は ' + confirmTime(res.harvest) + ' です。');
    });

    // 品目のフォーム
    var itf = root.querySelector('#item-form');
    itf.addEventListener('submit', function (e) {
      e.preventDefault();
      var picked = itf.querySelector('input[name="mark"]:checked');
      var res = Rules.createItem(S(), { name: itf.name.value, unit: itf.unit.value, price: itf.price.value,
        pay_hours: itf.pay_hours.value, per_person_limit: itf.per_person_limit.value, mark: picked ? picked.value : '' });
      if (res.error) {
        var w = root.querySelector('#item-warn');
        w.textContent = res.error;
        w.hidden = false;
        return;
      }
      Store.save();
      renderSetup('品目「' + res.item.name + '」を作りました。上の「収穫回を作る」で、収穫回を作ってください。', { item_id: res.item.id });
      window.scrollTo(0, 0);
    });
  }

  // ---- お店の紹介（お客さんの画面のいちばん上に出る文） ----
  function renderIntro(notice) {
    view = { name: 'intro' };
    var farm = S().farm;
    var html = subnav('intro');
    html += '<h2>お店の紹介</h2>';
    html += '<p class="plan-note">お客さんの画面の「予約する」のいちばん上に出る文です。畑のようすや、今年の出来などを書いてください。</p>';
    if (notice) html += '<p class="notice">' + esc(notice) + '</p>';
    html += '<section class="template">' +
      '<div class="message-head"><b>' + esc(farm.name) + 'より</b>' +
      (Store.isDefaultIntro() ? '' : '<small class="changed">書き換え済み</small>') + '</div>' +
      '<textarea rows="5" id="intro-text" aria-label="お店の紹介の文">' + esc(Store.farmIntro()) + '</textarea>' +
      '<p class="template-sample"><small>お客さんの画面では：</small></p>' +
      '<div class="letter"><p class="letter-from">' + esc(farm.name) + 'より</p><p id="intro-preview" class="letter-body">' + esc(Store.farmIntro()) + '</p>' +
      '<p class="letter-small">農園での受け取り場所：' + esc(farm.pickup_place) + '</p></div>' +
      '<div class="template-buttons">' +
      '<button type="button" class="filter-button is-current" id="intro-save">保存する</button>' +
      '<button type="button" class="filter-button" id="intro-default">元の文に戻す</button>' +
      '</div></section>';
    root.innerHTML = html;
    bindSubnav();

    var area = root.querySelector('#intro-text');
    var preview = root.querySelector('#intro-preview');
    area.addEventListener('input', function () { preview.textContent = area.value; });
    root.querySelector('#intro-save').addEventListener('click', function () {
      Store.setFarmIntro(area.value);
      Store.save();
      renderIntro('お店の紹介を保存しました。お客さんの画面に出ます。');
    });
    root.querySelector('#intro-default').addEventListener('click', function () {
      if (!window.confirm('お店の紹介を、元の文に戻します。よろしいですか？')) return;
      Store.resetFarmIntro();
      Store.save();
      renderIntro('お店の紹介を、元の文に戻しました。');
    });
  }

  // 農家の画面を開く（いつもホームから）
  function open(container) {
    root = container;
    renderHome();
  }

  // 今見ている画面を描き直す（時計を動かしたとき）
  function refresh() {
    if (view.name === 'harvest') renderHarvest(view.id);
    else if (view.name === 'messages') renderMessages();
    else if (view.name === 'templates') renderTemplates();
    else if (view.name === 'intro') renderIntro();
    else if (view.name === 'setup') renderSetup();
    else renderHome();
  }

  return { open: open, refresh: refresh };
})();
