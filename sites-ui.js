function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function findFee(site, feeId) {
  return site.sellFees.find((row) => row.id === feeId) || site.buyFees.find((row) => row.id === feeId);
}

function feeHtml(row) {
  const typeOptions = [
    ["percent", "一律％"],
    ["bandFixed", "価格帯で定額"],
    ["bandPercent", "価格帯で％"],
  ]
    .map(([value, label]) => `<option value="${value}" ${row.type === value ? "selected" : ""}>${label}</option>`)
    .join("");
  let body = "";
  if (row.type === "percent") {
    body = `<div class="inline">
        <input data-f="percent" inputmode="decimal" value="${escapeAttr(row.percent || 0)}"><span>％</span>
        <span>下限</span>
        <input data-f="minFee" inputmode="numeric" placeholder="なし" value="${escapeAttr(row.minFee || "")}">
        <span>円</span>
      </div>
      <p class="hint">下限は空欄ならなし。％の結果が下限を下回るときは下限になります（税抜）。税別なら消費税は下限の上に乗ります。</p>`;
  } else {
    const bands = row.bands?.length ? row.bands : [Calc.emptyBand()];
    body = bands
      .map((band, i) => {
        const valueField =
          row.type === "bandFixed"
            ? `<input data-band="${i}" data-f="amount" inputmode="numeric" value="${escapeAttr(band.amount || 0)}"><span>円</span>`
            : `<input data-band="${i}" data-f="bpercent" inputmode="decimal" value="${escapeAttr(band.percent || 0)}"><span>％</span>`;
        return `<div class="band">
          <div class="inline">
            <input data-band="${i}" data-f="min" inputmode="numeric" value="${escapeAttr(band.min ?? 0)}">
            <span>〜</span>
            <input data-band="${i}" data-f="max" inputmode="numeric" placeholder="以上" value="${escapeAttr(band.max ?? "")}">
            <span>→</span>
            ${valueField}
            <button type="button" class="danger small" data-act="removeBand" data-index="${i}">×</button>
          </div>
        </div>`;
      })
      .join("");
    body += `<button type="button" class="secondary small" data-act="addBand">帯を足す</button>
      <p class="hint">上限は含む。上限を空にすると「以上」です。該当する帯の％／定額を、金額全体にかけます。</p>`;
  }
  return `<div class="fee-row" data-id="${row.id}">
    <select data-f="type">${typeOptions}</select>
    ${body}
    <label class="check"><input type="checkbox" data-f="taxable" ${row.taxable ? "checked" : ""}>この手数料は税別（消費税を上乗せ）</label>
    <button type="button" class="secondary small" data-act="removeFee">この行を削除</button>
  </div>`;
}

function renderSite(site) {
  const wrap = document.createElement("article");
  wrap.className = "site";
  wrap.dataset.id = site.id;
  wrap.innerHTML = `
    <div class="site-head">
      <input data-f="name" value="${escapeAttr(site.name)}" placeholder="サイト名">
      <button type="button" class="danger small" data-act="removeSite">削除</button>
    </div>
    <label class="check"><input type="checkbox" data-f="buyTaxOnAmount" ${site.buyTaxOnAmount ? "checked" : ""}>落札金額に消費税がかかる</label>
    <label class="check"><input type="checkbox" data-f="sellTaxOnAmount" ${site.sellTaxOnAmount ? "checked" : ""}>販売金額に消費税がかかる</label>
    <label>写真撮影手数料（円）</label>
    <input data-f="photoFee" inputmode="numeric" value="${escapeAttr(site.photoFee || 0)}">
    <label class="check"><input type="checkbox" data-f="photoFeeTaxable" ${site.photoFeeTaxable ? "checked" : ""}>写真撮影は税別（消費税を上乗せ）</label>
    <p class="hint">税込のサイトは、該当するチェックを外します。新しいサイトは最初からオンです。</p>
    <div class="fee-block">
      <h4>販売手数料</h4>
      ${site.sellFees.map(feeHtml).join("")}
      <button type="button" class="secondary small" data-act="addSellFee">販売の行を足す</button>
    </div>
    <div class="fee-block">
      <h4>仕入れ（落札）手数料</h4>
      ${site.buyFees.map(feeHtml).join("")}
      <button type="button" class="secondary small" data-act="addBuyFee">仕入れの行を足す</button>
    </div>
  `;
  return wrap;
}

function applySiteField(site, field) {
  if (field.dataset.f === "name") site.name = field.value;
  if (field.dataset.f === "buyTaxOnAmount") site.buyTaxOnAmount = field.checked;
  if (field.dataset.f === "sellTaxOnAmount") site.sellTaxOnAmount = field.checked;
  if (field.dataset.f === "photoFee") site.photoFee = Number(field.value) || 0;
  if (field.dataset.f === "photoFeeTaxable") site.photoFeeTaxable = field.checked;

  const feeEl = field.closest(".fee-row");
  if (!feeEl) return false;
  const row = findFee(site, feeEl.dataset.id);
  if (!row) return false;
  let retype = false;
  if (field.dataset.f === "type") {
    row.type = field.value;
    retype = true;
  }
  if (field.dataset.f === "percent") row.percent = Number(field.value) || 0;
  if (field.dataset.f === "minFee") row.minFee = field.value === "" ? "" : Number(field.value) || 0;
  if (field.dataset.f === "taxable") row.taxable = field.checked;
  if (field.dataset.band != null) {
    const band = row.bands?.[Number(field.dataset.band)];
    if (band) {
      if (field.dataset.f === "min") band.min = field.value === "" ? 0 : Number(field.value);
      if (field.dataset.f === "max") band.max = field.value;
      if (field.dataset.f === "amount") band.amount = Number(field.value) || 0;
      if (field.dataset.f === "bpercent") band.percent = Number(field.value) || 0;
    }
  }
  return retype;
}
