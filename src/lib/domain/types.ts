export type UserRole =
  | 'super_admin'
  | 'owner'
  | 'branch_manager'
  | 'cashier'
  | 'kitchen_staff';

export type OrderStatus =
  | 'new'
  | 'pending_confirmation'
  | 'accepted'
  | 'preparing'
  | 'ready_for_pickup'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export interface Branch {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  address_ar: string;
  address_en: string;
  latitude: number;
  longitude: number;
  phone: string;
  map_url: string;
  open_time: string;  // "HH:MM"
  close_time: string; // "HH:MM" (supports cross-midnight e.g. "02:00")
  closed_days: number[]; // 0=Sun..6=Sat
  is_active: boolean;
  is_accepting_orders: boolean;
  prep_time_minutes: number;
  pickup_instructions_ar: string;
  pickup_instructions_en: string;
}

export interface ProductSize {
  id: string;
  name_ar: string;
  name_en: string;
  price_delta: number;
  is_default?: boolean;
}

export interface ProductAddon {
  id: string;
  name_ar: string;
  name_en: string;
  price: number;
  is_active: boolean;
  max_per_item: number;
}

export interface Product {
  id: string;
  category_id: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  base_price: number;
  calories: number;
  prep_minutes: number;
  image_url: string;
  is_featured: boolean;
  is_active: boolean;
  sizes: ProductSize[];
  allowed_addon_ids: string[];
}

export interface BranchProductOverride {
  branch_id: string;
  product_id: string;
  is_available: boolean;
  custom_base_price: number | null;
}

export interface PaymentMethod {
  id: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  is_enabled: boolean;
}

export interface OrderItemInput {
  product_id: string;
  size_id: string;
  quantity: number;
  addon_ids: string[];
  item_notes?: string;
}

export interface OrderStatusHistoryEntry {
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_id: string;
  actor_name: string;
  actor_role: UserRole | 'system';
  note: string;
  timestamp: string;
}
