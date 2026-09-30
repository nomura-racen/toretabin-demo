// お客さんの画面
window.Customer = (function () {
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  var root = null;
  var who = '';        // ログインしているお客さん
  var tab = 'book';    // book：予約する ／ mine：自分の予約
  var formFor = null;  // 予約フォームを開いている収穫回
  var editFor = null;  // 変更フォームを開いている予約
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
  // カードの見出し：「8月上旬」の途中で改行しないように
  function cardTitle(h) { return '<span>' + esc(item(h).name) + ' <span class="nowrap">' + esc(h.name) + '</span></span>'; }
  // 品目の小さな絵（写真の代わり）
  function mark(h) { return Store.itemMark(item(h)); }
  function badge(text) { return '<span class="badge" data-state="' + esc(text) + '">' + esc(text) + '</span>'; }
  function choice(name, value, label, note, checked) {
    return '<label class="choice"><input type="radio" name="' + name + '" value="' + esc(value) + '"' +
      (checked ? ' checked' : '') + '><span><b>' + esc(label) + '</b>' + (note ? '<small>' + esc(note) + '</small>' : '') + '</span></label>';
  }

  // ---- 全体 ----
  function render() {
    var html = '';
    if (!who || !me()) {
      html += '<p class="none">ログインしてください。</p>';
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
    // 紹介文は、農家の画面の「お店の紹介」で書き換えられる
    var html = '<section class="letter">' +
      '<p class="letter-from">' + esc(farm.name) + 'より</p>' +
      '<p class="letter-body">' + esc(Store.farmIntro()) + '</p>' +
      '<p class="letter-small">農園での受け取り場所：' + esc(farm.pickup_place) + '</p>' +
      '</section>';

    // 出す回：確定日時前の回（農家が受付をやめた回も「終了」として出す）と、追加受付中の回
    var list = S().harvests.filter(function (h) {
      return (h.stage === '予約受付中' && !Rules.isConfirmTimeReached(h)) || Rules.isExtraAccepting(h);
    }).sort(function (a, b) { return a.harvest_date < b.harvest_date ? -1 : 1; });

    html += '<h2 class="c-heading"><span>受付中の収穫</span></h2>';
    if (!list.length) html += '<p class="none">いま受け付けている収穫はありません。</p>';
    list.forEach(function (h) {
      var it = item(h), u = unitWord(h);
      // 追加受付中：確定済みで余りがある回。先着順で、予約するとすぐにお届けが決まる
      if (Rules.isExtraAccepting(h)) {
        var emax = Rules.extraMaxQuantity(S(), h, who);
        html += '<article class="harvest-card extra-card">' +
          '<p class="extra-label">追加受付中</p>' +
          '<h3><span class="item-mark" aria-hidden="true">' + mark(h) + '</span>' + cardTitle(h) + '</h3>' +
          '<dl class="facts">' +
          '<div><dt>収穫予定日</dt><dd>' + fmtDay(h.harvest_date) + '</dd></div>' +
          '<div><dt>値段</dt><dd>' + yen(it.price) + '円 ／ ' + esc(it.unit) + '</dd></div>' +
          '<div><dt>追加で予約できる数</dt><dd><b>' + Rules.extraPool(h) + '</b>' + esc(u) + '</dd></div>' +
          '</dl>';
        if (formFor === h.id) html += formHtml(h, emax, null, true);
        else if (emax > 0) html += '<button type="button" class="c-button" data-form="' + h.id + '">追加で予約する（すぐにお届けが決まります）</button>';
        else html += '<p class="none">1人あたりの上限まで、お届けが決まっています。</p>';
        html += '</article>';
        return;
      }
      var rest = Rules.remaining(S(), h);
      var max = Rules.maxQuantity(S(), h, who);
      html += '<article class="harvest-card">' +
        '<h3><span class="item-mark" aria-hidden="true">' + mark(h) + '</span>' + cardTitle(h) + '</h3>' +
        '<dl class="facts">' +
        '<div><dt>収穫予定日</dt><dd>' + fmtDay(h.harvest_date) + '</dd></div>' +
        '<div><dt>値段</dt><dd>' + yen(it.price) + '円 ／ ' + esc(it.unit) + '</dd></div>' +
        (Rules.isAccepting(h) ? '<div><dt>残りの受付数</dt><dd><b>' + rest + '</b>' + esc(u) + '</dd></div>' : '') +
        '</dl>';
      // 同じ回の予約中の予約は1枚にまとめる：あれば、予約ではなく「変更」にする
      var own = Rules.ownReservation(S(), h, who);
      if (own && editFor === own.id) {
        html += '<h4 class="edit-title">予約の内容を変更する</h4>' + formHtml(h, Rules.editMaxQuantity(S(), own), own);
      } else if (own) {
        html += '<p class="booked-note">予約済み：<b>' + own.quantity + '</b>' + esc(u) + '</p>' +
          '<button type="button" class="c-button edit-button" data-edit-open="' + own.id + '">数や内容を変更する</button>';
        if (!Rules.isAccepting(h)) html += '<p class="closed-note">受付を終了しました</p>';
      } else if (!Rules.isAccepting(h)) {
        html += '<p class="closed-note">受付を終了しました</p>';
      } else if (formFor === h.id) {
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

  // 予約のフォーム。r を渡すと、その予約の内容を入れた「変更」のフォームになる。
  // extra が true なら「追加の予約」のフォーム（数は確保済みなので、一部しか用意できないときの希望は聞かない）
  function formHtml(h, max, r, extra) {
    var u = unitWord(h);
    var html = '<form class="book-form" data-harvest="' + h.id + '"' + (r ? ' data-edit="' + r.id + '"' : '') + (extra ? ' data-extra="1"' : '') + '>';
    var picked = function (key, value) { return r ? r[key] === value : false; };

    html += '<fieldset><legend>数量 <small>（1人' + h.per_person_limit + u + 'まで）</small></legend><div class="choices row">';
    for (var n = 1; n <= max; n++) html += choice('quantity', n, n + u, '', r ? r.quantity === n : n === 1);
    html += '</div>';
    if (r && !Rules.isAccepting(h)) html += '<small class="form-hint">受付を終了した収穫のため、数を増やすことはできません。</small>';
    html += '</fieldset>';

    if (!extra) html += '<fieldset><legend>一部しか用意できないとき</legend><div class="choices">' +
      choice('when_short', 'そろった分だけ送る', 'そろった分だけ送る', '用意できた分を先に届け、残りは次の収穫に回します', picked('when_short', 'そろった分だけ送る')) +
      choice('when_short', '全部そろうまで待つ', '全部そろうまで待つ', '今回は送らず、全部を次の収穫に回します', picked('when_short', '全部そろうまで待つ')) +
      '</div></fieldset>';

    html += '<fieldset><legend>受け取り方法</legend><div class="choices">' +
      choice('receive', '配送', '配送', 'ご自宅へお届けします', picked('receive', '配送')) +
      choice('receive', '農園で受け取り', '農園で受け取り', S().farm.pickup_place + 'でお渡しします', picked('receive', '農園で受け取り')) +
      '</div></fieldset>';

    html += '<fieldset><legend>支払い方法</legend><div class="choices">' +
      (me().has_card ? choice('payment', 'カード登録', 'カード登録', '登録済みのカードで、お届けが決まったときにお支払い', picked('payment', 'カード登録')) : '') +
      choice('payment', '確定後に支払う', '確定後に支払う', 'お届けが決まったお知らせのあと、期限までにお支払い', picked('payment', '確定後に支払う')) +
      '</div></fieldset>';

    if (extra) {
      html += '<div class="free-note extra-note"><b>この予約は、すぐにお届けが決まります。</b>' +
        'カード登録の方はその場でお支払い、確定後に支払う方は ' + item(h).pay_hours + '時間以内にお支払いください。' +
        fmtDay(h.harvest_date) + 'に収穫してお届けします。</div>';
    } else {
      html += '<div class="free-note"><b>予約の時点では、お支払いは発生しません。</b>' +
        '収穫の3日前の ' + fmtDay(h.confirm_at) + ' に、お届けできる数をお知らせします。' +
        (r ? '内容を変えても、お届けの順番（予約した日時）は変わりません。' : '') + '</div>';
    }
    html += '<p class="warn" id="form-warn" hidden></p>';
    html += '<div class="form-buttons">' +
      '<button type="submit" class="c-button">' + (r ? 'この内容に変更する' : extra ? '追加で予約する' : '予約する') + '</button>' +
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
        '<div class="mine-head"><h3><span class="item-mark" aria-hidden="true">' + mark(h) + '</span>' + cardTitle(h) + '</h3>' + badge(r.status) + '</div>' +
        '<dl class="facts">' +
        '<div><dt>数</dt><dd><b>' + r.quantity + '</b>' + esc(u) +
        (r.allocated != null && r.allocated !== r.quantity ? '（お届けは ' + r.allocated + esc(u) + '）' : '') + '</dd></div>' +
        '<div><dt>収穫予定日</dt><dd>' + fmtDay(h.harvest_date) + '</dd></div>' +
        '<div><dt>受け取り方法</dt><dd>' + esc(r.receive) + '</dd></div>' +
        '<div><dt>一部しか用意できないとき</dt><dd>' + esc(r.when_short) + '</dd></div>' +
        '<div><dt>支払い方法</dt><dd>' + esc(r.payment) + '</dd></div>' +
        '</dl>';

      // 変更のフォーム（予約中の予約だけ）
      if (editFor === r.id && Rules.canEdit(S(), r)) {
        html += '<h4 class="edit-title">予約の内容を変更する</h4>' + formHtml(h, Rules.editMaxQuantity(S(), r), r) + '</article>';
        return;
      }

      if (r.status === '支払い待ち') {
        var d = new Date(r.pay_deadline);
        html += '<div class="pay-box"><p>お支払い期限：<b>' + Clock.format(d) + '</b>　' + yen(count * it.price) + '円</p>' +
          (Rules.canPay(r, now)
            ? '<button type="button" class="c-button" data-pay="' + r.id + '">支払う</button>'
            : '<p class="warn">お支払い期限を過ぎました。</p>') + '</div>';
      }
      // 空きのご案内（返事待ち）：受け取る／見送る
      var o = Rules.pendingOffer(S(), r);
      if (o) {
        var oh = harvest(o.harvest_id);
        html += '<div class="offer-box"><p><b>空きのご案内</b>　' + esc(title(oh)) + '（' + fmtDay(oh.harvest_date) + '収穫）を ' +
          o.quantity + esc(unitWord(oh)) + '、' + yen(o.quantity * item(oh).price) + '円でお届けできます。</p>' +
          '<p>お返事の期限：<b>' + Clock.format(new Date(o.deadline)) + '</b></p>' +
          '<div class="offer-buttons">' +
          '<button type="button" class="c-button" data-accept="' + r.id + '">受け取る</button>' +
          '<button type="button" class="c-button ghost" data-decline="' + r.id + '">見送る</button>' +
          '</div></div>';
      }
      // 状態のひとこと説明
      var note = {
        '予約中': '収穫の3日前の ' + fmtDay(h.confirm_at) + ' に、お届けできる数をお知らせします。',
        '繰り越し': h.stage === '予約受付中' ? 'この回の予約として、優先で受け付けています。' : '次の収穫回に、優先で回しました。',
        '次の回待ち': '次の収穫回が決まりしだい、優先で予約に入れてお知らせします。お金はかかりません。',
        '期限切れ': 'お支払い期限を過ぎたため、この予約は終わりました。この分は、ほかの方にご案内しています。',
        'キャンセル': 'この予約はキャンセルになりました。お金はかかりません。',
        '支払い済み': 'お支払い済みです。' + fmtDay(h.harvest_date) + 'に収穫してお届けします。'
      }[r.status];
      if (note) html += '<p class="state-note">' + esc(note) + '</p>';

      // 変更：予約中だけ
      if (Rules.canEdit(S(), r)) {
        html += '<button type="button" class="c-button edit-button" data-edit-open="' + r.id + '">予約の内容を変更する</button>';
      }

      // キャンセル：支払い済み以外はできる
      if (Rules.canCancel(S(), r)) {
        html += '<div class="cancel-box"><button type="button" class="c-button ghost" data-cancel="' + r.id + '">この予約をキャンセルする</button>' +
          '<small>' + (r.status === '支払い待ち' ? 'お支払い前なので、お金はかかりません。' : 'まだお金はかかっていません。') + '</small></div>';
      } else if (r.status === '支払い済み') {
        html += '<p class="state-note"><small>お支払い済みのため、この予約はキャンセルできません。</small></p>';
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
    root.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-tab'); formFor = null; editFor = null; notice = ''; render(); });
    });
    root.querySelectorAll('[data-form]').forEach(function (b) {
      b.addEventListener('click', function () { formFor = b.getAttribute('data-form'); notice = ''; render(); });
    });
    root.querySelectorAll('[data-edit-open]').forEach(function (b) {
      b.addEventListener('click', function () { editFor = b.getAttribute('data-edit-open'); notice = ''; render(); });
    });
    root.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { formFor = null; editFor = null; render(); });
    });

    var form = root.querySelector('.book-form');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var get = function (n) { var x = form.querySelector('input[name="' + n + '"]:checked'); return x ? x.value : ''; };
      var choices = { quantity: Number(get('quantity')), when_short: get('when_short'), receive: get('receive'), payment: get('payment') };
      var warn = form.querySelector('#form-warn');
      var isExtra = form.getAttribute('data-extra') === '1';
      if ((!isExtra && !choices.when_short) || !choices.receive || !choices.payment) {
        warn.textContent = 'まだ選んでいないところがあります。';
        warn.hidden = false;
        return;
      }
      var h = harvest(form.getAttribute('data-harvest'));

      // 追加の予約：すぐにお届けが決まる
      if (isExtra) {
        var added = Rules.reserveExtra(S(), h, who, choices, Clock.now());
        if (!added) {
          warn.textContent = 'この数では予約できませんでした。数量を選び直してください。';
          warn.hidden = false;
          return;
        }
        Store.save();
        formFor = null; tab = 'mine';
        notice = title(h) + ' を ' + choices.quantity + unitWord(h) + ' 追加で予約しました。お届けが決まりました（' + added.status + '）。';
        render();
        window.scrollTo(0, 0);
        return;
      }

      // 変更のフォーム
      var editId = form.getAttribute('data-edit');
      if (editId) {
        var target = S().reservations.find(function (x) { return x.id === editId; });
        if (!Rules.editReservation(S(), target, choices, Clock.now())) {
          warn.textContent = 'この内容には変更できませんでした。数量を選び直してください。';
          warn.hidden = false;
          return;
        }
        Store.save();
        editFor = null;
        notice = title(h) + ' の予約の内容を変更しました。';
        render();
        window.scrollTo(0, 0);
        return;
      }

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
        var ch = harvest(r.harvest_id);
        if (!window.confirm(title(ch) + '（' + r.quantity + unitWord(ch) + '）の予約をキャンセルします。よろしいですか？')) return;
        if (Rules.cancel(S(), r, Clock.now())) { Store.save(); notice = '予約をキャンセルしました。'; }
        render();
      });
    });
    root.querySelectorAll('[data-accept]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = S().reservations.find(function (x) { return x.id === b.getAttribute('data-accept'); });
        if (Rules.acceptOffer(S(), r, Clock.now())) { Store.save(); notice = '空きのご案内を受け取りました。'; }
        render();
      });
    });
    root.querySelectorAll('[data-decline]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = S().reservations.find(function (x) { return x.id === b.getAttribute('data-decline'); });
        if (Rules.declineOffer(S(), r, Clock.now())) { Store.save(); notice = '空きのご案内を見送りました。'; }
        render();
      });
    });
  }

  // お客さんの画面を開く（customerId はログインしたお客さん）
  function open(container, customerId) {
    root = container;
    if (customerId !== who) { tab = 'book'; formFor = null; }
    who = customerId;
    notice = '';
    render();
  }

  // 今見ている画面を描き直す（時計を動かしたとき）
  function refresh() {
    notice = '';
    render();
  }

  return { open: open, refresh: refresh };
})();
