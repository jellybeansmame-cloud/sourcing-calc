(function (root) {
  const YEN = (n) => Math.round(Number(n) || 0);
  const YEN100 = (n) => Math.round(YEN(n) / 100) * 100;

  function taxRateOf(state) {
    const pct = Number(state.taxRate);
    if (!Number.isFinite(pct) || pct < 0) return 0.1;
    return pct / 100;
  }

  function findBand(bands, price) {
    const p = Number(price) || 0;
    for (const band of bands || []) {
      const min = Number(band.min);
      const lo = Number.isFinite(min) ? min : 0;
      const rawMax = band.max;
      const hi =
        rawMax === "" || rawMax == null || rawMax === undefined
          ? Infinity
          : Number(rawMax);
      if (p >= lo && p <= hi) return band;
    }
    return null;
  }

  function feeBase(row, price) {
    const p = Number(price) || 0;
    if (row.type === "percent") {
      let fee = p * (Number(row.percent) || 0) / 100;
      const floor = Number(row.minFee) || 0;
      if (floor > 0) fee = Math.max(fee, floor);
      return fee;
    }
    if (row.type === "bandFixed") {
      const band = findBand(row.bands, p);
      return band ? Number(band.amount) || 0 : 0;
    }
    if (row.type === "bandPercent") {
      const band = findBand(row.bands, p);
      return band ? p * (Number(band.percent) || 0) / 100 : 0;
    }
    return 0;
  }

  function feeWithTax(row, price, t) {
    const base = YEN(feeBase(row, price));
    const tax = row.taxable ? YEN(base * t) : 0;
    return { base, tax, total: base + tax };
  }

  function sumFees(rows, price, t) {
    let base = 0;
    let tax = 0;
    const parts = [];
    for (const row of rows || []) {
      const one = feeWithTax(row, price, t);
      if (!one.base && !one.tax) continue;
      base += one.base;
      tax += one.tax;
      parts.push(one);
    }
    return { base, tax, total: base + tax, parts };
  }

  function siteById(state, id) {
    return (state.sites || []).find((s) => s.id === id) || null;
  }

  function sellSide(S, ctx) {
    const t = ctx.t;
    const site = ctx.sellSite;
    const fees = sumFees(site?.sellFees, S, t);
    const photoOn = !!ctx.photo;
    const photoBase = photoOn ? Number(site?.photoFee) || 0 : 0;
    const photoTax = photoOn && site?.photoFeeTaxable ? YEN(photoBase * t) : 0;
    const ship = ctx.sellShip;
    const amountTax = site?.sellTaxOnAmount ? YEN(S * t) : 0;
    const inc = S + amountTax;
    const proceeds = YEN(inc - fees.total);
    const extraCosts = YEN(photoBase + photoTax + ship);
    return {
      amount: S,
      amountTax,
      inc,
      fees,
      photoBase,
      photoTax,
      ship,
      extraCosts,
      proceeds,
      net: proceeds,
      deductions: fees.total + extraCosts,
    };
  }

  function buyFromBudget(budget, ctx) {
    const t = ctx.t;
    const site = ctx.buySite;
    const ship = ctx.buyShip;
    const C = YEN(budget);
    const amountTax = site?.buyTaxOnAmount ? YEN(C * t) : 0;
    const fees = sumFees(site?.buyFees, C, t);
    const bid = YEN100(C - amountTax - fees.total - ship);
    return {
      budget: C,
      amount: bid,
      amountTax,
      fees,
      ship,
      total: C,
    };
  }

  function planFromSale(S, ctx) {
    const sell = sellSide(S, ctx);
    const targetProfit = YEN(sell.proceeds * ctx.rate);
    const budget = YEN(sell.proceeds - targetProfit - sell.extraCosts);
    const buy = buyFromBudget(budget, ctx);
    return { sell, buy, targetProfit, budget };
  }

  function bidAtSale(S, ctx) {
    return planFromSale(S, ctx).buy.amount;
  }

  function context(state, input) {
    return {
      t: taxRateOf(state),
      sellSite: siteById(state, input.sellSiteId),
      buySite: siteById(state, input.buySiteId),
      photo: !!input.photo,
      buyShip: input.buyShip === "" || input.buyShip == null ? 0 : Number(input.buyShip) || 0,
      sellShip: input.sellShip === "" || input.sellShip == null ? 0 : Number(input.sellShip) || 0,
      rate: (Number(input.profitRate) || 0) / 100,
    };
  }

  function missingSites(ctx) {
    if (!ctx.sellSite) return "出品先サイトを選んでください";
    if (!ctx.buySite) return "入札先サイトを選んでください";
    return "";
  }

  function bidFromSale(state, input) {
    const ctx = context(state, input);
    const miss = missingSites(ctx);
    if (miss) return fail(miss);
    const S = Number(input.salePrice);
    if (!Number.isFinite(S) || S <= 0) return fail("想定売価を入力してください");
    if (ctx.rate >= 1) return fail("利益率は100％未満にしてください");
    const plan = planFromSale(S, ctx);
    const bid = plan.buy.amount;
    const ok = bid > 0 && plan.budget > 0 && plan.sell.proceeds > 0;
    return resultPayload("bid", S, ctx, {
      ok,
      message: ok ? "" : "この利益率だと手数料で足りない",
    });
  }

  function saleFromBid(state, input) {
    const ctx = context(state, input);
    const miss = missingSites(ctx);
    if (miss) return fail(miss);
    const B = Number(input.bidPrice);
    if (!Number.isFinite(B) || B < 0) return fail("現在価格／入札予定額を入力してください");
    if (ctx.rate >= 1) return fail("利益率は100％未満にしてください");

    const okAt = (S) => bidAtSale(S, ctx) + 0.0001 >= B;
    let hi = Math.max(B * 4, 1000);
    let found = false;
    for (let k = 0; k < 24; k++) {
      if (okAt(hi)) {
        found = true;
        break;
      }
      hi *= 2;
    }
    if (!found) {
      return resultPayload("sale", 0, ctx, {
        ok: false,
        message: "この条件では販売目安が出ません",
      });
    }
    let lo = 0;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      if (okAt(mid)) hi = mid;
      else lo = mid;
    }
    const sale = Math.max(0, Math.ceil(hi));
    return resultPayload("sale", sale, ctx, {
      ok: sale > 0,
      message: sale > 0 ? "" : "この条件では販売目安が出ません",
    });
  }

  function fail(message) {
    return { ok: false, message, lines: [], bid: 0, sale: 0, outlay: 0 };
  }

  function resultPayload(mode, S, ctx, extra) {
    const plan = planFromSale(S, ctx);
    const sell = plan.sell;
    const buy = plan.buy;
    const lines = [];

    const push = (label, yen, opts = {}) => {
      if (opts.skipIfEmpty && !yen) return;
      lines.push({ label, yen: YEN(yen), note: opts.note || "" });
    };

    push("想定売価", sell.amount);
    if (sell.amountTax) push("想定売価（税込）", sell.inc);
    push("販売手数料", sell.fees.base, { skipIfEmpty: true });
    push("販売手数料の消費税", sell.fees.tax, { skipIfEmpty: true });
    push("写真撮影", sell.photoBase, { skipIfEmpty: true });
    push("写真撮影の消費税", sell.photoTax, { skipIfEmpty: true });
    push("販売送料", sell.ship, { skipIfEmpty: true });
    push("販売手取", sell.proceeds);
    push("目標利益", plan.targetProfit, { note: "販売手取に対する利益率" });
    push("仕入予算", buy.total);
    if (mode === "bid") push("入札目安", buy.amount);
    else push("販売目安", S);
    push("落札消費税", buy.amountTax, { skipIfEmpty: true });
    push("落札手数料", buy.fees.base, { skipIfEmpty: true });
    push("落札手数料の消費税", buy.fees.tax, { skipIfEmpty: true });
    push("仕入送料", buy.ship, { skipIfEmpty: true });
    push("仕入の持ち出し合計", buy.total);

    return {
      ok: extra.ok,
      message: extra.message || "",
      mode,
      sale: YEN(S),
      bid: YEN(buy.amount),
      outlay: YEN(buy.total),
      profit: YEN(plan.targetProfit),
      targetProfit: YEN(plan.targetProfit),
      lines,
    };
  }

  function newId() {
    return "id-" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function emptyBand() {
    return { min: 0, max: "", amount: 0, percent: 0 };
  }

  function emptyFeeRow() {
    return {
      id: newId(),
      type: "percent",
      percent: 0,
      minFee: "",
      taxable: true,
      bands: [emptyBand()],
    };
  }

  function emptySite(name) {
    return {
      id: newId(),
      name: name || "新しいサイト",
      buyTaxOnAmount: true,
      sellTaxOnAmount: true,
      photoFee: 0,
      photoFeeTaxable: true,
      buyFees: [],
      sellFees: [],
    };
  }

  function percentRow(percent, taxable, minFee) {
    return {
      id: newId(),
      type: "percent",
      percent,
      minFee: minFee || "",
      taxable: !!taxable,
      bands: [emptyBand()],
    };
  }

  function bandFixedRow(bands, taxable) {
    return {
      id: newId(),
      type: "bandFixed",
      percent: 0,
      taxable: !!taxable,
      bands: bands.map((band) => ({
        min: band.min,
        max: band.max,
        amount: band.amount,
        percent: 0,
      })),
    };
  }

  function defaultSites() {
    const brand = emptySite("エコリング（ブランド市）");
    brand.buyTaxOnAmount = true;
    brand.sellTaxOnAmount = true;
    brand.photoFee = 400;
    brand.photoFeeTaxable = true;
    brand.sellFees = [
      bandFixedRow(
        [
          { min: 0, max: 10000, amount: 500 },
          { min: 10001, max: 49999, amount: 1000 },
          { min: 50000, max: "", amount: 2000 },
        ],
        true,
      ),
    ];
    brand.buyFees = [
      bandFixedRow(
        [
          { min: 0, max: 10000, amount: 500 },
          { min: 10001, max: 49999, amount: 1000 },
          { min: 50000, max: 99999, amount: 2000 },
          { min: 100000, max: 499999, amount: 4000 },
          { min: 500000, max: 999999, amount: 8000 },
          { min: 1000000, max: "", amount: 10000 },
        ],
        true,
      ),
    ];

    const tools = emptySite("エコリング（道具市）");
    tools.buyTaxOnAmount = true;
    tools.sellTaxOnAmount = true;
    tools.photoFee = 400;
    tools.photoFeeTaxable = true;
    tools.sellFees = [percentRow(10, true)];
    tools.buyFees = [percentRow(10, true)];

    const regular = emptySite("オークネット（レギュラー会員）");
    regular.buyTaxOnAmount = true;
    regular.sellTaxOnAmount = true;
    regular.photoFee = 300;
    regular.photoFeeTaxable = true;
    regular.sellFees = [percentRow(5, true, 700)];
    regular.buyFees = [percentRow(6, true, 700)];

    const premium = emptySite("オークネット（プレミアム会員）");
    premium.buyTaxOnAmount = true;
    premium.sellTaxOnAmount = true;
    premium.photoFee = 300;
    premium.photoFeeTaxable = true;
    premium.sellFees = [percentRow(3, true, 700)];
    premium.buyFees = [percentRow(4, true, 700)];

    return [brand, tools, regular, premium];
  }

  function refreshDefaultSites(sites) {
    const defaults = defaultSites();
    const defaultNames = new Set(defaults.map((site) => site.name));
    const custom = (Array.isArray(sites) ? sites : []).filter((site) => !defaultNames.has(site.name));
    return defaults.concat(custom);
  }

  const Calc = {
    taxRateOf,
    findBand,
    feeBase,
    sumFees,
    sellSide,
    buyFromBudget,
    planFromSale,
    bidFromSale,
    saleFromBid,
    newId,
    emptyBand,
    emptyFeeRow,
    emptySite,
    defaultSites,
    refreshDefaultSites,
    YEN,
    YEN100,
  };

  root.Calc = Calc;
  if (typeof module !== "undefined") module.exports = Calc;
})(typeof window !== "undefined" ? window : globalThis);
