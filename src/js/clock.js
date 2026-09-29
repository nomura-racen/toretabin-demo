// デモ用の時計
// 「今」は実際の時刻ではなく、この時計の時刻を使う。
window.Clock = (function () {
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];

  // 今の時刻（いまは最初の時刻のまま）
  function now() {
    return new Date(window.APP_DATA.settings.demo_now);
  }

  // 例：8月5日（水）9:00
  function format(d) {
    var m = String(d.getMinutes()).padStart(2, '0');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WEEK[d.getDay()] + '）' + d.getHours() + ':' + m;
  }

  return { now: now, format: format };
})();
