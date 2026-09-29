// 読み込みと保存
// 保存したものがあればそれを、なければ data.js の最初の状態を使う。
window.Store = (function () {
  var KEY = 'toretarabin';
  var state = null;

  function get() {
    if (state) return state;
    try {
      var saved = localStorage.getItem(KEY);
      if (saved) state = JSON.parse(saved);
    } catch (e) {
      state = null;
    }
    if (!state) state = JSON.parse(JSON.stringify(window.APP_DATA));
    return state;
  }

  // 今の状態をブラウザに保存する
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(get()));
    } catch (e) {
      // 保存できないブラウザでも、画面はそのまま動かす
    }
  }

  return { get: get, save: save };
})();
