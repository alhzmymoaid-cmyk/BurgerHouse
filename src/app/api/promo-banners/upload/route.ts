import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';

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
  const extension=({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif' } as Record<string,string>)[file.type];
  const branchSegment=check.profile.role==='branch_manager' ? check.profile.assigned_branch_id : 'global';
  const path=`promo-banners/${branchSegment}/${crypto.randomUUID()}.${extension}`;
  const service=createSupabaseServiceRoleClient();
  const {error}=await service.storage.from('menu-media').upload(path,Buffer.from(await file.arrayBuffer()),{contentType:file.type,upsert:false,cacheControl:'31536000'});
  if(error) return NextResponse.json({error:error.message},{status:400});
  const {data}=service.storage.from('menu-media').getPublicUrl(path);
  return NextResponse.json({image_url:data.publicUrl,storage_path:path},{status:201});
}
