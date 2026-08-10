const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const http = require('http');

if (cluster.isMaster) {
  console.log(`Master process ${process.pid} is running`);
  
  const server = http.createServer();
  const { setupMaster } = require('@socket.io/sticky');
  
  setupMaster(server, {
    loadBalancingMethod: "least-connection",
  });
  
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`Master server is running and routing traffic on http://localhost:${port}`);
  });
  
  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker process ${worker.process.pid} died. Spawning a new worker...`);
    cluster.fork();
  });
} else {
  // Worker processes code
  const express = require('express');
  const bodyParser = require('body-parser');
  const quizRoutes = require('./routes/quizRoutes');
  const roomManager = require('./services/roomManager');
  require('dotenv').config();

  const app = express();
  app.set('trust proxy', 1);

  const server = http.createServer(app);
  const io = require('socket.io')(server);
  
  // Setup sticky connection handling for workers
  const { setupWorker } = require('@socket.io/sticky');
  setupWorker(io);

  // Setup Redis adapter for inter-worker Socket.IO communication
  const { createAdapter } = require('@socket.io/redis-adapter');
  const Redis = require('ioredis');
  
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const pubClient = new Redis(redisUrl);
  const subClient = pubClient.duplicate();
  
  io.adapter(createAdapter(pubClient, subClient));

  app.set('view engine', 'ejs');
  app.set('views', './views');

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(express.static('public'));

  const session = require('express-session');
  const adminRoutes = require('./routes/adminRoutes');
  const authRoutes = require('./routes/authRoutes');
  const spacedRepetitionRoutes = require('./routes/spacedRepetitionRoutes');

  app.use(session({
    secret: 'quizzard-secret-key-13579',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
  }));

  app.use('/api/quiz', quizRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/spaced', spacedRepetitionRoutes);
  app.use('/admin', adminRoutes);

  app.get('/', (req, res) => {
    res.render('welcome');
  });

  app.get('/quiz', (req, res) => {
    res.render('index');
  });

  app.get('/quiz/spectate/:roomCode', (req, res) => {
    const { roomCode } = req.params;
    res.render('spectate', { roomCode });
  });

  app.get('/result', (req, res) => {
    const { score, total, opponentName, opponentScore, coop, groupAccuracy } = req.query;
    let message = 'Better luck next time!';
    
    if (coop === 'true') {
      const accuracy = parseInt(groupAccuracy, 10) || 100;
      if (accuracy >= 80) {
        message = `🌟 Fantastic Teamwork! Group Accuracy: ${accuracy}%`;
      } else if (accuracy >= 50) {
        message = `👍 Good effort! Group Accuracy: ${accuracy}%`;
      } else {
        message = `📚 Keep practicing together! Group Accuracy: ${accuracy}%`;
      }
    } else if (opponentName) {
      const myScore = parseInt(score, 10);
      const oppScore = parseInt(opponentScore, 10);
      if (myScore > oppScore) {
        message = `👑 You beat ${opponentName}!`;
      } else if (myScore < oppScore) {
        message = `😢 You were defeated by ${opponentName}.`;
      } else {
        message = `🤝 It's a tie game!`;
      }
    } else {
      if (score >= 1 && score <= 2) {
        message = 'Way to go!';
      } else if (score >= 3 && score <= 4) {
        message = 'Good job!';
      } else if (score == 5) {
        message = 'Excellent!';
      }
    }
    res.render('result', { score, total, message, opponentName, opponentScore, coop, groupAccuracy });
  });

  app.get('/leaderboard/:sectionId', async (req, res) => {
    const { sectionId } = req.params;
    try {
      const db = require('./db');
      const leaderboard = await db.getChallengeLeaderboard(sectionId);
      const section = await db.getSectionById(sectionId);
      res.render('leaderboard', { leaderboard, sectionName: section ? section.name : 'Unknown Topic', sectionId });
    } catch (err) {
      console.error(err);
      res.status(500).send('Error loading leaderboard');
    }
  });

  // Socket.io Multiplayer Lobby & Game loops
  io.on('connection', (socket) => {
    console.log(`User connected on worker ${process.pid}:`, socket.id);

    socket.on('joinSpectator', async ({ roomCode }) => {
      const room = await roomManager.getRoom(roomCode);
      if (!room) {
        socket.emit('errorMessage', 'Room not found.');
        return;
      }
      socket.join(roomCode);
      socket.emit('spectatorState', {
        mode: room.mode,
        players: room.players.map(p => ({ name: p.name, score: p.score }))
      });
    });

    socket.on('createRoom', async ({ userName, sectionId, difficulty, count, mode }) => {
      const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
      const newRoom = {
        sectionId,
        difficulty,
        count: parseInt(count, 10) || 5,
        mode: mode || 'competitive',
        players: [{ name: userName, socketId: socket.id, score: 0, answersCount: 0, correctCount: 0 }],
        currentQuestionIndex: 0,
        questions: [],
        answersReceived: 0,
        firstCorrectSocketId: null
      };
      await roomManager.saveRoom(roomCode, newRoom);
      await roomManager.setSocketRoomMapping(socket.id, roomCode);
      socket.join(roomCode);
      socket.emit('roomCreated', { roomCode });
    });

    // Live Multiplayer Matchmaking Queue
    const matchmakingQueue = [];

    function removeFromMatchmakingQueue(socketId) {
      const idx = matchmakingQueue.findIndex(item => item.socketId === socketId);
      if (idx > -1) {
        matchmakingQueue.splice(idx, 1);
      }
    }

    socket.on('joinMatchmaking', async ({ userName, sectionId, difficulty, count, mode }) => {
      removeFromMatchmakingQueue(socket.id);

      const targetSec = String(sectionId || '1');
      const targetDiff = String(difficulty || 'medium');
      const targetMode = String(mode || 'competitive');

      // Find compatible match in queue
      const opponentIdx = matchmakingQueue.findIndex(item =>
        item.socketId !== socket.id &&
        String(item.sectionId) === targetSec &&
        String(item.difficulty) === targetDiff &&
        String(item.mode) === targetMode
      );

      if (opponentIdx > -1) {
        const opponent = matchmakingQueue.splice(opponentIdx, 1)[0];
        const roomCode = Math.floor(100000 + Math.random() * 900000).toString();

        const newRoom = {
          sectionId: targetSec,
          difficulty: targetDiff,
          count: parseInt(count, 10) || 5,
          mode: targetMode,
          players: [
            { name: opponent.userName, socketId: opponent.socketId, score: 0, answersCount: 0, correctCount: 0 },
            { name: userName, socketId: socket.id, score: 0, answersCount: 0, correctCount: 0 }
          ],
          currentQuestionIndex: 0,
          questions: [],
          answersReceived: 0,
          firstCorrectSocketId: null
        };

        await roomManager.saveRoom(roomCode, newRoom);
        await roomManager.setSocketRoomMapping(opponent.socketId, roomCode);
        await roomManager.setSocketRoomMapping(socket.id, roomCode);

        const opponentSocket = io.sockets.sockets.get(opponent.socketId);
        if (opponentSocket) opponentSocket.join(roomCode);
        socket.join(roomCode);

        const matchData = {
          roomCode,
          sectionId: targetSec,
          difficulty: targetDiff,
          count: newRoom.count,
          mode: targetMode,
          players: newRoom.players.map(p => ({ name: p.name, score: p.score }))
        };

        io.to(roomCode).emit('matchFound', matchData);
        io.to(roomCode).emit('roomReady', matchData);
      } else {
        matchmakingQueue.push({
          socketId: socket.id,
          userName: userName || 'Anonymous',
          sectionId: targetSec,
          difficulty: targetDiff,
          count: parseInt(count, 10) || 5,
          mode: targetMode,
          timestamp: Date.now()
        });
        socket.emit('matchmakingQueued', { status: 'Searching for an opponent...' });
      }
    });

    socket.on('leaveMatchmaking', () => {
      removeFromMatchmakingQueue(socket.id);
      socket.emit('matchmakingLeft');
    });

    socket.on('joinRoom', async ({ roomCode, userName }) => {
      const room = await roomManager.getRoom(roomCode);
      if (!room) {
        socket.emit('errorMessage', 'Room not found.');
        return;
      }
      const maxPlayers = room.mode === 'cooperative' ? 4 : 2;
      if (room.players.length >= maxPlayers) {
        socket.emit('errorMessage', 'Room is full.');
        return;
      }
      
      room.players.push({ name: userName, socketId: socket.id, score: 0, answersCount: 0, correctCount: 0 });
      await roomManager.saveRoom(roomCode, room);
      await roomManager.setSocketRoomMapping(socket.id, roomCode);
      socket.join(roomCode);
      
      io.to(roomCode).emit('roomReady', {
        roomCode,
        sectionId: room.sectionId,
        difficulty: room.difficulty,
        count: room.count,
        mode: room.mode,
        players: room.players.map(p => ({ name: p.name, score: p.score }))
      });
    });

    socket.on('quizReady', async ({ roomCode }) => {
      const room = await roomManager.getRoom(roomCode);
      if (!room) return;
      socket.join(roomCode);

      if (room.questions.length === 0) {
        const db = require('./db');
        const allQuestions = await db.getQuestions(room.sectionId, room.difficulty);
        let finalQuestions = [...allQuestions];
        const isAI = isNaN(parseInt(room.sectionId, 10)) || room.sectionId.toString().includes('ai');
        
        if (!isAI) {
          for (let i = finalQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [finalQuestions[i], finalQuestions[j]] = [finalQuestions[j], finalQuestions[i]];
          }
          finalQuestions = finalQuestions.slice(0, room.count);
        }
        room.questions = finalQuestions;
        await roomManager.saveRoom(roomCode, room);
      }

      socket.emit('scoreboardUpdate', { players: room.players.map(p => ({ name: p.name, score: p.score })) });

      const qIndex = room.currentQuestionIndex;
      if (qIndex < room.questions.length) {
        socket.emit('loadQuestion', {
          questionIndex: qIndex,
          totalQuestions: room.questions.length,
          question: room.questions[qIndex]
        });
      }
    });

    socket.on('submitAnswer', async ({ roomCode, answerVal }) => {
      const room = await roomManager.getRoom(roomCode);
      if (!room) return;

      const qIndex = room.currentQuestionIndex;
      if (qIndex >= room.questions.length) return;

      const question = room.questions[qIndex];
      const isCorrect = parseInt(answerVal, 10) === question.correct_option;

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;

      if (room.mode === 'cooperative') {
        player.answersCount = (player.answersCount || 0) + 1;
        if (isCorrect) {
          player.correctCount = (player.correctCount || 0) + 1;
          player.score += 1;
        }
        player.lastAnswerCorrect = isCorrect;
      } else {
        if (isCorrect && !room.firstCorrectSocketId) {
          room.firstCorrectSocketId = socket.id;
          player.score += 1;
          io.to(roomCode).emit('firstCorrect', { winnerName: player.name });
        }
      }

      room.answersReceived += 1;
      await roomManager.saveRoom(roomCode, room);

      if (room.answersReceived >= room.players.length) {
        let groupAccuracy = 0;
        let totalAnswers = 0;
        let totalCorrect = 0;
        let playerAnswers = [];
        
        if (room.mode === 'cooperative') {
          room.players.forEach(p => {
            totalAnswers += (p.answersCount || 0);
            totalCorrect += (p.correctCount || 0);
            playerAnswers.push({ name: p.name, correct: p.lastAnswerCorrect });
          });
          groupAccuracy = totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0;
        }

        io.to(roomCode).emit('revealAnswer', {
          correctOption: question.correct_option,
          explanation: question.explanation,
          mode: room.mode,
          groupAccuracy,
          playerAnswers
        });

        io.to(roomCode).emit('scoreboardUpdate', { players: room.players.map(p => ({ name: p.name, score: p.score })) });

        setTimeout(async () => {
          const currentRoom = await roomManager.getRoom(roomCode);
          if (!currentRoom) return;

          currentRoom.currentQuestionIndex += 1;
          currentRoom.answersReceived = 0;
          currentRoom.firstCorrectSocketId = null;

          if (currentRoom.currentQuestionIndex < currentRoom.questions.length) {
            await roomManager.saveRoom(roomCode, currentRoom);
            io.to(roomCode).emit('loadQuestion', {
              questionIndex: currentRoom.currentQuestionIndex,
              totalQuestions: currentRoom.questions.length,
              question: currentRoom.questions[currentRoom.currentQuestionIndex]
            });
          } else {
            // Clean up mapping and delete room
            for (const p of currentRoom.players) {
              await roomManager.deleteSocketRoomMapping(p.socketId);
            }
            await roomManager.deleteRoom(roomCode);
            io.to(roomCode).emit('quizEnded', {
              mode: currentRoom.mode,
              groupAccuracy: currentRoom.mode === 'cooperative' ? groupAccuracy : null,
              players: currentRoom.players.map(p => ({ name: p.name, score: p.score }))
            });
          }
        }, 4000);
      } else {
        socket.to(roomCode).emit('playerSubmitted', { name: player.name });
      }
    });

    socket.on('rejoinRoom', async ({ roomCode, userName }) => {
      const room = await roomManager.getRoom(roomCode);
      if (!room) return;

      const player = room.players.find(p => p.name === userName);
      if (player) {
        player.socketId = socket.id;
        await roomManager.saveRoom(roomCode, room);
        await roomManager.setSocketRoomMapping(socket.id, roomCode);
      }

      socket.join(roomCode);
      socket.emit('scoreboardUpdate', { players: room.players.map(p => ({ name: p.name, score: p.score })) });

      const qIndex = room.currentQuestionIndex;
      if (qIndex < room.questions.length) {
        socket.emit('loadQuestion', {
          questionIndex: qIndex,
          totalQuestions: room.questions.length,
          question: room.questions[qIndex]
        });
      }
    });

    const lastChatMap = new Map();

    socket.on('sendChatMessage', async ({ roomCode, userName, message }) => {
      if (!roomCode || !message || typeof message !== 'string') return;
      const trimmed = message.trim().slice(0, 200);
      if (!trimmed) return;

      const now = Date.now();
      const last = lastChatMap.get(socket.id) || 0;
      if (now - last < 500) {
        socket.emit('chatError', 'Sending messages too fast!');
        return;
      }
      lastChatMap.set(socket.id, now);

      io.to(roomCode).emit('newChatMessage', {
        userName: userName || 'Anonymous',
        message: trimmed,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    });

    socket.on('disconnect', async () => {
      const socketIdToClean = socket.id;
      removeFromMatchmakingQueue(socketIdToClean);
      // 5-second grace period for brief disconnects
      setTimeout(async () => {
        const roomCode = await roomManager.getRoomCodeBySocket(socketIdToClean);
        if (roomCode) {
          const room = await roomManager.getRoom(roomCode);
          if (room) {
            const playerIndex = room.players.findIndex(p => p.socketId === socketIdToClean);
            if (playerIndex > -1) {
              room.players.splice(playerIndex, 1);
              await roomManager.deleteSocketRoomMapping(socketIdToClean);
              
              if (room.players.length === 0) {
                await roomManager.deleteRoom(roomCode);
              } else {
                await roomManager.saveRoom(roomCode, room);
                io.to(roomCode).emit('playerDisconnected', 'Opponent disconnected.');
              }
            }
          }
        }
      }, 5000);
    });
  });
}