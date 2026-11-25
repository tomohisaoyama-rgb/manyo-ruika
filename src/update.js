// 更新を届ける。紙と点のアプリ共通の考え方：
// ・Service Worker はキャッシュ優先。VERSION を上げて公開したときだけ新しい版が入る
// ・画面に戻るたびに更新を確かめ、作業の途中でなければ、その場で読み込み直す
// ・アドレスの # に画面の状態があるので、読み込み直しても同じ歌・同じ比較に戻る

export function keepFresh({ isBusy = () => false, url = "./sw.js" } = {}) {
  if (!("serviceWorker" in navigator)) return { nudge() {} };
  let reg = null, reloading = false;

  // 新しい版が動き始めたら一度だけ読み込み直す
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  // 待機中の新しい版があれば、作業中でないときに切り替える
  function apply() {
    if (!reg || !reg.waiting || !navigator.serviceWorker.controller) return;
    if (isBusy()) return;
    reg.waiting.postMessage("skipWaiting");
  }
  function check() {
    if (!reg) return;
    reg.update().catch(() => {});
    apply();
  }

  navigator.serviceWorker.register(url).then(r => {
    reg = r;
    r.addEventListener("updatefound", () => {
      const w = r.installing;
      if (w) w.addEventListener("statechange", () => { if (w.state === "installed") apply(); });
    });
    apply();
  }).catch(() => {});

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  window.addEventListener("pageshow", e => { if (e.persisted) check(); });
  window.addEventListener("online", check);

  // 作業が終わったときに呼ぶと、待っていた更新を当てる
  return { nudge: apply };
}
