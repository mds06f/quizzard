const express = require('express');
const bodyParser = require('body-parser');
const quizRoutes = require('./routes/quizRoutes');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.set('view engine', 'ejs');
app.set('views', './views');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const session = require('express-session');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');

app.use(session({
  secret: 'quizzard-secret-key-13579',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

app.use('/api/quiz', quizRoutes);
app.use('/api/auth', authRoutes);
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
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinSpectator', ({ roomCode }) => {
    const room = rooms[roomCode];
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

  socket.on('createRoom', ({ userName, sectionId, difficulty, count, mode }) => {
    const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    rooms[roomCode] = {
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
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode });
  });

  socket.on('joinRoom', ({ roomCode, userName }) => {
    const room = rooms[roomCode];
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
    const room = rooms[roomCode];
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

  socket.on('submitAnswer', ({ roomCode, answerVal }) => {
    const room = rooms[roomCode];
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

      setTimeout(() => {
        room.currentQuestionIndex += 1;
        room.answersReceived = 0;
        room.firstCorrectSocketId = null;

        if (room.currentQuestionIndex < room.questions.length) {
          io.to(roomCode).emit('loadQuestion', {
            questionIndex: room.currentQuestionIndex,
            totalQuestions: room.questions.length,
            question: room.questions[room.currentQuestionIndex]
          });
        } else {
          io.to(roomCode).emit('quizEnded', {
            mode: room.mode,
            groupAccuracy: room.mode === 'cooperative' ? groupAccuracy : null,
            players: room.players.map(p => ({ name: p.name, score: p.score }))
          });
          delete rooms[roomCode];
        }
      }, 4000);
    } else {
      socket.to(roomCode).emit('playerSubmitted', { name: player.name });
    }
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex > -1) {
        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) {
          delete rooms[code];
        } else {
          io.to(code).emit('playerDisconnected', 'Opponent disconnected.');
        }
      }
    }
  });
});

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});