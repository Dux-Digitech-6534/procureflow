import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface Option {
	value: string;
	label?: string;
	sub?: string;
}

interface Props {
	value: string | null;
	onChange: (value: string) => void;
	options: Option[];
	placeholder?: string;
	disabled?: boolean;
	mono?: boolean;
}

export function SearchSelect({ value, onChange, options, placeholder, disabled, mono }: Props) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const wrapRef = useRef<HTMLDivElement>(null);
	const [rect, setRect] = useState<DOMRect | null>(null);

	const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		const list = q
			? options.filter(
					(o) =>
						o.value.toLowerCase().includes(q) ||
						(o.label ?? '').toLowerCase().includes(q) ||
						(o.sub ?? '').toLowerCase().includes(q),
				)
			: options;
		return list.slice(0, 50);
	}, [options, query]);

	useLayoutEffect(() => {
		if (open && wrapRef.current) setRect(wrapRef.current.getBoundingClientRect());
	}, [open, query]);

	useEffect(() => {
		if (!open) return;
		const close = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
		};
		const reposition = () => {
			if (wrapRef.current) setRect(wrapRef.current.getBoundingClientRect());
		};
		document.addEventListener('mousedown', close);
		window.addEventListener('scroll', reposition, true);
		window.addEventListener('resize', reposition);
		return () => {
			document.removeEventListener('mousedown', close);
			window.removeEventListener('scroll', reposition, true);
			window.removeEventListener('resize', reposition);
		};
	}, [open]);

	const display = open ? query : (selected?.label ?? value ?? '');

	return (
		<div className="swrap" ref={wrapRef}>
			<input
				className={'inp' + (mono ? ' mono' : '')}
				value={display}
				placeholder={placeholder}
				disabled={disabled}
				onFocus={() => {
					setQuery('');
					setOpen(true);
				}}
				onChange={(e) => {
					setQuery(e.target.value);
					setOpen(true);
				}}
			/>
			{value && !disabled && (
				<button
					type="button"
					className="sclear"
					onMouseDown={(e) => {
						e.preventDefault();
						onChange('');
						setQuery('');
					}}
				>
					×
				</button>
			)}
			{open &&
				rect &&
				createPortal(
					<div
						className="sdrop"
						style={{
							position: 'fixed',
							top: rect.bottom + 4,
							left: rect.left,
							width: rect.width,
						}}
					>
						{filtered.length === 0 && <div className="opt mut">No matches</div>}
						{filtered.map((o) => (
							<div
								key={o.value}
								className="opt"
								onMouseDown={(e) => {
									e.preventDefault();
									onChange(o.value);
									setQuery('');
									setOpen(false);
								}}
							>
								<div className="lbl">{o.label ?? o.value}</div>
								{o.sub && <div className="sub">{o.sub}</div>}
							</div>
						))}
					</div>,
					document.body,
				)}
		</div>
	);
}
