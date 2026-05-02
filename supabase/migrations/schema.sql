/*
  # Zero-Stop E-Border Database Schema

  1. New Tables
    - `shipments` - Core shipment records with product info, status, risk score
    - `documents` - Uploaded documents (invoices, packing lists) linked to shipments
    - `declaration_items` - Line items within a shipment declaration
    - `tracking_events` - Timeline events for shipment tracking
    - `border_scans` - Border gate scan records
    - `user_profiles` - Extended user profiles for admin management
    - `system_logs` - Audit and system event logs
    - `ai_assistant_messages` - Smart declaration chat; metadata for HS/legal hints
    - `ai_model_settings` - Admin AI model and prompt configuration per config_key

  2. Security
    - RLS enabled on all tables
    - Policies restrict access to authenticated users only
    - Users can only modify their own data where applicable

  3. Notes
    - Uses UUID primary keys throughout
    - Timestamps with timezone for all records
    - Risk scores stored as numeric (0-100)
    - Status fields use text enums for clarity
*/

-- Shipments table
CREATE TABLE IF NOT EXISTS shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  shipment_number text NOT NULL DEFAULT '',
  product_description text DEFAULT '',
  origin_country text DEFAULT '',
  destination_country text DEFAULT '',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'cleared', 'held', 'in_transit', 'delivered')),
  risk_score numeric DEFAULT 0,
  risk_level text DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  risk_explanation text DEFAULT '',
  clearance_time_hours numeric DEFAULT 0,
  hs_code text DEFAULT '',
  container_id text DEFAULT '',
  license_plate text DEFAULT '',
  seal_status text DEFAULT 'intact' CHECK (seal_status IN ('intact', 'broken', 'verified')),
  current_lat numeric DEFAULT 0,
  current_lng numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES shipments(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type text DEFAULT 'invoice' CHECK (doc_type IN ('invoice', 'packing_list', 'certificate', 'other')),
  file_name text DEFAULT '',
  file_url text DEFAULT '',
  extracted_data jsonb DEFAULT '{}',
  verification_status text DEFAULT 'pending' CHECK (verification_status IN ('pending', 'valid', 'warning', 'fraud_risk')),
  mismatch_fields jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

-- Declaration items table
CREATE TABLE IF NOT EXISTS declaration_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES shipments(id) ON DELETE CASCADE,
  item_name text DEFAULT '',
  hs_code text DEFAULT '',
  quantity numeric DEFAULT 0,
  unit_value numeric DEFAULT 0,
  total_value numeric DEFAULT 0,
  country_of_origin text DEFAULT '',
  legal_references jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

-- Tracking events table
CREATE TABLE IF NOT EXISTS tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES shipments(id) ON DELETE CASCADE,
  event_type text DEFAULT 'info' CHECK (event_type IN ('info', 'checkpoint', 'alert', 'arrival', 'departure', 'customs')),
  event_title text DEFAULT '',
  event_description text DEFAULT '',
  location text DEFAULT '',
  lat numeric DEFAULT 0,
  lng numeric DEFAULT 0,
  event_time timestamptz DEFAULT now()
);

-- Border scans table
CREATE TABLE IF NOT EXISTS border_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES shipments(id) ON DELETE CASCADE,
  scan_type text DEFAULT 'vehicle' CHECK (scan_type IN ('vehicle', 'container', 'cargo')),
  license_plate text DEFAULT '',
  container_id text DEFAULT '',
  scan_result text DEFAULT 'pass' CHECK (scan_result IN ('pass', 'hold', 'fail')),
  scan_details jsonb DEFAULT '{}',
  scanned_at timestamptz DEFAULT now()
);

-- User profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text DEFAULT '',
  role text DEFAULT 'operator' CHECK (role IN ('admin', 'operator', 'inspector', 'viewer')),
  department text DEFAULT '',
  is_active boolean DEFAULT true,
  last_login timestamptz,
  created_at timestamptz DEFAULT now()
);

-- System logs table
CREATE TABLE IF NOT EXISTS system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text DEFAULT '',
  entity_type text DEFAULT '',
  entity_id uuid,
  details jsonb DEFAULT '{}',
  severity text DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  created_at timestamptz DEFAULT now()
);

-- AI assistant messages (declaration chat, suggestions; optional shipment link)
CREATE TABLE IF NOT EXISTS ai_assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES shipments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text DEFAULT '',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- AI model configuration (admin panel)
CREATE TABLE IF NOT EXISTS ai_model_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text NOT NULL UNIQUE,
  model_name text DEFAULT '',
  temperature numeric DEFAULT 0.7,
  max_output_tokens integer DEFAULT 2048,
  system_prompt text DEFAULT '',
  extra_params jsonb DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS on all tables
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE declaration_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE border_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_model_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for shipments
CREATE POLICY "Users can view own shipments" ON shipments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own shipments" ON shipments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own shipments" ON shipments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own shipments" ON shipments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for documents
CREATE POLICY "Users can view own documents" ON documents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own documents" ON documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own documents" ON documents FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own documents" ON documents FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for declaration_items
CREATE POLICY "Users can view own declaration items" ON declaration_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM shipments WHERE shipments.id = declaration_items.shipment_id AND shipments.user_id = auth.uid()));
CREATE POLICY "Users can create own declaration items" ON declaration_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM shipments WHERE shipments.id = declaration_items.shipment_id AND shipments.user_id = auth.uid()));
CREATE POLICY "Users can update own declaration items" ON declaration_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM shipments WHERE shipments.id = declaration_items.shipment_id AND shipments.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM shipments WHERE shipments.id = declaration_items.shipment_id AND shipments.user_id = auth.uid()));
CREATE POLICY "Users can delete own declaration items" ON declaration_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM shipments WHERE shipments.id = declaration_items.shipment_id AND shipments.user_id = auth.uid()));

-- RLS Policies for tracking_events
CREATE POLICY "Users can view own tracking events" ON tracking_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM shipments WHERE shipments.id = tracking_events.shipment_id AND shipments.user_id = auth.uid()));
CREATE POLICY "Users can create own tracking events" ON tracking_events FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM shipments WHERE shipments.id = tracking_events.shipment_id AND shipments.user_id = auth.uid()));

-- RLS Policies for border_scans
CREATE POLICY "Users can view own border scans" ON border_scans FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM shipments WHERE shipments.id = border_scans.shipment_id AND shipments.user_id = auth.uid()));
CREATE POLICY "Users can create own border scans" ON border_scans FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM shipments WHERE shipments.id = border_scans.shipment_id AND shipments.user_id = auth.uid()));

-- RLS Policies for user_profiles
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON user_profiles FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'admin'));
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update any profile" ON user_profiles FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'admin'));
CREATE POLICY "Users can create own profile" ON user_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can insert profiles" ON user_profiles FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'admin'));

-- RLS Policies for system_logs
CREATE POLICY "Admins can view system logs" ON system_logs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.user_id = auth.uid() AND user_profiles.role = 'admin'));
CREATE POLICY "Admins can insert system logs" ON system_logs FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.user_id = auth.uid() AND user_profiles.role = 'admin'));

-- RLS Policies for ai_assistant_messages
CREATE POLICY "Users can view AI messages for own context" ON ai_assistant_messages FOR SELECT TO authenticated USING (
  ai_assistant_messages.user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM shipments s WHERE s.id = ai_assistant_messages.shipment_id AND s.user_id = auth.uid())
);
CREATE POLICY "Users can insert AI messages" ON ai_assistant_messages FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND (
    shipment_id IS NULL
    OR EXISTS (SELECT 1 FROM shipments s WHERE s.id = shipment_id AND s.user_id = auth.uid())
  )
);
CREATE POLICY "Users can update own AI messages" ON ai_assistant_messages FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own AI messages" ON ai_assistant_messages FOR DELETE TO authenticated USING (user_id = auth.uid());

-- RLS Policies for ai_model_settings
CREATE POLICY "Admins can view AI model settings" ON ai_model_settings FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'admin'));
CREATE POLICY "Admins can insert AI model settings" ON ai_model_settings FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'admin'));
CREATE POLICY "Admins can update AI model settings" ON ai_model_settings FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'admin'));
CREATE POLICY "Admins can delete AI model settings" ON ai_model_settings FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'admin'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_shipments_user_id ON shipments(user_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_documents_shipment_id ON documents(shipment_id);
CREATE INDEX IF NOT EXISTS idx_declaration_items_shipment_id ON declaration_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_shipment_id ON tracking_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_border_scans_shipment_id ON border_scans(shipment_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_assistant_messages_shipment_id ON ai_assistant_messages(shipment_id);
CREATE INDEX IF NOT EXISTS idx_ai_assistant_messages_user_id ON ai_assistant_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_model_settings_config_key ON ai_model_settings(config_key);
