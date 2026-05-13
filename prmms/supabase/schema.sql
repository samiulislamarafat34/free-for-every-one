-- PRMMS Supabase Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: devices
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    imei TEXT UNIQUE NOT NULL,
    android_id TEXT UNIQUE NOT NULL,
    device_name TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: telemetry
CREATE TABLE telemetry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    battery_level INTEGER,
    is_charging BOOLEAN,
    network_type TEXT,
    network_strength INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: call_logs
CREATE TABLE call_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    phone_number TEXT,
    call_type TEXT,
    duration INTEGER,
    call_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: locations
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    recorded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: commands
CREATE TABLE commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    command_type TEXT NOT NULL,
    payload JSONB,
    status TEXT DEFAULT 'pending',
    result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    executed_at TIMESTAMP WITH TIME ZONE
);

-- RLS Policies
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;

-- For demo purposes, we will allow anonymous access, but in production,
-- authentication should be enforced.
CREATE POLICY "Allow all on devices" ON devices FOR ALL USING (true);
CREATE POLICY "Allow all on telemetry" ON telemetry FOR ALL USING (true);
CREATE POLICY "Allow all on call_logs" ON call_logs FOR ALL USING (true);
CREATE POLICY "Allow all on locations" ON locations FOR ALL USING (true);
CREATE POLICY "Allow all on commands" ON commands FOR ALL USING (true);
