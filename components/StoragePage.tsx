
import React, { useState, useMemo, useEffect, useContext } from 'react';
import type { StorageDrawer, Order, Client, ActivityLog, Store, PendingStorageData, CompanyInfo } from '../types';
import { OrderStatus, ShippingType } from '../types';
import { PlusCircle, Archive, X, Save, Search, Package, Check, User, Layers, Edit, Trash2, PackageSearch, Lightbulb, Weight, Loader2, Grid3X3, CheckCircle2, ScanBarcode, Store as StoreIcon, Hash, Globe, Box, CheckCheck, MessageCircle, ArrowRight, LayoutGrid, Printer, Bike, Clock, Calculator, MapPin, Truck, DollarSign, Sparkles } from 'lucide-react';
import { STATUS_DETAILS } from '../constants';
import type { AppSettings } from '../types';
import { AuthContext } from '../contexts/AuthContext';
import { supabase, getErrorMessage } from '../supabaseClient';
import { useToast } from '../contexts/ToastContext';
import StorageSelectorModal from './StorageSelectorModal';

interface StoragePageProps {
    drawers: StorageDrawer[];
    setDrawers: React.Dispatch<React.SetStateAction<StorageDrawer[]>>;
    orders: Order[];
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
    clients: Client[];
    settings: AppSettings;
    stores: Store[];
    companyInfo: CompanyInfo;
}

interface StatCardProps {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    colorClass?: string;
    trend?: string;
}

const getStorageSuggestion = (orderToStore: Order, allOrders: Order[], drawers: StorageDrawer[]): { location: string | null; score: number; reasons: string[] } => {
    const occupiedSlots = new Set(allOrders.filter(o => o.status === OrderStatus.STORED).map(o => o.storageLocation).filter(Boolean));
    
    const scoredDrawers = drawers.map(drawer => {
        const ordersInDrawer = allOrders.filter(o => o.storageLocation?.startsWith(drawer.name + '-') && o.status === OrderStatus.STORED);
        if (ordersInDrawer.length >= drawer.capacity) return null;

        let score = 0;
        let reasons: string[] = [];

        if (orderToStore.shipmentId && ordersInDrawer.some(o => o.shipmentId === orderToStore.shipmentId)) {
            score += 40;
            reasons.push("شحنة مماثلة");
        }
        if (ordersInDrawer.some(o => o.clientId === orderToStore.clientId)) {
            score += 25;
            reasons.push("نفس العميل");
        }
        const fillPercentage = ordersInDrawer.length / drawer.capacity;
        if (fillPercentage > 0.1 && fillPercentage < 0.9) {
            score += 20;
            reasons.push("مساحة جيدة");
        }
        return { drawer, score, reasons };
    }).filter((d): d is { drawer: StorageDrawer; score: number; reasons: string[] } => d !== null);

    scoredDrawers.sort((a, b) => b.score - a.score);

    const bestDrawerInfo = scoredDrawers[0];
    if (!bestDrawerInfo) return { location: null, score: 0, reasons: [] };

    let firstAvailableSlot: string | null = null;
    for (let i = 1; i <= bestDrawerInfo.drawer.capacity; i++) {
        const slotLocation = `${bestDrawerInfo.drawer.name}-${String(i).padStart(2, '0')}`;
        if (!occupiedSlots.has(slotLocation)) {
            firstAvailableSlot = slotLocation;
            break;
        }
    }

    return { location: firstAvailableSlot, score: bestDrawerInfo.score, reasons: bestDrawerInfo.reasons };
};

const printMiniLabel = (order: Order, client: Client | undefined, store: Store | undefined) => {
    const printWindow = window.open('', '_blank', 'width=600,height=800');
    if (!printWindow) return;

    const html = `
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@600;800;900&display=swap');
                @page { size: 100mm 150mm; margin: 0; }
                body { 
                    font-family: 'Cairo', sans-serif; 
                    margin: 0; 
                    padding: 0; 
                    width: 100mm; 
                    height: 150mm; 
                    box-sizing: border-box; 
                    text-align: center; 
                    color: #000; 
                    background: #fff;
                }
                .container { 
                    width: 94%; 
                    height: 96%; 
                    margin: 2% 3%;
                    border: 4px solid #000; 
                    border-radius: 16px; 
                    display: flex; 
                    flex-direction: column; 
                    overflow: hidden;
                    box-sizing: border-box;
                }
                .header { 
                    border-bottom: 3px solid #000; 
                    padding: 10px 0;
                    background-color: #fff;
                }
                .order-id {
                    font-size: 50px; 
                    font-weight: 900; 
                    line-height: 1;
                    font-family: sans-serif;
                }
                .client-section { 
                    flex-grow: 1; 
                    display: flex; 
                    flex-direction: column; 
                    justify-content: center; 
                    align-items: center; 
                    padding: 10px; 
                }
                .client-name { 
                    font-size: 32px; 
                    font-weight: 800; 
                    line-height: 1.2; 
                    margin-bottom: 15px;
                }
                .client-phone { 
                    font-size: 38px; 
                    font-weight: 900; 
                    font-family: monospace; 
                    border: 3px solid #000;
                    padding: 5px 20px;
                    border-radius: 50px;
                    background-color: #fff;
                }
                .client-address {
                    font-size: 16px;
                    font-weight: 700;
                    margin-top: 10px;
                    max-width: 90%;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .footer-grid { 
                    display: flex; 
                    border-top: 3px solid #000; 
                    height: 110px;
                }
                .cell { 
                    flex: 1; 
                    display: flex; 
                    flex-direction: column; 
                    justify-content: center; 
                    align-items: center; 
                    border-left: 3px solid #000;
                }
                .cell:last-child { border-left: none; }
                .label { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
                .value { font-size: 22px; font-weight: 800; }
                .loc-value { font-size: 32px; font-weight: 900; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="order-id">${order.localOrderId}</div>
                </div>
                <div class="client-section">
                    <div class="client-name">${client?.name || '---'}</div>
                    <div class="client-phone" dir="ltr">${client?.phone || ''}</div>
                    <div class="client-address">${client?.address || ''}</div>
                </div>
                <div class="footer-grid">
                    <div class="cell" style="flex: 1.2;">
                        <span class="label">الموقع</span>
                        <span class="loc-value">${order.storageLocation || '-'}</span>
                    </div>
                    <div class="cell">
                        <span class="label">العدد</span>
                        <span class="value">${order.quantity}</span>
                    </div>
                    <div class="cell">
                        <span class="label">المتجر</span>
                        <span class="value" style="font-size: 16px;">${store?.name || '-'}</span>
                    </div>
                </div>
            </div>
            <script>window.onload = function() { window.print(); }</script>
        </body>
        </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
};

const Highlight: React.FC<{ text: string; highlight: string }> = ({ text, highlight }) => {
    if (!highlight.trim()) return <>{text}</>;
    const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return <>{parts.map((part, i) => part.toLowerCase() === highlight.toLowerCase() ? <span key={i} className="bg-yellow-300 text-black rounded px-0.5 font-bold shadow-sm">{part}</span> : part)}</>;
};

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, colorClass = "bg-primary", trend }) => (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between group hover:shadow-md transition-all">
        <div>
            <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">{title}</p>
            <h3 className="text-2xl font-black text-gray-900 dark:text-white font-mono">{value}</h3>
            {trend && <span className="text-[10px] text-gray-400">{trend}</span>}
        </div>
        <div className={`p-3 rounded-xl ${colorClass} text-white shadow-lg bg-opacity-90 group-hover:scale-110 transition-transform`}>{icon}</div>
    </div>
);

const StoredSuccessModal: React.FC<{ isOpen: boolean; onClose: () => void; data: PendingStorageData | null; client?: Client; order?: Order; store?: Store; settings: AppSettings; allOrders?: Order[]; companyInfo: CompanyInfo; }> = ({ isOpen, onClose, data, client, order, store, settings, allOrders = [], companyInfo }) => {
    const [selectedLanguage, setSelectedLanguage] = useState<'ar' | 'en' | 'fr'>('ar');
    if (!isOpen || !data || !client) return null;

    const getGreeting = (lang: 'ar' | 'en' | 'fr') => {
        if (lang === 'ar') return client.gender === 'female' ? "السيدة" : "السيد";
        if (lang === 'fr') return client.gender === 'female' ? "Mme" : "M.";
        return client.gender === 'female' ? "Ms." : "Mr.";
    };

    const getLoyaltyMessage = (lang: 'ar' | 'en' | 'fr') => {
        const count = allOrders.filter(o => o.clientId === client.id).length;
        if (count <= 1) {
            if (lang === 'ar') return "نحن فخورون بخدمتكم لأول مرة، ونتطلع لعلاقة عمل مستدامة.";
            if (lang === 'fr') return "Nous sommes fiers de vous servir.";
            return "We are proud to serve you.";
        }
        if (lang === 'ar') return "شكراً لكم مرة أخرى على وفائكم المستمر، أنتم من أهم عملائنا.";
        if (lang === 'fr') return "Merci encore pour votre fidélité.";
        return "Thanks again for your continuous loyalty.";
    };

    const formatMessage = (template: string) => {
        const greeting = getGreeting(selectedLanguage);
        const loyaltyMessage = getLoyaltyMessage(selectedLanguage);
        const shippingCost = Math.round(data.shippingCost);
        const totalDue = Math.round(data.grandTotal);
        
        // Calculate dynamic product remaining
        const orderPrice = Math.round(Number(order?.priceInMRU || 0) + Number(order?.commission || 0));
        const paidSoFar = Math.round(Number(order?.amountPaid || 0));
        const productRemaining = Math.max(0, orderPrice - paidSoFar);

        let remainingLine = "";
        if (productRemaining > 0) {
            if (selectedLanguage === 'ar') remainingLine = `🔹 المتبقي من سعر المنتج: ${productRemaining.toLocaleString()} MRU`;
            else if (selectedLanguage === 'fr') remainingLine = `🔹 Reste du prix du produit: ${productRemaining.toLocaleString()} MRU`;
            else remainingLine = `🔹 Remaining product price: ${productRemaining.toLocaleString()} MRU`;
        }

        let message = template
            .replace(/{clientName}/g, client.name)
            .replace(/{orderId}/g, order?.localOrderId || '')
            .replace(/{location}/g, data.storageLocation)
            .replace(/{weight}/g, data.weight.toString())
            .replace(/{shippingCost}/g, shippingCost.toLocaleString())
            .replace(/{productRemainingLine}/g, remainingLine)
            .replace(/{totalDue}/g, totalDue.toLocaleString())
            .replace(/{greeting}/g, greeting)
            .replace(/{companyName}/g, companyInfo.name)
            .replace(/{loyaltyMessage}/g, loyaltyMessage);
        
        return message.replace(/\n{3,}/g, '\n\n').trim();
    };

    const currentTemplate = settings.whatsappTemplates?.[selectedLanguage] || '';
    const message = formatMessage(currentTemplate);
    const whatsappLink = `https://wa.me/${client.whatsappNumber || client.phone}?text=${encodeURIComponent(message)}`;

    return (
        <div className="fixed inset-0 bg-slate-900/90 flex justify-center items-center z-[70] p-4 backdrop-blur-md" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl p-8 w-full max-w-md text-center border-t-8 border-green-500 relative overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                
                <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner ring-8 ring-green-50 dark:ring-green-900/10">
                    <Sparkles size={48} />
                </div>
                
                <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2 tracking-tight">تمت العملية بنجاح</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-8 font-bold text-sm uppercase tracking-widest">الطلب جاهز للاستلام الآن</p>
                
                <div className="flex justify-center gap-2 mb-6 bg-gray-100 dark:bg-gray-700/50 p-1.5 rounded-2xl border border-gray-200 dark:border-gray-600">
                    {(['ar', 'en', 'fr'] as const).map(lang => (
                        <button key={lang} onClick={() => setSelectedLanguage(lang)} className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${selectedLanguage === lang ? 'bg-white dark:bg-gray-600 text-primary shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>
                            {lang.toUpperCase()}
                        </button>
                    ))}
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-3xl text-right mb-8 text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar border border-slate-100 dark:border-slate-800 text-sm leading-relaxed shadow-inner" dir={selectedLanguage === 'ar' ? 'rtl' : 'ltr'}>
                    {message}
                </div>

                <div className="space-y-3">
                    <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-3 w-full py-4 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-2xl font-black transition-all shadow-lg shadow-green-500/20 active:scale-95 transform">
                        <MessageCircle size={24}/> إرسال الفاتورة والبيان
                    </a>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => printMiniLabel(order!, client, store)} className="flex items-center justify-center gap-2 py-3.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-bold transition-all hover:bg-slate-200 dark:hover:bg-slate-600 active:scale-95">
                            <Printer size={20}/> ملصق الطرد
                        </button>
                        <button onClick={onClose} className="py-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 font-bold transition-colors">إغلاق</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AwaitingStorageRow: React.FC<{ order: Order; client?: Client; store?: Store; drawers: StorageDrawer[]; allOrders: Order[]; onConfirm: (data: PendingStorageData) => void; searchTerm: string; settings: AppSettings; }> = ({ order, client, drawers, allOrders, onConfirm, store, searchTerm, settings }) => {
    const [weight, setWeight] = useState<number>(order.weight || 0);
    const [shippingType, setShippingType] = useState<ShippingType>(order.shippingType || settings.defaultShippingType);
    const [location, setLocation] = useState(order.storageLocation || '');
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [wantsDelivery, setWantsDelivery] = useState(false);

    const origin = (order.originCenter || 'Dubai').trim().toLowerCase();
    const zone = settings?.shippingZones?.find(z => z.name.trim().toLowerCase() === origin);
    
    let fastRate = settings.shippingRates.fast;
    let normalRate = settings.shippingRates.normal;

    if (zone) {
        fastRate = zone.rates.fast;
        normalRate = zone.rates.normal;
    }

    const shippingRate = shippingType === ShippingType.FAST ? fastRate : normalRate;
    const calculatedShipping = Math.round(weight * shippingRate);
    
    const productTotal = Math.round(Number(order.priceInMRU || 0) + Number(order.commission || 0));
    const paidVal = Math.round(Number(order.amountPaid || 0));
    const grandTotal = Math.round(productTotal + calculatedShipping);
    const remaining = grandTotal - paidVal;

    const suggestion = useMemo(() => getStorageSuggestion(order, allOrders, drawers), [order, allOrders, drawers]);

    const handleConfirm = () => {
        if (weight > 0 && location) {
            onConfirm({
                orderId: order.id,
                weight,
                shippingCost: calculatedShipping,
                shippingType,
                storageLocation: location,
                grandTotal,
                remaining,
                localDeliveryCost: wantsDelivery ? 1 : 0
            });
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-300 group">
            <StorageSelectorModal isOpen={isSelectorOpen} onClose={() => setIsSelectorOpen(false)} onSelect={(loc) => { setLocation(loc); setIsSelectorOpen(false); }} drawers={drawers} allOrders={allOrders} suggestedLocation={suggestion.location} clients={[]} />

            <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 w-full">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <span className="font-black font-mono text-lg text-gray-800 dark:text-gray-100 tracking-tight flex items-center gap-2">
                                <Highlight text={order.localOrderId} highlight={searchTerm} />
                                {order.originCenter && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-sans border border-purple-200 dark:border-purple-800">{order.originCenter}</span>}
                            </span>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-0.5 font-medium">
                                <p className="flex items-center gap-1.5"><User size={12} className="text-primary"/> <Highlight text={client?.name || ''} highlight={searchTerm} /></p>
                                <p className="flex items-center gap-1.5"><StoreIcon size={12} className="text-orange-500"/> {store?.name}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className={`text-xs font-bold px-2 py-1 rounded ${order.shippingType === ShippingType.FAST ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                                {order.shippingType === ShippingType.FAST ? 'سريع' : 'عادي'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-end gap-2 justify-end w-full md:w-auto">
                    <div className="w-24">
                        <label className="text-[10px] font-bold text-gray-400 mb-1 block">الوزن (KG)</label>
                        <input type="number" value={weight || ''} onChange={(e) => setWeight(parseFloat(e.target.value))} className="w-full p-2 text-center font-mono font-bold border rounded-xl dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary outline-none" placeholder="0.0" step="0.1"/>
                    </div>

                    <div onClick={() => setWantsDelivery(!wantsDelivery)} className={`p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col items-center justify-center min-w-[70px] ${wantsDelivery ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 text-blue-700 dark:text-blue-300' : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700 text-gray-400'}`}>
                        <Bike size={18} />
                        <span className="text-[9px] font-bold mt-1">توصيل؟</span>
                    </div>

                    <div className="w-36">
                        <label className="text-[10px] font-bold text-gray-400 mb-1 block">الموقع</label>
                        <div onClick={() => setIsSelectorOpen(true)} className={`w-full p-2 border rounded-xl cursor-pointer flex items-center justify-between transition-all ${location ? 'bg-green-50 border-green-300 text-green-700 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' : 'bg-gray-50 border-dashed border-gray-300 text-gray-400 dark:bg-gray-800 dark:border-gray-600'}`}>
                            <span className="font-bold text-sm truncate">{location || 'اختر...'}</span>
                            <Grid3X3 size={16}/>
                        </div>
                    </div>

                    <button onClick={handleConfirm} disabled={!weight || !location} className="h-[42px] w-[42px] rounded-xl bg-primary text-white shadow-lg hover:bg-primary-dark disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 flex items-center justify-center transition-all transform active:scale-95">
                        <Check size={24} strokeWidth={3}/>
                    </button>
                </div>
            </div>

            <div className="mt-3 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700 flex flex-wrap justify-between items-center text-xs gap-3">
                <div className="flex gap-4 text-gray-500 dark:text-gray-400 font-medium">
                    <span>المنتج: <strong className="text-gray-700 dark:text-gray-300">{productTotal.toLocaleString()}</strong></span>
                    <span>المدفوع: <strong className="text-green-600 dark:text-green-400">{paidVal.toLocaleString()}</strong></span>
                </div>
                
                <div className="flex gap-3 items-center bg-gray-50 dark:bg-gray-700/50 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700">
                    <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        <Truck size={12}/> شحن: <strong>{calculatedShipping.toLocaleString()}</strong>
                    </span>
                    <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>
                    <span className={`flex items-center gap-1 font-black text-sm ${remaining > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600'}`}>
                        <DollarSign size={14}/>
                        {remaining > 0 ? 'المستحق:' : 'المتبقي:'} {remaining.toLocaleString()} <span className="text-[10px] font-normal">MRU</span>
                    </span>
                </div>
            </div>
        </div>
    );
};

// --- FIX: Add missing AddDrawerModal component ---
const AddDrawerModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (drawer: Partial<StorageDrawer>) => void;
    isSaving: boolean;
}> = ({ isOpen, onClose, onSave, isSaving }) => {
    const [name, setName] = useState('');
    const [rows, setRows] = useState(1);
    const [columns, setColumns] = useState(5);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            name,
            rows,
            columns,
            capacity: rows * columns
        });
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[70] p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 pb-2 border-b dark:border-gray-700">
                    <h3 className="text-lg font-bold">إضافة وحدة تخزين جديدة</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">اسم الوحدة (مثلاً: A)</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">عدد الصفوف</label>
                            <input type="number" min="1" value={rows} onChange={e => setRows(parseInt(e.target.value))} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">عدد الأعمدة</label>
                            <input type="number" min="1" value={columns} onChange={e => setColumns(parseInt(e.target.value))} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        </div>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-center">
                        <span className="text-xs text-blue-600 dark:text-blue-300">السعة الكلية: </span>
                        <span className="font-bold text-lg">{rows * columns}</span>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">إلغاء</button>
                        <button type="submit" disabled={isSaving || !name} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50">
                            {isSaving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} حفظ
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- FIX: Add missing DrawerDetailsModal component ---
const DrawerDetailsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    drawer: StorageDrawer | null;
    orders: Order[];
    clients: Client[];
    stores: Store[];
}> = ({ isOpen, onClose, drawer, orders, clients, stores }) => {
    if (!isOpen || !drawer) return null;

    const drawerOrders = orders.filter(o => o.storageLocation?.startsWith(drawer.name + '-') && o.status === OrderStatus.STORED);

    return (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[70] p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 text-primary rounded-lg"><Grid3X3 size={24}/></div>
                        <h3 className="text-xl font-bold">محتويات الوحدة: {drawer.name}</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X size={24} /></button>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scrollbar flex-grow">
                    {drawerOrders.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {drawerOrders.map(order => {
                                const client = clients.find(c => c.id === order.clientId);
                                const store = stores.find(s => s.id === order.storeId);
                                return (
                                    <div key={order.id} className="p-4 border rounded-xl dark:border-gray-700 hover:border-primary/30 transition-all bg-gray-50/50 dark:bg-gray-900/20">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-mono font-bold text-primary">{order.localOrderId}</span>
                                            <span className="text-xs font-bold bg-white dark:bg-gray-700 px-2 py-1 rounded shadow-sm">{order.storageLocation}</span>
                                        </div>
                                        <div className="space-y-1 text-sm">
                                            <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><User size={14} className="text-gray-400"/> {client?.name}</p>
                                            <p className="flex items-center gap-2 text-gray-500"><StoreIcon size={14}/> {store?.name}</p>
                                            <p className="text-xs text-gray-400 font-mono mt-2">تاريخ التخزين: {order.storageDate ? new Date(order.storageDate).toLocaleDateString() : '---'}</p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-20 text-gray-400">
                            <Package size={48} className="mx-auto mb-2 opacity-20"/>
                            <p>لا توجد طرود في هذه الوحدة حالياً.</p>
                        </div>
                    )}
                </div>
                
                <div className="p-4 border-t dark:border-gray-700 text-center bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl">
                    <p className="text-sm text-gray-500">إجمالي الطرود: <span className="font-bold text-gray-800 dark:text-white">{drawerOrders.length}</span> من أصل {drawer.capacity}</p>
                </div>
            </div>
        </div>
    );
};

const StoragePage: React.FC<StoragePageProps> = ({ drawers, setDrawers, orders, setOrders, clients, settings, stores, companyInfo }) => {
    const { currentUser } = useContext(AuthContext);
    const { showToast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
    const [viewingDrawer, setViewingDrawer] = useState<StorageDrawer | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [successData, setSuccessData] = useState<PendingStorageData | null>(null);

    const totalCapacity = drawers.reduce((sum, d) => sum + d.capacity, 0);
    const storedCount = orders.filter(o => o.status === OrderStatus.STORED).length;
    const occupancyRate = totalCapacity > 0 ? Math.round((storedCount / totalCapacity) * 100) : 0;
    
    const awaitingStorage = orders.filter(o => o.status === OrderStatus.ARRIVED_AT_OFFICE && (
        o.localOrderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.trackingNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        clients.find(c => c.id === o.clientId)?.name.toLowerCase().includes(searchTerm.toLowerCase())
    ));

    const handleAddDrawer = async (drawer: Partial<StorageDrawer>) => {
        if (!supabase) return;
        setIsSaving(true);
        try {
            const { data, error } = await supabase.from('StorageDrawers').insert(drawer).select().single();
            if (error) throw error;
            setDrawers(prev => [...prev, data]);
            showToast('تم إضافة الدرج بنجاح', 'success');
            setIsAddDrawerOpen(false);
        } catch (e: any) {
            showToast(getErrorMessage(e), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteDrawer = async (id: string) => {
        if (!confirm('هل أنت متأكد من حذف هذا الدرج؟')) return;
        if (!supabase) return;
        try {
            const { error } = await supabase.from('StorageDrawers').delete().eq('id', id);
            if (error) throw error;
            setDrawers(prev => prev.filter(d => d.id !== id));
            showToast('تم حذف الدرج', 'success');
        } catch (e: any) {
            showToast(getErrorMessage(e), 'error');
        }
    };

    const handleConfirmStorage = async (data: PendingStorageData) => {
        if (!supabase) return;
        const user = currentUser?.username || 'System';
        try {
            const updates: any = {
                status: OrderStatus.STORED,
                weight: data.weight,
                shipping_cost: Math.round(data.shippingCost),
                shipping_type: data.shippingType,
                storage_location: data.storageLocation,
                storage_date: new Date().toISOString(),
                local_delivery_cost: 0 
            };
            const newLog: ActivityLog = { timestamp: new Date().toISOString(), activity: `Stored at ${data.storageLocation}`, user };
            
            setOrders(prev => prev.map(o => o.id === data.orderId ? { ...o, ...updates, history: [...(o.history||[]), newLog] } : o));
            setSuccessData(data);

            const { data: currentOrder } = await supabase.from('Orders').select('history').eq('id', data.orderId).single();
            updates.history = [...(currentOrder?.history || []), newLog];
            
            if (data.localDeliveryCost === 1) {
                const { data: orderData } = await supabase.from('Orders').select('notes').eq('id', data.orderId).single();
                const currentNotes = orderData?.notes || '';
                if (!currentNotes.includes('طلب توصيل')) {
                    updates.notes = (currentNotes + '\n[طلب توصيل]').trim();
                }
            }

            await supabase.from('Orders').update(updates).eq('id', data.orderId);
        } catch (e: any) {
            console.error(e);
            showToast('خطأ أثناء التخزين: ' + getErrorMessage(e), 'error');
        }
    };

    return (
        <div className="space-y-6">
            <AddDrawerModal isOpen={isAddDrawerOpen} onClose={() => setIsAddDrawerOpen(false)} onSave={handleAddDrawer} isSaving={isSaving} />
            <DrawerDetailsModal isOpen={!!viewingDrawer} onClose={() => setViewingDrawer(null)} drawer={viewingDrawer} orders={orders} clients={clients} stores={stores} />
            <StoredSuccessModal isOpen={!!successData} onClose={() => setSuccessData(null)} data={successData} client={clients.find(c => c.id === orders.find(o => o.id === successData?.orderId)?.clientId)} order={orders.find(o => o.id === successData?.orderId)} store={stores.find(s => s.id === orders.find(o => o.id === successData?.orderId)?.storeId)} settings={settings} allOrders={orders} companyInfo={companyInfo} />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title="إجمالي السعة" value={totalCapacity} icon={<Grid3X3 size={20}/>} colorClass="bg-gradient-to-br from-blue-500 to-blue-600" />
                <StatCard title="مشغول" value={storedCount} icon={<Package size={20}/>} colorClass="bg-gradient-to-br from-purple-500 to-purple-600" />
                <StatCard title="نسبة الإشغال" value={`${occupancyRate}%`} icon={<LayoutGrid size={20}/>} colorClass={occupancyRate > 90 ? "bg-gradient-to-br from-red-500 to-red-600" : "bg-gradient-to-br from-green-500 to-green-600"} />
                <StatCard title="قيد الانتظار" value={awaitingStorage.length} icon={<Clock size={20}/>} colorClass="bg-gradient-to-br from-orange-500 to-orange-600" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-auto lg:h-[650px]">
                <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-700 flex flex-col overflow-hidden h-[500px] lg:h-auto">
                    <div className="p-5 border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 flex justify-between items-center">
                        <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 text-lg"><Grid3X3 className="text-primary"/> وحدات التخزين</h3>
                        {currentUser?.permissions.storage.create && <button onClick={() => setIsAddDrawerOpen(true)} className="p-2 rounded-xl bg-white dark:bg-gray-700 shadow-sm hover:bg-gray-100 text-primary transition-colors"><PlusCircle size={20}/></button>}
                    </div>
                    <div className="flex-grow overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {drawers.map(drawer => {
                            const count = orders.filter(o => o.storageLocation?.startsWith(drawer.name + '-') && o.status === OrderStatus.STORED).length;
                            const percentage = Math.round((count / drawer.capacity) * 100);
                            return (
                                <div key={drawer.id} onClick={() => setViewingDrawer(drawer)} className="group relative p-4 border border-gray-100 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-700/20 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer">
                                    <div className="flex justify-between items-center mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center font-bold text-lg text-gray-700 dark:text-gray-300">{drawer.name}</div>
                                            <div>
                                                <span className="text-xs text-gray-400 block font-medium">السعة: {drawer.capacity}</span>
                                                <span className="text-sm font-bold text-gray-800 dark:text-white">{count} مخزن</span>
                                            </div>
                                        </div>
                                        <div className="relative w-12 h-12 flex items-center justify-center">
                                            <svg className="w-full h-full transform -rotate-90"><circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-gray-200 dark:text-gray-700" /><circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray={113} strokeDashoffset={113 - (113 * percentage) / 100} className={percentage > 90 ? "text-red-500" : "text-green-500"} /></svg>
                                            <span className="absolute text-[10px] font-bold">{percentage}%</span>
                                        </div>
                                    </div>
                                    {currentUser?.permissions.storage.delete && <button onClick={(e) => { e.stopPropagation(); handleDeleteDrawer(drawer.id); }} className="absolute top-2 left-2 p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>}
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className="lg:col-span-2 bg-gray-50 dark:bg-gray-900/50 rounded-3xl shadow-inner border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden h-[500px] lg:h-auto">
                    <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between items-center sticky top-0 z-10">
                        <h3 className="font-bold text-lg flex items-center gap-2"><PackageSearch className="text-orange-500"/> بانتظار التخزين <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">{awaitingStorage.length}</span></h3>
                        <div className="relative w-64">
                            <input type="text" placeholder="بحث..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-700 border-none rounded-xl focus:ring-2 focus:ring-primary text-sm"/>
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                        </div>
                    </div>
                    <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {awaitingStorage.length > 0 ? awaitingStorage.map(order => (
                            <AwaitingStorageRow key={order.id} order={order} client={clients.find(c => c.id === order.clientId)} store={stores.find(s => s.id === order.storeId)} drawers={drawers} allOrders={orders} onConfirm={handleConfirmStorage} searchTerm={searchTerm} settings={settings} />
                        )) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                <CheckCircle2 size={64} className="mb-4 opacity-10 text-green-500"/>
                                <p className="font-medium">الكل مخزن! لا توجد طلبات معلقة.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StoragePage;
