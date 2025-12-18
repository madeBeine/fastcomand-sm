
import React, { useState, useRef, useEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import type { Order, Client, Store, User, AppSettings, CompanyInfo } from '../types';
import { OrderStatus } from '../types';
import { STATUS_DETAILS } from '../constants';
import { 
    Edit2, Trash2, Eye, Copy, Check, MoreVertical, Ban, ScrollText, 
    User as UserIcon, MessageCircle, Store as StoreIcon, Globe, MapPin, 
    Share2, CheckCircle, Archive, Printer, RefreshCw, ExternalLink, Layers, X, DollarSign, Clock, Hash, AlertCircle, FileText
} from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import InvoiceModal from './InvoiceModal';

// --- Helper: Print Mini Label ---
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

// --- Highlight Component ---
const Highlight: React.FC<{ text: string; highlight?: string }> = ({ text, highlight }) => {
    if (!highlight || !text) return <>{text}</>;
    const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
        <>
            {parts.map((part, i) => 
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <span key={i} className="bg-yellow-300 text-black rounded px-0.5 font-bold shadow-sm">{part}</span>
                ) : (
                    part
                )
            )}
        </>
    );
};

// --- Time Ago Logic ---
const getTimeAgo = (dateStr: string) => {
    if (!dateStr) return { text: '--', color: 'gray' };
    const diff = new Date().getTime() - new Date(dateStr).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days < 3) return { text: `${days === 0 ? 'اليوم' : days + ' يوم'}`, color: 'green' };
    if (days < 7) return { text: `${days} أيام`, color: 'blue' };
    if (days < 30) return { text: `${Math.floor(days/7)} أسبوع`, color: 'orange' };
    return { text: `${Math.floor(days/30)} شهر`, color: 'red' };
};

interface OrderCardProps { 
    order: Order; 
    client: Client | undefined; 
    store: Store | undefined;
    users: User[] | undefined;
    settings?: AppSettings;
    companyInfo: CompanyInfo | undefined;
    onEdit: () => void; 
    onDelete: () => void; 
    onCancel: () => void;
    onChangeStatus: () => void;
    onUpdatePayment?: (order: Order) => void;
    onHistory: () => void;
    onView: () => void;
    onSplit: () => void;
    onPrintInvoice: (order: Order) => void;
    onSendNotification: (order: Order) => void;
    onShareInvoice: (order: Order) => void;
    searchTerm?: string;
}

const OrderCard: React.FC<OrderCardProps> = ({ order, client, store, users = [], settings, companyInfo, onEdit, onDelete, onCancel, onChangeStatus, onUpdatePayment, onHistory, onView, onSplit, onPrintInvoice, onSendNotification, onShareInvoice, searchTerm }) => {
    const { currentUser } = useContext(AuthContext);
    const { t } = useLanguage();
    const { showToast } = useToast();
    const [copied, setCopied] = useState<string | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const [isLinkMenuOpen, setIsLinkMenuOpen] = useState(false);
    const [showInvoiceModal, setShowInvoiceModal] = useState(false);

    const statusInfo = STATUS_DETAILS[order.status] || { name: 'st_new', color: 'text-gray-500', bgColor: 'bg-gray-100 dark:bg-gray-800' };
    const isLate = order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.CANCELLED && new Date(order.expectedArrivalDate) < new Date();
    
    const isStored = order.status === OrderStatus.STORED;
    const isCompleted = order.status === OrderStatus.COMPLETED;
    const isArrivedOffice = order.status === OrderStatus.ARRIVED_AT_OFFICE;
    const isOrdered = order.status === OrderStatus.ORDERED;
    
    const total = Math.round(Number(order.priceInMRU || 0) + Number(order.commission || 0) + Number(order.shippingCost || 0) + Number(order.localDeliveryCost || 0));
    const paid = Math.round(Number(order.amountPaid || 0));
    const remaining = total - paid;

    const history = order.history || [];
    const createdByUsername = history.length > 0 ? history[0].user : null;
    const lastEditedByUsername = history.length > 1 ? history[history.length - 1].user : null;
    const creator = users.find(u => u.username === createdByUsername);
    const editor = users.find(u => u.username === lastEditedByUsername);

    const timeAgo = getTimeAgo(order.orderDate);

    // --- Generate Store Color ---
    const getStoreColor = (id: string) => {
        const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'];
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };
    const storeColor = store?.color || (store ? getStoreColor(store.id) : '#9ca3af');

    // Parse Multiple Tracking Numbers
    const trackingNumbers = order.trackingNumber 
        ? order.trackingNumber.split(/[\s,]+/).filter(t => t.trim().length > 0)
        : [];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsMenuOpen(false);
        };
        if(isMenuOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMenuOpen]);

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    };

    const UserAvatar: React.FC<{ user: User | undefined, label: string, isSmall?: boolean }> = ({ user, label, isSmall }) => {
        if (!user) return null;
        return (
            <div onClick={(e) => { e.stopPropagation(); onHistory(); }} className={`relative group/user cursor-pointer ${isSmall ? 'w-6 h-6 -ml-2' : 'w-8 h-8'}`}>
                <div className={`w-full h-full rounded-full overflow-hidden border-2 border-white dark:border-gray-800 shadow-sm ${!user.avatar ? 'bg-primary flex items-center justify-center text-white text-xs font-bold' : ''}`}>
                    {user.avatar ? <img src={user.avatar} alt={user.username} className="w-full h-full object-cover"/> : user.username.charAt(0).toUpperCase()}
                </div>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover/user:opacity-100 transition-opacity z-20 pointer-events-none">
                    {label}: {user.username}
                </div>
            </div>
        );
    };

    const normalizeUrl = (url: string) => !url ? '' : (/^https?:\/\//i.test(url.trim()) ? url.trim() : 'https://' + url.trim());
    const validLinks = (order.productLinks || []).filter(l => l.trim() !== '');
    const handleProductLinkClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (validLinks.length === 0) showToast('لم يتم إضافة رابط للمنتج', 'warning');
        else if (validLinks.length === 1) window.open(normalizeUrl(validLinks[0]), '_blank');
        else setIsLinkMenuOpen(true);
    }
    const openStoreLink = () => store?.website ? window.open(normalizeUrl(store.website), '_blank') : showToast('لم يتم ربط موقع إلكتروني', 'warning');

    return (
        <>
            <InvoiceModal 
                isOpen={showInvoiceModal}
                onClose={() => setShowInvoiceModal(false)}
                order={order}
                client={client || { id: '', name: 'Unknown', phone: '' }}
                store={store || { id: '', name: 'Unknown', estimatedDeliveryDays: 0 }}
                companyInfo={companyInfo || { name: 'Fast Comand', logo: '', email: '', phone: '', address: '' }}
            />

            <div 
                className={`
                    bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 
                    flex flex-col relative transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group
                    ${isLate ? 'ring-2 ring-red-500/50' : ''}
                    ${order.status === OrderStatus.CANCELLED ? 'opacity-75 grayscale' : ''}
                `}
                style={{ borderInlineStartWidth: '5px', borderInlineStartColor: storeColor }}
            >
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-2xl overflow-hidden" style={{ backgroundColor: storeColor }}></div>

                {/* Header */}
                <div className="p-4 flex justify-between items-start z-10 relative bg-white/50 dark:bg-gray-800/50 rounded-t-2xl border-b dark:border-gray-700/50">
                    <div className="min-w-0 flex-1 pr-2">
                        <div className="flex flex-col mb-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-black text-gray-800 dark:text-white font-mono tracking-tight cursor-pointer hover:text-primary transition-colors truncate" onClick={onView}>
                                    <Highlight text={order.localOrderId} highlight={searchTerm} />
                                </h3>
                                <button onClick={(e) => { e.stopPropagation(); handleCopy(order.localOrderId, 'local'); }} className="text-gray-300 hover:text-primary transition-colors flex-shrink-0">
                                    {copied === 'local' ? <Check size={14} className="text-green-500"/> : <Copy size={14}/>}
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusInfo.bgColor} ${statusInfo.color} border-current border-opacity-20 whitespace-nowrap`}>
                                {t(statusInfo.name as any)}
                            </span>
                            <span className="text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded flex items-center gap-1 border dark:border-gray-600 whitespace-nowrap">
                                <Layers size={10}/> {order.quantity}
                            </span>
                            {order.storageLocation && (
                                <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded border border-green-200 whitespace-nowrap">
                                    <Highlight text={order.storageLocation} highlight={searchTerm} />
                                </span>
                            )}
                            <div className={`flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap bg-${timeAgo.color}-50 text-${timeAgo.color}-600 border-${timeAgo.color}-200 dark:bg-${timeAgo.color}-900/20 dark:text-${timeAgo.color}-300 dark:border-${timeAgo.color}-800`}>
                                <Clock size={10}/> {timeAgo.text}
                            </div>
                        </div>
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-1" ref={menuRef}>
                        <button onClick={(e) => { e.stopPropagation(); onHistory(); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-blue-500 transition-colors" title={t('history')}>
                            <ScrollText size={18}/>
                        </button>
                        {currentUser?.permissions.orders.edit && order.status !== OrderStatus.CANCELLED && (
                            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-green-500 transition-colors" title={t('edit')}>
                                <Edit2 size={18}/>
                            </button>
                        )}
                        {currentUser?.permissions.orders.delete && (
                            <button onClick={(e) => { e.stopPropagation(); order.status === OrderStatus.ORDERED ? onCancel() : onDelete(); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500 transition-colors" title={order.status === OrderStatus.ORDERED ? t('cancel') : t('delete')}>
                                {order.status === OrderStatus.ORDERED ? <Ban size={18}/> : <Trash2 size={18}/>}
                            </button>
                        )}
                        {(currentUser?.permissions.orders.create || currentUser?.permissions.orders.changeStatus || currentUser?.permissions.orders.revertStatus) && (
                            <div className="relative">
                                <button onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors">
                                    <MoreVertical size={18}/>
                                </button>
                                {isMenuOpen && (
                                    <div className="absolute left-0 top-full mt-1 w-44 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl shadow-2xl z-20 overflow-hidden text-sm font-medium animate-in fade-in zoom-in-95 duration-150 origin-top-left">
                                        {currentUser?.permissions.orders.create && order.status === OrderStatus.NEW && order.quantity > 1 && (
                                            <button onClick={(e) => { e.stopPropagation(); onSplit(); setIsMenuOpen(false); }} className="w-full text-right px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                                <div className="rotate-90"><MoreVertical size={16} className="text-orange-500"/></div> {t('splitOrder')}
                                            </button>
                                        )}
                                        {(currentUser?.permissions.orders.changeStatus || currentUser?.permissions.orders.revertStatus) && order.status !== OrderStatus.CANCELLED && (
                                            <button onClick={(e) => { e.stopPropagation(); onChangeStatus(); setIsMenuOpen(false); }} className="w-full text-right px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-600 dark:text-gray-300 border-t dark:border-gray-700">
                                                <RefreshCw size={16} className="text-primary"/> {t('updateStatus')} / تراجع
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Content Body */}
                <div className="px-4 pb-4 space-y-3 z-10 relative pt-3">
                    <div className="flex items-center justify-between text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/30 p-2 rounded-lg border border-gray-100 dark:border-gray-700/50">
                        <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                            <UserIcon size={14} className="text-gray-400 flex-shrink-0"/>
                            <span className="font-bold truncate text-sm">
                                <Highlight text={client?.name || '---'} highlight={searchTerm} />
                            </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            {client?.phone && <span className="text-xs text-gray-500 font-mono hidden xs:inline"><Highlight text={client.phone} highlight={searchTerm} /></span>}
                            {client?.phone && (
                                <a href={`https://wa.me/${client.phone.replace(/\s+/g, '')}`} target="_blank" rel="noopener noreferrer" className="p-1 bg-green-100 text-green-600 rounded-full hover:bg-green-200 transition-colors" onClick={(e) => e.stopPropagation()}>
                                    <MessageCircle size={14}/>
                                </a>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-[11px]">
                        {/* Store Chip */}
                        <div onClick={(e) => { e.stopPropagation(); openStoreLink(); }} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border cursor-pointer transition-colors shadow-sm max-w-full`} style={{ backgroundColor: `${storeColor}15`, borderColor: `${storeColor}40`, color: storeColor }}>
                            {store?.logo ? <img src={store.logo} className="w-3.5 h-3.5 object-contain flex-shrink-0"/> : <StoreIcon size={12} className="flex-shrink-0"/>}
                            <span className="font-bold truncate">{store?.name || '-'}</span>
                        </div>
                        
                        {/* GLOBAL ID CHIP - Moved here beside store and tracking */}
                        {order.globalOrderId && (
                            <div className="flex items-center gap-1 text-primary-light dark:text-secondary-light font-bold bg-primary/5 dark:bg-secondary/5 px-2 py-1 rounded-lg border border-primary/20 dark:border-secondary/20 hover:border-primary/40 transition-colors cursor-pointer group/global" onClick={(e) => { e.stopPropagation(); handleCopy(order.globalOrderId!, 'global'); }}>
                                <Globe size={11} className="flex-shrink-0"/>
                                <span className="font-mono"><Highlight text={order.globalOrderId} highlight={searchTerm} /></span>
                                {copied === 'global' ? <Check size={11} className="text-green-500 ml-1"/> : <Copy size={11} className="opacity-0 group-hover/global:opacity-100 ml-1 transition-opacity"/>}
                            </div>
                        )}
                        
                        {/* TRACKING NUMBERS */}
                        {trackingNumbers.length > 0 ? trackingNumbers.map((track, idx) => (
                            <div key={idx} className="flex items-center gap-1 text-gray-500 dark:text-gray-400 font-mono bg-orange-50 dark:bg-orange-900/10 px-2 py-1 rounded-lg border border-orange-100 dark:border-orange-900/30 max-w-full hover:border-orange-300 transition-colors cursor-pointer group/track" onClick={(e) => { e.stopPropagation(); handleCopy(track, `track-${idx}`); }}>
                                <Hash size={10} className="text-orange-500 flex-shrink-0"/>
                                <span className="truncate font-bold"><Highlight text={track} highlight={searchTerm} /></span>
                                {copied === `track-${idx}` ? <Check size={10} className="text-green-500 ml-1"/> : <Copy size={10} className="opacity-0 group-hover/track:opacity-100 ml-1 transition-opacity"/>}
                            </div>
                        )) : (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-50 text-red-600 border border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50">
                                <AlertCircle size={12} className="flex-shrink-0"/>
                                <span className="font-bold text-[10px]">نقص في التتبع</span>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-3 gap-1 p-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg text-center text-xs mt-2 border border-gray-100 dark:border-gray-700">
                        <div>
                            <span className="block text-[9px] text-gray-400 uppercase font-bold">الإجمالي الكلي</span>
                            <span className="font-bold font-mono text-gray-800 dark:text-gray-200 truncate block">{total.toLocaleString()}</span>
                        </div>
                        <div className="border-x border-gray-200 dark:border-gray-700">
                            <span className="block text-[9px] text-gray-400 uppercase font-bold">المدفوع</span>
                            <span className="font-bold font-mono text-green-600 truncate block">{paid.toLocaleString()}</span>
                        </div>
                        <div>
                            <span className="block text-[9px] text-gray-400 uppercase font-bold">{remaining > 0 ? 'المستحق' : 'المتبقي'}</span>
                            <span className={`font-bold font-mono truncate block ${remaining > 0 ? 'text-red-500' : 'text-green-500'}`}>{remaining.toLocaleString()}</span>
                        </div>
                    </div>

                    {isOrdered && (
                        <button onClick={(e) => { e.stopPropagation(); setShowInvoiceModal(true); }} className={`w-full py-2 border rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-sm ${order.isInvoicePrinted ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:border-primary hover:text-primary'}`}>
                            {order.isInvoicePrinted ? <><CheckCircle size={18}/> تم الإرسال (إعادة)</> : <><Share2 size={18}/> مشاركة الفاتورة</>}
                        </button>
                    )}

                    {isArrivedOffice && currentUser?.permissions.storage.create && (
                        <button onClick={onChangeStatus} className="w-full py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg shadow-md font-bold flex items-center justify-center gap-2 hover:from-blue-700 hover:to-blue-600 transition-all active:scale-95">
                            <Archive size={18}/> تخزين (مطلوب بيانات)
                        </button>
                    )}

                    {isStored && (
                        <div className="space-y-2">
                            <button onClick={(e) => { e.stopPropagation(); printMiniLabel(order, client, store); }} className="w-full py-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-bold flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-all shadow-sm">
                                <Printer size={18}/> طباعة ملصق
                            </button>
                            
                            {!order.whatsappNotificationSent ? (
                                <button onClick={(e) => { e.stopPropagation(); onSendNotification(order); }} className="w-full py-2 bg-green-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-green-600 transition-all shadow-md">
                                    <MessageCircle size={18}/> إرسال رسالة جاهزية
                                </button>
                            ) : (
                                <button onClick={(e) => { e.stopPropagation(); onSendNotification(order); }} className="w-full py-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-300 border border-orange-200 dark:border-orange-800 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors">
                                    <RefreshCw size={18}/> إعادة إرسال الرسالة
                                </button>
                            )}
                        </div>
                    )}

                    {isCompleted && currentUser?.permissions.orders.revertStatus && (
                        <button onClick={onChangeStatus} className="w-full py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm">
                            <RefreshCw size={16}/> {t('updateStatus')} (تراجع)
                        </button>
                    )}
                </div>

                <div className="mt-auto px-4 py-3 bg-gray-50 dark:bg-gray-700/20 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center gap-3 z-10 relative rounded-b-2xl">
                    <div className="flex gap-2 relative">
                        <button onClick={onView} className="p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-500 hover:text-primary hover:border-primary transition-colors shadow-sm"><Eye size={16}/></button>
                        {order.isInvoicePrinted && <span className="text-green-500 self-center" title="فاتورة/إشعار مرسل"><CheckCircle size={16}/></span>}
                        
                        <div>
                            <button onClick={handleProductLinkClick} className="p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-blue-500 hover:text-blue-600 hover:border-blue-300 transition-colors shadow-sm flex items-center gap-1" title="فتح رابط المنتج">
                                <ExternalLink size={16}/>
                                {validLinks.length > 1 && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded-full font-bold">{validLinks.length}</span>}
                            </button>
                            
                            {isLinkMenuOpen && createPortal(
                                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setIsLinkMenuOpen(false); }}>
                                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
                                        <div className="px-4 py-3 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                                            <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2"><ExternalLink size={18}/> روابط المنتج ({validLinks.length})</h3>
                                            <button onClick={() => setIsLinkMenuOpen(false)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-500"><X size={20} /></button>
                                        </div>
                                        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-3 space-y-2">
                                            {validLinks.map((link, idx) => (
                                                <a key={idx} href={normalizeUrl(link)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-100 dark:border-gray-700/50 transition-all group" onClick={() => setIsLinkMenuOpen(false)}>
                                                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 rounded-full text-xs font-bold">{idx + 1}</span>
                                                    <span className="truncate text-sm text-blue-600 dark:text-blue-400 underline decoration-dotted dir-ltr text-left flex-1">{link}</span>
                                                    <ExternalLink size={14} className="flex-shrink-0 text-gray-400 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"/>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                </div>,
                                document.body
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center pl-2">
                            {creator && <UserAvatar user={creator} label="أنشئ بواسطة" />}
                            {editor && editor.id !== creator?.id && <UserAvatar user={editor} label="آخر تعديل" isSmall />}
                        </div>
                        {currentUser?.permissions.orders.changeStatus && !isArrivedOffice && order.status !== OrderStatus.CANCELLED && !isCompleted && (
                            order.status === OrderStatus.STORED ? (
                                <button onClick={() => onUpdatePayment && onUpdatePayment(order)} className="flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors shadow-md active:scale-95">
                                    <DollarSign size={14}/> <span>تحديث الدفع</span>
                                </button>
                            ) : (
                                <button onClick={onChangeStatus} className="flex items-center justify-center gap-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-3 py-2 rounded-lg text-xs font-bold hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors shadow-md active:scale-95">
                                    <span>{t('updateStatus')}</span>
                                </button>
                            )
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

export default OrderCard;
