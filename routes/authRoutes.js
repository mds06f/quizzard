const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPassword, comparePassword, generateToken, verifyToken } = require('../middleware/auth');

// Register endpoint
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required.' });
  }

  if (username.trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  try {
    const existingUser = await db.findUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username is already taken.' });
    }

    const existingEmail = await db.findUserByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ error: 'Email is already registered.' });
    }

    const passwordHash = hashPassword(password);
    const user = await db.createUser(username.trim(), email.trim(), passwordHash);
    const token = generateToken(user);

    res.status(201).json({
      message: 'Registration successful',
      token,
      user
    });
  } catch (err) {
    console.error('Error during registration:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    let user = await db.findUserByUsername(username);
    if (!user) {
      user = await db.findUserByEmail(username);
    }

    if (!user || !comparePassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = generateToken({ id: user.id, username: user.username, email: user.email });

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// Get current user profile endpoint
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user });
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: 'Server error fetching user profile.' });
  }
});

// POST refresh-token endpoint
router.post('/refresh-token', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.body.token || req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'No token provided.' });
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return res.status(401).json({ error: 'Invalid token format.' });
    }

    const [header, payload, signature] = parts;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    
    // Check signature
    const crypto = require('crypto');
    const JWT_SECRET = process.env.JWT_SECRET || 'quizzard_super_secret_jwt_key_2026';
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');

    if (signature !== expectedSignature) {
      return res.status(401).json({ error: 'Invalid token signature.' });
    }

    // Generate fresh token
    const newToken = generateToken({ id: decoded.id, username: decoded.username, email: decoded.email });
    res.json({ token: newToken });
  } catch (err) {
    console.error('Error auto-refreshing JWT session token:', err);
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

module.exports = router;
