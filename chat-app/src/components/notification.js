import { useEffect } from 'react';

function NotificationItem({ item, onDismiss, timeout }) {
	useEffect(() => {
		const timerId = window.setTimeout(() => {
			onDismiss(item.id);
		}, timeout);

		return () => {
			window.clearTimeout(timerId);
		};
	}, [item.id, onDismiss, timeout]);

	return (
		<div className={`toast toast-${item.type || 'info'}`} role="status" aria-live="polite">
			<p>{item.message}</p>
			<button
				type="button"
				className="toast-close"
				onClick={() => onDismiss(item.id)}
				aria-label="Dismiss notification"
			>
				x
			</button>
		</div>
	);
}

function Notification({ items, onDismiss, timeout = 3600 }) {
	if (!items || items.length === 0) {
		return null;
	}

	return (
		<section className="toast-stack" aria-label="Notifications">
			{items.map((item) => (
				<NotificationItem key={item.id} item={item} onDismiss={onDismiss} timeout={timeout} />
			))}
		</section>
	);
}

export default Notification;
