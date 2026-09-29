// 表紙、画面の切り替え、起動
(function () {
  var settings = window.APP_DATA.settings;

  // 表紙の言葉を settings から入れる
  function fillCover() {
    document.getElementById('cover-title').textContent = settings.app_name;
    document.getElementById('cover-catch').textContent = settings.catch;
    document.getElementById('cover-sub-farmer').textContent = settings.sub_farmer;
    document.getElementById('cover-sub-customer').textContent = settings.sub_customer;
  }

  // 画面を切り替える（name は cover / farmer / customer）
  function show(name) {
    document.querySelectorAll('.screen').forEach(function (el) {
      el.hidden = el.id !== 'screen-' + name;
    });
    if (name === 'farmer') window.Farmer.open(document.getElementById('farmer-root'));
    if (name === 'customer') window.Customer.open(document.getElementById('customer-root'));
    document.querySelectorAll('.topbar-nav [data-go]').forEach(function (btn) {
      btn.classList.toggle('is-current', btn.getAttribute('data-go') === name);
    });
    window.scrollTo(0, 0);
  }

  // 隅の時計に今の日時を出す
  function showClock() {
    document.getElementById('clock-now').textContent = window.Clock.format(window.Clock.now());
  }

  // 起動
  fillCover();
  showClock();
  document.querySelectorAll('[data-go]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      show(btn.getAttribute('data-go'));
    });
  });
  show('cover');
})();
