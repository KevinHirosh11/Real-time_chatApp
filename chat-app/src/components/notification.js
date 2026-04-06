import { useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faCircleCheck, faCircleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';

const getNotificationIcon = (type) => {
	switch (String(type || 'info')) {
		case 'success':
			return faCircleCheck;
		case 'error':
			return faCircleExclamation;
		default:
			return faBell;
	}
};

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
			<div className="toast-content">
				<span className="toast-icon" aria-hidden="true">
					<FontAwesomeIcon icon={getNotificationIcon(item.type)} />
				</span>
				<p>{item.message}</p>
			</div>
			<button
				type="button"
				className="toast-close"
				onClick={() => onDismiss(item.id)}
				aria-label="Dismiss notification"
			>
				<FontAwesomeIcon icon={faXmark} />
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
