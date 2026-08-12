# QuizRush — Real-Time Multiplayer Quiz App

A Kahoot-style live quiz built with Node.js, Express, and Socket.io. One person hosts a quiz room and shares a room code; others join from their phones and answer questions in real time, with scoring based on correctness and speed.

## Features
- Real-time host + player sync over WebSockets (Socket.io)
- Auto-generated 5-letter room codes
- Speed-based scoring (faster correct answers score higher)
- Live "X of Y answered" progress on the host screen
- Round-by-round leaderboard and a final results screen
- No database needed to run — questions are loaded from `questions.json`

## Tech Stack
- Backend: Node.js, Express, Socket.io
- Frontend: Plain HTML/CSS/JS (no build step)

## Project Structure
```
quiz-app/
├── server.js          # Express + Socket.io server, all game logic
├── questions.json      # Quiz questions (edit this to add your own)
├── package.json
└── public/
    ├── index.html      # Landing page (host or join)
    ├── host.html        # Host console
    ├── player.html       # Player screen
    └── style.css         # Shared styling
```

## Setup

1. Make sure you have [Node.js](https://nodejs.org/) installed (v16+).
2. Install dependencies:
   ```
   npm install
   ```
3. Start the server:
   ```
   npm start
   ```
4. Open `http://localhost:3000` in your browser.

## How to Demo It
1. Open `http://localhost:3000/host.html` on your laptop — this is the host screen and will show a room code.
2. On your phone (or a friend's), open `http://localhost:3000/player.html`. If demoing on the same WiFi network, use your laptop's local IP instead of `localhost` (e.g. `http://192.168.1.5:3000/player.html`) so other devices can reach it.
3. Enter the room code and a name to join.
4. Once a few players have joined, click "Start Quiz" on the host screen.
5. Questions appear on all screens simultaneously; players tap an answer, and the host sees live progress and a leaderboard after each round.

## Customizing Questions
Edit `questions.json`. Each entry needs:
```json
{
  "question": "Your question text",
  "options": ["A", "B", "C", "D"],
  "correctIndex": 0
}
```

## Deploying (so you can share a live link)
This app needs a persistent Node.js process with WebSocket support (not a static host). Good free/cheap options:
- **Render** — connect your GitHub repo, set the start command to `npm start`
- **Railway** — similar, one-click deploy from GitHub

Once deployed, share the live URL instead of localhost — no need for everyone to be on the same WiFi.

## Possible Extensions (good for a resume writeup)
- Persist rooms/scores in a SQL database instead of memory, so history survives restarts
- Add a Power BI or chart-based post-quiz analytics view (accuracy per question, average response time)
- Let the host create custom question sets through a form instead of editing JSON
- Add authentication so hosts can save and reuse quiz sets
