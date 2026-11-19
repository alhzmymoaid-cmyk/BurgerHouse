import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolveBranchesForCheckout } from '@/lib/domain/core-engine.mjs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const supabase = createSupabaseServerClient();
    const { data: branches, error } = await supabase
      .from('branches')
      .select('*')
      .eq('is_active', true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const userCoords =
      typeof body.latitude === 'number' && typeof body.longitude === 'number'
        ? { latitude: body.latitude, longitude: body.longitude }
        : null;

    const resolution = resolveBranchesForCheckout(branches || [], userCoords as { latitude: number; longitude: number } | null, new Date());
    return NextResponse.json(resolution, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'BRANCH_RESOLUTION_ERROR', message: err?.message || 'Unable to resolve branches' },
      { status: 400 }
    );
  }
}
