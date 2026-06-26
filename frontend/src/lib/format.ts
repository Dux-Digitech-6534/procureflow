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

/** Compact INR for dashboards: ₹1.18 Cr / ₹4.5 L / ₹12.3 K / ₹940. */
export function fmtCompact(value: number | null | undefined, currency = 'INR'): string {
	if (value === null || value === undefined || Number.isNaN(value)) return '—';
	const symbol = CURRENCY_SYMBOLS[currency] ?? '';
	const neg = value < 0;
	const n = Math.abs(value);
	let body: string;
	if (n >= 1e7) body = `${(n / 1e7).toFixed(2)} Cr`;
	else if (n >= 1e5) body = `${(n / 1e5).toFixed(2)} L`;
	else if (n >= 1e3) body = `${(n / 1e3).toFixed(1)} K`;
	else body = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
	return `${neg ? '−' : ''}${symbol}${body}`;
}

/** "12.3%" — percentage; withSign prefixes "+" for positives. */
export function fmtPercent(value: number | null | undefined, decimals = 1, withSign = false): string {
	if (value === null || value === undefined || Number.isNaN(value)) return '—';
	const s = value.toFixed(decimals);
	return `${withSign && value > 0 ? '+' : ''}${s}%`;
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

/* -------------------------------- Terms helpers ----------------------------- */
// PO Terms & Conditions are stored as HTML (an <ol> of points) but edited as
// plain text — one point per line. These convert between the two so the Settings
// and PO editors stay simple while the print format renders a clean list.

function stripTags(s: string): string {
	return s
		.replace(/<\s*br\s*\/?>/gi, '\n')
		.replace(/<\/(p|li|div|ol|ul)\s*>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>');
}

/** Terms HTML → editor text (one point per line). */
export function termsHtmlToText(html: string | null | undefined): string {
	if (!html) return '';
	const items = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
	const lines = items.length
		? items.map((m) => stripTags(m[1]))
		: stripTags(html).split(/\n+/);
	return lines.map((l) => l.trim()).filter(Boolean).join('\n');
}

/** Editor text → terms HTML, one <div> per line. NOT an <ol>: the print must show
 *  the lines exactly as typed (no automatic numbering) so the user controls their
 *  own numbering. Blank lines are preserved as spacing. */
export function termsTextToHtml(text: string | null | undefined): string {
	const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n');
	while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
	if (!lines.length) return '';
	return lines.map((l) => (l.trim() ? `<div>${esc(l)}</div>` : '<div>&nbsp;</div>')).join('');
}
