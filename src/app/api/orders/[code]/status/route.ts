import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { handleTransitionOrderStatusRequest } from '@/lib/supabase/api-handlers.mjs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const authSupabase = createSupabaseServerClient();
    const serviceSupabase = createSupabaseServiceRoleClient();
    const body = await request.json().catch(() => ({}));

    const result = await handleTransitionOrderStatusRequest({
      authSupabase,
      serviceSupabase,
      orderCode: params.code,
      body
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'STATUS_UPDATE_FAILED', message: err?.message },
      { status: 500 }
    );
  }
}
