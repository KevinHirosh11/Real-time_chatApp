import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons';

const getWelcomeMessages = (username) => [
	{
		id: 'beeai-welcome',
		role: 'assistant',
		content: `I'm BeeAI, Ask me to summarize a chat, draft a reply, or turn notes into actions${username ? ` for ${username}` : ''}.`,
		createdAt: new Date().toISOString(),
	},
];

const formatBeeAiTime = (value) => {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return '';
	}

	return date.toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
	});
};

const buildConversationContents = (messages, prompt) => {
	const recentMessages = messages.slice(-10).map((message) => ({
		role: message.role === 'assistant' ? 'model' : 'user',
		parts: [{ text: message.content }],
	}));

	recentMessages.push({
		role: 'user',
		parts: [{ text: prompt }],
	});

	return recentMessages;
};

function BeeAiPanel({ currentUser, apiBase: apiBaseProp }) {
	const apiBase = apiBaseProp || process.env.REACT_APP_API_BASE || 'http://localhost/Real-time_chatApp/API';
	const [messages, setMessages] = useState(() => getWelcomeMessages(currentUser?.username));
	const [draft, setDraft] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const threadRef = useRef(null);
	const composerInputRef = useRef(null);

	const focusComposerInput = () => {
		if (!composerInputRef.current) {
			return;
		}

		requestAnimationFrame(() => {
			composerInputRef.current?.focus();
		});
	};

	const makeAssistantErrorMessage = (message) => {
		if (!message) {
			return 'I could not reach BeeAI right now. Try again in a moment.';
		}

		return String(message);
	};

	useEffect(() => {
		setMessages(getWelcomeMessages(currentUser?.username));
		setDraft('');
		setError('');
		setLoading(false);
	}, [currentUser?.id, currentUser?.username]);

	useEffect(() => {
		if (!threadRef.current) {
			return;
		}

		threadRef.current.scrollTop = threadRef.current.scrollHeight;
	}, [messages, loading]);

	const resetChat = () => {
		setMessages(getWelcomeMessages(currentUser?.username));
		setDraft('');
		setError('');
		focusComposerInput();
	};

	const handleSuggestion = (value) => {
		setDraft(value);
		focusComposerInput();
	};

	const sendPrompt = async (event) => {
		event.preventDefault();

		const trimmedDraft = draft.trim();
		if (!trimmedDraft || loading) {
			return;
		}

		const userMessage = {
			id: `${Date.now()}-user`,
			role: 'user',
			content: trimmedDraft,
			createdAt: new Date().toISOString(),
		};

		const nextMessages = [...messages, userMessage];
		setMessages(nextMessages);
		setDraft('');
		setError('');
		setLoading(true);
		focusComposerInput();

		try {
			const response = await fetch(`${apiBase.replace(/\/$/, '')}/beeai.php`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					prompt: trimmedDraft,
					messages: nextMessages,
				}),
			});

			const data = await response.json();
			if (!response.ok) {
				const message = data?.message || data?.error || 'BeeAI request failed.';
				throw new Error(message);
			}

			const replyText = String(data?.reply || '').trim();

			if (!replyText) {
				throw new Error('BeeAI returned an empty response.');
			}

			setMessages((previous) => [
				...previous,
				{
					id: `${Date.now()}-assistant`,
					role: 'assistant',
					content: replyText,
					createdAt: new Date().toISOString(),
				},
			]);
		} catch (requestError) {
			const message = requestError instanceof Error ? requestError.message : 'Failed to reach BeeAI.';
			setError(message);
			setMessages((previous) => [
				...previous,
				{
					id: `${Date.now()}-assistant-error`,
					role: 'assistant',
					content: makeAssistantErrorMessage(message),
					createdAt: new Date().toISOString(),
				},
			]);
		} finally {
			setLoading(false);
			focusComposerInput();
		}
	};

	return (
		<div className="beeai-panel">
			<div className="beeai-panel-head">
				<div>
					<p className="label">Your Assistant</p>
					<h3>BeeAI</h3>
					<p className="beeai-panel-subtext">
						Ask for Summaries, Reply drafts, or Task ideas.
					</p>
				</div>
				<button type="button" className="beeai-reset-btn" onClick={resetChat}>
					Reset chat
				</button>
			</div>

			<div className="beeai-prompts">
				<button type="button" onClick={() => handleSuggestion('Summarize the latest conversation into action items.')}>
					Summarize chat
				</button>
				<button
					type="button"
					onClick={() => handleSuggestion('Draft a friendly follow-up message for the selected contact.')}
				>
					Draft reply
				</button>
				<button type="button" onClick={() => handleSuggestion('Turn this into a task list for the team.')}>Make tasks</button>
			</div>

			<div className="beeai-thread" ref={threadRef} aria-live="polite">
				{messages.map((item) => (
					<article key={item.id} className={`beeai-message ${item.role}`}>
						{item.role === 'assistant' ? (
							<div className="beeai-avatar">
								<img src="/bee.png" alt="" aria-hidden="true" />
							</div>
						) : null}
						<div className="beeai-bubble">
							<p>{item.content}</p>
							<span>{formatBeeAiTime(item.createdAt)}</span>
						</div>
					</article>
				))}
			</div>

			{error ? <p className="error-banner">{error}</p> : null}

			<form className="beeai-composer" onSubmit={sendPrompt}>
				<input
					ref={composerInputRef}
					type="text"
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder="Ask BeeAI..."
				/>
				<button
					type="submit"
					disabled={loading || !draft.trim()}
					aria-label={loading ? 'Sending' : 'Send'}
					title={loading ? 'Sending' : 'Send'}
				>
					{loading ? '...' : <FontAwesomeIcon icon={faPaperPlane} />}
				</button>
			</form>
		</div>
	);
}

export default BeeAiPanel;
