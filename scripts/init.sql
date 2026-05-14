-- HealthcareAI PostgreSQL initialisation script
-- Run automatically by Docker on first startup

-- Create database if not exists (Docker handles this via POSTGRES_DB)
-- This script runs inside the healthcareai database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE review_category AS ENUM ('good', 'moderate', 'high_risk');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE content_status AS ENUM ('draft', 'pending', 'approved', 'rejected', 'published');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE notification_status AS ENUM ('pending', 'approved', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Note: SQLAlchemy will create all tables via init_db() on startup.
-- This script just ensures extensions and enums exist.

-- Admin user is seeded by the backend at startup (after SQLAlchemy creates tables).
