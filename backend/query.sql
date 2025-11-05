CREATE TABLE user_entries (
                              id SERIAL PRIMARY KEY,    -- auto-incrementing ID for each entry
                              username VARCHAR(255) NOT NULL,  -- username of the user
                              room_id VARCHAR(255) NOT NULL,   -- room ID that the user is associated with
                              test_id INTEGER DEFAULT NULL    -- test ID, initially set to NULL
);