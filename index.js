const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const rooms = {};

io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  socket.on("ping", () => {
    console.log("💓 Ping received from", socket.id);
    socket.emit("pong");
  });

  socket.on("create_room", ({ roomId, host }) => {
    console.log("📥 create_room:", roomId, "host:", host);
    if (!rooms[roomId]) {
      rooms[roomId] = [socket.id];
      socket.join(roomId);
      io.to(roomId).emit("room_created", { roomId, host });
      console.log("✅ Room created:", roomId);
    } else {
      socket.emit("error", { message: "Room already exists" });
      console.log("⚠️ Room already exists:", roomId);
    }
  });

  socket.on("join", (roomId) => {
    console.log("📥 join:", roomId, "by", socket.id);
    socket.join(roomId);
    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push(socket.id);
    io.to(roomId).emit("players", rooms[roomId]);
    console.log("👥 Players in room", roomId, ":", rooms[roomId]);
  });

  socket.on("play_card", ({ roomId, card }) => {
    console.log("📤 play_card in room", roomId, ":", card);
    socket.to(roomId).emit("card_played", { playerId: socket.id, card });
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      io.to(roomId).emit("players", rooms[roomId]);
      console.log("👥 Players in room", roomId, "after disconnect:", rooms[roomId]);
    }
  });
});

server.listen(3001, () => {
  console.log("✅ Server running on port 3001");
});
