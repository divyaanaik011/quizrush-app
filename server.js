const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const questions = JSON.parse(fs.readFileSync(path.join(__dirname, "questions.json"), "utf-8"));

// In-memory room storage
// rooms[roomCode] = {
//   hostId, players: { socketId: { name, score, answeredThisRound } },
//   currentQuestion: -1, questionStartTime: null, state: "lobby" | "question" | "leaderboard" | "ended"
// }
const rooms = {};

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms[code]);
  return code;
}

function getLeaderboard(room) {
  return Object.values(room.players)
    .map((p) => ({ name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score);
}

function getPlayerList(room) {
  return Object.values(room.players).map((p) => ({ name: p.name, score: p.score }));
}

io.on("connection", (socket) => {
  // ---- HOST: create a new room ----
  socket.on("create-room", () => {
    const code = generateRoomCode();
    rooms[code] = {
      hostId: socket.id,
      players: {},
      currentQuestion: -1,
      questionStartTime: null,
      state: "lobby",
    };
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.isHost = true;
    socket.emit("room-created", { roomCode: code });
  });

  // ---- PLAYER: join an existing room ----
  socket.on("join-room", ({ roomCode, name }) => {
    roomCode = (roomCode || "").toUpperCase().trim();
    const room = rooms[roomCode];
    if (!room) {
      socket.emit("join-error", { message: "Room not found. Check the code and try again." });
      return;
    }
    if (room.state !== "lobby") {
      socket.emit("join-error", { message: "This quiz has already started." });
      return;
    }
    if (!name || !name.trim()) {
      socket.emit("join-error", { message: "Please enter a name." });
      return;
    }

    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.isHost = false;
    room.players[socket.id] = { name: name.trim().slice(0, 20), score: 0, answeredThisRound: false };

    socket.emit("join-success", { roomCode });
    io.to(room.hostId).emit("player-list-update", getPlayerList(room));
  });

  // ---- HOST: start the quiz ----
  socket.on("start-quiz", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room || socket.id !== room.hostId) return;
    if (Object.keys(room.players).length === 0) {
      socket.emit("host-error", { message: "Need at least one player to start." });
      return;
    }
    sendNextQuestion(roomCode);
  });

  function sendNextQuestion(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    room.currentQuestion += 1;

    if (room.currentQuestion >= questions.length) {
      room.state = "ended";
      const finalBoard = getLeaderboard(room);
      io.to(roomCode).emit("quiz-ended", { leaderboard: finalBoard });
      return;
    }

    room.state = "question";
    room.questionStartTime = Date.now();
    Object.values(room.players).forEach((p) => (p.answeredThisRound = false));

    const q = questions[room.currentQuestion];
    io.to(roomCode).emit("new-question", {
      index: room.currentQuestion,
      total: questions.length,
      question: q.question,
      options: q.options,
      timeLimitSeconds: 15,
    });
  }

  // ---- PLAYER: submit an answer ----
  socket.on("submit-answer", ({ answerIndex }) => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room || room.state !== "question") return;
    const player = room.players[socket.id];
    if (!player || player.answeredThisRound) return;

    player.answeredThisRound = true;
    const q = questions[room.currentQuestion];
    const elapsedMs = Date.now() - room.questionStartTime;
    const timeLimitMs = 15000;
    const isCorrect = answerIndex === q.correctIndex;

    if (isCorrect) {
      // Base 500 points + up to 500 speed bonus (faster = more points)
      const speedBonus = Math.max(0, Math.round(500 * (1 - elapsedMs / timeLimitMs)));
      player.score += 500 + speedBonus;
    }

    socket.emit("answer-result", { correct: isCorrect, correctIndex: q.correctIndex, scoreNow: player.score });

    const answeredCount = Object.values(room.players).filter((p) => p.answeredThisRound).length;
    io.to(room.hostId).emit("answer-progress", {
      answered: answeredCount,
      total: Object.keys(room.players).length,
    });

    // If everyone has answered, auto-reveal leaderboard to host
    if (answeredCount === Object.keys(room.players).length) {
      revealRoundResults(roomCode);
    }
  });

  function revealRoundResults(roomCode) {
    const room = rooms[roomCode];
    if (!room || room.state !== "question") return;
    room.state = "leaderboard";
    io.to(roomCode).emit("round-results", {
      leaderboard: getLeaderboard(room),
      isLastQuestion: room.currentQuestion >= questions.length - 1,
    });
  }

  // ---- HOST: force-reveal results early (in case not everyone answers) ----
  socket.on("reveal-results", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room || socket.id !== room.hostId) return;
    revealRoundResults(roomCode);
  });

  // ---- HOST: advance to next question ----
  socket.on("next-question", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room || socket.id !== room.hostId) return;
    sendNextQuestion(roomCode);
  });

  // ---- Disconnect handling ----
  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room) return;

    if (socket.data.isHost) {
      io.to(roomCode).emit("host-disconnected");
      delete rooms[roomCode];
    } else if (room.players[socket.id]) {
      delete room.players[socket.id];
      io.to(room.hostId).emit("player-list-update", getPlayerList(room));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Quiz app server running on http://localhost:${PORT}`);
});
