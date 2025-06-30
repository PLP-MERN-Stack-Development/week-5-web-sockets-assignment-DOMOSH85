import React, { useEffect, useState, useRef } from "react";
import socket from "./socket/socket";

// --- Constants & Helper Components ---
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const Icon = ({ path, className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

const SendIcon = () => <Icon path="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />;
const PaperclipIcon = () => <Icon path="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.122 2.122l7.81-7.81" />;
const MenuIcon = () => <Icon path="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />;
const DownloadIcon = () => <Icon path="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />;

// --- Main App Component ---

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [username, setUsername] = useState("");
  const [isRegistered, setIsRegistered] = useState(false);
  const [tab, setTab] = useState("Global");
  const [messages, setMessages] = useState([]);
  const [privateMessages, setPrivateMessages] = useState({});
  const [roomMessages, setRoomMessages] = useState({});
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [room, setRoom] = useState("");
  const [joinedRooms, setJoinedRooms] = useState([]);
  const [roomInput, setRoomInput] = useState("");
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    function onConnect() { setIsConnected(true); }
    function onDisconnect() { setIsConnected(false); }
    
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    const addMessageToState = (setter, key, msg) => {
        setter(prev => ({...prev, [key]: [...(prev[key] || []), msg] }));
    };

    const addReactionToState = (stateSetter, key, messageId, from, reaction) => {
      stateSetter(prev => {
        const newState = { ...prev };
        const messages = [...(newState[key] || [])];
        const msgIndex = messages.findIndex(m => m.id === messageId);
        if (msgIndex !== -1) {
          const newReactions = messages[msgIndex].reactions ? [...messages[msgIndex].reactions] : [];
          newReactions.push({ from, reaction });
          messages[msgIndex] = { ...messages[msgIndex], reactions: newReactions };
          newState[key] = messages;
        }
        return newState;
      });
    };
    
    socket.on("chat message", (msg) => setMessages(prev => [...prev, { ...msg, id: msg.id || `msg-${Date.now()}` }]));
    socket.on("private message", (msg) => addMessageToState(setPrivateMessages, msg.from === username ? msg.to : msg.from, { ...msg, id: msg.id || `msg-${Date.now()}` }));
    socket.on("room message", (msg) => addMessageToState(setRoomMessages, msg.room, { ...msg, id: msg.id || `msg-${Date.now()}` }));
    socket.on("file message", (msg) => {
      const messageWithId = { ...msg, id: msg.id || `msg-${Date.now()}` };
      if (msg.room) addMessageToState(setRoomMessages, msg.room, messageWithId);
      else if (msg.to) addMessageToState(setPrivateMessages, msg.from === username ? msg.to : msg.from, messageWithId);
      else setMessages(prev => [...prev, messageWithId]);
    });
    socket.on("online users", (users) => setOnlineUsers(users.filter(u => u !== username)));
    socket.on("joined room", (r) => setJoinedRooms(prev => [...new Set([...prev, r])]));

    socket.on("message reaction", ({ messageId, reaction, from, room: reactionRoom, to }) => {
        if (reactionRoom) {
            addReactionToState(setRoomMessages, reactionRoom, messageId, from, reaction);
        } else if (to) {
            const user = from === username ? to : from;
            addReactionToState(setPrivateMessages, user, messageId, from, reaction);
        } else {
            setMessages(prev => {
                const newMessages = [...prev];
                const msgIndex = newMessages.findIndex(m => m.id === messageId);
                if (msgIndex !== -1) {
                    const newReactions = newMessages[msgIndex].reactions ? [...newMessages[msgIndex].reactions] : [];
                    newReactions.push({ from, reaction });
                    newMessages[msgIndex] = { ...newMessages[msgIndex], reactions: newReactions };
                }
                return newMessages;
            });
        }
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('chat message');
      socket.off('private message');
      socket.off('room message');
      socket.off('file message');
      socket.off('online users');
      socket.off('joined room');
      socket.off('message reaction');
    };
  }, [username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, privateMessages, roomMessages]);

  const handleRegister = (e) => {
    e.preventDefault();
    if (username.trim()) {
      socket.emit("register", username);
      setIsRegistered(true);
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) {
      setFile(f);
      if (f.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => setFilePreview(ev.target.result);
        reader.readAsDataURL(f);
      } else {
        setFilePreview(f.name);
      }
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!currentMessage.trim() && !file) return;

    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const fileData = ev.target.result;
        const messagePayload = {
          toUsername: selectedUser,
          room,
          caption: currentMessage,
          file: fileData,
          fileType: file.type,
        };
        
        socket.emit("file message", messagePayload);
      };
      reader.readAsDataURL(file);
    } else {
      const messagePayload = { toUsername: selectedUser, room, message: currentMessage };
      if (tab === "Global") socket.emit("chat message", messagePayload.message);
      else if (tab === "Private") socket.emit("private message", messagePayload);
      else if (tab === "Rooms") socket.emit("room message", messagePayload);
    }

    setCurrentMessage("");
    setFile(null);
    setFilePreview(null);
  };
  
  const handleReact = (messageId, reaction) => {
    socket.emit("message reaction", { messageId, reaction, room, toUsername: selectedUser });
  };
  
  const handleRoomJoin = (e) => {
    e.preventDefault();
    if (roomInput.trim()) {
      socket.emit("join room", roomInput.trim());
      setRoom(roomInput.trim());
      setTab("Rooms");
      setRoomInput("");
      setIsMobileMenuOpen(false);
    }
  };
  
  const switchContext = (type, value) => {
    setTab(type);
    if (type === 'Rooms') setRoom(value);
    if (type === 'Private') setSelectedUser(value);
    setIsMobileMenuOpen(false);
  };
  
  const renderMessages = (msgs = []) => (
    <div className="flex-1 px-4 pt-4 pb-2 overflow-y-auto">
      {msgs.map((msg, index) => {
        const aggregatedReactions = msg.reactions?.reduce((acc, r) => {
          acc[r.reaction] = (acc[r.reaction] || 0) + 1;
          return acc;
        }, {});

        return (
          <div key={msg.id || index} className={`flex items-end gap-3 mb-1 relative group ${msg.username === username ? 'justify-end' : 'justify-start'}`}>
            <div className={`w-10 h-10 rounded-full bg-gray-700 flex-shrink-0 flex items-center justify-center font-bold text-lg ${msg.username === username ? 'order-2' : 'order-1'}`}>
              {msg.username ? msg.username.charAt(0).toUpperCase() : '?'}
            </div>
            <div className={`max-w-md p-3 rounded-xl relative ${msg.username === username ? 'order-1 bg-blue-600 text-white rounded-br-none' : 'order-2 bg-gray-700 text-gray-200 rounded-bl-none'}`}>
              {msg.username !== username && <strong className="block text-sm font-medium mb-1 text-blue-400">{msg.username}</strong>}
              {msg.type === 'file' ? (
                <div>
                  {msg.fileType?.startsWith('image/') ? (
                    <img src={msg.file} alt={msg.caption || 'shared image'} className="max-w-xs max-h-48 rounded-lg mb-2 cursor-pointer" onClick={() => window.open(msg.file)}/>
                  ) : (
                    <a href={msg.file} download={msg.caption || 'file'} className="flex items-center gap-2 bg-gray-600/50 p-2 rounded-lg hover:bg-gray-500/50">
                      <DownloadIcon /><span>{msg.caption || 'Download File'}</span>
                    </a>
                  )}
                  {msg.caption && msg.fileType?.startsWith('image/') && <p className="mt-1">{msg.caption}</p>}
                </div>
              ) : <p>{msg.message}</p>}
              <div className="text-xs text-gray-400 mt-2 text-right">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              
              {aggregatedReactions && Object.keys(aggregatedReactions).length > 0 && (
                <div className="absolute -bottom-3 left-0 flex gap-1">
                  {Object.entries(aggregatedReactions).map(([r, count]) => (
                    <div key={r} className="flex items-center bg-gray-600 rounded-full px-2 py-0.5 text-xs shadow-md">
                      <span>{r}</span><span className="ml-1 font-bold">{count}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="absolute -top-4 right-0 hidden group-hover:flex bg-gray-600 p-1 rounded-full shadow-lg transition-all duration-150">
                {REACTIONS.map(r => <button key={r} onClick={() => handleReact(msg.id, r)} className="text-lg hover:scale-125 transition-transform p-1">{r}</button>)}
              </div>
            </div>
          </div>
        )
      })}
      <div ref={messagesEndRef} />
    </div>
  );

  const Sidebar = () => (
    <div className={`absolute md:relative z-20 w-80 h-full bg-gray-900 border-r border-gray-800 p-4 flex-col transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'flex' : 'hidden md:flex'}`}>
      <h2 className="text-2xl font-bold text-white mb-6 flex-shrink-0">ChatApp</h2>
      <div className="flex-grow overflow-y-auto -mr-4 pr-4">
        <h3 className="text-gray-400 font-semibold uppercase text-sm mb-2 px-2">Channels</h3>
        <ul>
          <li onClick={() => switchContext('Global')} className={`flex items-center p-2 rounded-lg cursor-pointer transition ${tab === 'Global' ? 'bg-blue-600 text-white' : 'hover:bg-gray-800'}`}># global</li>
          {joinedRooms.map((r) => <li key={r} onClick={() => switchContext('Rooms', r)} className={`flex items-center p-2 rounded-lg cursor-pointer transition ${room === r && tab === 'Rooms' ? 'bg-blue-600 text-white' : 'hover:bg-gray-800'}`}># {r}</li>)}
        </ul>
        <form onSubmit={handleRoomJoin} className="flex mt-2 mb-4"><input type="text" value={roomInput} onChange={e => setRoomInput(e.target.value)} placeholder="Join a room..." className="flex-1 bg-gray-800 text-sm p-2 rounded-l-lg focus:outline-none" /><button type="submit" className="bg-blue-600 p-2 rounded-r-lg hover:bg-blue-700">+</button></form>
        <h3 className="text-gray-400 font-semibold uppercase text-sm mt-4 mb-2 px-2">Direct Messages</h3>
        <ul>
          {onlineUsers.map((user) => <li key={user} onClick={() => switchContext('Private', user)} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition ${selectedUser === user && tab === 'Private' ? 'bg-blue-600 text-white' : 'hover:bg-gray-800'}`}><span className="w-2.5 h-2.5 bg-green-500 rounded-full"></span><span>{user}</span></li>)}
        </ul>
      </div>
      <div className="flex-shrink-0 pt-4 border-t border-gray-700"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center font-bold text-lg">{username.charAt(0).toUpperCase()}</div><div className="font-bold">{username}</div></div></div>
    </div>
  );

  if (!isRegistered) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white"><form onSubmit={handleRegister} className="p-10 bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm transform hover:scale-105 transition-transform duration-300"><h1 className="text-3xl font-bold mb-8 text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Welcome to ChatApp</h1><input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" className="w-full p-4 bg-gray-700 rounded-lg mb-6 focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50 transition" /><button type="submit" className="w-full p-4 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg font-bold hover:from-blue-600 hover:to-blue-700 transition-all duration-300 shadow-lg hover:shadow-blue-500/50">Join Chat</button></form></div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-800 text-gray-200 font-sans">
      {!isConnected && <div className="absolute top-0 left-0 w-full bg-red-600 text-white text-center p-2 z-50 animate-pulse">Connecting...</div>}
      <Sidebar />
      <div className="flex-1 flex flex-col bg-gray-800">
        <header className="flex-shrink-0 flex items-center justify-between p-4 bg-gray-900 border-b border-gray-700">
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden p-2 text-gray-400 hover:text-white"><MenuIcon /></button>
          <div className="font-bold text-xl">{tab === 'Global' && 'Global Chat'}{tab === 'Private' && `Chat with ${selectedUser}`}{tab === 'Rooms' && `#${room}`}</div>
          <div className="w-10 h-10 bg-gray-900"></div>
        </header>
        {renderMessages(tab === 'Global' ? messages : tab === 'Private' ? privateMessages[selectedUser] : roomMessages[room])}
        <footer className="p-4 bg-gray-900">
          {filePreview && (
            <div className="flex items-center gap-2 bg-gray-700 p-2 rounded-lg mb-2">
              {file.type.startsWith("image/") ? (
                <img src={filePreview} alt="Preview" className="w-12 h-12 object-cover rounded" />
              ) : (
                <div className="w-12 h-12 bg-gray-600 rounded flex items-center justify-center">
                  <Icon path="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" className="w-8 h-8"/>
                </div>
              )}
              <div className="flex-1 text-sm text-gray-300">
                {file.name}
              </div>
              <button
                onClick={() => { setFile(null); setFilePreview(null); }}
                className="text-red-400 hover:text-red-500 font-bold p-1"
              >
                &times;
              </button>
            </div>
          )}
          <form onSubmit={handleSendMessage} className="flex items-center gap-4">
            <input
              type="text"
              value={currentMessage}
              onChange={e => setCurrentMessage(e.target.value)}
              placeholder={file ? "Add a caption..." : "Type a message..."}
              className="flex-1 bg-gray-700 p-3 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition"><PaperclipIcon /></button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            <button type="submit" className="p-3 bg-blue-600 rounded-lg hover:bg-blue-700 transition shadow-lg"><SendIcon /></button>
          </form>
        </footer>
      </div>
    </div>
  );
}

export default App;
