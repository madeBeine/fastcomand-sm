
import React, { useEffect, useState } from 'react';
import type { Order, Client, Store, ShippingCompany } from '../types';
import { STATUS_DETAILS } from '../constants';
import { X, User, Store as StoreIcon, Calendar, DollarSign, Truck, MapPin, Package, FileText, Image as ImageIcon, Scale, Globe, Building, Copy, Check, Loader2, Link as LinkIcon, Layers } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface OrderDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order | null;
    client?: Client;
    store?: Store;
    shippingCompanies: ShippingCompany[];
}

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

const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ isOpen, onClose, order: initialOrder, client, store, shippingCompanies }) => {
    const [copied, setCopied] = React.useState<string | null>(null);
    const [fullOrder, setFullOrder] = useState<Order | null>(null);
    const [isLoadingImages, setIsLoadingImages] = useState(false);

    useEffect(() => {
        if (isOpen && initialOrder) {
            setFullOrder(initialOrder); 
            
            const fetchImages = async () => {
                if (!supabase) return;
                setIsLoadingImages(true);
                try {
                    const { data, error } = await supabase
                        .from('Orders')
                        .select('product_images, order_images, hub_arrival_images, weighing_images, receipt_images')
                        .eq('id', initialOrder.id)
                        .single();
                    
                    if (data && !error) {
                        setFullOrder(prev => prev ? ({
                            ...prev,
                            productImages: (data as any).product_images || [],
                            orderImages: (data as any).order_images || [],
                            hubArrivalImages: (data as any).hub_arrival_images || [],
                            weighingImages: (data as any).weighing_images || [],
                            receiptImages: (data as any).receipt_images || []
                        }) : null);
                    }
                } catch (e) {
                    console.error("Failed to load images", e);
                } finally {
                    setIsLoadingImages(false);
                }
            };
            fetchImages();
        }
    }, [isOpen, initialOrder]);

    if (!isOpen || !fullOrder) return null;

    const statusInfo = STATUS_DETAILS[fullOrder.status] || { name: fullOrder.status || 'غير معروف', color: 'text-gray-500', bgColor: 'bg-gray-100' };
    const receivingCompany = shippingCompanies.find(c => c.id === fullOrder.receivingCompanyId)?.name || 'غير محدد';

    const formatDate = (dateStr?: string) => dateStr ? new Date(dateStr).toLocaleDateString('en-GB') : '---';
    const fmtMoney = (amount?: number) => amount ? Math.round(amount).toLocaleString('en-US') : '0';

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    };

    const handleViewImage = (src: string) => {
        const win = window.open();
        if (win) {
            win.document.write(`<html><head><title>Preview</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;background:#222;height:100vh;"><img src="${src}" style="max-width:100%;max-height:100%;object-fit:contain;"/></body></html>`);
            win.document.close();
        }
    };

    const productVal = Math.round(Number(fullOrder.priceInMRU || 0) + Number(fullOrder.commission || 0));
    const shippingVal = Math.round(Number(fullOrder.shippingCost || 0));
    const deliveryVal = Math.round(Number(fullOrder.localDeliveryCost || 0));
    const totalGrand = productVal + shippingVal + deliveryVal;
    const totalPaid = Math.round(Number(fullOrder.amountPaid || 0));
    const remaining = totalGrand - totalPaid;

    const CopyButton: React.FC<{ text: string; id: string }> = ({ text, id }) => (
        <button onClick={(e) => { e.stopPropagation(); handleCopy(text, id); }} className="p-1.5 text-gray-400 hover:text-primary transition-colors bg-gray-100 dark:bg-gray-800 rounded-md ml-2" title="نسخ">
            {copied === id ? <Check size={14} className="text-green-500"/> : <Copy size={14}/>}
        </button>
    );

    const SectionTitle: React.FC<{ title: string; icon: React.ReactNode }> = ({ title, icon }) => (
        <h4 className="flex items-center gap-2 font-bold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2 mb-3 mt-4">{icon} {title}</h4>
    );

    const InfoRow: React.FC<{ label: string; value: React.ReactNode; icon?: React.ReactNode; copyValue?: string; copyId?: string; isImportant?: boolean }> = ({ label, value, icon, copyValue, copyId, isImportant }) => (
        <div className="flex justify-between items-center py-1">
            <span className="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-1">{icon} {label}:</span>
            <div className="flex items-center">
                <span className={`font-semibold text-right ${isImportant ? 'text-xl text-primary dark:text-secondary' : 'text-gray-900 dark:text-gray-100'}`}>{value}</span>
                {copyValue && copyId && <CopyButton text={copyValue} id={copyId} />}
            </div>
        </div>
    );

    const ImageCategory: React.FC<{ title: string; images?: string[]; layout?: 'row' | 'grid' }> = ({ title, images, layout = 'row' }) => {
        if (!images || images.length === 0) return null;
        return (
            <div className="mb-4 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border dark:border-gray-700">
                <h5 className="text-xs font-bold text-primary dark:text-secondary-light uppercase mb-2 flex items-center gap-2">
                   <ImageIcon size={14}/> {title} ({images.length})
                </h5>
                <div className={`${layout === 'grid' ? 'grid grid-cols-2 gap-2' : 'flex gap-2 overflow-x-auto pb-2 custom-scrollbar'}`}>
                    {images.map((src, idx) => (
                        <div key={idx} className="relative group flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => handleViewImage(src)}>
                            <img src={src} alt={`${title} ${idx}`} className={`rounded border dark:border-gray-600 object-cover ${layout === 'grid' ? 'w-full h-32' : 'h-24 w-auto'}`} />
                            {layout === 'grid' && (
                                <div className="absolute top-1 right-1 bg-black/50 text-white text-[10px] px-1.5 rounded-full">
                                    #{idx + 1}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-[60] p-4" onClick={onClose}>
            <div className="bg-content-light dark:bg-content-dark rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start p-6 pb-4 border-b dark:border-gray-700 flex-shrink-0">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-2xl font-bold font-mono tracking-tight text-gray-900 dark:text-white">{fullOrder.localOrderId}</h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusInfo.bgColor} ${statusInfo.color}`}>{statusInfo.name}</span>
                        </div>
                        {fullOrder.globalOrderId && <p className="text-sm text-gray-500 font-mono">ID: {fullOrder.globalOrderId}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => printMiniLabel(fullOrder, client, store)} className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-lg hover:bg-blue-200" title="طباعة ملصق"><Layers size={20}/></button>
                        <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"><X size={24} /></button>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto p-6 custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div>
                                <SectionTitle title="العميل والمتجر" icon={<User size={18}/>} />
                                <InfoRow label="العميل" value={client?.name || '---'} />
                                <InfoRow label="المتجر" value={store?.name || '---'} />
                                <InfoRow label="تاريخ الطلب" value={formatDate(fullOrder.orderDate)} />
                            </div>
                            <div>
                                <SectionTitle title="التفاصيل المالية" icon={<DollarSign size={18}/>} />
                                <InfoRow label="قيمة الطلب" value={`${fmtMoney(fullOrder.price)} ${fullOrder.currency}`} />
                                <InfoRow label="العمولة" value={fmtMoney(fullOrder.commission)} />
                                <InfoRow label="الشحن" value={fmtMoney(fullOrder.shippingCost)} />
                                <div className="mt-2 pt-2 border-t dark:border-gray-700 flex justify-between items-center font-bold">
                                    <span>الإجمالي</span>
                                    <span className="text-xl text-primary">{fmtMoney(totalGrand)} MRU</span>
                                </div>
                                <InfoRow label="المدفوع" value={fmtMoney(fullOrder.amountPaid)} />
                                <InfoRow label="المتبقي" value={fmtMoney(remaining)} isImportant />
                            </div>
                            <div>
                                <SectionTitle title="الشحن والمخزن" icon={<Truck size={18}/>} />
                                <InfoRow label="الوزن" value={`${fullOrder.weight || 0} kg`} />
                                <InfoRow label="الموقع" value={fullOrder.storageLocation || '---'} icon={<MapPin size={14}/>} />
                                <InfoRow label="شركة الاستلام" value={receivingCompany} />
                            </div>
                        </div>

                        <div className="space-y-6">
                             {fullOrder.notes && (
                                <div>
                                    <SectionTitle title="ملاحظات" icon={<FileText size={18}/>} />
                                    <p className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border dark:border-gray-700 whitespace-pre-wrap">{fullOrder.notes}</p>
                                </div>
                            )}
                            <div>
                                <SectionTitle title="أرشيف الصور والمرفقات" icon={<ImageIcon size={18}/>} />
                                {isLoadingImages ? (
                                    <div className="flex items-center gap-2 text-primary p-4"><Loader2 className="animate-spin" size={20}/> جاري التحميل...</div>
                                ) : (
                                    <div className="space-y-2">
                                        {/* Display receipts in grid to clearly show separate items */}
                                        <ImageCategory title="كافة إيصالات الدفع (الأرشيف)" images={fullOrder.receiptImages} layout="grid" />
                                        
                                        <ImageCategory title="صور المنتجات" images={fullOrder.productImages} />
                                        <ImageCategory title="صور الشحنة الأصلية" images={fullOrder.orderImages} />
                                        <ImageCategory title="صور الوصول للمكتب" images={fullOrder.hubArrivalImages} />
                                        <ImageCategory title="صور الميزان والوزن" images={fullOrder.weighingImages} />
                                        
                                        {!fullOrder.productImages?.length && !fullOrder.orderImages?.length && !fullOrder.hubArrivalImages?.length && !fullOrder.weighingImages?.length && !fullOrder.receiptImages?.length && (
                                            <p className="text-center text-gray-400 text-sm py-8">لا توجد صور محفوظة لهذا الطلب</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderDetailsModal;
