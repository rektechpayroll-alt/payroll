export function gbp(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function gbpCompact(value: number): string {
  if (Math.abs(value) >= 1000) {
    return "£" + (value / 1000).toFixed(1) + "k";
  }
  return gbp(value);
}
