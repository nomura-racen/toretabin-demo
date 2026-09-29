// 振り分け・支払い期限・補欠への案内のルール（画面は持たない）
window.Rules = (function () {
  // 「支払い期限が近い」とみなす、期限までの残り時間
  var NEAR_DEADLINE_HOURS = 24;

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

  // ---- 支払い期限 ----

  // 支払い待ちで、期限まで NEAR_DEADLINE_HOURS 以内（過ぎたものも含む）か
  function isDeadlineNear(reservation, now) {
    if (reservation.status !== '支払い待ち' || !reservation.pay_deadline) return false;
    var left = new Date(reservation.pay_deadline) - now;
    return left <= NEAR_DEADLINE_HOURS * 60 * 60 * 1000;
  }

  // 支払い待ちで、期限を過ぎていないか（支払えるか）
  function canPay(reservation, now) {
    return reservation.status === '支払い待ち' && now <= new Date(reservation.pay_deadline);
  }

  // ---- 予約の受付 ----

  // 数に入れる予約（まだ振り分け前のもの）
  function isOpen(r) { return r.status === '予約受付中' || r.status === '繰り越し'; }

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

  // 繰り越しの予約を、お客さんがキャンセルできるか（まだ確定していない回にあるもの）
  function canCancel(state, r) {
    var h = state.harvests.find(function (x) { return x.id === r.harvest_id; });
    return r.status === '繰り越し' && h.stage === '予約受付中';
  }

  // 予約する（choices：quantity, when_short, receive, payment）。できなければ null
  function reserve(state, h, customerId, choices, now) {
    if (h.stage !== '予約受付中') return null;
    if (!(choices.quantity >= 1 && choices.quantity <= maxQuantity(state, h, customerId))) return null;
    var r = {
      id: Store.nextId(state.reservations, 'r'), harvest_id: h.id, customer_id: customerId,
      quantity: choices.quantity, reserved_at: stamp(now), when_short: choices.when_short,
      receive: choices.receive, payment: choices.payment, status: '予約受付中',
      allocated: null, pay_deadline: null, paid_at: null, priority: false, carried_from: null
    };
    state.reservations.push(r);
    return r;
  }

  // 支払う（期限内の支払い待ちだけ）
  function pay(r, now) {
    if (!canPay(r, now)) return false;
    r.status = '支払い済み';
    r.paid_at = stamp(now);
    return true;
  }

  // 繰り越しの予約をキャンセルする
  function cancel(state, r) {
    if (!canCancel(state, r)) return false;
    r.status = 'キャンセル';
    return true;
  }

  // ---- 振り分け ----

  // 今日が確定日で、まだ確定していない収穫回か
  function isConfirmDay(h, now) {
    return h.stage === '予約受付中' && sameDay(new Date(h.confirm_at), now);
  }

  // 同じ品目で、この回より後のいちばん早い受付中の収穫回（なければ null）
  function nextHarvest(state, h) {
    var list = state.harvests.filter(function (x) {
      return x.item_id === h.item_id && x.harvest_date > h.harvest_date && x.stage === '予約受付中';
    }).sort(function (a, b) { return a.harvest_date < b.harvest_date ? -1 : 1; });
    return list[0] || null;
  }

  // 振り分ける予約：予約受付中と、繰り越しで入ってきた予約
  // 並び順：繰り越しで優先の予約が先。その中と残りは予約日時が古い順
  function targets(state, h) {
    return state.reservations.filter(function (r) {
      return r.harvest_id === h.id && (r.status === '予約受付中' || r.status === '繰り越し');
    }).sort(function (a, b) {
      if (a.priority !== b.priority) return a.priority ? -1 : 1;
      return a.reserved_at < b.reserved_at ? -1 : 1;
    });
  }

  // 振り分けの結果を出す（まだ何も変えない）
  function plan(state, h, expected) {
    var ratio = state.settings.allocation_ratio;
    // 割り当てる数 ＝ 見込み量 × 0.9（切り捨て）。小数の誤差をならしてから切り捨てる
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
    var item = itemOf(state, h);
    var u = unitWord(item);
    var name = item.name + ' ' + h.name;
    var nowStamp = stamp(now);
    var deadline = new Date(now.getTime() + item.pay_hours * 60 * 60 * 1000);

    var send = function (r, kind, body) {
      state.messages.push({
        id: Store.nextId(state.messages, 'm'), customer_id: r.customer_id, reservation_id: r.id,
        harvest_id: h.id, sent_at: nowStamp, kind: kind, body: body
      });
    };

    p.results.forEach(function (x) {
      var r = x.reservation;
      var c = state.customers.find(function (cc) { return cc.id === r.customer_id; });
      r.allocated = x.allocated;

      // 届ける分：カード登録の人は支払い済み。それ以外とカードが使えない人は支払い待ち
      if (x.allocated > 0) {
        var money = x.allocated + u + '（' + yen(x.allocated * item.price) + '円）';
        if (r.payment === 'カード登録' && !c.card_fails) {
          r.status = '支払い済み';
          r.paid_at = nowStamp;
          send(r, 'お届け決定', name + 'のお届けが決まりました。' + money + 'を、ご登録のカードでお支払いいただきました。' +
            jpDate(h.harvest_date) + 'に収穫してお届けします。');
        } else {
          r.status = '支払い待ち';
          r.pay_deadline = stamp(deadline);
          var why = c.card_fails ? 'ご登録のカードでお支払いができませんでした。お手数ですが、' : '';
          send(r, '支払いのお願い', name + 'のお届けが決まりました。' + why + money + 'を、' + jpDateTime(deadline) +
            'までにお支払いください。お支払いを確かめてから、' + jpDate(h.harvest_date) + 'に収穫します。');
        }
      }

      if (x.short === 0) return;

      // 足りない分：次の収穫回へ繰り越し。次がなければキャンセル
      if (p.next) {
        if (x.allocated === 0) r.status = '繰り越し';
        var carried = {
          id: Store.nextId(state.reservations, 'r'), harvest_id: p.next.id, customer_id: r.customer_id,
          quantity: x.short, reserved_at: r.reserved_at, when_short: r.when_short, receive: r.receive,
          payment: r.payment, status: '繰り越し', allocated: null, pay_deadline: null, paid_at: null,
          priority: true, carried_from: r.id
        };
        state.reservations.push(carried);
        send(r, '繰り越しのお知らせ', name + 'は、見込みより少なく、' + x.short + u + 'をご用意できませんでした。この' +
          x.short + u + 'は、' + p.next.name + '（' + jpDate(p.next.harvest_date) + '収穫）の予約として優先で受け付けています。');
      } else {
        if (x.allocated === 0) r.status = 'キャンセル';
        send(r, 'ご用意できませんでした', name + 'は、見込みより少なく、' + x.short + u +
          'は今回はご用意できませんでした。この分の予約はキャンセルになります。お金はかかりません。');
      }
    });

    h.expected = expected;
    h.stage = '割り当て済み';
    h.confirmed_at = nowStamp;
    h.extra = p.extra;
    return p;
  }

  return {
    isDeadlineNear: isDeadlineNear,
    canPay: canPay,
    remaining: remaining,
    maxQuantity: maxQuantity,
    canCancel: canCancel,
    reserve: reserve,
    pay: pay,
    cancel: cancel,
    isConfirmDay: isConfirmDay,
    plan: plan,
    confirm: confirm
  };
})();
