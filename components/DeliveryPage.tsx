
import React, { useState, useMemo, useContext, useEffect, useRef } from 'react';
import type { Order, Client, ActivityLog, Store, CompanyInfo, AppSettings } from '../types';
import { OrderStatus, ShippingType } from '../types';
import { Search, Upload, Check, User, Wallet, Loader2, Store as StoreIcon, ArrowRight, PackageCheck, CheckCircle2, ChevronLeft, Printer, AlertCircle, X, Plus, Bike, DollarSign, Image as ImageIcon, CreditCard, Banknote, Building2, Filter, Layers, MapPin, Scale, Calculator } from 'lucide-react';
import { supabase, getErrorMessage } from '../supabaseClient';
import { AuthContext } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { STATUS_DETAILS } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import PaymentModal from './PaymentModal';

interface DeliveryPageProps {
  orders: Order[];
  clients: Client[];
  stores: Store[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  companyInfo: CompanyInfo;
  settings: AppSettings;
}

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
                const MAX_WIDTH = 1000;
                let width = img.width;
                let height = img.height;
                
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
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            } catch (error) {
                console.warn("Image compression failed, falling back to original", error);
                resolve(originalBase64); // Fallback
            }
        };
        reader.onerror = (err) => reject(err);
    });
};

const DeliveryPage: React.FC<DeliveryPageProps> = ({ orders, clients, stores, setOrders, companyInfo, settings }) => {
  const { currentUser } = useContext(AuthContext);
  const { t } = useLanguage();
  const { showToast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [receiptImages, setReceiptImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  
  const [enableLocalDelivery, setEnableLocalDelivery] = useState(false);
  const [localDeliveryCost, setLocalDeliveryCost] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');

  // --- Logic: Search & Filter Clients ---
  
  // Effect: Search Logic & Auto-Selection
  useEffect(() => {
      const lowerTerm = searchTerm.trim().toLowerCase();
      if (lowerTerm.length > 2) {
          const exactOrder = orders.find(o => o.localOrderId.toLowerCase() === lowerTerm || o.trackingNumber?.toLowerCase() === lowerTerm);
          
          if (exactOrder) {
              const client = clients.find(c => c.id === exactOrder.clientId);
              
              // Case 1: Switch Client (The selection will be handled by the next useEffect)
              if (client && client.id !== selectedClient?.id) {
                  setSelectedClient(client);
              } 
              // Case 2: Client already selected, just select the order if ready
              else if (client && client.id === selectedClient?.id) {
                   const isReady = exactOrder.status === OrderStatus.STORED || exactOrder.status === OrderStatus.ARRIVED_AT_OFFICE;
                   if (isReady) {
                       setSelectedOrderIds(new Set([exactOrder.id]));
                   }
              }
          }
      }
  }, [searchTerm, orders, clients, selectedClient]);

  // Active Clients List
  const activeClients = useMemo(() => {
      const relevantOrders = orders.filter(o => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.NEW && o.status !== OrderStatus.COMPLETED);
      const lowerTerm = searchTerm.toLowerCase();
      const clientIds = Array.from(new Set(relevantOrders.map(o => o.clientId)));
      
      const list = clientIds.map(id => {
          const client = clients.find(c => c.id === id);
          if (!client) return null;
          const clientOrders = relevantOrders.filter(o => o.clientId === id);
          const readyCount = clientOrders.filter(o => o.status === OrderStatus.STORED || o.status === OrderStatus.ARRIVED_AT_OFFICE).length;
          
          // Filter Logic
          const matchesName = client.name.toLowerCase().includes(lowerTerm);
          const matchesPhone = client.phone.includes(lowerTerm);
          const matchesOrder = clientOrders.some(o => o.localOrderId.toLowerCase().includes(lowerTerm));

          if (searchTerm && !matchesName && !matchesPhone && !matchesOrder) {
              return null;
          }
          return { ...client, readyCount, totalCount: clientOrders.length };
      }).filter(Boolean) as (Client & { readyCount: number, totalCount: number })[];

      // Sort: Ready counts first, then name
      return list.sort((a, b) => b.readyCount - a.readyCount || a.name.localeCompare(b.name));
  }, [orders, clients, searchTerm]);

  // Orders for selected client
  const clientOrders = useMemo(() => {
      if (!selectedClient) return [];
      return orders.filter(o => o.clientId === selectedClient.id && o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.NEW && o.status !== OrderStatus.COMPLETED)
          .sort((a, b) => {
              const aReady = a.status === OrderStatus.STORED || a.status === OrderStatus.ARRIVED_AT_OFFICE;
              const bReady = b.status === OrderStatus.STORED || b.status === OrderStatus.ARRIVED_AT_OFFICE;
              if (aReady && !bReady) return -1;
              if (!aReady && bReady) return 1;
              return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime();
          });
  }, [selectedClient, orders]);

  // Reset/Init when client changes
  useEffect(() => {
      const lowerTerm = searchTerm.trim().toLowerCase();
      const searchMatchOrder = lowerTerm.length > 2 
          ? orders.find(o => o.clientId === selectedClient?.id && (o.localOrderId.toLowerCase() === lowerTerm || o.trackingNumber?.toLowerCase() === lowerTerm))
          : null;

      if (searchMatchOrder && (searchMatchOrder.status === OrderStatus.STORED || searchMatchOrder.status === OrderStatus.ARRIVED_AT_OFFICE)) {
          setSelectedOrderIds(new Set([searchMatchOrder.id]));
      } else {
          setSelectedOrderIds(new Set()); 
      }

      setReceiptImages([]);
      setEnableLocalDelivery(false);
      setLocalDeliveryCost(0);
      setPaymentMethod('Cash');
  }, [selectedClient]);

  // Toggle Selection
  const handleToggleOrder = (orderId: string, isReady: boolean) => {
      if (!isReady) return; 
      setSelectedOrderIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(orderId)) newSet.delete(orderId); else newSet.add(orderId);
          return newSet;
      });
  };

  const handleSelectAllReady = () => {
      const readyIds = clientOrders.filter(o => (o.status === OrderStatus.STORED || o.status === OrderStatus.ARRIVED_AT_OFFICE) && (o.weight || 0) > 0).map(o => o.id);
      if (selectedOrderIds.size === readyIds.length) {
          setSelectedOrderIds(new Set());
      } else {
          setSelectedOrderIds(new Set(readyIds));
      }
  };

  // --- Financial Calculations (FIXED) ---
  const totals = useMemo(() => {
      const selected = clientOrders.filter(o => selectedOrderIds.has(o.id));
      const deliveryFee = enableLocalDelivery ? Math.round(localDeliveryCost) : 0;

      // Aggregate all liabilities and payments
      const aggregate = selected.reduce((acc, order) => {
          const productTotal = Math.round(Number(order.priceInMRU || 0) + Number(order.commission || 0));
          const shipping = Math.round(Number(order.shippingCost || 0));
          // Pre-existing delivery cost (if any) stored in order, though we override usually
          const existingDelivery = Math.round(Number(order.localDeliveryCost || 0));
          
          const paid = Math.round(Number(order.amountPaid || 0));
          
          acc.totalProductVal += productTotal;
          acc.totalShipping += shipping;
          acc.totalExistingDelivery += existingDelivery;
          acc.totalPaid += paid;
          
          acc.totalWeight += (order.weight || 0);
          acc.itemsCount += 1;
          
          return acc;
      }, { totalProductVal: 0, totalShipping: 0, totalExistingDelivery: 0, totalPaid: 0, totalWeight: 0, itemsCount: 0 });

      // Total Value of Selected Orders (Without the NEW delivery fee yet)
      const ordersValue = aggregate.totalProductVal + aggregate.totalShipping + aggregate.totalExistingDelivery;
      
      // Total Liability = Orders Value + New Delivery Fee
      const totalLiability = ordersValue + deliveryFee;
      
      // Net Remaining to Pay
      const grandTotalRemaining = Math.max(0, totalLiability - aggregate.totalPaid);

      return { 
          productTotal: aggregate.totalProductVal,
          shippingTotal: aggregate.totalShipping,
          totalPaid: aggregate.totalPaid,
          ordersValue,
          deliveryFee, 
          grandTotalRemaining,
          itemsCount: aggregate.itemsCount,
          totalWeight: aggregate.totalWeight
      };
  }, [clientOrders, selectedOrderIds, enableLocalDelivery, localDeliveryCost]);

  // Handlers
  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        setIsProcessingImages(true);
        try {
            const files = Array.from(e.target.files);
            const compressed = await Promise.all(files.map((f: File) => compressImage(f)));
            setReceiptImages(prev => [...prev, ...compressed].slice(0, 3));
        } finally { setIsProcessingImages(false); }
    }
  };

  const handleConfirmDelivery = async () => {
      if (selectedOrderIds.size === 0) return showToast('يرجى تحديد طلب واحد على الأقل.', 'warning');
      
      // If there is money to pay, receipt is preferred
      if (totals.grandTotalRemaining > 0 && receiptImages.length === 0) {
           if(!window.confirm("لا توجد صورة إيصال. هل أنت متأكد من المتابعة؟")) return;
      }

      setIsSubmitting(true);
      const now = new Date().toISOString();
      const user = currentUser?.username || 'System';
      const selectedIdsArray = Array.from(selectedOrderIds);

      try {
          if (!supabase) throw new Error("Database not connected");

          // 1. Fetch latest data first to avoid overwriting existing receipts
          const { data: currentOrdersData, error: fetchError } = await supabase
              .from('Orders')
              .select('id, receipt_images, receipt_image, history, amount_paid, local_delivery_cost')
              .in('id', selectedIdsArray);

          if (fetchError) throw fetchError;

          const updates = selectedIdsArray.map((id, index) => {
              const order = orders.find(o => o.id === id);
              const dbOrder = currentOrdersData?.find(o => o.id === id);
              if(!order || !dbOrder) return null;
              
              const orderDeliveryFee = (index === 0 && enableLocalDelivery) ? Math.round(localDeliveryCost) : 0;
              
              // Calculate specific order remaining
              const orderTotal = Math.round(Number(order.priceInMRU || 0) + Number(order.commission || 0) + Number(order.shippingCost || 0) + Number(order.localDeliveryCost || 0));
              
              const finalAmountPaid = orderTotal + orderDeliveryFee; 

              const logMessage = `تم التسليم. الدفع: ${paymentMethod}.${orderDeliveryFee > 0 ? ` (+توصيل ${orderDeliveryFee})` : ''}`;
              const newLog: ActivityLog = { timestamp: now, activity: logMessage, user };

              // IMPORTANT: Merge new receipts with EXISTING ones from DB
              const currentReceipts = dbOrder.receipt_images || (dbOrder.receipt_image ? [dbOrder.receipt_image] : []);
              const updatedReceiptImages = [...currentReceipts, ...receiptImages];

              return {
                  id,
                  dbPayload: {
                      status: OrderStatus.COMPLETED,
                      receipt_images: updatedReceiptImages,
                      receipt_image: updatedReceiptImages.length > 0 ? updatedReceiptImages[updatedReceiptImages.length - 1] : dbOrder.receipt_image,
                      withdrawal_date: now,
                      local_delivery_cost: (dbOrder.local_delivery_cost || 0) + orderDeliveryFee,
                      amount_paid: finalAmountPaid,
                      payment_method: paymentMethod, 
                      history: [...(dbOrder.history || []), newLog]
                  },
                  localPayload: { 
                      status: OrderStatus.COMPLETED, 
                      receiptImages: updatedReceiptImages,
                      receiptImage: updatedReceiptImages.length > 0 ? updatedReceiptImages[updatedReceiptImages.length - 1] : order.receiptImage,
                      withdrawalDate: now, 
                      localDeliveryCost: (order.localDeliveryCost || 0) + orderDeliveryFee, 
                      amountPaid: finalAmountPaid,
                      paymentMethod: paymentMethod,
                      history: [...(order.history || []), newLog] 
                  }
              };
          }).filter(Boolean);

          for (const u of updates) if(u) await supabase.from('Orders').update(u.dbPayload).eq('id', u.id);

          setOrders(prev => prev.map(o => {
              const update = updates.find(u => u!.id === o.id);
              return update ? { ...o, ...update.localPayload } : o;
          }));

          showToast('تم تأكيد التسليم وإغلاق الطلبات!', 'success');
          setSelectedClient(null); 
      } catch (e: any) {
          showToast('حدث خطأ: ' + getErrorMessage(e), 'error');
      } finally {
          setIsSubmitting(false);
      }
  };

  const getPaymentMethods = () => settings.paymentMethods || [];

  return (
    <div className="flex flex-col xl:flex-row gap-6 w-full xl:h-[calc(100vh-140px)] h-auto xl:overflow-hidden relative">
        
        {/* LEFT: Client Selection Sidebar */}
        <div className={`w-full xl:w-80 lg:w-96 bg-white dark:bg-gray-800 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 flex flex-col xl:h-full h-[600px] transition-all flex-shrink-0 ${selectedClient ? 'hidden xl:flex' : 'flex'}`}>
            <div className="p-5 border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-800 dark:text-white">
                    <PackageCheck className="text-primary"/> تسليم الطلبات
                </h2>
                <div className="relative">
                    <input 
                        type="text" 
                        placeholder="ابحث عن عميل أو رقم طلب..." 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-700 border-none rounded-xl focus:ring-2 focus:ring-primary shadow-sm text-sm"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                </div>
            </div>
            
            <div className="flex-grow overflow-y-auto p-3 space-y-2 custom-scrollbar bg-gray-50/30 dark:bg-gray-900/10">
                {activeClients.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                        <Filter size={32} className="mx-auto mb-2 opacity-50"/>
                        <p className="text-sm">لا توجد نتائج</p>
                    </div>
                ) : (
                    activeClients.map(client => (
                        <button key={client.id} onClick={() => setSelectedClient(client)} className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all border-2 group ${selectedClient?.id === client.id ? 'bg-primary border-primary text-white shadow-lg' : 'bg-white dark:bg-gray-800 border-transparent hover:border-gray-200 dark:hover:border-gray-600 shadow-sm'}`}>
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm ${selectedClient?.id === client.id ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                    {client.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="text-right truncate">
                                    <p className="font-bold text-sm truncate">{client.name}</p>
                                    <p className={`text-xs truncate ${selectedClient?.id === client.id ? 'text-blue-100' : 'text-gray-400'}`}>{client.phone}</p>
                                </div>
                            </div>
                            {client.readyCount > 0 && (
                                <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${selectedClient?.id === client.id ? 'bg-white text-primary' : 'bg-green-100 text-green-700'}`}>
                                    {client.readyCount}
                                </span>
                            )}
                        </button>
                    ))
                )}
            </div>
        </div>

        {/* CENTER & RIGHT: Main Content Wrapper */}
        <div className={`flex-grow flex flex-col xl:flex-row gap-6 h-auto xl:h-full ${!selectedClient ? 'hidden xl:flex opacity-50 pointer-events-none' : 'flex'}`}>
            
            {/* CENTER: Order Selection */}
            <div className="flex-grow flex flex-col bg-white dark:bg-gray-800 rounded-3xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700 h-[600px] xl:h-full">
                {/* Selected Client Header */}
                <div className="p-5 border-b dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50/30 dark:bg-gray-900/10 flex-shrink-0">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button onClick={() => setSelectedClient(null)} className="xl:hidden p-2 bg-gray-100 dark:bg-gray-700 rounded-full"><ArrowRight size={20}/></button>
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-primary font-bold text-xl">
                                {selectedClient?.name.charAt(0)}
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-gray-800 dark:text-white">{selectedClient?.name}</h3>
                                <p className="text-xs text-gray-500">{clientOrders.length} طلبات نشطة</p>
                            </div>
                        </div>
                    </div>
                    
                    <button 
                        onClick={handleSelectAllReady} 
                        className="w-full sm:w-auto text-sm font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 px-4 py-2 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center justify-center gap-2"
                    >
                        <CheckCircle2 size={16}/>
                        تحديد كل الجاهز ({clientOrders.filter(o => (o.status === OrderStatus.STORED || o.status === OrderStatus.ARRIVED_AT_OFFICE) && (o.weight||0)>0).length})
                    </button>
                </div>

                {/* Quick Summary of Selected Orders */}
                {selectedOrderIds.size > 0 && (
                    <div className="bg-primary/5 border-b border-primary/10 p-3 flex justify-between items-center animate-in slide-in-from-top-2">
                        <div className="flex gap-4 text-xs font-bold text-gray-700 dark:text-gray-300">
                            <div className="flex items-center gap-1.5">
                                <Layers size={14} className="text-primary"/>
                                <span>{totals.itemsCount} محدد</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Scale size={14} className="text-blue-500"/>
                                <span>{totals.totalWeight.toFixed(1)} كغ</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm font-black text-green-600 dark:text-green-400">
                            <Calculator size={16}/>
                            <span>{totals.ordersValue.toLocaleString()} MRU</span>
                        </div>
                    </div>
                )}

                {/* Orders TABLE */}
                <div className="flex-grow overflow-y-auto custom-scrollbar bg-gray-50/50 dark:bg-gray-900/20">
                    <table className="w-full text-sm text-right">
                        <thead className="bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 sticky top-0 z-10 font-bold">
                            <tr>
                                <th className="p-3 w-10 text-center">
                                    <div className="w-4 h-4 border-2 border-gray-300 rounded mx-auto"></div>
                                </th>
                                <th className="p-3">الطلب</th>
                                <th className="p-3 text-center">الحالة</th>
                                <th className="p-3 text-center">المالية</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {clientOrders.map(order => {
                                const isReady = order.status === OrderStatus.STORED || order.status === OrderStatus.ARRIVED_AT_OFFICE;
                                const hasWeight = (order.weight || 0) > 0;
                                const isSelected = selectedOrderIds.has(order.id);
                                const store = stores.find(s => s.id === order.storeId);
                                
                                const totalVal = Math.round(Number(order.priceInMRU||0) + Number(order.commission||0) + Number(order.shippingCost||0) + Number(order.localDeliveryCost||0));
                                const paidVal = Math.round(Number(order.amountPaid||0));
                                const remaining = totalVal - paidVal;
                                
                                const canDeliver = isReady && hasWeight;

                                return (
                                    <tr 
                                        key={order.id} 
                                        onClick={() => canDeliver && handleToggleOrder(order.id, true)}
                                        className={`group cursor-pointer transition-colors ${
                                            isSelected ? 'bg-green-50 dark:bg-green-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                                        } ${!isReady ? 'opacity-60' : ''}`}
                                    >
                                        <td className="p-3 text-center">
                                            {canDeliver ? (
                                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${isSelected ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                                                    {isSelected && <Check size={12} strokeWidth={3}/>}
                                                </div>
                                            ) : (
                                                <div className="w-5 h-5 mx-auto flex items-center justify-center text-gray-300">
                                                    <X size={14} />
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-800 dark:text-white font-mono">{order.localOrderId}</span>
                                                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                                    <StoreIcon size={10} className="text-orange-500"/> {store?.name}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-3 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                {isReady ? (
                                                    hasWeight ? (
                                                        <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-[10px] font-bold px-2 py-0.5 rounded border border-green-200 dark:border-green-800">
                                                            {order.storageLocation || 'مخزن'}
                                                        </span>
                                                    ) : <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded border border-red-200">ناقص الوزن</span>
                                                ) : <span className="bg-gray-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded">{STATUS_DETAILS[order.status]?.name}</span>}
                                                
                                                {hasWeight && <span className="text-[10px] text-gray-400 font-mono">{order.weight} kg</span>}
                                            </div>
                                        </td>
                                        <td className="p-3 text-center">
                                            <div className="flex flex-col items-end">
                                                <span className={`font-bold font-mono text-sm ${remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                    {Math.max(0, remaining).toLocaleString()}
                                                </span>
                                                <span className="text-[10px] text-gray-400">
                                                    شحن: {Math.round(Number(order.shippingCost||0))}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* RIGHT: Financial Summary (Checkout) */}
            <div className="w-full xl:w-96 bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-6 flex flex-col border border-gray-100 dark:border-gray-700 h-auto xl:h-full flex-shrink-0">
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-gray-800 dark:text-white">
                    <Wallet className="text-green-500"/> ملخص الاستلام
                </h3>
                
                <div className="space-y-4 mb-6 text-sm flex-grow xl:overflow-y-auto custom-scrollbar pr-2">
                    <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                        <span className="text-gray-500 dark:text-gray-400 font-medium">عدد الطلبات</span>
                        <span className="font-black bg-white dark:bg-gray-600 px-2 py-0.5 rounded shadow-sm">{totals.itemsCount}</span>
                    </div>
                    
                    <div className="space-y-2 pt-2">
                        <div className="flex justify-between text-gray-600 dark:text-gray-300">
                            <span>قيمة المنتج + العمولة</span>
                            <span className="font-mono font-bold">{totals.productTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-gray-600 dark:text-gray-300">
                            <span>رسوم الشحن</span>
                            <span className="font-mono font-bold">{totals.shippingTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-green-600 font-bold border-t dark:border-gray-700 pt-1">
                            <span>المدفوع مسبقاً</span>
                            <span className="font-mono">{totals.totalPaid.toLocaleString()}</span>
                        </div>
                    </div>
                    
                    {/* Delivery Toggle & Presets */}
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-900/50 transition-all">
                        <label className="flex items-center justify-between cursor-pointer mb-2">
                            <span className="font-bold text-blue-800 dark:text-blue-200 flex items-center gap-2"><Bike size={16}/> توصيل محلي</span>
                            <div className={`w-10 h-5 flex items-center rounded-full p-1 duration-300 ease-in-out ${enableLocalDelivery ? 'bg-blue-600' : 'bg-gray-300'}`}>
                                <div className={`bg-white w-3 h-3 rounded-full shadow-md transform duration-300 ease-in-out ${enableLocalDelivery ? 'translate-x-5' : ''}`}></div>
                            </div>
                            <input type="checkbox" checked={enableLocalDelivery} onChange={e => setEnableLocalDelivery(e.target.checked)} className="hidden"/>
                        </label>
                        {enableLocalDelivery && (
                            <div className="animate-in slide-in-from-top-2 space-y-2">
                                {/* Preset Buttons */}
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setLocalDeliveryCost(100)} 
                                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg border border-blue-200 dark:border-blue-800 transition-colors ${localDeliveryCost === 100 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-300 hover:bg-blue-50'}`}
                                    >
                                        100 MRU
                                    </button>
                                    <button 
                                        onClick={() => setLocalDeliveryCost(150)} 
                                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg border border-blue-200 dark:border-blue-800 transition-colors ${localDeliveryCost === 150 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-300 hover:bg-blue-50'}`}
                                    >
                                        150 MRU
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input type="number" value={localDeliveryCost} onChange={e => setLocalDeliveryCost(Math.round(parseFloat(e.target.value)))} className="w-full p-2 text-sm border rounded-lg bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-blue-500 font-mono text-center shadow-sm" placeholder="0"/>
                                    <span className="text-xs font-bold text-blue-600">MRU</span>
                                </div>
                                <p className="text-[10px] text-blue-600/80 mt-1">* قيمة التوصيل تسلم للمندوب</p>
                            </div>
                        )}
                    </div>

                    <div className="pt-4 border-t dark:border-gray-700">
                        <div className="flex justify-between items-center text-lg mb-4">
                            <span className="font-bold text-gray-800 dark:text-white">الإجمالي المستحق</span>
                            <span className="font-black text-green-600 font-mono text-xl">{totals.grandTotalRemaining.toLocaleString()} <span className="text-xs text-gray-400">MRU</span></span>
                        </div>

                        <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">طريقة دفع المتبقي</label>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            {getPaymentMethods().length > 0 ? getPaymentMethods().map(method => (
                                <button 
                                    key={method.id} 
                                    onClick={() => setPaymentMethod(method.name)}
                                    className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all ${paymentMethod === method.name ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                >
                                    {method.logo ? <img src={method.logo} className="w-5 h-5 object-contain mb-1"/> : <Banknote size={20} className="mb-1 text-gray-400"/>}
                                    <span className="text-[10px] font-bold">{method.name}</span>
                                </button>
                            )) : (
                                <p className="text-xs text-gray-400 col-span-2 text-center">يرجى إضافة طرق الدفع من الإعدادات</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Receipt Upload */}
                    <div className="grid grid-cols-4 gap-2">
                        {receiptImages.map((src, i) => (
                            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 group">
                                <img src={src} className="w-full h-full object-cover"/>
                                <button onClick={() => setReceiptImages(p => p.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X size={12}/></button>
                            </div>
                        ))}
                        {receiptImages.length < 3 && (
                            <label className={`flex flex-col items-center justify-center aspect-square border-2 border-dashed rounded-lg cursor-pointer transition-colors ${receiptImages.length === 0 ? 'col-span-4 h-24 aspect-auto bg-gray-50 hover:bg-gray-100 dark:bg-gray-700/30 dark:hover:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                                {isProcessingImages ? <Loader2 size={20} className="animate-spin text-gray-400"/> : <ImageIcon size={20} className="text-gray-400 mb-1"/>}
                                {receiptImages.length === 0 && <span className="text-xs text-gray-500 font-bold">إرفاق صورة الإيصال</span>}
                                <input type="file" accept="image/*" className="hidden" onChange={handleReceiptUpload} disabled={isProcessingImages}/>
                            </label>
                        )}
                    </div>

                    <button 
                        onClick={handleConfirmDelivery} 
                        disabled={selectedOrderIds.size === 0 || isSubmitting} 
                        className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-bold shadow-xl hover:shadow-2xl disabled:opacity-50 disabled:shadow-none transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 text-lg"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin" size={24}/> : <CheckCircle2 size={24}/>} 
                        <span>تأكيد التسليم</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default DeliveryPage;
