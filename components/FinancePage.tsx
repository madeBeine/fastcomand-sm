
import React, { useState, useMemo } from 'react';
import type { Order, AppSettings } from '../types';
import { OrderStatus } from '../types';
import { 
    Calendar, TrendingUp, TrendingDown, DollarSign, 
    Filter, Download, Wallet, CreditCard, ShoppingCart, 
    Truck, AlertCircle, CheckCircle2, PieChart
} from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
    AreaChart, Area, CartesianGrid, Legend 
} from 'recharts';
import * as XLSX from 'xlsx';

interface FinancePageProps {
    orders: Order[];
    settings?: AppSettings;
}

const FinancePage: React.FC<FinancePageProps> = ({ orders }) => {
    // --- State ---
    const [dateFilter, setDateFilter] = useState<'month' | 'year' | 'custom'>('month');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

    // --- Filtering Logic ---
    const filteredOrders = useMemo(() => {
        return orders.filter(o => {
            if (o.status === OrderStatus.CANCELLED || o.status === OrderStatus.NEW) return false;
            
            const orderDate = new Date(o.orderDate);
            
            if (dateFilter === 'month') {
                const [y, m] = selectedMonth.split('-');
                return orderDate.getFullYear() === parseInt(y) && (orderDate.getMonth() + 1) === parseInt(m);
            }
            if (dateFilter === 'year') {
                return orderDate.getFullYear() === parseInt(selectedYear);
            }
            if (dateFilter === 'custom' && customStartDate && customEndDate) {
                const start = new Date(customStartDate);
                const end = new Date(customEndDate);
                end.setHours(23, 59, 59); // Include full end day
                return orderDate >= start && orderDate <= end;
            }
            return true;
        }).sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime());
    }, [orders, dateFilter, selectedMonth, selectedYear, customStartDate, customEndDate]);

    // --- Financial Calculations ---
    const stats = useMemo(() => {
        let totalRevenue = 0; // Total Value of Orders (Price + Commission + Shipping + Delivery)
        let totalProfit = 0;  // Commissions
        let totalShipping = 0; // Shipping Collected
        let totalDelivery = 0; // Local Delivery Collected
        let totalPaid = 0;    // Cash Collected
        let totalDebt = 0;    // Remaining Balance
        let productCost = 0;  // Original Product Price (in MRU)

        filteredOrders.forEach(o => {
            const price = Math.round(Number(o.priceInMRU || 0));
            const comm = Math.round(Number(o.commission || 0));
            const ship = Math.round(Number(o.shippingCost || 0));
            const del = Math.round(Number(o.localDeliveryCost || 0));
            const paid = Math.round(Number(o.amountPaid || 0));

            const orderTotal = price + comm + ship + del;
            
            totalRevenue += orderTotal;
            totalProfit += comm;
            totalShipping += ship;
            totalDelivery += del;
            totalPaid += paid;
            productCost += price;
            
            // Debt is strictly positive remaining balance
            if (orderTotal > paid) {
                totalDebt += (orderTotal - paid);
            }
        });

        return {
            totalRevenue,
            totalProfit,
            totalShipping,
            totalDelivery,
            totalPaid,
            totalDebt,
            productCost,
            netCashFlow: totalPaid, // Simply what entered the pocket
            count: filteredOrders.length
        };
    }, [filteredOrders]);

    // --- Chart Data Preparation ---
    const chartData = useMemo(() => {
        const grouped: Record<string, { date: string, profit: number, revenue: number }> = {};
        
        filteredOrders.forEach(o => {
            const dateKey = new Date(o.orderDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            if (!grouped[dateKey]) {
                grouped[dateKey] = { date: dateKey, profit: 0, revenue: 0 };
            }
            grouped[dateKey].profit += Math.round(Number(o.commission || 0));
            grouped[dateKey].revenue += Math.round(Number(o.priceInMRU || 0) + Number(o.commission || 0) + Number(o.shippingCost || 0));
        });

        return Object.values(grouped);
    }, [filteredOrders]);

    // --- Export to Excel ---
    const handleExport = () => {
        const data = filteredOrders.map(o => ({
            "رقم الطلب": o.localOrderId,
            "التاريخ": o.orderDate,
            "سعر المنتج": Math.round(Number(o.priceInMRU || 0)),
            "العمولة": Math.round(Number(o.commission || 0)),
            "الشحن": Math.round(Number(o.shippingCost || 0)),
            "التوصيل": Math.round(Number(o.localDeliveryCost || 0)),
            "الإجمالي": Math.round(Number(o.priceInMRU || 0) + Number(o.commission || 0) + Number(o.shippingCost || 0) + Number(o.localDeliveryCost || 0)),
            "المدفوع": Math.round(Number(o.amountPaid || 0)),
            "المتبقي": Math.max(0, Math.round(Number(o.priceInMRU || 0) + Number(o.commission || 0) + Number(o.shippingCost || 0) + Number(o.localDeliveryCost || 0) - Number(o.amountPaid || 0)))
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Financial Report");
        XLSX.writeFile(wb, `Financial_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header & Filters */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <PieChart className="text-primary"/> التقرير المالي
                    </h2>
                    <p className="text-sm text-gray-500">نظرة شاملة ودقيقة على الأداء المالي.</p>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                        <button onClick={() => setDateFilter('month')} className={`px-3 py-1.5 text-sm rounded-md font-bold transition-all ${dateFilter === 'month' ? 'bg-white dark:bg-gray-600 shadow-sm text-primary' : 'text-gray-500 dark:text-gray-300'}`}>شهري</button>
                        <button onClick={() => setDateFilter('year')} className={`px-3 py-1.5 text-sm rounded-md font-bold transition-all ${dateFilter === 'year' ? 'bg-white dark:bg-gray-600 shadow-sm text-primary' : 'text-gray-500 dark:text-gray-300'}`}>سنوي</button>
                        <button onClick={() => setDateFilter('custom')} className={`px-3 py-1.5 text-sm rounded-md font-bold transition-all ${dateFilter === 'custom' ? 'bg-white dark:bg-gray-600 shadow-sm text-primary' : 'text-gray-500 dark:text-gray-300'}`}>مخصص</button>
                    </div>

                    {dateFilter === 'month' && (
                        <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm"/>
                    )}
                    {dateFilter === 'year' && (
                        <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm w-32">
                            {Array.from({length: 5}, (_, i) => new Date().getFullYear() - i).map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    )}
                    {dateFilter === 'custom' && (
                        <div className="flex gap-2 items-center">
                            <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm"/>
                            <span className="text-gray-400">-</span>
                            <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm"/>
                        </div>
                    )}

                    <button onClick={handleExport} className="p-2 bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 rounded-lg transition-colors" title="تصدير Excel">
                        <Download size={20}/>
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Net Profit */}
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white shadow-lg shadow-indigo-500/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp size={100}/></div>
                    <p className="text-indigo-100 font-bold text-sm mb-1">صافي الربح (العمولات)</p>
                    <h3 className="text-3xl font-black font-mono tracking-tight">{stats.totalProfit.toLocaleString()} <span className="text-sm opacity-70">MRU</span></h3>
                </div>

                {/* Total Revenue */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">إجمالي الإيرادات</p>
                            <h3 className="text-2xl font-black text-gray-800 dark:text-white font-mono mt-1">{stats.totalRevenue.toLocaleString()}</h3>
                        </div>
                        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600"><DollarSign size={20}/></div>
                    </div>
                    <div className="mt-4 flex gap-2 text-xs">
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">المنتجات: {stats.productCost.toLocaleString()}</span>
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">الشحن: {(stats.totalShipping + stats.totalDelivery).toLocaleString()}</span>
                    </div>
                </div>

                {/* Cash Flow */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">السيولة المستلمة</p>
                            <h3 className="text-2xl font-black text-green-600 font-mono mt-1">{stats.totalPaid.toLocaleString()}</h3>
                        </div>
                        <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-600"><Wallet size={20}/></div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">المبالغ التي تم تحصيلها فعلياً</p>
                </div>

                {/* Debt */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm border-l-4 border-l-red-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">الديون المستحقة</p>
                            <h3 className="text-2xl font-black text-red-600 font-mono mt-1">{stats.totalDebt.toLocaleString()}</h3>
                        </div>
                        <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600"><AlertCircle size={20}/></div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">مبالغ لم يتم تحصيلها بعد</p>
                </div>
            </div>

            {/* Chart Area */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 h-80">
                <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <TrendingUp size={20} className="text-indigo-500"/> النمو المالي
                </h3>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#82ca9d" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                        <YAxis tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                        <Tooltip contentStyle={{backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff'}} />
                        <Legend />
                        <Area type="monotone" dataKey="revenue" name="الإيرادات" stroke="#8884d8" fillOpacity={1} fill="url(#colorRevenue)" />
                        <Area type="monotone" dataKey="profit" name="الربح" stroke="#82ca9d" fillOpacity={1} fill="url(#colorProfit)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Detailed Ledger Table */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <CreditCard size={18}/> سجل العمليات التفصيلي
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                        <thead className="bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 font-bold border-b dark:border-gray-700">
                            <tr>
                                <th className="p-3">التاريخ</th>
                                <th className="p-3">رقم الطلب</th>
                                <th className="p-3">قيمة المنتج</th>
                                <th className="p-3">الشحن + التوصيل</th>
                                <th className="p-3 text-green-600">العمولة</th>
                                <th className="p-3">الإجمالي</th>
                                <th className="p-3">المدفوع</th>
                                <th className="p-3 text-red-500">المتبقي</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {filteredOrders.length > 0 ? filteredOrders.map(order => {
                                const price = Math.round(Number(order.priceInMRU || 0));
                                const comm = Math.round(Number(order.commission || 0));
                                const ship = Math.round(Number(order.shippingCost || 0));
                                const del = Math.round(Number(order.localDeliveryCost || 0));
                                const total = price + comm + ship + del;
                                const paid = Math.round(Number(order.amountPaid || 0));
                                const rem = total - paid;

                                return (
                                    <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                        <td className="p-3 font-mono text-gray-500">{new Date(order.orderDate).toLocaleDateString()}</td>
                                        <td className="p-3 font-bold font-mono">{order.localOrderId}</td>
                                        <td className="p-3 font-mono">{price.toLocaleString()}</td>
                                        <td className="p-3 font-mono">{(ship + del).toLocaleString()}</td>
                                        <td className="p-3 font-mono font-bold text-green-600">{comm.toLocaleString()}</td>
                                        <td className="p-3 font-mono font-bold">{total.toLocaleString()}</td>
                                        <td className="p-3 font-mono text-blue-600">{paid.toLocaleString()}</td>
                                        <td className={`p-3 font-mono font-bold ${rem > 0 ? 'text-red-500' : 'text-gray-400'}`}>{rem.toLocaleString()}</td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-gray-400">لا توجد بيانات للفترة المحددة</td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot className="bg-gray-50 dark:bg-gray-900/50 font-bold border-t-2 border-gray-200 dark:border-gray-600">
                            <tr>
                                <td colSpan={2} className="p-3 text-center">المجموع الكلي</td>
                                <td className="p-3 font-mono">{stats.productCost.toLocaleString()}</td>
                                <td className="p-3 font-mono">{(stats.totalShipping + stats.totalDelivery).toLocaleString()}</td>
                                <td className="p-3 font-mono text-green-600">{stats.totalProfit.toLocaleString()}</td>
                                <td className="p-3 font-mono">{stats.totalRevenue.toLocaleString()}</td>
                                <td className="p-3 font-mono text-blue-600">{stats.totalPaid.toLocaleString()}</td>
                                <td className="p-3 font-mono text-red-600">{stats.totalDebt.toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default FinancePage;
