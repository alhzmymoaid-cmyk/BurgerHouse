import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';

export const dynamic = 'force-dynamic';

async function requireManager() {
  const auth = createSupabaseServerClient();
  const check = await requireAuthenticatedProfile(auth, ['branch_manager']);
  if (!check.ok) return { response: NextResponse.json({error:check.code},{status:check.status}) } as const;
  if (!check.profile.assigned_branch_id) return { response:NextResponse.json({error:'BRANCH_NOT_ASSIGNED'},{status:403}) } as const;
  return { profile:check.profile, service:createSupabaseServiceRoleClient() } as const;
}

export async function GET() {
  const access=await requireManager();
  if ('response' in access) return access.response;
  const branchId=access.profile.assigned_branch_id;
  const [products,categories,productControls,categoryControls]=await Promise.all([
    access.service.from('products').select('id,name_ar,is_active').eq('is_active',true).order('sort_order'),
    access.service.from('categories').select('id,name_ar,is_active').eq('is_active',true).order('sort_order'),
    access.service.from('branch_products').select('*').eq('branch_id',branchId),
    access.service.from('branch_categories').select('*').eq('branch_id',branchId)
  ]);
  const error=[products.error,categories.error,productControls.error,categoryControls.error].find(Boolean);
  if(error) return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({branch_id:branchId,products:products.data||[],categories:categories.data||[],product_controls:productControls.data||[],category_controls:categoryControls.data||[]},{headers:{'Cache-Control':'no-store'}});
}

export async function PATCH(request:NextRequest) {
  const access=await requireManager();
  if ('response' in access) return access.response;
  const body=await request.json().catch(()=>({}));
  const branchId=access.profile.assigned_branch_id;
  if(body.entity==='product' && body.product_id) {
    const {data:existing}=await access.service.from('branch_products').select('*').eq('branch_id',branchId).eq('product_id',body.product_id).maybeSingle();
    const manualDisabled=typeof body.manual_disabled==='boolean'?body.manual_disabled:!!existing?.manual_disabled;
    let soldOutUntil=existing?.sold_out_until || null;
    if(typeof body.sold_out_today==='boolean') {
      if(body.sold_out_today) {
        const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
        const get=(type:string)=>Number(parts.find(p=>p.type===type)?.value||0);
        soldOutUntil=new Date(Date.UTC(get('year'),get('month')-1,get('day'),21,0,0)).toISOString();
      } else soldOutUntil=null;
    }
    const payload={branch_id:branchId,product_id:body.product_id,manual_disabled:manualDisabled,sold_out_until:soldOutUntil,is_available:!manualDisabled && !(soldOutUntil && new Date(soldOutUntil).getTime()>Date.now()),updated_at:new Date().toISOString()};
    const {data,error}=await access.service.from('branch_products').upsert(payload,{onConflict:'branch_id,product_id'}).select('*').single();
    if(error) return NextResponse.json({error:error.message},{status:400});
    await access.service.from('audit_logs').insert({actor_id:access.profile.id,actor_name:access.profile.full_name,actor_role:access.profile.role,action:'BRANCH_PRODUCT_AVAILABILITY_UPDATED',target_type:'product',target_id:body.product_id,metadata:{branch_id:branchId,manual_disabled:manualDisabled,sold_out_until:soldOutUntil}});
    return NextResponse.json({control:data});
  }
  if(body.entity==='category' && body.category_id && typeof body.is_active==='boolean') {
    const {data,error}=await access.service.from('branch_categories').upsert({branch_id:branchId,category_id:body.category_id,is_active:body.is_active,updated_at:new Date().toISOString()},{onConflict:'branch_id,category_id'}).select('*').single();
    if(error) return NextResponse.json({error:error.message},{status:400});
    await access.service.from('audit_logs').insert({actor_id:access.profile.id,actor_name:access.profile.full_name,actor_role:access.profile.role,action:'BRANCH_CATEGORY_AVAILABILITY_UPDATED',target_type:'category',target_id:body.category_id,metadata:{branch_id:branchId,is_active:body.is_active}});
    return NextResponse.json({control:data});
  }
  return NextResponse.json({error:'INVALID_CONTROL_REQUEST'},{status:400});
}
