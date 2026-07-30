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

module.exports = router;
