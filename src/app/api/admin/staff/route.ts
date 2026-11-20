import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';

export const runtime='nodejs';

const validRoles=['owner','branch_manager','cashier','kitchen_staff','super_admin'];

export async function POST(request:NextRequest){
  try{
    const auth=createSupabaseServerClient();
    const access=await requireAuthenticatedProfile(auth,['super_admin']);
    if(!access.ok)return NextResponse.json({error:access.code},{status:access.status});
    const body=await request.json().catch(()=>({}));
    const fullName=String(body.full_name||'').trim();
    const email=String(body.email||'').trim().toLowerCase();
    const password=String(body.temporary_password||'');
    const role=String(body.role||'');
    const branchId=body.assigned_branch_id?String(body.assigned_branch_id):null;
    if(fullName.length<2||fullName.length>100||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||password.length>72||!validRoles.includes(role)){
      return NextResponse.json({error:'INVALID_STAFF_FIELDS',message:'تحقق من الاسم والبريد وكلمة المرور والصلاحية.'},{status:400});
    }
    if(['branch_manager','cashier','kitchen_staff'].includes(role)&&!branchId)return NextResponse.json({error:'BRANCH_REQUIRED',message:'يجب تحديد فرع لمدير الفرع.'},{status:400});
    const service=createSupabaseServiceRoleClient();
    if(branchId){
      const {data:branch}=await service.from('branches').select('id').eq('id',branchId).maybeSingle();
      if(!branch)return NextResponse.json({error:'BRANCH_NOT_FOUND'},{status:400});
    }
    const {data:created,error:createError}=await service.auth.admin.createUser({
      email,password,email_confirm:true,
      user_metadata:{full_name:fullName},
      app_metadata:{role}
    });
    if(createError||!created.user)return NextResponse.json({error:'AUTH_USER_CREATE_FAILED',message:createError?.message||'تعذر إنشاء الحساب.'},{status:400});
    const {data:profile,error:profileError}=await service.from('user_profiles').upsert({
      id:created.user.id,email,full_name:fullName,role,assigned_branch_id:branchId,is_active:true,permissions:[],updated_at:new Date().toISOString()
    },{onConflict:'id'}).select('id,email,full_name,role,assigned_branch_id,is_active').single();
    if(profileError){
      await service.from('security_abuse_logs').insert({event_type:'STAFF_PROFILE_PROVISION_FAILED',severity:'high',details:{user_id:created.user.id,email,reason:profileError.message}});
      return NextResponse.json({error:'STAFF_PROFILE_CREATE_FAILED',message:'تم إنشاء حساب الدخول، لكن تعذر إنشاء ملف الموظف. يلزم استكماله من الدعم.'},{status:500});
    }
    await service.from('audit_logs').insert({
      actor_id:access.profile.id,actor_name:access.profile.full_name,actor_role:access.profile.role,
      action:'CREATE_STAFF_ACCOUNT',target_type:'user_profile',target_id:profile.id,
      metadata:{role,assigned_branch_id:branchId}
    });
    return NextResponse.json({ok:true,profile},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error:any){
    return NextResponse.json({error:'STAFF_CREATE_ERROR',message:error?.message||'تعذر إنشاء الموظف.'},{status:500});
  }
}
