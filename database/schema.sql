-- Battle of Life Multiplayer Database Schema
-- For Neon PostgreSQL

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id SERIAL PRIMARY KEY,
    join_code VARCHAR(6) UNIQUE NOT NULL,
    mode INTEGER NOT NULL CHECK (mode >= 2 AND mode <= 16),
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',
    host_user_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP,
    finished_at TIMESTAMP
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    username VARCHAR(50) NOT NULL,
    is_host BOOLEAN NOT NULL DEFAULT false,
    ready BOOLEAN NOT NULL DEFAULT false,
    team INTEGER,
    bet INTEGER DEFAULT 0,
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(room_id, user_id)
);

-- Game states table (for syncing game progress)
CREATE TABLE IF NOT EXISTS game_states (
    id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    generation INTEGER NOT NULL DEFAULT 0,
    state_data JSONB,
    winner INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(room_id, generation)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_join_code ON rooms(join_code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id);
CREATE INDEX IF NOT EXISTS idx_game_states_room_id ON game_states(room_id);

-- Cleanup old finished rooms (run periodically)
-- DELETE FROM rooms WHERE status = 'finished' AND finished_at < NOW() - INTERVAL '24 hours';
