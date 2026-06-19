export function Placeholder({ title, eyebrow }: { title: string; eyebrow: string }) {
	return (
		<main>
			<div className="eyebrow">{eyebrow}</div>
			<h1 style={{ fontFamily: 'var(--font-ui)', color: 'var(--fg-1)' }}>{title}</h1>
			<section className="card" style={{ marginTop: 18 }}>
				<div className="empty">
					<div className="t1">Coming soon</div>
					<div className="t2">
						This screen is part of the ProcureFlow front-door. Material Requests are live now;
						{' '}
						{title} is next.
					</div>
				</div>
			</section>
		</main>
	);
}
