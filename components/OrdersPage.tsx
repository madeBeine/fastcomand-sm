
import React, { useState, useMemo, useContext, useEffect } from 'react';
import type { Order, Client, Store, Currency, ShippingCompany, StorageDrawer, AppSettings, User, CompanyInfo } from '../types';
import { OrderStatus, ShippingType } from '../types';
import { Search, Filter, Plus, X, ListOrdered } from 'lucide-react';
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
import NotificationLanguageModal, { NotificationLanguage } from './NotificationLanguageModal';
import { STATUS_DETAILS } from '../constants';

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
    paymentMethods: string[];
    settings: AppSettings;
    shouldOpenModal: boolean;
    onModalOpenHandled: () => void;
    companyInfo: CompanyInfo;
    users: User[];
}

const mapDBToOrder = (o: any): Order => ({
    ...o,
    localOrderId: o.localOrderId ?? o.local_order_id,
    globalOrderId: o.globalOrderId ?? o.global_order_id,
    clientId: o.clientId ?? o.client_id,
    storeId: o.storeId ?? o.store_id,
    priceInMRU: o.priceInMRU ?? o.price_in_mru,
    amountPaid: o.amountPaid ?? o.amount_paid,
    paymentMethod: o.paymentMethod ?? o.payment_method,
    shippingType: o.shippingType ?? o.shipping_type,
    orderDate: o.orderDate ?? o.order_date,
    arrivalDateAtOffice: o.arrivalDateAtOffice ?? o.arrival_date_at_office,
    expectedArrivalDate: o.expectedArrivalDate ?? o.expected_arrival_date,
    expectedHubArrivalStartDate: o.expectedHubArrivalStartDate ?? o.expected_hub_arrival_start_date,
    expectedHubArrivalEndDate: o.expectedHubArrivalEndDate ?? o.expected_hub_arrival_end_date,
    commissionType: o.commissionType ?? o.commission_type,
    commissionRate: o.commissionRate ?? o.commission_rate,
    productLinks: o.productLinks ?? o.product_links,
    productImages: o.productImages ?? o.product_images ?? [],
    orderImages: o.orderImages ?? o.order_images ?? [],
    hubArrivalImages: o.hubArrivalImages ?? o.hub_arrival_images ?? [],
    weighingImages: o.weighingImages ?? o.weighing_images ?? [],
    trackingNumber: o.trackingNumber ?? o.tracking_number,
    shippingCost: o.shippingCost ?? o.shipping_cost,
    storageLocation: o.storageLocation ?? o.storage_location,
    storageDate: o.storageDate ?? o.storage_date,
    withdrawalDate: o.withdrawalDate ?? o.withdrawal_date,
    receiptImage: o.receiptImage ?? o.receipt_image,
    receiptImages: (o.receipt_images && o.receipt_images.length > 0) 
        ? o.receipt_images 
        : (o.receipt_image ? [o.receipt_image] : []),
    shipmentId: o.shipmentId ?? o.shipment_id,
    boxId: o.boxId ?? o.box_id,
    originCenter: o.originCenter ?? o.origin_center,
    receivingCompanyId: o.receivingCompanyId ?? o.receiving_company_id,
    whatsappNotificationSent: o.whatsappNotificationSent ?? false,
    isInvoicePrinted: o.isInvoicePrinted ?? o.is_invoice_printed ?? false,
    history: o.history ?? [],
    localDeliveryCost: o.localDeliveryCost ?? o.local_delivery_cost ?? 0,
});

const OrdersPage: React.FC<OrdersPageProps> = ({ 
    orders, setOrders, clients, stores, currencies, shippingCompanies, 
    activeFilter, clearFilter, commissionRate, drawers, paymentMethods, 
    settings, shouldOpenModal, onModalOpenHandled, companyInfo, users 
}) => {
    const { currentUser } = useContext(AuthContext);
    const { t } = useLanguage();
    const { showToast } = useToast();

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
    const [storeFilter, setStoreFilter] = useState<string | 'all'>('all');

    const [isFormModalOpen, setFormModalOpen] = useState(false);
    const [isStatusModalOpen, setStatusModalOpen] = useState(false);
    const [isDetailsModalOpen, setDetailsModalOpen] = useState(false);
    const [isSplitModalOpen, setSplitModalOpen] = useState(false);
    const [isHistoryModalOpen, setHistoryModalOpen] = useState(false);
    const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [notificationOrder, setNotificationOrder] = useState<Order | null>(null);

    // Delete Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [orderToDelete, setOrderToDelete] = useState<string | null>(null);

    // Smart Filter Handling: Distinguish between Status and Search Text
    useEffect(() => {
        if (activeFilter) {
            // Check if the activeFilter is a valid OrderStatus
            // Convert to string to ensure safe comparison
            const isStatusValue = Object.values(OrderStatus).map(s => s.toString()).includes(activeFilter);

            if (isStatusValue) {
                // If it's a status (e.g. 'new', 'ordered'), set the dropdown
                setStatusFilter(activeFilter as OrderStatus);
                setSearchTerm('');
            } else if (activeFilter === 'needs_tracking') {
                // Special case for 'needs_tracking' sent from dashboard
                setSearchTerm('needs_tracking'); 
                setStatusFilter('all');
            } else {
                // If it's text (e.g. search ID), treat as search
                setSearchTerm(activeFilter);
                setStatusFilter('all');
            }
        }
    }, [activeFilter]);

    useEffect(() => {
        if (shouldOpenModal) {
            setSelectedOrder(null);
            setFormModalOpen(true);
            onModalOpenHandled();
        }
    }, [shouldOpenModal, onModalOpenHandled]);

    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            // Special Case: Filter for 'needs_tracking'
            if (searchTerm === 'needs_tracking') {
                return order.status === OrderStatus.ORDERED && !order.trackingNumber;
            }

            const clientName = clients.find(c => c.id === order.clientId)?.name || '';
            const matchesSearch = 
                order.localOrderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (order.trackingNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                clientName.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
            const matchesStore = storeFilter === 'all' || order.storeId === storeFilter;

            return matchesSearch && matchesStatus && matchesStore;
        });
    }, [orders, searchTerm, statusFilter, storeFilter, clients]);

    const handleSaveOrder = async (orderData: Order) => {
        if (!supabase) return;
        const user = currentUser?.username || 'System';
        
        try {
            const dbPayload: any = {
                local_order_id: orderData.localOrderId,
                global_order_id: orderData.globalOrderId,
                client_id: orderData.clientId,
                store_id: orderData.storeId,
                price: orderData.price,
                currency: orderData.currency,
                price_in_mru: orderData.priceInMRU,
                commission: orderData.commission,
                quantity: orderData.quantity,
                amount_paid: orderData.amountPaid,
                payment_method: orderData.paymentMethod,
                shipping_type: orderData.shippingType,
                order_date: orderData.orderDate,
                expected_arrival_date: orderData.expectedArrivalDate,
                commission_type: orderData.commissionType,
                commission_rate: orderData.commissionRate,
                product_links: orderData.productLinks,
                product_images: orderData.productImages,
                receipt_images: orderData.receiptImages,
                receipt_image: orderData.receiptImage,
                origin_center: orderData.originCenter,
                notes: orderData.notes,
                status: orderData.status,
                history: [...(orderData.history || []), { 
                    timestamp: new Date().toISOString(), 
                    activity: orderData.id ? 'Updated' : 'Created', 
                    user 
                }]
            };

            let res;
            if (orderData.id) {
                res = await supabase.from('Orders').update(dbPayload).eq('id', orderData.id).select().single();
            } else {
                res = await supabase.from('Orders').insert(dbPayload).select().single();
            }

            if (res.error) throw res.error;
            
            const savedOrder = mapDBToOrder(res.data);
            if (orderData.id) {
                setOrders(prev => prev.map(o => o.id === savedOrder.id ? savedOrder : o));
            } else {
                setOrders(prev => [savedOrder, ...prev]);
            }
            showToast(t('success'), 'success');
            setFormModalOpen(false);
        } catch (e: any) {
            showToast(getErrorMessage(e), 'error');
        }
    };

    const handleUpdateStatus = async (orderId: string, payload: Partial<Order>) => {
        if (!supabase) return;
        const user = currentUser?.username || 'System';
        
        try {
            const order = orders.find(o => o.id === orderId);
            if (!order) return;

            const nextStatusMap: Record<OrderStatus, OrderStatus> = {
                [OrderStatus.NEW]: OrderStatus.ORDERED,
                [OrderStatus.ORDERED]: OrderStatus.SHIPPED_FROM_STORE,
                [OrderStatus.SHIPPED_FROM_STORE]: OrderStatus.ARRIVED_AT_OFFICE,
                [OrderStatus.ARRIVED_AT_OFFICE]: OrderStatus.STORED,
                [OrderStatus.STORED]: OrderStatus.COMPLETED,
                [OrderStatus.COMPLETED]: OrderStatus.COMPLETED,
                [OrderStatus.CANCELLED]: OrderStatus.CANCELLED,
            };

            const dbPayload: any = { ...payload };
            if (!payload.status && order.status !== OrderStatus.COMPLETED) {
                dbPayload.status = nextStatusMap[order.status];
            }

            const finalPayload: any = {};
            if (dbPayload.status) finalPayload.status = dbPayload.status;
            if (dbPayload.trackingNumber) finalPayload.tracking_number = dbPayload.trackingNumber;
            if (dbPayload.globalOrderId) finalPayload.global_order_id = dbPayload.globalOrderId;
            if (dbPayload.originCenter) finalPayload.origin_center = dbPayload.originCenter;
            if (dbPayload.receivingCompanyId) finalPayload.receiving_company_id = dbPayload.receivingCompanyId;
            if (dbPayload.orderImages) finalPayload.order_images = dbPayload.orderImages;
            if (dbPayload.hubArrivalImages) finalPayload.hub_arrival_images = dbPayload.hubArrivalImages;
            if (dbPayload.weighingImages) finalPayload.weighing_images = dbPayload.weighingImages;
            if (dbPayload.weight !== undefined) finalPayload.weight = dbPayload.weight;
            if (dbPayload.shippingCost !== undefined) finalPayload.shipping_cost = dbPayload.shippingCost;
            if (dbPayload.storageLocation !== undefined) finalPayload.storage_location = dbPayload.storageLocation;
            if (dbPayload.storageDate) finalPayload.storage_date = dbPayload.storageDate;
            if (dbPayload.arrivalDateAtOffice) finalPayload.arrival_date_at_office = dbPayload.arrivalDateAtOffice;

            finalPayload.history = [...(order.history || []), { 
                timestamp: new Date().toISOString(), 
                activity: `Status updated to ${finalPayload.status || order.status}`, 
                user 
            }];

            const { data, error } = await supabase.from('Orders').update(finalPayload).eq('id', orderId).select().single();
            if (error) throw error;

            setOrders(prev => prev.map(o => o.id === orderId ? mapDBToOrder(data) : o));
            showToast(t('success'), 'success');
            setStatusModalOpen(false);
        } catch (e: any) {
            showToast(getErrorMessage(e), 'error');
        }
    };

    const handleRevert = async (orderId: string, password?: string): Promise<boolean> => {
        if (!supabase || !currentUser?.email) return false;
        const user = currentUser?.username || 'System';
        
        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: currentUser.email,
                password: password || ''
            });

            if (authError) {
                showToast('كلمة المرور غير صحيحة', 'error');
                return false;
            }

            const order = orders.find(o => o.id === orderId);
            if (!order) return false;

            const statusOrder = [
                OrderStatus.NEW,
                OrderStatus.ORDERED,
                OrderStatus.SHIPPED_FROM_STORE,
                OrderStatus.ARRIVED_AT_OFFICE,
                OrderStatus.STORED,
                OrderStatus.COMPLETED
            ];
            
            const currentIndex = statusOrder.indexOf(order.status);
            if (currentIndex <= 0) return false;
            
            const prevStatus = statusOrder[currentIndex - 1];
            
            const updates: any = {
                status: prevStatus,
                history: [...(order.history || []), { 
                    timestamp: new Date().toISOString(), 
                    activity: `Status reverted from ${order.status} to ${prevStatus}`, 
                    user 
                }]
            };

            if (order.status === OrderStatus.COMPLETED) {
                updates.withdrawal_date = null;
            } else if (order.status === OrderStatus.STORED) {
                updates.storage_location = null;
                updates.storage_date = null;
                updates.weight = 0;
                updates.shipping_cost = 0;
            } else if (order.status === OrderStatus.ARRIVED_AT_OFFICE) {
                updates.arrival_date_at_office = null;
            } else if (order.status === OrderStatus.SHIPPED_FROM_STORE) {
                updates.shipment_id = null;
                updates.box_id = null;
            } else if (order.status === OrderStatus.ORDERED) {
                updates.tracking_number = null;
                updates.global_order_id = null;
            }

            const { data, error } = await supabase.from('Orders').update(updates).eq('id', orderId).select().single();
            if (error) throw error;

            setOrders(prev => prev.map(o => o.id === orderId ? mapDBToOrder(data) : o));
            showToast(t('success'), 'success');
            return true;
        } catch (e: any) {
            console.error("Revert error", e);
            showToast(getErrorMessage(e), 'error');
            return false;
        }
    };

    // Called by the Card Action
    const handleDeleteOrderClick = (orderId: string) => {
        setOrderToDelete(orderId);
        setIsDeleteModalOpen(true);
    };

    // Actual Delete Logic
    const handleConfirmDeleteOrder = async (password: string) => {
        if (!supabase || !orderToDelete) return;
        
        try {
            // Verify Password
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: currentUser?.email || '',
                password: password
            });

            if (authError) {
                throw new Error('كلمة المرور غير صحيحة');
            }

            const { error } = await supabase.from('Orders').delete().eq('id', orderToDelete);
            if (error) throw error;
            
            setOrders(prev => prev.filter(o => o.id !== orderToDelete));
            showToast(t('success'), 'success');
            setIsDeleteModalOpen(false);
            setOrderToDelete(null);
        } catch (e: any) {
            showToast(getErrorMessage(e), 'error');
        }
    };

    const handleCancelOrder = async (orderId: string) => {
        if (!supabase) return;
        const user = currentUser?.username || 'System';
        try {
            const order = orders.find(o => o.id === orderId);
            if (!order) return;

            const updates = {
                status: OrderStatus.CANCELLED,
                history: [...(order.history || []), { 
                    timestamp: new Date().toISOString(), 
                    activity: 'Order Cancelled', 
                    user 
                }]
            };

            const { data, error } = await supabase.from('Orders').update(updates).eq('id', orderId).select().single();
            if (error) throw error;

            setOrders(prev => prev.map(o => o.id === orderId ? mapDBToOrder(data) : o));
            showToast(t('success'), 'success');
        } catch (e: any) {
            showToast(getErrorMessage(e), 'error');
        }
    };

    const handleSplitOrder = async (originalOrderId: string, splitDetails: { quantity: number; trackingNumber: string; globalOrderId?: string; priceAdjustment?: number; }) => {
        if (!supabase) return;
        const user = currentUser?.username || 'System';
        
        try {
            const original = orders.find(o => o.id === originalOrderId);
            if (!original) return;

            const remainingQty = original.quantity - splitDetails.quantity;
            const remainingPrice = (original.price || 0) - (splitDetails.priceAdjustment || 0);

            const { data: updatedOriginal, error: updateError } = await supabase.from('Orders').update({
                quantity: remainingQty,
                price: remainingPrice,
                history: [...(original.history || []), { 
                    timestamp: new Date().toISOString(), 
                    activity: `Splitted: ${splitDetails.quantity} items removed to new order`, 
                    user 
                }]
            }).eq('id', originalOrderId).select().single();

            if (updateError) throw updateError;

            const newOrderPayload: any = {
                ...updatedOriginal,
                id: undefined,
                created_at: undefined,
                local_order_id: `${original.localOrderId}-B`,
                quantity: splitDetails.quantity,
                price: splitDetails.priceAdjustment,
                tracking_number: splitDetails.trackingNumber,
                global_order_id: splitDetails.globalOrderId,
                history: [{ 
                    timestamp: new Date().toISOString(), 
                    activity: `Created via splitting from ${original.localOrderId}`, 
                    user 
                }]
            };
            delete newOrderPayload.id;
            delete newOrderPayload.created_at;

            const { data: newOrder, error: insertError } = await supabase.from('Orders').insert(newOrderPayload).select().single();
            if (insertError) throw insertError;

            setOrders(prev => {
                const list = prev.map(o => o.id === originalOrderId ? mapDBToOrder(updatedOriginal) : o);
                return [mapDBToOrder(newOrder), ...list];
            });

            showToast(t('success'), 'success');
            setSplitModalOpen(false);
        } catch (e: any) {
            showToast(getErrorMessage(e), 'error');
        }
    };

    const handleConfirmPayment = async (orderId: string, paymentDetails: { amountPaid: number, localDeliveryCost: number, receiptImages: string[] }) => {
        if (!supabase) return;
        const user = currentUser?.username || 'System';
        
        try {
            // 1. Fetch absolutely latest data from DB to ensure we have all previous receipts
            const { data: latestOrder, error: fetchError } = await supabase
                .from('Orders')
                .select('receipt_images, receipt_image, history, amount_paid')
                .eq('id', orderId)
                .single();
                
            if (fetchError) throw fetchError;

            // 2. Safely merge arrays
            const currentReceipts: string[] = (latestOrder.receipt_images as string[]) || (latestOrder.receipt_image ? [latestOrder.receipt_image] : []);
            const updatedReceiptImages = [...currentReceipts, ...paymentDetails.receiptImages];

            // 3. Prepare Update Payload
            const dbPayload = {
                amount_paid: paymentDetails.amountPaid,
                local_delivery_cost: paymentDetails.localDeliveryCost,
                receipt_images: updatedReceiptImages,
                // Keep single column synced for legacy/display purposes
                receipt_image: updatedReceiptImages.length > 0 ? updatedReceiptImages[updatedReceiptImages.length - 1] : latestOrder.receipt_image,
                history: [...(latestOrder.history || []), { 
                    timestamp: new Date().toISOString(), 
                    activity: `Payment Update: Total now ${paymentDetails.amountPaid} MRU (Receipt Added)`, 
                    user 
                }]
            };

            // 4. Update Database
            const { data, error } = await supabase.from('Orders').update(dbPayload).eq('id', orderId).select().single();
            if (error) throw error;

            // 5. Update Local State
            setOrders(prev => prev.map(o => o.id === orderId ? mapDBToOrder(data) : o));
            showToast(t('success'), 'success');
            setPaymentModalOpen(false);
        } catch (e: any) {
            showToast(getErrorMessage(e), 'error');
        }
    };

    // --- WhatsApp Notification Logic with Smart Structure ---
    const handleProcessNotification = async (lang: NotificationLanguage) => {
        if (!notificationOrder || !supabase) return;
        
        const client = clients.find(c => c.id === notificationOrder.clientId);
        if (!client) {
            showToast('العميل غير موجود', 'error');
            return;
        }

        const template = settings.whatsappTemplates?.[lang] || settings.whatsappTemplates?.['ar'] || '';
        
        // --- 1. Calculate Financials ---
        const productPrice = Math.round(Number(notificationOrder.priceInMRU || 0) + Number(notificationOrder.commission || 0));
        const paidSoFar = Math.round(Number(notificationOrder.amountPaid || 0));
        const shippingCost = Math.round(Number(notificationOrder.shippingCost || 0));
        
        // Calculate Product Remaining Logic
        // Logic: Pay product first, then shipping.
        // Product Remaining = Max(0, ProductPrice - Paid)
        const productRemaining = Math.max(0, productPrice - paidSoFar);
        
        // Total Due = (Product Remaining) + Shipping Cost
        // OR simply: (Product + Shipping) - Paid
        const totalDue = Math.max(0, (productPrice + shippingCost) - paidSoFar);

        // --- 2. Build Text Blocks ---
        
        // Greetings
        let greeting = "";
        if (lang === 'ar') greeting = client.gender === 'female' ? "السيدة" : "السيد";
        else if (lang === 'fr') greeting = client.gender === 'female' ? "Mme" : "M.";
        else greeting = client.gender === 'female' ? "Ms." : "Mr.";

        // Shipping Type
        let shippingTypeStr = "";
        if (notificationOrder.shippingType === ShippingType.FAST) {
            if (lang === 'ar') shippingTypeStr = "سريع (جوي)";
            else if (lang === 'fr') shippingTypeStr = "Rapide (Aérien)";
            else shippingTypeStr = "Fast (Air)";
        } else {
            if (lang === 'ar') shippingTypeStr = "عادي (بحري)";
            else if (lang === 'fr') shippingTypeStr = "Normal (Maritime)";
            else shippingTypeStr = "Normal (Sea)";
        }

        // Product Remaining Line (Conditional)
        let productRemainingLine = "";
        if (productRemaining > 0) {
            if (lang === 'ar') productRemainingLine = `🔹 المتبقي من سعر المنتج: ${productRemaining.toLocaleString()} MRU`;
            else if (lang === 'fr') productRemainingLine = `🔹 Reste du produit : ${productRemaining.toLocaleString()} MRU`;
            else productRemainingLine = `🔹 Remaining Product: ${productRemaining.toLocaleString()} MRU`;
        }

        // --- 3. Replace Placeholders ---
        // IMPORTANT: Also remove {loyaltyMessage} and {productRemaining} old placeholders if they exist
        let message = template
            .replace(/{clientName}/g, client.name)
            .replace(/{orderId}/g, notificationOrder.localOrderId)
            .replace(/{location}/g, notificationOrder.storageLocation || 'المخزن')
            .replace(/{weight}/g, `${notificationOrder.weight || 0}`)
            .replace(/{shippingType}/g, shippingTypeStr)
            .replace(/{shippingCost}/g, `${shippingCost.toLocaleString()}`)
            .replace(/{productRemainingLine}/g, productRemainingLine)
            .replace(/{productRemaining}/g, productRemainingLine) // Fallback replacement
            .replace(/{loyaltyMessage}/g, '') // Clear any loyalty message placeholder in basic notification
            .replace(/{totalDue}/g, `${totalDue.toLocaleString()}`)
            .replace(/{greeting}/g, greeting)
            .replace(/{companyName}/g, companyInfo.name);

        // Clean up empty lines resulting from empty productRemainingLine
        message = message.replace(/\n\s*\n/g, '\n\n').trim();

        const whatsappUrl = `https://wa.me/${client.whatsappNumber || client.phone}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');

        // Update DB to mark notification sent
        try {
            await supabase.from('Orders').update({ whatsapp_notification_sent: true }).eq('id', notificationOrder.id);
            setOrders(prev => prev.map(o => o.id === notificationOrder.id ? { ...o, whatsappNotificationSent: true } : o));
        } catch (e) {
            console.error("Failed to update notification status", e);
        }
        
        setNotificationOrder(null);
    };

    return (
        <div className="space-y-6 w-full max-w-full overflow-x-hidden">
            <PasswordConfirmationModal 
                isOpen={isDeleteModalOpen}
                onClose={() => { setIsDeleteModalOpen(false); setOrderToDelete(null); }}
                onConfirm={handleConfirmDeleteOrder}
                title={t('confirmDelete')}
                message={t('deleteWarning')}
                confirmButtonColor="bg-red-600"
            />

            <OrderFormModal 
                isOpen={isFormModalOpen} 
                onClose={() => setFormModalOpen(false)} 
                onSave={handleSaveOrder} 
                order={selectedOrder} 
                clients={clients} 
                stores={stores} 
                currencies={currencies} 
                commissionRate={settings.commissionRate}
                orders={orders}
                settings={settings}
            />

            <OrderStatusModal 
                isOpen={isStatusModalOpen} 
                onClose={() => setStatusModalOpen(false)} 
                order={selectedOrder} 
                allOrders={orders}
                drawers={drawers}
                clients={clients}
                onUpdate={handleUpdateStatus}
                onRevert={handleRevert}
                shippingCompanies={shippingCompanies}
                settings={settings}
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
                onSplit={handleSplitOrder} 
                order={selectedOrder}
            />

            <HistoryLogModal 
                isOpen={isHistoryModalOpen} 
                onClose={() => setHistoryModalOpen(false)} 
                history={selectedOrder?.history} 
                title={t('history')} 
            />

            <PaymentModal 
                isOpen={isPaymentModalOpen} 
                onClose={() => setPaymentModalOpen(false)} 
                onConfirm={handleConfirmPayment} 
                order={selectedOrder}
            />

            <NotificationLanguageModal 
                isOpen={!!notificationOrder}
                onClose={() => setNotificationOrder(null)}
                onConfirm={handleProcessNotification}
            />

            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <ListOrdered className="text-primary"/> {t('manageOrders')}
                </h2>
                <div className="flex gap-2 w-full md:w-auto">
                    {currentUser?.permissions.orders.create && (
                        <button onClick={() => { setSelectedOrder(null); setFormModalOpen(true); }} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl shadow-lg hover:bg-primary-dark transition-all transform hover:scale-105 active:scale-95 font-bold">
                            <Plus size={20}/> {t('newOrder')}
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row gap-4 w-full">
                <div className="relative flex-grow w-full">
                    <input 
                        type="text" 
                        placeholder={t('searchPlaceholder')} 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-xl focus:ring-2 focus:ring-primary text-sm min-w-0"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                </div>

                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="p-2 bg-gray-50 dark:bg-gray-700 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary flex-1 md:flex-none">
                        <option value="all">{t('allStatuses')}</option>
                        {Object.values(OrderStatus).map(status => (
                            <option key={status} value={status}>{t(STATUS_DETAILS[status]?.name as any)}</option>
                        ))}
                    </select>
                    <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)} className="p-2 bg-gray-50 dark:bg-gray-700 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary flex-1 md:flex-none">
                        <option value="all">{t('allStores')}</option>
                        {stores.map(store => (
                            <option key={store.id} value={store.id}>{store.name}</option>
                        ))}
                    </select>
                </div>

                {(searchTerm || statusFilter !== 'all' || storeFilter !== 'all') && (
                    <button onClick={() => { setSearchTerm(''); setStatusFilter('all'); setStoreFilter('all'); clearFilter(); }} className="px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors font-bold flex items-center gap-1">
                        <X size={16}/> {t('clearFilter')}
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full">
                {filteredOrders.length > 0 ? filteredOrders.map(order => (
                    <OrderCard 
                        key={order.id} 
                        order={order} 
                        client={clients.find(c => c.id === order.clientId)}
                        store={stores.find(s => s.id === order.storeId)}
                        users={users}
                        settings={settings}
                        companyInfo={companyInfo}
                        onEdit={() => { setSelectedOrder(order); setFormModalOpen(true); }}
                        onDelete={() => handleDeleteOrderClick(order.id)}
                        onCancel={() => handleCancelOrder(order.id)}
                        onChangeStatus={() => { setSelectedOrder(order); setStatusModalOpen(true); }}
                        onUpdatePayment={() => { setSelectedOrder(order); setPaymentModalOpen(true); }}
                        onHistory={() => { setSelectedOrder(order); setHistoryModalOpen(true); }}
                        onView={() => { setSelectedOrder(order); setDetailsModalOpen(true); }}
                        onSplit={() => { setSelectedOrder(order); setSplitModalOpen(true); }}
                        onPrintInvoice={(order) => { setSelectedOrder(order); setDetailsModalOpen(true); }}
                        onSendNotification={(orderToNotify) => setNotificationOrder(orderToNotify)}
                        onShareInvoice={() => { /* Implement Invoice Share */ }}
                        searchTerm={searchTerm}
                    />
                )) : (
                    <div className="col-span-full py-20 text-center text-gray-400">
                        <ListOrdered size={64} className="mx-auto mb-4 opacity-10"/>
                        <p>{t('noOrdersFound')}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrdersPage;
