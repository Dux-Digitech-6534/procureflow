import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

type ToastType = 'success' | 'error';
interface ToastItem {
	id: number;
	type: ToastType;
	msg: string;
}
interface ToastApi {
	success: (msg: string) => void;
	error: (msg: string) => void;
}

const ToastCtx = createContext<ToastApi>({ success: () => undefined, error: () => undefined });

/** Lightweight toast notifications (no dependency). Fired after a successful
 *  save/submit/etc. across the app; mounted once in App. */
export function useToast(): ToastApi {
	return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
	const [items, setItems] = useState<ToastItem[]>([]);
	const idRef = useRef(0);

	const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
	const push = useCallback(
		(type: ToastType, msg: string) => {
			const id = (idRef.current += 1);
			setItems((xs) => [...xs, { id, type, msg }]);
			setTimeout(() => dismiss(id), 3200);
		},
		[dismiss],
	);
	const api = useMemo<ToastApi>(() => ({ success: (m) => push('success', m), error: (m) => push('error', m) }), [push]);

	return (
		<ToastCtx.Provider value={api}>
			{children}
			{createPortal(
				<div className="toastwrap">
					{items.map((t) => (
						<div key={t.id} className={'toast ' + t.type} role="status">
							<Icon name={t.type === 'success' ? 'circle-check' : 'warning'} size={16} />
							<span>{t.msg}</span>
							<button className="xbtn" onClick={() => dismiss(t.id)} aria-label="Dismiss">
								<Icon name="close" size={12} />
							</button>
						</div>
					))}
				</div>,
				document.body,
			)}
		</ToastCtx.Provider>
	);
}
