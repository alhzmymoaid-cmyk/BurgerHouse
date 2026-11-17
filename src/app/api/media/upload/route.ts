import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { handleMediaUploadRequest } from '@/lib/supabase/api-handlers.mjs';

export async function POST(request: NextRequest) {
  try {
    const authSupabase = createSupabaseServerClient();
    const serviceSupabase = createSupabaseServiceRoleClient();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const productId = formData.get('product_id') ? String(formData.get('product_id')) : null;

    if (!file) {
      return NextResponse.json({ error: 'NO_FILE_PROVIDED' }, { status: 400 });
    }

    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    const result = await handleMediaUploadRequest({
      authSupabase,
      serviceSupabase,
      fileName: file.name,
      mimeType: file.type,
      fileBuffer: buffer,
      productId
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    return NextResponse.json({ error: 'MEDIA_UPLOAD_ERROR', message: err?.message }, { status: 500 });
  }
}
