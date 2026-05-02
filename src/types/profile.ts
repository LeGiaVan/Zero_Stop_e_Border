export type UserRole = "admin" | "operator" | "inspector" | "viewer";

export interface UserProfileRow {
  id: string;
  user_id: string;
  full_name: string;
  role: UserRole;
  department: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}
