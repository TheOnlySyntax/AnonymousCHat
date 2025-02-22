const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files (HTML, CSS, JS, etc.) from the /public folder
app.use(express.static(path.join(__dirname, '../public')));

let onlineUsers = {}; // List of users currently online
let waitingUser = null; // Store the waiting user
let matches = {}; // Store user matches

// Socket.io connection
io.on("connection", (socket) => {
    console.log("User connected: " + socket.id);

    // Assign username, gender, and search type and add user to onlineUsers list
    socket.on('newUser', (username, gender, searchType) => {
        onlineUsers[socket.id] = { username, gender, searchType, socket };

        // Send the updated user count to all clients
        io.emit('userCount', Object.keys(onlineUsers).length);

        // Check if there’s a waiting user for matchmaking
        if (waitingUser && Object.keys(onlineUsers).length > 1) {
            // Match the waiting user with the new user
            socket.emit("matchUser", waitingUser.username);
            waitingUser.socket.emit("matchUser", username);
            matches[socket.id] = waitingUser.socket.id;
            matches[waitingUser.socket.id] = socket.id;
            waitingUser = null; // Reset waiting user
        } else {
            // If no match found, put the new user in the waiting state
            waitingUser = { username, gender, searchType, socket };
            socket.emit("matchUser", "Searching for a stranger...");
        }
    });

    // When a message is sent
    socket.on("sendMessage", (msg) => {
        const matchSocketId = matches[socket.id];
        if (matchSocketId) {
            io.to(matchSocketId).emit("receiveMessage", msg); // Send message to the matched user
        }
    });

    // When a user ends the chat
    socket.on("endChat", () => {
        const matchSocketId = matches[socket.id];
        if (matchSocketId) {
            socket.emit("matchUser", "Searching for a new match...");
            io.to(matchSocketId).emit("matchUser", "Searching for a new match...");

            // Remove the match from the matches
            delete matches[socket.id];
            delete matches[matchSocketId];

            // Check if there's a waiting user and pair them
            if (waitingUser && Object.keys(onlineUsers).length > 1) {
                socket.emit("matchUser", waitingUser.username);
                waitingUser.socket.emit("matchUser", socket.username);
                matches[socket.id] = waitingUser.socket.id;
                matches[waitingUser.socket.id] = socket.id;
                waitingUser = null; // Reset waiting user
            } else {
                // If no one else is waiting, put the user back in the waiting state
                waitingUser = { username: socket.id, socket };
            }
        }
    });

    // Handle user disconnection
    socket.on("disconnect", () => {
        delete onlineUsers[socket.id];
        io.emit('userCount', Object.keys(onlineUsers).length); // Update the user count

        // If the user was matched, clear their match
        const matchSocketId = matches[socket.id];
        if (matchSocketId) {
            delete matches[socket.id];
            delete matches[matchSocketId];
            io.to(matchSocketId).emit("matchUser", "Your chat partner disconnected, waiting for a new match...");
        }

        // If the user was waiting for a match, clear the waiting state
        if (waitingUser && waitingUser.socket.id === socket.id) {
            waitingUser = null;
        }

        console.log("User disconnected: " + socket.id);
    });
});

// Start the server on port 3000
server.listen(3000, () => {
    console.log("Server is running on port 3000");
});
