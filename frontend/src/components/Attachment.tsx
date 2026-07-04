import { useState } from 'react';
import { createPortal } from 'react-dom';
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

/** One uploaded attachment. Images render as a tappable thumbnail that opens an
 *  in-app full-screen viewer with a Back button (no more losing the app in a new
 *  browser tab). Non-image files (PDF/HEIC/etc.) — or a thumbnail that fails to
 *  load — degrade to a labelled file chip that opens the file. */
export function Attachment({ url, label = 'Attachment' }: { url: string; label?: string }) {
	const [broken, setBroken] = useState(false);
	const [open, setOpen] = useState(false);
	const isImg = isImageUrl(url) && !broken;

	if (!isImg) {
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

	return (
		<>
			<button type="button" className="attach-thumb" onClick={() => setOpen(true)} aria-label={`View ${label}`}>
				<img src={url} alt={label} loading="lazy" onError={() => setBroken(true)} />
			</button>
			{open &&
				// Portal to <body>: an ancestor's opacity/transform/filter would otherwise
				// leak into the fixed overlay and make the page bleed through the image.
				createPortal(
					<div className="imgviewer" role="dialog" aria-label={label} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
						<div className="ivbar">
							<button type="button" className="ivbtn" onClick={() => setOpen(false)}>
								<Icon name="chevron" size={18} /> Back
							</button>
						</div>
						<img className="ivimg" src={url} alt={label} onClick={(e) => e.stopPropagation()} />
					</div>,
					document.body,
				)}
		</>
	);
}
