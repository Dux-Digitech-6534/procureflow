const CURRENCY_SYMBOLS: Record<string, string> = {
	USD: '$',
	EUR: '€',
	GBP: '£',
	INR: '₹',
	AED: 'AED ',
	JPY: '¥',
};

/** Amounts with Indian digit grouping (e.g. "₹1,18,000"). */
export function fmtMoney(value: number | null | undefined, currency?: string | null): string {
	if (value === null || value === undefined || Number.isNaN(value)) return '—';
	const symbol = currency ? (CURRENCY_SYMBOLS[currency] ?? `${currency} `) : '';
	const negative = value < 0;
	const grouped = new Intl.NumberFormat('en-IN', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(Math.abs(value));
	return `${negative ? '−' : ''}${symbol}${grouped}`;
}

/** Plain number with Indian grouping and up to 3 decimals (quantities). */
export function fmtNum(value: number | null | undefined, decimals = 2): string {
	if (value === null || value === undefined || Number.isNaN(value)) return '—';
	return new Intl.NumberFormat('en-IN', {
		minimumFractionDigits: 0,
		maximumFractionDigits: decimals,
	}).format(value);
}

/** "18 Jun" — table/metaline date. */
export function fmtDate(value: string | null | undefined): string {
	if (!value) return '—';
	const d = new Date(value + 'T00:00:00');
	if (Number.isNaN(d.getTime())) return value;
	return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** "18 Jun 2026" — headers and facts. */
export function fmtDateLong(value: string | null | undefined): string {
	if (!value) return '—';
	const d = new Date(value + 'T00:00:00');
	if (Number.isNaN(d.getTime())) return value;
	return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Whole days from today to the given date (negative = past). */
export function daysUntil(value: string | null | undefined): number | null {
	if (!value) return null;
	const target = new Date(value + 'T00:00:00');
	if (Number.isNaN(target.getTime())) return null;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Parse Frappe v16 _server_messages / exception into a readable string. */
export function parseServerError(e: unknown): string {
	const err = e as { message?: string; exception?: string; _server_messages?: string };
	try {
		if (err?._server_messages) {
			const arr = JSON.parse(err._server_messages) as string[];
			const msgs = arr.map((m) => {
				try {
					return (JSON.parse(m) as { message?: string }).message ?? m;
				} catch {
					return m;
				}
			});
			return msgs.join('\n').replace(/<[^>]+>/g, '').trim();
		}
	} catch {
		// fall through
	}
	return (err?.exception || err?.message || 'Something went wrong').replace(/<[^>]+>/g, '').trim();
}
