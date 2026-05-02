-- ==============================================================================
-- KHỞI TẠO CƠ SỞ DỮ LIỆU ZERO-STOP E-BORDER (POSTGRESQL)
-- ==============================================================================

-- Bật extension tạo UUID nếu chưa có
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- PHẦN 1: TẠO CÁC BẢNG LÕI (CORE TABLES) VÀ RÀNG BUỘC (CONSTRAINTS)
-- ==============================================================================

-- 1. Bảng shipments (Quản lý Lô hàng/Chuyến hàng)
CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- Sẽ được liên kết với auth.users nếu dùng Supabase
  shipment_number TEXT NOT NULL UNIQUE,
  product_description TEXT DEFAULT '',
  origin_country TEXT DEFAULT '',
  destination_country TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'cleared', 'held', 'in_transit', 'delivered', 'cancelled')),
  risk_score NUMERIC(5,2) DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  risk_explanation TEXT DEFAULT '',
  clearance_time_hours NUMERIC(10,2) DEFAULT 0,
  hs_code TEXT DEFAULT '',
  container_id TEXT DEFAULT '',
  license_plate TEXT DEFAULT '',
  seal_status TEXT DEFAULT 'intact' CHECK (seal_status IN ('intact', 'broken', 'verified')),
  current_lat NUMERIC(9,6) DEFAULT 0,
  current_lng NUMERIC(9,6) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Bảng documents (Quản lý Chứng từ đính kèm lô hàng)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  doc_type TEXT DEFAULT 'invoice' CHECK (doc_type IN ('invoice', 'packing_list', 'certificate', 'bill_of_lading', 'other')),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  extracted_data JSONB DEFAULT '{}', -- Dữ liệu thô bóc tách từ PDF
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'valid', 'warning', 'fraud_risk')),
  mismatch_fields JSONB DEFAULT '[]', -- Danh sách các trường không khớp
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Bảng declaration_items (Chi tiết tờ khai hải quan)
CREATE TABLE IF NOT EXISTS declaration_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  hs_code TEXT NOT NULL,
  quantity NUMERIC(15,3) DEFAULT 0 CHECK (quantity >= 0),
  unit_value NUMERIC(15,2) DEFAULT 0 CHECK (unit_value >= 0),
  total_value NUMERIC(15,2) GENERATED ALWAYS AS (quantity * unit_value) STORED,
  country_of_origin TEXT DEFAULT '',
  legal_references JSONB DEFAULT '[]', -- Căn cứ pháp lý từ AI HS-Advisor
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Bảng tracking_events (Ghi nhận hành trình GPS/Sự kiện)
CREATE TABLE IF NOT EXISTS tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
  event_type TEXT DEFAULT 'info' CHECK (event_type IN ('info', 'checkpoint', 'alert', 'arrival', 'departure', 'customs', 'anomaly_detected')),
  event_title TEXT NOT NULL,
  event_description TEXT DEFAULT '',
  location TEXT DEFAULT '',
  lat NUMERIC(9,6) NOT NULL,
  lng NUMERIC(9,6) NOT NULL,
  event_time TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Bảng border_scans (Kết quả quét tại cửa khẩu - Vision Edge Gate)
CREATE TABLE IF NOT EXISTS border_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
  scan_type TEXT DEFAULT 'vehicle' CHECK (scan_type IN ('vehicle', 'container', 'cargo', 'seal')),
  license_plate TEXT DEFAULT '',
  container_id TEXT DEFAULT '',
  scan_result TEXT DEFAULT 'pass' CHECK (scan_result IN ('pass', 'hold', 'fail')),
  scan_details JSONB DEFAULT '{}', -- Dữ liệu từ YOLOv11 OCR
  scanned_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Bảng user_profiles (Thông tin người dùng mở rộng)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL, -- Liên kết 1-1 với auth.users
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'operator' CHECK (role IN ('admin', 'operator', 'inspector', 'viewer')),
  department TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Bảng system_logs (Nhật ký hệ thống để kiểm toán)
CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, -- Cho phép NULL nếu là system action
  action TEXT NOT NULL,
  entity_type TEXT DEFAULT '',
  entity_id UUID,
  details JSONB DEFAULT '{}',
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Bảng ai_assistant_messages (Lưu trữ lịch sử chat với AI)
CREATE TABLE IF NOT EXISTS ai_assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- Lưu trữ token usage, context
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Bảng ai_model_settings (Cấu hình LLM - Chỉ Admin)
CREATE TABLE IF NOT EXISTS ai_model_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT NOT NULL UNIQUE,
  model_name TEXT NOT NULL,
  temperature NUMERIC(3,2) DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
  max_output_tokens INTEGER DEFAULT 2048,
  system_prompt TEXT DEFAULT '',
  extra_params JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID
);

-- ==============================================================================
-- PHẦN 2: TẠO CHỈ MỤC (INDEXES) ĐỂ TỐI ƯU HIỆU SUẤT TRUY VẤN
-- ==============================================================================

CREATE INDEX idx_shipments_user_id ON shipments(user_id);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_number ON shipments(shipment_number);

CREATE INDEX idx_documents_shipment_id ON documents(shipment_id);
CREATE INDEX idx_documents_type ON documents(doc_type);

CREATE INDEX idx_declaration_items_shipment_id ON declaration_items(shipment_id);

CREATE INDEX idx_tracking_events_shipment_id ON tracking_events(shipment_id);
CREATE INDEX idx_tracking_events_time ON tracking_events(event_time DESC);

CREATE INDEX idx_border_scans_shipment_id ON border_scans(shipment_id);
CREATE INDEX idx_border_scans_plate ON border_scans(license_plate);

CREATE INDEX idx_system_logs_created_at ON system_logs(created_at DESC);

CREATE INDEX idx_ai_messages_shipment ON ai_assistant_messages(shipment_id);
CREATE INDEX idx_ai_messages_user ON ai_assistant_messages(user_id);

-- ==============================================================================
-- PHẦN 3: TẠO CÁC HÀM (FUNCTIONS) VÀ TRIGGER TỰ ĐỘNG
-- ==============================================================================

-- Hàm tự động cập nhật cột updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Áp dụng trigger cho các bảng cần thiết
CREATE TRIGGER set_timestamp_shipments
  BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TRIGGER set_timestamp_documents
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TRIGGER set_timestamp_declaration_items
  BEFORE UPDATE ON declaration_items
  FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TRIGGER set_timestamp_user_profiles
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TRIGGER set_timestamp_ai_settings
  BEFORE UPDATE ON ai_model_settings
  FOR EACH ROW EXECUTE PROCEDURE update_modified_column();


-- Hàm kiểm toán: Tự động ghi log khi có thay đổi trạng thái Shipment
CREATE OR REPLACE FUNCTION log_shipment_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO system_logs (action, entity_type, entity_id, details, severity)
    VALUES (
      'SHIPMENT_STATUS_CHANGED',
      'shipment',
      NEW.id,
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status),
      'info'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER trg_log_shipment_status
  AFTER UPDATE OF status ON shipments
  FOR EACH ROW EXECUTE PROCEDURE log_shipment_status_change();


-- ==============================================================================
-- PHẦN 4: BẢO MẬT ROW LEVEL SECURITY (RLS) - GIẢ ĐỊNH DÙNG SUPABASE AUTH
-- ==============================================================================
-- Lưu ý: Nếu bạn chạy trên PostgreSQL chuẩn không có Supabase, bạn cần thay thế
-- auth.uid() bằng hàm xác thực session của hệ thống bạn.

ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE declaration_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE border_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_model_settings ENABLE ROW LEVEL SECURITY;

-- 4.1 Policies cho user_profiles
CREATE POLICY "Users can read their own profile" 
  ON user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all profiles" 
  ON user_profiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- 4.2 Policies cho shipments
-- Người dùng tạo ra lô hàng thì được xem/sửa lô hàng đó.
CREATE POLICY "Users can view own shipments" 
  ON shipments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own shipments" 
  ON shipments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own shipments" 
  ON shipments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own shipments"
  ON shipments FOR DELETE USING (auth.uid() = user_id);
-- Cán bộ hải quan (inspector) hoặc admin được xem tất cả
CREATE POLICY "Inspectors/Admins can view all shipments" 
  ON shipments FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role IN ('admin', 'inspector'))
  );

-- 4.3 Policies cho documents
CREATE POLICY "Users can view documents of own shipments" 
  ON documents FOR SELECT USING (
    user_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM shipments WHERE id = documents.shipment_id AND user_id = auth.uid())
  );
CREATE POLICY "Users can insert documents"
  ON documents FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND shipment_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = shipment_id
        AND s.user_id = auth.uid()
    )
  );

-- 4.4 Các bảng liên quan Shipment (declaration_items, tracking, border_scans)
CREATE POLICY "Users can view items of own shipments" 
  ON declaration_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM shipments WHERE id = declaration_items.shipment_id AND user_id = auth.uid())
  );
CREATE POLICY "Users can view tracking of own shipments" 
  ON tracking_events FOR SELECT USING (
    EXISTS (SELECT 1 FROM shipments WHERE id = tracking_events.shipment_id AND user_id = auth.uid())
  );
CREATE POLICY "Users can view scans of own shipments" 
  ON border_scans FOR SELECT USING (
    EXISTS (SELECT 1 FROM shipments WHERE id = border_scans.shipment_id AND user_id = auth.uid())
  );

-- 4.5 Cấu hình hệ thống & Logs
CREATE POLICY "Admins control AI settings" 
  ON ai_model_settings FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins can view logs" 
  ON system_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ==============================================================================
-- PHẦN 5: DỮ LIỆU MẪU BAN ĐẦU (SEED DATA)
-- ==============================================================================

-- Thêm cấu hình mô hình AI mặc định
INSERT INTO ai_model_settings (config_key, model_name, system_prompt)
VALUES 
  ('document_extractor', 'gpt-4o-mini', 'You are an expert data extractor for international trade documents...'),
  ('hs_advisor', 'gpt-4o', 'You are an expert customs advisor...'),
  ('trajectory_guardian', 'custom-lstm', 'Detect anomalies in GPS time-series data...')
ON CONFLICT (config_key) DO NOTHING;

CREATE POLICY "Users can insert declaration items for own shipments"
  ON declaration_items FOR INSERT
  WITH CHECK (
    shipment_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = shipment_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update declaration items for own shipments"
  ON declaration_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = declaration_items.shipment_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete declaration items for own shipments"
  ON declaration_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = declaration_items.shipment_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND role = 'operator'
  );

  -- Auto-create operator profile when a user registers (runs as SECURITY DEFINER; bypasses RLS).
-- Apply this migration in the Supabase SQL Editor if CLI rejects auth schema triggers.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, full_name, department, role)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
      SPLIT_PART(COALESCE(NEW.email, 'user'), '@', 1)
    ),
    COALESCE(NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'department', '')), ''), ''),
    'operator'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Admins may update any row in user_profiles (name, department, role, active, etc.)
CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
  );

-- Admins may remove a profile row (auth user may still exist; client should warn users)
CREATE POLICY "Admins can delete profiles"
  ON user_profiles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
  );

-- ==============================================================================
-- STORAGE (Supabase): không nằm trong schema public — chạy file migration riêng.
-- Bucket mặc định app: "documents". Policies cho uploads declarations/<user_id>/...
-- → supabase/migrations/20260204150000_storage_declarations_bucket_policies.sql
-- ==============================================================================
