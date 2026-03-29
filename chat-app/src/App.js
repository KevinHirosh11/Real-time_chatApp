import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';

function App() {
  const apiBase = useMemo(() => {
    return process.env.REACT_APP_API_BASE || 'http://localhost/Real-time_chatApp/API';
  }, []);

  const [users, setUsers] = useState([]);
  const [activeUserId, setActiveUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState('');

  const currentUser = users[0] || null;
  const activeUser = users.find((user) => user.id === activeUserId) || null;

  const fetchUsers = useCallback(async () => {
    try {
      setLoadingUsers(true);
      const response = await fetch(`${apiBase}/users.php`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to load users');
      }

      const loadedUsers = result.data || [];
      setUsers(loadedUsers);
      if (loadedUsers.length > 1) {
        setActiveUserId((previousId) => previousId || loadedUsers[1].id);
      }
    } catch (err) {
      setError(err.message || 'Unable to connect to API');
    } finally {
      setLoadingUsers(false);
    }
  }, [apiBase]);

  const fetchMessages = useCallback(async (senderId, receiverId) => {
    if (!senderId || !receiverId) {
      return;
    }

    try {
      setLoadingMessages(true);
      const response = await fetch(
        `${apiBase}/messages.php?sender_id=${senderId}&receiver_id=${receiverId}`
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to load messages');
      }

      setMessages(result.data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch conversation');
    } finally {
      setLoadingMessages(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!currentUser || !activeUser) {
      setMessages([]);
      return;
    }

    fetchMessages(currentUser.id, activeUser.id);

    const intervalId = setInterval(() => {
      fetchMessages(currentUser.id, activeUser.id);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [currentUser, activeUser, fetchMessages]);

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!currentUser || !activeUser || !draft.trim()) {
      return;
    }

    try {
      const response = await fetch(`${apiBase}/messages.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender_id: currentUser.id,
          receiver_id: activeUser.id,
          message: draft.trim(),
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to send message');
      }

      setDraft('');
      fetchMessages(currentUser.id, activeUser.id);
    } catch (err) {
      setError(err.message || 'Failed to send message');
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-shell">
      <div className="glow-layer glow-one" />
      <div className="glow-layer glow-two" />

      <main className="chat-layout">
        <aside className="chat-sidebar">
          <div className="brand-row">
            <div className="brand-badge">RT</div>
            <div>
              <p className="brand-kicker">Realtime Workspace</p>
              <h1>Chat Control</h1>
            </div>
          </div>

          <div className="profile-card">
            <p className="label">Signed in as</p>
            <h2>{currentUser ? currentUser.username : 'Loading...'}</h2>
            <p>{currentUser ? currentUser.email : 'Fetching profile'}</p>
          </div>

          <div className="contacts-wrap">
            <div className="contacts-header">
              <h3>Contacts</h3>
              <span>{Math.max(users.length - 1, 0)}</span>
            </div>

            {loadingUsers ? <p className="helper-text">Loading users...</p> : null}
            {!loadingUsers && users.length <= 1 ? (
              <p className="helper-text">Add more users in your database to start chatting.</p>
            ) : null}

            <div className="contact-list">
              {users
                .filter((user) => !currentUser || user.id !== currentUser.id)
                .map((user, index) => (
                  <button
                    key={user.id}
                    type="button"
                    className={`contact-item ${activeUserId === user.id ? 'active' : ''}`}
                    style={{ animationDelay: `${index * 70}ms` }}
                    onClick={() => setActiveUserId(user.id)}
                  >
                    <div className="avatar">{user.username.charAt(0).toUpperCase()}</div>
                    <div>
                      <p>{user.username}</p>
                      <small>{user.status === 'online' ? 'Online' : 'Offline'}</small>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </aside>

        <section className="chat-main">
          <header className="chat-topbar">
            <div>
              <p className="label">Conversation</p>
              <h2>{activeUser ? activeUser.username : 'Pick a contact'}</h2>
            </div>
            <div className="topbar-chip">Live Sync</div>
          </header>

          <div className="messages-area">
            {error ? <p className="error-banner">{error}</p> : null}

            {!activeUser ? <p className="helper-text">Select a contact to begin messaging.</p> : null}

            {loadingMessages && activeUser ? (
              <p className="helper-text">Syncing messages...</p>
            ) : null}

            {activeUser && !loadingMessages && messages.length === 0 ? (
              <p className="helper-text">No messages yet. Start the conversation.</p>
            ) : null}

            {messages.map((message) => {
              const isOwn = currentUser && message.sender_id === currentUser.id;
              return (
                <article key={message.id} className={`message-row ${isOwn ? 'own' : 'other'}`}>
                  <div className="bubble">
                    <p>{message.message}</p>
                    <span>{formatTime(message.created_at)}</span>
                  </div>
                </article>
              );
            })}
          </div>

          <form className="composer" onSubmit={sendMessage}>
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={activeUser ? `Message ${activeUser.username}...` : 'Select a user first'}
              disabled={!activeUser}
            />
            <button type="submit" disabled={!activeUser || !draft.trim()}>
              Send
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

export default App;
