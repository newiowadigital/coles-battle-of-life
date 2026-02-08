// netlify/functions/create-room.js

const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Generate 6-character join code
function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude similar chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

exports.handler = async (event) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { userId, username, mode } = JSON.parse(event.body);

    // Validation
    if (!userId || !username) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    if (mode < 2 || mode > 16) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid mode (must be 2-16)' })
      };
    }

    // Generate unique join code
    let joinCode;
    let codeExists = true;
    
    while (codeExists) {
      joinCode = generateJoinCode();
      const checkResult = await pool.query(
        'SELECT id FROM rooms WHERE join_code = $1',
        [joinCode]
      );
      codeExists = checkResult.rows.length > 0;
    }

    // Create room
    const roomResult = await pool.query(
      `INSERT INTO rooms (join_code, mode, status, host_user_id, created_at)
       VALUES ($1, $2, 'waiting', $3, NOW())
       RETURNING id`,
      [joinCode, mode, userId]
    );

    const roomId = roomResult.rows[0].id;

    // Add host as first player
    await pool.query(
      `INSERT INTO players (room_id, user_id, username, is_host, ready, joined_at)
       VALUES ($1, $2, $3, true, false, NOW())`,
      [roomId, userId, username]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        roomId,
        joinCode,
        mode,
        message: 'Room created successfully'
      })
    };

  } catch (error) {
    console.error('Error creating room:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
