import { StoreData } from '@/types/store';
import { getDashboardStats, getTopSellers } from '@/lib/store-data';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardProps {
  store: StoreData;
  onNavigate: (tab: 'inventory', lowStock?: boolean) => void;
}

export default function Dashboard({ store, onNavigate }: DashboardProps) {
  const stats = getDashboardStats(store);
  const topSellers = getTopSellers(store, 5);

  const cards = [
    { label: 'Revenue', value: `₦${stats.totalRevenue.toLocaleString()}`, color: 'text-primary' },
    { label: 'Profit', value: `₦${stats.totalProfit.toLocaleString()}`, color: 'text-success' },
    { label: 'Products', value: stats.totalProducts.toString(), color: 'text-foreground' },
    { label: 'Total Sales', value: stats.totalSales.toString(), color: 'text-foreground' },
    { label: 'Inventory Value', value: `₦${stats.inventoryValue.toLocaleString()}`, color: 'text-primary' },
  ];

  return (
    <div className="animate-fade-in space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map(c => (
          <div key={c.label} className="p-4 rounded-xl bg-card border border-border">
            <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
            <p className={`font-display font-bold text-xl ${c.color}`}>{c.value}</p>
          </div>
        ))}
        <button
          onClick={() => onNavigate('inventory', true)}
          className="p-4 rounded-xl bg-card border border-warning/30 hover:border-warning/60 transition-colors text-left"
        >
          <p className="text-xs text-muted-foreground mb-1">Low Stock ⚠</p>
          <p className="font-display font-bold text-xl text-warning">{stats.lowStockProducts.length}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Tap to view →</p>
        </button>
      </div>

      {topSellers.length > 0 && (
        <div className="p-4 rounded-xl bg-card border border-border">
          <h3 className="font-display font-bold mb-3">Top Sellers</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSellers} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" tick={{ fill: 'hsl(240 5% 50%)', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fill: 'hsl(45 5% 85%)', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ background: 'hsl(240 10% 10%)', border: '1px solid hsl(240 8% 18%)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'hsl(45 90% 61%)' }}
                  formatter={(value: number) => [`${value} units`, 'Sold']}
                />
                <Bar dataKey="totalSold" fill="hsl(45, 90%, 61%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
