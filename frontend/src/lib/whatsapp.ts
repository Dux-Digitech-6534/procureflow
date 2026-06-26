import type { PoDetail } from './api';
import { fmtDateLong } from './format';

/** Indian mobile → wa.me international form: digits only, prefix 91 for a bare
 *  10-digit number. Empty when no number, so wa.me opens the contact picker. */
function waNumber(mobile: string | null | undefined): string {
	const d = (mobile ?? '').replace(/\D/g, '').replace(/^0+/, '');
	if (d.length === 10) return '91' + d;
	if (d.length === 12 && d.startsWith('91')) return d;
	return d; // 11/13-digit or unknown — pass through; blank stays blank (picker)
}

/** "Send on WhatsApp" deep link for a finalized PO: greeting + PO summary + a
 *  tokenised public PDF link the supplier can open without logging in. Opens
 *  WhatsApp Web on desktop and the WhatsApp app on a phone/APK. */
export function whatsAppPoUrl(d: PoDetail): string {
	const total = d.rounded_total ?? d.grand_total ?? 0;
	const amount = '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(total);
	const date = d.transaction_date ? fmtDateLong(d.transaction_date) : '';
	const lines = [
		`Namaste ${d.supplier_name || d.supplier || ''},`.trim(),
		'',
		`Purchase Order ${d.name}${date ? ` dated ${date}` : ''} for ${amount} has been placed.`,
	];
	if (d.pdf_url) lines.push('', 'View / download the PO here:', d.pdf_url);
	lines.push('', `Regards,${d.company ? ' ' + d.company : ''}`);
	const text = lines.join('\n');
	return `https://wa.me/${waNumber(d.supplier_mobile)}?text=${encodeURIComponent(text)}`;
}

/** Share a new user's login + temporary password over WhatsApp (to their mobile).
 *  Opens the contact picker when no mobile is on file. */
export function whatsAppCredsUrl(d: { email: string; mobile: string; password: string }): string {
	const appUrl = window.location.origin + '/procureflow';
	const text = [
		'Namaste,',
		'',
		'Your ProcureFlow login:',
		appUrl,
		`Email: ${d.email}`,
		`Temporary password: ${d.password}`,
		'',
		'Please log in and change your password.',
	].join('\n');
	return `https://wa.me/${waNumber(d.mobile)}?text=${encodeURIComponent(text)}`;
}
