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
    renameOldWords(state);
    return state;
  }

  // 言葉の読み替え：予約の状態「予約受付中」は「予約中」と呼ぶことにした。
  // data.js（書き換えない）と、前に保存したものの中の古い言葉を、読み込むときに直す
  function renameOldWords(st) {
    st.reservations.forEach(function (r) {
      if (r.status === '予約受付中') r.status = '予約中';
    });
  }

  // 今の状態をブラウザに保存する
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(get()));
    } catch (e) {
      // 保存できないブラウザでも、画面はそのまま動かす
    }
  }

  // 最初の状態に戻す：保存したものを消して、data.js の状態からやり直す
  function reset() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      // 消せないブラウザでも、画面の上では最初の状態に戻す
    }
    state = null;
  }

  // お客さんの画面に出す、農園の紹介文（農家が書き換えられる。書き換えていなければ最初の文）
  function defaultIntro() {
    return get().farm.place + 'の畑から、とれたてをお届けします。とれた分だけを、待っていてくださる方へ順番にお送りします。';
  }
  function farmIntro() {
    var farm = get().farm;
    return farm.intro != null ? farm.intro : defaultIntro();
  }
  function isDefaultIntro() { return get().farm.intro == null; }
  function setFarmIntro(text) { get().farm.intro = text; }
  function resetFarmIntro() { delete get().farm.intro; }

  // 品目のマーク（写真の代わり）。data.js の品目にはマークがないので、ここで決める
  function itemMark(item) {
    return item.mark || { corn: '🌽', melon: '🍈', rice: '🌾' }[item.id] || '🌱';
  }

  // 新しい番号をつける（例：r001, r002 … の次）
  function nextId(list, head) {
    var max = list.reduce(function (m, x) { return Math.max(m, parseInt(x.id.slice(1), 10) || 0); }, 0);
    return head + String(max + 1).padStart(3, '0');
  }

  return {
    get: get, save: save, reset: reset, nextId: nextId, itemMark: itemMark,
    farmIntro: farmIntro, isDefaultIntro: isDefaultIntro, setFarmIntro: setFarmIntro, resetFarmIntro: resetFarmIntro
  };
})();
