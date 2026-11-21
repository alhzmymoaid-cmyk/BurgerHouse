import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';
import { verifyImageMagicBytes } from '@/lib/domain/core-engine.mjs';

export const runtime='nodejs';

export async function POST(request:NextRequest) {
  const auth=createSupabaseServerClient();
  const check=await requireAuthenticatedProfile(auth,['super_admin','owner','branch_manager']);
  if(!check.ok) return NextResponse.json({error:check.code},{status:check.status});
  const form=await request.formData();
  const file=form.get('file');
  if(!(file instanceof File)) return NextResponse.json({error:'NO_FILE_PROVIDED'},{status:400});
  const allowedTypes=['image/jpeg','image/png','image/webp'];
  if(!allowedTypes.includes(file.type)) return NextResponse.json({error:'UNSUPPORTED_IMAGE_TYPE'},{status:415});
  if(file.size>5*1024*1024) return NextResponse.json({error:'IMAGE_TOO_LARGE_MAX_5MB'},{status:413});
  const extension=({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' } as Record<string,string>)[file.type];
  if(check.profile.role==='branch_manager' && !check.profile.assigned_branch_id) return NextResponse.json({error:'BRANCH_NOT_ASSIGNED'},{status:403});
  const branchSegment=check.profile.role==='branch_manager' ? check.profile.assigned_branch_id : 'global';
  const fileBuffer=Buffer.from(await file.arrayBuffer());
  const signature=verifyImageMagicBytes(fileBuffer,file.type);
  const service=createSupabaseServiceRoleClient();
  if(!signature.valid) {
    await service.from('security_abuse_logs').insert({
      event_type:'PROMO_IMAGE_SIGNATURE_REJECTED',
      severity:'high',
      details:{actor_id:check.profile.id,actor_email:check.profile.email,mime_type:file.type,file_name:file.name,reason:signature.reason}
    });
    return NextResponse.json({error:'INVALID_IMAGE_BINARY_SIGNATURE',message:signature.reason},{status:415});
  }
  const path=`promo-banners/${branchSegment}/${crypto.randomUUID()}.${extension}`;
  const {error}=await service.storage.from('menu-media').upload(path,fileBuffer,{contentType:file.type,upsert:false,cacheControl:'31536000'});
  if(error) return NextResponse.json({error:error.message},{status:400});
  const {data}=service.storage.from('menu-media').getPublicUrl(path);
  await service.from('audit_logs').insert({
    actor_id:check.profile.id,actor_name:check.profile.full_name,actor_role:check.profile.role,
    action:'UPLOAD_PROMO_IMAGE',target_type:'storage_object',target_id:path,
    metadata:{branch_id:branchSegment==='global'?null:branchSegment,size_bytes:fileBuffer.length,mime_type:file.type}
  });
  return NextResponse.json({image_url:data.publicUrl,storage_path:path},{status:201});
}
