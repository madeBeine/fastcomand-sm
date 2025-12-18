import React, { useState, useEffect, useContext } from 'react';
import type { Order, Client, StorageDrawer, AppSettings, ShippingCompany } from '../types';
import { OrderStatus, ShippingType } from '../types';
import { STATUS_DETAILS } from '../constants';
import { X, Save, RotateCcw, ShieldCheck, Loader2, Grid3X3, CheckCircle2, Camera, Image as GalleryIcon, Lightbulb, Bike, AlertTriangle, Upload, Calculator, DollarSign, Archive } from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../supabaseClient';
import StorageSelectorModal from './StorageSelectorModal';

const getStorageSuggestion = (orderToStore: Order, allOrders: Order[], drawers: StorageDrawer[]): { location: string | null; score: number; reasons: string[] } => {
    const occupiedSlots = new Set(allOrders.filter(o => o.status === OrderStatus.STORED).map(o => o.storageLocation).filter(Boolean));
    
    const scoredDrawers = drawers.map(drawer => {
        const ordersInDrawer = allOrders.filter(o => o.storageLocation?.startsWith(drawer.name + '-') && o.status === OrderStatus.STORED);
        if (ordersInDrawer.length >= drawer.capacity) return null;

        let score = 0;
        let reasons: string[] = [];

        if (orderToStore.shipmentId && ordersInDrawer.some(o => o.shipmentId === orderToStore.shipmentId)) {
            score += 40;
            reasons.push("تحتوي على طرود من نفس الشحنة");
        }
        if (ordersInDrawer.some(o => o.clientId === orderToStore.clientId)) {
            score += 25;
            reasons.push("تحتوي على طرود أخرى لنفس العميل");
        }
        const fillPercentage = ordersInDrawer.length / drawer.capacity;
        if (fillPercentage > 0.1 && fillPercentage < 0.9) {
            score += 20;
            reasons.push("جيد لتجميع الطرود معًا");
        }
        return { drawer, score, reasons };
    }).filter((d): d is { drawer: StorageDrawer; score: number; reasons: string[] } => d !== null);

    scoredDrawers.sort((a, b) => b.score - a.score);

    const bestDrawerInfo = scoredDrawers[0];
    const targetDrawerInfo = bestDrawerInfo || (drawers.length > 0 ? { drawer: drawers[0], score: 0, reasons: ['أول درج متاح'] } : null);

    if (!targetDrawerInfo) return { location: null, score: 0, reasons: [] };

    let firstAvailableSlot: string | null = null;
    for (let i = 1; i <= targetDrawerInfo.drawer.capacity; i++) {
        const slotLocation = `${targetDrawerInfo.drawer.name}-${String(i).padStart(2, '0')}`;
        if (!occupiedSlots.has(slotLocation)) {
            firstAvailableSlot = slotLocation;
            break;
        }
    }

    return { location: firstAvailableSlot, score: targetDrawerInfo.score, reasons: targetDrawerInfo.reasons };
};

const OrderStatusModal: React.FC<{
    order: Order | null;
    allOrders: Order[];
    drawers: StorageDrawer[];
    clients: Client[];
    isOpen: boolean;
    onClose: () => void;
    onUpdate: (orderId: string, payload: Partial<Order>) => Promise<void>;
    onRevert: (orderId: string, password?: string) => Promise<boolean>;
    shippingCompanies: ShippingCompany[];
    settings?: AppSettings;
}> = ({ order, allOrders, drawers, clients, isOpen, onClose, onUpdate, onRevert, shippingCompanies, settings }) => {
    const { currentUser } = useContext(AuthContext);
    const { t } = useLanguage();
    const [formData, setFormData] = useState<Partial<Order>>({});
    const [files, setFiles] = useState<{ [key: string]: string }>({});
    const [suggestion, setSuggestion] = useState<{ location: string | null; score: number; reasons: string[] } | null>(null);
    const [isReverting, setIsReverting] = useState(false);
    const [password, setPassword] = useState('');
    const [revertError, setRevertError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isStorageSelectorOpen, setStorageSelectorOpen] = useState(false);
    
    // Dynamic State for displaying applied rate
    const [appliedRateInfo, setAppliedRateInfo] = useState<{ rate: number, zoneName: string }>({ rate: 0, zoneName: '' });

    const calculateShippingCost = (weight: number, type: ShippingType, originCenter: string | undefined) => {
        const origin = (originCenter || 'Dubai').trim().toLowerCase();
        
        // Robust lookup: Check both normalized lowercase and exact match
        const zone = settings?.shippingZones?.find(z => z.name.trim().toLowerCase() === origin);
        
        // Default to global rates
        let fastRate = settings?.shippingRates.fast || 450;
        let normalRate = settings?.shippingRates.normal || 280;
        let zoneName = 'السعر العالمي';

        // If a specific zone exists, override rates
        if (zone) {
            fastRate = zone.rates.fast;
            normalRate = zone.rates.normal;
            zoneName = zone.name;
        }

        const shippingRate = type === ShippingType.FAST ? fastRate : normalRate;
        setAppliedRateInfo({ rate: shippingRate, zoneName });
        
        return Math.round(weight * shippingRate);
    };

    useEffect(() => {
        if (order) {
            setFormData({
                globalOrderId: order.globalOrderId || '',
                originCenter: order.originCenter || 'Dubai',
                receivingCompanyId: order.receivingCompanyId || '',
                trackingNumber: order.trackingNumber || '',
                weight: order.weight || 0,
                shippingCost: order.shippingCost,
                storageLocation: order.storageLocation || '',
                shippingType: order.shippingType,
                arrivalDateAtOffice: order.arrivalDateAtOffice || new Date().toISOString().split('T')[0],
            });
            
            if(order.status === OrderStatus.ARRIVED_AT_OFFICE){
                setSuggestion(getStorageSuggestion(order, allOrders, drawers));
                // Trigger initial calculation check
                calculateShippingCost(order.weight || 0, order.shippingType, order.originCenter);
            }

            setFiles({});
            setIsReverting(false);
            setPassword('');
            setRevertError('');
            setIsSaving(false);
        }
    }, [order, allOrders, drawers, isOpen]);

    if (!isOpen || !order) return null;
    
    // Helper to compress image - Robust Version with Fallback
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
                    const MAX_WIDTH = 1000; // Limit width to 1000px for better performance on mobile
                    let width = img.width;
                    let height = img.height;
                    
                    // Maintain aspect ratio
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error("Canvas context failed");

                    // FIX: Draw white background first to handle transparency/black issue
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Use slightly lower quality JPEG for speed/size (0.7)
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                } catch (err) {
                    console.warn("Image compression failed or decode error, falling back to original", err);
                    // Fallback to original image if compression fails (critical fix for some mobile browsers)
                    resolve(originalBase64);
                }
            };
            reader.onerror = error => reject(error);
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const base64 = await compressImage(e.target.files[0]);
                setFiles(prev => ({ ...prev, [field]: base64 }));
            } catch (error) {
                console.error("Image processing failed completely", error);
                alert("فشل معالجة الصورة، يرجى المحاولة مرة أخرى.");
            }
        }
    };
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        let newFormData = { ...formData, [name]: value };

        if ((name === 'weight' || name === 'shippingType') && order.status === OrderStatus.ARRIVED_AT_OFFICE) {
            const weight = name === 'weight' ? parseFloat(value) : (formData.weight || 0);
            const type = name === 'shippingType' ? value as ShippingType : (formData.shippingType || order.shippingType);
            
            newFormData.shippingCost = calculateShippingCost(weight, type, order.originCenter);
        }

        setFormData(newFormData);
    };

    const handleLocationSelect = (location: string) => {
        setFormData(prev => ({ ...prev, storageLocation: location }));
        setStorageSelectorOpen(false);
    }

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const payload: Partial<Order> = { ...formData };
            if (files.orderImages) payload.orderImages = [files.orderImages];
            if (files.hubArrivalImages) payload.hubArrivalImages = [files.hubArrivalImages];
            if (files.weighingImages) payload.weighingImages = [files.weighingImages];
            
            if(order.status === OrderStatus.ARRIVED_AT_OFFICE){
                payload.storageDate = new Date().toISOString();
                // No cost or receipt updates in this step
                payload.localDeliveryCost = 0; 
            }

            await onUpdate(order.id, payload);
        } catch (e) {
            console.error(e);
            setIsSaving(false);
        }
    };

    const handleRevert = async () => {
        setRevertError('');
        setIsSaving(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: currentUser?.email || '',
                password: password
            });

            if (error) {
                 setRevertError(t('error'));
                 setIsSaving(false);
                 return;
            }

            const success = await onRevert(order.id, password);
            if(!success) setRevertError(t('error'));
        } catch(e) {
            setRevertError(t('error'));
        } finally {
            setIsSaving(false);
        }
    }

    const isFormValid = () => {
        switch (order.status) {
            case OrderStatus.NEW:
                return !!formData.globalOrderId && !!formData.originCenter && !!formData.receivingCompanyId;
            case OrderStatus.ORDERED:
                return !!formData.trackingNumber;
            case OrderStatus.SHIPPED_FROM_STORE:
                 return !!formData.arrivalDateAtOffice; 
            case OrderStatus.ARRIVED_AT_OFFICE:
                return (formData.weight !== undefined && formData.weight > 0) && !!formData.storageLocation && !!files.weighingImages;
            case OrderStatus.STORED:
                return !!formData.storageLocation;
            default:
                return false;
        }
    };
    
    const originOptions = settings?.shippingZones?.map(z => z.name) || [];

    const renderContent = () => {
        const inputClass = "w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary-light";
        const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";
        const fileInputLabelClass = "cursor-pointer mt-1 flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-400 rounded-lg hover:border-primary dark:hover:border-secondary hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";
        
        let nextStatusName = '';
        if (order.status === OrderStatus.NEW) nextStatusName = t(STATUS_DETAILS[OrderStatus.ORDERED].name as any);
        else if (order.status === OrderStatus.ORDERED) nextStatusName = t(STATUS_DETAILS[OrderStatus.SHIPPED_FROM_STORE].name as any);
        else if (order.status === OrderStatus.SHIPPED_FROM_STORE) nextStatusName = t(STATUS_DETAILS[OrderStatus.ARRIVED_AT_OFFICE].name as any);
        else if (order.status === OrderStatus.ARRIVED_AT_OFFICE) nextStatusName = t(STATUS_DETAILS[OrderStatus.STORED].name as any);
        else nextStatusName = t('updateStatus');

        switch (order.status) {
            case OrderStatus.NEW:
                return {
                    title: `${t('updateStatus')}: ${nextStatusName}`,
                    body: (
                        <div className="space-y-4">
                            <div>
                                <label className={labelClass}>{t('globalOrderId')}*</label>
                                <input type="text" name="globalOrderId" value={formData.globalOrderId || ''} onChange={handleInputChange} className={inputClass} required />
                            </div>
                            <div>
                                <label className={labelClass}>{t('origin')}*</label>
                                <select 
                                    name="originCenter" 
                                    value={formData.originCenter || ''} 
                                    onChange={handleInputChange} 
                                    className={inputClass}
                                >
                                    {originOptions.length > 0 ? (
                                        originOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)
                                    ) : (
                                        <option value="" disabled>يرجى إضافة مناطق شحن في الإعدادات</option>
                                    )}
                                </select>
                            </div>
                             <div>
                                <label className={labelClass}>{t('company')}*</label>
                                <select name="receivingCompanyId" value={formData.receivingCompanyId || ''} onChange={handleInputChange} className={inputClass}>
                                    <option value="">Select Company</option>
                                    {shippingCompanies.map(company => (
                                        <option key={company.id} value={company.id}>{company.name}</option>
                                    ))}
                                </select>
                            </div>
                             <div>
                                <label className={labelClass}>{t('productImages')} ({t('optional')})</label>
                                <label htmlFor="file-order" className={fileInputLabelClass}><Upload size={24} className="text-gray-400"/> {files.orderImages ? t('success') : t('optional')}</label>
                                <input id="file-order" type="file" className="hidden" onChange={(e) => handleFileChange(e, 'orderImages')} accept="image/*" />
                            </div>
                        </div>
                    ),
                    manual: true
                };
            case OrderStatus.ORDERED:
                return {
                    title: `${t('updateStatus')}: ${nextStatusName}`,
                    body: (
                        <div>
                            <label className={labelClass}>{t('tracking')}*</label>
                            <input type="text" name="trackingNumber" value={formData.trackingNumber || ''} onChange={handleInputChange} className={inputClass} required />
                        </div>
                    ),
                    manual: true
                };
            case OrderStatus.SHIPPED_FROM_STORE:
                return {
                    title: `${t('updateStatus')}: ${nextStatusName}`,
                    body: (
                        <div className="space-y-4">
                            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 flex items-start gap-2">
                                <CheckCircle2 size={20} className="mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-bold text-sm">تأكيد الوصول للمكتب</p>
                                    <p className="text-xs">سيتم تخطي مرحلة الوسيط والطريق لتسريع العملية.</p>
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>{t('arrivalDate')}</label>
                                <input type="date" name="arrivalDateAtOffice" value={formData.arrivalDateAtOffice} onChange={handleInputChange} className={inputClass} />
                            </div>
                        </div>
                    ),
                    manual: true
                };
            case OrderStatus.ARRIVED_AT_OFFICE:
                return {
                     title: `عملية التخزين (مطلوب: صورة، وزن، موقع)`,
                     body: (
                         <div className="space-y-4">
                            {/* 1. التحرير للبدء بالصور */}
                            <div>
                                <label className={labelClass}>صورة الميزان (مطلوب)*</label>
                                {files.weighingImages ? (
                                    <div className="border-2 border-dashed border-green-500 bg-green-50 dark:bg-green-900/20 rounded-lg p-4 flex flex-col items-center">
                                        <CheckCircle2 size={32} className="text-green-500 mb-2"/>
                                        <span className="font-bold text-green-600 mb-2">تم اختيار الصورة</span>
                                        <img src={files.weighingImages} alt="preview" className="h-24 object-contain rounded border bg-white"/>
                                        <button 
                                            onClick={() => setFiles(prev => ({...prev, weighingImages: ''}))}
                                            className="mt-2 text-xs text-red-500 hover:underline"
                                        >
                                            إزالة الصورة
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3 mt-1">
                                        <label className="cursor-pointer flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/10 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all">
                                            <Camera size={28} className="text-blue-500"/>
                                            <span className="text-xs font-bold text-blue-700 dark:text-blue-300">التقاط صورة</span>
                                            <input 
                                                type="file" 
                                                className="hidden" 
                                                onChange={(e) => handleFileChange(e, 'weighingImages')} 
                                                accept="image/*" 
                                                capture="environment"
                                            />
                                        </label>

                                        <label className="cursor-pointer flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
                                            <GalleryIcon size={28} className="text-gray-500"/>
                                            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">من المعرض</span>
                                            <input 
                                                type="file" 
                                                className="hidden" 
                                                onChange={(e) => handleFileChange(e, 'weighingImages')} 
                                                accept="image/*" 
                                            />
                                        </label>
                                    </div>
                                )}
                            </div>

                            {/* 2. الوزن ونوع الشحن */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>{t('weight')}: (kg)*</label>
                                    <input type="number" name="weight" value={formData.weight || ''} onChange={handleInputChange} className={inputClass} step="0.1" />
                                </div>
                                <div>
                                    <label className={labelClass}>{t('shippingType')}</label>
                                    <select name="shippingType" value={formData.shippingType} onChange={handleInputChange} className={inputClass}>
                                        <option value={ShippingType.NORMAL}>{t('normal')}</option>
                                        <option value={ShippingType.FAST}>{t('fast')}</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 text-sm">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-gray-500 font-bold flex items-center gap-1"><Calculator size={14}/> تكلفة الشحن:</span>
                                    <span className="font-bold font-mono text-primary text-lg">{Math.round(formData.shippingCost || 0).toLocaleString()} MRU</span>
                                </div>
                                <div className="flex justify-between items-center text-xs text-gray-400">
                                    <span>المصدر: {order.originCenter || 'غير محدد'} ({appliedRateInfo.zoneName})</span>
                                    <span>السعر المطبق: {appliedRateInfo.rate} MRU/KG</span>
                                </div>
                            </div>

                            {/* 3. اختيار الموقع */}
                            {suggestion && suggestion.location && !formData.storageLocation && (
                                <div className="p-3 bg-teal-50 dark:bg-teal-900/50 border-l-4 border-teal-500 rounded-r-lg cursor-pointer hover:bg-teal-100 dark:hover:bg-teal-900/70 transition-colors" onClick={() => setStorageSelectorOpen(true)}>
                                    <h4 className="font-bold text-teal-800 dark:text-teal-200 flex items-center gap-2"><Lightbulb size={18}/> اقتراح ذكي</h4>
                                    <p className="mt-1">الموقع: <strong className="text-lg">{suggestion.location}</strong></p>
                                </div>
                            )}

                             <div>
                                <label className={labelClass}>{t('location')}*</label>
                                <div 
                                    onClick={() => setStorageSelectorOpen(true)}
                                    className={`w-full mt-1 p-3 border-2 rounded-lg flex justify-between items-center cursor-pointer transition-all hover:border-primary dark:hover:border-secondary bg-white dark:bg-gray-800 ${formData.storageLocation ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-gray-600 border-dashed'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Grid3X3 size={24} className={formData.storageLocation ? "text-green-600" : "text-primary"}/>
                                        {formData.storageLocation ? (
                                            <span className="font-bold text-xl text-green-700 dark:text-green-400">{formData.storageLocation}</span>
                                        ) : (
                                            <span className="text-gray-500 font-medium">اختر موقع التخزين</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                         </div>
                     ),
                     manual: true
                }
            case OrderStatus.STORED:
                return {
                    title: "إدارة حالة المخزون",
                    body: (
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-800 dark:text-blue-200 flex items-center gap-3">
                            <Archive size={24} />
                            <div>
                                <p className="font-semibold">الطلب موجود حالياً في المخزن.</p>
                                <p className="text-xs mt-1">الموقع: {order.storageLocation}</p>
                            </div>
                        </div>
                    ),
                    manual: false
                };
            case OrderStatus.COMPLETED:
                return {
                    title: "حالة الطلب: مكتمل",
                    body: (
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-800 dark:text-green-200 flex items-center gap-3">
                            <CheckCircle2 size={24} />
                            <div>
                                <p className="font-semibold">هذا الطلب مكتمل وتم تسليمه للعميل.</p>
                                <p className="text-xs mt-1">تاريخ التسليم: {order.withdrawalDate ? new Date(order.withdrawalDate).toLocaleDateString() : '---'}</p>
                            </div>
                        </div>
                    ),
                    manual: false
                };
            default:
                return { title: t('updateStatus'), body: null, manual: false };
        }
    };
    
    const { title, body, manual } = renderContent();

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-2 md:p-4" onClick={onClose}>
                <div className="bg-content-light dark:bg-content-dark rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center p-4 md:p-6 border-b dark:border-gray-700 flex-shrink-0">
                        <h3 className="text-xl font-bold">{title}</h3>
                        <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                            <X size={20} />
                        </button>
                    </div>
                    
                    <div className="flex-grow overflow-y-auto p-4 md:p-6 custom-scrollbar">
                        {body}
                        
                        {isReverting && (
                            <div className="mt-4 p-4 border-t dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/50 rounded-b-lg">
                                <h4 className="font-bold text-yellow-800 dark:text-yellow-200">{t('confirm')}</h4>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={t('password')}
                                    className="w-full mt-2 p-2 border border-yellow-300 dark:border-yellow-600 rounded-lg bg-background-light dark:bg-background-dark focus:outline-none focus:ring-2 focus:ring-yellow-500"
                                />
                                {revertError && <p className="text-red-500 text-xs mt-1">{revertError}</p>}
                                <button onClick={handleRevert} disabled={isSaving} className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50">
                                    {isSaving ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />} {t('confirm')}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="p-4 md:p-6 border-t dark:border-gray-700 flex justify-end gap-2 flex-shrink-0 bg-white dark:bg-gray-800 rounded-b-xl">
                        {currentUser?.permissions.orders.revertStatus && order.status !== OrderStatus.NEW && !isReverting && (
                            <button
                                onClick={() => setIsReverting(true)}
                                className="flex items-center gap-2 px-4 py-2 text-sm bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200 rounded-lg hover:bg-yellow-200 dark:hover:bg-yellow-800 transition-colors"
                            >
                                <RotateCcw size={16} /> تراجع عن الحالة
                            </button>
                        )}
                        {manual && (
                            <button
                                onClick={handleSave}
                                disabled={!isFormValid() || isSaving}
                                className="flex items-center gap-2 px-6 py-2 bg-primary dark:bg-secondary text-white rounded-lg shadow hover:bg-primary-dark disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-bold"
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                {t('save')}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <StorageSelectorModal 
                isOpen={isStorageSelectorOpen}
                onClose={() => setStorageSelectorOpen(false)}
                onSelect={handleLocationSelect}
                drawers={drawers}
                allOrders={allOrders}
                suggestedLocation={suggestion?.location || null}
                clients={clients}
            />
        </>
    );
};

export default OrderStatusModal;
