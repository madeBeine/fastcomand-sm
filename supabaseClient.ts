import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Configuration: Robust environment variable access
const getEnv = (key: string): string => {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
        return (import.meta as any).env[key];
    }
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
        return process.env[key];
    }
    return '';
};

// Credentials - Updated with the specific keys provided by the user
const supabaseUrl = getEnv('VITE_SUPABASE_URL') || "https://jwmwiijzmubutfknhyxl.supabase.co";
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY') || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3bXdpaWp6bXVidXRma25oeXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzODk1NjksImV4cCI6MjA3ODk2NTU2OX0.rh1OnlEDnF6Hj2HVEnmKDL0tlHvSo8mhjGVT-6gNFls";

export interface DBOrder {
  id: string;
  local_order_id: string;
  global_order_id?: string;
  client_id: string;
  store_id: string;
  price: number;
  currency: string;
  price_in_mru?: number;
  commission?: number;
  quantity: number;
  amount_paid: number;
  payment_method?: string;
  transaction_fee?: number;
  shipping_type: string;
  transport_mode?: string;
  order_date: string;
  arrival_date_at_office?: string;
  expected_arrival_date: string;
  expected_hub_arrival_start_date?: string;
  expected_hub_arrival_end_date?: string;
  commission_type?: 'percentage' | 'fixed';
  commission_rate?: number;
  product_links?: string[];
  product_images?: string[]; 
  order_images?: string[];   
  tracking_images?: string[];
  hub_arrival_images?: string[]; 
  weighing_images?: string[];    
  notes?: string;
  status: string;
  tracking_number?: string;
  weight?: number;
  shipping_cost?: number;
  storage_location?: string;
  storage_date?: string;
  withdrawal_date?: string;      
  receipt_image?: string;
  receipt_images?: string[];        
  whatsapp_notification_sent?: boolean; 
  shipment_id?: string;
  box_id?: string;
  origin_center?: string;
  receiving_company_id?: string;
  history?: any[];
  is_invoice_printed?: boolean;
  local_delivery_cost?: number;
  driver_name?: string;
  driver_id?: string;
  delivery_run_id?: string;
  is_delivery_fee_prepaid?: boolean;
}

export interface DBClient {
  id: string;
  name: string;
  phone: string;
  whatsapp_number?: string;
  address?: string;
  gender?: 'male' | 'female';
  city_id?: string;
}

export interface DBStore {
  id: string;
  name: string;
  country?: string; 
  website?: string; 
  logo?: string;
  color?: string;
  estimated_delivery_days: number;
  default_origin?: string;
  default_shipping_company_id?: string;
  default_transport_mode?: string;
  default_shipping_type?: string;
  delivery_days_fast?: number;
  delivery_days_normal?: number;
}

export interface DBShipment {
  id: string;
  shipment_number: string;
  shipping_type: string;
  transport_mode?: string;
  shipping_company_id: string;
  departure_date: string;
  expected_arrival_date: string;
  status: string;
  country?: string;
  total_weight?: number;         
  total_shipping_cost?: number;  
  receipt_image?: string;        
  tracking_number?: string;      
  container_number?: string;
  history?: any[];
  number_of_boxes: number;
  boxes: any[];
  rates_snapshot?: any;
}

export interface DBShippingCompany {
  id: string;
  name: string;
  origin_country?: string; 
  destination_country?: string; 
  rates?: any; 
  addresses?: any; 
  contact_methods?: any[]; 
}

export interface DBStorageDrawer {
  id: string;
  name: string;
  capacity: number;
  rows?: number;
  columns?: number;
}

export interface DBCurrency {
  id: string;
  name: string;
  code: string;
  rate: number;
}

export interface DBPaymentMethod {
  id: string;
  name: string;
  number?: string;
  logo?: string;
  note?: string;
  fee_rate?: number;
  created_at?: string;
}

export interface DBUser {
  id: string;
  username: string;
  role: string;
  permissions: any;
  avatar?: string;
  email?: string;
}

export interface DBGlobalActivityLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
}

export interface DBCompanyInfo {
  id: string;
  name: string;
  logo: string;
  email: string;
  phone: string;
  address: string;
  website?: string;
  invoice_terms?: string;      
  invoice_signature?: string;  
}

export interface DBAppSettings {
  id: string;
  commission_rate: number;
  min_commission_threshold?: number;
  min_commission_value?: number;
  shipping_rates: any; 
  delivery_days: any;  
  default_shipping_type: string;
  default_origin_center: string;
  order_id_prefix?: string;   
  default_currency?: string; 
  view_order?: string[];
  whatsapp_templates?: any;
  calculator_short_link?: string;
  shipping_zones?: any;
  notification_reminder_enabled?: boolean;
  notification_reminder_interval?: number;
  mobile_dock_views?: string[];
}

export interface Database {
  public: {
    Tables: {
      Orders: { Row: DBOrder; Insert: Partial<DBOrder>; Update: Partial<DBOrder>; };
      Clients: { Row: DBClient; Insert: Partial<DBClient>; Update: Partial<DBClient>; };
      Stores: { Row: DBStore; Insert: Partial<DBStore>; Update: Partial<DBStore>; };
      Shipments: { Row: DBShipment; Insert: Partial<DBShipment>; Update: Partial<DBShipment>; };
      ShippingCompanies: { Row: DBShippingCompany; Insert: Partial<DBShippingCompany>; Update: Partial<DBShippingCompany>; };
      StorageDrawers: { Row: DBStorageDrawer; Insert: Partial<DBStorageDrawer>; Update: Partial<DBStorageDrawer>; };
      PaymentMethods: { Row: DBPaymentMethod; Insert: Partial<DBPaymentMethod>; Update: Partial<DBPaymentMethod>; };
      Currencies: { Row: DBCurrency; Insert: Partial<DBCurrency>; Update: Partial<DBCurrency>; };
      Users: { Row: DBUser; Insert: DBUser; Update: Partial<DBUser>; };
      GlobalActivityLog: { Row: DBGlobalActivityLog; Insert: Partial<DBGlobalActivityLog>; Update: Partial<DBGlobalActivityLog>; };
      CompanyInfo: { Row: DBCompanyInfo; Insert: Partial<DBCompanyInfo>; Update: Partial<DBCompanyInfo>; };
      AppSettings: { Row: DBAppSettings; Insert: Partial<DBAppSettings>; Update: Partial<DBAppSettings>; };
      Cities: { Row: { id: string; name: string; delivery_cost: number; is_local: boolean }; Insert: Partial<{ id: string; name: string; delivery_cost: number; is_local: boolean }>; Update: Partial<{ id: string; name: string; delivery_cost: number; is_local: boolean }>; };
      Drivers: { Row: { id: string; name: string; phone: string; national_id?: string; vehicle_type?: string; vehicle_number?: string; is_active: boolean }; Insert: Partial<{ id: string; name: string; phone: string; national_id?: string; vehicle_type?: string; vehicle_number?: string; is_active: boolean }>; Update: Partial<{ id: string; name: string; phone: string; national_id?: string; vehicle_type?: string; vehicle_number?: string; is_active: boolean }>; };
    };
  };
}

let supabase: SupabaseClient<Database> | null = null;
let supabaseInitializationError: string | null = null;

try {
    if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('https://')) {
        supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                storage: window.localStorage,
            },
        });
    } else {
        supabaseInitializationError = "Missing or invalid Supabase Credentials. Please check your environment variables.";
    }
} catch (e: any) {
    supabaseInitializationError = e.message;
}

export const getErrorMessage = (error: any): string => {
    if (!error) return 'حدث خطأ غير معروف';
    if (error instanceof Error) return translateTechnicalError(error.message);
    if (typeof error === 'string') return translateTechnicalError(error);
    if (error.message) return translateTechnicalError(error.message);
    if (error.error_description) return translateTechnicalError(error.error_description);
    if (error.details) return translateTechnicalError(error.details);
    return JSON.stringify(error);
};

const translateTechnicalError = (msg: string): string => {
    const lower = msg.toLowerCase();
    if (lower.includes('failed to fetch')) return 'فشل الاتصال بقاعدة البيانات. يرجى التأكد من اتصال الإنترنت أو صحة إعدادات Supabase في ملف .env';
    if (lower.includes('invalid login credentials')) return 'بيانات الدخول غير صحيحة (البريد الإلكتروني أو كلمة المرور)';
    if (lower.includes('email not confirmed')) return 'الحساب موجود ولكنه غير مفعل. يرجى مراجعة البريد الإلكتروني أو تفعيل الحساب من لوحة التحكم.';
    if (lower.includes('relation') && lower.includes('does not exist')) return 'قاعدة البيانات غير مهيئة. يرجى تشغيل سكربت SQL في Supabase.';
    if (lower.includes('api key not found')) return 'مفتاح API الخاص بـ Gemini غير موجود. يرجى إضافته لتمكين الذكاء الاصطناعي.';
    return msg;
};

export { supabase, supabaseInitializationError };
