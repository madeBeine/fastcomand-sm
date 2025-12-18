
import React, { useContext, useState, useEffect, useMemo } from 'react';
import type { Order, Client, Store, Shipment, GlobalActivityLog, AppSettings, Currency } from '../types';
import { OrderStatus, ShipmentStatus, ShippingType } from '../types';
import { 
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
    PieChart, Pie, Cell, CartesianGrid, AreaChart, Area, ComposedChart, Legend, LineChart, Line
} from 'recharts';
import { 
    TrendingUp, DollarSign, Clock, 
    Activity, ArrowUpRight, ArrowDownRight, Calendar, 
    FileText, Wallet,
    BellRing, Hash, Scale, Store as StoreIcon, Truck, Percent,
    Container, Anchor, Warehouse, Plus, Globe, MessageCircle, ChevronDown, ChevronUp, Calculator,
    ListOrdered, ShoppingCart, MapPin, PackageCheck, CheckCircle2, CircleDashed, Bike, Search, AlertTriangle, Zap, Plane, RefreshCw, Info, HelpCircle, X, Filter, Table2
} from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import QuickCalculator from './QuickCalculator';
import { supabase } from '../supabaseClient'; 

interface DashboardProps {
  orders: Order[];
  clients: Client[];
  stores: Store[];
  shipments: Shipment[];
  onFilterClick: (filter: string) => void;
  globalActivityLog: GlobalActivityLog[];
  onNewOrder: () => void;
  settings: AppSettings;
  currencies: Currency[];
  isLoading?: boolean;
}

const fmtNum = (num: number) => num.toLocaleString('en-US');
const fmtCurrency = (num: number) => Math.round(num).toLocaleString('en-US');

// --- Tooltip Component (Fixed Visibility) ---
const InfoTooltip: React.FC<{ text: string }> = ({ text }) => (
    <div className="group relative inline-block ml-1 z-50"> 
        <HelpCircle size={14} className="text-gray-400 hover:text-primary cursor-help transition-colors" />
        {/* Increased width, adjusted positioning, and added high z-index to prevent clipping */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-2xl text-center leading-relaxed border border-gray-700 z-[9999]">
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
        </div>
    </div>
);

// --- Financial Analysis Modal ---
interface AnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    metricType: 'profit' | 'flow' | 'debt' | 'delivery' | 'shippingDebt';
    orders: Order[];
    colorClass: string;
}

const FinancialAnalysisModal: React.FC<AnalysisModalProps> = ({ isOpen, onClose, title, metricType, orders, colorClass }) => {
    const { t } = useLanguage();
    const [filterType, setFilterType] = useState<'today' | 'week' | 'month' | 'year' | 'all'>('year');

    // Filter Logic (Moved ABOVE the early return to comply with Rules of Hooks)
    const filteredOrders = useMemo(() => {
        const now = new Date();
        return orders.filter(o => {
            const d = new Date(o.orderDate);
            if (filterType === 'all') return true;
            if (filterType === 'today') return d.toDateString() === now.toDateString();
            if (filterType === 'week') {
                const weekAgo = new Date(now.setDate(now.getDate() - 7));
                return d >= weekAgo;
            }
            if (filterType === 'month') return d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
            if (filterType === 'year') return d.getFullYear() === new Date().getFullYear();
            return true;
        }).sort((a,b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime());
    }, [orders, filterType]);

    // Calculation Logic based on Metric Type
    const calculateValue = (o: Order) => {
        const commission = Number(o.commission || 0);
        const shipping = Number(o.shippingCost || 0);
        const price = Number(o.priceInMRU || 0);
        const delivery = Number(o.localDeliveryCost || 0);
        const paid = Number(o.amountPaid || 0);
        const totalOrder = price + commission + shipping + delivery;

        switch (metricType) {
            case 'profit': return commission;
            case 'flow': return price + commission + shipping;
            case 'delivery': return delivery;
            case 'debt': return Math.max(0, totalOrder - paid);
            case 'shippingDebt': return (totalOrder - paid) > 0 ? shipping : 0;
            default: return 0;
        }
    };

    const totalValue = filteredOrders.reduce((sum, o) => sum + calculateValue(o), 0);

    // Chart & Table Data Preparation
    const isMonthlyView = filterType === 'year' || filterType === 'all';

    const aggregatedData = useMemo(() => {
        const grouped: Record<string, { value: number; count: number; rawDate: Date }> = {};
        
        filteredOrders.forEach(o => {
            const dateObj = new Date(o.orderDate);
            let key = '';
            
            if (isMonthlyView) {
                const month = dateObj.getMonth() + 1;
                const year = dateObj.getFullYear();
                key = `${year}-${String(month).padStart(2, '0')}`;
            } else {
                key = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            }

            if (!grouped[key]) {
                grouped[key] = { value: 0, count: 0, rawDate: dateObj };
            }
            grouped[key].value += calculateValue(o);
            grouped[key].count += 1;
        });

        return Object.entries(grouped)
            .map(([key, data]) => ({
                key: key,
                name: isMonthlyView 
                    ? data.rawDate.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }) 
                    : key,
                value: data.value,
                count: data.count,
                rawKey: key 
            }))
            .sort((a, b) => a.rawKey.localeCompare(b.rawKey));
            
    }, [filteredOrders, metricType, isMonthlyView]);

    // Checks done, now we can return null if not open
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
                    <h3 className="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                        <Activity className={colorClass.replace('bg-', 'text-').replace('600', '500').replace('500', '500')} /> 
                        تحليل تفصيلي: {title}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X size={20}/></button>
                </div>

                {/* Filters */}
                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 flex gap-2 overflow-x-auto border-b dark:border-gray-700">
                    {(['today', 'week', 'month', 'year', 'all'] as const).map(f => (
                        <button 
                            key={f} 
                            onClick={() => setFilterType(f)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                                filterType === f 
                                ? 'bg-white dark:bg-gray-700 text-primary shadow-sm ring-1 ring-primary/20' 
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                        >
                            {f === 'today' && 'اليوم'}
                            {f === 'week' && 'هذا الأسبوع'}
                            {f === 'month' && 'هذا الشهر'}
                            {f === 'year' && 'شهري (سنة)'}
                            {f === 'all' && 'شهري (الكل)'}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="p-6 flex-grow overflow-y-auto custom-scrollbar">
                    <div className="flex flex-col md:flex-row gap-6 mb-6">
                        <div className="flex-1 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 p-5 rounded-2xl border dark:border-gray-600 flex flex-col justify-center items-center text-center">
                            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">المجموع للفترة المحددة</span>
                            <span className={`text-4xl font-black font-mono ${colorClass.replace('bg-', 'text-').replace('600', '600').replace('500', '500')}`}>
                                {fmtCurrency(totalValue)}
                            </span>
                            <span className="text-xs text-gray-400 mt-2">MRU</span>
                        </div>
                        <div className="flex-1 bg-white dark:bg-gray-800 p-5 rounded-2xl border dark:border-gray-700 flex flex-col justify-center items-center text-center">
                            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">عدد الطلبات</span>
                            <span className="text-3xl font-black text-gray-800 dark:text-gray-200">
                                {filteredOrders.length}
                            </span>
                            <span className="text-xs text-gray-400 mt-2">طلب</span>
                        </div>
                    </div>

                    <div className="h-64 w-full mb-8">
                        <h4 className="text-sm font-bold text-gray-500 mb-4 flex items-center gap-2">
                            <TrendingUp size={16}/> {isMonthlyView ? 'التوزيع الشهري' : 'الرسم البياني اليومي'}
                        </h4>
                        <ResponsiveContainer width="100%" height="100%">
                            {isMonthlyView ? (
                                <BarChart data={aggregatedData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                    <XAxis dataKey="name" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                                    <YAxis tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff'}} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                                    <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
                                </BarChart>
                            ) : (
                                <AreaChart data={aggregatedData}>
                                    <defs>
                                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                    <XAxis dataKey="name" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                                    <YAxis tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff'}} />
                                    <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                                </AreaChart>
                            )}
                        </ResponsiveContainer>
                    </div>

                    {/* Detailed Table for Monthly View */}
                    {isMonthlyView && (
                        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                            <div className="bg-gray-50 dark:bg-gray-900/50 p-3 border-b dark:border-gray-700 flex items-center gap-2 font-bold text-sm">
                                <Table2 size={16}/> جدول التفاصيل (للتسليم)
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 dark:text-gray-400">
                                        <tr>
                                            <th className="px-4 py-3 text-right">الفترة (الشهر)</th>
                                            <th className="px-4 py-3 text-center">عدد الطلبات</th>
                                            <th className="px-4 py-3 text-right">المبلغ (MRU)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {aggregatedData.map((row, idx) => (
                                            <tr key={idx} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                <td className="px-4 py-3 font-bold text-gray-900 dark:text-white text-right">{row.name}</td>
                                                <td className="px-4 py-3 text-center text-gray-500">{row.count}</td>
                                                <td className="px-4 py-3 font-mono font-bold text-primary dark:text-secondary-light text-right">{fmtCurrency(row.value)}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-gray-100 dark:bg-gray-900/50 font-bold border-t-2 border-gray-200 dark:border-gray-600">
                                            <td className="px-4 py-3 text-right">الإجمالي الكلي</td>
                                            <td className="px-4 py-3 text-center">{filteredOrders.length}</td>
                                            <td className="px-4 py-3 text-right text-green-600">{fmtCurrency(totalValue)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- Enhanced Stat Card ---
const StatCard: React.FC<{ 
    title: string; 
    value: number; 
    monthlyValue: number;
    icon: React.ReactNode; 
    colorClass: string;
    onClick: () => void;
    action?: React.ReactNode;
    tooltip?: string;
}> = ({ title, value, monthlyValue, icon, colorClass, onClick, action, tooltip }) => (
    <div 
        onClick={onClick}
        className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 relative group hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer"
    >
        {/* Subtle Background Icon */}
        <div className={`absolute -right-4 -bottom-4 opacity-[0.03] transform rotate-12 scale-150 text-gray-900 dark:text-white pointer-events-none z-0`}>
            {icon}
        </div>

        <div className="flex justify-between items-start z-10 relative">
            <div className="flex-1">
                <div className="flex items-center mb-2 relative z-20">
                    <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider">{title}</p>
                    {tooltip && <InfoTooltip text={tooltip} />}
                </div>
                <div className="flex flex-col relative z-10">
                    <div className="flex items-baseline gap-1">
                        <h3 className="text-2xl font-black text-gray-900 dark:text-white font-mono tracking-tight">{fmtCurrency(value)}</h3>
                        <span className="text-[10px] font-semibold text-gray-400">MRU</span>
                    </div>
                    
                    {/* Monthly Stat */}
                    <div className="mt-1 flex items-center gap-1.5 text-xs font-medium">
                        <div className={`w-1.5 h-1.5 rounded-full ${monthlyValue > 0 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span className="text-gray-500 dark:text-gray-400">هذا الشهر: </span>
                        <span className={`font-mono font-bold ${monthlyValue > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                            {fmtCurrency(monthlyValue)}
                        </span>
                    </div>

                    {action && <div className="mt-2 relative z-20" onClick={e => e.stopPropagation()}>{action}</div>}
                </div>
            </div>
            <div className={`p-2.5 rounded-xl ${colorClass} text-white shadow-lg shadow-gray-200/50 dark:shadow-none bg-opacity-90 relative z-10`}>
                {icon}
            </div>
        </div>
    </div>
);

const CurrencyTicker: React.FC<{ currencies: Currency[]; settings: AppSettings }> = ({ currencies }) => {
    const [liveRates, setLiveRates] = useState<Record<string, number>>({});
    
    useEffect(() => {
        const fetchRates = async () => {
            try {
                const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
                if (res.ok) {
                    const data = await res.json();
                    const rates = data.rates;
                    const systemUsd = currencies.find(c => c.code === 'USD');
                    const baseUsdToMru = rates['MRU'] || (systemUsd ? systemUsd.rate : 39.8); 
                    const calculatedRates: Record<string, number> = {};
                    const targets = ['USD', 'EUR', 'CNY', 'GBP', 'TRY', 'AED'];
                    targets.forEach(code => {
                        if (code === 'USD') calculatedRates[code] = baseUsdToMru;
                        else if (rates[code]) calculatedRates[code] = (1 / rates[code]) * baseUsdToMru;
                    });
                    setLiveRates(calculatedRates);
                }
            } catch (e) { console.error("Failed to fetch live rates", e); }
        };
        fetchRates();
    }, [currencies]);

    return (
        <div className="flex flex-col md:flex-row gap-2 text-xs font-mono mb-4" dir="ltr">
            <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 px-3 py-2 flex items-center gap-4 overflow-x-auto shadow-sm flex-1 scrollbar-hide">
                <span className="text-primary font-bold whitespace-nowrap flex items-center gap-1"><DollarSign size={12}/> System Rates:</span>
                {currencies.map(c => (
                    <span key={c.id} className="whitespace-nowrap"><b className="text-gray-700 dark:text-gray-300">{c.code}</b> <span className="text-primary font-bold">{c.rate}</span></span>
                ))}
            </div>
            <div className="bg-slate-900 text-white rounded-lg px-3 py-2 flex items-center gap-4 overflow-x-auto shadow-sm flex-1 scrollbar-hide border border-slate-700">
                <span className="text-green-400 font-bold whitespace-nowrap flex items-center gap-1"><Globe size={12}/> Live Market:</span>
                {Object.entries(liveRates).map(([code, rate]) => (
                    <span key={code} className="whitespace-nowrap"><b className="text-gray-400">{code}</b> <span className="text-green-400 font-bold">{(rate as number).toFixed(2)}</span></span>
                ))}
            </div>
        </div>
    );
};

const UrgentChip: React.FC<{
    label: string;
    count: number;
    icon: React.ReactNode;
    colorBase: string; // e.g. 'red', 'orange'
    onClick: () => void;
}> = ({ label, count, icon, colorBase, onClick }) => {
    // Dynamic tailwind classes based on colorBase prop
    const bgClass = `bg-${colorBase}-100 dark:bg-${colorBase}-900/30`;
    const textClass = `text-${colorBase}-700 dark:text-${colorBase}-300`;
    const borderClass = `border-${colorBase}-200 dark:border-${colorBase}-800`;

    if (count === 0) return null;

    return (
        <button 
            onClick={onClick}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-transform hover:scale-105 ${bgClass} ${textClass} ${borderClass}`}
        >
            {icon}
            <span>{label}</span>
            <span className="bg-white dark:bg-slate-800 px-1.5 rounded-md shadow-sm ml-1">{count}</span>
        </button>
    );
};

const StatusBox: React.FC<{
    title: string;
    count: number;
    icon: React.ReactNode;
    color: string;
    onClick?: () => void;
}> = ({ title, count, icon, color, onClick }) => {
    const styles: Record<string, string> = {
        blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
        indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-800',
        purple: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800',
        pink: 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800',
        cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-300 dark:border-cyan-800',
        green: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
        gray: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
    };
    const activeStyle = styles[color] || styles.gray;

    return (
        <button onClick={onClick} className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all hover:scale-[1.02] hover:shadow-sm w-full group ${activeStyle}`}>
            <div className="mb-1 opacity-80">{icon}</div>
            <span className="text-xl font-black font-mono tracking-tight">{count}</span>
            <span className="text-[10px] font-bold opacity-80">{title}</span>
        </button>
    );
};

const Dashboard: React.FC<DashboardProps> = ({ orders, stores, shipments, onFilterClick, onNewOrder, settings, currencies, isLoading }) => {
    const { currentUser } = useContext(AuthContext);
    const { t } = useLanguage();
    const [showCalculator, setShowCalculator] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const [isResetting, setIsResetting] = useState(false);
    
    // Modal State
    const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
    const [selectedMetric, setSelectedMetric] = useState<{type: 'profit'|'flow'|'debt'|'delivery'|'shippingDebt', title: string, color: string} | null>(null);

    // --- Permissions ---
    // Hide financials for non-admins (employees/viewers)
    const showFinancials = currentUser?.role === 'admin';

    // --- Logic & Filtering ---
    const urgentStats = {
        notOrdered: orders.filter(o => o.status === OrderStatus.NEW).length,
        missingTracking: orders.filter(o => o.status === OrderStatus.ORDERED && !o.trackingNumber).length,
        awaitingWeight: orders.filter(o => o.status === OrderStatus.ARRIVED_AT_OFFICE && (!o.weight || o.weight === 0)).length,
    };

    const statusCounts = {
        total: orders.length,
        ordered: orders.filter(o => o.status === OrderStatus.ORDERED).length,
        shipped: orders.filter(o => o.status === OrderStatus.SHIPPED_FROM_STORE).length,
        arrived: orders.filter(o => o.status === OrderStatus.ARRIVED_AT_OFFICE).length,
        stored: orders.filter(o => o.status === OrderStatus.STORED).length,
        completed: orders.filter(o => o.status === OrderStatus.COMPLETED).length,
    };

    // Pre-Arrival Shipping Stats (Only New, Ordered, Shipped)
    const preArrivalOrders = orders.filter(o => 
        [OrderStatus.NEW, OrderStatus.ORDERED, OrderStatus.SHIPPED_FROM_STORE].includes(o.status)
    );
    const shippingStats = {
        fast: preArrivalOrders.filter(o => o.shippingType === ShippingType.FAST).length,
        normal: preArrivalOrders.filter(o => o.shippingType === ShippingType.NORMAL).length
    };

    // --- Financials (ACCURATE CALCULATION) ---
    // Helper to calculate totals for a set of orders
    const calculateStats = (ordersSubset: Order[]) => {
        return ordersSubset.reduce((acc, o) => {
            const commission = Number(o.commission || 0);
            const shipping = Number(o.shippingCost || 0);
            const price = Number(o.priceInMRU || 0);
            const delivery = Number(o.localDeliveryCost || 0);
            const paid = Number(o.amountPaid || 0);
            const total = price + commission + shipping + delivery;
            
            acc.profit += commission;
            acc.cashFlow += (price + commission + shipping);
            acc.delivery += delivery;
            acc.debt += Math.max(0, total - paid);
            if ((total - paid) > 0) acc.shippingDebt += shipping;
            
            return acc;
        }, { profit: 0, cashFlow: 0, delivery: 0, debt: 0, shippingDebt: 0 });
    };

    // 1. Total Stats (All valid orders)
    const validOrders = orders.filter(o => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.NEW);
    const totalStats = calculateStats(validOrders);

    // 2. Monthly Stats
    const currentMonthOrders = validOrders.filter(o => {
        const d = new Date(o.orderDate);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthlyStats = calculateStats(currentMonthOrders);

    // --- Charts Data ---
    const last7Days = Array.from({length: 7}, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
    }).reverse();

    const chartData = last7Days.map(date => {
        const dailyOrders = orders.filter(o => o.orderDate === date);
        const income = dailyOrders.reduce((sum, o) => sum + Number(o.commission || 0) + Number(o.shippingCost || 0), 0); 
        return { 
            date: new Date(date).toLocaleDateString('en-GB', {weekday: 'short'}), 
            orders: dailyOrders.length,
            income: income 
        };
    });

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchValue.trim()) {
            onFilterClick(searchValue.trim());
        }
    };

    const handleResetDeliveryFund = async () => {
        if (!supabase) return;
        if (!confirm("هل أنت متأكد من تصفير صندوق التوصيل؟ سيتم تصفير تكلفة التوصيل للطلبات المكتملة فقط، مما يعني أنه تم استلام المبلغ.")) return;
        
        setIsResetting(true);
        try {
            const { error } = await supabase
                .from('Orders')
                .update({ local_delivery_cost: 0 })
                .eq('status', OrderStatus.COMPLETED)
                .gt('local_delivery_cost', 0);

            if (error) throw error;
        } catch (error) {
            console.error("Error resetting delivery fund:", error);
            alert("حدث خطأ أثناء التصفير.");
        } finally {
            setIsResetting(false);
        }
    };

    const handleOpenAnalysis = (type: 'profit'|'flow'|'debt'|'delivery'|'shippingDebt', title: string, color: string) => {
        setSelectedMetric({ type, title, color });
        setAnalysisModalOpen(true);
    };

    if (isLoading && orders.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin text-primary"><Search size={32}/></div>
            </div>
        );
    }

    return (
        <div className="space-y-5 pb-10 animate-in fade-in duration-500">
            
            {/* Modal - Conditionally Rendered to Unmount completely on close */}
            {analysisModalOpen && selectedMetric && (
                <FinancialAnalysisModal 
                    isOpen={analysisModalOpen}
                    onClose={() => setAnalysisModalOpen(false)}
                    title={selectedMetric.title}
                    metricType={selectedMetric.type}
                    orders={validOrders}
                    colorClass={selectedMetric.color}
                />
            )}

            {/* 1. Action Area: New Order + Smart Search (Top Section) */}
            <div className="flex flex-col md:flex-row gap-3">
                {currentUser?.permissions.orders.create && (
                    <button 
                        onClick={onNewOrder} 
                        className="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/30 transition-all active:scale-95 flex items-center justify-center gap-2 md:w-auto w-full"
                    >
                        <Plus size={20} strokeWidth={3}/>
                        <span>{t('newOrder')}</span>
                    </button>
                )}
                
                <form onSubmit={handleSearchSubmit} className="flex-1 relative group">
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-primary transition-colors">
                        <Search size={20} />
                    </div>
                    <input 
                        type="text" 
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        placeholder="بحث ذكي... (رقم الطلب، العميل، التتبع)"
                        className="w-full h-full min-h-[48px] pr-10 pl-4 bg-white dark:bg-gray-800 border-2 border-transparent focus:border-primary/50 rounded-xl shadow-sm focus:shadow-md focus:outline-none transition-all font-medium text-gray-700 dark:text-gray-200 placeholder-gray-400"
                    />
                </form>
            </div>

            {/* 2. Urgent Cases (Compact) */}
            <div className="flex flex-wrap gap-2">
                <UrgentChip 
                    label="طلبات لم تُطلب" 
                    count={urgentStats.notOrdered} 
                    icon={<CircleDashed size={14}/>} 
                    colorBase="orange"
                    onClick={() => onFilterClick(OrderStatus.NEW)}
                />
                <UrgentChip 
                    label="نقص رقم تتبع" 
                    count={urgentStats.missingTracking} 
                    icon={<Hash size={14}/>} 
                    colorBase="red"
                    onClick={() => onFilterClick('needs_tracking')}
                />
                <UrgentChip 
                    label="بانتظار الوزن" 
                    count={urgentStats.awaitingWeight} 
                    icon={<Scale size={14}/>} 
                    colorBase="purple"
                    onClick={() => onFilterClick(OrderStatus.ARRIVED_AT_OFFICE)}
                />
            </div>

            {/* 3. Rates & Calculator */}
            <div>
                <CurrencyTicker currencies={currencies} settings={settings} />
                
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
                    <button 
                        onClick={() => setShowCalculator(!showCalculator)}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors text-sm font-bold text-gray-700 dark:text-gray-300"
                    >
                        <span className="flex items-center gap-2"><Calculator size={16}/> {t('calculator')}</span>
                        {showCalculator ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                    </button>
                    
                    {showCalculator && (
                        <div className="p-4 bg-white dark:bg-gray-800 border-t dark:border-gray-700 animate-in slide-in-from-top-2">
                            <QuickCalculator currencies={currencies} settings={settings} />
                        </div>
                    )}
                </div>
            </div>

            {/* 4. Order Status Counts (Grid) */}
            <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">حالات الطلبات</h4>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    <StatusBox title="الكل" count={statusCounts.total} icon={<ListOrdered size={18}/>} color="gray" onClick={() => onFilterClick('all')}/>
                    <StatusBox title="تم الطلب" count={statusCounts.ordered} icon={<ShoppingCart size={18}/>} color="indigo" onClick={() => onFilterClick(OrderStatus.ORDERED)}/>
                    <StatusBox title="شحن (متجر)" count={statusCounts.shipped} icon={<Truck size={18}/>} color="blue" onClick={() => onFilterClick(OrderStatus.SHIPPED_FROM_STORE)}/>
                    <StatusBox title="وصل المكتب" count={statusCounts.arrived} icon={<MapPin size={18}/>} color="pink" onClick={() => onFilterClick(OrderStatus.ARRIVED_AT_OFFICE)}/>
                    <StatusBox title="بالمخزن" count={statusCounts.stored} icon={<PackageCheck size={18}/>} color="cyan" onClick={() => onFilterClick(OrderStatus.STORED)}/>
                    <StatusBox title="مكتمل" count={statusCounts.completed} icon={<CheckCircle2 size={18}/>} color="green" onClick={() => onFilterClick(OrderStatus.COMPLETED)}/>
                </div>
            </div>

            {/* 5. Shipping Types (Pre-Arrival) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                        <Truck size={16} className="text-primary"/> شحن قادم (قبل الوصول)
                    </h4>
                    <div className="flex gap-4">
                        <div className="flex-1 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-100 dark:border-red-900/50 flex items-center justify-between">
                            <div>
                                <span className="block text-xs font-bold text-red-600 dark:text-red-400">سريع (جوي)</span>
                                <span className="text-[10px] text-gray-500">مستعجل</span>
                            </div>
                            <span className="text-2xl font-black text-red-700 dark:text-red-300 font-mono">{shippingStats.fast}</span>
                        </div>
                        <div className="flex-1 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/50 flex items-center justify-between">
                            <div>
                                <span className="block text-xs font-bold text-blue-600 dark:text-blue-400">عادي (جوي)</span>
                                <span className="text-[10px] text-gray-500">اقتصادي</span>
                            </div>
                            <span className="text-2xl font-black text-blue-700 dark:text-blue-300 font-mono">{shippingStats.normal}</span>
                        </div>
                    </div>
                </div>

                {/* 6. Shipments Summary (Simplified) */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-between">
                    <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-2 flex items-center gap-2">
                        <Container size={16} className="text-orange-500"/> حالة الشحنات
                    </h4>
                    <div className="flex justify-between items-center text-xs text-center px-2">
                        <div>
                            <span className="block font-black text-lg">{shipments.filter(s=>s.status === ShipmentStatus.NEW).length}</span>
                            <span className="text-gray-500">جديدة</span>
                        </div>
                        <div className="w-px h-8 bg-gray-200 dark:bg-gray-700"></div>
                        <div>
                            <span className="block font-black text-lg text-blue-600">{shipments.filter(s=>s.status === ShipmentStatus.SHIPPED).length}</span>
                            <span className="text-gray-500">بالطريق</span>
                        </div>
                        <div className="w-px h-8 bg-gray-200 dark:bg-gray-700"></div>
                        <div>
                            <span className="block font-black text-lg text-green-600">{shipments.filter(s=>s.status === ShipmentStatus.ARRIVED).length}</span>
                            <span className="text-gray-500">وصلت</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 7. Financials (ADMIN ONLY - Updated Logic with Modal) */}
            {showFinancials && (
                <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1"><AlertTriangle size={12}/> القسم المالي (للمدير فقط)</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                        {/* Profit */}
                        <StatCard 
                            title="الربح (عمولات)"
                            value={totalStats.profit}
                            monthlyValue={monthlyStats.profit}
                            icon={<TrendingUp size={24}/>}
                            colorClass="bg-green-600"
                            tooltip="مجموع العمولات للطلبات النشطة. اضغط للتفاصيل."
                            onClick={() => handleOpenAnalysis('profit', 'الربح (العمولات)', 'bg-green-600')}
                        />
                        {/* Cash Flow */}
                        <StatCard 
                            title="الدخل (إجمالي الطلبات)"
                            value={totalStats.cashFlow}
                            monthlyValue={monthlyStats.cashFlow}
                            icon={<Activity size={24}/>}
                            colorClass="bg-blue-600"
                            tooltip="قيمة الطلبات الكلية (المنتج + العمولة + الشحن). اضغط للتفاصيل."
                            onClick={() => handleOpenAnalysis('flow', 'الدخل (التدفق المالي)', 'bg-blue-600')}
                        />
                        {/* Total Debt */}
                        <StatCard 
                            title="الديون (مستحقات)"
                            value={totalStats.debt}
                            monthlyValue={monthlyStats.debt}
                            icon={<Wallet size={24}/>}
                            colorClass="bg-red-500"
                            tooltip="المبالغ المتبقية على العملاء. اضغط للتفاصيل."
                            onClick={() => handleOpenAnalysis('debt', 'الديون المستحقة', 'bg-red-500')}
                        />
                        {/* Delivery Fund */}
                        <StatCard 
                            title="رصيد التوصيل" 
                            value={totalStats.delivery}
                            monthlyValue={monthlyStats.delivery}
                            icon={<Bike size={24}/>}
                            colorClass="bg-orange-500"
                            tooltip="رسوم التوصيل المحلي. اضغط للتفاصيل."
                            onClick={() => handleOpenAnalysis('delivery', 'رصيد التوصيل', 'bg-orange-500')}
                            action={
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleResetDeliveryFund(); }}
                                    disabled={isResetting || totalStats.delivery === 0}
                                    className="text-[10px] bg-orange-100 hover:bg-orange-200 text-orange-700 px-2 py-1 rounded flex items-center gap-1 mt-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <RefreshCw size={10} className={isResetting ? 'animate-spin' : ''}/> تصفير
                                </button>
                            }
                        />
                        {/* Shipping Debt */}
                        <StatCard 
                            title="ديون الشحن"
                            value={totalStats.shippingDebt}
                            monthlyValue={monthlyStats.shippingDebt}
                            icon={<Truck size={24}/>}
                            colorClass="bg-purple-600"
                            tooltip="تكلفة الشحن للطلبات غير المدفوعة. اضغط للتفاصيل."
                            onClick={() => handleOpenAnalysis('shippingDebt', 'ديون الشحن', 'bg-purple-600')}
                        />
                    </div>
                    
                    <div className="mt-4 bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 h-64">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <TrendingUp size={16} className="text-primary"/> {t('weeklyPerformance')}
                            </h3>
                        </div>
                        <div className="h-48 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.2}/>
                                            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical={false} stroke="#E5E7EB" strokeOpacity={0.5} strokeDasharray="3 3"/>
                                    <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="left" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(val) => `${val/1000}k`}/>
                                    <YAxis yAxisId="right" orientation="right" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false}/>
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px', color: '#fff' }} cursor={{fill: 'transparent'}}/>
                                    <Area yAxisId="left" type="monotone" dataKey="income" name={t('income')} stroke="#8B5CF6" fillOpacity={1} fill="url(#colorIncome)" strokeWidth={3} />
                                    <Bar yAxisId="right" dataKey="orders" name={t('ordersCount')} barSize={20} fill="#3B82F6" radius={[4, 4, 0, 0]} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
