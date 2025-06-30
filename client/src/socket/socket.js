import { io } from "socket.io-client";

// Use environment variable for the backend URL, with a fallback for local development
const URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

const socket = io(URL);

export default socket; 