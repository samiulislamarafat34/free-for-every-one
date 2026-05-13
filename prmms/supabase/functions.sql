-- PRMMS Supabase Functions

CREATE OR REPLACE FUNCTION verify_device(p_imei TEXT, p_android_id TEXT, p_device_name TEXT)
RETURNS UUID AS $$
DECLARE
    v_device_id UUID;
BEGIN
    -- Check if device already exists
    SELECT id INTO v_device_id FROM devices WHERE imei = p_imei AND android_id = p_android_id;
    
    IF v_device_id IS NULL THEN
        -- Insert new device
        INSERT INTO devices (imei, android_id, device_name, is_verified, last_seen)
        VALUES (p_imei, p_android_id, p_device_name, false, NOW())
        RETURNING id INTO v_device_id;
    ELSE
        -- Update last seen
        UPDATE devices SET last_seen = NOW(), device_name = p_device_name WHERE id = v_device_id;
    END IF;
    
    RETURN v_device_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enqueue_command(p_device_id UUID, p_command_type TEXT, p_payload JSONB)
RETURNS UUID AS $$
DECLARE
    v_command_id UUID;
BEGIN
    INSERT INTO commands (device_id, command_type, payload, status)
    VALUES (p_device_id, p_command_type, p_payload, 'pending')
    RETURNING id INTO v_command_id;
    
    RETURN v_command_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION report_status(p_device_id UUID, p_battery INTEGER, p_charging BOOLEAN, p_net_type TEXT, p_net_strength INTEGER)
RETURNS VOID AS $$
BEGIN
    INSERT INTO telemetry (device_id, battery_level, is_charging, network_type, network_strength)
    VALUES (p_device_id, p_battery, p_charging, p_net_type, p_net_strength);
    
    UPDATE devices SET last_seen = NOW() WHERE id = p_device_id;
END;
$$ LANGUAGE plpgsql;
