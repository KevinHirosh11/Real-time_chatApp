import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import RegisterPage from './components/RegisterPage';
import Notification from './components/notification';
import Profile from './components/profile';
import TaskTracker from './components/TaskTracker';
import MilestoneTracker from './components/MilestoneTracker';
import BeeAiPanel from './components/beeai';
import EmojiPicker, { EMOJI_SETS } from './components/emojis';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPaperPlane,
  faPlus,
  faXmark,
  faLock,
  faCheck,
  faStar,
  faRightFromBracket,
  faUserGroup,
  faListCheck,
  faEllipsisVertical,
  faChevronDown,
  faPenToSquare,
  faTrash,
  faChartLine,
  faFaceSmile,
} from '@fortawesome/free-solid-svg-icons';

const THEME_STORAGE_KEY = 'chat_app_theme';
const GROUPS_STORAGE_PREFIX = 'chat_app_groups';
const GROUP_MESSAGES_STORAGE_PREFIX = 'chat_app_group_messages';
const TASKS_STORAGE_PREFIX = 'chat_app_tasks';
const STARRED_MESSAGES_STORAGE_PREFIX = 'chat_app_starred_messages';
const APP_LOCK_DEFAULT_PIN = '1234';

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
  const [activeChatMode, setActiveChatMode] = useState('direct');
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [groupMessagesById, setGroupMessagesById] = useState({});
  const [tasks, setTasks] = useState([]);
  const [starredMessageKeys, setStarredMessageKeys] = useState({});
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false);
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    image: '',
    memberIds: [],
    adminIds: [],
    onlyAdminsCanMessage: false,
    onlyAdminsCanEdit: true,
  });
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
  const [isEmojiMenuOpen, setIsEmojiMenuOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [activeMessageMenu, setActiveMessageMenu] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [lockPinInput, setLockPinInput] = useState('');
  const [lockError, setLockError] = useState('');

  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const activeUserIdRef = useRef(null);
  const messagesAreaRef = useRef(null);
  const attachmentMenuRef = useRef(null);
  const emojiMenuRef = useRef(null);
  const quickActionsMenuRef = useRef(null);
  const messageActionsMenuRef = useRef(null);
  const draftInputRef = useRef(null);
  const imageAttachmentInputRef = useRef(null);
  const fileAttachmentInputRef = useRef(null);
  const sidebarHideTimerRef = useRef(null);
  const messagesHideTimerRef = useRef(null);
  const [isSidebarScrollbarVisible, setIsSidebarScrollbarVisible] = useState(true);
  const [isMessagesScrollbarVisible, setIsMessagesScrollbarVisible] = useState(true);

  const activeUser = users.find((user) => user.id === activeUserId) || null;
  const activeGroup = groups.find((group) => group.id === activeGroupId) || null;
  const isGroupChatActive = activeChatMode === 'group' && Boolean(activeGroup);
  const isTaskTrackingActive = activeChatMode === 'task';
  const isStarredViewActive = activeChatMode === 'starred';
  const isMilestoneTrackingActive = activeChatMode === 'milestone';
  const isBeeAiActive = activeChatMode === 'beeai';
  const isEditingMessage = Boolean(editingMessage);
  const visibleMessages = useMemo(() => {
    return isGroupChatActive ? groupMessagesById[activeGroup.id] || [] : messages;
  }, [isGroupChatActive, groupMessagesById, activeGroup, messages]);

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

  const getGroupsStorageKey = useCallback((userId) => {
    return `${GROUPS_STORAGE_PREFIX}_${userId}`;
  }, []);

  const getGroupMessagesStorageKey = useCallback((userId) => {
    return `${GROUP_MESSAGES_STORAGE_PREFIX}_${userId}`;
  }, []);

  const getTasksStorageKey = useCallback((userId) => {
    return `${TASKS_STORAGE_PREFIX}_${userId}`;
  }, []);

  const getStarredMessagesStorageKey = useCallback((userId) => {
    return `${STARRED_MESSAGES_STORAGE_PREFIX}_${userId}`;
  }, []);

  const isGroupAdmin = useCallback(
    (group) => {
      if (!group || !currentUser) {
        return false;
      }

      return Array.isArray(group.adminIds) && group.adminIds.includes(Number(currentUser.id));
    },
    [currentUser]
  );

  const isCurrentUserInActiveGroup =
    Boolean(activeGroup && currentUser) &&
    Array.isArray(activeGroup.memberIds) &&
    activeGroup.memberIds.includes(Number(currentUser.id));

  const canCurrentUserEditGroup =
    Boolean(activeGroup) &&
    (activeGroup?.permissions?.onlyAdminsCanEdit ? isGroupAdmin(activeGroup) : isCurrentUserInActiveGroup);

  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') {
      setGroups([]);
      setGroupMessagesById({});
      setTasks([]);
      setStarredMessageKeys({});
      setActiveGroupId(null);
      return;
    }

    try {
      const storedGroupsRaw = window.localStorage.getItem(getGroupsStorageKey(currentUser.id));
      const storedMessagesRaw = window.localStorage.getItem(getGroupMessagesStorageKey(currentUser.id));
      const storedTasksRaw = window.localStorage.getItem(getTasksStorageKey(currentUser.id));
      const storedStarredRaw = window.localStorage.getItem(getStarredMessagesStorageKey(currentUser.id));

      const parsedGroups = storedGroupsRaw ? JSON.parse(storedGroupsRaw) : [];
      const parsedMessages = storedMessagesRaw ? JSON.parse(storedMessagesRaw) : {};
      const parsedTasks = storedTasksRaw ? JSON.parse(storedTasksRaw) : [];
      const parsedStarred = storedStarredRaw ? JSON.parse(storedStarredRaw) : {};

      setGroups(Array.isArray(parsedGroups) ? parsedGroups : []);
      setGroupMessagesById(parsedMessages && typeof parsedMessages === 'object' ? parsedMessages : {});
      setTasks(Array.isArray(parsedTasks) ? parsedTasks : []);
      setStarredMessageKeys(parsedStarred && typeof parsedStarred === 'object' ? parsedStarred : {});
      setActiveGroupId((previousId) => {
        if (previousId && Array.isArray(parsedGroups) && parsedGroups.some((group) => group.id === previousId)) {
          return previousId;
        }

        if (Array.isArray(parsedGroups) && parsedGroups.length > 0) {
          return parsedGroups[0].id;
        }

        return null;
      });
    } catch {
      setGroups([]);
      setGroupMessagesById({});
      setTasks([]);
      setStarredMessageKeys({});
      setActiveGroupId(null);
    }
  }, [
    currentUser,
    getGroupsStorageKey,
    getGroupMessagesStorageKey,
    getTasksStorageKey,
    getStarredMessagesStorageKey,
  ]);

  useEffect(() => {
    setActiveMessageMenu(null);
    setEditingMessage(null);
  }, [activeChatMode, activeUserId, activeGroupId, currentUser]);

  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(getGroupsStorageKey(currentUser.id), JSON.stringify(groups));
  }, [groups, currentUser, getGroupsStorageKey]);

  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      getGroupMessagesStorageKey(currentUser.id),
      JSON.stringify(groupMessagesById)
    );
  }, [groupMessagesById, currentUser, getGroupMessagesStorageKey]);

  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(getTasksStorageKey(currentUser.id), JSON.stringify(tasks));
  }, [tasks, currentUser, getTasksStorageKey]);

  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      getStarredMessagesStorageKey(currentUser.id),
      JSON.stringify(starredMessageKeys)
    );
  }, [starredMessageKeys, currentUser, getStarredMessagesStorageKey]);

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
    if (groups.length === 0) {
      setActiveGroupId(null);
      if (activeChatMode === 'group') {
        setActiveChatMode('direct');
      }
      return;
    }

    if (activeGroupId && groups.some((group) => group.id === activeGroupId)) {
      return;
    }

    setActiveGroupId(groups[0].id);
  }, [groups, activeGroupId, activeChatMode]);

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
    if (!currentUser || !activeUser || isGroupChatActive) {
      setMessages([]);
      setIsAtMessageBottom(true);
      return;
    }

    fetchMessages(currentUser.id, activeUser.id);
  }, [currentUser, activeUser, fetchMessages, isGroupChatActive]);

  useEffect(() => {
    if ((!activeUser && !isGroupChatActive) || loadingMessages) {
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
  }, [visibleMessages, activeUser, isGroupChatActive, loadingMessages, isAtMessageBottom]);

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
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(event.target)) {
        setIsAttachmentMenuOpen(false);
      }

      if (emojiMenuRef.current && !emojiMenuRef.current.contains(event.target)) {
        setIsEmojiMenuOpen(false);
      }

      if (quickActionsMenuRef.current && !quickActionsMenuRef.current.contains(event.target)) {
        setIsQuickActionsOpen(false);
      }

      if (messageActionsMenuRef.current && !messageActionsMenuRef.current.contains(event.target)) {
        setActiveMessageMenu(null);
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
            if (payload.message === 'Unsupported message type') {
              return;
            }

            setChatError(payload.message || 'Socket error');
            return;
          }

          if (payload.type === 'users_refresh') {
            fetchUsers({ silent: true });
            return;
          }

          if (payload.type === 'group_message') {
            const packet = payload.data || {};
            const incomingGroup = packet.group && typeof packet.group === 'object' ? packet.group : {};
            const incomingGroupId = String(packet.groupId || incomingGroup.id || '').trim();
            const incomingSenderId = Number(packet.senderId || 0);
            const incomingMemberIds = Array.isArray(incomingGroup.memberIds)
              ? incomingGroup.memberIds.map((id) => Number(id)).filter((id) => id > 0)
              : [];

            if (!incomingGroupId || incomingSenderId <= 0) {
              return;
            }

            if (!incomingMemberIds.includes(Number(currentUser.id))) {
              return;
            }

            const normalizedGroup = {
              id: incomingGroupId,
              name: String(incomingGroup.name || 'Group'),
              description: String(incomingGroup.description || ''),
              image: String(incomingGroup.image || ''),
              memberIds: incomingMemberIds,
              adminIds: Array.isArray(incomingGroup.adminIds)
                ? incomingGroup.adminIds.map((id) => Number(id)).filter((id) => id > 0)
                : [incomingSenderId],
              permissions:
                incomingGroup.permissions && typeof incomingGroup.permissions === 'object'
                  ? incomingGroup.permissions
                  : { onlyAdminsCanMessage: false, onlyAdminsCanEdit: true },
              createdBy: Number(incomingGroup.createdBy || incomingSenderId),
            };

            setGroups((previous) => {
              const existingIndex = previous.findIndex((group) => group.id === incomingGroupId);
              if (existingIndex === -1) {
                return [normalizedGroup, ...previous];
              }

              const next = [...previous];
              next[existingIndex] = { ...next[existingIndex], ...normalizedGroup };
              return next;
            });

            const nextGroupMessage = {
              id: Number(packet.id || Date.now()),
              sender_id: incomingSenderId,
              receiver_id: 0,
              message: String(packet.message || ''),
              message_type: String(packet.messageType || 'text'),
              created_at: String(packet.createdAt || new Date().toISOString()),
            };

            setGroupMessagesById((previous) => {
              const existingMessages = previous[incomingGroupId] || [];
              const exists = existingMessages.some((message) => Number(message.id) === Number(nextGroupMessage.id));
              if (exists) {
                return previous;
              }

              return {
                ...previous,
                [incomingGroupId]: [...existingMessages, nextGroupMessage],
              };
            });

            return;
          }

          if (payload.type === 'group_message_update') {
            const packet = payload.data || {};
            const incomingGroup = packet.group && typeof packet.group === 'object' ? packet.group : {};
            const incomingGroupId = String(packet.groupId || incomingGroup.id || '').trim();
            const incomingMessageId = Number(packet.id || 0);
            const incomingSenderId = Number(packet.senderId || 0);

            if (!incomingGroupId || incomingMessageId <= 0 || incomingSenderId <= 0) {
              return;
            }

            updateGroupMessageLocally(incomingGroupId, incomingMessageId, {
              message: String(packet.message || ''),
              message_type: String(packet.messageType || 'text'),
            });

            if (editingMessage?.message?.id === incomingMessageId) {
              setEditingMessage(null);
              setDraft('');
            }

            setActiveMessageMenu(null);
            return;
          }

          if (payload.type === 'group_message_delete') {
            const packet = payload.data || {};
            const incomingGroup = packet.group && typeof packet.group === 'object' ? packet.group : {};
            const incomingGroupId = String(packet.groupId || incomingGroup.id || '').trim();
            const incomingMessageId = Number(packet.id || 0);
            const incomingSenderId = Number(packet.senderId || 0);

            if (!incomingGroupId || incomingMessageId <= 0 || incomingSenderId <= 0) {
              return;
            }

            deleteGroupMessageLocally(incomingGroupId, incomingMessageId);
            removeStarForMessage(
              {
                id: incomingMessageId,
                sender_id: incomingSenderId,
                created_at: packet.createdAt || new Date().toISOString(),
              },
              { groupId: incomingGroupId }
            );

            if (editingMessage?.message?.id === incomingMessageId) {
              setEditingMessage(null);
              setDraft('');
            }

            setActiveMessageMenu(null);
            return;
          }

          if (payload.type === 'message_update' || payload.type === 'message_delete') {
            const packet = payload.data || {};
            const incomingMessageId = Number(packet.id || 0);
            const incomingSenderId = Number(packet.senderId || 0);
            const incomingReceiverId = Number(packet.receiverId || 0);
            const peerId = activeUserIdRef.current;
            const isCurrentConversation =
              peerId &&
              ((incomingSenderId === currentUser.id && incomingReceiverId === peerId) ||
                (incomingSenderId === peerId && incomingReceiverId === currentUser.id));

            if (!isCurrentConversation || incomingMessageId <= 0 || incomingSenderId <= 0 || incomingReceiverId <= 0) {
              return;
            }

            if (payload.type === 'message_update') {
              setMessages((previous) =>
                previous.map((message) =>
                  Number(message.id) === incomingMessageId
                    ? {
                        ...message,
                        message: String(packet.message || ''),
                        message_type: String(packet.messageType || message.message_type || 'text'),
                        created_at: packet.createdAt || message.created_at,
                      }
                    : message
                )
              );

              if (editingMessage?.message?.id === incomingMessageId) {
                setEditingMessage(null);
                setDraft('');
              }

              setActiveMessageMenu(null);
              return;
            }

            setMessages((previous) => previous.filter((message) => Number(message.id) !== incomingMessageId));
            removeStarForMessage(
              {
                id: incomingMessageId,
                sender_id: incomingSenderId,
                created_at: packet.createdAt || new Date().toISOString(),
              },
              { peerId: incomingReceiverId }
            );

            if (editingMessage?.message?.id === incomingMessageId) {
              setEditingMessage(null);
              setDraft('');
            }

            setActiveMessageMenu(null);
            return;
          }

          if (payload.type !== 'new_message' && payload.type !== 'message_sent') {
            return;
          }

          const packet = payload.data || {};

          if (String(packet.messageType || '') === 'group_meta') {
            try {
              const encoded = JSON.parse(String(packet.message || '{}'));
              const incomingGroup = encoded.group && typeof encoded.group === 'object' ? encoded.group : null;
              const action = String(encoded.action || 'upsert');

              if (!incomingGroup || !incomingGroup.id) {
                return;
              }

              const normalizedGroup = {
                id: String(incomingGroup.id),
                name: String(incomingGroup.name || 'Group'),
                description: String(incomingGroup.description || ''),
                image: String(incomingGroup.image || ''),
                memberIds: Array.isArray(incomingGroup.memberIds)
                  ? incomingGroup.memberIds.map((id) => Number(id)).filter((id) => id > 0)
                  : [],
                adminIds: Array.isArray(incomingGroup.adminIds)
                  ? incomingGroup.adminIds.map((id) => Number(id)).filter((id) => id > 0)
                  : [],
                permissions:
                  incomingGroup.permissions && typeof incomingGroup.permissions === 'object'
                    ? incomingGroup.permissions
                    : { onlyAdminsCanMessage: false, onlyAdminsCanEdit: true },
                createdBy: Number(incomingGroup.createdBy || 0),
              };

              if (!normalizedGroup.memberIds.includes(Number(currentUser.id))) {
                return;
              }

              if (action === 'remove') {
                setGroups((previous) => previous.filter((group) => group.id !== normalizedGroup.id));
                return;
              }

              setGroups((previous) => {
                const existingIndex = previous.findIndex((group) => group.id === normalizedGroup.id);
                if (existingIndex === -1) {
                  return [normalizedGroup, ...previous];
                }

                const next = [...previous];
                next[existingIndex] = { ...next[existingIndex], ...normalizedGroup };
                return next;
              });
            } catch {
              setChatError('Received invalid group metadata payload');
            }

            return;
          }

          if (String(packet.messageType || '') === 'group') {
            try {
              const encoded = JSON.parse(String(packet.message || '{}'));
              const incomingGroup = encoded.group && typeof encoded.group === 'object' ? encoded.group : {};
              const incomingGroupId = String(encoded.groupId || incomingGroup.id || '').trim();
              const incomingSenderId = Number(packet.senderId || 0);
              const incomingMemberIds = Array.isArray(incomingGroup.memberIds)
                ? incomingGroup.memberIds.map((id) => Number(id)).filter((id) => id > 0)
                : [];

              if (!incomingGroupId || incomingSenderId <= 0) {
                return;
              }

              if (!incomingMemberIds.includes(Number(currentUser.id))) {
                return;
              }

              const normalizedGroup = {
                id: incomingGroupId,
                name: String(incomingGroup.name || 'Group'),
                description: String(incomingGroup.description || ''),
                image: String(incomingGroup.image || ''),
                memberIds: incomingMemberIds,
                adminIds: Array.isArray(incomingGroup.adminIds)
                  ? incomingGroup.adminIds.map((id) => Number(id)).filter((id) => id > 0)
                  : [incomingSenderId],
                permissions:
                  incomingGroup.permissions && typeof incomingGroup.permissions === 'object'
                    ? incomingGroup.permissions
                    : { onlyAdminsCanMessage: false, onlyAdminsCanEdit: true },
                createdBy: Number(incomingGroup.createdBy || incomingSenderId),
              };

              setGroups((previous) => {
                const existingIndex = previous.findIndex((group) => group.id === incomingGroupId);
                if (existingIndex === -1) {
                  return [normalizedGroup, ...previous];
                }

                const next = [...previous];
                next[existingIndex] = { ...next[existingIndex], ...normalizedGroup };
                return next;
              });

              const nextGroupMessage = {
                id: Number(packet.id || Date.now()),
                sender_id: incomingSenderId,
                receiver_id: 0,
                message: String(encoded.text || ''),
                message_type: 'text',
                created_at: String(packet.createdAt || new Date().toISOString()),
              };

              setGroupMessagesById((previous) => {
                const existingMessages = previous[incomingGroupId] || [];
                const exists = existingMessages.some((message) => Number(message.id) === Number(nextGroupMessage.id));
                if (exists) {
                  return previous;
                }

                return {
                  ...previous,
                  [incomingGroupId]: [...existingMessages, nextGroupMessage],
                };
              });
            } catch {
              setChatError('Received invalid group message payload');
            }

            return;
          }

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

    if (isEditingMessage) {
      if (!trimmedDraft) {
        setChatError('Message cannot be empty');
        return;
      }

      const messageToEdit = editingMessage?.message || null;
      const editOptions = editingMessage?.options || {};

      if (!messageToEdit) {
        setEditingMessage(null);
        return;
      }

      const nextMessageBody = buildEditedMessageBody(messageToEdit, trimmedDraft);

      try {
        if (editOptions.groupId) {
          updateGroupMessageLocally(editOptions.groupId, messageToEdit.id, {
            message: nextMessageBody,
            message_type: String(messageToEdit.message_type || 'text'),
          });

          const socket = socketRef.current;
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                type: 'group_message_update',
                id: Number(messageToEdit.id),
                senderId: Number(currentUser.id),
                groupId: String(editOptions.groupId),
                message: nextMessageBody,
                messageType: String(messageToEdit.message_type || 'text'),
                createdAt: messageToEdit.created_at,
                group: activeGroup
                  ? {
                      id: activeGroup.id,
                      name: activeGroup.name,
                      description: activeGroup.description,
                      image: activeGroup.image,
                      memberIds: activeGroup.memberIds,
                      adminIds: activeGroup.adminIds,
                      permissions: activeGroup.permissions,
                      createdBy: activeGroup.createdBy,
                    }
                  : null,
              })
            );
          }
        } else {
          const response = await fetch(`${apiBase}/messages.php`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: Number(messageToEdit.id),
              sender_id: Number(currentUser.id),
              receiver_id: Number(editOptions.peerId || activeUser?.id || 0),
              message: nextMessageBody,
            }),
          });

          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to update message');
          }

          const updatedMessage = result.data
            ? {
                ...messageToEdit,
                ...result.data,
                id: Number(result.data.id || messageToEdit.id),
                sender_id: Number(result.data.sender_id || messageToEdit.sender_id),
                receiver_id: Number(result.data.receiver_id || messageToEdit.receiver_id),
                message: String(result.data.message || nextMessageBody),
                message_type: String(result.data.message_type || messageToEdit.message_type || 'text'),
                created_at: result.data.created_at || messageToEdit.created_at,
              }
            : {
                ...messageToEdit,
                message: nextMessageBody,
              };

          setMessages((previous) =>
            previous.map((item) => (item.id === updatedMessage.id ? { ...item, ...updatedMessage } : item))
          );

          const socket = socketRef.current;
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                type: 'message_update',
                id: Number(updatedMessage.id),
                senderId: Number(currentUser.id),
                receiverId: Number(editOptions.peerId || activeUser?.id || 0),
                message: String(updatedMessage.message || nextMessageBody),
                messageType: String(updatedMessage.message_type || 'text'),
                createdAt: updatedMessage.created_at,
              })
            );
          }
        }

        setDraft('');
        setEditingMessage(null);
        setActiveMessageMenu(null);
        setSelectedAttachment(null);
        setIsAttachmentMenuOpen(false);
        setIsEmojiMenuOpen(false);
      } catch (err) {
        setChatError(err.message || 'Failed to update message');
      }

      return;
    }

    if (!currentUser || (!activeUser && !isGroupChatActive) || (!trimmedDraft && !selectedAttachment)) {
      return;
    }

    if (isGroupChatActive) {
      if (activeGroup.permissions?.onlyAdminsCanMessage && !isGroupAdmin(activeGroup)) {
        setChatError('Only group admins can send messages in this group');
        return;
      }

      const messageText = trimmedDraft || `Attachment: ${selectedAttachment.file.name}`;
      const groupMessageId = Date.now();
      const groupCreatedAt = new Date().toISOString();
      const nextMessage = {
        id: groupMessageId,
        sender_id: Number(currentUser.id),
        receiver_id: 0,
        message: messageText,
        message_type: 'text',
        created_at: groupCreatedAt,
      };

      setGroupMessagesById((previous) => {
        const existingGroupMessages = previous[activeGroup.id] || [];
        return {
          ...previous,
          [activeGroup.id]: [...existingGroupMessages, nextMessage],
        };
      });

      setDraft('');
      setSelectedAttachment(null);
      setIsAttachmentMenuOpen(false);
      setIsEmojiMenuOpen(false);
      setActiveMessageMenu(null);

      const socket = socketRef.current;
      const canSendWithSocket = socket && socket.readyState === WebSocket.OPEN;
      if (canSendWithSocket) {
        const groupEnvelope = JSON.stringify({
          groupId: activeGroup.id,
          text: messageText,
          group: {
            id: activeGroup.id,
            name: activeGroup.name,
            description: activeGroup.description,
            image: activeGroup.image,
            memberIds: activeGroup.memberIds,
            adminIds: activeGroup.adminIds,
            permissions: activeGroup.permissions,
            createdBy: activeGroup.createdBy,
          },
        });

        (activeGroup.memberIds || [])
          .map((id) => Number(id))
          .filter((id) => id > 0 && id !== Number(currentUser.id))
          .forEach((memberId) => {
            socket.send(
              JSON.stringify({
                type: 'relay_message',
                id: groupMessageId,
                receiverId: memberId,
                message: groupEnvelope,
                messageType: 'group',
                createdAt: groupCreatedAt,
              })
            );
          });
      }

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
        setIsEmojiMenuOpen(false);
        setActiveMessageMenu(null);

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
      setIsEmojiMenuOpen(false);
      setActiveMessageMenu(null);
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
      setIsEmojiMenuOpen(false);
      setActiveMessageMenu(null);
      fetchMessages(currentUser.id, activeUser.id);
    } catch (err) {
      setChatError(err.message || 'Failed to send message');
    }
  };

  const openBeeAiAssistant = () => {
    setActiveChatMode('beeai');
    setActiveGroupId(null);
    setActiveUserId(null);
    setSelectedAttachment(null);
    setIsAttachmentMenuOpen(false);
    setIsEmojiMenuOpen(false);
    setDraft('');
    setChatError('');
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
    setGroups([]);
    setGroupMessagesById({});
    setTasks([]);
    setStarredMessageKeys({});
    setActiveGroupId(null);
    setActiveChatMode('direct');
    setDraft('');
    setSelectedAttachment(null);
    setIsAttachmentMenuOpen(false);
    setIsEmojiMenuOpen(false);
    setIsCreateGroupOpen(false);
    setIsGroupSettingsOpen(false);
    setActiveUserId(null);
    setChatError('');
    setIsAppLocked(false);
    setLockPinInput('');
    setLockError('');
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

  const buildMessageActionKey = (message, { groupId = null, peerId = null } = {}) => {
    const scope = groupId ? `group:${String(groupId)}` : `direct:${String(peerId || 'active')}`;
    return `${scope}:${String(message?.id || 'unknown')}`;
  };

  const getEditableMessageText = (message) => {
    const attachment = getAttachmentPreview(message);
    if (attachment) {
      return String(attachment.caption || '');
    }

    return String(message?.message || '');
  };

  const buildEditedMessageBody = (message, nextText) => {
    const attachment = getAttachmentPreview(message);

    if (attachment) {
      return JSON.stringify({
        url: attachment.url,
        name: attachment.name,
        size: attachment.size,
        caption: nextText,
      });
    }

    return nextText;
  };

  const updateGroupMessageLocally = (groupId, messageId, nextFields) => {
    if (!groupId) {
      return;
    }

    setGroupMessagesById((previous) => {
      const currentGroupMessages = previous[groupId] || [];
      return {
        ...previous,
        [groupId]: currentGroupMessages.map((message) =>
          Number(message.id) === Number(messageId) ? { ...message, ...nextFields } : message
        ),
      };
    });
  };

  const deleteGroupMessageLocally = (groupId, messageId) => {
    if (!groupId) {
      return;
    }

    setGroupMessagesById((previous) => {
      const currentGroupMessages = previous[groupId] || [];
      return {
        ...previous,
        [groupId]: currentGroupMessages.filter((message) => Number(message.id) !== Number(messageId)),
      };
    });
  };

  const deleteDirectMessageLocally = (messageId) => {
    setMessages((previous) => previous.filter((message) => Number(message.id) !== Number(messageId)));
  };

  const removeStarForMessage = (message, options = {}) => {
    const key = buildMessageStarKey(message, options);
    setStarredMessageKeys((previous) => {
      if (!previous[key]) {
        return previous;
      }

      const { [key]: _, ...rest } = previous;
      return rest;
    });
  };

  const openMessageMenu = (message, options = {}) => {
    const key = buildMessageActionKey(message, options);
    setActiveMessageMenu((previous) => (previous?.key === key ? null : { key, options }));
  };

  const startEditingMessage = (message, options = {}) => {
    setEditingMessage({ message, options });
    setDraft(getEditableMessageText(message));
    setSelectedAttachment(null);
    setIsAttachmentMenuOpen(false);
    setIsEmojiMenuOpen(false);
    setActiveMessageMenu(null);
  };

  const handleToggleMessageStar = (message, options = {}) => {
    toggleMessageStar(message, options);
    setActiveMessageMenu(null);
  };

  const handleDeleteMessage = async (message, options = {}) => {
    const shouldDelete = window.confirm('Delete this message?');
    if (!shouldDelete) {
      return;
    }

    try {
      if (options.groupId) {
        deleteGroupMessageLocally(options.groupId, message.id);
        removeStarForMessage(message, options);

        const socket = socketRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'group_message_delete',
              id: Number(message.id),
              senderId: Number(currentUser?.id || 0),
              groupId: String(options.groupId),
              createdAt: message.created_at,
              group: activeGroup
                ? {
                    id: activeGroup.id,
                    name: activeGroup.name,
                    description: activeGroup.description,
                    image: activeGroup.image,
                    memberIds: activeGroup.memberIds,
                    adminIds: activeGroup.adminIds,
                    permissions: activeGroup.permissions,
                    createdBy: activeGroup.createdBy,
                  }
                : null,
            })
          );
        }
      } else {
        const response = await fetch(`${apiBase}/messages.php`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: Number(message.id),
            sender_id: Number(currentUser?.id || 0),
            receiver_id: Number(options.peerId || activeUser?.id || 0),
          }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Failed to delete message');
        }

        deleteDirectMessageLocally(message.id);
        removeStarForMessage(message, options);

        const socket = socketRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'message_delete',
              id: Number(message.id),
              senderId: Number(currentUser?.id || 0),
              receiverId: Number(options.peerId || activeUser?.id || 0),
              createdAt: message.created_at,
            })
          );
        }
      }

      if (editingMessage?.message?.id === message.id) {
        setEditingMessage(null);
        setDraft('');
      }

      setActiveMessageMenu(null);
      setIsAttachmentMenuOpen(false);
      setIsEmojiMenuOpen(false);
    } catch (err) {
      setChatError(err.message || 'Failed to delete message');
    }
  };

  const renderMessageCard = ({
    message,
    isOwn,
    conversationOptions = {},
    contextLabel = '',
    senderName = '',
    showSenderName = false,
  }) => {
    const attachment = getAttachmentPreview(message);
    const starKey = buildMessageStarKey(message, conversationOptions);
    const isStarred = Boolean(starredMessageKeys[starKey]);
    const menuKey = buildMessageActionKey(message, conversationOptions);
    const isMenuOpen = activeMessageMenu?.key === menuKey;
    const canEditOrDelete = Boolean(currentUser && isOwn);

    return (
      <article
        key={message.id}
        className={`message-row ${isOwn ? 'own' : 'other'} ${isMenuOpen ? 'menu-open' : ''}`}
      >
        <div className="bubble">
          <div className="message-actions-wrap" ref={isMenuOpen ? messageActionsMenuRef : null}>
            <button
              type="button"
              className="message-actions-toggle"
              onClick={() => openMessageMenu(message, conversationOptions)}
              title="Message actions"
              aria-label="Message actions"
              aria-expanded={isMenuOpen}
            >
              <FontAwesomeIcon icon={faChevronDown} />
            </button>

            {isMenuOpen ? (
              <div className="message-actions-menu" role="menu" aria-label="Message actions">
                {canEditOrDelete ? (
                  <button type="button" onClick={() => startEditingMessage(message, conversationOptions)}>
                    <FontAwesomeIcon icon={faPenToSquare} />
                    <span>Edit</span>
                  </button>
                ) : null}
                {canEditOrDelete ? (
                  <button type="button" onClick={() => handleDeleteMessage(message, conversationOptions)}>
                    <FontAwesomeIcon icon={faTrash} />
                    <span>Delete</span>
                  </button>
                ) : null}
                <button type="button" className={isStarred ? 'active' : ''} onClick={() => handleToggleMessageStar(message, conversationOptions)}>
                  <FontAwesomeIcon icon={faStar} />
                  <span>{isStarred ? 'Unstar' : 'Star'}</span>
                </button>
              </div>
            ) : null}
          </div>

          {contextLabel ? <p className="group-sender-name">{contextLabel}</p> : null}
          {showSenderName && senderName ? <p className="group-sender-name">{senderName}</p> : null}

          {attachment && attachment.type === 'image' && attachment.url ? (
            <a className="attachment-link image" href={attachment.url} target="_blank" rel="noreferrer">
              <img src={attachment.url} alt={attachment.name} loading="lazy" />
            </a>
          ) : null}
          {attachment && attachment.type === 'file' && attachment.url ? (
            <a className="attachment-link file" href={attachment.url} target="_blank" rel="noreferrer">
              {attachment.name}
            </a>
          ) : null}
          {attachment ? attachment.caption ? <p>{attachment.caption}</p> : null : <p>{message.message}</p>}
          <span>{formatTime(message.created_at)}</span>
        </div>
      </article>
    );
  };

  const openAttachmentPicker = (category) => {
    setIsAttachmentMenuOpen(false);
    setIsEmojiMenuOpen(false);

    if (category === 'image' && imageAttachmentInputRef.current) {
      imageAttachmentInputRef.current.click();
      return;
    }

    if (category === 'file' && fileAttachmentInputRef.current) {
      fileAttachmentInputRef.current.click();
    }
  };

  const insertEmoji = (emoji) => {
    if (!emoji || typeof emoji !== 'string') {
      return;
    }

    setDraft((previousDraft) => {
      const input = draftInputRef.current;

      if (!input || document.activeElement !== input) {
        return `${previousDraft}${emoji}`;
      }

      const start = input.selectionStart ?? previousDraft.length;
      const end = input.selectionEnd ?? previousDraft.length;
      const nextDraft = `${previousDraft.slice(0, start)}${emoji}${previousDraft.slice(end)}`;

      window.requestAnimationFrame(() => {
        const cursorPosition = start + emoji.length;
        input.focus();
        input.setSelectionRange(cursorPosition, cursorPosition);
      });

      return nextDraft;
    });

    setIsEmojiMenuOpen(false);
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

  const getUserNameById = useCallback(
    (userId) => {
      const numericId = Number(userId);

      if (currentUser && Number(currentUser.id) === numericId) {
        return currentUser.username || 'You';
      }

      const matchedUser = users.find((user) => Number(user.id) === numericId);
      return matchedUser ? matchedUser.username : 'Member';
    },
    [currentUser, users]
  );

  const relayGroupMetadata = useCallback(
    (group, action = 'upsert') => {
      if (!group || !currentUser) {
        return;
      }

      const socket = socketRef.current;
      const canSendWithSocket = socket && socket.readyState === WebSocket.OPEN;
      if (!canSendWithSocket) {
        return;
      }

      const envelope = JSON.stringify({
        action,
        group,
      });

      (group.memberIds || [])
        .map((id) => Number(id))
        .filter((id) => id > 0 && id !== Number(currentUser.id))
        .forEach((memberId) => {
          socket.send(
            JSON.stringify({
              type: 'relay_message',
              id: Date.now() + memberId,
              receiverId: memberId,
              message: envelope,
              messageType: 'group_meta',
              createdAt: new Date().toISOString(),
            })
          );
        });
    },
    [currentUser]
  );

  const openCreateGroupModal = () => {
    if (!currentUser) {
      return;
    }

    setGroupForm({
      name: '',
      description: '',
      image: '',
      memberIds: [],
      adminIds: [Number(currentUser.id)],
      onlyAdminsCanMessage: false,
      onlyAdminsCanEdit: true,
    });
    setIsCreateGroupOpen(true);
  };

  const openGroupSettingsModal = () => {
    if (!activeGroup || !canCurrentUserEditGroup || !currentUser) {
      return;
    }

    setGroupForm({
      name: activeGroup.name || '',
      description: activeGroup.description || '',
      image: activeGroup.image || '',
      memberIds: (activeGroup.memberIds || []).filter((id) => Number(id) !== Number(currentUser.id)),
      adminIds: activeGroup.adminIds || [Number(currentUser.id)],
      onlyAdminsCanMessage: Boolean(activeGroup.permissions?.onlyAdminsCanMessage),
      onlyAdminsCanEdit: Boolean(activeGroup.permissions?.onlyAdminsCanEdit),
    });
    setIsGroupSettingsOpen(true);
  };

  const toggleMemberInForm = (memberId) => {
    const normalizedId = Number(memberId);

    setGroupForm((previous) => {
      const hasMember = previous.memberIds.includes(normalizedId);
      const nextMemberIds = hasMember
        ? previous.memberIds.filter((id) => id !== normalizedId)
        : [...previous.memberIds, normalizedId];

      const nextAdminIds = hasMember
        ? previous.adminIds.filter((id) => id !== normalizedId)
        : previous.adminIds;

      return {
        ...previous,
        memberIds: nextMemberIds,
        adminIds: nextAdminIds,
      };
    });
  };

  const toggleAdminInForm = (memberId) => {
    const normalizedId = Number(memberId);

    setGroupForm((previous) => {
      const isAdmin = previous.adminIds.includes(normalizedId);
      return {
        ...previous,
        adminIds: isAdmin
          ? previous.adminIds.filter((id) => id !== normalizedId)
          : [...previous.adminIds, normalizedId],
      };
    });
  };

  const createGroup = (event) => {
    event.preventDefault();

    if (!currentUser) {
      return;
    }

    const groupName = groupForm.name.trim();
    if (!groupName) {
      setChatError('Group name is required');
      return;
    }

    const ownerId = Number(currentUser.id);
    const memberIds = Array.from(new Set([ownerId, ...groupForm.memberIds.map((id) => Number(id))]));
    const adminIds = Array.from(new Set([ownerId, ...groupForm.adminIds.filter((id) => memberIds.includes(Number(id)))]));

    const nextGroup = {
      id: `grp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: groupName,
      description: groupForm.description.trim(),
      image: groupForm.image.trim(),
      memberIds,
      adminIds,
      permissions: {
        onlyAdminsCanMessage: groupForm.onlyAdminsCanMessage,
        onlyAdminsCanEdit: groupForm.onlyAdminsCanEdit,
      },
      createdBy: ownerId,
    };

    setGroups((previous) => [nextGroup, ...previous]);
    setGroupMessagesById((previous) => ({ ...previous, [nextGroup.id]: [] }));
    setActiveChatMode('group');
    setActiveGroupId(nextGroup.id);
    setDraft('');
    setSelectedAttachment(null);
    setIsAttachmentMenuOpen(false);
    setIsEmojiMenuOpen(false);
    relayGroupMetadata(nextGroup, 'upsert');
    setIsCreateGroupOpen(false);
  };

  const saveGroupSettings = (event) => {
    event.preventDefault();

    if (!activeGroup || !currentUser) {
      return;
    }

    const groupName = groupForm.name.trim();
    if (!groupName) {
      setChatError('Group name is required');
      return;
    }

    const ownerId = Number(currentUser.id);
    const memberIds = Array.from(new Set([ownerId, ...groupForm.memberIds.map((id) => Number(id))]));
    const adminIds = Array.from(new Set([ownerId, ...groupForm.adminIds.filter((id) => memberIds.includes(Number(id)))]));

    setGroups((previous) =>
      previous.map((group) => {
        if (group.id !== activeGroup.id) {
          return group;
        }

        return {
          ...group,
          name: groupName,
          description: groupForm.description.trim(),
          image: groupForm.image.trim(),
          memberIds,
          adminIds,
          permissions: {
            onlyAdminsCanMessage: groupForm.onlyAdminsCanMessage,
            onlyAdminsCanEdit: groupForm.onlyAdminsCanEdit,
          },
        };
      })
    );

    relayGroupMetadata(
      {
        ...activeGroup,
        name: groupName,
        description: groupForm.description.trim(),
        image: groupForm.image.trim(),
        memberIds,
        adminIds,
        permissions: {
          onlyAdminsCanMessage: groupForm.onlyAdminsCanMessage,
          onlyAdminsCanEdit: groupForm.onlyAdminsCanEdit,
        },
      },
      'upsert'
    );

    setIsEmojiMenuOpen(false);

    setIsGroupSettingsOpen(false);
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

  const addTaskItem = (taskPayload) => {
    setTasks((previous) => [
      {
        id: `task-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        title: taskPayload.title,
        assigneeId: Number(taskPayload.assigneeId || currentUser?.id || 0),
        assigneeName: taskPayload.assigneeName || currentUser?.username || 'Unknown',
        priority: taskPayload.priority || 'Medium',
        dueDate: taskPayload.dueDate || '',
        completed: false,
      },
      ...previous,
    ]);
  };

  const toggleTaskItem = (taskId) => {
    setTasks((previous) =>
      previous.map((task) =>
        task.id === taskId
          ? {
              ...task,
              completed: !task.completed,
            }
          : task
      )
    );
  };

  const deleteTaskItem = (taskId) => {
    setTasks((previous) => previous.filter((task) => task.id !== taskId));
  };

  const buildMessageStarKey = useCallback((message, { groupId = null, peerId = null } = {}) => {
    const messageId = Number(message?.id || 0);
    const senderId = Number(message?.sender_id || 0);
    const createdAt = String(message?.created_at || '');
    const scope = groupId ? `group:${String(groupId)}` : `direct:${String(peerId || 'unknown')}`;
    return `${scope}:${messageId}:${senderId}:${createdAt}`;
  }, []);

  const toggleMessageStar = useCallback(
    (message, options = {}) => {
      const key = buildMessageStarKey(message, options);
      setStarredMessageKeys((previous) => {
        if (previous[key]) {
          const { [key]: _, ...rest } = previous;
          return rest;
        }

        return {
          ...previous,
          [key]: true,
        };
      });
    },
    [buildMessageStarKey]
  );

  const starredMessages = useMemo(() => {
    const directContextLabel = activeUser ? `Direct • ${activeUser.username}` : 'Direct chat';
    const directPeerId = activeUser ? activeUser.id : null;
    const directItems = (messages || []).map((message) => {
      const starKey = buildMessageStarKey(message, { peerId: directPeerId });
      return {
        starKey,
        message,
        contextLabel: directContextLabel,
        conversationOptions: { peerId: directPeerId },
      };
    });

    const groupItems = Object.entries(groupMessagesById || {}).flatMap(([groupId, groupList]) => {
      const group = groups.find((item) => String(item.id) === String(groupId));
      const label = group ? `Group • ${group.name}` : 'Group';

      return (groupList || []).map((message) => {
        const starKey = buildMessageStarKey(message, { groupId });
        return {
          starKey,
          message,
          contextLabel: label,
          conversationOptions: { groupId },
        };
      });
    });

    return [...directItems, ...groupItems]
      .filter((item) => Boolean(starredMessageKeys[item.starKey]))
      .sort((left, right) => {
        const leftTime = new Date(left.message.created_at || 0).getTime();
        const rightTime = new Date(right.message.created_at || 0).getTime();
        return rightTime - leftTime;
      });
  }, [messages, groupMessagesById, groups, activeUser, buildMessageStarKey, starredMessageKeys]);

  const lockApp = () => {
    setIsAppLocked(true);
    setLockPinInput('');
    setLockError('');
  };

  const unlockApp = (event) => {
    event.preventDefault();

    if (lockPinInput.trim() !== APP_LOCK_DEFAULT_PIN) {
      setLockError('Invalid PIN. Try 1234');
      return;
    }

    setIsAppLocked(false);
    setLockPinInput('');
    setLockError('');
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
                  autoComplete="email"
                />

                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                  placeholder="Enter your password"
                  autoComplete="current-password"
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
                <p className="label"></p>
                <h2>{currentUser ? currentUser.username : 'Loading...'}</h2>
                <p>{currentUser ? currentUser.email : 'Fetching profile'}</p>
              </div>
              <div className="profile-actions-wrap" ref={quickActionsMenuRef}>
                <button
                  type="button"
                  className="profile-actions-toggle"
                  aria-label="Open quick actions"
                  aria-expanded={isQuickActionsOpen}
                  onClick={() => setIsQuickActionsOpen((previous) => !previous)}
                >
                  <FontAwesomeIcon icon={faEllipsisVertical} />
                </button>

                {isQuickActionsOpen ? (
                  <div className="profile-actions-menu" role="menu" aria-label="Quick actions">
                    <button
                      type="button"
                      className={isTaskTrackingActive ? 'active' : ''}
                      onClick={() => {
                        setActiveChatMode('task');
                        setSelectedAttachment(null);
                        setIsAttachmentMenuOpen(false);
                        setIsQuickActionsOpen(false);
                      }}
                    >
                      <FontAwesomeIcon icon={faListCheck} />
                      <span>Tasks</span>
                    </button>
                    <button
                      type="button"
                      className={isMilestoneTrackingActive ? 'active' : ''}
                      onClick={() => {
                        setActiveChatMode('milestone');
                        setSelectedAttachment(null);
                        setIsAttachmentMenuOpen(false);
                        setIsQuickActionsOpen(false);
                      }}
                    >
                      <FontAwesomeIcon icon={faChartLine} />
                      <span>Milestones</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        openCreateGroupModal();
                        setIsQuickActionsOpen(false);
                      }}
                    >
                      <FontAwesomeIcon icon={faUserGroup} />
                      <span>New Group</span>
                    </button>
                    <button
                      type="button"
                      className={isStarredViewActive ? 'active' : ''}
                      onClick={() => {
                        setActiveChatMode('starred');
                        setSelectedAttachment(null);
                        setIsAttachmentMenuOpen(false);
                        setIsQuickActionsOpen(false);
                      }}
                    >
                      <FontAwesomeIcon icon={faStar} />
                      <span>Starred</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        lockApp();
                        setIsQuickActionsOpen(false);
                      }}
                    >
                      <FontAwesomeIcon icon={faLock} />
                      <span>App Lock</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        logout();
                        setIsQuickActionsOpen(false);
                      }}
                    >
                      <FontAwesomeIcon icon={faRightFromBracket} />
                      <span>Logout</span>
                    </button>
                  </div>
                ) : null}
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
              <div className="contacts-header-actions">
                <button
                  type="button"
                  className={`beeai-btn ${isBeeAiActive ? 'active-sidebar-btn' : ''}`}
                  onClick={openBeeAiAssistant}
                  aria-label="Open BeeAI assistant"
                  title="Open BeeAI assistant"
                >
                  <img src="/bee.png" alt="" aria-hidden="true" />
                </button>
                <span>{users.length + groups.length}</span>
              </div>
            </div>

            {!loadingUsers && users.length === 0 ? (
              <p className="helper-text">Add more users in your database to start chatting.</p>
            ) : null}

            {!loadingUsers && groups.length === 0 ? (
              <p className="helper-text">Create a group to organize contacts and team chats.</p>
            ) : null}

            <div className="contact-list">
              {groups.map((group, index) => (
                <button
                  key={group.id}
                  type="button"
                  className={`contact-item ${isGroupChatActive && activeGroup?.id === group.id ? 'active' : ''}`}
                  style={{ animationDelay: `${index * 70}ms` }}
                  onClick={() => {
                    setActiveChatMode('group');
                    setActiveGroupId(group.id);
                    setActiveUserId(null);
                    setSelectedAttachment(null);
                    setIsAttachmentMenuOpen(false);
                  }}
                >
                  {group.image ? (
                    <div className="avatar has-image">
                      <img src={group.image} alt={`${group.name} group`} loading="lazy" />
                    </div>
                  ) : (
                    <div className="avatar">{String(group.name || '#').charAt(0).toUpperCase()}</div>
                  )}
                  <div className="contact-meta">
                    <p>{group.name}</p>
                    <small>{(group.memberIds || []).length} members</small>
                  </div>
                </button>
              ))}

              {users
                .filter((user) => !currentUser || user.id !== currentUser.id)
                .map((user, index) => (
                  <button
                    key={user.id}
                    type="button"
                    className={`contact-item ${!isGroupChatActive && activeUserId === user.id ? 'active' : ''}`}
                    style={{ animationDelay: `${(groups.length + index) * 70}ms` }}
                    onClick={() => {
                      setActiveChatMode('direct');
                      setActiveGroupId(null);
                      setActiveUserId(user.id);
                    }}
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
              <p className="label">
                {isTaskTrackingActive
                  ? 'Workspace'
                  : isMilestoneTrackingActive
                  ? 'Projects'
                  : isStarredViewActive
                  ? 'Saved'
                  : isGroupChatActive
                  ? 'Group'
                  : 'Conversation'}
              </p>
              <h2>
                {isTaskTrackingActive
                  ? 'Project Task Tracker'
                  : isMilestoneTrackingActive
                  ? 'Project Milestones'
                  : isStarredViewActive
                  ? 'Starred Messages'
                  : isGroupChatActive
                  ? activeGroup?.name || 'Group'
                  : activeUser
                  ? activeUser.username
                  : 'Pick a contact'}
              </h2>
              {isTaskTrackingActive ? (
                <p className="active-user-presence">Track work items, owners, and completion state.</p>
              ) : isMilestoneTrackingActive ? (
                <p className="active-user-presence">Manage project milestones and track progress.</p>
              ) : isStarredViewActive ? (
                <p className="active-user-presence">Your important messages are pinned here.</p>
              ) : isGroupChatActive ? (
                <p className="active-user-presence">
                  {(activeGroup?.memberIds || []).length} members
                  {activeGroup?.description ? ` • ${activeGroup.description}` : ''}
                </p>
              ) : activeUser ? (
                <p className="active-user-presence">
                  {formatLastSeenText(activeUser.last_seen, activeUser.status === 'online')}
                </p>
              ) : null}
            </div>
            <div className="topbar-actions">
              {isGroupChatActive && canCurrentUserEditGroup ? (
                <button type="button" className="theme-btn" onClick={openGroupSettingsModal}>
                  Group Settings
                </button>
              ) : null}
              <div className={`topbar-chip socket-${socketStatus}`}>
                Socket {socketStatus}
              </div>
              <button type="button" className="theme-btn" onClick={toggleTheme}>
                {theme === 'light' ? 'Dark mode' : 'Light mode'}
              </button>
            </div>
          </header>

          {isBeeAiActive ? (
            <BeeAiPanel currentUser={currentUser} apiBase={apiBase} />
          ) : isTaskTrackingActive ? (
            <TaskTracker
              tasks={tasks}
              users={users}
              currentUser={currentUser}
              onAddTask={addTaskItem}
              onToggleTask={toggleTaskItem}
              onDeleteTask={deleteTaskItem}
            />
          ) : isMilestoneTrackingActive ? (
            <MilestoneTracker
              group={activeGroup}
              apiBase={apiBase}
              currentUser={currentUser}
              users={users}
            />
          ) : isStarredViewActive ? (
            <div
              className={`messages-area ${isMessagesScrollbarVisible ? 'show-scrollbar' : 'hide-scrollbar'}`}
              ref={messagesAreaRef}
              onScroll={handleMessagesScroll}
            >
              {starredMessages.length === 0 ? (
                <p className="helper-text">No starred messages yet. Click the star icon on a message to save it.</p>
              ) : null}

              {starredMessages.map((item) => {
                const message = item.message;
                const isOwn = currentUser && Number(message.sender_id) === Number(currentUser.id);
                return renderMessageCard({
                  message,
                  isOwn,
                  conversationOptions: item.conversationOptions,
                  contextLabel: item.contextLabel,
                });
              })}
            </div>
          ) : (
            <>
              <div
                className={`messages-area ${isMessagesScrollbarVisible ? 'show-scrollbar' : 'hide-scrollbar'}`}
                ref={messagesAreaRef}
                onScroll={handleMessagesScroll}
              >
                {chatError ? <p className="error-banner">{chatError}</p> : null}

                {!activeUser && !isGroupChatActive ? (
                  <p className="helper-text">Select a contact to begin messaging.</p>
                ) : null}

                {loadingMessages && !isGroupChatActive && activeUser ? (
                  <p className="helper-text">Syncing messages...</p>
                ) : null}

                {isGroupChatActive && visibleMessages.length === 0 ? (
                  <p className="helper-text">No group messages yet. Start the conversation.</p>
                ) : null}

                {activeUser && !isGroupChatActive && !loadingMessages && visibleMessages.length === 0 ? (
                  <p className="helper-text">No messages yet. Start the conversation.</p>
                ) : null}

                {visibleMessages.map((message) => {
                  const isOwn = currentUser && Number(message.sender_id) === Number(currentUser.id);
                  return renderMessageCard({
                    message,
                    isOwn,
                    conversationOptions: {
                      groupId: isGroupChatActive ? activeGroup?.id : null,
                      peerId: !isGroupChatActive ? activeUser?.id : null,
                    },
                    showSenderName: isGroupChatActive && !isOwn,
                    senderName: isGroupChatActive && !isOwn ? getUserNameById(message.sender_id) : '',
                  });
                })}
              </div>

              <form className="composer" onSubmit={sendMessage}>
                {isEditingMessage ? (
                  <div className="editing-banner">
                    <div>
                      <strong>Editing message</strong>
                      <span>Update the text and press send to save it.</span>
                    </div>
                    <button type="button" onClick={() => { setEditingMessage(null); setDraft(''); }}>
                      Cancel
                    </button>
                  </div>
                ) : null}

                <div className="attachment-menu-wrap" ref={attachmentMenuRef}>
              <button
                type="button"
                className="attachment-toggle"
                onClick={() => setIsAttachmentMenuOpen((previous) => !previous)}
                disabled={
                  (isStarredViewActive && !isEditingMessage) ||
                  (!isEditingMessage && !activeUser && !isGroupChatActive) ||
                  (isGroupChatActive && activeGroup?.permissions?.onlyAdminsCanMessage && !isGroupAdmin(activeGroup))
                }
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

            <div className="emoji-menu-wrap" ref={emojiMenuRef}>
              <button
                type="button"
                className="emoji-toggle"
                onClick={() => {
                  setIsEmojiMenuOpen((previous) => !previous);
                  setIsAttachmentMenuOpen(false);
                }}
                disabled={
                  (isStarredViewActive && !isEditingMessage) ||
                  (!isEditingMessage && !activeUser && !isGroupChatActive) ||
                  (isGroupChatActive && activeGroup?.permissions?.onlyAdminsCanMessage && !isGroupAdmin(activeGroup))
                }
                aria-label="Add emoji"
                aria-expanded={isEmojiMenuOpen}
              >
                <FontAwesomeIcon icon={faFaceSmile} />
              </button>

              {isEmojiMenuOpen ? (
                <EmojiPicker
                  emojiGroups={EMOJI_SETS}
                  onSelectEmoji={insertEmoji}
                  onClose={() => setIsEmojiMenuOpen(false)}
                />
              ) : null}
            </div>

            <input
              ref={draftInputRef}
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={
                isEditingMessage
                  ? 'Edit message...'
                  : isGroupChatActive
                  ? activeGroup?.permissions?.onlyAdminsCanMessage && !isGroupAdmin(activeGroup)
                    ? 'Only admins can send messages'
                    : 'Message group...'
                  : activeUser
                  ? `Message ${activeUser.username}...`
                  : 'Select a user first'
              }
              disabled={
                (isStarredViewActive && !isEditingMessage) ||
                (!isEditingMessage && !activeUser && !isGroupChatActive) ||
                (isGroupChatActive && activeGroup?.permissions?.onlyAdminsCanMessage && !isGroupAdmin(activeGroup))
              }
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

            <button
              type="submit"
              disabled={
                (isStarredViewActive && !isEditingMessage) ||
                (!isEditingMessage && !activeUser && !isGroupChatActive) ||
                (!draft.trim() && !selectedAttachment) ||
                (isGroupChatActive && activeGroup?.permissions?.onlyAdminsCanMessage && !isGroupAdmin(activeGroup))
              }
              title={isEditingMessage ? 'Save message' : 'Send message'}
            >
              <FontAwesomeIcon icon={isEditingMessage ? faCheck : faPaperPlane} />
            </button>
              </form>
            </>
          )}
        </section>
      </main>

      {isAppLocked ? (
        <div className="app-lock-overlay" role="presentation">
          <section className="app-lock-modal" role="dialog" aria-modal="true" aria-label="Unlock app">
            <div className="app-lock-icon">
              <FontAwesomeIcon icon={faLock} />
            </div>
            <h3>App Locked</h3>
            <p>Enter PIN to unlock your chat workspace.</p>
            <form className="app-lock-form" onSubmit={unlockApp}>
              <input
                type="password"
                inputMode="numeric"
                value={lockPinInput}
                onChange={(event) => {
                  setLockPinInput(event.target.value);
                  if (lockError) {
                    setLockError('');
                  }
                }}
                placeholder="Enter PIN"
              />
              {lockError ? <p className="error-banner">{lockError}</p> : null}
              <button type="submit">Unlock</button>
            </form>
          </section>
        </div>
      ) : null}

      {isCreateGroupOpen ? (
        <div className="group-modal-backdrop" role="presentation" onClick={() => setIsCreateGroupOpen(false)}>
          <section className="group-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>Create New Group</h3>
            <form className="group-form" onSubmit={createGroup}>
              <label htmlFor="group-name">Group name</label>
              <input
                id="group-name"
                type="text"
                value={groupForm.name}
                onChange={(event) => setGroupForm((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="Team Alpha"
              />

              <label htmlFor="group-description">Group description</label>
              <textarea
                id="group-description"
                value={groupForm.description}
                onChange={(event) =>
                  setGroupForm((previous) => ({ ...previous, description: event.target.value }))
                }
                placeholder="Daily updates and quick collaboration"
              />

              <label htmlFor="group-image">Group image URL</label>
              <input
                id="group-image"
                type="url"
                value={groupForm.image}
                onChange={(event) => setGroupForm((previous) => ({ ...previous, image: event.target.value }))}
                placeholder="https://example.com/group-image.jpg"
              />

              <p className="group-form-label">Add members from contacts</p>
              <div className="group-member-list">
                {users.map((user) => {
                  const userId = Number(user.id);
                  const checked = groupForm.memberIds.includes(userId);
                  const isAdmin = groupForm.adminIds.includes(userId);

                  return (
                    <label key={`member-${user.id}`} className="group-member-item">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMemberInForm(userId)}
                      />
                      <span>{user.username}</span>
                      {checked ? (
                        <button
                          type="button"
                          className={`member-admin-btn ${isAdmin ? 'is-admin' : ''}`}
                          onClick={() => toggleAdminInForm(userId)}
                        >
                          {isAdmin ? 'Admin' : 'Make admin'}
                        </button>
                      ) : null}
                    </label>
                  );
                })}
              </div>

              <label className="permission-toggle">
                <input
                  type="checkbox"
                  checked={groupForm.onlyAdminsCanMessage}
                  onChange={(event) =>
                    setGroupForm((previous) => ({ ...previous, onlyAdminsCanMessage: event.target.checked }))
                  }
                />
                <span>Only admins can send messages</span>
              </label>

              <label className="permission-toggle">
                <input
                  type="checkbox"
                  checked={groupForm.onlyAdminsCanEdit}
                  onChange={(event) =>
                    setGroupForm((previous) => ({ ...previous, onlyAdminsCanEdit: event.target.checked }))
                  }
                />
                <span>Only admins can edit group settings</span>
              </label>

              <div className="group-form-actions">
                <button type="button" className="secondary-btn" onClick={() => setIsCreateGroupOpen(false)}>
                  Cancel
                </button>
                <button type="submit">Create group</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isGroupSettingsOpen && activeGroup ? (
        <div className="group-modal-backdrop" role="presentation" onClick={() => setIsGroupSettingsOpen(false)}>
          <section className="group-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>Group Settings</h3>
            <form className="group-form" onSubmit={saveGroupSettings}>
              <label htmlFor="edit-group-name">Group name</label>
              <input
                id="edit-group-name"
                type="text"
                value={groupForm.name}
                onChange={(event) => setGroupForm((previous) => ({ ...previous, name: event.target.value }))}
              />

              <label htmlFor="edit-group-description">Group description</label>
              <textarea
                id="edit-group-description"
                value={groupForm.description}
                onChange={(event) =>
                  setGroupForm((previous) => ({ ...previous, description: event.target.value }))
                }
              />

              <label htmlFor="edit-group-image">Group image URL</label>
              <input
                id="edit-group-image"
                type="url"
                value={groupForm.image}
                onChange={(event) => setGroupForm((previous) => ({ ...previous, image: event.target.value }))}
              />

              <p className="group-form-label">Manage members and admins</p>
              <div className="group-member-list">
                {users.map((user) => {
                  const userId = Number(user.id);
                  const checked = groupForm.memberIds.includes(userId);
                  const isAdmin = groupForm.adminIds.includes(userId);

                  return (
                    <label key={`edit-member-${user.id}`} className="group-member-item">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMemberInForm(userId)}
                      />
                      <span>{user.username}</span>
                      {checked ? (
                        <button
                          type="button"
                          className={`member-admin-btn ${isAdmin ? 'is-admin' : ''}`}
                          onClick={() => toggleAdminInForm(userId)}
                        >
                          {isAdmin ? 'Admin' : 'Make admin'}
                        </button>
                      ) : null}
                    </label>
                  );
                })}
              </div>

              <label className="permission-toggle">
                <input
                  type="checkbox"
                  checked={groupForm.onlyAdminsCanMessage}
                  onChange={(event) =>
                    setGroupForm((previous) => ({ ...previous, onlyAdminsCanMessage: event.target.checked }))
                  }
                />
                <span>Only admins can send messages</span>
              </label>

              <label className="permission-toggle">
                <input
                  type="checkbox"
                  checked={groupForm.onlyAdminsCanEdit}
                  onChange={(event) =>
                    setGroupForm((previous) => ({ ...previous, onlyAdminsCanEdit: event.target.checked }))
                  }
                />
                <span>Only admins can edit group settings</span>
              </label>

              <div className="group-form-actions">
                <button type="button" className="secondary-btn" onClick={() => setIsGroupSettingsOpen(false)}>
                  Close
                </button>
                <button type="submit">Save changes</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default App;
