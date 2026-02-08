// netlify/functions/leave-room.js

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
    const { userId, roomId } = JSON.parse(event.body);

    if (!userId || !roomId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Check if player is host
    const playerResult = await pool.query(
      'SELECT is_host FROM players WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );

    if (playerResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Player not found in room' })
      };
    }

    const wasHost = playerResult.rows[0].is_host;

    // Remove player from room
    await pool.query(
      'DELETE FROM players WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );

    // Check if room is now empty
    const remainingPlayers = await pool.query(
      'SELECT COUNT(*) FROM players WHERE room_id = $1',
      [roomId]
    );

    if (parseInt(remainingPlayers.rows[0].count) === 0) {
      // No players left, delete room
      await pool.query('DELETE FROM rooms WHERE id = $1', [roomId]);
    } else if (wasHost) {
      // Host left, assign new host
      const newHostResult = await pool.query(
        `UPDATE players
         SET is_host = true
         WHERE room_id = $1
         AND user_id = (
           SELECT user_id FROM players WHERE room_id = $1 ORDER BY joined_at LIMIT 1
         )
         RETURNING user_id`,
        [roomId]
      );

      // Update room's host_user_id
      if (newHostResult.rows.length > 0) {
        await pool.query(
          'UPDATE rooms SET host_user_id = $1 WHERE id = $2',
          [newHostResult.rows[0].user_id, roomId]
        );
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Left room successfully'
      })
    };

  } catch (error) {
    console.error('Error leaving room:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
