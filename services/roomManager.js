const Redis = require('ioredis');

let redisClient = null;
let isRedisConnected = false;

// Memory fallback store for rooms
const memoryRooms = new Map();
// Memory fallback for socketId -> roomCode mappings
const memorySocketRooms = new Map();

try {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 100, 1000);
    }
  });

  redisClient.on('connect', () => {
    console.log('RoomManager Redis connecting...');
  });

  redisClient.on('ready', () => {
    console.log('RoomManager Redis ready.');
    isRedisConnected = true;
  });

  redisClient.on('error', (err) => {
    console.warn('RoomManager Redis error, using memory fallback:', err.message);
    isRedisConnected = false;
  });

  redisClient.on('close', () => {
    console.warn('RoomManager Redis connection closed, using memory fallback.');
    isRedisConnected = false;
  });
} catch (err) {
  console.warn('RoomManager failed to initialize Redis, using memory fallback:', err.message);
  isRedisConnected = false;
}

// Convert flat Redis hash object to room state object
function deserializeRoom(hashObj) {
  if (!hashObj || Object.keys(hashObj).length === 0) return null;
  return {
    sectionId: hashObj.sectionId,
    difficulty: hashObj.difficulty,
    count: parseInt(hashObj.count, 10) || 0,
    mode: hashObj.mode,
    currentQuestionIndex: parseInt(hashObj.currentQuestionIndex, 10) || 0,
    answersReceived: parseInt(hashObj.answersReceived, 10) || 0,
    firstCorrectSocketId: hashObj.firstCorrectSocketId || null,
    players: hashObj.players ? JSON.parse(hashObj.players) : [],
    questions: hashObj.questions ? JSON.parse(hashObj.questions) : []
  };
}

// Convert room state object to flat Redis hash object
function serializeRoom(room) {
  return {
    sectionId: String(room.sectionId),
    difficulty: String(room.difficulty),
    count: String(room.count),
    mode: String(room.mode),
    currentQuestionIndex: String(room.currentQuestionIndex),
    answersReceived: String(room.answersReceived),
    firstCorrectSocketId: room.firstCorrectSocketId || '',
    players: JSON.stringify(room.players || []),
    questions: JSON.stringify(room.questions || [])
  };
}

async function getRoom(roomCode) {
  if (isRedisConnected && redisClient) {
    try {
      const data = await redisClient.hgetall(`room:${roomCode}`);
      return deserializeRoom(data);
    } catch (err) {
      console.warn(`Redis error in getRoom for ${roomCode}:`, err.message);
    }
  }
  return memoryRooms.get(roomCode) || null;
}

async function saveRoom(roomCode, room) {
  const serialized = serializeRoom(room);
  if (isRedisConnected && redisClient) {
    try {
      const key = `room:${roomCode}`;
      await redisClient.hset(key, serialized);
      // Set a TTL of 2 hours so stale rooms are auto-cleaned
      await redisClient.expire(key, 7200);
      return;
    } catch (err) {
      console.warn(`Redis error in saveRoom for ${roomCode}:`, err.message);
    }
  }
  memoryRooms.set(roomCode, room);
}

async function deleteRoom(roomCode) {
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.del(`room:${roomCode}`);
      return;
    } catch (err) {
      console.warn(`Redis error in deleteRoom for ${roomCode}:`, err.message);
    }
  }
  memoryRooms.delete(roomCode);
}

async function getRoomCodeBySocket(socketId) {
  if (isRedisConnected && redisClient) {
    try {
      return await redisClient.get(`socket:room:${socketId}`);
    } catch (err) {
      console.warn(`Redis error in getRoomCodeBySocket for ${socketId}:`, err.message);
    }
  }
  return memorySocketRooms.get(socketId) || null;
}

async function setSocketRoomMapping(socketId, roomCode) {
  if (isRedisConnected && redisClient) {
    try {
      const key = `socket:room:${socketId}`;
      await redisClient.set(key, roomCode);
      await redisClient.expire(key, 7200); // 2 hours expiration
      return;
    } catch (err) {
      console.warn(`Redis error in setSocketRoomMapping for ${socketId}:`, err.message);
    }
  }
  memorySocketRooms.set(socketId, roomCode);
}

async function deleteSocketRoomMapping(socketId) {
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.del(`socket:room:${socketId}`);
      return;
    } catch (err) {
      console.warn(`Redis error in deleteSocketRoomMapping for ${socketId}:`, err.message);
    }
  }
  memorySocketRooms.delete(socketId);
}

// Support scanning all rooms for disconnected sockets as backup/fallback
async function getAllRoomCodes() {
  if (isRedisConnected && redisClient) {
    try {
      const keys = await redisClient.keys('room:*');
      return keys.map(k => k.split(':')[1]);
    } catch (err) {
      console.warn('Redis error scanning keys:', err.message);
    }
  }
  return Array.from(memoryRooms.keys());
}

module.exports = {
  getRoom,
  saveRoom,
  deleteRoom,
  getRoomCodeBySocket,
  setSocketRoomMapping,
  deleteSocketRoomMapping,
  getAllRoomCodes
};
