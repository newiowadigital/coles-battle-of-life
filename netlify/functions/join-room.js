// netlify/functions/join-room.js

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

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
    const { userId, username, joinCode } = JSON.parse(event.body);

    if (!userId || !username || !joinCode) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Find room by join code
    const roomResult = await pool.query(
      'SELECT id, mode, status FROM rooms WHERE join_code = $1',
      [joinCode.toUpperCase()]
    );

    if (roomResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Room not found' })
      };
    }

    const room = roomResult.rows[0];

    // Check if room is already playing
    if (room.status === 'playing') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Game already in progress' })
      };
    }

    if (room.status === 'finished') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Game has ended' })
      };
    }

    // Check if player already in room
    const existingPlayer = await pool.query(
      'SELECT id FROM players WHERE room_id = $1 AND user_id = $2',
      [room.id, userId]
    );

    if (existingPlayer.rows.length > 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          roomId: room.id,
          mode: room.mode,
          message: 'Already in room'
        })
      };
    }

    // Check max players (can't exceed mode count)
    const playerCount = await pool.query(
      'SELECT COUNT(*) FROM players WHERE room_id = $1',
      [room.id]
    );

    if (parseInt(playerCount.rows[0].count) >= room.mode) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Room is full' })
      };
    }

    // Add player to room
    await pool.query(
      `INSERT INTO players (room_id, user_id, username, is_host, ready, joined_at)
       VALUES ($1, $2, $3, false, false, NOW())`,
      [room.id, userId, username]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        roomId: room.id,
        mode: room.mode,
        message: 'Joined room successfully'
      })
    };

  } catch (error) {
    console.error('Error joining room:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
