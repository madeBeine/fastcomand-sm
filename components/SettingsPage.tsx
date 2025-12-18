
import React, { useState, useContext, useRef } from 'react';
import type { Store, ShippingCompany, Currency, AppSettings, CompanyInfo, User, GlobalActivityLog, View, ShippingZone, PaymentMethod } from '../types';
import { 
    Building, Truck, DollarSign, Settings, Users, 
    FileText, Plus, Edit, Trash2, Map, Clock, 
    Link as LinkIcon, Save, Upload, Info, AlertTriangle, Loader2,
    X, Globe, Building2, UserCog, History, Calculator, Check, Plane, MapPin, Wallet, CreditCard, Image as ImageIcon
} from 'lucide-react';
import UsersPage from './UsersPage';
import AuditLogPage from './AuditLogPage';
import { supabase, getErrorMessage } from '../supabaseClient';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';
import { AuthContext } from '../contexts/AuthContext';

interface SettingsPageProps {
    stores: Store[];
    setStores: React.Dispatch<React.SetStateAction<Store[]>>;
    shippingCompanies: ShippingCompany[];
    setShippingCompanies: React.Dispatch<React.SetStateAction<ShippingCompany[]>>;
    currencies: Currency[];
    setCurrencies: React.Dispatch<React.SetStateAction<Currency[]>>;
    settings: AppSettings;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    // New Prop for separate state management
    onUpdatePaymentMethods?: React.Dispatch<React.SetStateAction<PaymentMethod[]>>;
    companyInfo: CompanyInfo;
    setCompanyInfo: React.Dispatch<React.SetStateAction<CompanyInfo>>;
    setView: (view: View) => void;
    users: User[];
    setUsers: React.Dispatch<React.SetStateAction<User[]>>;
    globalActivityLog: GlobalActivityLog[];
    logAction: (action: string, entityType: GlobalActivityLog['entityType'], entityId: string, details: string) => void;
}

const SettingsCard: React.FC<{
    title: string;
    description: string;
    icon: React.ReactNode;
    actions?: React.ReactNode;
    children: React.ReactNode;
}> = ({ title, description, icon, actions, children }) => (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden h-full flex flex-col">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                    {icon}
                </div>
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
                </div>
            </div>
            {actions && <div>{actions}</div>}
        </div>
        <div className="p-6 flex-grow overflow-y-auto custom-scrollbar">
            {children}
        </div>
    </div>
);

type Tab = 'profile' | 'system' | 'stores' | 'shipping' | 'currencies' | 'users' | 'audit' | 'payments';
type ModalType = 'store' | 'shipping' | 'currency' | 'payment' | null;

const STORE_COLORS = [
    '#EF4444', // Red
    '#F97316', // Orange
    '#F59E0B', // Yellow
    '#84CC16', // Lime
    '#22C55E', // Green
    '#10B981', // Emerald
    '#14B8A6', // Teal
    '#06B6D4', // Cyan
    '#3B82F6', // Blue
    '#1E3A8A', // Navy
    '#6366F1', // Indigo
    '#A855F7', // Purple
    '#D946EF', // Fuchsia
    '#EC4899', // Pink
    '#F43F5E', // Rose
    '#78350F', // Brown
    '#D4C5A9', // Beige
    '#6B7280', // Gray
    '#000000', // Black
];

const SettingsPage: React.FC<SettingsPageProps> = ({
    stores, setStores,
    shippingCompanies, setShippingCompanies,
    currencies, setCurrencies,
    settings, setSettings,
    onUpdatePaymentMethods,
    companyInfo, setCompanyInfo,
    users, setUsers,
    globalActivityLog,
    logAction
}) => {
    const { showToast } = useToast();
    const { t } = useLanguage();
    const { currentUser } = useContext(AuthContext);
    
    const [activeTab, setActiveTab] = useState<Tab>('profile');
    const [isSaving, setIsSaving] = useState(false);
    
    // Modal State
    const [modalType, setModalType] = useState<ModalType>(null);
    const [editingItem, setEditingItem] = useState<any>(null);
    
    // Shipping Zones State (Local Edit before Save)
    const [newZoneName, setNewZoneName] = useState('');
    
    // Helper to compress image - Robust Version
    const compressImage = async (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async (event) => {
                if (!event.target?.result) return reject("Failed to read file");
                
                const originalBase64 = event.target.result as string;
                const img = new Image();
                img.src = originalBase64;
                
                try {
                    await img.decode();
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 500; // Smaller limit for logos/small images
                    
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return reject("Canvas error");
                    
                    // FIX: Draw white background first to handle transparency/black issue
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                } catch (err) {
                    console.warn("Image compression failed, falling back to original", err);
                    resolve(originalBase64);
                }
            };
            reader.onerror = error => reject(error);
        });
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const base64 = await compressImage(e.target.files[0]);
                setCompanyInfo(prev => ({ ...prev, logo: base64 }));
            } catch (err) {
                showToast("فشل رفع الشعار", "error");
            }
        }
    };

    const handleItemImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const base64 = await compressImage(e.target.files[0]);
                setEditingItem((prev: any) => ({ ...prev, logo: base64 }));
            } catch (err) {
                showToast("فشل رفع الصورة", "error");
            }
        }
    };

    const handleSaveCompany = async () => {
        if (!supabase) return;
        setIsSaving(true);
        try {
            const { error } = await supabase.from('CompanyInfo').upsert(companyInfo).select();
            if (error) throw error;
            showToast('تم حفظ معلومات الشركة', 'success');
            logAction('Update Company', 'Settings', 'company', 'Updated company profile');
        } catch (e: any) {
            showToast('خطأ: ' + getErrorMessage(e), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveSettings = async () => {
        if (!supabase) return;
        setIsSaving(true);
        
        try {
            const dbPayload: any = {
                id: settings.id,
                commission_rate: settings.commissionRate,
                shipping_rates: settings.shippingRates,
                shipping_zones: settings.shippingZones, // Include zones
                delivery_days: settings.deliveryDays,
                default_shipping_type: settings.defaultShippingType,
                default_origin_center: settings.defaultOriginCenter,
                // Removed payment_methods from here as it is now in a separate table
                order_id_prefix: settings.orderIdPrefix,
                default_currency: settings.defaultCurrency,
                view_order: settings.viewOrder,
                whatsapp_templates: settings.whatsappTemplates,
                calculator_short_link: settings.calculatorShortLink
            };

            const { error } = await supabase.from('AppSettings').upsert(dbPayload).select();
            if (error) throw error;
            showToast('تم حفظ إعدادات النظام', 'success');
            logAction('Update System', 'Settings', 'system', 'Updated system settings');
        } catch (e: any) {
            showToast('خطأ: ' + getErrorMessage(e), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Shipping Zone Handlers
    const addShippingZone = () => {
        if(!newZoneName.trim()) return;
        
        // Prevent duplicates
        if (settings.shippingZones?.some(z => z.name.toLowerCase() === newZoneName.trim().toLowerCase())) {
            showToast("هذه المنطقة موجودة بالفعل", 'error');
            return;
        }

        const newZone: ShippingZone = {
            name: newZoneName.trim(),
            rates: { fast: 0, normal: 0 }
        };
        setSettings(prev => ({
            ...prev,
            shippingZones: [...(prev.shippingZones || []), newZone]
        }));
        setNewZoneName('');
    };

    const removeShippingZone = (name: string) => {
        setSettings(prev => ({
            ...prev,
            shippingZones: (prev.shippingZones || []).filter(z => z.name !== name)
        }));
    };

    const updateZoneRate = (name: string, type: 'fast'|'normal', value: number) => {
        setSettings(prev => ({
            ...prev,
            shippingZones: (prev.shippingZones || []).map(z => 
                z.name === name ? { ...z, rates: { ...z.rates, [type]: value } } : z
            )
        }));
    };

    const handleOpenModal = (type: ModalType, item: any = null) => {
        setModalType(type);
        // Ensure default structure for new items
        if (!item) {
            if (type === 'payment') {
                setEditingItem({ name: '', logo: '', number: '', note: '' });
            } else {
                setEditingItem({});
            }
        } else {
            setEditingItem(item);
        }
    };

    const handleCloseModal = () => {
        setModalType(null);
        setEditingItem(null);
    };

    const handleDeleteItem = async (type: ModalType, id: string) => {
        if (!supabase || !type) return;
        if (!confirm(t('deleteWarning'))) return;

        try {
            let table = '';
            if (type === 'store') table = 'Stores';
            if (type === 'shipping') table = 'ShippingCompanies';
            if (type === 'currency') table = 'Currencies';
            if (type === 'payment') table = 'PaymentMethods';

            const { error } = await supabase.from(table).delete().eq('id', id);
            if (error) throw error;

            if (type === 'store') setStores(prev => prev.filter(i => i.id !== id));
            if (type === 'shipping') setShippingCompanies(prev => prev.filter(i => i.id !== id));
            if (type === 'currency') setCurrencies(prev => prev.filter(i => i.id !== id));
            if (type === 'payment') {
                // Update local state via props or settings
                if (onUpdatePaymentMethods) {
                    onUpdatePaymentMethods(prev => prev.filter(p => p.id !== id));
                } else {
                    // Fallback to settings if callback not provided (for safety)
                    setSettings(prev => ({
                        ...prev,
                        paymentMethods: prev.paymentMethods?.filter(p => p.id !== id)
                    }));
                }
            }

            showToast(t('success'), 'success');
            logAction('Delete', 'Settings', id, `Deleted ${type}`);
        } catch (e: any) {
            showToast('خطأ: ' + getErrorMessage(e), 'error');
        }
    };

    const handleSaveItem = async () => {
        if (!supabase || !modalType) return;
        
        setIsSaving(true);

        try {
            let table = '';
            let dbPayload: any = {};

            if (modalType === 'store') {
                table = 'Stores';
                dbPayload = {
                    name: editingItem.name,
                    country: editingItem.country,
                    website: editingItem.website,
                    logo: editingItem.logo, // Store Logo
                    color: editingItem.color,
                    estimated_delivery_days: editingItem.estimatedDeliveryDays // Map to snake_case
                };
            } else if (modalType === 'shipping') {
                table = 'ShippingCompanies';
                dbPayload = {
                    name: editingItem.name,
                    origin_country: editingItem.originCountry, // Map to snake_case
                    destination_country: editingItem.destinationCountry, // Map to snake_case
                    rates: editingItem.rates,
                    addresses: editingItem.addresses,
                    contact_methods: editingItem.contactMethods // Map to snake_case
                };
            } else if (modalType === 'currency') {
                table = 'Currencies';
                dbPayload = {
                    code: editingItem.code,
                    name: editingItem.name,
                    rate: editingItem.rate
                };
            } else if (modalType === 'payment') {
                table = 'PaymentMethods';
                dbPayload = {
                    name: editingItem.name,
                    number: editingItem.number,
                    logo: editingItem.logo,
                    note: editingItem.note
                };
            }

            let res;
            // Check if ID is a valid UUID (not temp ID)
            if (editingItem.id && !String(editingItem.id).startsWith('pm_')) { 
                res = await (supabase.from(table) as any).update(dbPayload).eq('id', editingItem.id).select().single();
            } else {
                res = await (supabase.from(table) as any).insert(dbPayload).select().single();
            }

            if (res.error) throw res.error;
            
            // Map response back to frontend structure
            let data = res.data;
            
            if (modalType === 'store') {
                data = {
                    ...data,
                    estimatedDeliveryDays: data.estimated_delivery_days,
                    color: data.color
                };
                setStores(prev => editingItem.id ? prev.map(i => i.id === data.id ? data : i) : [...prev, data]);
            } else if (modalType === 'shipping') {
                data = {
                    ...data,
                    originCountry: data.origin_country,
                    destinationCountry: data.destination_country,
                    contactMethods: data.contact_methods
                };
                setShippingCompanies(prev => editingItem.id ? prev.map(i => i.id === data.id ? data : i) : [...prev, data]);
            } else if (modalType === 'currency') {
                setCurrencies(prev => editingItem.id ? prev.map(i => i.id === data.id ? data : i) : [...prev, data]);
            } else if (modalType === 'payment') {
                // Update via prop if available
                if (onUpdatePaymentMethods) {
                    onUpdatePaymentMethods(prev => {
                        const exists = prev.find(p => p.id === data.id);
                        if (exists) {
                            return prev.map(p => p.id === data.id ? data : p);
                        } else {
                            return [...prev, data];
                        }
                    });
                } else {
                    setSettings(prev => {
                        const currentMethods = prev.paymentMethods || [];
                        const exists = currentMethods.find(p => p.id === data.id);
                        if (exists) {
                            return { ...prev, paymentMethods: currentMethods.map(p => p.id === data.id ? data : p) };
                        } else {
                            return { ...prev, paymentMethods: [...currentMethods, data] };
                        }
                    });
                }
            }

            showToast(t('success'), 'success');
            logAction(editingItem.id ? 'Update' : 'Create', 'Settings', data.id, `${editingItem.id ? 'Updated' : 'Created'} ${modalType}`);
            handleCloseModal();
        } catch (e: any) {
            console.error(e);
            showToast('خطأ: ' + getErrorMessage(e), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const tabs: { id: Tab; label: string; icon: any; permission?: boolean }[] = [
        { id: 'profile', label: 'ملف الشركة', icon: Building2, permission: currentUser?.permissions.settings.canEditCompany },
        { id: 'system', label: 'النظام والتسعير', icon: Settings, permission: currentUser?.permissions.settings.canEditSystem },
        { id: 'payments', label: 'المالية والدفع', icon: Wallet, permission: currentUser?.permissions.settings.canEditSystem }, // New Tab
        { id: 'stores', label: 'المتاجر', icon: Building, permission: currentUser?.permissions.settings.canEditStores },
        { id: 'shipping', label: 'شركات الشحن', icon: Truck, permission: currentUser?.permissions.settings.canEditShipping },
        { id: 'currencies', label: 'العملات', icon: DollarSign, permission: currentUser?.permissions.settings.canEditCurrencies },
        { id: 'users', label: 'المستخدمين', icon: UserCog, permission: currentUser?.permissions.canManageUsers },
        { id: 'audit', label: 'سجل النظام', icon: History, permission: currentUser?.permissions.canViewAuditLog },
    ];

    const allowedTabs = tabs.filter(t => t.permission !== false);

    return (
        <div className="h-full flex flex-col md:flex-row gap-6">
            {/* Sidebar Tabs */}
            <div className="w-full md:w-64 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col overflow-hidden flex-shrink-0">
                <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <h2 className="font-bold text-lg text-gray-800 dark:text-white flex items-center gap-2">
                        <Settings className="text-primary"/> الإعدادات
                    </h2>
                </div>
                <div className="flex-grow overflow-y-auto p-2 space-y-1">
                    {allowedTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all ${
                                activeTab === tab.id 
                                ? 'bg-primary text-white shadow-md' 
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                        >
                            <tab.icon size={18} /> {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-grow min-w-0 h-full flex flex-col">
                {activeTab === 'profile' && (
                    <SettingsCard
                        title="معلومات الشركة"
                        description="تعديل بيانات الشركة التي تظهر في الفواتير والتقارير."
                        icon={<Building2 size={20}/>}
                    >
                        <div className="space-y-4 max-w-2xl">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-20 h-20 rounded-lg bg-gray-100 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center overflow-hidden relative group">
                                    {companyInfo.logo ? (
                                        <img src={companyInfo.logo} alt="Logo" className="w-full h-full object-contain" />
                                    ) : (
                                        <Upload size={24} className="text-gray-400" />
                                    )}
                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={handleLogoUpload} />
                                </div>
                                <div className="text-sm text-gray-500">
                                    <p className="font-bold">شعار الشركة</p>
                                    <p>انقر لرفع صورة (PNG, JPG)</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">اسم الشركة</label>
                                    <input type="text" value={companyInfo.name} onChange={e => setCompanyInfo({...companyInfo, name: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">رقم الهاتف</label>
                                    <input type="text" value={companyInfo.phone} onChange={e => setCompanyInfo({...companyInfo, phone: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium mb-1">العنوان</label>
                                    <input type="text" value={companyInfo.address} onChange={e => setCompanyInfo({...companyInfo, address: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium mb-1">شروط الفاتورة</label>
                                    <textarea value={companyInfo.invoiceTerms || ''} onChange={e => setCompanyInfo({...companyInfo, invoiceTerms: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" rows={3} placeholder="مثال: البضاعة المباعة لا ترد ولا تستبدل..." />
                                </div>
                            </div>
                            <div className="flex justify-end pt-4">
                                <button onClick={handleSaveCompany} disabled={isSaving} className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50">
                                    {isSaving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} حفظ التغييرات
                                </button>
                            </div>
                        </div>
                    </SettingsCard>
                )}

                {activeTab === 'system' && (
                    <SettingsCard
                        title="إعدادات النظام"
                        description="تكوين الأسعار، مناطق الشحن، وخيارات النظام."
                        icon={<Settings size={20}/>}
                    >
                        <div className="space-y-8 max-w-4xl">
                            {/* Shipping Zones Management */}
                            <div>
                                <h4 className="font-bold text-gray-700 dark:text-gray-300 mb-3 border-b dark:border-gray-700 pb-2 flex items-center gap-2">
                                    <Plane size={18} /> تسعيرة الشحن حسب المنطقة
                                </h4>
                                
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-sm text-blue-800 dark:text-blue-200 mb-4 flex gap-2 items-start">
                                    <Info size={18} className="flex-shrink-0 mt-0.5"/>
                                    <p>قم بإضافة المناطق (مثل: الصين، تركيا، دبي) وتحديد سعر الكيلوغرام للشحن السريع والعادي لكل منها.</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col justify-center items-center gap-3">
                                        <input 
                                            type="text" 
                                            placeholder="مثلاً: السعودية" 
                                            value={newZoneName}
                                            onChange={e => setNewZoneName(e.target.value)}
                                            className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 text-sm focus:ring-2 focus:ring-primary"
                                        />
                                        <button 
                                            onClick={addShippingZone}
                                            disabled={!newZoneName.trim()}
                                            className="w-full py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 text-sm font-bold flex justify-center items-center gap-2"
                                        >
                                            <Plus size={16}/> إضافة منطقة
                                        </button>
                                    </div>

                                    {/* Default Zone */}
                                    <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-yellow-200 dark:border-yellow-900 shadow-sm relative ring-1 ring-yellow-100 dark:ring-yellow-900/30">
                                        <div className="flex justify-between items-center mb-3">
                                            <h5 className="font-bold text-base text-gray-800 dark:text-white flex items-center gap-2">
                                                <Globe size={18} className="text-yellow-500"/> السعر العالمي (الافتراضي)
                                            </h5>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-500 mb-1">سريع (MRU/KG)</label>
                                                <input type="number" value={settings.shippingRates.fast} onChange={e => setSettings({...settings, shippingRates: {...settings.shippingRates, fast: parseFloat(e.target.value)}})} className="w-full p-2 border rounded dark:bg-gray-900 dark:border-gray-700 font-mono font-bold text-sm focus:ring-1 focus:ring-yellow-500 text-center" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-500 mb-1">عادي (MRU/KG)</label>
                                                <input type="number" value={settings.shippingRates.normal} onChange={e => setSettings({...settings, shippingRates: {...settings.shippingRates, normal: parseFloat(e.target.value)}})} className="w-full p-2 border rounded dark:bg-gray-900 dark:border-gray-700 font-mono font-bold text-sm focus:ring-1 focus:ring-yellow-500 text-center" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Custom Zones */}
                                    {settings.shippingZones?.map((zone, idx) => (
                                        <div key={idx} className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm relative group">
                                            <div className="flex justify-between items-center mb-3">
                                                <h5 className="font-bold text-base text-primary dark:text-primary-light flex items-center gap-2">
                                                    <MapPin size={18}/> {zone.name}
                                                </h5>
                                                <button onClick={() => removeShippingZone(zone.name)} className="text-gray-400 hover:text-red-500 p-1 rounded"><Trash2 size={16}/></button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-500 mb-1">سريع</label>
                                                    <input type="number" value={zone.rates.fast} onChange={e => updateZoneRate(zone.name, 'fast', parseFloat(e.target.value))} className="w-full p-2 border rounded dark:bg-gray-900 dark:border-gray-700 font-mono text-center" />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-500 mb-1">عادي</label>
                                                    <input type="number" value={zone.rates.normal} onChange={e => updateZoneRate(zone.name, 'normal', parseFloat(e.target.value))} className="w-full p-2 border rounded dark:bg-gray-900 dark:border-gray-700 font-mono text-center" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end pt-4 sticky bottom-0 bg-white dark:bg-gray-800 py-4 border-t dark:border-gray-700">
                                <button onClick={handleSaveSettings} disabled={isSaving} className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 shadow-lg">
                                    {isSaving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} حفظ كل الإعدادات
                                </button>
                            </div>
                        </div>
                    </SettingsCard>
                )}

                {/* NEW Payments Tab */}
                {activeTab === 'payments' && (
                    <SettingsCard
                        title="المالية ووسائل الدفع"
                        description="إدارة الحسابات البنكية وطرق الدفع المتاحة."
                        icon={<CreditCard size={20}/>}
                        actions={
                            <button onClick={() => handleOpenModal('payment')} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark">
                                <Plus size={16}/> إضافة وسيلة
                            </button>
                        }
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {settings.paymentMethods?.map(method => (
                                <div key={method.id} className="p-4 border rounded-xl dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col gap-3 relative group">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            {method.logo ? (
                                                <img src={method.logo} alt={method.name} className="w-12 h-12 rounded-lg object-contain bg-gray-50 dark:bg-gray-700 border dark:border-gray-600"/>
                                            ) : (
                                                <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400">
                                                    <DollarSign size={20}/>
                                                </div>
                                            )}
                                            <div>
                                                <h4 className="font-bold text-gray-800 dark:text-white">{method.name}</h4>
                                                {method.number && <p className="text-sm font-mono text-gray-500">{method.number}</p>}
                                            </div>
                                        </div>
                                    </div>
                                    {method.note && <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-2 rounded">{method.note}</p>}
                                    
                                    <div className="flex justify-end gap-2 mt-auto pt-2 border-t dark:border-gray-700">
                                        <button onClick={() => handleOpenModal('payment', method)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit size={16}/></button>
                                        <button onClick={() => handleDeleteItem('payment', method.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </SettingsCard>
                )}

                {activeTab === 'stores' && (
                    <SettingsCard
                        title="إدارة المتاجر"
                        description="إضافة وتعديل قائمة المتاجر المتاحة."
                        icon={<Building size={20}/>}
                        actions={
                            <button onClick={() => handleOpenModal('store')} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark">
                                <Plus size={16}/> إضافة متجر
                            </button>
                        }
                    >
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {stores.map(store => (
                                <div key={store.id} className="p-4 border rounded-lg dark:border-gray-700 flex flex-col justify-between bg-white dark:bg-gray-800 relative">
                                    {/* Store Color Indicator */}
                                    <div className="absolute top-4 left-4 w-3 h-3 rounded-full" style={{ backgroundColor: store.color || '#9ca3af' }}></div>
                                    
                                    <div className="mb-2">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                {store.logo && (
                                                    <img src={store.logo} alt={store.name} className="w-10 h-10 rounded-full object-contain bg-white border border-gray-100 dark:border-gray-600 p-0.5"/>
                                                )}
                                                <div>
                                                    <p className="font-bold text-lg">{store.name}</p>
                                                    {store.country && <span className="text-xs text-gray-500 block">{store.country}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2 flex items-center gap-1"><Clock size={12}/> توصيل خلال {store.estimatedDeliveryDays} يوم</p>
                                        {store.website && (
                                            <a 
                                                href={store.website} 
                                                target="_blank" 
                                                rel="noopener noreferrer" 
                                                className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                                            >
                                                <LinkIcon size={14}/> زيارة المتجر
                                            </a>
                                        )}
                                    </div>
                                    <div className="flex gap-2 justify-end mt-2 pt-2 border-t dark:border-gray-700">
                                        <button onClick={() => handleOpenModal('store', store)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit size={16}/></button>
                                        <button onClick={() => handleDeleteItem('store', store.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                            ))}
                         </div>
                    </SettingsCard>
                )}

                {/* Other Tabs (unchanged logic) */}
                {activeTab === 'shipping' && (
                    <SettingsCard title="شركات الشحن" description="إدارة شركات الشحن المحلية والدولية." icon={<Truck size={20}/>} actions={<button onClick={() => handleOpenModal('shipping')} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark"><Plus size={16}/> إضافة شركة</button>}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {shippingCompanies.map(company => (
                                <div key={company.id} className="p-4 border rounded-lg dark:border-gray-700 bg-white dark:bg-gray-800">
                                    <h4 className="font-bold text-lg mb-1">{company.name}</h4>
                                    <div className="text-xs text-gray-500 space-y-1">
                                        {company.originCountry && <p>من: {company.originCountry}</p>}
                                        {company.destinationCountry && <p>إلى: {company.destinationCountry}</p>}
                                    </div>
                                    <div className="flex gap-2 justify-end mt-3 pt-2 border-t dark:border-gray-700">
                                        <button onClick={() => handleOpenModal('shipping', company)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit size={16}/></button>
                                        <button onClick={() => handleDeleteItem('shipping', company.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </SettingsCard>
                )}

                {activeTab === 'currencies' && (
                    <SettingsCard title="العملات" description="إدارة العملات الأجنبية." icon={<DollarSign size={20}/>} actions={<button onClick={() => handleOpenModal('currency')} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark"><Plus size={16}/> إضافة عملة</button>}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right">
                                <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500">
                                    <tr>
                                        <th className="p-3">الرمز</th>
                                        <th className="p-3">الاسم</th>
                                        <th className="p-3">سعر الصرف (MRU)</th>
                                        <th className="p-3 text-center">إجراءات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currencies.map(curr => (
                                        <tr key={curr.id} className="border-b dark:border-gray-700">
                                            <td className="p-3 font-bold">{curr.code}</td>
                                            <td className="p-3">{curr.name}</td>
                                            <td className="p-3 font-mono">{curr.rate}</td>
                                            <td className="p-3 flex justify-center gap-2">
                                                <button onClick={() => handleOpenModal('currency', curr)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit size={16}/></button>
                                                <button onClick={() => handleDeleteItem('currency', curr.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SettingsCard>
                )}

                {activeTab === 'users' && <div className="h-full overflow-y-auto custom-scrollbar p-1"><UsersPage users={users} setUsers={setUsers} logAction={logAction} globalActivityLog={globalActivityLog} /></div>}
                {activeTab === 'audit' && <div className="h-full overflow-y-auto custom-scrollbar p-1"><AuditLogPage log={globalActivityLog} /></div>}
            </div>

            {/* Generic Modal for Adding/Editing Items */}
            {modalType && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-[70] p-4" onClick={handleCloseModal}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4 pb-2 border-b dark:border-gray-700 flex-shrink-0">
                            <h3 className="text-xl font-bold">
                                {editingItem.id && !String(editingItem.id).startsWith('pm_') ? t('edit') : t('add')} {modalType === 'store' ? 'متجر' : modalType === 'payment' ? 'وسيلة دفع' : modalType === 'shipping' ? 'شركة شحن' : 'عملة'}
                            </h3>
                            <button onClick={handleCloseModal} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"><X size={20} /></button>
                        </div>
                        
                        <div className="space-y-4 flex-grow overflow-y-auto custom-scrollbar">
                            {modalType === 'store' && (
                                <>
                                    <div className="flex justify-center mb-4">
                                        <div className="relative group w-24 h-24 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-800 overflow-hidden">
                                            {editingItem.logo ? (
                                                <img src={editingItem.logo} alt="Logo" className="w-full h-full object-contain" />
                                            ) : (
                                                <ImageIcon size={32} className="text-gray-400" />
                                            )}
                                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={handleItemImageUpload} />
                                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-white text-xs font-bold">
                                                تغيير الشعار
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">اسم المتجر</label>
                                        <input type="text" value={editingItem.name || ''} onChange={e => setEditingItem({...editingItem, name: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">الدولة</label>
                                        <input type="text" value={editingItem.country || ''} onChange={e => setEditingItem({...editingItem, country: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">الموقع الإلكتروني</label>
                                        <input type="text" value={editingItem.website || ''} onChange={e => setEditingItem({...editingItem, website: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">وقت التوصيل التقديري (أيام)</label>
                                        <input type="number" value={editingItem.estimatedDeliveryDays || ''} onChange={e => setEditingItem({...editingItem, estimatedDeliveryDays: parseInt(e.target.value)})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-2">لون تمييز المتجر</label>
                                        <div className="flex flex-wrap gap-2">
                                            {STORE_COLORS.map(color => (
                                                <button
                                                    key={color}
                                                    onClick={() => setEditingItem({...editingItem, color})}
                                                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center ${editingItem.color === color ? 'border-gray-500 scale-110' : 'border-transparent'}`}
                                                    style={{ backgroundColor: color }}
                                                >
                                                    {editingItem.color === color && <Check size={14} className="text-white drop-shadow-md"/>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {modalType === 'payment' && (
                                <>
                                    <div className="flex justify-center mb-4">
                                        <div className="relative group w-full h-32 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-800 overflow-hidden">
                                            {editingItem.logo ? (
                                                <img src={editingItem.logo} alt="Logo" className="h-full object-contain" />
                                            ) : (
                                                <div className="text-center text-gray-400">
                                                    <ImageIcon size={32} className="mx-auto mb-1" />
                                                    <span className="text-xs">اضغط لرفع صورة/شعار</span>
                                                </div>
                                            )}
                                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={handleItemImageUpload} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">اسم الوسيلة (مثلاً: بنكيلي)</label>
                                        <input type="text" value={editingItem.name || ''} onChange={e => setEditingItem({...editingItem, name: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="اسم الوسيلة" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">الرقم / الحساب</label>
                                        <input type="text" value={editingItem.number || ''} onChange={e => setEditingItem({...editingItem, number: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono" placeholder="XXXXXX" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">ملاحظة إضافية</label>
                                        <input type="text" value={editingItem.note || ''} onChange={e => setEditingItem({...editingItem, note: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="مثال: باسم محمد..." />
                                    </div>
                                </>
                            )}

                            {modalType === 'shipping' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">اسم الشركة</label>
                                        <input type="text" value={editingItem.name || ''} onChange={e => setEditingItem({...editingItem, name: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">بلد المنشأ</label>
                                        <input type="text" value={editingItem.originCountry || ''} onChange={e => setEditingItem({...editingItem, originCountry: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">بلد الوصول</label>
                                        <input type="text" value={editingItem.destinationCountry || ''} onChange={e => setEditingItem({...editingItem, destinationCountry: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                    </div>
                                </>
                            )}

                            {modalType === 'currency' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">الرمز (Code)</label>
                                        <input type="text" value={editingItem.code || ''} onChange={e => setEditingItem({...editingItem, code: e.target.value.toUpperCase()})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 uppercase" placeholder="USD" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">الاسم</label>
                                        <input type="text" value={editingItem.name || ''} onChange={e => setEditingItem({...editingItem, name: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="دولار أمريكي" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">سعر الصرف (مقابل 1 عملة)</label>
                                        <input type="number" value={editingItem.rate || ''} onChange={e => setEditingItem({...editingItem, rate: parseFloat(e.target.value)})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" step="0.01" />
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 mt-6 flex-shrink-0 pt-2 border-t dark:border-gray-700">
                            <button onClick={handleCloseModal} className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 rounded-lg">{t('cancel')}</button>
                            <button onClick={handleSaveItem} disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 flex items-center gap-2">
                                {isSaving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} {editingItem.id && !String(editingItem.id).startsWith('pm_') ? t('save') : t('add')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsPage;
