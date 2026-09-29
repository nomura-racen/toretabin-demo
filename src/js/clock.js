// デモ用の時計（今の時刻、進める、戻す）
// 「今」は実際の時刻ではなく、この時計の時刻を使う。時刻はブラウザに保存する。
window.Clock = (function () {
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];

  function pad(n) { return String(n).padStart(2, '0'); }
  function stamp(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
  }

  // 今の時刻
  function now() {
    return new Date(Store.get().clock || window.APP_DATA.settings.demo_now);
  }

  // 時計を進める。その間に起きること（期限切れ・補欠への案内など）は rules.js が処理する
  function advance(hours) {
    var to = new Date(now().getTime() + hours * 60 * 60 * 1000);
    Rules.passTime(Store.get(), to);
    Store.get().clock = stamp(to);
    Store.save();
  }

  // 時計を最初の時刻に戻す（時計だけ。予約の状態はそのまま）
  function reset() {
    Store.get().clock = window.APP_DATA.settings.demo_now;
    Store.save();
  }

  // 例：8月5日（水）9:00
  function format(d) {
    return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WEEK[d.getDay()] + '）' + d.getHours() + ':' + pad(d.getMinutes());
  }

  return { now: now, advance: advance, reset: reset, format: format };
})();
