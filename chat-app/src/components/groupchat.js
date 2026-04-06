import { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';

const formatTime = (value) => {
	if (!value) {
		return '';
	}

	const parsedDate = new Date(value);
	if (Number.isNaN(parsedDate.getTime())) {
		return '';
	}

	return parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

function GroupChat({
	groupName = 'Group Chat',
	members = [],
	messages = [],
	currentUserId = null,
	onSendMessage,
	disabled = false,
}) {
	const [draft, setDraft] = useState('');
	const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
	const [selectedAttachment, setSelectedAttachment] = useState(null);

	const attachmentMenuRef = useRef(null);
	const imageAttachmentInputRef = useRef(null);
	const fileAttachmentInputRef = useRef(null);

	const memberCount = useMemo(() => members.length, [members]);

	useEffect(() => {
		const handleClickOutside = (event) => {
			if (!attachmentMenuRef.current) {
				return;
			}

			if (!attachmentMenuRef.current.contains(event.target)) {
				setIsAttachmentMenuOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	const openAttachmentPicker = (category) => {
		if (disabled) {
			return;
		}

		if (category === 'image' && imageAttachmentInputRef.current) {
			imageAttachmentInputRef.current.click();
		}

		if (category === 'file' && fileAttachmentInputRef.current) {
			fileAttachmentInputRef.current.click();
		}

		setIsAttachmentMenuOpen(false);
	};

	const handleAttachmentSelected = (event, type) => {
		const file = event.target.files && event.target.files[0];
		event.target.value = '';

		if (!file) {
			return;
		}

		setSelectedAttachment({ file, type });
	};

	const handleSubmit = (event) => {
		event.preventDefault();

		const trimmedMessage = draft.trim();
		if (!trimmedMessage && !selectedAttachment) {
			return;
		}

		if (typeof onSendMessage === 'function') {
			onSendMessage({
				message: trimmedMessage,
				attachment: selectedAttachment,
			});
		}

		setDraft('');
		setSelectedAttachment(null);
	};

	return (
		<section className="chat-main">
			<header className="chat-topbar">
				<div>
					<p className="label">Group</p>
					<h2>{groupName}</h2>
					<p className="active-user-presence">{memberCount} members</p>
				</div>
				<span className="topbar-chip">Live</span>
			</header>

			<div className="messages-area show-scrollbar">
				{messages.map((message) => {
					const isOwn = currentUserId !== null && Number(message.sender_id) === Number(currentUserId);
					return (
						<article key={message.id || `${message.sender_id}-${message.created_at}`} className={`message-row ${isOwn ? 'own' : 'other'}`}>
							<div className="bubble">
								{!isOwn && message.sender_name ? <strong>{message.sender_name}</strong> : null}
								<p>{message.message}</p>
								<span>{formatTime(message.created_at)}</span>
							</div>
						</article>
					);
				})}
			</div>

			<form className="composer" onSubmit={handleSubmit}>
				<div className="attachment-menu-wrap" ref={attachmentMenuRef}>
					<button
						type="button"
						className="attachment-toggle"
						onClick={() => setIsAttachmentMenuOpen((previous) => !previous)}
						disabled={disabled}
						aria-label="Add attachment"
						aria-expanded={isAttachmentMenuOpen}
					>
						<FontAwesomeIcon icon={faPlus} />
					</button>

					{isAttachmentMenuOpen ? (
						<div className="attachment-menu" role="menu" aria-label="Attachment options">
							<button type="button" onClick={() => openAttachmentPicker('image')}>
								Photos & videos
							</button>
							<button type="button" onClick={() => openAttachmentPicker('file')}>
								Document
							</button>
						</div>
					) : null}

					<input
						ref={imageAttachmentInputRef}
						type="file"
						accept="image/*,video/*"
						onChange={(event) => handleAttachmentSelected(event, 'image')}
						hidden
					/>
					<input
						ref={fileAttachmentInputRef}
						type="file"
						onChange={(event) => handleAttachmentSelected(event, 'file')}
						hidden
					/>
				</div>

				<input
					type="text"
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder="Message group..."
					disabled={disabled}
				/>

				{selectedAttachment ? (
					<div className="attachment-chip" title={selectedAttachment.file.name}>
						<span>{selectedAttachment.file.name}</span>
						<button type="button" onClick={() => setSelectedAttachment(null)} aria-label="Remove attachment">
							<FontAwesomeIcon icon={faXmark} />
						</button>
					</div>
				) : null}

				<button type="submit" disabled={disabled || (!draft.trim() && !selectedAttachment)}>
					<FontAwesomeIcon icon={faPaperPlane} />
				</button>
			</form>
		</section>
	);
}

export default GroupChat;
