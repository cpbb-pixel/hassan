// Exact integer-cent (halala) financial calculation engine
// Eliminates IEEE-754 floating-point drift in POS & Accounting audits.

export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function roundMoney(amount: number): number {
  return fromCents(toCents(amount));
}

export interface LineCalcInput {
  qty: number;
  unitPrice: number;
  unitCost: number;
  addonsTotalPerUnit: number;
  addonsCostPerUnit: number;
}

export interface OrderFinancialInput {
  lines: LineCalcInput[];
  discountType: 'none' | 'percent' | 'fixed';
  discountValue: number;
  taxRate: number; // e.g., 15 for 15%
  taxInclusive: boolean;
  deliveryFee: number;
}

export interface OrderFinancialOutput {
  subtotal: number;
  discountAmount: number;
  netBeforeTax: number;
  taxAmount: number;
  deliveryFee: number;
  grandTotal: number;
  totalCogs: number;
  grossProfit: number;
}

export function calculateOrderFinancials(input: OrderFinancialInput): OrderFinancialOutput {
  let subtotalCents = 0;
  let totalCogsCents = 0;

  for (const line of input.lines) {
    const qty = Math.max(0, Math.floor(line.qty));
    const unitTotalCents = toCents(line.unitPrice) + toCents(line.addonsTotalPerUnit);
    const unitCostCents = toCents(line.unitCost) + toCents(line.addonsCostPerUnit);
    subtotalCents += unitTotalCents * qty;
    totalCogsCents += unitCostCents * qty;
  }

  let discountCents = 0;
  if (input.discountType === 'percent') {
    const pct = Math.min(100, Math.max(0, Number(input.discountValue) || 0));
    discountCents = Math.round((subtotalCents * pct) / 100);
  } else if (input.discountType === 'fixed') {
    discountCents = Math.min(subtotalCents, Math.max(0, toCents(Number(input.discountValue) || 0)));
  }

  const afterDiscountCents = Math.max(0, subtotalCents - discountCents);
  const rate = Math.max(0, Number(input.taxRate) || 0);

  let netBeforeTaxCents = 0;
  let taxCents = 0;
  let itemsFinalCents = 0;

  if (input.taxInclusive) {
    // Prices already include VAT: extract VAT precisely
    itemsFinalCents = afterDiscountCents;
    netBeforeTaxCents = Math.round((afterDiscountCents * 100) / (100 + rate));
    taxCents = itemsFinalCents - netBeforeTaxCents;
  } else {
    // VAT added on top of discounted subtotal
    netBeforeTaxCents = afterDiscountCents;
    taxCents = Math.round((netBeforeTaxCents * rate) / 100);
    itemsFinalCents = netBeforeTaxCents + taxCents;
  }

  const deliveryCents = Math.max(0, toCents(Number(input.deliveryFee) || 0));
  const grandTotalCents = itemsFinalCents + deliveryCents;
  const grossProfitCents = netBeforeTaxCents - totalCogsCents;

  return {
    subtotal: fromCents(subtotalCents),
    discountAmount: fromCents(discountCents),
    netBeforeTax: fromCents(netBeforeTaxCents),
    taxAmount: fromCents(taxCents),
    deliveryFee: fromCents(deliveryCents),
    grandTotal: fromCents(grandTotalCents),
    totalCogs: fromCents(totalCogsCents),
    grossProfit: fromCents(grossProfitCents),
  };
}

export function formatMoney(amount: number, currency = 'ر.س'): string {
  const val = Number.isFinite(amount) ? amount : 0;
  return `${val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}
