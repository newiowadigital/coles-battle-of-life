// netlify/functions/room-state.js

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { roomId, userId } = event.queryStringParameters || {};

    if (!roomId || !userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing roomId or userId' })
      };
    }

    // Get room info
    const roomResult = await pool.query(
      'SELECT id, mode, status, host_user_id FROM rooms WHERE id = $1',
      [roomId]
    );

    if (roomResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Room not found' })
      };
    }

    const room = roomResult.rows[0];

    // Get all players in room
    const playersResult = await pool.query(
      `SELECT user_id, username, is_host, ready, team, bet
       FROM players
       WHERE room_id = $1
       ORDER BY joined_at ASC`,
      [roomId]
    );

    const players = playersResult.rows.map(p => ({
      userId: p.user_id,
      username: p.username,
      isHost: p.is_host,
      ready: p.ready,
      team: p.team,
      bet: p.bet
    }));

    // Check if all players are ready and we have at least 2
    const allReady = players.length >= 2 && players.every(p => p.ready);

    // If all ready and not already playing, start the game
    if (allReady && room.status === 'waiting') {
      await pool.query(
        `UPDATE rooms SET status = 'playing', started_at = NOW() WHERE id = $1`,
        [roomId]
      );
      room.status = 'playing';
    }

    // Get game state if playing
    let gameState = null;
    if (room.status === 'playing') {
      const stateResult = await pool.query(
        `SELECT generation, state_data, winner
         FROM game_states
         WHERE room_id = $1
         ORDER BY generation DESC
         LIMIT 1`,
        [roomId]
      );

      if (stateResult.rows.length > 0) {
        gameState = stateResult.rows[0];
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        roomId: room.id,
        mode: room.mode,
        status: room.status,
        hostUserId: room.host_user_id,
        players,
        gameState,
        allReady
      })
    };

  } catch (error) {
    console.error('Error getting room state:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
