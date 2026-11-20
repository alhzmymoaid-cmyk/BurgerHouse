import { NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard';

export const runtime = 'nodejs';

const riyadhDateKey = (date: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(date);

export async function GET() {
  try {
    const authSupabase = createSupabaseServerClient();
    const authCheck = await requireAuthenticatedProfile(authSupabase, ['super_admin', 'owner', 'branch_manager']);
    if (!authCheck.ok) return NextResponse.json({ error: authCheck.code }, { status: authCheck.status });

    const profile = authCheck.profile;
    if (profile.role === 'branch_manager' && !profile.assigned_branch_id) {
      return NextResponse.json({ error: 'BRANCH_ASSIGNMENT_REQUIRED' }, { status: 403 });
    }

    const service = createSupabaseServiceRoleClient();
    const todayKey = riyadhDateKey(new Date());
    const monthKey = todayKey.slice(0, 7);
    const todayStart = new Date(todayKey + 'T00:00:00+03:00').toISOString();
    const monthStart = new Date(monthKey + '-01T00:00:00+03:00').toISOString();
    const scoped = (query: any) => profile.role === 'branch_manager'
      ? query.eq('branch_id', profile.assigned_branch_id)
      : query;

    let totalQuery = service.from('orders').select('id', { count: 'exact', head: true });
    let completedQuery = service.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'completed');
    let rejectedQuery = service.from('orders').select('id', { count: 'exact', head: true }).in('status', ['rejected', 'cancelled']);
    totalQuery = scoped(totalQuery);
    completedQuery = scoped(completedQuery);
    rejectedQuery = scoped(rejectedQuery);

    const ordersQuery = scoped(service.from('orders')
      .select('id,branch_id,customer_id,status,total_amount,created_at,order_items(product_name_ar,quantity,line_total)')
      .gte('created_at', monthStart)
      .order('created_at', { ascending: false })
      .limit(10000));

    const [totalRes, completedRes, rejectedRes, monthOrdersRes, branchesRes, customersRes] = await Promise.all([
      totalQuery, completedQuery, rejectedQuery, ordersQuery,
      service.from('branches').select('id,name_ar').eq('is_active', true).order('created_at', { ascending: true }),
      profile.role === 'branch_manager'
        ? scoped(service.from('orders').select('customer_id').not('customer_id', 'is', null).limit(20000))
        : service.from('customer_profiles').select('id', { count: 'exact', head: true })
    ]);

    if (totalRes.error || completedRes.error || rejectedRes.error || monthOrdersRes.error) {
      throw new Error('ANALYTICS_QUERY_FAILED');
    }

    const monthOrders = monthOrdersRes.data || [];
    const completedMonth = monthOrders.filter((order: any) => order.status === 'completed');
    const sum = (items: any[]) => items.reduce((total, order) => total + Number(order.total_amount || 0), 0);
    const monthRevenue = sum(completedMonth);
    const todayOrders = completedMonth.filter((order: any) => riyadhDateKey(new Date(order.created_at)) === todayKey);
    const todayRevenue = sum(todayOrders);

    const dailyMap = new Map<string, { date: string; orders: number; revenue: number }>();
    const branchMap = new Map<string, { branch_id: string; branch_name: string; orders: number; revenue: number }>();
    const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();

    for (const order of completedMonth) {
      const day = riyadhDateKey(new Date(order.created_at));
      const daily = dailyMap.get(day) || { date: day, orders: 0, revenue: 0 };
      daily.orders += 1;
      daily.revenue += Number(order.total_amount || 0);
      dailyMap.set(day, daily);

      const branchId = String(order.branch_id || '');
      const branchName = (branchesRes.data || []).find((branch: any) => branch.id === branchId)?.name_ar || branchId;
      const branch = branchMap.get(branchId) || { branch_id: branchId, branch_name: branchName, orders: 0, revenue: 0 };
      branch.orders += 1;
      branch.revenue += Number(order.total_amount || 0);
      branchMap.set(branchId, branch);

      for (const item of order.order_items || []) {
        const name = String(item.product_name_ar || 'صنف');
        const product = productMap.get(name) || { name, quantity: 0, revenue: 0 };
        product.quantity += Number(item.quantity || 0);
        product.revenue += Number(item.line_total || 0);
        productMap.set(name, product);
      }
    }

    const customerCount = profile.role === 'branch_manager'
      ? new Set((customersRes.data || []).map((row: any) => row.customer_id).filter(Boolean)).size
      : (customersRes.count || 0);

    const branchComparison = profile.role === 'branch_manager'
      ? Array.from(branchMap.values())
      : Array.from(branchMap.values()).sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      scope: { role: profile.role, branch_id: profile.assigned_branch_id || null },
      metrics: {
        customers: customerCount,
        total_orders: totalRes.count || 0,
        completed_orders: completedRes.count || 0,
        rejected_orders: rejectedRes.count || 0,
        average_order_value: completedMonth.length ? monthRevenue / completedMonth.length : 0,
        today_sales: todayRevenue,
        month_sales: monthRevenue,
      },
      daily_sales: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      top_products: Array.from(productMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
      branch_comparison: branchComparison,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'ANALYTICS_ERROR' }, { status: 500 });
  }
}
