const STORAGE_KEY = "sourcingCalc";

const modeBidBtn = document.getElementById("modeBid");
const modeSaleBtn = document.getElementById("modeSale");
const saleFields = document.getElementById("saleFields");
const bidFields = document.getElementById("bidFields");
const salePrice = document.getElementById("salePrice");
const bidPrice = document.getElementById("bidPrice");
const profitRate = document.getElementById("profitRate");
const sellSite = document.getElementById("sellSite");
const buySite = document.getElementById("buySite");
const photo = document.getElementById("photo");
const buyShip = document.getElementById("buyShip");
const sellShip = document.getElementById("sellShip");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const answerEl = document.getElementById("answer");
const linesEl = document.getElementById("lines");

let mode = "bid";
let state = { taxRate: 10, sites: [], sellSiteId: "", buySiteId: "", profitRate: 20 };
let saveTimer = 0;
let calcTimer = 0;

if (Store.isWeb()) document.body.classList.add("web");
if (Store.isWeb() && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

loadState();
Store.onChanged((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY]) return;
  loadState();
});

document.getElementById("openSettings").addEventListener("click", (event) => {
  if (Store.isWeb()) return;
  event.preventDefault();
  Store.openSettings();
});

modeBidBtn.addEventListener("click", () => setMode("bid"));
modeSaleBtn.addEventListener("click", () => setMode("sale"));
profitRate.addEventListener("input", () => {
  state.profitRate = Number(profitRate.value) || 0;
  persistPrefs();
  scheduleCalc();
});
sellSite.addEventListener("change", () => {
  state.sellSiteId = sellSite.value;
  persistPrefs();
  scheduleCalc();
});
buySite.addEventListener("change", () => {
  state.buySiteId = buySite.value;
  persistPrefs();
  scheduleCalc();
});
photo.addEventListener("change", scheduleCalc);

["salePrice", "bidPrice", "buyShip", "sellShip"].forEach((id) => {
  const el = document.getElementById(id);
  el.addEventListener("input", scheduleCalc);
});

function loadState() {
  Store.get(STORAGE_KEY, (stored) => {
    const saved = stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object" ? stored[STORAGE_KEY] : {};
    let sites = Array.isArray(saved.sites) ? saved.sites : [];
    let defaultsVersion = saved.defaultsVersion || 0;
    if (defaultsVersion < 5) {
      sites = Calc.refreshDefaultSites(sites);
      defaultsVersion = 5;
      Store.set({
        [STORAGE_KEY]: { ...saved, sites, defaultsVersion, taxRate: saved.taxRate ?? 10 },
      });
    }
    state = {
      taxRate: saved.taxRate ?? 10,
      sites,
      sellSiteId: saved.sellSiteId || "",
      buySiteId: saved.buySiteId || "",
      profitRate: saved.profitRate ?? 20,
    };
    profitRate.value = String(state.profitRate);
    fillSiteSelects();
    calculate();
  });
}

function persistPrefs() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    Store.get(STORAGE_KEY, (stored) => {
      const prev = stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object" ? stored[STORAGE_KEY] : {};
      Store.set({
        [STORAGE_KEY]: {
          ...prev,
          sellSiteId: state.sellSiteId,
          buySiteId: state.buySiteId,
          profitRate: state.profitRate,
        },
      });
    });
  }, 200);
}

function fillSiteSelects() {
  const opts = state.sites.map((site) => {
    const option = document.createElement("option");
    option.value = site.id;
    option.textContent = site.name || "無名のサイト";
    return option;
  });
  const fill = (select, current) => {
    select.replaceChildren();
    if (!opts.length) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "先にサイトの設定へ";
      select.append(empty);
      return;
    }
    for (const option of opts) select.append(option.cloneNode(true));
    select.value = current && [...select.options].some((o) => o.value === current) ? current : select.options[0].value;
  };
  fill(sellSite, state.sellSiteId);
  fill(buySite, state.buySiteId);
  state.sellSiteId = sellSite.value;
  state.buySiteId = buySite.value;
}

function setMode(next) {
  mode = next;
  modeBidBtn.classList.toggle("on", mode === "bid");
  modeSaleBtn.classList.toggle("on", mode === "sale");
  saleFields.hidden = mode !== "bid";
  bidFields.hidden = mode !== "sale";
  scheduleCalc();
}

function scheduleCalc() {
  clearTimeout(calcTimer);
  calcTimer = setTimeout(calculate, 200);
}

function calculate() {
  const hasMain = mode === "bid" ? Number(salePrice.value) > 0 : bidPrice.value.trim() !== "" && Number(bidPrice.value) >= 0;
  if (!sellSite.value || !buySite.value || !hasMain) {
    resultEl.hidden = true;
    setStatus("出品先・入札先と金額を入れると、ここに結果が出ます。", "idle");
    return;
  }
  const payload = {
    sellSiteId: sellSite.value,
    buySiteId: buySite.value,
    salePrice: salePrice.value,
    bidPrice: bidPrice.value,
    profitRate: profitRate.value,
    photo: photo.checked,
    buyShip: buyShip.value.trim(),
    sellShip: sellShip.value.trim(),
  };
  const res = mode === "bid" ? Calc.bidFromSale(state, payload) : Calc.saleFromBid(state, payload);
  renderResult(res);
}

function renderResult(res) {
  if (!res.ok) {
    resultEl.hidden = false;
    const zeroBid = mode === "bid" && res.bid === 0;
    setStatus(res.message || "計算できませんでした", zeroBid ? "warn" : "error");
    if (!res.lines?.length) {
      resultEl.hidden = true;
      return;
    }
  } else {
    setStatus("計算しました。内訳を確認してください。", "idle");
    resultEl.hidden = false;
  }

  if (mode === "bid") {
    answerEl.innerHTML = `入札目安 <span>${fmt(res.bid)}円</span>
      <small>仕入の持ち出し合計 ${fmt(res.outlay)}円</small>`;
  } else {
    answerEl.innerHTML = `販売目安 <span>${fmt(res.sale)}円</span>
      <small>仕入の持ち出し合計 ${fmt(res.outlay)}円</small>`;
  }

  linesEl.replaceChildren();
  for (const line of res.lines || []) {
    const tr = document.createElement("tr");
    if (line.label === "入札目安" || line.label === "販売目安" || line.label === "仕入の持ち出し合計") {
      tr.className = "total";
    }
    const name = document.createElement("td");
    name.textContent = line.label;
    if (line.note) {
      const note = document.createElement("span");
      note.className = "note";
      note.textContent = line.note;
      name.append(note);
    }
    const yen = document.createElement("td");
    yen.textContent = `${fmt(line.yen)}円`;
    tr.append(name, yen);
    linesEl.append(tr);
  }
}

function setStatus(text, kind) {
  statusEl.className = `status ${kind || "idle"}`;
  statusEl.textContent = text;
}

function fmt(n) {
  return Math.round(Number(n) || 0).toLocaleString("ja-JP");
}
