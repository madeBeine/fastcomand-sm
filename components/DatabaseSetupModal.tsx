
import React, { useState } from 'react';
import { Database, X, UserPlus, Info, Copy, Check, ShieldAlert, Image } from 'lucide-react';

const SETUP_SCHEMA_SQL = `
-- تفعيل الإضافات
create extension if not exists pgcrypto;

-- 1. الجداول الأساسية
create table if not exists public."CompanyInfo" (id uuid default gen_random_uuid() primary key);
create table if not exists public."AppSettings" (id uuid default gen_random_uuid() primary key);
create table if not exists public."Clients" (id uuid default gen_random_uuid() primary key);
create table if not exists public."Stores" (id uuid default gen_random_uuid() primary key);
create table if not exists public."ShippingCompanies" (id uuid default gen_random_uuid() primary key);
create table if not exists public."Currencies" (id uuid default gen_random_uuid() primary key);
create table if not exists public."StorageDrawers" (id uuid default gen_random_uuid() primary key);
create table if not exists public."Shipments" (id uuid default gen_random_uuid() primary key);
create table if not exists public."Orders" (id uuid default gen_random_uuid() primary key);
create table if not exists public."Users" (id uuid references auth.users on delete cascade primary key);
create table if not exists public."GlobalActivityLog" (id uuid default gen_random_uuid() primary key);
create table if not exists public."PaymentMethods" (id uuid default gen_random_uuid() primary key);

-- 2. تحديث الأعمدة (ضمان وجود جميع الأعمدة)
DO $$
BEGIN
    -- Orders - تحديث لتعدد الصور
    alter table public."Orders" add column if not exists local_order_id text;
    alter table public."Orders" add column if not exists global_order_id text;
    alter table public."Orders" add column if not exists client_id uuid references public."Clients"(id);
    alter table public."Orders" add column if not exists store_id uuid references public."Stores"(id);
    alter table public."Orders" add column if not exists price numeric;
    alter table public."Orders" add column if not exists currency text;
    alter table public."Orders" add column if not exists price_in_mru numeric;
    alter table public."Orders" add column if not exists commission numeric;
    alter table public."Orders" add column if not exists quantity int default 1;
    alter table public."Orders" add column if not exists amount_paid numeric default 0;
    alter table public."Orders" add column if not exists payment_method text;
    alter table public."Orders" add column if not exists shipping_type text;
    alter table public."Orders" add column if not exists order_date date;
    alter table public."Orders" add column if not exists arrival_date_at_office date;
    alter table public."Orders" add column if not exists expected_arrival_date date;
    alter table public."Orders" add column if not exists commission_type text default 'percentage';
    alter table public."Orders" add column if not exists commission_rate numeric default 0;
    alter table public."Orders" add column if not exists product_links text[];
    alter table public."Orders" add column if not exists product_images text[];
    alter table public."Orders" add column if not exists order_images text[];
    alter table public."Orders" add column if not exists hub_arrival_images text[];
    alter table public."Orders" add column if not exists weighing_images text[];
    alter table public."Orders" add column if not exists notes text;
    alter table public."Orders" add column if not exists status text default 'new';
    alter table public."Orders" add column if not exists tracking_number text;
    alter table public."Orders" add column if not exists weight numeric;
    alter table public."Orders" add column if not exists shipping_cost numeric;
    alter table public."Orders" add column if not exists storage_location text;
    alter table public."Orders" add column if not exists storage_date timestamptz;
    alter table public."Orders" add column if not exists withdrawal_date timestamptz;
    alter table public."Orders" add column if not exists receipt_image text;
    alter table public."Orders" add column if not exists receipt_images text[];
    alter table public."Orders" add column if not exists shipment_id uuid references public."Shipments"(id);
    alter table public."Orders" add column if not exists box_id text;
    alter table public."Orders" add column if not exists origin_center text;
    alter table public."Orders" add column if not exists receiving_company_id uuid references public."ShippingCompanies"(id);
    alter table public."Orders" add column if not exists whatsapp_notification_sent boolean default false;
    alter table public."Orders" add column if not exists is_invoice_printed boolean default false;
    alter table public."Orders" add column if not exists local_delivery_cost numeric default 0;
    alter table public."Orders" add column if not exists history jsonb default '[]'::jsonb;
    alter table public."Orders" add column if not exists created_at timestamptz default now();

END $$;

-- 3. مزامنة الصور المفقودة
UPDATE public."Orders" SET receipt_images = ARRAY[receipt_image] WHERE receipt_image IS NOT NULL AND (receipt_images IS NULL OR array_length(receipt_images, 1) IS NULL);

NOTIFY pgrst, 'reload schema';
`;

const MIGRATION_RECEIPTS_SQL = `
-- 1. إضافة عمود مصفوفة الصور إذا لم يكن موجوداً
ALTER TABLE public."Orders" ADD COLUMN IF NOT EXISTS receipt_images text[];

-- 2. نقل الصور الموجودة في العمود القديم (receipt_image) إلى المصفوفة الجديدة
UPDATE public."Orders" 
SET receipt_images = ARRAY[receipt_image] 
WHERE receipt_image IS NOT NULL 
AND (receipt_images IS NULL OR array_length(receipt_images, 1) IS NULL);

-- 3. إعلام Postgrest بتحديث المخطط
NOTIFY pgrst, 'reload schema';
`;

const DatabaseSetupModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<'schema' | 'admin' | 'migration'>('schema');
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    let codeToCopy = "";
    if (activeTab === 'schema') codeToCopy = SETUP_SCHEMA_SQL;
    if (activeTab === 'admin') codeToCopy = "SELECT 'Coming soon';";
    if (activeTab === 'migration') codeToCopy = MIGRATION_RECEIPTS_SQL;

    const handleCopy = () => {
        navigator.clipboard.writeText(codeToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[80] p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-6 w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 pb-2 border-b dark:border-gray-700">
                    <h3 className="text-xl font-bold flex items-center gap-2 text-primary">
                        <Database size={24} /> إعداد قاعدة البيانات (تحديث الصور)
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"><X size={20} /></button>
                </div>
                
                <div className="flex gap-2 mb-4 border-b dark:border-gray-700 pb-1 overflow-x-auto">
                    <button onClick={() => setActiveTab('schema')} className={`pb-2 px-3 text-sm font-bold ${activeTab === 'schema' ? 'text-primary border-b-2 border-primary' : 'text-gray-500'}`}>التهيئة الشاملة</button>
                    <button onClick={() => setActiveTab('migration')} className={`pb-2 px-3 text-sm font-bold ${activeTab === 'migration' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>تحديث الأعمدة فقط</button>
                </div>

                <div className="relative flex-grow border rounded-lg bg-gray-900 text-gray-100 overflow-hidden font-mono text-xs shadow-inner" dir="ltr">
                    <button onClick={handleCopy} className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded flex items-center gap-2 transition-all shadow-md z-10">
                        {copied ? <Check size={14}/> : <Copy size={14}/>}
                        {copied ? 'Copied' : 'Copy SQL'}
                    </button>
                    <pre className="p-4 overflow-auto h-full text-left select-all">{codeToCopy}</pre>
                </div>
            </div>
        </div>
    );
};

export default DatabaseSetupModal;
