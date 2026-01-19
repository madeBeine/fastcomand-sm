
import React, { useState, useMemo, useContext, useEffect, useRef } from 'react';
import type { Order, Client, Store, Currency, ShippingCompany, StorageDrawer, AppSettings, User, CompanyInfo, PaymentMethod, City, GlobalActivityLog } from '../types';
import { OrderStatus, ShippingType } from '../types';
import { Search, Loader2, ArrowDown, X, Zap, FileText, Printer, Trash2, Truck, RefreshCw, Layers, History, DollarSign, Ban, AlertCircle, ArrowRight, Package } from 'lucide-react';
import { supabase, getErrorMessage } from '../supabaseClient';
import { AuthContext } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import OrderCard from './OrderCard';
import OrderFormModal from './OrderFormModal';
import OrderStatusModal from './OrderStatusModal';
import OrderDetailsModal from './OrderDetailsModal';
import SplitOrderModal from './SplitOrderModal';
import HistoryLogModal from './HistoryLogModal';
import PaymentModal from './PaymentModal';
import PasswordConfirmationModal from './PasswordConfirmationModal';
import ClientDetailsModal from './ClientDetailsModal';
import NotificationLanguageModal, { NotificationLanguage } from './NotificationLanguageModal';
import { mapOrder } from '../hooks/useAppData';

interface OrdersPageProps {
    orders: Order[];
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
    clients: Client[];
    stores: Store[];
    currencies: Currency[];
    shippingCompanies: ShippingCompany[];
    activeFilter: string | null;
    clearFilter: () => void;
    commissionRate: number;
    drawers: StorageDrawer[];
    paymentMethods: PaymentMethod[]; 
    settings: AppSettings;
    shouldOpenModal: boolean;
    onModalOpenHandled: () => void;
    companyInfo: CompanyInfo;
    users: User[];
    cities: City[];
    loadMoreOrders: () => void;
    searchOrders: (term: string) => Promise<Order[]>; 
    hasMoreOrders: boolean;
    isOrdersLoading: boolean;
    searchClients: (term: string) => void; 
    logAction: (action: string, entityType: GlobalActivityLog['entityType'], entityId: string, details: string) => void;
    externalSearchTerm?: string; 
    externalStoreFilter?: string | 'all'; 
    externalSmartFilter?: string; 
}

const OrdersPage: React.FC<OrdersPageProps> = ({ 
    orders, setOrders, clients, stores, currencies, shippingCompanies, 
    commissionRate, drawers, paymentMethods, 
    settings, shouldOpenModal, onModalOpenHandled, companyInfo, users, cities,
    loadMoreOrders, searchOrders, hasMoreOrders, isOrdersLoading, logAction, 
    externalSearchTerm, externalStoreFilter, externalSmartFilter, searchClients
}) => {
    const { currentUser } = useContext(AuthContext);
    const { t } = useLanguage();
    const { showToast } = useToast();

    // -- Modal States --
    const [isFormModalOpen, setFormModalOpen] = useState(false);
    const [isStatusModalOpen, setStatusModalOpen] = useState(false);
    const [isDetailsModalOpen, setDetailsModalOpen] = useState(false);
    const [isSplitModalOpen, setSplitModalOpen] = useState(false);
    const [isHistoryModalOpen, setHistoryModalOpen] = useState(false);
    const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
    const [isCancelModalOpen, setCancelModalOpen] = useState(false);
    const [isClientDetailsOpen, setClientDetailsOpen] = useState(false);
    const [isNotifModalOpen, setNotifModalOpen] = useState(false);

    // -- Selected Items --
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [selectedClient, setSelectedClient] = useState<Client | undefined>(undefined);
    const [historyLog, setHistoryLog] = useState<any[]>([]);

    // -- Search Effect --
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (shouldOpenModal) {
            setSelectedOrder(null);
            setFormModalOpen(true);
            onModalOpenHandled();
        }
    }, [shouldOpenModal, onModalOpenHandled]);

    useEffect(() => {
        if (externalSearchTerm !== undefined) {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
            
            if (externalSearchTerm.trim()) {
                setIsSearching(true);
                searchTimeoutRef.current = setTimeout(async () => {
                    try {
                        const results = await searchOrders(externalSearchTerm);
                        setOrders(results);
                    } finally {
                        setIsSearching(false);
                    }
                }, 500);
            } else {
                setIsSearching(false);
            }
        }
    }, [externalSearchTerm]);

    // -- Filter Logic --
    const filteredOrders = useMemo(() => {
        let result = orders;

        // 1. Store Filter
        if (externalStoreFilter && externalStoreFilter !== 'all') {
            result = result.filter(o => o.storeId === externalStoreFilter);
        }

        // 2. Smart Filter
        if (externalSmartFilter && externalSmartFilter !== 'all') {
            if (Object.values(OrderStatus).includes(externalSmartFilter as OrderStatus)) {
                result = result.filter(o => o.status === externalSmartFilter);
            } else {
                const today = new Date().toISOString().split('T')[0];
                switch (externalSmartFilter) {
                    case 'late':
                        result = result.filter(o => (o.status === OrderStatus.ORDERED || o.status === OrderStatus.SHIPPED_FROM_STORE) && o.expectedArrivalDate && o.expectedArrivalDate < today);
                        break;
                    case 'needs_tracking':
                        result = result.filter(o => o.status === OrderStatus.ORDERED && !o.trackingNumber);
                        break;
                    case 'waiting_weight':
                        result = result.filter(o => o.status === OrderStatus.ARRIVED_AT_OFFICE && (!o.weight || o.weight === 0));
                        break;
                    case 'pending_invoice':
                        result = result.filter(o => o.status === OrderStatus.ORDERED && !o.isInvoicePrinted);
                        break;
                    case 'ready_pickup':
                        result = result.filter(o => o.status === OrderStatus.STORED || o.status === OrderStatus.ARRIVED_AT_OFFICE);
                        break;
                    case 'pending_notification':
                        result = result.filter(o => (o.status === OrderStatus.STORED || o.status === OrderStatus.ARRIVED_AT_OFFICE) && !o.whatsappNotificationSent);
                        break;
                }
            }
        }

        return result;
    }, [orders, externalStoreFilter, externalSmartFilter]);

    // -- Handlers --

    const handleSaveOrder = async (orderData: Order) => {
        if (!supabase) return;
        try {
            const user = currentUser?.username || 'System';
            const historyEntry = { timestamp: new Date().toISOString(), activity: orderData.id ? 'Order Updated' : 'Order Created', user };
            
            // Explicitly map payload to DB columns to avoid sending unknown props
            const dbPayload: any = {
                client_id: orderData.clientId,
                store_id: orderData.storeId,
                local_order_id: orderData.localOrderId,
                global_order_id: orderData.globalOrderId,
                price: orderData.price,
                currency: orderData.currency,
                price_in_mru: orderData.priceInMRU,
                commission: orderData.commission,
                quantity: orderData.quantity,
                amount_paid: orderData.amountPaid,
                payment_method: orderData.paymentMethod,
                transaction_fee: orderData.transactionFee,
                shipping_type: orderData.shippingType,
                transport_mode: orderData.transportMode,
                order_date: orderData.orderDate,
                expected_arrival_date: orderData.expectedArrivalDate,
                arrival_date_at_office: orderData.arrivalDateAtOffice,
                commission_type: orderData.commissionType,
                commission_rate: orderData.commissionRate,
                product_links: orderData.productLinks,
                product_images: orderData.productImages,
                order_images: orderData.orderImages,
                tracking_images: orderData.trackingImages,
                hub_arrival_images: orderData.hubArrivalImages,
                weighing_images: orderData.weighingImages,
                receipt_images: orderData.receiptImages,
                receipt_image: orderData.receiptImage,
                notes: orderData.notes,
                status: orderData.status,
                tracking_number: orderData.trackingNumber,
                weight: orderData.weight,
                shipping_cost: orderData.shippingCost,
                storage_location: orderData.storageLocation,
                storage_date: orderData.storageDate,
                withdrawal_date: orderData.withdrawalDate,
                whatsapp_notification_sent: orderData.whatsappNotificationSent,
                shipment_id: orderData.shipmentId,
                box_id: orderData.boxId,
                origin_center: orderData.originCenter,
                receiving_company_id: orderData.receivingCompanyId,
                history: [...(orderData.history || []), historyEntry],
                is_invoice_printed: orderData.isInvoicePrinted,
                local_delivery_cost: orderData.localDeliveryCost,
                driver_name: orderData.driverName,
                driver_id: orderData.driverId,
                delivery_run_id: orderData.deliveryRunId,
                is_delivery_fee_prepaid: orderData.isDeliveryFeePrepaid
            };
            
            let res;
            if (orderData.id) {
                res = await supabase.from('Orders').update(dbPayload).eq('id', orderData.id).select().single();
            } else {
                res = await supabase.from('Orders').insert(dbPayload).select().single();
            }

            if (res.error) throw res.error;

            const mapped = mapOrder(res.data);
            setOrders(prev => {
                if (orderData.id) return prev.map(o => o.id === mapped.id ? mapped : o);
                return [mapped, ...prev];
            });

            showToast(t('success'), 'success');
            logAction(orderData.id ? 'Update' : 'Create', 'Order', mapped.id, `Order ${mapped.localOrderId} ${orderData.id ? 'updated' : 'created'}`);
        } catch (e: any) {
            console.error("Save Order Error:", e);
            showToast(getErrorMessage(e), 'error');
        }
    };

    const handleDeleteOrder = async (password: string, reason?: string) => {
        if (!selectedOrder || !supabase) return;
        try {
            const { error } = await supabase.rpc('admin_delete_order', { order_id: selectedOrder.id }); // Assuming RPC or direct delete
            // If no RPC, direct delete:
            if (error && error.code === '42883') { // Function doesn't exist fall back
                 const { error: delError } = await supabase.from('Orders').delete().eq('id', selectedOrder.id);
                 if (delError) throw delError;
            } else if (error) throw error;

            setOrders(prev => prev.filter(o => o.id !== selectedOrder.id));
            showToast('تم حذف الطلب بنجاح', 'success');
            logAction('Delete', 'Order', selectedOrder.id, `Deleted order ${selectedOrder.localOrderId}. Reason: ${reason}`);
            setDeleteModalOpen(false);
        } catch (e: any) {
            showToast(getErrorMessage(e), 'error');
        }
    };

    const handleCancelOrder = async (password: string, reason?: string) => {
        if (!selectedOrder || !supabase) return;
        try {
            const user = currentUser?.username || 'System';
            const updates = {
                status: OrderStatus.CANCELLED,
                notes: selectedOrder.notes ? `${selectedOrder.notes}\nCancelled: ${reason}` : `Cancelled: ${reason}`,
                history: [...(selectedOrder.history || []), { timestamp: new Date().toISOString(), activity: `Cancelled: ${reason}`, user }]
            };
            const { error } = await supabase.from('Orders').update(updates).eq('id', selectedOrder.id);
            if (error) throw error;

            setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, ...updates } : o));
            showToast('تم إلغاء الطلب', 'success');
            logAction('Cancel', 'Order', selectedOrder.id, `Cancelled order ${selectedOrder.localOrderId}`);
            setCancelModalOpen(false);
        } catch (e: any) {
            showToast(getErrorMessage(e), 'error');
        }
    };

    const handleUpdateStatus = async (orderId: string, payload: Partial<Order>) => {
        if (!supabase) return;
        try {
            const user = currentUser?.username || 'System';
            const oldOrder = orders.find(o => o.id === orderId);
            const historyEntry = { 
                timestamp: new Date().toISOString(), 
                activity: `Status updated to ${payload.status || 'new info'}`, 
                user 
            };
            
            const dbPayload: any = { 
                history: [...(oldOrder?.history || []), historyEntry] 
            };

            // Map fields for DB
            if (payload.status) dbPayload.status = payload.status;
            if (payload.globalOrderId) dbPayload.global_order_id = payload.globalOrderId;
            if (payload.trackingNumber) dbPayload.tracking_number = payload.trackingNumber;
            if (payload.arrivalDateAtOffice) dbPayload.arrival_date_at_office = payload.arrivalDateAtOffice;
            if (payload.weight) dbPayload.weight = payload.weight;
            if (payload.shippingCost) dbPayload.shipping_cost = payload.shippingCost;
            if (payload.storageLocation) dbPayload.storage_location = payload.storageLocation;
            if (payload.shippingType) dbPayload.shipping_type = payload.shippingType;
            if (payload.productImages) dbPayload.product_images = payload.productImages;
            if (payload.trackingImages) dbPayload.tracking_images = payload.trackingImages;
            if (payload.weighingImages) dbPayload.weighing_images = payload.weighingImages;
            if (payload.storageDate) dbPayload.storage_date = payload.storageDate;
            if (payload.localDeliveryCost) dbPayload.local_delivery_cost = payload.localDeliveryCost;

            const { data, error } = await supabase.from('Orders').update(dbPayload).eq('id', orderId).select().single();
            if (error) throw error;

            const mapped = mapOrder(data);
            setOrders(prev => prev.map(o => o.id === orderId ? mapped : o));
            showToast('تم تحديث الحالة بنجاح', 'success');
            
        } catch (e: any) {
            showToast(getErrorMessage(e), 'error');
        }
    };

    const handleRevertStatus = async (orderId: string, password?: string): Promise<boolean> => {
        const order = orders.find(o => o.id === orderId);
        if (!order || !supabase) return false;

        let newStatus = order.status;
        if (order.status === OrderStatus.ORDERED) newStatus = OrderStatus.NEW;
        else if (order.status === OrderStatus.SHIPPED_FROM_STORE) newStatus = OrderStatus.ORDERED;
        else if (order.status === OrderStatus.ARRIVED_AT_OFFICE) newStatus = OrderStatus.SHIPPED_FROM_STORE;
        else if (order.status === OrderStatus.STORED) newStatus = OrderStatus.ARRIVED_AT_OFFICE;
        else if (order.status === OrderStatus.COMPLETED) newStatus = OrderStatus.STORED; 

        if (newStatus === order.status) return false;

        try {
            const user = currentUser?.username || 'System';
            const { data, error } = await supabase.from('Orders').update({
                status: newStatus,
                history: [...(order.history || []), { timestamp: new Date().toISOString(), activity: `Reverted to ${newStatus}`, user }]
            }).eq('id', orderId).select().single();

            if (error) throw error;
            setOrders(prev => prev.map(o => o.id === orderId ? mapOrder(data) : o));
            showToast('تم التراجع عن الحالة', 'success');
            return true;
        } catch (e: any) {
            showToast(getErrorMessage(e), 'error');
            return false;
        }
    };

    const handleSplitOrder = async (originalOrderId: string, splitDetails: any) => {
        if (!supabase) return;
        try {
            const originalOrder = orders.find(o => o.id === originalOrderId);
            if (!originalOrder) return;

            const user = currentUser?.username || 'System';
            const historyEntry = { timestamp: new Date().toISOString(), activity: 'Order Split', user };

            // 1. Update Original
            const newOriginalQty = originalOrder.quantity - splitDetails.quantity;
            const newOriginalPriceInMRU = (originalOrder.priceInMRU || 0) - splitDetails.priceAdjustment;
            
            await supabase.from('Orders').update({
                quantity: newOriginalQty,
                price_in_mru: newOriginalPriceInMRU,
                history: [...(originalOrder.history || []), historyEntry]
            }).eq('id', originalOrderId);

            // 2. Create New
            const newOrderPayload = {
                client_id: originalOrder.clientId,
                store_id: originalOrder.storeId,
                local_order_id: `${originalOrder.localOrderId}-S`,
                quantity: splitDetails.quantity,
                tracking_number: splitDetails.trackingNumber,
                global_order_id: splitDetails.globalOrderId,
                price_in_mru: splitDetails.priceAdjustment,
                status: OrderStatus.ORDERED,
                shipping_type: originalOrder.shippingType,
                transport_mode: originalOrder.transportMode,
                order_date: originalOrder.orderDate,
                price: originalOrder.price, // Keep unit price same if needed or adjust logic
                currency: originalOrder.currency,
                history: [{ timestamp: new Date().toISOString(), activity: `Split from ${originalOrder.localOrderId}`, user }]
            };
            
            const { data, error } = await supabase.from('Orders').insert(newOrderPayload).select().single();
            if (error) throw error;

            const mappedNew = mapOrder(data);
            setOrders(prev => {
                const updatedOriginal = { ...originalOrder, quantity: newOriginalQty, priceInMRU: newOriginalPriceInMRU };
                return [...prev.map(o => o.id === originalOrderId ? updatedOriginal : o), mappedNew];
            });

            showToast('تم تجزئة الطلب بنجاح', 'success');
        } catch (e: any) {
            showToast(getErrorMessage(e), 'error');
        }
    };

    const handleSendNotification = async (lang: NotificationLanguage) => {
        if (!selectedOrder || !supabase) return;
        
        const template = settings.whatsappTemplates?.[lang];
        if (!template) {
            showToast('قالب الرسالة غير موجود', 'error');
            return;
        }

        const client = clients.find(c => c.id === selectedOrder.clientId);
        if (!client) return;

        // Replace placeholders
        let msg = template
            .replace('{clientName}', client.name)
            .replace('{orderId}', selectedOrder.localOrderId)
            .replace('{weight}', selectedOrder.weight?.toString() || '0')
            .replace('{shippingCost}', selectedOrder.shippingCost?.toLocaleString() || '0')
            .replace('{companyName}', companyInfo.name);

        const remaining = ((selectedOrder.priceInMRU || 0) + (selectedOrder.commission || 0) + (selectedOrder.shippingCost || 0) + (selectedOrder.localDeliveryCost || 0)) - (selectedOrder.amountPaid || 0);
        msg = msg.replace('{totalDue}', remaining.toLocaleString());
        msg = msg.replace('{productRemainingLine}', ''); 
        msg = msg.replace('{deliveryLine}', selectedOrder.localDeliveryCost ? `🚚 توصيل: ${selectedOrder.localDeliveryCost}` : '');

        const url = `https://wa.me/${client.whatsappNumber || client.phone}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');

        // Update sent status
        await supabase.from('Orders').update({ whatsapp_notification_sent: true }).eq('id', selectedOrder.id);
        setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, whatsappNotificationSent: true } : o));
        setNotifModalOpen(false);
    };

    const handleUpdatePayment = async (orderId: string, details: any) => {
        if (!supabase) return;
        try {
            const order = orders.find(o => o.id === orderId);
            if (!order) return;

            const user = currentUser?.username || 'System';
            
            // Insert Payment Transaction
            if (details.amountPaid > 0) {
                await supabase.from('OrderPayments').insert({
                    order_id: orderId,
                    amount: details.amountPaid,
                    payment_method: details.paymentMethod,
                    receipt_images: details.receiptImages,
                    created_by: user
                });
            }

            // Update Order
            const newPaid = (order.amountPaid || 0) + details.amountPaid;
            const updates: any = {
                amount_paid: newPaid,
                local_delivery_cost: details.localDeliveryCost,
                payment_method: details.paymentMethod, 
            };

            const { error } = await supabase.from('Orders').update(updates).eq('id', orderId);
            if (error) throw error;

            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, amountPaid: newPaid, localDeliveryCost: details.localDeliveryCost, paymentMethod: details.paymentMethod } : o));
            showToast('تم تحديث المدفوعات', 'success');
        } catch (e: any) {
            showToast(getErrorMessage(e), 'error');
        }
    };

    const handleInvoiceSent = async (order: Order) => {
        if (!supabase) return;
        await supabase.from('Orders').update({ is_invoice_printed: true }).eq('id', order.id);
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, isInvoicePrinted: true } : o));
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Modals */}
            <OrderFormModal 
                isOpen={isFormModalOpen} 
                onClose={() => setFormModalOpen(false)} 
                onSave={handleSaveOrder} 
                order={selectedOrder}
                clients={clients}
                stores={stores}
                currencies={currencies}
                commissionRate={commissionRate}
                settings={settings}
                shippingCompanies={shippingCompanies}
                paymentMethods={paymentMethods}
                onClientSearch={searchClients}
            />

            <OrderStatusModal 
                isOpen={isStatusModalOpen}
                onClose={() => setStatusModalOpen(false)}
                order={selectedOrder}
                allOrders={orders}
                drawers={drawers}
                clients={clients}
                onUpdate={handleUpdateStatus}
                onRevert={handleRevertStatus}
                shippingCompanies={shippingCompanies}
                settings={settings}
                cities={cities}
            />

            <OrderDetailsModal 
                isOpen={isDetailsModalOpen}
                onClose={() => setDetailsModalOpen(false)}
                order={selectedOrder}
                client={clients.find(c => c.id === selectedOrder?.clientId)}
                store={stores.find(s => s.id === selectedOrder?.storeId)}
                shippingCompanies={shippingCompanies}
            />

            <SplitOrderModal 
                isOpen={isSplitModalOpen}
                onClose={() => setSplitModalOpen(false)}
                order={selectedOrder}
                onSplit={handleSplitOrder}
            />

            <PaymentModal 
                isOpen={isPaymentModalOpen}
                onClose={() => setPaymentModalOpen(false)}
                onConfirm={handleUpdatePayment}
                order={selectedOrder}
                paymentMethods={paymentMethods}
            />

            <HistoryLogModal 
                isOpen={isHistoryModalOpen}
                onClose={() => setHistoryModalOpen(false)}
                history={historyLog}
                title={`سجل الطلب ${selectedOrder?.localOrderId || ''}`}
            />

            <ClientDetailsModal 
                isOpen={isClientDetailsOpen}
                onClose={() => setClientDetailsOpen(false)}
                client={selectedClient!}
                clientOrders={orders.filter(o => o.clientId === selectedClient?.id)}
                cities={cities}
                onUpdateClient={async (c) => { /* Update Client Logic via Supabase */ }}
            />

            <NotificationLanguageModal 
                isOpen={isNotifModalOpen}
                onClose={() => setNotifModalOpen(false)}
                onConfirm={handleSendNotification}
            />

            <PasswordConfirmationModal 
                isOpen={isDeleteModalOpen} 
                onClose={() => setDeleteModalOpen(false)} 
                onConfirm={handleDeleteOrder}
                title={t('confirmDelete')}
                message={t('deleteWarning')}
                requireReason
            />

            <PasswordConfirmationModal 
                isOpen={isCancelModalOpen} 
                onClose={() => setCancelModalOpen(false)} 
                onConfirm={handleCancelOrder}
                title={t('confirmCancel')}
                message="هل أنت متأكد من إلغاء هذا الطلب؟"
                requireReason
            />

            {/* List */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredOrders.map(order => (
                    <OrderCard 
                        key={order.id}
                        order={order}
                        client={clients.find(c => c.id === order.clientId)}
                        store={stores.find(s => s.id === order.storeId)}
                        users={users}
                        settings={settings}
                        companyInfo={companyInfo}
                        onEdit={() => { setSelectedOrder(order); setFormModalOpen(true); }}
                        onDelete={() => { setSelectedOrder(order); setDeleteModalOpen(true); }}
                        onCancel={() => { setSelectedOrder(order); setCancelModalOpen(true); }}
                        onChangeStatus={() => { setSelectedOrder(order); setStatusModalOpen(true); }}
                        onUpdatePayment={() => { setSelectedOrder(order); setPaymentModalOpen(true); }}
                        onHistory={() => { setSelectedOrder(order); setHistoryLog(order.history || []); setHistoryModalOpen(true); }}
                        onView={() => { setSelectedOrder(order); setDetailsModalOpen(true); }}
                        onSplit={() => { setSelectedOrder(order); setSplitModalOpen(true); }}
                        onPrintInvoice={() => { /* Handled in Card via Internal State or could lift up */ }}
                        onShareInvoice={() => { /* Handled in Card */ }}
                        onSendNotification={() => { setSelectedOrder(order); setNotifModalOpen(true); }}
                        onInvoiceSent={handleInvoiceSent}
                        onClientClick={(c) => { setSelectedClient(c); setClientDetailsOpen(true); }}
                        searchTerm={externalSearchTerm}
                    />
                ))}
            </div>

            {/* Loading / Empty States */}
            {isOrdersLoading && (
                <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-primary" size={32} />
                </div>
            )}

            {!isOrdersLoading && filteredOrders.length === 0 && (
                <div className="text-center py-20 text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-3xl border border-dashed dark:border-gray-700">
                    <Package size={64} className="mx-auto mb-4 opacity-10"/>
                    <p className="font-bold text-lg">{t('noOrdersFound')}</p>
                    {externalSearchTerm && <p className="text-sm opacity-60">جرب البحث بكلمات مختلفة أو تحقق من الفلاتر</p>}
                </div>
            )}

            {/* Load More */}
            {hasMoreOrders && !isSearching && filteredOrders.length > 0 && (
                <div className="flex justify-center mt-8">
                    <button 
                        onClick={loadMoreOrders} 
                        disabled={isOrdersLoading}
                        className="flex items-center gap-2 px-8 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl shadow-md hover:shadow-lg transition-all border border-slate-100 dark:border-slate-700 font-bold"
                    >
                        {isOrdersLoading ? <Loader2 className="animate-spin" size={20}/> : <ArrowDown size={20}/>}
                        {isOrdersLoading ? t('loading') : t('showMore')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default OrdersPage;
