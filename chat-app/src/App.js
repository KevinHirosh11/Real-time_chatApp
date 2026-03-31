import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import RegisterPage from './components/RegisterPage';

const THEME_STORAGE_KEY = 'chat_app_theme';

const getInitialTheme = () => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return savedTheme === 'dark' ? 'dark' : 'light';
};

function App() {
  const apiBase = useMemo(() => {
    return process.env.REACT_APP_API_BASE || 'http://localhost/Real-time_chatApp/API';
  }, []);

  const socketUrl = useMemo(() => {
    return process.env.REACT_APP_WS_URL || 'ws://localhost:8080';
  }, []);

  const [authMode, setAuthMode] = useState('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ username: '', email: '', password: '' });

  const [users, setUsers] = useState([]);
  const [activeUserId, setActiveUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatError, setChatError] = useState('');
  const [socketStatus, setSocketStatus] = useState('offline');
  const [theme, setTheme] = useState(getInitialTheme);

  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const activeUserIdRef = useRef(null);

  const activeUser = users.find((user) => user.id === activeUserId) || null;

  const fetchUsers = useCallback(async () => {
    if (!currentUser) {
      return;
    }

    try {
      setLoadingUsers(true);
      const response = await fetch(`${apiBase}/users.php`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to load users');
      }

      const loadedUsers = (result.data || []).filter((user) => user.id !== currentUser.id);
      setUsers(loadedUsers);

      if (loadedUsers.length > 1) {
        setActiveUserId((previousId) => previousId || loadedUsers[0].id);
      } else if (loadedUsers.length === 1) {
        setActiveUserId(loadedUsers[0].id);
      } else {
        setActiveUserId(null);
      }
    } catch (err) {
      setChatError(err.message || 'Unable to connect to API');
    } finally {
      setLoadingUsers(false);
    }
  }, [apiBase, currentUser]);

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
      setChatError(err.message || 'Failed to fetch conversation');
    } finally {
      setLoadingMessages(false);
    }
  }, [apiBase]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    fetchUsers();
  }, [currentUser, fetchUsers]);

  useEffect(() => {
    activeUserIdRef.current = activeUserId;
  }, [activeUserId]);

  useEffect(() => {
    if (!currentUser || !activeUser) {
      setMessages([]);
      return;
    }

    fetchMessages(currentUser.id, activeUser.id);
  }, [currentUser, activeUser, fetchMessages]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }

    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!currentUser) {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }

      setSocketStatus('offline');
      return;
    }

    let isUnmounted = false;
    let shouldReconnect = true;

    const clearReconnectTimer = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const connectSocket = () => {
      if (isUnmounted) {
        return;
      }

      clearReconnectTimer();
      setSocketStatus('connecting');

      const socket = new WebSocket(socketUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        if (isUnmounted) {
          return;
        }

        setSocketStatus('online');
        socket.send(
          JSON.stringify({
            type: 'auth',
            userId: currentUser.id,
          })
        );
      };

      socket.onmessage = (event) => {
        if (isUnmounted) {
          return;
        }

        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'error') {
            setChatError(payload.message || 'Socket error');
            return;
          }

          if (payload.type !== 'new_message' && payload.type !== 'message_sent') {
            return;
          }

          const packet = payload.data || {};
          const incoming = {
            id: Number(packet.id),
            sender_id: Number(packet.senderId),
            receiver_id: Number(packet.receiverId),
            message: String(packet.message || ''),
            created_at: packet.createdAt || new Date().toISOString(),
          };

          const peerId = activeUserIdRef.current;
          const isCurrentConversation =
            peerId &&
            ((incoming.sender_id === currentUser.id && incoming.receiver_id === peerId) ||
              (incoming.sender_id === peerId && incoming.receiver_id === currentUser.id));

          if (!isCurrentConversation) {
            return;
          }

          setMessages((previous) => {
            const alreadyExists = previous.some((message) => message.id === incoming.id);
            if (alreadyExists) {
              return previous;
            }

            return [...previous, incoming];
          });
        } catch {
          setChatError('Received invalid socket payload');
        }
      };

      socket.onerror = () => {
        if (isUnmounted) {
          return;
        }

        setSocketStatus('error');
      };

      socket.onclose = () => {
        if (isUnmounted) {
          return;
        }

        socketRef.current = null;
        setSocketStatus('offline');

        if (!shouldReconnect) {
          return;
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          connectSocket();
        }, 2500);
      };
    };

    connectSocket();

    return () => {
      isUnmounted = true;
      shouldReconnect = false;
      clearReconnectTimer();

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [currentUser, socketUrl]);

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!currentUser || !activeUser || !draft.trim()) {
      return;
    }

    const text = draft.trim();
    const socket = socketRef.current;
    const canSendWithSocket = socket && socket.readyState === WebSocket.OPEN;

    if (canSendWithSocket) {
      socket.send(
        JSON.stringify({
          type: 'private_message',
          receiverId: activeUser.id,
          message: text,
        })
      );
      setDraft('');
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
          message: text,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to send message');
      }

      setDraft('');
      fetchMessages(currentUser.id, activeUser.id);
    } catch (err) {
      setChatError(err.message || 'Failed to send message');
    }
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');

    if (!loginForm.email.trim() || !loginForm.password.trim()) {
      setAuthError('Please enter email and password.');
      return;
    }

    try {
      setAuthLoading(true);
      const response = await fetch(`${apiBase}/login.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: loginForm.email.trim(),
          password: loginForm.password,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Login failed');
      }

      setCurrentUser(result.data || null);
      setLoginForm({ email: '', password: '' });
    } catch (err) {
      setAuthError(err.message || 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegisterSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');

    if (!registerForm.username.trim() || !registerForm.email.trim() || !registerForm.password.trim()) {
      setAuthError('Please fill in username, email, and password.');
      return;
    }

    try {
      setAuthLoading(true);
      const response = await fetch(`${apiBase}/register.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: registerForm.username.trim(),
          email: registerForm.email.trim(),
          password: registerForm.password,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Registration failed');
      }

      setCurrentUser(result.data || null);
      setRegisterForm({ username: '', email: '', password: '' });
    } catch (err) {
      setAuthError(err.message || 'Registration failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setSocketStatus('offline');
    setCurrentUser(null);
    setUsers([]);
    setMessages([]);
    setDraft('');
    setActiveUserId(null);
    setChatError('');
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const toggleTheme = () => {
    setTheme((previousTheme) => (previousTheme === 'light' ? 'dark' : 'light'));
  };

  if (!currentUser) {
    return (
      <div className={`chat-shell auth-shell theme-${theme}`}>
        <div className="glow-layer glow-one" />
        <div className="glow-layer glow-two" />

        <main className="auth-layout">
          <section className="auth-panel">
            <div className="auth-head">
              <p className="auth-kicker">Secure Access</p>
              <button type="button" className="theme-btn" onClick={toggleTheme}>
                {theme === 'light' ? 'Dark mode' : 'Light mode'}
              </button>
            </div>
            <h1>Real-time ChatApp</h1>
            <p className="auth-subtext">
              Sign in to continue your conversations, or create a new account to start chatting.
            </p>

            <div className="auth-switch">
              <button
                type="button"
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => setAuthMode('login')}
              >
                Login
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'active' : ''}
                onClick={() => setAuthMode('register')}
              >
                Register
              </button>
            </div>

            {authError ? <p className="error-banner">{authError}</p> : null}

            {authMode === 'login' ? (
              <form className="auth-form" onSubmit={handleLoginSubmit}>
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
                  placeholder="you@email.com"
                />

                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                  placeholder="Enter your password"
                />

                <button type="submit" disabled={authLoading}>
                  {authLoading ? 'Signing in...' : 'Login'}
                </button>
              </form>
            ) : (
              <RegisterPage
                registerForm={registerForm}
                setRegisterForm={setRegisterForm}
                authLoading={authLoading}
                onSubmit={handleRegisterSubmit}
              />
            )}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={`chat-shell theme-${theme}`}>
      <div className="glow-layer glow-one" />
      <div className="glow-layer glow-two" />

      <main className="chat-layout">
        <aside className="chat-sidebar">
          <div className="brand-row">
            <div className="brand-badge">K</div>
            <div>
              <p className="brand-kicker">Realtime Chat</p>
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
            <div className="topbar-actions">
              <div className={`topbar-chip socket-${socketStatus}`}>
                Socket {socketStatus}
              </div>
              <button type="button" className="theme-btn" onClick={toggleTheme}>
                {theme === 'light' ? 'Dark mode' : 'Light mode'}
              </button>
              <button type="button" className="logout-btn" onClick={logout}>
                Logout
              </button>
            </div>
          </header>

          <div className="messages-area">
            {chatError ? <p className="error-banner">{chatError}</p> : null}

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
