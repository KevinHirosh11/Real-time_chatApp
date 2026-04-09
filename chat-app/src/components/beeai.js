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

function BeeAiPanel({ currentUser }) {
	const apiKey = process.env.REACT_APP_GEMINI_API_KEY || '';
	const model = process.env.REACT_APP_GEMINI_MODEL || 'gemini-2.5-flash-lite';
	const [messages, setMessages] = useState(() => getWelcomeMessages(currentUser?.username));
	const [draft, setDraft] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const threadRef = useRef(null);

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
	};

	const handleSuggestion = (value) => {
		setDraft(value);
	};

	const sendPrompt = async (event) => {
		event.preventDefault();

		const trimmedDraft = draft.trim();
		if (!trimmedDraft || loading) {
			return;
		}

		if (!apiKey) {
			setError('Set REACT_APP_GEMINI_API_KEY in your .env file to enable BeeAI.');
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

		try {
			const response = await fetch(
				`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						contents: buildConversationContents(messages, trimmedDraft),
						generationConfig: {
							temperature: 0.7,
							topP: 0.95,
							maxOutputTokens: 1024,
						},
					}),
				}
			);

			const data = await response.json();
			if (!response.ok) {
				throw new Error(data?.error?.message || 'BeeAI request failed.');
			}

			const replyText = data?.candidates?.[0]?.content?.parts
				?.map((part) => part.text)
				.filter(Boolean)
				.join('')
				.trim();

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
					content: 'I could not reach BeeAI. Check your API key and model name, then try again.',
					createdAt: new Date().toISOString(),
				},
			]);
		} finally {
			setLoading(false);
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
					type="text"
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder={apiKey ? 'Ask BeeAI...' : 'Add your Gemini API key to enable BeeAI'}
					disabled={loading}
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
