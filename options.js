const STORAGE_KEY = "sourcingCalc";

const taxRate = document.getElementById("taxRate");
const siteSelect = document.getElementById("siteSelect");
const siteSelectWrap = document.getElementById("siteSelectWrap");
const editor = document.getElementById("editor");
const saveStatus = document.getElementById("saveStatus");

let draft = { taxRate: 10, sites: [] };
let selectedId = "";
let dirty = false;

if (Store.isWeb()) {
  document.body.classList.add("web");
  const back = document.getElementById("backToCalc");
  if (back) back.hidden = false;
}

Store.get(STORAGE_KEY, (stored) => {
  const saved = stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object" ? stored[STORAGE_KEY] : {};
  let sites = Array.isArray(saved.sites) ? saved.sites.map(cloneSite) : [];
  let defaultsVersion = saved.defaultsVersion || 0;
  if (defaultsVersion < 5) {
    sites = Calc.refreshDefaultSites(sites);
    defaultsVersion = 5;
    Store.set({
      [STORAGE_KEY]: { ...saved, sites, defaultsVersion, taxRate: saved.taxRate ?? 10 },
    });
  }
  draft = {
    taxRate: saved.taxRate ?? 10,
    sites,
    defaultsVersion,
  };
  taxRate.value = String(draft.taxRate);
  if (draft.sites[0]) selectedId = draft.sites[0].id;
  render();
});

taxRate.addEventListener("input", () => {
  draft.taxRate = Number(taxRate.value) || 0;
  markDirty();
});

siteSelect.addEventListener("change", () => {
  selectedId = siteSelect.value;
  renderEditor();
});

document.getElementById("addSite").addEventListener("click", () => {
  const site = Calc.emptySite(`サイト${draft.sites.length + 1}`);
  draft.sites.push(site);
  selectedId = site.id;
  markDirty();
  render();
});

document.getElementById("save").addEventListener("click", () => {
  Store.get(STORAGE_KEY, (stored) => {
    const prev = stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object" ? stored[STORAGE_KEY] : {};
    Store.set(
      {
        [STORAGE_KEY]: {
          ...prev,
          taxRate: draft.taxRate,
          sites: draft.sites,
          defaultsVersion: 5,
        },
      },
      () => {
        dirty = false;
        saveStatus.textContent = "保存しました。計算機に反映されます。";
      },
    );
  });
});

editor.addEventListener("input", onEdit);
editor.addEventListener("change", onEdit);
editor.addEventListener("click", (event) => {
  const btn = event.target.closest("button");
  if (!btn) return;
  const site = currentSite();
  if (!site) return;
  const feeId = btn.closest(".fee-row")?.dataset.id;

  if (btn.dataset.act === "removeSite") {
    if (!confirm(`「${site.name}」を削除しますか？`)) return;
    draft.sites = draft.sites.filter((item) => item.id !== site.id);
    selectedId = draft.sites[0]?.id || "";
    markDirty();
    render();
    return;
  }
  if (btn.dataset.act === "addSellFee") {
    site.sellFees.push(Calc.emptyFeeRow());
    markDirty();
    renderEditor();
    return;
  }
  if (btn.dataset.act === "addBuyFee") {
    site.buyFees.push(Calc.emptyFeeRow());
    markDirty();
    renderEditor();
    return;
  }
  if (btn.dataset.act === "removeFee" && feeId) {
    site.sellFees = site.sellFees.filter((row) => row.id !== feeId);
    site.buyFees = site.buyFees.filter((row) => row.id !== feeId);
    markDirty();
    renderEditor();
    return;
  }
  if (btn.dataset.act === "addBand" && feeId) {
    const row = findFee(site, feeId);
    if (!row) return;
    row.bands = row.bands || [];
    row.bands.push(Calc.emptyBand());
    markDirty();
    renderEditor();
  }
  if (btn.dataset.act === "removeBand" && feeId) {
    const row = findFee(site, feeId);
    const idx = Number(btn.dataset.index);
    if (!row || !row.bands) return;
    row.bands.splice(idx, 1);
    if (!row.bands.length) row.bands.push(Calc.emptyBand());
    markDirty();
    renderEditor();
  }
});

function onEdit(event) {
  const site = currentSite();
  if (!site) return;
  const retype = applySiteField(site, event.target);
  markDirty();
  if (event.target.dataset.f === "name") fillSelect();
  if (retype) renderEditor();
}

function currentSite() {
  return draft.sites.find((site) => site.id === selectedId) || null;
}

function cloneSite(site) {
  return JSON.parse(JSON.stringify(site));
}

function markDirty() {
  dirty = true;
  saveStatus.textContent = "未保存の変更があります。「保存」を押してください。";
}

function render() {
  const hasSites = draft.sites.length > 0;
  siteSelectWrap.hidden = !hasSites;
  fillSelect();
  renderEditor();
}

function fillSelect() {
  siteSelect.replaceChildren();
  for (const site of draft.sites) {
    const option = document.createElement("option");
    option.value = site.id;
    option.textContent = site.name || "無名のサイト";
    siteSelect.append(option);
  }
  if (selectedId && [...siteSelect.options].some((opt) => opt.value === selectedId)) {
    siteSelect.value = selectedId;
  } else if (draft.sites[0]) {
    selectedId = draft.sites[0].id;
    siteSelect.value = selectedId;
  }
}

function renderEditor() {
  editor.replaceChildren();
  const site = currentSite();
  if (!site) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "「サイトを追加」から登録してください。";
    editor.append(p);
    return;
  }
  editor.append(renderSite(site));
}
