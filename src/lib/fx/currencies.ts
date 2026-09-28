/** Currencies Verity can invoice and pay in. Safe to import from client components. */

export const CURRENCIES: Array<{ code: string; name: string }> = [
  { code: "GBP", name: "British pound" },
  { code: "EUR", name: "Euro" },
  { code: "USD", name: "US dollar" },
  { code: "AED", name: "UAE dirham" },
  { code: "AUD", name: "Australian dollar" },
  { code: "BGN", name: "Bulgarian lev" },
  { code: "BHD", name: "Bahraini dinar" },
  { code: "BRL", name: "Brazilian real" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "CHF", name: "Swiss franc" },
  { code: "CNY", name: "Chinese yuan" },
  { code: "CZK", name: "Czech koruna" },
  { code: "DKK", name: "Danish krone" },
  { code: "HKD", name: "Hong Kong dollar" },
  { code: "HUF", name: "Hungarian forint" },
  { code: "IDR", name: "Indonesian rupiah" },
  { code: "ILS", name: "Israeli shekel" },
  { code: "INR", name: "Indian rupee" },
  { code: "ISK", name: "Icelandic króna" },
  { code: "JPY", name: "Japanese yen" },
  { code: "KRW", name: "South Korean won" },
  { code: "MXN", name: "Mexican peso" },
  { code: "MYR", name: "Malaysian ringgit" },
  { code: "NOK", name: "Norwegian krone" },
  { code: "NZD", name: "New Zealand dollar" },
  { code: "OMR", name: "Omani rial" },
  { code: "PHP", name: "Philippine peso" },
  { code: "PLN", name: "Polish złoty" },
  { code: "QAR", name: "Qatari riyal" },
  { code: "RON", name: "Romanian leu" },
  { code: "SAR", name: "Saudi riyal" },
  { code: "SEK", name: "Swedish krona" },
  { code: "SGD", name: "Singapore dollar" },
  { code: "THB", name: "Thai baht" },
  { code: "TRY", name: "Turkish lira" },
  { code: "ZAR", name: "South African rand" },
];

/** Gulf currencies aren't in the ECB's reference set; they're fixed to the US dollar (units per 1 USD). */
export const USD_PEGS: Record<string, number> = { AED: 3.6725, SAR: 3.75, QAR: 3.64, BHD: 0.376, OMR: 0.3845 };

export const isCurrency = (code: string) => CURRENCIES.some((c) => c.code === code);
