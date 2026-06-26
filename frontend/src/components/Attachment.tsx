import { useState } from 'react';
import { Icon } from './Icon';

const IMG_EXT = /\.(jpe?g|png|webp|gif|bmp|svg)(\?|#|$)/i;

/** Browser-renderable image? PDFs, HEIC (iPhone photos), docs etc. are NOT — they
 *  must not go inside an <img> or they show as a broken thumbnail. */
export function isImageUrl(url: string | null | undefined): boolean {
	return !!url && IMG_EXT.test(url);
}

function fileName(url: string): string {
	try {
		return decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'file');
	} catch {
		return 'file';
	}
}

/** One uploaded attachment. Images render as a tappable thumbnail; if the file
 *  isn't a renderable image (PDF/HEIC/etc.) — or the thumbnail fails to load — it
 *  degrades to a labelled file chip instead of a broken image. This fixes the
 *  "attachment sometimes doesn't display" case for non-image uploads. */
export function Attachment({ url, label = 'Attachment' }: { url: string; label?: string }) {
	const [broken, setBroken] = useState(false);
	if (isImageUrl(url) && !broken) {
		return (
			<a href={url} target="_blank" rel="noopener noreferrer">
				<img src={url} alt={label} loading="lazy" onError={() => setBroken(true)} />
			</a>
		);
	}
	return (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 7,
				padding: '9px 12px',
				border: '1px solid var(--line, rgba(0,0,0,0.14))',
				borderRadius: 9,
				color: 'var(--fg-2, #444)',
				textDecoration: 'none',
				fontSize: 13,
				maxWidth: '100%',
			}}
		>
			<Icon name="file-text" size={15} />
			<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName(url)}</span>
		</a>
	);
}
