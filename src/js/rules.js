// 振り分け・支払い期限・補欠への案内のルール（画面は持たない）
window.Rules = (function () {
  // 「支払い期限が近い」とみなす、期限までの残り時間
  var NEAR_DEADLINE_HOURS = 24;
  // 割り当てる数を出すときに、見込み量にかける数（data.js の allocation_ratio は使わない）
  var ALLOCATION_RATIO = 0.8;
  // 【デモ用】空きの案内を受けたお客さんが、時計を進めると自動で返事をする（本番では false にする）
  var DEMO_AUTO_REPLY = true;

  // ---- 小さな道具 ----
  function pad(n) { return String(n).padStart(2, '0'); }
  function stamp(d) { // 例：2026-08-05T09:00:00
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
  }
  function jpDateTime(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + d.getHours() + '時' + (d.getMinutes() ? pad(d.getMinutes()) + '分' : ''); }
  function jpDate(s) { var d = new Date(s + 'T00:00:00'); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function itemOf(state, h) { return state.items.find(function (i) { return i.id === h.item_id; }); }
  function unitWord(item) { return item.unit.replace(/（.*）/, ''); } // 「箱（5本入り）」→「箱」
  function yen(n) { return n.toLocaleString('ja-JP'); }
  function harvestOf(state, r) { return state.harvests.find(function (x) { return x.id === r.harvest_id; }); }
  function customerOf(state, r) { return state.customers.find(function (c) { return c.id === r.customer_id; }); }
  function nameOf(state, h) { return itemOf(state, h).name + ' ' + h.name; }
  function hoursLater(d, hours) { return new Date(d.getTime() + hours * 60 * 60 * 1000); }

  // ---- お客さんへの連絡の文（ひな形） ----
  // {…} の所には、送るときに中身が入る。農家が画面で書き換えた文は state.templates に保存する
  var TEMPLATES = [
    { kind: 'お届け決定', when: '確定したとき（カードでお支払い済みの方）',
      keys: ['お名前', '収穫回', '数', '金額', '収穫日'],
      text: '{収穫回}のお届けが決まりました。{数}（{金額}）を、ご登録のカードでお支払いいただきました。{収穫日}に収穫してお届けします。' },
    { kind: '支払いのお願い', when: '確定したとき（確定後に支払う方・カードが使えなかった方）',
      keys: ['お名前', '収穫回', '数', '金額', '期限', '収穫日', 'カードのお知らせ'],
      text: '{収穫回}のお届けが決まりました。{カードのお知らせ}{数}（{金額}）を、{期限}までにお支払いください。お支払いを確かめてから、{収穫日}に収穫します。' },
    { kind: '繰り越しのお知らせ', when: '確定したとき（足りない分を次の回に回す方）',
      keys: ['お名前', '収穫回', '数', '繰り越し先'],
      text: '{収穫回}は、見込みより少なく、{数}をご用意できませんでした。この{数}は、{繰り越し先}の予約として優先で受け付けています。' },
    { kind: '次の回待ちのお知らせ', when: '確定したとき（足りない分があり、次の回がまだない方）',
      keys: ['お名前', '収穫回', '数'],
      text: '{収穫回}は、見込みより少なく、{数}をご用意できませんでした。次の収穫回が決まりしだい、この{数}を優先で予約に入れてお知らせします。お金はかかりません。' },
    { kind: '次の回のお知らせ', when: '次の回待ちの方を、新しく作った収穫回に入れたとき',
      keys: ['お名前', '収穫回', '数', '繰り越し先'],
      text: '{収穫回}でご用意できなかった{数}を、{繰り越し先}の予約として優先で受け付けました。' },
    { kind: '期限切れ', when: 'お支払い期限を過ぎたとき',
      keys: ['お名前', '収穫回'],
      text: '{収穫回}は、お支払い期限を過ぎたため、予約が期限切れになりました。' },
    { kind: '空きのご案内', when: '空きが出て、補欠の方に案内するとき',
      keys: ['お名前', '収穫回', '数', '期限', '収穫日'],
      text: '{収穫回}（{収穫日}収穫）に空きが出ました。{数}をお届けできます。{期限}までに「受け取る」か「見送る」をお選びください。' },
    { kind: '見送り', when: '空きのご案内を見送ったとき',
      keys: ['お名前', '収穫回', '残る予約'],
      text: '{収穫回}の空きのご案内を、見送りとして承りました。{残る予約}' },
    { kind: '案内の期限切れ', when: '空きのご案内に、期限までお返事がなかったとき',
      keys: ['お名前', '収穫回', '残る予約'],
      text: '{収穫回}の空きのご案内は、お返事の期限を過ぎたため終了しました。{残る予約}' },
    { kind: 'キャンセル受付', when: 'お客さんが予約をキャンセルしたとき',
      keys: ['お名前', '収穫回', '数'],
      text: '{収穫回}の予約（{数}）のキャンセルを承りました。' },
    { kind: '予約の変更', when: 'お客さんが予約の内容を変えたとき',
      keys: ['お名前', '収穫回', '変更の内容'],
      text: '{収穫回}の予約の変更を承りました。{変更の内容}' }
  ];
  // ひな形の画面で、見本として入れる中身
  var SAMPLE = {
    '変更の内容': '数量：1玉 → 2玉。',
    'お名前': '青山 ゆい', '収穫回': '赤肉メロン 8月中旬', '数': '2玉', '金額': '5,000円', '収穫日': '8月15日',
    '期限': '8月13日 9時', '繰り越し先': '8月下旬（8月24日収穫）', '残る予約': '8月下旬の予約は、そのまま残ります。',
    'カードのお知らせ': 'ご登録のカードでお支払いができませんでした。お手数ですが、'
  };

  function templateList() { return TEMPLATES; }
  function templateText(state, kind) {
    var saved = state.templates && state.templates[kind];
    if (saved != null) return saved;
    return TEMPLATES.find(function (t) { return t.kind === kind; }).text;
  }
  function fill(text, vars) {
    return text.replace(/\{([^{}]+)\}/g, function (all, key) { return vars[key] != null ? vars[key] : all; });
  }
  function saveTemplate(state, kind, text) {
    if (!state.templates) state.templates = {};
    state.templates[kind] = text;
  }
  function resetTemplate(state, kind) {
    if (state.templates) delete state.templates[kind];
  }
  function sampleMessage(text) { return fill(text, SAMPLE); }

  // お客さんへの連絡を、ひな形から作って履歴に残す
  function sendMessage(state, r, h, at, kind, vars) {
    var all = { 'お名前': customerOf(state, r).name, '収穫回': nameOf(state, h), '収穫日': jpDate(h.harvest_date) };
    Object.keys(vars || {}).forEach(function (k) { all[k] = vars[k]; });
    state.messages.push({
      id: Store.nextId(state.messages, 'm'), customer_id: r.customer_id, reservation_id: r.id,
      harvest_id: h.id, sent_at: stamp(at), kind: kind, body: fill(templateText(state, kind), all)
    });
  }

  // 届ける数が決まった予約の支払い：カード登録の人は支払い済み。それ以外とカードが使えない人は支払い待ち
  function settle(state, r, h, qty, at) {
    var item = itemOf(state, h);
    var vars = { '数': qty + unitWord(item), '金額': yen(qty * item.price) + '円' };
    if (r.payment === 'カード登録' && !customerOf(state, r).card_fails) {
      r.status = '支払い済み';
      r.paid_at = stamp(at);
      sendMessage(state, r, h, at, 'お届け決定', vars);
    } else {
      var deadline = hoursLater(at, item.pay_hours);
      r.status = '支払い待ち';
      r.pay_deadline = stamp(deadline);
      vars['期限'] = jpDateTime(deadline);
      vars['カードのお知らせ'] = customerOf(state, r).card_fails ? 'ご登録のカードでお支払いができませんでした。お手数ですが、' : '';
      sendMessage(state, r, h, at, '支払いのお願い', vars);
    }
  }

  // ---- 支払い期限 ----

  // 支払い待ちで、期限まで NEAR_DEADLINE_HOURS 以内（過ぎたものも含む）か
  function isDeadlineNear(reservation, now) {
    if (reservation.status !== '支払い待ち' || !reservation.pay_deadline) return false;
    var left = new Date(reservation.pay_deadline) - now;
    return left <= NEAR_DEADLINE_HOURS * 60 * 60 * 1000;
  }

  // 支払い待ちで、期限になっていないか（支払えるか）。期限の時刻ちょうどで期限切れになる
  function canPay(reservation, now) {
    return reservation.status === '支払い待ち' && now < new Date(reservation.pay_deadline);
  }

  // ---- 予約の受付 ----

  // 数に入れる予約（まだ振り分け前のもの）
  function isOpen(r) { return r.status === '予約中' || r.status === '繰り越し'; }

  // 残りの受付数 ＝ 予約上限 − 受付中と繰り越しの予約の合計
  function remaining(state, h) {
    var used = state.reservations.filter(function (r) { return r.harvest_id === h.id && isOpen(r); })
      .reduce(function (a, r) { return a + r.quantity; }, 0);
    return Math.max(0, h.reserve_limit - used);
  }

  // このお客さんが、この収穫回にあと何個まで予約できるか
  function maxQuantity(state, h, customerId) {
    var own = state.reservations.filter(function (r) {
      return r.harvest_id === h.id && r.customer_id === customerId && isOpen(r);
    }).reduce(function (a, r) { return a + r.quantity; }, 0);
    return Math.max(0, Math.min(h.per_person_limit - own, remaining(state, h)));
  }

  // お客さんがキャンセルできるか：支払い済みはできない。
  // できるのは、予約中・支払い待ち・次の回待ち・まだ確定していない回にある繰り越し
  function canCancel(state, r) {
    if (r.status === '予約中' || r.status === '支払い待ち' || r.status === '次の回待ち') return true;
    return r.status === '繰り越し' && harvestOf(state, r).stage === '予約受付中';
  }

  // ---- 品目と収穫回を作る ----
  // 品目は「予約するもの」。同じ品目の収穫回どうしで、足りない分を次の回へ繰り越す
  var CONFIRM_DAYS_BEFORE = 3; // 確定日は収穫予定日の3日前
  var CONFIRM_HOUR = 9;        // 確定の時刻

  function confirmAtFor(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - CONFIRM_DAYS_BEFORE);
    d.setHours(CONFIRM_HOUR);
    return d;
  }

  // 日付から回の名前を作る：1〜10日は上旬、11〜20日は中旬、それ以降は下旬
  function roundName(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    var part = d.getDate() <= 10 ? '上旬' : d.getDate() <= 20 ? '中旬' : '下旬';
    return (d.getMonth() + 1) + '月' + part;
  }

  function wholeNumber(v) { var n = Number(v); return Number.isInteger(n) ? n : NaN; }

  // 品目を作る。うまくいかなければ { error: 理由 }
  function createItem(state, f) {
    var name = (f.name || '').trim();
    var unit = (f.unit || '').trim();
    var price = wholeNumber(f.price), payHours = wholeNumber(f.pay_hours), perPerson = wholeNumber(f.per_person_limit);
    if (!name) return { error: '品目の名前を入れてください。' };
    if (state.items.some(function (i) { return i.name === name; })) return { error: '「' + name + '」は、もうあります。' };
    if (!unit) return { error: '単位を入れてください（例：箱（5本入り）、玉、袋（5kg））。' };
    if (!(price >= 1)) return { error: '値段は1円以上の整数で入れてください。' };
    if (!(payHours >= 1)) return { error: '支払い期限は1時間以上の整数で入れてください。' };
    if (!(perPerson >= 1)) return { error: '1人あたりの上限は1以上の整数で入れてください。' };
    var item = {
      id: Store.nextId(state.items, 'i'), name: name, unit: unit, price: price,
      pay_hours: payHours, per_person_limit: perPerson, mark: f.mark || '🌱'
    };
    state.items.push(item);
    return { item: item };
  }

  // 収穫回を作る。確定日は3日前に自動で決まる。うまくいかなければ { error: 理由 }
  function createHarvest(state, f, now) {
    var item = state.items.find(function (i) { return i.id === f.item_id; });
    if (!item) return { error: '品目を選んでください。' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.harvest_date || '')) return { error: '収穫予定日を入れてください。' };
    var confirmAt = confirmAtFor(f.harvest_date);
    if (confirmAt <= now) return { error: '確定日（収穫予定日の3日前の' + jpDateTime(confirmAt) + '）が、もう過ぎています。もっと先の日にしてください。' };
    if (state.harvests.some(function (h) { return h.item_id === item.id && h.harvest_date === f.harvest_date; })) {
      return { error: item.name + 'の' + jpDate(f.harvest_date) + 'の収穫回は、もうあります。' };
    }
    var limit = wholeNumber(f.reserve_limit), perPerson = wholeNumber(f.per_person_limit);
    if (!(limit >= 1)) return { error: '予約上限は1以上の整数で入れてください。' };
    if (!(perPerson >= 1 && perPerson <= limit)) return { error: '1人あたりの上限は、1以上で予約上限以下の整数にしてください。' };
    var h = {
      id: Store.nextId(state.harvests, 'h'), item_id: item.id,
      name: (f.name || '').trim() || roundName(f.harvest_date),
      harvest_date: f.harvest_date, confirm_at: stamp(confirmAt),
      reserve_limit: limit, per_person_limit: perPerson, expected: null, stage: '予約受付中'
    };
    state.harvests.push(h);
    moveWaiting(state, h, now);
    return { harvest: h };
  }

  // 次の回待ちの予約を、新しく作った収穫回に「繰り越し（優先）」として入れる。優先→古い順
  function moveWaiting(state, h, now) {
    var u = unitWord(itemOf(state, h));
    waitingOf(state, h.item_id).forEach(function (w) {
      state.reservations.push({
        id: Store.nextId(state.reservations, 'r'), harvest_id: h.id, customer_id: w.customer_id,
        quantity: w.quantity, reserved_at: w.reserved_at, when_short: w.when_short, receive: w.receive,
        payment: w.payment, status: '繰り越し', allocated: null, pay_deadline: null, paid_at: null,
        priority: true, carried_from: w.id
      });
      w.status = '繰り越し';
      sendMessage(state, w, harvestOf(state, w), now, '次の回のお知らせ', {
        '数': w.quantity + u, '繰り越し先': h.name + '（' + jpDate(h.harvest_date) + '収穫）'
      });
    });
  }

  // この品目で、次の回を待っている予約（優先→古い順）
  function waitingOf(state, itemId) {
    return state.reservations.filter(function (r) {
      return r.status === '次の回待ち' && harvestOf(state, r).item_id === itemId;
    }).sort(function (a, b) {
      if (a.priority !== b.priority) return a.priority ? -1 : 1;
      return a.reserved_at < b.reserved_at ? -1 : 1;
    });
  }

  // ---- 受付（新しい予約・追加の予約）と、受付をやめる・再開する ----
  // やめても、入っている予約と繰り越しはそのまま。新しい予約だけ受け付けない
  // now を渡さなければ、デモ用の時計の「今」を使う

  // 確定日時になったか（新しい予約は確定日時まで）
  function isConfirmTimeReached(h, now) {
    return (now || Clock.now()) >= new Date(h.confirm_at);
  }
  // 収穫予定日になったか（その日の0時から。追加の予約も、空きの案内もしない）
  function isHarvestDayReached(h, now) {
    return (now || Clock.now()) >= new Date(h.harvest_date + 'T00:00:00');
  }
  // 新しい予約を受け付けているか：確定前で、農家が受付をやめておらず、確定日時になっていない
  function isAccepting(h, now) {
    return h.stage === '予約受付中' && !h.closed && !isConfirmTimeReached(h, now);
  }

  // 追加で予約できる数：確定の余り（追加で受け付けられる数）と、案内できる補欠がいなかった空き
  function extraPool(h) { return (h.extra || 0) + (h.vacant || 0); }
  // 追加の予約を受け付けているか：確定済みで、余りがあり、農家がやめておらず、収穫予定日になっていない
  function isExtraAccepting(h, now) {
    return h.stage === '割り当て済み' && !h.closed && extraPool(h) > 0 && !isHarvestDayReached(h, now);
  }

  function stopAccepting(h) { h.closed = true; }
  function restartAccepting(h) { h.closed = false; }

  // 画面に出す収穫回の状態：受付中／受付終了／割り当て済み／追加受付中
  // （中では確定前の回を h.stage === '予約受付中' で表している。data.js がこの言葉のため）
  function harvestState(h, now) {
    if (h.stage === '予約受付中') return isAccepting(h, now) ? '受付中' : '受付終了';
    return isExtraAccepting(h, now) ? '追加受付中' : h.stage;
  }

  // このお客さんが、確定済みの回に追加で予約できる数（1人あたりの上限は、届けることが決まった数と合わせて数える）
  function extraMaxQuantity(state, h, customerId, now) {
    if (!isExtraAccepting(h, now)) return 0;
    var own = state.reservations.filter(function (r) {
      return r.harvest_id === h.id && r.customer_id === customerId && (r.status === '支払い済み' || r.status === '支払い待ち');
    }).reduce(function (a, r) { return a + (r.allocated || r.quantity); }, 0);
    return Math.max(0, Math.min(extraPool(h), h.per_person_limit - own));
  }

  // 追加の予約：先着順で、予約した時点でお届けが決まる（カード登録は支払い済み、それ以外は支払い待ち）
  function reserveExtra(state, h, customerId, choices, now) {
    var q = choices.quantity;
    if (!(q >= 1 && q <= extraMaxQuantity(state, h, customerId, now))) return null;
    var r = {
      id: Store.nextId(state.reservations, 'r'), harvest_id: h.id, customer_id: customerId,
      quantity: q, reserved_at: stamp(now), when_short: 'そろった分だけ送る',
      receive: choices.receive, payment: choices.payment, status: '予約中',
      allocated: q, pay_deadline: null, paid_at: null, priority: false, carried_from: null, extra: true
    };
    state.reservations.push(r);
    // 確定の余りから先に使い、足りなければ空きから使う
    var fromExtra = Math.min(h.extra || 0, q);
    h.extra = (h.extra || 0) - fromExtra;
    h.vacant = (h.vacant || 0) - (q - fromExtra);
    settle(state, r, h, q, now);
    return r;
  }

  // このお客さんの、この収穫回の「予約中」の予約（同じ回の予約中は1枚にまとめる）
  function ownReservation(state, h, customerId) {
    return state.reservations.find(function (r) {
      return r.harvest_id === h.id && r.customer_id === customerId && r.status === '予約中';
    }) || null;
  }

  // 予約する（choices：quantity, when_short, receive, payment）。できなければ null
  // 同じ回に予約中の予約があれば、新しく作らずに、その予約に数を足す
  function reserve(state, h, customerId, choices, now) {
    if (!isAccepting(h, now)) return null;
    if (!(choices.quantity >= 1 && choices.quantity <= maxQuantity(state, h, customerId))) return null;
    var own = ownReservation(state, h, customerId);
    if (own) {
      var merged = { quantity: own.quantity + choices.quantity, when_short: choices.when_short, receive: choices.receive, payment: choices.payment };
      return editReservation(state, own, merged, now) ? own : null;
    }
    var r = {
      id: Store.nextId(state.reservations, 'r'), harvest_id: h.id, customer_id: customerId,
      quantity: choices.quantity, reserved_at: stamp(now), when_short: choices.when_short,
      receive: choices.receive, payment: choices.payment, status: '予約中',
      allocated: null, pay_deadline: null, paid_at: null, priority: false, carried_from: null
    };
    state.reservations.push(r);
    return r;
  }

  // ---- 予約の変更（お客さん） ----
  // 変えられるのは「予約中」の予約だけ。予約日時（振り分けの順番）は変えない
  function canEdit(state, r) {
    return r.status === '予約中' && harvestOf(state, r).stage === '予約受付中';
  }

  // 変更するときに選べる数量の上限。受付をやめた回・収穫予定日になった回では、今の数より増やせない
  function editMaxQuantity(state, r, now) {
    var h = harvestOf(state, r);
    if (!isAccepting(h, now)) return r.quantity;
    return Math.max(r.quantity, maxQuantity(state, h, r.customer_id) + r.quantity);
  }

  // 予約の内容を変える（choices：quantity, when_short, receive, payment）。変えられなければ false
  function editReservation(state, r, choices, now) {
    if (!canEdit(state, r)) return false;
    if (!(choices.quantity >= 1 && choices.quantity <= editMaxQuantity(state, r, now))) return false;
    var h = harvestOf(state, r);
    var u = unitWord(itemOf(state, h));
    var changes = [];
    if (choices.quantity !== r.quantity) changes.push('数量：' + r.quantity + u + ' → ' + choices.quantity + u + '。');
    ['when_short', 'receive', 'payment'].forEach(function (key) {
      var label = { when_short: '一部しか用意できないとき', receive: '受け取り方法', payment: '支払い方法' }[key];
      if (choices[key] !== r[key]) changes.push(label + '：' + r[key] + ' → ' + choices[key] + '。');
    });
    if (!changes.length) return true; // 何も変わっていない
    r.quantity = choices.quantity;
    r.when_short = choices.when_short;
    r.receive = choices.receive;
    r.payment = choices.payment;
    sendMessage(state, r, h, now, '予約の変更', { '変更の内容': changes.join('') });
    return true;
  }

  // 支払う（期限内の支払い待ちだけ）
  function pay(r, now) {
    if (!canPay(r, now)) return false;
    r.status = '支払い済み';
    r.paid_at = stamp(now);
    return true;
  }

  // キャンセルする。支払い待ちの分は空きになり、補欠に案内する。返事待ちの空きの案内は見送りにする
  function cancel(state, r, now) {
    if (!canCancel(state, r)) return false;
    var h = harvestOf(state, r);
    var wasWaiting = r.status === '支払い待ち';
    r.status = 'キャンセル';
    sendMessage(state, r, h, now, 'キャンセル受付', { '数': r.quantity + unitWord(itemOf(state, h)) });
    var o = pendingOffer(state, r);
    if (o) closeOffer(state, o, '見送り', now);
    if (wasWaiting) {
      h.vacant = (h.vacant || 0) + (r.allocated || r.quantity);
      offerVacancy(state, h, now);
    }
    return true;
  }

  // ---- 振り分け ----

  // 今日が確定日で、まだ確定していない収穫回か（この日だけ、手で確定できる）
  function isConfirmDay(h, now) {
    return h.stage === '予約受付中' && sameDay(new Date(h.confirm_at), now);
  }

  // 確定日時より前なら、見込み量を入れておいて、確定日時に自動で確定できる
  function canPlan(h, now) {
    return h.stage === '予約受付中' && now < new Date(h.confirm_at);
  }
  function setPlan(h, expected, now) {
    if (!canPlan(h, now)) return false;
    h.planned_expected = expected;
    return true;
  }
  function clearPlan(h) { h.planned_expected = null; }

  // 同じ品目で、この回より後のいちばん早い受付中の収穫回（なければ null）
  function nextHarvest(state, h) {
    var list = state.harvests.filter(function (x) {
      return x.item_id === h.item_id && x.harvest_date > h.harvest_date && x.stage === '予約受付中';
    }).sort(function (a, b) { return a.harvest_date < b.harvest_date ? -1 : 1; });
    return list[0] || null;
  }

  // 振り分ける予約：予約中と、繰り越しで入ってきた予約
  // 並び順：繰り越しで優先の予約が先。その中と残りは予約日時が古い順
  function targets(state, h) {
    return state.reservations.filter(function (r) {
      return r.harvest_id === h.id && (r.status === '予約中' || r.status === '繰り越し');
    }).sort(function (a, b) {
      if (a.priority !== b.priority) return a.priority ? -1 : 1;
      return a.reserved_at < b.reserved_at ? -1 : 1;
    });
  }

  // 振り分けの結果を出す（まだ何も変えない）
  function plan(state, h, expected) {
    var ratio = ALLOCATION_RATIO;
    // 割り当てる数 ＝ 見込み量 × 0.8（切り捨て）。小数の誤差をならしてから切り捨てる
    var total = Math.floor(Math.round(expected * ratio * 1e6) / 1e6);
    var next = nextHarvest(state, h);
    var rest = total;

    var results = targets(state, h).map(function (r) {
      var allocated;
      if (r.quantity <= rest) allocated = r.quantity;                     // 全部割り当てられる
      else if (r.when_short === 'そろった分だけ送る') allocated = rest;    // 残りを全部
      else allocated = 0;                                                 // 全部そろうまで待つ
      rest -= allocated;
      var short = r.quantity - allocated;
      var kind = short === 0 ? '全部' : allocated > 0 ? '一部' : '繰り越し';
      return { reservation: r, allocated: allocated, short: short, kind: kind };
    });

    var deliver = results.filter(function (x) { return x.allocated > 0; });
    var shortList = results.filter(function (x) { return x.short > 0; });
    var sumOf = function (list, key) { return list.reduce(function (a, x) { return a + x[key]; }, 0); };

    return {
      total: total,
      next: next,                                // 足りない分の行き先（なければキャンセル）
      results: results,
      deliverCount: deliver.length,
      deliverQty: sumOf(deliver, 'allocated'),
      shortCount: shortList.length,
      shortQty: sumOf(shortList, 'short'),
      extra: rest                                // 追加で受け付けられる数
    };
  }

  // 振り分けを確定する：予約の状態を変え、お客さんへの連絡を作る
  function confirm(state, h, expected, now) {
    var p = plan(state, h, expected);
    var u = unitWord(itemOf(state, h));

    p.results.forEach(function (x) {
      var r = x.reservation;
      r.allocated = x.allocated;

      // 届ける分：カード登録の人は支払い済み。それ以外とカードが使えない人は支払い待ち
      if (x.allocated > 0) settle(state, r, h, x.allocated, now);

      if (x.short === 0) return;

      // 足りない分：次の収穫回へ繰り越し。次の回がまだなければ「次の回待ち」
      if (p.next) {
        if (x.allocated === 0) r.status = '繰り越し';
        var carried = {
          id: Store.nextId(state.reservations, 'r'), harvest_id: p.next.id, customer_id: r.customer_id,
          quantity: x.short, reserved_at: r.reserved_at, when_short: r.when_short, receive: r.receive,
          payment: r.payment, status: '繰り越し', allocated: null, pay_deadline: null, paid_at: null,
          priority: true, carried_from: r.id
        };
        state.reservations.push(carried);
        sendMessage(state, r, h, now, '繰り越しのお知らせ', {
          '数': x.short + u, '繰り越し先': p.next.name + '（' + jpDate(p.next.harvest_date) + '収穫）'
        });
      } else {
        // 全部足りなければ、その予約が次の回待ちに。一部だけなら、足りない分を別の予約にして次の回待ちに
        var waiting = r;
        if (x.allocated === 0) {
          r.status = '次の回待ち';
        } else {
          waiting = {
            id: Store.nextId(state.reservations, 'r'), harvest_id: h.id, customer_id: r.customer_id,
            quantity: x.short, reserved_at: r.reserved_at, when_short: r.when_short, receive: r.receive,
            payment: r.payment, status: '次の回待ち', allocated: null, pay_deadline: null, paid_at: null,
            priority: true, carried_from: r.id
          };
          state.reservations.push(waiting);
        }
        sendMessage(state, waiting, h, now, '次の回待ちのお知らせ', { '数': x.short + u });
      }
    });

    h.expected = expected;
    h.stage = '割り当て済み';
    h.confirmed_at = stamp(now);
    h.extra = p.extra;
    return p;
  }

  // ---- 期限切れと補欠への案内 ----
  // 案内（offers）の1件：{ id, harvest_id（空きが出た回）, reservation_id（補欠の予約）, customer_id,
  //   quantity, offered_at, deadline, status：案内中／受け取り／見送り／返事なし }

  function offersOf(state) {
    if (!state.offers) state.offers = [];
    return state.offers;
  }

  // この予約に、いま返事待ちの案内があれば返す
  function pendingOffer(state, r) {
    return offersOf(state).find(function (o) { return o.reservation_id === r.id && o.status === '案内中'; }) || null;
  }

  // 空きが出た回 h の補欠：同じ品目で、まだ確定していない回に繰り越されている予約と、次の回待ちの予約。優先→古い順
  function standbys(state, h) {
    return state.reservations.filter(function (r) {
      if (r.status !== '繰り越し' && r.status !== '次の回待ち') return false;
      var rh = harvestOf(state, r);
      if (rh.item_id !== h.item_id) return false;
      if (r.status === '次の回待ち') return true;
      return rh.id !== h.id && rh.stage === '予約受付中';
    }).sort(function (a, b) {
      if (a.priority !== b.priority) return a.priority ? -1 : 1;
      return a.reserved_at < b.reserved_at ? -1 : 1;
    });
  }

  // 空いた数（h.vacant）を、補欠に順番に案内する
  function offerVacancy(state, h, at) {
    // 収穫予定日になったら、もう案内しない
    if (at >= new Date(h.harvest_date + 'T00:00:00')) return;
    var u = unitWord(itemOf(state, h));
    var list = standbys(state, h);
    for (var i = 0; i < list.length && h.vacant > 0; i++) {
      var r = list[i];
      // 同じ回の空きを、同じ予約に2回は案内しない。返事待ちの案内がある予約にも案内しない
      var asked = offersOf(state).some(function (o) {
        return o.reservation_id === r.id && (o.harvest_id === h.id || o.status === '案内中');
      });
      if (asked) continue;
      // 「全部そろうまで待つ」の人は、全部そろうときだけ
      if (r.when_short === '全部そろうまで待つ' && r.quantity > h.vacant) continue;
      var qty = Math.min(r.quantity, h.vacant);
      var deadline = hoursLater(at, state.settings.repick_hours);
      var o = {
        id: Store.nextId(offersOf(state), 'o'), harvest_id: h.id, reservation_id: r.id, customer_id: r.customer_id,
        quantity: qty, offered_at: stamp(at), deadline: stamp(deadline), status: '案内中'
      };
      if (DEMO_AUTO_REPLY) o.demo_reply = demoReply(o, at);
      offersOf(state).push(o);
      h.vacant -= qty;
      sendMessage(state, r, h, at, '空きのご案内', { '数': qty + u, '期限': jpDateTime(deadline) });
    }
  }

  // 支払い期限を過ぎた予約を期限切れにし、空いた数を補欠に案内する
  function expirePayment(state, r, at) {
    var h = harvestOf(state, r);
    r.status = '期限切れ';
    sendMessage(state, r, h, at, '期限切れ', {});
    h.vacant = (h.vacant || 0) + (r.allocated || r.quantity);
    offerVacancy(state, h, at);
  }

  // 案内を終える（見送り・返事なし）。空いた数を次の補欠に回す
  function closeOffer(state, o, status, at) {
    var r = state.reservations.find(function (x) { return x.id === o.reservation_id; });
    var h = state.harvests.find(function (x) { return x.id === o.harvest_id; });
    var rh = harvestOf(state, r);
    o.status = status;
    var vars = { '残る予約': r.status === '繰り越し' ? rh.name + 'の予約は、そのまま残ります。'
      : r.status === '次の回待ち' ? '次の収穫回が決まりしだい、優先で予約に入れます。' : '' };
    sendMessage(state, r, h, at, status === '見送り' ? '見送り' : '案内の期限切れ', vars);
    h.vacant = (h.vacant || 0) + o.quantity;
    offerVacancy(state, h, at);
  }

  // 案内を受け取る。受け取った数を、空きが出た回の予約にする
  function acceptOffer(state, r, now) {
    var o = pendingOffer(state, r);
    if (!o || now >= new Date(o.deadline)) return false;
    var h = state.harvests.find(function (x) { return x.id === o.harvest_id; });
    var target = r;
    if (o.quantity < r.quantity) {
      // 一部だけ受け取る：受け取る分を新しい予約に分け、残りは繰り越しのまま
      r.quantity -= o.quantity;
      target = {
        id: Store.nextId(state.reservations, 'r'), harvest_id: h.id, customer_id: r.customer_id,
        quantity: o.quantity, reserved_at: r.reserved_at, when_short: r.when_short, receive: r.receive,
        payment: r.payment, status: '繰り越し', allocated: null, pay_deadline: null, paid_at: null,
        priority: r.priority, carried_from: r.id
      };
      state.reservations.push(target);
    }
    target.harvest_id = h.id;
    target.allocated = o.quantity;
    o.status = '受け取り';
    settle(state, target, h, o.quantity, now);
    return true;
  }

  // 案内を見送る
  function declineOffer(state, r, now) {
    var o = pendingOffer(state, r);
    if (!o || now >= new Date(o.deadline)) return false;
    closeOffer(state, o, '見送り', now);
    return true;
  }

  // 空いた数の行き先（農家の画面で見せる）
  function vacancy(state, h, now) {
    var freed = state.reservations.filter(function (r) {
      return r.harvest_id === h.id && (r.status === '期限切れ' || (r.status === 'キャンセル' && r.allocated > 0));
    });
    var left = h.vacant || 0;
    var reason = '';
    if (left > 0) {
      reason = now >= new Date(h.harvest_date + 'T00:00:00')
        ? '収穫予定日になったため、案内を終えました。'
        : '今、案内できる補欠の方がいません。';
    }
    return {
      freed: freed,
      freedQty: freed.reduce(function (a, r) { return a + (r.allocated || r.quantity); }, 0),
      offers: offersOf(state).filter(function (o) { return o.harvest_id === h.id; }),
      left: left,
      reason: reason
    };
  }

  // 【デモ用】案内を受けたお客さんの返事を、案内のときに決めておく。
  // 受け取る：見送る：返事なし ＝ およそ 5：3：2。返事は案内から1〜10時間後。
  // 同じ案内なら、何度やっても同じ返事になる（案内の番号から決める）
  function demoReply(o, at) {
    var seed = 0;
    (o.id + o.reservation_id).split('').forEach(function (ch) { seed = (seed * 31 + ch.charCodeAt(0)) % 9973; });
    var roll = seed % 10;
    var answer = roll < 5 ? '受け取る' : roll < 8 ? '見送る' : '返事なし';
    return { answer: answer, at: stamp(hoursLater(at, 1 + (seed % 10))) };
  }

  // 時計を to まで進めたとき、それまでに起きることを、時刻の順に1つずつ処理する
  function passTime(state, to) {
    for (var guard = 0; guard < 10000; guard++) {
      var next = null;
      var consider = function (t, run) { if (t <= to && (!next || t < next.at)) next = { at: t, run: run }; };
      // 見込み量が入っている収穫回は、確定日時に自動で確定する
      state.harvests.forEach(function (h) {
        if (h.stage !== '予約受付中' || h.planned_expected == null) return;
        var t = new Date(h.confirm_at);
        consider(t, function () { confirm(state, h, h.planned_expected, t); h.auto_confirmed = true; });
      });
      state.reservations.forEach(function (r) {
        if (r.status !== '支払い待ち' || !r.pay_deadline) return;
        var t = new Date(r.pay_deadline);
        consider(t, function () { expirePayment(state, r, t); });
      });
      offersOf(state).forEach(function (o) {
        if (o.status !== '案内中') return;
        var t = new Date(o.deadline);
        consider(t, function () { closeOffer(state, o, '返事なし', t); });
        // 【デモ用】自動の返事。今ログインしているお客さんには、自分で押してもらうので自動では返事しない
        var me = state.session && state.session.customer;
        if (DEMO_AUTO_REPLY && o.demo_reply && o.demo_reply.answer !== '返事なし' && o.customer_id !== me) {
          var rt = new Date(o.demo_reply.at);
          if (rt < t) consider(rt, function () {
            var r = state.reservations.find(function (x) { return x.id === o.reservation_id; });
            if (o.demo_reply.answer === '受け取る') acceptOffer(state, r, rt);
            else declineOffer(state, r, rt);
          });
        }
      });
      if (!next) return;
      next.run();
    }
  }

  return {
    isDeadlineNear: isDeadlineNear,
    canPay: canPay,
    remaining: remaining,
    maxQuantity: maxQuantity,
    canCancel: canCancel,
    confirmAtFor: confirmAtFor,
    roundName: roundName,
    createItem: createItem,
    createHarvest: createHarvest,
    waitingOf: waitingOf,
    isAccepting: isAccepting,
    isHarvestDayReached: isHarvestDayReached,
    isConfirmTimeReached: isConfirmTimeReached,
    isExtraAccepting: isExtraAccepting,
    extraPool: extraPool,
    extraMaxQuantity: extraMaxQuantity,
    reserveExtra: reserveExtra,
    stopAccepting: stopAccepting,
    restartAccepting: restartAccepting,
    harvestState: harvestState,
    reserve: reserve,
    ownReservation: ownReservation,
    canEdit: canEdit,
    editMaxQuantity: editMaxQuantity,
    editReservation: editReservation,
    pay: pay,
    cancel: cancel,
    isConfirmDay: isConfirmDay,
    canPlan: canPlan,
    setPlan: setPlan,
    clearPlan: clearPlan,
    plan: plan,
    confirm: confirm,
    pendingOffer: pendingOffer,
    acceptOffer: acceptOffer,
    declineOffer: declineOffer,
    vacancy: vacancy,
    passTime: passTime,
    templateList: templateList,
    templateText: templateText,
    saveTemplate: saveTemplate,
    resetTemplate: resetTemplate,
    sampleMessage: sampleMessage
  };
})();
