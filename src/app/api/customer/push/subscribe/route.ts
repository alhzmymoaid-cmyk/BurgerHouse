import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseCustomerServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const isTrustedPushEndpoint=(value:string)=>{
  try{
    const url=new URL(value);
    const hostAllowed=/(^|\\.)fcm\\.googleapis\\.com$|(^|\\.)push\\.services\\.mozilla\\.com$|(^|\\.)push\\.apple\\.com$|(^|\\.)notify\\.windows\\.com$/i.test(url.hostname);
    return url.protocol==='https:'&&hostAllowed;
  }catch{return false;}
};

export async function POST(request:NextRequest){
  try{
    const customer=createSupabaseCustomerServerClient();
    const {data:{user},error:authError}=await customer.auth.getUser();
    if(authError||!user||user.app_metadata?.customer_account!==true){
      return NextResponse.json({error:'CUSTOMER_AUTH_REQUIRED',message_ar:'سجّل الدخول إلى حسابك أولاً.'},{status:401});
    }
    const body=await request.json().catch(()=>({}));
    const subscription=body?.subscription;
    const endpoint=String(subscription?.endpoint||'');
    const p256dh=String(subscription?.keys?.p256dh||'');
    const authKey=String(subscription?.keys?.auth||'');
    if(!isTrustedPushEndpoint(endpoint)||!p256dh||!authKey){
      return NextResponse.json({error:'INVALID_PUSH_SUBSCRIPTION',message_ar:'تعذر التحقق من بيانات الإشعار.'},{status:400});
    }
    const service=createSupabaseServiceRoleClient();
    const {error}=await service.from('customer_push_subscriptions').upsert({
      customer_id:user.id,endpoint,p256dh,auth:authKey,updated_at:new Date().toISOString()
    },{onConflict:'endpoint'});
    if(error)throw error;
    return NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error:any){
    return NextResponse.json({error:'CUSTOMER_PUSH_SUBSCRIBE_FAILED',message_ar:error?.message||'تعذر تفعيل الإشعارات.'},{status:500});
  }
}

export async function DELETE(request:NextRequest){
  try{
    const customer=createSupabaseCustomerServerClient();
    const {data:{user},error:authError}=await customer.auth.getUser();
    if(authError||!user||user.app_metadata?.customer_account!==true)return NextResponse.json({error:'CUSTOMER_AUTH_REQUIRED'},{status:401});
    const body=await request.json().catch(()=>({}));
    const endpoint=String(body?.endpoint||'');
    if(!isTrustedPushEndpoint(endpoint))return NextResponse.json({error:'INVALID_PUSH_ENDPOINT'},{status:400});
    const service=createSupabaseServiceRoleClient();
    const {error}=await service.from('customer_push_subscriptions').delete().eq('endpoint',endpoint).eq('customer_id',user.id);
    if(error)throw error;
    return NextResponse.json({ok:true});
  }catch(error:any){
    return NextResponse.json({error:'CUSTOMER_PUSH_UNSUBSCRIBE_FAILED',message_ar:error?.message||'تعذر إيقاف الإشعارات.'},{status:500});
  }
}
