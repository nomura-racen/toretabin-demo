// 振り分け・支払い期限・補欠への案内のルール（画面は持たない）
window.Rules = (function () {
  // 「支払い期限が近い」とみなす、期限までの残り時間
  var NEAR_DEADLINE_HOURS = 24;

  // 支払い待ちで、期限まで NEAR_DEADLINE_HOURS 以内（過ぎたものも含む）か
  function isDeadlineNear(reservation, now) {
    if (reservation.status !== '支払い待ち' || !reservation.pay_deadline) return false;
    var left = new Date(reservation.pay_deadline) - now;
    return left <= NEAR_DEADLINE_HOURS * 60 * 60 * 1000;
  }

  return { isDeadlineNear: isDeadlineNear };
})();
