import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
export async function GET(){
 const supabase=createSupabaseServerClient();
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)return NextResponse.json({error:'AUTH_REQUIRED'}, {status:401});
 const {data:orders,error}=await supabase.from('orders').select('order_number,order_code,status,created_at,total_amount,vat_amount,subtotal,branch_snapshot,order_items(*),estimated_pickup_at,payment_method_id').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(50);
 if(error)return NextResponse.json({error:'ORDERS_LOAD_FAILED'}, {status:500});
 return NextResponse.json({orders:orders||[]},{headers:{'Cache-Control':'private, no-store'}});
}
