import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import RegisterPage from './components/RegisterPage';
import Notification from './components/notification';
import Profile from './components/profile';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';

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
  const [notifications, setNotifications] = useState([]);
  const [isAtMessageBottom, setIsAtMessageBottom] = useState(true);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState(null);

  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const activeUserIdRef = useRef(null);
  const messagesAreaRef = useRef(null);
  const attachmentMenuRef = useRef(null);
  const imageAttachmentInputRef = useRef(null);
  const fileAttachmentInputRef = useRef(null);
  const sidebarHideTimerRef = useRef(null);
  const messagesHideTimerRef = useRef(null);
  const [isSidebarScrollbarVisible, setIsSidebarScrollbarVisible] = useState(true);
  const [isMessagesScrollbarVisible, setIsMessagesScrollbarVisible] = useState(true);

  const activeUser = users.find((user) => user.id === activeUserId) || null;

  const renderAvatar = (user, className = 'avatar') => {
    const username = user && user.username ? String(user.username) : '?';
    const imageUrl = user && user.profile_image ? String(user.profile_image) : '';

    if (imageUrl) {
      return (
        <div className={`${className} has-image`}>
          <img src={imageUrl} alt={`${username} avatar`} loading="lazy" />
        </div>
      );
    }

    return <div className={className}>{username.charAt(0).toUpperCase()}</div>;
  };

  const pushNotification = useCallback((message, type = 'info') => {
    if (!message) {
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setNotifications((previous) => [...previous, { id, message, type }]);
  }, []);

  const dismissNotification = useCallback((id) => {
    setNotifications((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const fetchUsers = useCallback(async ({ silent = false } = {}) => {
    if (!currentUser) {
      return;
    }

    try {
      if (!silent) {
        setLoadingUsers(true);
      }

      const response = await fetch(`${apiBase}/users.php?user_id=${encodeURIComponent(String(currentUser.id))}`, {
        cache: 'no-store',
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to load users');
      }

      const currentUserId = Number(currentUser.id);
      const loadedUsers = (result.data || [])
        .map((user) => ({
          ...user,
          id: Number(user.id),
          has_conversation: Number(user.has_conversation || 0),
        }))
        .filter((user) => user.id !== currentUserId);

      loadedUsers.sort((left, right) => {
        if (right.has_conversation !== left.has_conversation) {
          return right.has_conversation - left.has_conversation;
        }

        return String(left.username || '').localeCompare(String(right.username || ''));
      });
      setUsers(loadedUsers);

      setActiveUserId((previousId) => {
        if (loadedUsers.length === 0) {
          return null;
        }

        if (previousId && loadedUsers.some((user) => user.id === previousId)) {
          return previousId;
        }

        return loadedUsers[0].id;
      });
    } catch (err) {
      setChatError(err.message || 'Unable to connect to API');
    } finally {
      if (!silent) {
        setLoadingUsers(false);
      }
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
    if (!currentUser) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      fetchUsers({ silent: true });
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentUser, fetchUsers]);

  useEffect(() => {
    activeUserIdRef.current = activeUserId;
  }, [activeUserId]);

  useEffect(() => {
    if (!currentUser || !activeUser) {
      setMessages([]);
      setIsAtMessageBottom(true);
      return;
    }

    fetchMessages(currentUser.id, activeUser.id);
  }, [currentUser, activeUser, fetchMessages]);

  useEffect(() => {
    if (!activeUser || loadingMessages) {
      return;
    }

    const container = messagesAreaRef.current;
    if (!container) {
      return;
    }

    if (!isAtMessageBottom) {
      return;
    }

    window.requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    });
  }, [messages, activeUser, loadingMessages, isAtMessageBottom]);

  useEffect(() => {
    const sidebarTimer = window.setTimeout(() => {
      setIsSidebarScrollbarVisible(false);
    }, 3000);

    const messagesTimer = window.setTimeout(() => {
      setIsMessagesScrollbarVisible(false);
    }, 3000);

    return () => {
      window.clearTimeout(sidebarTimer);
      window.clearTimeout(messagesTimer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (sidebarHideTimerRef.current) {
        window.clearTimeout(sidebarHideTimerRef.current);
      }

      if (messagesHideTimerRef.current) {
        window.clearTimeout(messagesHideTimerRef.current);
      }
    };
  }, []);

  const bumpSidebarScrollbarVisibility = () => {
    setIsSidebarScrollbarVisible(true);

    if (sidebarHideTimerRef.current) {
      window.clearTimeout(sidebarHideTimerRef.current);
    }

    sidebarHideTimerRef.current = window.setTimeout(() => {
      setIsSidebarScrollbarVisible(false);
    }, 3000);
  };

  const bumpMessagesScrollbarVisibility = () => {
    setIsMessagesScrollbarVisible(true);

    if (messagesHideTimerRef.current) {
      window.clearTimeout(messagesHideTimerRef.current);
    }

    messagesHideTimerRef.current = window.setTimeout(() => {
      setIsMessagesScrollbarVisible(false);
    }, 3000);
  };

  const handleMessagesScroll = () => {
    const container = messagesAreaRef.current;
    if (!container) {
      return;
    }

    bumpMessagesScrollbarVisibility();

    const threshold = 14;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setIsAtMessageBottom(distanceFromBottom <= threshold);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }

    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!attachmentMenuRef.current) {
        return;
      }

      if (!attachmentMenuRef.current.contains(event.target)) {
        setIsAttachmentMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    if (authError) {
      pushNotification(authError, 'error');
    }
  }, [authError, pushNotification]);

  useEffect(() => {
    if (chatError) {
      pushNotification(chatError, 'error');
    }
  }, [chatError, pushNotification]);

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

          if (payload.type === 'users_refresh') {
            fetchUsers({ silent: true });
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
            message_type: String(packet.messageType || 'text'),
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
  }, [currentUser, socketUrl, fetchUsers]);

  const sendMessage = async (event) => {
    event.preventDefault();
    const trimmedDraft = draft.trim();

    if (!currentUser || !activeUser || (!trimmedDraft && !selectedAttachment)) {
      return;
    }

    if (selectedAttachment) {
      try {
        const payload = new FormData();
        payload.append('sender_id', String(currentUser.id));
        payload.append('receiver_id', String(activeUser.id));
        payload.append('message', trimmedDraft);
        payload.append('attachment_type', selectedAttachment.category);
        payload.append('attachment', selectedAttachment.file);

        const response = await fetch(`${apiBase}/messages.php`, {
          method: 'POST',
          body: payload,
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Failed to send attachment');
        }

        const savedMessage = result.data
          ? {
              ...result.data,
              id: Number(result.data.id),
              sender_id: Number(result.data.sender_id),
              receiver_id: Number(result.data.receiver_id),
              message: String(result.data.message || ''),
              message_type: String(result.data.message_type || 'file'),
              created_at: result.data.created_at || new Date().toISOString(),
            }
          : null;

        if (savedMessage) {
          setMessages((previous) => {
            const exists = previous.some((item) => item.id === savedMessage.id);
            if (exists) {
              return previous;
            }

            return [...previous, savedMessage];
          });

          const socket = socketRef.current;
          const canRelayWithSocket = socket && socket.readyState === WebSocket.OPEN;
          if (canRelayWithSocket) {
            socket.send(
              JSON.stringify({
                type: 'relay_message',
                id: savedMessage.id,
                receiverId: savedMessage.receiver_id,
                message: savedMessage.message,
                messageType: savedMessage.message_type,
                createdAt: savedMessage.created_at,
              })
            );
          }
        }

        setDraft('');
        setSelectedAttachment(null);
        setIsAttachmentMenuOpen(false);

        if (!savedMessage) {
          fetchMessages(currentUser.id, activeUser.id);
        }
      } catch (err) {
        setChatError(err.message || 'Failed to send attachment');
      }

      return;
    }

    const text = trimmedDraft;
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
    setSelectedAttachment(null);
    setIsAttachmentMenuOpen(false);
    setActiveUserId(null);
    setChatError('');
  };

  const getAttachmentPreview = (message) => {
    const type = String(message?.message_type || 'text');
    if (type !== 'image' && type !== 'file') {
      return null;
    }

    const raw = String(message?.message || '').trim();
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      return {
        type,
        url: typeof parsed.url === 'string' ? parsed.url : '',
        name: typeof parsed.name === 'string' ? parsed.name : 'Attachment',
        caption: typeof parsed.caption === 'string' ? parsed.caption : '',
      };
    } catch {
      return {
        type,
        url: raw,
        name: raw.split('/').pop() || 'Attachment',
        caption: '',
      };
    }
  };

  const openAttachmentPicker = (category) => {
    setIsAttachmentMenuOpen(false);

    if (category === 'image' && imageAttachmentInputRef.current) {
      imageAttachmentInputRef.current.click();
      return;
    }

    if (category === 'file' && fileAttachmentInputRef.current) {
      fileAttachmentInputRef.current.click();
    }
  };

  const handleAttachmentSelected = (event, category) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    const maxBytes = 12 * 1024 * 1024;
    if (file.size > maxBytes) {
      setChatError('File size must be 12MB or less');
      event.target.value = '';
      return;
    }

    setSelectedAttachment({
      category,
      file,
    });

    event.target.value = '';
  };

  const formatTime = (dateString) => {
    if (!dateString) {
      return '';
    }

    const raw = String(dateString).trim();
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
      ? `${raw.replace(' ', 'T')}Z`
      : raw;

    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return raw;
    }

    return date.toLocaleTimeString('en-LK', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Colombo',
    });
  };

  const formatLastSeenText = (dateString, isOnline = false) => {
    if (isOnline) {
      return 'online';
    }

    if (!dateString) {
      return 'last seen recently';
    }

    const raw = String(dateString).trim();
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
      ? `${raw.replace(' ', 'T')}Z`
      : raw;

    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return 'last seen recently';
    }

    const timeText = date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Colombo',
    });

    const todayText = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Colombo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const dateText = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Colombo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);

    if (dateText === todayText) {
      return `last seen today at ${timeText}`;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayText = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Colombo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(yesterday);

    if (dateText === yesterdayText) {
      return `last seen yesterday at ${timeText}`;
    }

    const calendarText = date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Colombo',
    });

    return `last seen on ${calendarText} at ${timeText}`;
  };

  const toggleTheme = () => {
    setTheme((previousTheme) => (previousTheme === 'light' ? 'dark' : 'light'));
  };

  const handleProfileSaved = (updatedUser) => {
    if (!updatedUser || !updatedUser.id) {
      return;
    }

    setCurrentUser((previousUser) => {
      if (!previousUser || previousUser.id !== updatedUser.id) {
        return previousUser;
      }

      return {
        ...previousUser,
        ...updatedUser,
      };
    });

    setUsers((previousUsers) =>
      previousUsers.map((user) => (user.id === updatedUser.id ? { ...user, ...updatedUser } : user))
    );
  };

  if (!currentUser) {
    return (
      <div className={`chat-shell auth-shell theme-${theme}`}>
        <Notification items={notifications} onDismiss={dismissNotification} />
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
      <Notification items={notifications} onDismiss={dismissNotification} />
      <div className="glow-layer glow-one" />
      <div className="glow-layer glow-two" />

      <main className="chat-layout">
        <aside
          className={`chat-sidebar ${isSidebarScrollbarVisible ? 'show-scrollbar' : 'hide-scrollbar'}`}
          onScroll={bumpSidebarScrollbarVisibility}
        >
          <div className="profile-card">
            <div className="profile-card-head">
              {renderAvatar(currentUser, 'avatar avatar-large')}
              <div>
                <p className="label">Signed in as</p>
                <h2>{currentUser ? currentUser.username : 'Loading...'}</h2>
                <p>{currentUser ? currentUser.email : 'Fetching profile'}</p>
              </div>
            </div>
            <p className="profile-bio">
              {currentUser && currentUser.bio
                ? currentUser.bio
                : 'No bio yet. Add one from Edit Profile.'}
            </p>
            <Profile currentUser={currentUser} apiBase={apiBase} onSaved={handleProfileSaved} />
          </div>

          <div className="contacts-wrap">
            <div className="contacts-header">
              <h3>Contacts</h3>
              <span>{users.length}</span>
            </div>

            {loadingUsers ? <p className="helper-text">Loading users...</p> : null}
            {!loadingUsers && users.length === 0 ? (
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
                    {renderAvatar(user)}
                    <div className="contact-meta">
                      <p>{user.username}</p>
                      <small>{formatLastSeenText(user.last_seen, user.status === 'online')}</small>
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
              {activeUser ? (
                <p className="active-user-presence">
                  {formatLastSeenText(activeUser.last_seen, activeUser.status === 'online')}
                </p>
              ) : null}
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

          <div
            className={`messages-area ${isMessagesScrollbarVisible ? 'show-scrollbar' : 'hide-scrollbar'}`}
            ref={messagesAreaRef}
            onScroll={handleMessagesScroll}
          >
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
              const attachment = getAttachmentPreview(message);

              return (
                <article key={message.id} className={`message-row ${isOwn ? 'own' : 'other'}`}>
                  <div className="bubble">
                    {attachment && attachment.type === 'image' && attachment.url ? (
                      <a
                        className="attachment-link image"
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img src={attachment.url} alt={attachment.name} loading="lazy" />
                      </a>
                    ) : null}

                    {attachment && attachment.type === 'file' && attachment.url ? (
                      <a
                        className="attachment-link file"
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {attachment.name}
                      </a>
                    ) : null}

                    {attachment ? (
                      attachment.caption ? <p>{attachment.caption}</p> : null
                    ) : (
                      <p>{message.message}</p>
                    )}
                    <span>{formatTime(message.created_at)}</span>
                  </div>
                </article>
              );
            })}
          </div>

          <form className="composer" onSubmit={sendMessage}>
            <div className="attachment-menu-wrap" ref={attachmentMenuRef}>
              <button
                type="button"
                className="attachment-toggle"
                onClick={() => setIsAttachmentMenuOpen((previous) => !previous)}
                disabled={!activeUser}
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
              placeholder={activeUser ? `Message ${activeUser.username}...` : 'Select a user first'}
              disabled={!activeUser}
            />
            {selectedAttachment ? (
              <div className="attachment-chip" title={selectedAttachment.file.name}>
                <span>{selectedAttachment.file.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedAttachment(null)}
                  aria-label="Remove attachment"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            ) : null}

            <button type="submit" disabled={!activeUser || (!draft.trim() && !selectedAttachment)}>
              <FontAwesomeIcon icon={faPaperPlane} />
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

export default App;
