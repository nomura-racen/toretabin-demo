// お客さんの画面
window.Customer = (function () {
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  var root = null;
  var who = '';        // 選んでいるお客さん（デモ用）
  var tab = 'book';    // book：予約する ／ mine：自分の予約
  var formFor = null;  // 予約フォームを開いている収穫回
  var notice = '';

  // ---- 小さな道具 ----
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function S() { return Store.get(); }
  function fmtDay(s) {
    var d = new Date(s.slice(0, 10) + 'T00:00:00');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WEEK[d.getDay()] + '）';
  }
  function yen(n) { return n.toLocaleString('ja-JP'); }
  function item(h) { return S().items.find(function (i) { return i.id === h.item_id; }); }
  function unitWord(h) { return item(h).unit.replace(/（.*）/, ''); }
  function title(h) { return item(h).name + ' ' + h.name; }
  function harvest(id) { return S().harvests.find(function (h) { return h.id === id; }); }
  function me() { return S().customers.find(function (c) { return c.id === who; }); }
  function badge(text) { return '<span class="badge" data-state="' + esc(text) + '">' + esc(text) + '</span>'; }
  function choice(name, value, label, note, checked) {
    return '<label class="choice"><input type="radio" name="' + name + '" value="' + esc(value) + '"' +
      (checked ? ' checked' : '') + '><span><b>' + esc(label) + '</b>' + (note ? '<small>' + esc(note) + '</small>' : '') + '</span></label>';
  }

  // ---- 全体 ----
  function render() {
    var html = '<div class="picker"><label><span>お客さんを選ぶ（デモ用）</span>' +
      '<select id="who"><option value="">選んでください</option>' +
      S().customers.map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === who ? ' selected' : '') + '>' + esc(c.name) + '（' + esc(c.home) + '）</option>';
      }).join('') + '</select></label></div>';

    if (!who) {
      html += '<p class="none">まず、どのお客さんとして見るかを選んでください。</p>';
    } else {
      var mine = S().reservations.filter(function (r) { return r.customer_id === who; });
      html += '<p class="hello">' + esc(me().name) + ' さん、こんにちは。</p>';
      html += '<div class="tabs">' +
        '<button type="button" class="tab' + (tab === 'book' ? ' is-current' : '') + '" data-tab="book" aria-pressed="' + (tab === 'book') + '">予約する</button>' +
        '<button type="button" class="tab' + (tab === 'mine' ? ' is-current' : '') + '" data-tab="mine" aria-pressed="' + (tab === 'mine') + '">自分の予約（' + mine.length + '）</button>' +
        '</div>';
      if (notice) html += '<p class="notice">' + esc(notice) + '</p>';
      html += tab === 'book' ? bookHtml() : mineHtml(mine);
    }
    root.innerHTML = html;
    bind();
  }

  // ---- 予約する ----
  function bookHtml() {
    var farm = S().farm;
    var html = '<section class="letter">' +
      '<p class="letter-from">' + esc(farm.name) + 'より</p>' +
      '<p>' + esc(farm.place) + 'の畑から、とれたてをお届けします。とれた分だけを、待っていてくださる方へ順番にお送りします。</p>' +
      '<p class="letter-small">農園での受け取り場所：' + esc(farm.pickup_place) + '</p>' +
      '</section>';

    var list = S().harvests.filter(function (h) { return h.stage === '予約受付中'; })
      .sort(function (a, b) { return a.harvest_date < b.harvest_date ? -1 : 1; });

    html += '<h2 class="c-heading">受付中の収穫</h2>';
    if (!list.length) html += '<p class="none">いま受け付けている収穫はありません。</p>';
    list.forEach(function (h) {
      var it = item(h), u = unitWord(h);
      var rest = Rules.remaining(S(), h);
      var max = Rules.maxQuantity(S(), h, who);
      html += '<article class="harvest-card">' +
        '<h3>' + esc(title(h)) + '</h3>' +
        '<dl class="facts">' +
        '<div><dt>収穫予定日</dt><dd>' + fmtDay(h.harvest_date) + '</dd></div>' +
        '<div><dt>値段</dt><dd>' + yen(it.price) + '円 ／ ' + esc(it.unit) + '</dd></div>' +
        '<div><dt>残りの受付数</dt><dd><b>' + rest + '</b>' + esc(u) + '</dd></div>' +
        '</dl>';
      if (formFor === h.id) {
        html += formHtml(h, max);
      } else if (max > 0) {
        html += '<button type="button" class="c-button" data-form="' + h.id + '">この収穫を予約する</button>';
      } else {
        html += '<p class="none">' + (rest === 0 ? '受付数がいっぱいになりました。' : '1人あたりの上限まで予約済みです。') + '</p>';
      }
      html += '</article>';
    });
    return html;
  }

  function formHtml(h, max) {
    var u = unitWord(h);
    var html = '<form class="book-form" data-harvest="' + h.id + '">';

    html += '<fieldset><legend>数量 <small>（1人' + h.per_person_limit + u + 'まで）</small></legend><div class="choices row">';
    for (var n = 1; n <= max; n++) html += choice('quantity', n, n + u, '', n === 1);
    html += '</div></fieldset>';

    html += '<fieldset><legend>一部しか用意できないとき</legend><div class="choices">' +
      choice('when_short', 'そろった分だけ送る', 'そろった分だけ送る', '用意できた分を先に届け、残りは次の収穫に回します') +
      choice('when_short', '全部そろうまで待つ', '全部そろうまで待つ', '今回は送らず、全部を次の収穫に回します') +
      '</div></fieldset>';

    html += '<fieldset><legend>受け取り方法</legend><div class="choices">' +
      choice('receive', '配送', '配送', 'ご自宅へお届けします') +
      choice('receive', '農園で受け取り', '農園で受け取り', S().farm.pickup_place + 'でお渡しします') +
      '</div></fieldset>';

    html += '<fieldset><legend>支払い方法</legend><div class="choices">' +
      (me().has_card ? choice('payment', 'カード登録', 'カード登録', '登録済みのカードで、お届けが決まったときにお支払い') : '') +
      choice('payment', '確定後に支払う', '確定後に支払う', 'お届けが決まったお知らせのあと、期限までにお支払い') +
      '</div></fieldset>';

    html += '<div class="free-note"><b>予約の時点では、お支払いは発生しません。</b>' +
      '収穫の3日前（' + fmtDay(h.confirm_at) + '）に、お届けできる数をお知らせします。</div>';
    html += '<p class="warn" id="form-warn" hidden></p>';
    html += '<div class="form-buttons">' +
      '<button type="submit" class="c-button">予約する</button>' +
      '<button type="button" class="c-button ghost" data-close>やめる</button></div>';
    return html + '</form>';
  }

  // ---- 自分の予約 ----
  function mineHtml(mine) {
    if (!mine.length) return '<p class="none">まだ予約はありません。</p>';
    var now = Clock.now();
    var list = mine.slice().sort(function (a, b) {
      var ha = harvest(a.harvest_id).harvest_date, hb = harvest(b.harvest_id).harvest_date;
      if (ha !== hb) return ha < hb ? -1 : 1;
      return a.reserved_at < b.reserved_at ? -1 : 1;
    });
    var html = '';
    list.forEach(function (r) {
      var h = harvest(r.harvest_id), it = item(h), u = unitWord(h);
      var count = r.allocated != null && r.allocated > 0 ? r.allocated : r.quantity;
      html += '<article class="mine-card">' +
        '<div class="mine-head"><h3>' + esc(title(h)) + '</h3>' + badge(r.status) + '</div>' +
        '<dl class="facts">' +
        '<div><dt>数</dt><dd><b>' + r.quantity + '</b>' + esc(u) +
        (r.allocated != null && r.allocated !== r.quantity ? '（お届けは ' + r.allocated + esc(u) + '）' : '') + '</dd></div>' +
        '<div><dt>収穫予定日</dt><dd>' + fmtDay(h.harvest_date) + '</dd></div>' +
        '<div><dt>受け取り方法</dt><dd>' + esc(r.receive) + '</dd></div>' +
        '</dl>';

      if (r.status === '支払い待ち') {
        var d = new Date(r.pay_deadline);
        html += '<div class="pay-box"><p>お支払い期限：<b>' + Clock.format(d) + '</b>　' + yen(count * it.price) + '円</p>' +
          (Rules.canPay(r, now)
            ? '<button type="button" class="c-button" data-pay="' + r.id + '">支払う</button>'
            : '<p class="warn">お支払い期限を過ぎました。</p>') + '</div>';
      }
      if (Rules.canCancel(S(), r)) {
        html += '<button type="button" class="c-button ghost" data-cancel="' + r.id + '">キャンセルする</button>';
      }

      var msgs = S().messages.filter(function (m) { return m.reservation_id === r.id; })
        .sort(function (a, b) { return a.sent_at < b.sent_at ? 1 : -1; });
      if (msgs.length) {
        html += '<div class="c-messages"><p class="c-messages-title">届いた連絡</p>' + msgs.map(function (m) {
          return '<div class="c-message"><p class="c-message-head"><span class="badge" data-kind="' + esc(m.kind) + '">' + esc(m.kind) + '</span> ' +
            Clock.format(new Date(m.sent_at)) + '</p><p>' + esc(m.body) + '</p></div>';
        }).join('') + '</div>';
      }
      html += '</article>';
    });
    return html;
  }

  // ---- 操作 ----
  function bind() {
    root.querySelector('#who').addEventListener('change', function (e) {
      who = e.target.value; tab = 'book'; formFor = null; notice = '';
      render();
    });
    root.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-tab'); notice = ''; render(); });
    });
    root.querySelectorAll('[data-form]').forEach(function (b) {
      b.addEventListener('click', function () { formFor = b.getAttribute('data-form'); notice = ''; render(); });
    });
    root.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { formFor = null; render(); });
    });

    var form = root.querySelector('.book-form');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var get = function (n) { var x = form.querySelector('input[name="' + n + '"]:checked'); return x ? x.value : ''; };
      var choices = { quantity: Number(get('quantity')), when_short: get('when_short'), receive: get('receive'), payment: get('payment') };
      var warn = form.querySelector('#form-warn');
      if (!choices.when_short || !choices.receive || !choices.payment) {
        warn.textContent = 'まだ選んでいないところがあります。';
        warn.hidden = false;
        return;
      }
      var h = harvest(form.getAttribute('data-harvest'));
      if (!Rules.reserve(S(), h, who, choices, Clock.now())) {
        warn.textContent = 'この数では予約できませんでした。数量を選び直してください。';
        warn.hidden = false;
        return;
      }
      Store.save();
      formFor = null; tab = 'mine';
      notice = title(h) + ' を ' + choices.quantity + unitWord(h) + ' 予約しました。お支払いはまだ発生していません。';
      render();
      window.scrollTo(0, 0);
    });

    root.querySelectorAll('[data-pay]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = S().reservations.find(function (x) { return x.id === b.getAttribute('data-pay'); });
        if (!window.confirm('お支払いします。よろしいですか？')) return;
        if (Rules.pay(r, Clock.now())) { Store.save(); notice = 'お支払いが済みました。ありがとうございます。'; }
        render();
      });
    });
    root.querySelectorAll('[data-cancel]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = S().reservations.find(function (x) { return x.id === b.getAttribute('data-cancel'); });
        if (!window.confirm('この予約をキャンセルします。よろしいですか？')) return;
        if (Rules.cancel(S(), r)) { Store.save(); notice = '予約をキャンセルしました。'; }
        render();
      });
    });
  }

  // お客さんの画面を開く
  function open(container) {
    root = container;
    notice = '';
    render();
  }

  return { open: open };
})();
