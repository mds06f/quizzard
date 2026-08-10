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

// GET /api/auth/github - OAuth redirect to GitHub
router.get('/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (clientId && clientId !== 'mock_client_id') {
    const redirectUri = encodeURIComponent(process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/auth/github/callback');
    return res.redirect(`https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email`);
  }
  // Simulated OAuth flow for testing/development when credentials not set
  res.redirect('/api/auth/github/callback?code=mock_github_code');
});

// GET /api/auth/github/callback
router.get('/github/callback', async (req, res) => {
  const { code } = req.query;
  try {
    let profile = {
      username: 'GitHubUser_' + Math.floor(100 + Math.random() * 900),
      email: `github_user_${Date.now().toString().slice(-4)}@oauth.github.com`
    };

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (clientId && clientSecret && code && code !== 'mock_github_code') {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
      });
      const tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        const userRes = await fetch('https://api.github.com/user', {
          headers: { 'Authorization': `token ${tokenData.access_token}`, 'User-Agent': 'Quizzard-App' }
        });
        const userData = await userRes.json();
        if (userData.login) {
          profile.username = userData.login;
          profile.email = userData.email || `${userData.login}@users.noreply.github.com`;
        }
      }
    }

    let user = await db.findUserByEmail(profile.email);
    if (!user) {
      user = await db.findUserByUsername(profile.username);
    }
    if (!user) {
      user = await db.createUser(profile.username, profile.email, 'OAUTH_EXTERNAL_USER');
    }

    const token = generateToken({ id: user.id, username: user.username, email: user.email });
    res.redirect(`/?oauth=success&token=${encodeURIComponent(token)}&username=${encodeURIComponent(user.username)}`);
  } catch (err) {
    console.error('Error during GitHub OAuth callback:', err);
    res.redirect('/?oauth=error');
  }
});

// GET /api/auth/google - OAuth redirect to Google
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (clientId && clientId !== 'mock_client_id') {
    const redirectUri = encodeURIComponent(process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback');
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20profile%20email`);
  }
  // Simulated OAuth flow for testing/development when credentials not set
  res.redirect('/api/auth/google/callback?code=mock_google_code');
});

// GET /api/auth/google/callback
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    let profile = {
      username: 'GoogleUser_' + Math.floor(100 + Math.random() * 900),
      email: `google_user_${Date.now().toString().slice(-4)}@oauth.google.com`
    };

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (clientId && clientSecret && code && code !== 'mock_google_code') {
      const redirectUri = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });
      const tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const userData = await userRes.json();
        if (userData.email) {
          profile.username = userData.name ? userData.name.replace(/\s+/g, '_') : userData.email.split('@')[0];
          profile.email = userData.email;
        }
      }
    }

    let user = await db.findUserByEmail(profile.email);
    if (!user) {
      user = await db.findUserByUsername(profile.username);
    }
    if (!user) {
      user = await db.createUser(profile.username, profile.email, 'OAUTH_EXTERNAL_USER');
    }

    const token = generateToken({ id: user.id, username: user.username, email: user.email });
    res.redirect(`/?oauth=success&token=${encodeURIComponent(token)}&username=${encodeURIComponent(user.username)}`);
  } catch (err) {
    console.error('Error during Google OAuth callback:', err);
    res.redirect('/?oauth=error');
  }
});

module.exports = router;
