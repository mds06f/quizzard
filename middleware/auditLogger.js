const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const AUDIT_LOG_FILE = path.join(LOGS_DIR, 'admin_audit.log');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function auditLog(actionType, targetSection, ip, adminId) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] IP: ${ip} | AdminID: ${adminId} | Action: ${actionType} | Target: ${targetSection}\n`;
  
  try {
    fs.appendFileSync(AUDIT_LOG_FILE, logLine, 'utf8');
  } catch (err) {
    console.error('Failed to write admin audit log:', err);
  }
}

// Express middleware helper
function auditLogger(actionType) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const adminId = req.session && req.session.isAdmin ? 'admin' : 'unauthenticated';
    
    res.on('finish', () => {
      // Log successful CRUD actions
      if (res.statusCode >= 200 && res.statusCode < 400) {
        let target = 'unknown';
        if (req.params.id) {
          target = `ID: ${req.params.id}`;
        } else if (req.body.name) {
          target = `Name: ${req.body.name}`;
        } else if (req.body.question) {
          target = `Question: ${req.body.question.substring(0, 30)}...`;
        } else if (req.body.section_id) {
          target = `Section ID: ${req.body.section_id}`;
        }
        
        auditLog(actionType, target, ip, adminId);
      }
    });

    next();
  };
}

module.exports = {
  auditLog,
  auditLogger
};
